import type { Palette } from './palettes.ts';
import type { AutoPaintProfile } from '../lib/profileManager.ts';
import { CURRENT_PROFILE_VERSION } from '../lib/profileManager.ts';
import { estimateHidingDistanceFromColor } from '../lib/colorUtils.ts';

/**
 * Supplier palettes contain sRGB references. See public/supplier-filament-sources.md.
 *
 * The existing Bambu template uses heuristic hiding distances unless a measured
 * value is provided. Additional reference sets are palette data only.
 */

export interface SupplierFilament {
    /** Stable catalog ID. Keep it when reordering or renaming a color. */
    id: string;
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
    source: {
        url: string;
        kind: 'manufacturer' | 'community';
        checkedOn: string;
        redistribution: string;
    };
    filaments: SupplierFilament[];
}

// Keep the existing Bambu template and its saved IDs.
const LEGACY_TEMPLATE_SETS: SupplierSet[] = [
    {
        id: 'bambu-pla-basic',
        brand: 'Bambu Lab',
        line: 'PLA Basic',
        source: {
            url: 'https://store.bblcdn.com/s7/default/1084369ef84345bbaa5d704a492954e0/Bambu_PLA_Basic_Hex_Code.pdf',
            kind: 'manufacturer',
            checkedOn: '2026-11-19',
            redistribution:
                'Existing chart transcription. The manufacturer did not specify a license on the chart.',
        },
        filaments: [
            { id: 'bambu-pla-basic/jade-white', name: 'Jade White', hex: '#FFFFFF' },
            { id: 'bambu-pla-basic/beige', name: 'Beige', hex: '#F7E6DE' },
            { id: 'bambu-pla-basic/light-gray', name: 'Light Gray', hex: '#D1D3D5' },
            { id: 'bambu-pla-basic/silver', name: 'Silver', hex: '#A6A9AA' },
            { id: 'bambu-pla-basic/gray', name: 'Gray', hex: '#8E9089' },
            { id: 'bambu-pla-basic/magenta', name: 'Magenta', hex: '#EC008C' },
            { id: 'bambu-pla-basic/pink', name: 'Pink', hex: '#F55A74' },
            { id: 'bambu-pla-basic/hot-pink', name: 'Hot Pink', hex: '#F5547C' },
            { id: 'bambu-pla-basic/orange', name: 'Orange', hex: '#FF6A13' },
            { id: 'bambu-pla-basic/pumpkin-orange', name: 'Pumpkin Orange', hex: '#FF9016' },
            { id: 'bambu-pla-basic/gold', name: 'Gold', hex: '#E4BD68' },
            { id: 'bambu-pla-basic/sunflower-yellow', name: 'Sunflower Yellow', hex: '#FEC600' },
            { id: 'bambu-pla-basic/yellow', name: 'Yellow', hex: '#F4EE2A' },
            { id: 'bambu-pla-basic/bright-green', name: 'Bright Green', hex: '#BECF00' },
            { id: 'bambu-pla-basic/bambu-green', name: 'Bambu Green', hex: '#00AE42' },
            { id: 'bambu-pla-basic/mistletoe-green', name: 'Mistletoe Green', hex: '#3F8E43' },
            { id: 'bambu-pla-basic/bronze', name: 'Bronze', hex: '#847D48' },
            { id: 'bambu-pla-basic/cocoa-brown', name: 'Cocoa Brown', hex: '#6F5034' },
            { id: 'bambu-pla-basic/brown', name: 'Brown', hex: '#9D432C' },
            { id: 'bambu-pla-basic/maroon-red', name: 'Maroon Red', hex: '#9D2235' },
            { id: 'bambu-pla-basic/red', name: 'Red', hex: '#C12E1F' },
            { id: 'bambu-pla-basic/turquoise', name: 'Turquoise', hex: '#00B1B7' },
            { id: 'bambu-pla-basic/cyan', name: 'Cyan', hex: '#0086D6' },
            { id: 'bambu-pla-basic/blue', name: 'Blue', hex: '#0A2989' },
            { id: 'bambu-pla-basic/cobalt-blue', name: 'Cobalt Blue', hex: '#0056B8' },
            { id: 'bambu-pla-basic/purple', name: 'Purple', hex: '#5E43B7' },
            { id: 'bambu-pla-basic/indigo-purple', name: 'Indigo Purple', hex: '#482960' },
            { id: 'bambu-pla-basic/blue-grey', name: 'Blue Grey', hex: '#5B6579' },
            { id: 'bambu-pla-basic/dark-gray', name: 'Dark Gray', hex: '#545454' },
            { id: 'bambu-pla-basic/black', name: 'Black', hex: '#000000' },
        ],
    },
];

