import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
    MAX_COLOR_SLICE_HEIGHT,
    reconcileColorSliceHeight,
    snapColorSliceHeight,
} from '../src/lib/colorSliceHeight.ts';
import { reconcileColorOrder } from '../src/lib/colorOrder.ts';
import { withViteTestServer } from './helpers/viteModule.ts';

const cases = [
    { layer: 0.08, first: 0.2, height: 0.28, swapLayer: 3 },
    { layer: 0.08, first: 0.2, height: 0.52, swapLayer: 6 },
    { layer: 0.2, first: 0.3, height: 0.7, swapLayer: 4 },
    { layer: 0.1, first: 0.25, height: 0.35, swapLayer: 3 },
    { layer: 0.08, first: 0.24, height: 0.4, swapLayer: 4 },
    { layer: 0.2, first: 0.2, height: 0.6, swapLayer: 4 },
];

test('repeated swatch reconciliation preserves the first-layer offset and display order', () => {
    const dark = { hex: '#000000', a: 255 },
        light = { hex: '#ffffff', a: 255 };
    for (const { layer, first, height } of cases) {
        let previous = [dark, light],
            heights = [layer, height],
            order = [1, 0];
        for (let iteration = 0; iteration < 20; iteration++) {
            // Swap storage order; the first displayed color must still be white.
            const filtered = [...previous].reverse().map((s) => ({ ...s }));
            const nextOrder = reconcileColorOrder(filtered, previous, order);
            const nextHeights = filtered.map((swatch, index) =>
                reconcileColorSliceHeight(
                    heights[previous.findIndex((s) => s.hex === swatch.hex)],
                    layer,
                    first,
                    index === nextOrder[0]
                )
            );
            assert.equal(filtered[nextOrder[0]].hex, light.hex);
            assert.equal(
                nextHeights[nextOrder[0]],
                height,
                `iteration ${iteration}: ${layer}/${first}`
            );
            assert.equal(nextHeights[nextOrder[1]], layer);
            previous = filtered;
            heights = nextHeights;
            order = nextOrder;
        }
    }
});

test('other colors retain ordinary layer rounding and missing colors keep their minimum', () => {
    for (const layer of [0.08, 0.1, 0.2, 0.3]) {
        for (const height of [0, 0.01, 0.12, 0.28, 0.35, 0.52, 0.7, 9.9, 12]) {
            const old = Number(
                Math.max(
                    layer,
                    Math.min(10, Math.round(Math.max(layer, Math.min(10, height)) / layer) * layer)
                ).toFixed(8)
            );
            assert.equal(reconcileColorSliceHeight(height, layer, 0.25, false), old);
        }
    }
    assert.equal(reconcileColorSliceHeight(undefined, 0.08, 0.2, true), 0.2);
    assert.equal(reconcileColorSliceHeight(undefined, 0.08, 0.2, false), 0.08);
    assert.equal(reconcileColorSliceHeight(0.2, 0.2, 0.08, true), 0.2);
    assert.equal(reconcileColorSliceHeight(undefined, 0, 0.2, true), 0.2);
});

test('capped heights stay on the layer grid at or below 10 mm', () => {
    const settings = [
        { layer: 0.08, first: 0.19 },
        { layer: 0.08, first: 0.25 },
        { layer: 0.12, first: 0.2 },
        { layer: 0.15, first: 0.2 },
        { layer: 0.2, first: 0.3 },
        { layer: 0.07, first: 0.1 },
        { layer: 0.08, first: 0.2 },
    ];
    for (const { layer, first } of settings) {
        for (const isFirst of [true, false]) {
            const origin = isFirst ? Math.max(layer, first) : 0;
            const label = `${layer}/${first} ${isFirst ? 'first' : 'later'}`;
            for (const height of [9.97, 10, 10.02, 12]) {
                // Reconciliation clamps first; normalization snaps its result again on the
                // next render. Both must agree on one value at or below the cap.
                const reconciled = reconcileColorSliceHeight(height, layer, first, isFirst);
                assert.ok(reconciled <= MAX_COLOR_SLICE_HEIGHT, `${label}: ${reconciled}`);
                assert.equal(snapColorSliceHeight(reconciled, layer, first, isFirst), reconciled);
                const steps = (reconciled - origin) / layer;
                assert.ok(Math.abs(steps - Math.round(steps)) < 1e-6, `${label}: ${reconciled}`);
                // It is the last step: one more layer would pass the cap.
                assert.ok(reconciled + layer > MAX_COLOR_SLICE_HEIGHT + 1e-6, label);
                assert.ok(
                    snapColorSliceHeight(height, layer, first, isFirst) <= MAX_COLOR_SLICE_HEIGHT,
                    label
                );
            }
        }
    }
    // The issue's example: 0.19 + 122 × 0.08 mm, not the 10.03 mm the next step would give.
    assert.equal(reconcileColorSliceHeight(10, 0.08, 0.19, true), 9.95);
    assert.equal(snapColorSliceHeight(10, 0.08, 0.19, true), 9.95);
    // An exact 10 mm step is kept.
    assert.equal(reconcileColorSliceHeight(10, 0.08, 0.24, true), 10);
    assert.equal(snapColorSliceHeight(10, 0.08, 0, false), 10);
});

test('snapping keeps ordinary rounding and each grid minimum', () => {
    assert.equal(snapColorSliceHeight(0.49, 0.08, 0.25, true), 0.49);
    assert.equal(snapColorSliceHeight(0.52, 0.08, 0.25, true), 0.49);
    assert.equal(snapColorSliceHeight(0.1, 0.08, 0.25, true), 0.25);
    assert.equal(snapColorSliceHeight(0.21, 0.08, 0.25, false), 0.24);
    assert.equal(snapColorSliceHeight(0.01, 0.08, 0.25, false), 0.08);
    assert.equal(snapColorSliceHeight(0.35, 0.2, 0.1, true), 0.4);
});

test('manual swap plans stay on the layer following the preserved first color', async () => {
    await withViteTestServer(async (server) => {
        const { useSwapPlan } = (await server.ssrLoadModule(
            '/src/hooks/useSwapPlan.ts'
        )) as typeof import('../src/hooks/useSwapPlan.ts');
        for (const { layer, first, height, swapLayer } of cases) {
            let plan!: ReturnType<typeof useSwapPlan>;
            function Probe() {
                plan = useSwapPlan({
                    colorOrder: [1, 0],
                    colorSliceHeights: [
                        layer,
                        reconcileColorSliceHeight(height, layer, first, true),
                    ],
                    filtered: [
                        { hex: '#000000', a: 255 },
                        { hex: '#ffffff', a: 255 },
                    ],
                    layerHeight: layer,
                    slicerFirstLayerHeight: first,
                    paintMode: 'manual',
                });
                return null;
            }
            renderToStaticMarkup(createElement(Probe));
            const swap = plan.swapPlan[1];
            assert.equal(swap.type, 'swap');
            if (swap.type !== 'swap') throw new Error('Missing swap');
            assert.equal(swap.layer, swapLayer);
            assert.ok(Math.abs(swap.height - (height + layer)) < 1e-8);
            assert.equal(swap.swatch.hex, '#000000');
        }
    });
});
