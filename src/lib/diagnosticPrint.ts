/** Offline diagnostic specimens. Never imported by the app or optimizer. */
import * as THREE from 'three';
import type {
    AppearanceAnchorLayer,
    AppearanceRankModelV1,
    FinalPrintableStackSnapshot,
} from '../types/appearance';
import { resolveAppearanceRankModel, type AppearanceFitContext } from './appearanceModel';
import { fingerprintAppearanceFilaments } from './appearanceProfile';
import {
    createPriorEffectiveOpticsModel,
    minimumOpaqueFoundationThickness,
    predictEffectiveAutoPaintColor,
} from './effectiveOptics';
import { labToRgb, rgbToLab } from './colorDifference';
import { exportObjectTo3MFBlob } from './export3mf';

export interface DiagnosticStripDesign {
    id: string;
    title: string;
    purpose: string;
    /** Number of physical layers, INCLUDING the first layer in the first run. */
    backing: { color: string; layers: number | 'opaque' }[];
    foreground: string;
    topLayers: number[];
    reference?: {
        matrixId: string;
        sampleIndex: number;
        measuredRgb: readonly [number, number, number];
        originalFirstLayerHeight: number;
    };
}

const round = (value: number) => Math.round(value * 1e8) / 1e8;
const hex = (rgb: readonly number[]) =>
    '#' +
    rgb
        .map((v) =>
            Math.round(Math.max(0, Math.min(255, v)))
                .toString(16)
                .padStart(2, '0')
        )
        .join('');

