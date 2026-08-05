import type { CustomPalette } from '../types';
import { deduplicateName } from './nameUtils.ts';
import { toHex6 } from './colorUtils.ts';
import { isSupplierPaletteId } from './reservedIds.ts';

export const CURRENT_PALETTE_VERSION = 2;

const PALETTES_STORAGE_KEY = 'kromacut.palettes';
const LAST_PALETTE_KEY = 'kromacut.palettes.lastId';
const SELECTED_PALETTE_KEY = 'kromacut.palettes.selected';

/* ---------------------------------------------------------------------------
 * localStorage helpers
 * --------------------------------------------------------------------------- */

/**
 * Normalize a raw `disabledColors` value against a color list: keep unique
 * in-range integer indices, sorted ascending. Returns undefined (all enabled)
 * when the value is missing/invalid, empty, or would disable every color.
 */
export function normalizeDisabledColors(
    colors: string[],
    disabled: unknown
): number[] | undefined {
    if (!Array.isArray(disabled)) return undefined;
    const indices = [
        ...new Set(
            disabled.filter(
                (i): i is number => Number.isInteger(i) && i >= 0 && i < colors.length
            )
        ),
    ].sort((a, b) => a - b);
    if (indices.length === 0 || indices.length >= colors.length) return undefined;
    return indices;
}

/** Longest accepted per-color display name; anything longer is truncated. */
const MAX_COLOR_NAME_LENGTH = 100;

/**
 * Normalize a raw `colorNames` value against a color list: trimmed strings
 * parallel to `colors` ('' = unnamed), padded/truncated to the same length.
 * Returns undefined when the value is missing/invalid or every name is empty.
 */
export function normalizeColorNames(colors: string[], names: unknown): string[] | undefined {
    if (!Array.isArray(names)) return undefined;
    const normalized = colors.map((_, i) => {
        const raw = names[i];
        if (typeof raw !== 'string') return '';
        return raw.trim().slice(0, MAX_COLOR_NAME_LENGTH);
    });
    if (normalized.every((n) => n === '')) return undefined;
    return normalized;
}

/** Apply normalized disabled indices / color names, dropping empty fields. */
function normalizeCustomPalette(palette: CustomPalette): CustomPalette {
    const disabled = normalizeDisabledColors(palette.colors, palette.disabledColors);
    const names = normalizeColorNames(palette.colors, palette.colorNames);
    const normalized = { ...palette };
    if (disabled) normalized.disabledColors = disabled;
    else delete normalized.disabledColors;
    if (names) normalized.colorNames = names;
    else delete normalized.colorNames;
    return normalized;
}

/** The colors of a palette that participate in quantization. */
export function enabledColors(palette: CustomPalette): string[] {
    if (!palette.disabledColors || palette.disabledColors.length === 0) return palette.colors;
    const disabled = new Set(palette.disabledColors);
    return palette.colors.filter((_, i) => !disabled.has(i));
}

