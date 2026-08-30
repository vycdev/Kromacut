import type { Filament } from '../types';
import {
    fingerprintCompletedAppearanceEvidence,
    sanitizeAppearanceProfile,
    serializeAppearanceProfile,
    type AppearanceProfileV1,
} from './appearanceProfile.ts';
import { FRONTLIT_TD_SCALE, sanitizeFrontlitCalibration } from './calibration.ts';
import { normalizeHexColor } from './colorUtils.ts';
import { deduplicateName } from './nameUtils.ts';
import { isTemplateProfileId } from './reservedIds.ts';

export interface AutoPaintProfile {
    id: string;
    name: string;
    version: number;
    filaments: Filament[];
    appearance?: AppearanceProfileV1;
    createdAt: number;
    updatedAt: number;
}

/**
 * Profile schema versions:
 * - v1: uncalibrated `td` stored on the conventional backlit TD scale (~1–6 mm)
 *   and scaled ×0.1 at simulation time.
 * - v2: `td` always stores the frontlit hiding distance (mm) directly, for
 *   calibrated and uncalibrated filaments alike.
 * - v3: optional, versioned appearance proof records and raw judgments.
 */
export const CURRENT_PROFILE_VERSION = 3;

/** Schema version that introduced hiding-distance td storage. The td migration
 *  applies to profiles below this version only — never re-gate it on
 *  CURRENT_PROFILE_VERSION, or a future bump would re-scale v2 profiles. */
export const TD_MIGRATION_VERSION = 2;

const PROFILES_STORAGE_KEY = 'kromacut.autopaint.profiles';
const LAST_PROFILE_KEY = 'kromacut.autopaint.lastProfileId';

let cachedProfilesRaw: string | null | undefined;
let cachedProfiles: AutoPaintProfile[] | undefined;

function rememberProfiles(raw: string | null, profiles: AutoPaintProfile[]): AutoPaintProfile[] {
    cachedProfilesRaw = raw;
    cachedProfiles = profiles;
    return profiles;
}

function conventionalTdToFrontlit(td: number): number {
    return Math.round(td * FRONTLIT_TD_SCALE * 1e4) / 1e4;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object';
}

function hasDuplicateFilamentIds(filaments: readonly unknown[]): boolean {
    const ids = new Set<string>();
    for (const filament of filaments) {
        if (!isRecord(filament) || typeof filament.id !== 'string') continue;
        if (ids.has(filament.id)) return true;
        ids.add(filament.id);
    }
    return false;
}

function reserveUniqueFilamentId(preferredId: string, usedIds: Set<string>): string {
    let id = preferredId;
    let suffix = 2;
    while (usedIds.has(id)) id = `${preferredId}-${suffix++}`;
    usedIds.add(id);
    return id;
}

/**
 * Repair legacy working-state collisions without dropping either filament.
 * Profile imports use stricter rejection because their ids can own appearance
 * evidence; the standalone working list can safely retain rows under new ids.
 */
export function repairDuplicateFilamentIds(filaments: readonly Filament[]): Filament[] {
    const usedIds = new Set<string>();
    return filaments.map((filament) => {
        const id = reserveUniqueFilamentId(filament.id, usedIds);
        return id === filament.id ? filament : { ...filament, id };
    });
}

