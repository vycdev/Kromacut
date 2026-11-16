import { SUPPLIER_SETS } from '../data/supplierFilaments.ts';
import { rgbToLab, deltaE2000Lab } from './colorDifference.ts';
const lab = (hex: string) =>
    rgbToLab([
        parseInt(hex.slice(1, 3), 16),
        parseInt(hex.slice(3, 5), 16),
        parseInt(hex.slice(5, 7), 16),
    ]);
export const FILAMENT_CATALOG = SUPPLIER_SETS.flatMap((set) =>
    set.filaments.map((f, i) => ({
        id: `${set.id}-${i}`,
        name: f.name,
        hex: f.hex,
        brand: set.brand,
        line: set.line,
        material: set.material ?? 'PLA',
        sourceUrl: set.sourceUrl,
        sourceKind: set.sourceKind ?? 'manufacturer',
        verifiedOn: set.verifiedOn,
        lab: lab(f.hex),
    }))
);
export function recommendFilaments(
    hex: string,
    brand: string | string[] = '',
    material = '',
    limit = 10
) {
    if (!/^#[0-9a-f]{6}$/i.test(hex)) return [];
    const target = lab(hex);
    return FILAMENT_CATALOG.filter(
        (f) =>
            (Array.isArray(brand) ? brand.includes(f.brand) : !brand || f.brand === brand) &&
            (!material || f.material === material)
    )
        .map((f) => ({ ...f, difference: deltaE2000Lab(target, f.lab) }))
        .sort((a, b) => a.difference - b.difference || a.id.localeCompare(b.id))
        .slice(0, Math.max(0, limit));
}
