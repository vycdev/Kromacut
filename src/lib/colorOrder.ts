import type { Swatch } from '../types';
import { hexLuminance } from './colorUtils.ts';

type SwatchIdentity = Pick<Swatch, 'hex' | 'a'>;

function swatchSignature(swatch: SwatchIdentity): string {
    return `${swatch.hex}:${swatch.a}`;
}

/**
 * Preserve the previous order for colors that still exist, then append new
 * colors from dark to light. The first current occurrence wins for duplicate
 * signatures, matching the previous findIndex/includes behavior in O(n) lookup
 * work instead of O(n²).
 */
export function reconcileColorOrder(
    filtered: readonly SwatchIdentity[],
    previousFiltered: readonly SwatchIdentity[],
    previousOrder: readonly number[]
): number[] {
    const firstCurrentIndex = new Map<string, number>();
    for (let index = 0; index < filtered.length; index++) {
        const signature = swatchSignature(filtered[index]);
        if (!firstCurrentIndex.has(signature)) firstCurrentIndex.set(signature, index);
    }

    const included = new Uint8Array(filtered.length);
    const nextOrder: number[] = [];
    for (const previousIndex of previousOrder) {
        const previous = previousFiltered[previousIndex];
        if (!previous) continue;
        const index = firstCurrentIndex.get(swatchSignature(previous));
        if (index === undefined || included[index]) continue;
        included[index] = 1;
        nextOrder.push(index);
    }

    const remaining: number[] = [];
    for (let index = 0; index < filtered.length; index++) {
        if (!included[index]) remaining.push(index);
    }
    remaining.sort(
        (left, right) => hexLuminance(filtered[left].hex) - hexLuminance(filtered[right].hex)
    );
    nextOrder.push(...remaining);
    return nextOrder;
}
