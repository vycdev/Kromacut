import assert from 'node:assert/strict';
import test from 'node:test';

import { reconcileColorOrder } from '../src/lib/colorOrder.ts';
import { hexLuminance } from '../src/lib/colorUtils.ts';

type TestSwatch = { hex: string; a: number };

function legacyReconcile(
    filtered: TestSwatch[],
    previousFiltered: TestSwatch[],
    previousOrder: number[]
): number[] {
    const nextOrder: number[] = [];
    if (previousOrder.length && previousFiltered.length) {
        for (const previousIndex of previousOrder) {
            const swatch = previousFiltered[previousIndex];
            if (!swatch) continue;
            const index = filtered.findIndex(
                (candidate) => candidate.hex === swatch.hex && candidate.a === swatch.a
            );
            if (index !== -1 && !nextOrder.includes(index)) nextOrder.push(index);
        }
    }
    const remaining: number[] = [];
    for (let index = 0; index < filtered.length; index++) {
        if (!nextOrder.includes(index)) remaining.push(index);
    }
    remaining.sort(
        (left, right) => hexLuminance(filtered[left].hex) - hexLuminance(filtered[right].hex)
    );
    nextOrder.push(...remaining);
    return nextOrder;
}

test('indexed color-order reconciliation matches the previous algorithm', () => {
    const colors = ['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#888888'];
    for (let length = 0; length <= 40; length++) {
        const filtered = Array.from({ length }, (_, index) => ({
            hex: colors[(index * 5 + 2) % colors.length],
            a: index % 5 === 0 ? 128 : 255,
        }));
        const previousFiltered = Array.from({ length: Math.max(0, length - 3) }, (_, index) => ({
            hex: colors[(index * 3 + 1) % colors.length],
            a: index % 4 === 0 ? 128 : 255,
        }));
        const previousOrder = Array.from(
            { length: previousFiltered.length + 2 },
            (_, index) => previousFiltered.length - index
        );
        assert.deepEqual(
            reconcileColorOrder(filtered, previousFiltered, previousOrder),
            legacyReconcile(filtered, previousFiltered, previousOrder)
        );
    }
});

test('color-order reconciliation handles the full palette cap without losing indices', () => {
    const size = 2 ** 14;
    const filtered = Array.from({ length: size }, (_, index) => ({
        hex: `#${index.toString(16).padStart(6, '0')}`,
        a: 255,
    }));
    const previousOrder = Array.from({ length: size }, (_, index) => size - index - 1);
    const order = reconcileColorOrder(filtered, filtered, previousOrder);

    assert.equal(order.length, size);
    assert.equal(new Set(order).size, size);
    assert.equal(order[0], size - 1);
    assert.equal(order.at(-1), 0);
});
