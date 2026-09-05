import assert from 'node:assert/strict';
import JSZip from 'jszip';
import type { DiagnosticStrip } from '../../src/lib/diagnosticPrint.ts';

/** Inspect serialized geometry, not just the input meshes/metadata. */
export async function verifyDiagnostic3mf(bytes: Uint8Array, strip: DiagnosticStrip) {
    const zip = await JSZip.loadAsync(bytes);
    const xml = await zip.file('3D/3dmodel.model')!.async('string');
    const settings = JSON.parse(
        await zip.file('Metadata/project_settings.config')!.async('string')
    );
    const embedded = JSON.parse(await zip.file('Metadata/diagnostic-strip.json')!.async('string'));
    assert.deepEqual(embedded, JSON.parse(JSON.stringify(strip)));
    assert.equal(Number(settings.layer_height), strip.context.layerHeight);
    assert.equal(Number(settings.initial_layer_print_height), strip.context.firstLayerHeight);
    assert.match(xml, /unit="millimeter"/);
    const objects = [...xml.matchAll(/<object\b([^>]*)>([\s\S]*?)<\/object>/g)].filter((m) =>
        m[2].includes('<mesh>')
    );
    assert.equal(objects.length, strip.layers.length);
    const attrs = (text: string) =>
        Object.fromEntries([...text.matchAll(/([\w:]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
    const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-5, `${a} != ${b}`);
    const volumeByLayer: number[] = [];
    const partConfig = await zip.file('Metadata/model_settings.config')!.async('string');
    const parts = new Map(
        [...partConfig.matchAll(/<part id="(\d+)"[^>]*>([\s\S]*?)<\/part>/g)].map((m) => [
            m[1],
            Number(/key="extruder" value="(\d+)"/.exec(m[2])![1]),
        ])
    );
    const totalMeasuredLayers = strip.patches.map(() => 0);
    for (const [i, obj] of objects.entries()) {
        const oa = attrs(obj[1]);
        const layer = strip.layers[i];
        assert.equal(
            settings.filament_colour[Number(oa.pindex)].toLowerCase(),
            layer.filamentColor.toLowerCase()
        );
        assert.equal(parts.get(oa.id), Number(oa.pindex) + 1);
        const vertices = [...obj[2].matchAll(/<vertex\b([^>]*)\/>/g)].map((m) => {
            const a = attrs(m[1]);
            return [Number(a.x), Number(a.y), Number(a.z)];
        });
        assert.ok(vertices.length > 0 && vertices.every((v) => v.every(Number.isFinite)));
        near(Math.min(...vertices.map((v) => v[2])), layer.startHeight);
        near(Math.max(...vertices.map((v) => v[2])), layer.endHeight);
        const edges = new Map<string, { count: number; orientation: number }>();
        const triangles = new Set<string>();
        let volume = 0;
        const covers = strip.patches.map(() => false);
        for (const m of obj[2].matchAll(/<triangle\b([^>]*)\/>/g)) {
            const a = attrs(m[1]),
                indices = [Number(a.v1), Number(a.v2), Number(a.v3)];
            assert.ok(indices.every((n) => Number.isInteger(n) && n >= 0 && n < vertices.length));
            const key = [...indices].sort((a, b) => a - b).join(',');
            assert.ok(!triangles.has(key), 'Duplicate face');
            triangles.add(key);
            const [v, w, u] = indices.map((n) => vertices[n]);
            const cross = [
                (w[1] - v[1]) * (u[2] - v[2]) - (w[2] - v[2]) * (u[1] - v[1]),
                (w[2] - v[2]) * (u[0] - v[0]) - (w[0] - v[0]) * (u[2] - v[2]),
                (w[0] - v[0]) * (u[1] - v[1]) - (w[1] - v[1]) * (u[0] - v[0]),
            ];
            assert.ok(
                cross.some((n) => Math.abs(n) > 1e-10),
                'Degenerate face'
            );
            volume +=
                (v[0] * (w[1] * u[2] - w[2] * u[1]) +
                    v[1] * (w[2] * u[0] - w[0] * u[2]) +
                    v[2] * (w[0] * u[1] - w[1] * u[0])) /
                6;
            for (let e = 0; e < 3; e++) {
                const l = indices[e],
                    r = indices[(e + 1) % 3],
                    k = l < r ? `${l},${r}` : `${r},${l}`;
                const value = edges.get(k) ?? { count: 0, orientation: 0 };
                value.count++;
                value.orientation += l < r ? 1 : -1;
                edges.set(k, value);
            }
            if (cross[2] > 0 && [v, w, u].every((p) => Math.abs(p[2] - layer.endHeight) < 1e-5)) {
                strip.patches.forEach((p, pi) => {
                    const x = (p.bounds.x0 + p.bounds.x1 - strip.dimensions.width) / 2;
                    const y = (p.bounds.y0 + p.bounds.y1 - strip.dimensions.depth) / 2;
                    const points = [v, w, u];
                    if (
                        points.every((a, j) => {
                            const b = points[(j + 1) % 3];
                            return (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]) >= -1e-8;
                        })
                    )
                        covers[pi] = true;
                });
            }
        }
        assert.ok(
            [...edges.values()].every((e) => e.count === 2 && e.orientation === 0),
            'Open/nonmanifold or inconsistently wound mesh'
        );
        assert.ok(volume > 0, 'Inverted mesh');
        const active = strip.patches.filter((p) => p.layerCount > i).length;
        const area = i === 0 ? strip.dimensions.width * strip.dimensions.depth - 4 : active * 64;
        near(volume, area * (layer.endHeight - layer.startHeight));
        covers.forEach((cover, pi) => {
            assert.equal(
                cover,
                strip.patches[pi].layerCount > i,
                `Layer ${i + 1} / patch ${pi + 1}`
            );
            if (cover) totalMeasuredLayers[pi]++;
        });
        volumeByLayer.push(volume);
    }
    assert.deepEqual(
        totalMeasuredLayers,
        strip.patches.map((p) => p.layerCount)
    );
    return {
        physicalLayers: objects.length,
        patchLayerCounts: totalMeasuredLayers,
        volumeMm3: volumeByLayer.reduce((a, b) => a + b, 0),
        closedManifold: true,
        physicalMaterialsVerified: true,
        patchStacksVerified: true,
    };
}
