import type { Filament } from '../types';
import { FRONTLIT_TD_SCALE, sanitizeFrontlitCalibration } from './calibration.ts';

export interface AutoPaintProfile {
    id: string;
    name: string;
    version: number;
    filaments: Filament[];
    createdAt: number;
    updatedAt: number;
}

/**
 * Profile schema versions:
 * - v1: uncalibrated `td` stored on the conventional backlit TD scale (~1–6 mm)
 *   and scaled ×0.1 at simulation time.
 * - v2: `td` always stores the frontlit hiding distance (mm) directly, for
 *   calibrated and uncalibrated filaments alike.
 */
export const CURRENT_PROFILE_VERSION = 2;

/** Schema version that introduced hiding-distance td storage. The td migration
 *  applies to profiles below this version only — never re-gate it on
 *  CURRENT_PROFILE_VERSION, or a future bump would re-scale v2 profiles. */
const TD_MIGRATION_VERSION = 2;

const PROFILES_STORAGE_KEY = 'kromacut.autopaint.profiles';
const LAST_PROFILE_KEY = 'kromacut.autopaint.lastProfileId';

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object';
}

export function sanitizeProfileFilament(value: unknown): Filament | null {
    if (!isRecord(value)) return null;
    if (
        typeof value.id !== 'string' ||
        typeof value.color !== 'string' ||
        typeof value.td !== 'number' ||
        !Number.isFinite(value.td)
    ) {
        return null;
    }

    const filament: Filament = {
        id: value.id,
        color: value.color,
        td: value.td,
    };
    if (typeof value.name === 'string') filament.name = value.name;
    if (typeof value.brand === 'string') filament.brand = value.brand;

    const calibration = sanitizeFrontlitCalibration(value.calibration);
    if (calibration) {
        // Backfill the calibrated color for records saved before the field
        // existed: on load the current color IS the color it was calibrated for
        // (no edit has happened yet), so this activates color-mismatch
        // protection for legacy calibrations without discarding them.
        filament.calibration =
            calibration.filamentColor === undefined
                ? { ...calibration, filamentColor: filament.color }
                : calibration;
    }
    return filament;
}

/**
 * Convert a schema-v1 filament to v2 semantics: uncalibrated tds move from the
 * conventional backlit TD scale to the frontlit hiding distance (×0.1);
 * calibrated filaments re-sync to their measured scalar. Must run exactly once
 * per filament, gated by the stored schema version.
 */
export function migrateLegacyFilamentTd(filament: Filament): Filament {
    const calibration = sanitizeFrontlitCalibration(filament.calibration);
    if (calibration) {
        return { ...filament, td: calibration.tdSingleValue };
    }
    // Round away binary-float noise from the ×0.1 (e.g. 1.1 → 0.11000000000000001);
    // 4 decimals is far below the optical resolution of any read.
    return { ...filament, td: Math.round(filament.td * FRONTLIT_TD_SCALE * 1e4) / 1e4 };
}

function sanitizeProfileFilaments(value: unknown[], version: number): Filament[] {
    const filaments = value
        .map((filament) => sanitizeProfileFilament(filament))
        .filter((filament): filament is Filament => filament !== null);
    return version < TD_MIGRATION_VERSION ? filaments.map(migrateLegacyFilamentTd) : filaments;
}

function sanitizeProfile(value: unknown): AutoPaintProfile | null {
    if (!isRecord(value)) return null;
    if (
        typeof value.id !== 'string' ||
        typeof value.name !== 'string' ||
        !Array.isArray(value.filaments)
    ) {
        return null;
    }

    const version = typeof value.version === 'number' ? value.version : 1;
    const now = Date.now();
    return {
        id: value.id,
        name: value.name,
        version: CURRENT_PROFILE_VERSION,
        filaments: sanitizeProfileFilaments(value.filaments, version),
        createdAt: typeof value.createdAt === 'number' ? value.createdAt : now,
        updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : now,
    };
}

export function loadProfiles(): AutoPaintProfile[] {
    try {
        const raw = localStorage.getItem(PROFILES_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as AutoPaintProfile[];
        if (!Array.isArray(parsed)) return [];
        return parsed
            .map((profile) => sanitizeProfile(profile))
            .filter((profile): profile is AutoPaintProfile => profile !== null);
    } catch {
        return [];
    }
}

export function loadLastProfileId(): string | null {
    try {
        return localStorage.getItem(LAST_PROFILE_KEY);
    } catch {
        return null;
    }
}

export function saveLastProfileId(id: string | null) {
    try {
        if (id) {
            localStorage.setItem(LAST_PROFILE_KEY, id);
        } else {
            localStorage.removeItem(LAST_PROFILE_KEY);
        }
    } catch {
        // ignore
    }
}

export function saveProfilesToStorage(profiles: AutoPaintProfile[]) {
    try {
        localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(profiles));
    } catch {
        // ignore storage errors
    }
}

