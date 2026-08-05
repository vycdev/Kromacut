import type { Palette } from './palettes.ts';
import type { AutoPaintProfile } from '../lib/profileManager.ts';
import { CURRENT_PROFILE_VERSION } from '../lib/profileManager.ts';
import { estimateHidingDistanceFromColor } from '../lib/colorUtils.ts';

/**
 * Built-in supplier filament data.
 *
 * Color values from Bambu Lab's published PLA Basic color chart (as bundled in
 * Bambu Studio's filament presets), retrieved 2026-08-05. Hex codes are the
 * manufacturer's advertised colors, not spectral measurements.
 *
 * Hiding-distance (`td`) values are heuristic estimates derived via
 * estimateHidingDistanceFromColor unless a measured `td` (frontlit hiding
 * distance, mm) is provided in the data; replace with calibrated values when
 * available.
 */

export interface SupplierFilament {
    /** Display name, e.g. "Jade White" */
    name: string;
    /** Canonical #RRGGBB uppercase hex */
    hex: string;
    /** Measured frontlit hiding distance in mm; omit to estimate from color */
    td?: number;
}

export interface SupplierSet {
    /** Stable id fragment, e.g. 'bambu-pla-basic' */
    id: string;
    brand: string;
    line: string;
    filaments: SupplierFilament[];
}

export const SUPPLIER_SETS: SupplierSet[] = [
    {
        id: 'bambu-pla-basic',
        brand: 'Bambu Lab',
        line: 'PLA Basic',
        filaments: [
            { name: 'Jade White', hex: '#FFFFFF' },
            { name: 'Beige', hex: '#F7E6DE' },
            { name: 'Gold', hex: '#E4BD68' },
            { name: 'Silver', hex: '#A6A9AA' },
            { name: 'Gray', hex: '#8E9089' },
            { name: 'Bronze', hex: '#847D48' },
            { name: 'Brown', hex: '#9D432C' },
            { name: 'Red', hex: '#C12E1F' },
            { name: 'Magenta', hex: '#EC008C' },
            { name: 'Pink', hex: '#F55A74' },
            { name: 'Orange', hex: '#FF6A13' },
            { name: 'Yellow', hex: '#F4EE2A' },
            { name: 'Bambu Green', hex: '#00AE42' },
            { name: 'Mistletoe Green', hex: '#3F8E43' },
            { name: 'Cyan', hex: '#0086D6' },
            { name: 'Blue', hex: '#0A2989' },
            { name: 'Purple', hex: '#5E43B7' },
            { name: 'Blue Gray', hex: '#5B6579' },
            { name: 'Light Gray', hex: '#D1D3D5' },
            { name: 'Dark Gray', hex: '#545454' },
            { name: 'Black', hex: '#000000' },
        ],
    },
];

const SUPPLIER_PALETTE_PREFIX = 'sup_';
const TEMPLATE_PROFILE_PREFIX = 'tpl_';

export const isSupplierPaletteId = (id: string) => id.startsWith(SUPPLIER_PALETTE_PREFIX);
export const isTemplateProfileId = (id: string) => id.startsWith(TEMPLATE_PROFILE_PREFIX);

/** Supplier color sets as palettes for the quantization dropdown. */
export const SUPPLIER_PALETTES: Palette[] = SUPPLIER_SETS.map((set) => ({
    id: `${SUPPLIER_PALETTE_PREFIX}${set.id}`,
    label: `${set.brand} ${set.line}`,
    colors: set.filaments.map((f) => f.hex),
    size: set.filaments.length,
    group: 'supplier',
}));

/**
 * Supplier sets as read-only auto-paint profile templates. Never persisted to
 * localStorage; loading one copies its filaments into the working set.
 */
export const TEMPLATE_PROFILES: AutoPaintProfile[] = SUPPLIER_SETS.map((set) => ({
    id: `${TEMPLATE_PROFILE_PREFIX}${set.id}`,
    name: `${set.brand} ${set.line}`,
    version: CURRENT_PROFILE_VERSION,
    filaments: set.filaments.map((f, i) => ({
        id: `${TEMPLATE_PROFILE_PREFIX}${set.id}-${i}`,
        color: f.hex,
        td: f.td ?? estimateHidingDistanceFromColor(f.hex),
        name: f.name,
        brand: set.brand,
    })),
    createdAt: 0,
    updatedAt: 0,
}));
