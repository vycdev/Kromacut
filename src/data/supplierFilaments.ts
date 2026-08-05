import type { Palette } from './palettes.ts';
import type { AutoPaintProfile } from '../lib/profileManager.ts';
import { CURRENT_PROFILE_VERSION } from '../lib/profileManager.ts';
import { estimateHidingDistanceFromColor } from '../lib/colorUtils.ts';

/**
 * Built-in supplier filament data.
 *
 * Color values from Bambu Lab's official "Filament Hex Code Table" PDF, as
 * linked from the PLA Basic store page ("Download > Hex Code"):
 * https://store.bblcdn.com/s7/default/1084369ef84345bbaa5d704a492954e0/Bambu_PLA_Basic_Hex_Code.pdf
 * Retrieved 2026-08-05: 30 colors, listed here in the chart's order. Hex codes
 * are the manufacturer's advertised colors, not spectral measurements.
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
            { name: 'Light Gray', hex: '#D1D3D5' },
            { name: 'Silver', hex: '#A6A9AA' },
            { name: 'Gray', hex: '#8E9089' },
            { name: 'Magenta', hex: '#EC008C' },
            { name: 'Pink', hex: '#F55A74' },
            { name: 'Hot Pink', hex: '#F5547C' },
            { name: 'Orange', hex: '#FF6A13' },
            { name: 'Pumpkin Orange', hex: '#FF9016' },
            { name: 'Gold', hex: '#E4BD68' },
            { name: 'Sunflower Yellow', hex: '#FEC600' },
            { name: 'Yellow', hex: '#F4EE2A' },
            { name: 'Bright Green', hex: '#BECF00' },
            { name: 'Bambu Green', hex: '#00AE42' },
            { name: 'Mistletoe Green', hex: '#3F8E43' },
            { name: 'Bronze', hex: '#847D48' },
            { name: 'Cocoa Brown', hex: '#6F5034' },
            { name: 'Brown', hex: '#9D432C' },
            { name: 'Maroon Red', hex: '#9D2235' },
            { name: 'Red', hex: '#C12E1F' },
            { name: 'Turquoise', hex: '#00B1B7' },
            { name: 'Cyan', hex: '#0086D6' },
            { name: 'Blue', hex: '#0A2989' },
            { name: 'Cobalt Blue', hex: '#0056B8' },
            { name: 'Purple', hex: '#5E43B7' },
            { name: 'Indigo Purple', hex: '#482960' },
            { name: 'Blue Grey', hex: '#5B6579' },
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
    colorNames: set.filaments.map((f) => f.name),
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
