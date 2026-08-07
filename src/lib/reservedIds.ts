/**
 * Reserved id prefixes for built-in (non-user) palettes and profiles.
 * User data loaded from storage or imported from files must never carry
 * these prefixes — they would shadow built-ins and become undeletable.
 */

export const SUPPLIER_PALETTE_PREFIX = 'sup_';
export const TEMPLATE_PROFILE_PREFIX = 'tpl_';

export const isSupplierPaletteId = (id: string) => id.startsWith(SUPPLIER_PALETTE_PREFIX);
export const isTemplateProfileId = (id: string) => id.startsWith(TEMPLATE_PROFILE_PREFIX);