export function loadCustomPalettes(): CustomPalette[] {
    try {
        const raw = localStorage.getItem(PALETTES_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as CustomPalette[];
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter(
                (p) =>
                    typeof p.id === 'string' &&
                    typeof p.name === 'string' &&
                    Array.isArray(p.colors)
            )
            // A reserved (built-in) id in storage would shadow the built-in and
            // be undeletable — re-assign such palettes a fresh user id.
            .map((p) => (isSupplierPaletteId(p.id) ? { ...p, id: crypto.randomUUID() } : p))
            .map(normalizeCustomPalette);
    } catch {
        return [];
    }
}

export function saveCustomPalettes(palettes: CustomPalette[]) {
    try {
        localStorage.setItem(PALETTES_STORAGE_KEY, JSON.stringify(palettes));
    } catch {
        // ignore storage errors
    }
}

export function loadLastCustomPaletteId(): string | null {
    try {
        return localStorage.getItem(LAST_PALETTE_KEY);
    } catch {
        return null;
    }
}

export function saveLastCustomPaletteId(id: string | null) {
    try {
        if (id) {
            localStorage.setItem(LAST_PALETTE_KEY, id);
        } else {
            localStorage.removeItem(LAST_PALETTE_KEY);
        }
    } catch {
        // ignore
    }
}

export function loadSelectedPalette(): string | null {
    try {
        return localStorage.getItem(SELECTED_PALETTE_KEY);
    } catch {
        return null;
    }
}

export function saveSelectedPalette(id: string) {
    try {
        localStorage.setItem(SELECTED_PALETTE_KEY, id);
    } catch {
        // ignore
    }
}

/* ---------------------------------------------------------------------------
 * CRUD
 * --------------------------------------------------------------------------- */

export function createCustomPalette(
    name: string,
    colors: string[],
    disabledColors?: number[],
    colorNames?: string[]
): CustomPalette {
    const now = Date.now();
    return normalizeCustomPalette({
        id: crypto.randomUUID(),
        name: name.trim(),
        version: CURRENT_PALETTE_VERSION,
        colors: [...colors],
        disabledColors,
        colorNames,
        createdAt: now,
        updatedAt: now,
    });
}

export function updateCustomPalette(
    palettes: CustomPalette[],
    id: string,
    patch: { name?: string; colors?: string[]; disabledColors?: number[]; colorNames?: string[] }
): CustomPalette[] {
    return palettes.map((p) => {
        if (p.id !== id) return p;
        const updated: CustomPalette = {
            ...p,
            ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
            ...(patch.colors !== undefined ? { colors: [...patch.colors] } : {}),
            ...(patch.disabledColors !== undefined
                ? { disabledColors: [...patch.disabledColors] }
                : {}),
            ...(patch.colorNames !== undefined ? { colorNames: [...patch.colorNames] } : {}),
            version: CURRENT_PALETTE_VERSION,
            updatedAt: Date.now(),
        };
        return normalizeCustomPalette(updated);
    });
}

/**
 * Clone a palette (built-in or custom) into a new custom palette.
 * Colors are normalized to `#RRGGBB` hex (built-ins may use hsl() strings);
 * colors that cannot be converted are dropped, with disabled indices and
 * per-color names remapped. Returns null when no colors survive conversion.
 */
export function clonePalette(
    source: {
        label: string;
        colors: string[];
        disabledColors?: number[];
        colorNames?: string[];
    },
    existing: CustomPalette[]
): CustomPalette | null {
    const disabled = new Set(source.disabledColors ?? []);
    const converted = source.colors
        .map((c, i) => ({
            hex: toHex6(c),
            wasDisabled: disabled.has(i),
            name: source.colorNames?.[i] ?? '',
        }))
        .filter((c): c is { hex: string; wasDisabled: boolean; name: string } => c.hex !== null);
    if (converted.length === 0) return null;

    const colors = converted.map((c) => c.hex);
    const now = Date.now();
    return normalizeCustomPalette({
        id: crypto.randomUUID(),
        name: deduplicateName(
            `${source.label} (copy)`,
            existing.map((p) => p.name)
        ),
        version: CURRENT_PALETTE_VERSION,
        colors,
        disabledColors: converted.flatMap((c, i) => (c.wasDisabled ? [i] : [])),
        colorNames: converted.map((c) => c.name),
        createdAt: now,
        updatedAt: now,
    });
}

export function deleteCustomPalette(palettes: CustomPalette[], id: string): CustomPalette[] {
    return palettes.filter((p) => p.id !== id);
}

/* ---------------------------------------------------------------------------
 * Import / export
 * --------------------------------------------------------------------------- */

/** Check if two color arrays are identical (order-sensitive). */
function colorsEqual(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false;
    return a.every((c, i) => c.toLowerCase() === b[i].toLowerCase());
}

/** Content equality: same colors, same disabled indices, same color names. */
function paletteContentEqual(a: CustomPalette, b: CustomPalette): boolean {
    if (!colorsEqual(a.colors, b.colors)) return false;
    const da = a.disabledColors ?? [];
    const db = b.disabledColors ?? [];
    if (da.length !== db.length || !da.every((v, i) => v === db[i])) return false;
    const na = a.colorNames ?? [];
    const nb = b.colorNames ?? [];
    return na.length === nb.length && na.every((v, i) => v === nb[i]);
}

export interface ImportPaletteResult {
    palettes: CustomPalette[];
    imported: CustomPalette[];
    skipped: string[];
    overwritten: string[];
    renamed: string[];
}

/**
 * Import palettes with duplicate prevention:
 * - ID match: overwrite
 * - Content match (same colors + disabled set + names): skip
 * - Name match (different content): rename with numeric suffix
 *
 * Ids in `reservedIds` (built-in / supplier palette ids) are never accepted
 * from a file; such palettes get a fresh UUID instead.
 */
export function importCustomPalettes(
    existing: CustomPalette[],
    incoming: CustomPalette[],
    reservedIds?: Set<string>
): ImportPaletteResult {
    const result: ImportPaletteResult = {
        palettes: [...existing],
        imported: [],
        skipped: [],
        overwritten: [],
        renamed: [],
    };

    for (const raw of incoming) {
        if (!raw || typeof raw.name !== 'string' || !Array.isArray(raw.colors)) continue;

        // Filter invalid color entries and remap disabled indices / names with
        // them so per-color data stays attached to the right color.
        const disabledSet = new Set(Array.isArray(raw.disabledColors) ? raw.disabledColors : []);
        const rawNames: unknown[] = Array.isArray(raw.colorNames) ? raw.colorNames : [];
        const validEntries = raw.colors
            .map((c, i) => ({
                color: c,
                wasDisabled: disabledSet.has(i),
                name: typeof rawNames[i] === 'string' ? (rawNames[i] as string) : '',
            }))
            .filter((e) => typeof e.color === 'string');

        const now = Date.now();
        const incomingId =
            raw.id &&
            typeof raw.id === 'string' &&
            !reservedIds?.has(raw.id) &&
            !isSupplierPaletteId(raw.id)
                ? raw.id
                : crypto.randomUUID();
        const palette: CustomPalette = normalizeCustomPalette({
            id: incomingId,
            name: raw.name,
            version: typeof raw.version === 'number' ? raw.version : CURRENT_PALETTE_VERSION,
            colors: validEntries.map((e) => e.color),
            disabledColors: validEntries.flatMap((e, i) => (e.wasDisabled ? [i] : [])),
            colorNames: validEntries.map((e) => e.name),
            createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : now,
            updatedAt: now,
        });

        // 1. ID match → overwrite
        const idMatch = result.palettes.findIndex((p) => p.id === palette.id);
        if (idMatch !== -1) {
            result.palettes[idMatch] = { ...palette, updatedAt: now };
            result.overwritten.push(palette.name);
            result.imported.push(result.palettes[idMatch]);
            continue;
        }

        // 2. Content match (same colors + disabled set + names) → skip
        const contentMatch = result.palettes.find((p) => paletteContentEqual(p, palette));
        if (contentMatch) {
            result.skipped.push(`${palette.name} (matches "${contentMatch.name}")`);
            continue;
        }

        // 3. Name match → rename
        const nameMatch = result.palettes.some((p) => p.name === palette.name);
        if (nameMatch) {
            palette.name = deduplicateName(
                palette.name,
                result.palettes.map((p) => p.name)
            );
            result.renamed.push(palette.name);
        }

        result.palettes.push(palette);
        result.imported.push(palette);
    }

    return result;
}

/**
 * Parse a JSON string into an array of custom palettes.
 * Accepts a single palette object or an array.
 */
export function parseCustomPaletteFile(json: string): CustomPalette[] | null {
    try {
        const parsed = JSON.parse(json);
        if (Array.isArray(parsed)) return parsed;
        if (parsed && typeof parsed === 'object' && Array.isArray(parsed.colors)) {
            return [parsed as CustomPalette];
        }
        return null;
    } catch {
        return null;
    }
}

/** Build an export blob for a custom palette. */
export function exportCustomPaletteBlob(palette: CustomPalette): Blob {
    return new Blob([JSON.stringify(palette, null, 2)], {
        type: 'application/json',
    });
}

/** Sanitize a name for use as a filename. */
export function customPaletteFileName(name: string): string {
    return `${name.replace(/[^a-zA-Z0-9_-]/g, '_')}.kpal`;
}