export function createProfile(name: string, filaments: Filament[]): AutoPaintProfile {
    const now = Date.now();
    return {
        id: crypto.randomUUID(),
        name: name.trim(),
        version: CURRENT_PROFILE_VERSION,
        filaments: filaments.map((f) => ({ ...f })),
        createdAt: now,
        updatedAt: now,
    };
}

export function overwriteProfile(
    profiles: AutoPaintProfile[],
    id: string,
    filaments: Filament[]
): AutoPaintProfile[] {
    return profiles.map((p) =>
        p.id === id
            ? {
                  ...p,
                  filaments: filaments.map((f) => ({ ...f })),
                  updatedAt: Date.now(),
              }
            : p
    );
}

export function renameProfile(
    profiles: AutoPaintProfile[],
    id: string,
    name: string
): AutoPaintProfile[] {
    const trimmedName = name.trim();
    if (!trimmedName) return profiles;

    return profiles.map((p) =>
        p.id === id
            ? {
                  ...p,
                  name: trimmedName,
                  updatedAt: Date.now(),
              }
            : p
    );
}

export function deleteProfile(profiles: AutoPaintProfile[], id: string): AutoPaintProfile[] {
    return profiles.filter((p) => p.id !== id);
}

/** Check if two filament arrays are identical by color+td (order-sensitive). */
const filamentCalibrationSignature = (filament: Filament) =>
    JSON.stringify(filament.calibration ?? null);

function filamentsEqual(a: Filament[], b: Filament[]): boolean {
    if (a.length !== b.length) return false;
    return a.every(
        (af, i) =>
            af.color === b[i].color &&
            af.td === b[i].td &&
            (af.name ?? '') === (b[i].name ?? '') &&
            filamentCalibrationSignature(af) === filamentCalibrationSignature(b[i])
    );
}

/** Derive a unique name by appending a numeric suffix if the name already exists. */
function deduplicateName(name: string, existing: AutoPaintProfile[]): string {
    const names = new Set(existing.map((p) => p.name));
    if (!names.has(name)) return name;
    let suffix = 2;
    while (names.has(`${name} (${suffix})`)) suffix++;
    return `${name} (${suffix})`;
}

export interface ImportResult {
    profiles: AutoPaintProfile[];
    imported: AutoPaintProfile[];
    skipped: string[];
    overwritten: string[];
    renamed: string[];
}

/**
 * Import one or more profiles with duplicate prevention:
 * - ID match: overwrite existing profile
 * - Content match (different ID): skip
 * - Name match (different ID, different content): rename with numeric suffix
 */
export function importProfiles(
    existing: AutoPaintProfile[],
    incoming: AutoPaintProfile[]
): ImportResult {
    const result: ImportResult = {
        profiles: [...existing],
        imported: [],
        skipped: [],
        overwritten: [],
        renamed: [],
    };

    for (const raw of incoming) {
        // Validate required fields
        if (!raw || typeof raw.name !== 'string' || !Array.isArray(raw.filaments)) continue;

        const rawVersion = typeof raw.version === 'number' ? raw.version : 1;
        const validFilaments = sanitizeProfileFilaments(raw.filaments, rawVersion);

        const now = Date.now();
        const profile: AutoPaintProfile = {
            id: raw.id && typeof raw.id === 'string' ? raw.id : crypto.randomUUID(),
            name: raw.name,
            version: CURRENT_PROFILE_VERSION,
            filaments: validFilaments,
            createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : now,
            updatedAt: now,
        };

        // 1. ID match → overwrite
        const idMatch = result.profiles.findIndex((p) => p.id === profile.id);
        if (idMatch !== -1) {
            result.profiles[idMatch] = { ...profile, updatedAt: now };
            result.overwritten.push(profile.name);
            result.imported.push(result.profiles[idMatch]);
            continue;
        }

        // 2. Content match (same filaments) → skip
        const contentMatch = result.profiles.find((p) =>
            filamentsEqual(p.filaments, validFilaments)
        );
        if (contentMatch) {
            result.skipped.push(`${profile.name} (matches "${contentMatch.name}")`);
            continue;
        }

        // 3. Name match → rename
        const nameMatch = result.profiles.some((p) => p.name === profile.name);
        if (nameMatch) {
            profile.name = deduplicateName(profile.name, result.profiles);
            result.renamed.push(profile.name);
        }

        result.profiles.push(profile);
        result.imported.push(profile);
    }

    return result;
}

/**
 * Parse a file's JSON content into an array of profiles to import.
 * Supports both single profile objects and arrays of profiles.
 */
export function parseProfileFile(json: string): AutoPaintProfile[] | null {
    try {
        const parsed = JSON.parse(json);
        if (Array.isArray(parsed)) return parsed;
        if (parsed && typeof parsed === 'object' && Array.isArray(parsed.filaments)) {
            return [parsed as AutoPaintProfile];
        }
        return null;
    } catch {
        return null;
    }
}

/** Build an export blob for a profile. */
export function exportProfileBlob(profile: AutoPaintProfile): Blob {
    return new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json' });
}

/** Sanitize a name for use as a filename. */
export function profileFileName(name: string): string {
    return `${name.replace(/[^a-zA-Z0-9_-]/g, '_')}.kfil`;
}