export function sanitizeProfileFilament(value: unknown): Filament | null {
    if (!isRecord(value)) return null;
    if (
        typeof value.id !== 'string' ||
        typeof value.color !== 'string' ||
        typeof value.td !== 'number' ||
        !Number.isFinite(value.td) ||
        value.td <= 0
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
    return { ...filament, td: conventionalTdToFrontlit(filament.td) };
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
    const hadDuplicateFilamentIds = hasDuplicateFilamentIds(value.filaments);
    const version = typeof value.version === 'number' ? value.version : 1;
    const now = Date.now();
    const sanitizedFilaments = sanitizeProfileFilaments(value.filaments, version);
    const profile: AutoPaintProfile = {
        // A reserved template id in storage would shadow the built-in template
        // and be undeletable — re-assign such profiles a fresh user id.
        id: isTemplateProfileId(value.id) ? crypto.randomUUID() : value.id,
        name: value.name,
        version: CURRENT_PROFILE_VERSION,
        filaments: hadDuplicateFilamentIds
            ? repairDuplicateFilamentIds(sanitizedFilaments)
            : sanitizedFilaments,
        createdAt: typeof value.createdAt === 'number' ? value.createdAt : now,
        updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : now,
    };
    // Duplicate ids make profile-level proof/matrix foreign keys ambiguous.
    // Preserve every filament row but intentionally discard only that evidence.
    if (!hadDuplicateFilamentIds) {
        const appearance = sanitizeAppearanceProfile(value.appearance);
        if (appearance) profile.appearance = appearance;
    }
    return profile;
}

export function loadProfiles(): AutoPaintProfile[] {
    try {
        const raw = localStorage.getItem(PROFILES_STORAGE_KEY);
        if (raw === cachedProfilesRaw && cachedProfiles) return cachedProfiles;
        if (!raw) return rememberProfiles(raw, []);
        const parsed = JSON.parse(raw) as AutoPaintProfile[];
        if (!Array.isArray(parsed)) return rememberProfiles(raw, []);
        const hadReservedId = parsed.some(
            (p) => p && typeof p.id === 'string' && isTemplateProfileId(p.id)
        );
        const hadDuplicateFilamentIds = parsed.some(
            (profile) =>
                isRecord(profile) &&
                Array.isArray(profile.filaments) &&
                hasDuplicateFilamentIds(profile.filaments)
        );
        const reassignedProfileIds = new Map<string, string>();
        const profiles = parsed
            .map((profile) => {
                const sanitized = sanitizeProfile(profile);
                if (
                    sanitized &&
                    isRecord(profile) &&
                    typeof profile.id === 'string' &&
                    sanitized.id !== profile.id &&
                    !reassignedProfileIds.has(profile.id)
                ) {
                    // Preserve the profile that a duplicated id resolved to
                    // before migration: callers search stored profiles in
                    // array order, so the first matching profile wins.
                    reassignedProfileIds.set(profile.id, sanitized.id);
                }
                return sanitized;
            })
            .filter((profile): profile is AutoPaintProfile => profile !== null);
        // Persist re-assigned template ids and repaired duplicate filament ids
        // so both migrations stay stable across reloads.
        const migrated = hadReservedId || hadDuplicateFilamentIds;
        const migrationPersisted = migrated && saveProfilesToStorage(profiles);
        if (migrationPersisted) {
            const lastProfileId = loadLastProfileId();
            const reassignedLastProfileId = lastProfileId
                ? reassignedProfileIds.get(lastProfileId)
                : undefined;
            if (reassignedLastProfileId) saveLastProfileId(reassignedLastProfileId);
        }
        return rememberProfiles(migrationPersisted ? JSON.stringify(profiles) : raw, profiles);
    } catch {
        return [];
    }
}

/**
 * Parse and prepare saved calibration data while the 2D workspace is idle.
 * This keeps a large profile's first completed-evidence fingerprint out of the
 * synchronous render that opens the 3D controls.
 */
export function prewarmAutoPaintProfiles(): void {
    const profiles = loadProfiles();
    const activeProfileId = loadLastProfileId();
    const activeProfile = profiles.find((profile) => profile.id === activeProfileId);
    if (activeProfile) {
        fingerprintCompletedAppearanceEvidence(activeProfile.appearance);
        serializeAppearanceProfile(activeProfile.appearance);
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

export function saveProfilesToStorage(profiles: AutoPaintProfile[]): boolean {
    try {
        if (profiles.some((profile) => hasDuplicateFilamentIds(profile.filaments))) return false;
        const raw = JSON.stringify(profiles);
        localStorage.setItem(PROFILES_STORAGE_KEY, raw);
        rememberProfiles(raw, profiles);
        return true;
    } catch {
        return false;
    }
}

export function createProfile(name: string, filaments: Filament[]): AutoPaintProfile {
    const now = Date.now();
    return {
        id: crypto.randomUUID(),
        name: name.trim(),
        version: CURRENT_PROFILE_VERSION,
        filaments: repairDuplicateFilamentIds(filaments).map((f) => ({ ...f })),
        createdAt: now,
        updatedAt: now,
    };
}

/** Build the exact profile payload exported by the UI without attaching stale appearance evidence. */
export function buildProfileExportSnapshot(
    active: AutoPaintProfile | undefined,
    filaments: readonly Filament[],
    isDirty: boolean
): AutoPaintProfile {
    if (active && !isTemplateProfileId(active.id) && !isDirty) {
        return {
            ...active,
            filaments: filaments.map((filament) => ({ ...filament })),
            updatedAt: Date.now(),
        };
    }
    const name =
        active && !isTemplateProfileId(active.id) && isDirty
            ? `${active.name} (unsaved edits)`
            : (active?.name ?? 'Exported Profile');
    return createProfile(
        name,
        filaments.map((filament) => ({ ...filament }))
    );
}

export function overwriteProfile(
    profiles: AutoPaintProfile[],
    id: string,
    filaments: Filament[]
): AutoPaintProfile[] {
    const hadDuplicateFilamentIds = hasDuplicateFilamentIds(filaments);
    const repairedFilaments = repairDuplicateFilamentIds(filaments);
    return profiles.map((profile) => {
        if (profile.id !== id) return profile;
        const updated: AutoPaintProfile = {
            ...profile,
            filaments: repairedFilaments.map((filament) => ({ ...filament })),
            updatedAt: Date.now(),
        };
        if (hadDuplicateFilamentIds) delete updated.appearance;
        return updated;
    });
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

/** Check if two filament arrays have identical persisted profile data (order-sensitive). */
const filamentCalibrationSignature = (filament: Filament) =>
    JSON.stringify(filament.calibration ?? null);

export function profileFilamentsEqual(a: Filament[], b: Filament[]): boolean {
    if (a.length !== b.length) return false;
    return a.every(
        (af, i) =>
            af.id === b[i].id &&
            af.color === b[i].color &&
            af.td === b[i].td &&
            (af.name ?? '') === (b[i].name ?? '') &&
            (af.brand ?? '') === (b[i].brand ?? '') &&
            filamentCalibrationSignature(af) === filamentCalibrationSignature(b[i])
    );
}

function appearanceEqual(
    a: AppearanceProfileV1 | undefined,
    b: AppearanceProfileV1 | undefined
): boolean {
    return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function appearanceHasEvidence(appearance: AppearanceProfileV1 | undefined): boolean {
    return Boolean(
        appearance &&
        (appearance.proofs.length > 0 ||
            appearance.viewingSessions.length > 0 ||
            appearance.targetJudgments.length > 0 ||
            (appearance.stackMatrices?.length ?? 0) > 0)
    );
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
 *
 * Ids in `reservedIds` (built-in template ids) are never accepted from a
 * file; such profiles get a fresh UUID instead.
 */
export function importProfiles(
    existing: AutoPaintProfile[],
    incoming: AutoPaintProfile[],
    reservedIds?: Set<string>
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
        if (hasDuplicateFilamentIds(raw.filaments)) {
            result.skipped.push(`${raw.name} (duplicate filament ids)`);
            continue;
        }

        const rawVersion = typeof raw.version === 'number' ? raw.version : 1;
        const validFilaments = sanitizeProfileFilaments(raw.filaments, rawVersion);

        const now = Date.now();
        const profile: AutoPaintProfile = {
            id:
                raw.id &&
                typeof raw.id === 'string' &&
                !reservedIds?.has(raw.id) &&
                !isTemplateProfileId(raw.id)
                    ? raw.id
                    : crypto.randomUUID(),
            name: raw.name,
            version: CURRENT_PROFILE_VERSION,
            filaments: validFilaments,
            createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : now,
            updatedAt: now,
        };
        const appearance = sanitizeAppearanceProfile(raw.appearance);
        if (appearance) profile.appearance = appearance;

        // A same-id file without usable appearance data must not erase newer
        // Palette Proof or Stack Matrix evidence. Import it as a separate copy;
        // the name collision path below will make the fork visible to the user.
        const collidingProfile = result.profiles.find((candidate) => candidate.id === profile.id);
        if (
            appearanceHasEvidence(collidingProfile?.appearance) &&
            !appearanceHasEvidence(profile.appearance)
        ) {
            profile.id = crypto.randomUUID();
        }

        // 1. ID match → overwrite
        const idMatch = result.profiles.findIndex((p) => p.id === profile.id);
        if (idMatch !== -1) {
            result.profiles[idMatch] = { ...profile, updatedAt: now };
            result.overwritten.push(profile.name);
            result.imported.push(result.profiles[idMatch]);
            continue;
        }

        // 2. Content match (same filaments) → skip
        const contentMatch = result.profiles.find(
            (p) =>
                profileFilamentsEqual(p.filaments, validFilaments) &&
                appearanceEqual(p.appearance, appearance)
        );
        if (contentMatch) {
            result.skipped.push(`${profile.name} (matches "${contentMatch.name}")`);
            continue;
        }

        // 3. Name match → rename
        const nameMatch = result.profiles.some((p) => p.name === profile.name);
        if (nameMatch) {
            profile.name = deduplicateName(
                profile.name,
                result.profiles.map((p) => p.name)
            );
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

/** Infer delimiter from the header line: tab if tabs are present, otherwise comma. */
function detectDelimiter(headerLine: string): ',' | '\t' {
    return headerLine.includes('\t') ? '\t' : ',';
}

/**
 * Parse a CSV/TSV string into rows of fields per RFC 4180: handles embedded
 * commas, "" escaped quotes, and newlines inside quoted fields.
 */
function parseCSV(content: string, delimiter: ',' | '\t'): string[][] {
    const rows: string[][] = [];
    let fields: string[] = [];
    let field = '';
    let pos = 0;
    const len = content.length;

    while (pos <= len) {
        if (pos === len) {
            fields.push(field);
            if (fields.some((f) => f.trim())) rows.push(fields);
            break;
        }

        const ch = content[pos];

        if (ch === '"') {
            pos++;
            for (;;) {
                if (pos >= len) break; // unclosed quote at EOF — accept what we have
                if (content[pos] === '"') {
                    if (pos + 1 < len && content[pos + 1] === '"') {
                        field += '"';
                        pos += 2;
                    } else {
                        pos++; // closing quote
                        break;
                    }
                } else {
                    field += content[pos++];
                }
            }
        } else if (ch === delimiter) {
            fields.push(field);
            field = '';
            pos++;
        } else if (ch === '\r') {
            pos++;
            if (pos < len && content[pos] === '\n') pos++;
            fields.push(field);
            field = '';
            if (fields.some((f) => f.trim())) rows.push(fields);
            fields = [];
        } else if (ch === '\n') {
            fields.push(field);
            field = '';
            if (fields.some((f) => f.trim())) rows.push(fields);
            fields = [];
            pos++;
        } else {
            field += ch;
            pos++;
        }
    }

    return rows;
}

/**
 * Parse a HueForge spool library CSV or TSV into a single AutoPaint profile.
 *
 * Accepts comma-separated (CSV) or tab-separated (TSV) input — detected from
 * the header row. Column order is flexible. Required columns: Color (hex),
 * TD (float). Optional: Brand, Name, Uuid.
 *
 * Quoted fields with embedded commas, newlines, and "" escaped quotes are
 * supported per RFC 4180. Rows missing Color or TD are skipped.
 *
 * A leading UTF-8 byte-order mark (U+FEFF), often added by spreadsheet
 * tools such as Excel when saving CSV/TSV, is stripped before parsing so it
 * doesn't get glued onto the first header name (e.g. "\uFEFFColor"), which
 * would otherwise make every row's Color column look missing.
 *
 * Returns null if the input has no header, no valid data rows, or cannot be
 * parsed.
 */
export function parseHueForgeCSV(
    csv: string,
    profileName = 'HueForge Import'
): AutoPaintProfile[] | null {
    if (csv.charCodeAt(0) === 0xfeff) csv = csv.slice(1);

    const firstNewline = csv.indexOf('\n');
    const headerLine = firstNewline >= 0 ? csv.slice(0, firstNewline) : csv;
    const delimiter = detectDelimiter(headerLine);
    const rows = parseCSV(csv, delimiter);
    if (rows.length < 2) return null;

    const headers = rows[0].map((h) => h.trim());

    const col = (row: string[], name: string) => {
        const i = headers.indexOf(name);
        return i >= 0 ? (row[i]?.trim() ?? '') : '';
    };

    const filaments: import('../types').Filament[] = [];
    const usedFilamentIds = new Set<string>();
    for (const row of rows.slice(1)) {
        const colorRaw = col(row, 'Color');
        const color = normalizeHexColor(colorRaw, '');
        const tdRaw = col(row, 'TD');
        const conventionalTd = Number(tdRaw);
        if (
            !color ||
            !Number.isFinite(conventionalTd) ||
            conventionalTd < 0.5 ||
            conventionalTd > 10.0
        ) {
            continue;
        }

        const rawId = col(row, 'Uuid').replace(/[{}]/g, '');
        // HueForge libraries contain no Kromacut appearance evidence, so keep
        // every valid spool row while deterministically disambiguating repeated
        // UUIDs. This also keeps React keys and all downstream filament maps unique.
        const id = reserveUniqueFilamentId(rawId || crypto.randomUUID(), usedFilamentIds);
        const colorName = col(row, 'Name');
        const brand = col(row, 'Brand') || undefined;
        const name = brand && colorName ? `${brand}-${colorName}-${color}` : colorName || undefined;

        filaments.push({ id, color, td: conventionalTdToFrontlit(conventionalTd), name, brand });
    }

    if (filaments.length === 0) return null;

    const now = Date.now();
    return [
        {
            id: crypto.randomUUID(),
            name: profileName,
            version: CURRENT_PROFILE_VERSION,
            filaments,
            createdAt: now,
            updatedAt: now,
        },
    ];
}

/** Build an export blob for a profile. */
export function exportProfileBlob(profile: AutoPaintProfile): Blob {
    return new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json' });
}

/** Sanitize a name for use as a filename. */
export function profileFileName(name: string): string {
    return `${name.replace(/[^a-zA-Z0-9_-]/g, '_')}.kfil`;
}