export const SUPPLIER_SETS: SupplierSet[] = [
    ...LEGACY_TEMPLATE_SETS,
    {
        id: 'polymaker-panchroma-basic',
        brand: 'Polymaker',
        line: 'Panchroma Basic PLA',
        source: {
            url: 'https://github.com/OpenFilamentCollective/open-filament-database/tree/1c19d5088fbc19a434c426aae2006f7a3a4348d9/data/panchroma/PLA/basic_pla',
            kind: 'community',
            checkedOn: '2026-11-19',
            redistribution: 'MIT',
        },
        filaments: [
            { id: 'polymaker-panchroma-basic/aqua-blue', name: 'Aqua Blue', hex: '#5EBDDB' },
            { id: 'polymaker-panchroma-basic/azure-blue', name: 'Azure Blue', hex: '#0066D9' },
            { id: 'polymaker-panchroma-basic/beige', name: 'Beige', hex: '#C2AB72' },
            { id: 'polymaker-panchroma-basic/black', name: 'Black', hex: '#080A0D' },
            { id: 'polymaker-panchroma-basic/blue', name: 'Blue', hex: '#003776' },
            { id: 'polymaker-panchroma-basic/brown', name: 'Brown', hex: '#55331A' },
            { id: 'polymaker-panchroma-basic/cold-white', name: 'Cold White', hex: '#D9DFE5' },
            { id: 'polymaker-panchroma-basic/cream', name: 'Cream', hex: '#EED1A8' },
            { id: 'polymaker-panchroma-basic/dark-grey', name: 'Dark Grey', hex: '#485259' },
            {
                id: 'polymaker-panchroma-basic/dark-olive-drab',
                name: 'Dark Olive Drab',
                hex: '#575B54',
            },
            { id: 'polymaker-panchroma-basic/green', name: 'Green', hex: '#06924D' },
            { id: 'polymaker-panchroma-basic/grey', name: 'Grey', hex: '#8C9099' },
            { id: 'polymaker-panchroma-basic/jungle-green', name: 'Jungle Green', hex: '#4E742D' },
            { id: 'polymaker-panchroma-basic/lemon-yellow', name: 'Lemon Yellow', hex: '#EED230' },
            { id: 'polymaker-panchroma-basic/lime-green', name: 'Lime Green', hex: '#D5D701' },
            { id: 'polymaker-panchroma-basic/magenta', name: 'Magenta', hex: '#F24574' },
            { id: 'polymaker-panchroma-basic/olive-green', name: 'Olive Green', hex: '#948902' },
            { id: 'polymaker-panchroma-basic/orange', name: 'Orange', hex: '#F67405' },
            { id: 'polymaker-panchroma-basic/pink', name: 'Pink', hex: '#F1A1AF' },
            {
                id: 'polymaker-panchroma-basic/polymaker-teal',
                name: 'Polymaker Teal',
                hex: '#4CC0C7',
            },
            { id: 'polymaker-panchroma-basic/purple', name: 'Purple', hex: '#6C47B2' },
            { id: 'polymaker-panchroma-basic/red', name: 'Red', hex: '#E72F1D' },
            { id: 'polymaker-panchroma-basic/steel-grey', name: 'Steel Grey', hex: '#616469' },
            { id: 'polymaker-panchroma-basic/stone-blue', name: 'Stone Blue', hex: '#487BA2' },
            { id: 'polymaker-panchroma-basic/tan', name: 'Tan', hex: '#A79E82' },
            { id: 'polymaker-panchroma-basic/white', name: 'White', hex: '#EBF7FF' },
            { id: 'polymaker-panchroma-basic/wine-red', name: 'Wine Red', hex: '#D60212' },
            { id: 'polymaker-panchroma-basic/yellow', name: 'Yellow', hex: '#FFE800' },
        ],
    },
    {
        id: 'prusament-pla-solid',
        brand: 'Prusament',
        line: 'PLA',
        source: {
            url: 'https://github.com/OpenFilamentCollective/open-filament-database/tree/1c19d5088fbc19a434c426aae2006f7a3a4348d9/data/prusament/PLA/pla',
            kind: 'community',
            checkedOn: '2026-11-19',
            redistribution: 'MIT',
        },
        filaments: [
            { id: 'prusament-pla-solid/anthracite-grey', name: 'Anthracite Grey', hex: '#3F4647' },
            { id: 'prusament-pla-solid/army-green', name: 'Army Green', hex: '#5E6345' },
            { id: 'prusament-pla-solid/azure-blue', name: 'Azure Blue', hex: '#0082AD' },
            { id: 'prusament-pla-solid/blood-red', name: 'Blood Red', hex: '#990303' },
            { id: 'prusament-pla-solid/chalky-blue', name: 'Chalky Blue', hex: '#6F9AAA' },
            { id: 'prusament-pla-solid/gentlemans-grey', name: "Gentleman's Grey", hex: '#354047' },
            { id: 'prusament-pla-solid/gravity-grey', name: 'Gravity Grey', hex: '#9FA4A8' },
            { id: 'prusament-pla-solid/jet-black', name: 'Jet Black', hex: '#393C3C' },
            { id: 'prusament-pla-solid/lipstick-red', name: 'Lipstick Red', hex: '#BF2B2B' },
            { id: 'prusament-pla-solid/noctua-beige', name: 'Noctua Beige', hex: '#E7CEB4' },
            { id: 'prusament-pla-solid/noctua-brown', name: 'Noctua Brown', hex: '#653525' },
            { id: 'prusament-pla-solid/opal-green', name: 'Opal Green', hex: '#065B4A' },
            { id: 'prusament-pla-solid/pearl-mouse', name: 'Pearl Mouse', hex: '#A49D8E' },
            {
                id: 'prusament-pla-solid/pineapple-yellow',
                name: 'Pineapple Yellow',
                hex: '#EFD00B',
            },
            { id: 'prusament-pla-solid/pistachio-green', name: 'Pistachio Green', hex: '#93A683' },
            { id: 'prusament-pla-solid/pristine-white', name: 'Pristine White', hex: '#E6EAEF' },
            { id: 'prusament-pla-solid/prusa-orange', name: 'Prusa Orange', hex: '#FE6E32' },
            { id: 'prusament-pla-solid/prusa-pro-green', name: 'Prusa Pro Green', hex: '#85E2C3' },
            { id: 'prusament-pla-solid/simply-green', name: 'Simply Green', hex: '#70A641' },
            { id: 'prusament-pla-solid/vanilla-white', name: 'Vanilla White', hex: '#D9D4C6' },
        ],
    },
    {
        id: 'prusament-petg-solid',
        brand: 'Prusament',
        line: 'PETG',
        source: {
            url: 'https://github.com/OpenFilamentCollective/open-filament-database/tree/1c19d5088fbc19a434c426aae2006f7a3a4348d9/data/prusament/PETG/petg',
            kind: 'community',
            checkedOn: '2026-11-19',
            redistribution: 'MIT',
        },
        filaments: [
            { id: 'prusament-petg-solid/anthracite-grey', name: 'Anthracite Grey', hex: '#3F4647' },
            { id: 'prusament-petg-solid/chalky-blue', name: 'Chalky Blue', hex: '#6F9AAA' },
            { id: 'prusament-petg-solid/jet-black', name: 'Jet Black', hex: '#292B2B' },
            { id: 'prusament-petg-solid/jungle-green', name: 'Jungle Green', hex: '#007249' },
            { id: 'prusament-petg-solid/lipstick-red', name: 'Lipstick Red', hex: '#BB2E33' },
            { id: 'prusament-petg-solid/mango-yellow', name: 'Mango Yellow', hex: '#F2B70A' },
            { id: 'prusament-petg-solid/ocean-blue', name: 'Ocean Blue', hex: '#194C55' },
            { id: 'prusament-petg-solid/pistachio-green', name: 'Pistachio Green', hex: '#93A683' },
            { id: 'prusament-petg-solid/prusa-orange', name: 'Prusa Orange', hex: '#EB5405' },
            { id: 'prusament-petg-solid/signal-white', name: 'Signal White', hex: '#E5E0E3' },
            { id: 'prusament-petg-solid/sky-blue', name: 'Sky Blue', hex: '#346CE3' },
            {
                id: 'prusament-petg-solid/terracotta-light',
                name: 'Terracotta Light',
                hex: '#B87F6A',
            },
            { id: 'prusament-petg-solid/urban-grey', name: 'Urban Grey', hex: '#95908D' },
        ],
    },
    {
        id: 'sunlu-pla-classic',
        brand: 'SUNLU',
        line: 'PLA Classic',
        source: {
            url: 'https://github.com/OpenFilamentCollective/open-filament-database/tree/1c19d5088fbc19a434c426aae2006f7a3a4348d9/data/sunlu/PLA/pla_classic',
            kind: 'community',
            checkedOn: '2026-11-19',
            redistribution: 'MIT',
        },
        filaments: [
            { id: 'sunlu-pla-classic/black', name: 'Black', hex: '#000000' },
            { id: 'sunlu-pla-classic/cherry-red', name: 'Cherry Red', hex: '#F4364C' },
            { id: 'sunlu-pla-classic/chocolate', name: 'Chocolate', hex: '#7D4016' },
            { id: 'sunlu-pla-classic/grey', name: 'Grey', hex: '#808080' },
            { id: 'sunlu-pla-classic/lemon-yellow', name: 'Lemon Yellow', hex: '#F0EC74' },
            { id: 'sunlu-pla-classic/mint-green', name: 'Mint Green', hex: '#A8D5BA' },
            { id: 'sunlu-pla-classic/olive-green', name: 'Olive Green', hex: '#BAB86C' },
            { id: 'sunlu-pla-classic/pri-cyan', name: 'Pri-Cyan', hex: '#608AFF' },
            { id: 'sunlu-pla-classic/pri-magenta', name: 'Pri-Magenta', hex: '#E364CD' },
            { id: 'sunlu-pla-classic/pri-white', name: 'Pri-White', hex: '#EEEDF2' },
            { id: 'sunlu-pla-classic/pri-yellow', name: 'Pri-Yellow', hex: '#F0EA02' },
            { id: 'sunlu-pla-classic/sakura-pink', name: 'Sakura Pink', hex: '#F2D4D7' },
            { id: 'sunlu-pla-classic/sky-blue', name: 'Sky Blue', hex: '#00B5E2' },
            { id: 'sunlu-pla-classic/sunny-orange', name: 'Sunny Orange', hex: '#FF8A00' },
            { id: 'sunlu-pla-classic/white', name: 'White', hex: '#FFFFFF' },
        ],
    },
    {
        id: 'elegoo-pla-rfid',
        brand: 'ELEGOO',
        line: 'PLA (RFID)',
        source: {
            url: 'https://github.com/Ganja-Panda/Elegoo-Centauri-Carbon-Series/blob/0290cfda6817c00e55c5f93b6de7d53dea42883f/README.md#-hueforge--elegoo-pla-filament-data',
            kind: 'community',
            checkedOn: '2026-11-19',
            redistribution: 'MIT',
        },
        filaments: [
            { id: 'elegoo-pla-rfid/beige', name: 'Beige', hex: '#FFEEC5' },
            { id: 'elegoo-pla-rfid/black', name: 'Black', hex: '#000000' },
            { id: 'elegoo-pla-rfid/brown', name: 'Brown', hex: '#9B6A4D' },
            { id: 'elegoo-pla-rfid/dark-blue', name: 'Dark Blue', hex: '#2323F7' },
            { id: 'elegoo-pla-rfid/grey', name: 'Grey', hex: '#747C7E' },
            { id: 'elegoo-pla-rfid/neon-green', name: 'Neon Green', hex: '#29D464' },
            { id: 'elegoo-pla-rfid/orange', name: 'Orange', hex: '#E97B47' },
            { id: 'elegoo-pla-rfid/pink', name: 'Pink', hex: '#FBAFBC' },
            { id: 'elegoo-pla-rfid/purple', name: 'Purple', hex: '#9E69E8' },
            { id: 'elegoo-pla-rfid/red', name: 'Red', hex: '#FF0000' },
            { id: 'elegoo-pla-rfid/sea-green', name: 'Sea Green', hex: '#09C299' },
            { id: 'elegoo-pla-rfid/sky-blue', name: 'Sky Blue', hex: '#24A2CC' },
            { id: 'elegoo-pla-rfid/space-grey', name: 'Space Grey', hex: '#979797' },
            { id: 'elegoo-pla-rfid/white', name: 'White', hex: '#FFFFFF' },
            { id: 'elegoo-pla-rfid/yellow', name: 'Yellow', hex: '#FFC800' },
        ],
    },
];

export {
    isSupplierPaletteId,
    isTemplateProfileId,
    SUPPLIER_PALETTE_PREFIX,
    TEMPLATE_PROFILE_PREFIX,
} from '../lib/reservedIds.ts';
import { SUPPLIER_PALETTE_PREFIX, TEMPLATE_PROFILE_PREFIX } from '../lib/reservedIds.ts';

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
export const TEMPLATE_PROFILES: AutoPaintProfile[] = LEGACY_TEMPLATE_SETS.map((set) => ({
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