export function planDiagnosticStrip(
    design: DiagnosticStripDesign,
    context: AppearanceFitContext,
    model: AppearanceRankModelV1
) {
    const filaments = context.filaments;
    if (
        !filaments?.length ||
        fingerprintAppearanceFilaments(filaments) !== context.filamentProfileFingerprint
    )
        throw new Error(
            'Diagnostic planning requires the frozen filaments and matching fingerprint'
        );
    if (![context.layerHeight, context.firstLayerHeight].every((v) => Number.isFinite(v) && v > 0))
        throw new Error('Invalid physical layer heights');
    if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/.test(design.id) || !design.title || !design.purpose)
        throw new Error('Invalid strip identity');
    if (
        !design.backing.length ||
        design.topLayers.length < 2 ||
        design.topLayers.length > 12 ||
        design.topLayers.some((n) => !Number.isInteger(n) || n < 0 || n > 100)
    )
        throw new Error('Use 2–12 patches with nonnegative integer top-layer counts (at most 100)');
    const find = (color: string) => {
        const matches = filaments.filter((f) => f.color.toLowerCase() === color.toLowerCase());
        if (matches.length !== 1) throw new Error(`Filament ${color} is missing or ambiguous`);
        return matches[0];
    };
    const optics = model.effectiveOptics ?? createPriorEffectiveOpticsModel(filaments);
    const foreground = find(design.foreground);
    const layers: {
        filamentId: string;
        filamentColor: string;
        startHeight: number;
        endHeight: number;
    }[] = [];
    const append = (filament: typeof foreground, count: number) => {
        for (let i = 0; i < count; i++) {
            const startHeight = layers.at(-1)?.endHeight ?? 0;
            const thickness = layers.length === 0 ? context.firstLayerHeight : context.layerHeight;
            layers.push({
                filamentId: filament.id,
                filamentColor: filament.color,
                startHeight,
                endHeight: round(startHeight + thickness),
            });
        }
    };
    design.backing.forEach((run, index) => {
        const filament = find(run.color);
        if (run.layers === 'opaque' && index !== 0)
            throw new Error('Only the first foundation run may use opaque sizing');
        const count =
            run.layers === 'opaque'
                ? 1 +
                  Math.max(
                      0,
                      Math.ceil(
                          (minimumOpaqueFoundationThickness(optics, filament.id) -
                              context.firstLayerHeight -
                              1e-8) /
                              context.layerHeight
                      )
                  )
                : run.layers;
        if (!Number.isInteger(count) || count < 1 || count > 200)
            throw new Error('Invalid backing layer count');
        append(filament, count);
    });
    if (layers.at(-1)!.filamentId === foreground.id)
        throw new Error('Foreground must differ from the final backing filament');
    const backingLayerCount = layers.length;
    append(foreground, Math.max(...design.topLayers));
    if (layers.length > 500) throw new Error('Diagnostic stack exceeds 500 layers');
    const recipe = (layerCount: number): AppearanceAnchorLayer[] => {
        const runs: AppearanceAnchorLayer[] = [];
        for (const layer of layers.slice(0, layerCount)) {
            const thickness = round(layer.endHeight - layer.startHeight);
            const previous = runs.at(-1);
            if (previous?.filamentId === layer.filamentId)
                previous.thickness = round(previous.thickness + thickness);
            else
                runs.push({
                    filamentId: layer.filamentId,
                    filamentColor: layer.filamentColor,
                    thickness,
                });
        }
        return runs;
    };
    const fullBacking = recipe(backingLayerCount);
    // Keep the readable run recipe separate from the physical layer sequence.
    // Matrix lookups match fixed-depth, layer-height-sized suffixes, just as
    // Auto-paint does; a single 0.40 mm run is not five 0.08 mm lookup tokens.
    const appearanceLayers: AppearanceAnchorLayer[] = layers.map((layer) => ({
        filamentId: layer.filamentId,
        filamentColor: layer.filamentColor,
        thickness: round(layer.endHeight - layer.startHeight),
    }));
    const opaqueFloor = minimumOpaqueFoundationThickness(optics, fullBacking[0].filamentId);
    const warnings: string[] = [];
    if (fullBacking[0].thickness + 1e-8 < opaqueFloor)
        warnings.push(
            'This exact recipe has a thinner foundation than the model’s 95% opacity assumption. The prediction does not simulate the build plate.'
        );
    if (
        design.reference &&
        Math.abs(design.reference.originalFirstLayerHeight - context.firstLayerHeight) > 1e-8
    )
        warnings.push(
            'Known Matrix recipe has the same filament thicknesses, but a different first-layer schedule. This tests transfer/repeatability, not an identical-process reprint or an independent prediction.'
        );
    const patches = design.topLayers.map((count, index) => {
        const layerCount = backingLayerCount + count;
        const runs = recipe(layerCount);
        const baseRgb = predictEffectiveAutoPaintColor(optics, runs);
        if (!baseRgb || !baseRgb.every(Number.isFinite))
            throw new Error('Cannot predict complete diagnostic recipe');
        const prediction = resolveAppearanceRankModel(
            rgbToLab(baseRgb),
            model,
            appearanceLayers.slice(0, layerCount),
            { includeContributions: true }
        );
        const rgb = labToRgb(prediction.lab);
        if (!rgb.every(Number.isFinite)) throw new Error('Nonfinite appearance prediction');
        const previous = design.topLayers.indexOf(count);
        return {
            id: `${design.id}-${String(index + 1).padStart(2, '0')}`,
            number: index + 1,
            topLayers: count,
            topThickness: round(count * context.layerHeight),
            layerCount,
            totalHeight: layers[layerCount - 1].endHeight,
            recipe: runs,
            ...(previous < index
                ? { repeatOf: `${design.id}-${String(previous + 1).padStart(2, '0')}` }
                : {}),
            bounds: { x0: 2 + index * 9, x1: 10 + index * 9, y0: 2, y1: 10 },
            physicalRgb: baseRgb,
            predictedRgb: rgb,
            predictedHex: hex(rgb),
            prediction,
        };
    });
    return {
        schemaVersion: 1 as const,
        design,
        modelFingerprint: model.fingerprint,
        context: { ...context, filaments: undefined },
        dimensions: {
            width: 4 + patches.length * 8 + (patches.length - 1),
            depth: 12,
            height: layers.at(-1)!.endHeight,
        },
        orientation:
            'Top-left notch; numbered pads run left to right. Numbers are on the map, not embossed on the print.' as const,
        patchSize: 8,
        gap: 1,
        backingLayerCount,
        backing: fullBacking,
        foundationOpacityFloorMm: opaqueFloor,
        warnings,
        layers,
        patches,
    };
}

export type DiagnosticStrip = ReturnType<typeof planDiagnosticStrip>;

/** Prove an explicitly designated pad is the same physical prefix as a recorded image target. */
export function verifyDiagnosticTraceMatch(
    strip: DiagnosticStrip,
    patchNumber: number,
    targetColor: string,
    snapshot: FinalPrintableStackSnapshot
) {
    const patch = strip.patches.find((p) => p.number === patchNumber);
    const matches = snapshot.targetMappings.filter(
        (t) => t.targetColor.hex.toLowerCase() === targetColor.toLowerCase()
    );
    if (!patch || matches.length !== 1)
        throw new Error('Missing or ambiguous diagnostic trace target/pad');
    const target = matches[0];
    const prefix = snapshot.layers.filter((l) => l.endHeight <= target.projectedHeight + 1e-8);
    if (
        prefix.length !== patch.layerCount ||
        Math.abs(target.projectedHeight - patch.totalHeight) > 1e-8 ||
        prefix.some(
            (l, i) =>
                l.filamentId !== strip.layers[i].filamentId ||
                l.filamentColor.toLowerCase() !== strip.layers[i].filamentColor.toLowerCase() ||
                Math.abs(l.startHeight - strip.layers[i].startHeight) > 1e-8 ||
                Math.abs(l.endHeight - strip.layers[i].endHeight) > 1e-8
        )
    )
        throw new Error(
            `Pad ${patch.id} does not reproduce the recorded ${targetColor} target stack`
        );
    return {
        patchId: patch.id,
        targetColor,
        recordedStackFingerprint: snapshot.fingerprint,
        physicalRecipeIdentical: true,
        recordedPredictedHex: target.predictedColor.hex,
        freshPredictedHex: patch.predictedHex,
        roundedPredictionUnchanged: target.predictedColor.hex.toLowerCase() === patch.predictedHex,
    };
}

/** Closed prisms per physical layer. Separate pads never touch within a layer. */
export function buildDiagnosticStripGeometry(strip: DiagnosticStrip): THREE.Group {
    const group = new THREE.Group();
    const { width, depth } = strip.dimensions;
    for (const [index, layer] of strip.layers.entries()) {
        const positions: number[] = [],
            indices: number[] = [];
        const prism = (contour: [number, number][]) => {
            const offset = positions.length / 3,
                n = contour.length;
            const triangles = THREE.ShapeUtils.triangulateShape(
                contour.map(([x, y]) => new THREE.Vector2(x, y)),
                []
            );
            for (const z of [layer.startHeight, layer.endHeight])
                for (const [x, y] of contour) positions.push(x - width / 2, y - depth / 2, z);
            for (const [a, b, c] of triangles)
                indices.push(
                    offset + a,
                    offset + c,
                    offset + b,
                    offset + n + a,
                    offset + n + b,
                    offset + n + c
                );
            for (let a = 0; a < n; a++) {
                const b = (a + 1) % n;
                indices.push(
                    offset + a,
                    offset + b,
                    offset + n + b,
                    offset + a,
                    offset + n + b,
                    offset + n + a
                );
            }
        };
        if (index === 0)
            prism([
                [0, 0],
                [width, 0],
                [width, depth],
                [2, depth],
                [2, depth - 2],
                [0, depth - 2],
            ]);
        else
            for (const patch of strip.patches.filter((p) => p.layerCount > index)) {
                const { x0, x1, y0, y1 } = patch.bounds;
                prism([
                    [x0, y0],
                    [x1, y0],
                    [x1, y1],
                    [x0, y1],
                ]);
            }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setIndex(indices);
        geometry.userData.kromacutExportGeometry = { positions, indices };
        const mesh = new THREE.Mesh(
            geometry,
            new THREE.MeshBasicMaterial({ color: layer.filamentColor })
        );
        mesh.name = `${strip.design.id} layer ${index + 1}`;
        mesh.userData.kromacutFilamentHex = layer.filamentColor;
        mesh.userData.kromacutMaterialKey = `filament:${layer.filamentId}`;
        mesh.userData.kromacutPartName = mesh.name;
        group.add(mesh);
    }
    return group;
}

export async function exportDiagnosticStrip(strip: DiagnosticStrip): Promise<Blob> {
    const object = buildDiagnosticStripGeometry(strip);
    try {
        return await exportObjectTo3MFBlob(object, {
            layerHeight: strip.context.layerHeight,
            firstLayerHeight: strip.context.firstLayerHeight,
            layerFilamentColors: strip.layers.map((l) => l.filamentColor),
            metadataFiles: [
                {
                    name: 'diagnostic-strip.json',
                    contentType: 'application/json',
                    content: JSON.stringify(strip),
                },
            ],
        });
    } finally {
        for (const child of object.children) {
            const mesh = child as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
            mesh.geometry.dispose();
            mesh.material.dispose();
        }
    }
}
