import type { Filament } from '../types';
import { normalizeHexColor } from './colorUtils.ts';

export interface AutoPaintProfile {
    id: string;
    name: string;
    version: number;
    filaments: Filament[];
    createdAt: number;
    updatedAt: number;
}

export const CURRENT_PROFILE_VERSION = 1;

const PROFILES_STORAGE_KEY = 'kromacut.autopaint.profiles';
const LAST_PROFILE_KEY = 'kromacut.autopaint.lastProfileId';

export function loadProfiles(): AutoPaintProfile[] {
    try {
        const raw = localStorage.getItem(PROFILES_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as AutoPaintProfile[];
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(
            (p) =>
                typeof p.id === 'string' && typeof p.name === 'string' && Array.isArray(p.filaments)
        );
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

        const validFilaments = raw.filaments.filter(
            (f) =>
                typeof f.id === 'string' && typeof f.color === 'string' && typeof f.td === 'number'
        );

        const now = Date.now();
        const profile: AutoPaintProfile = {
            id: raw.id && typeof raw.id === 'string' ? raw.id : crypto.randomUUID(),
            name: raw.name,
            version: typeof raw.version === 'number' ? raw.version : CURRENT_PROFILE_VERSION,
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

/** Infer delimiter from the header line: tab if tabs are present, otherwise comma. */
function detectDelimiter(headerLine: string): ',' | '\t' {
    return headerLine.includes('\t') ? '\t' : ',';
}

/**
 * Parse one CSV/TSV row into fields, handling RFC 4180 double-quoted fields
 * (commas and newlines inside quotes, "" as escaped quote).
 */
function parseRow(line: string, delimiter: ',' | '\t'): string[] {
    const fields: string[] = [];
    let pos = 0;

    while (pos <= line.length) {
        if (pos === line.length) {
            // line ended with a delimiter — trailing empty field
            fields.push('');
            break;
        }

        if (line[pos] === '"') {
            let field = '';
            pos++; // skip opening quote
            for (;;) {
                if (pos >= line.length) break; // unclosed quote — accept what we have
                if (line[pos] === '"') {
                    if (pos + 1 < line.length && line[pos + 1] === '"') {
                        field += '"';
                        pos += 2; // escaped quote ""
                    } else {
                        pos++; // closing quote
                        break;
                    }
                } else {
                    field += line[pos++];
                }
            }
            fields.push(field);
            if (pos < line.length && line[pos] === delimiter) pos++;
            if (pos === line.length) break; // last field, no trailing delimiter
        } else {
            const end = line.indexOf(delimiter, pos);
            if (end === -1) {
                fields.push(line.slice(pos));
                break;
            }
            fields.push(line.slice(pos, end));
            pos = end + 1;
            // if pos === line.length the loop continues and pushes trailing ''
        }
    }

    return fields;
}

/**
 * Parse a HueForge spool library CSV or TSV into a single AutoPaint profile.
 *
 * Accepts comma-separated (CSV) or tab-separated (TSV) input — detected from
 * the header row. Column order is flexible. Required columns: Color (hex),
 * TD (float). Optional: Brand, Name, Uuid.
 *
 * Quoted fields with embedded commas are handled per RFC 4180 ("" escapes a
 * literal quote). Rows missing Color or TD are skipped.
 *
 * Returns null if the input has no header, no valid data rows, or cannot be
 * parsed.
 */
export function parseHueForgeCSV(csv: string, profileName = 'HueForge Import'): AutoPaintProfile[] | null {
    const lines = csv.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return null;

    const delimiter = detectDelimiter(lines[0]);
    const headers = parseRow(lines[0], delimiter).map((h) => h.trim());

    const col = (row: string[], name: string) => {
        const i = headers.indexOf(name);
        return i >= 0 ? row[i]?.trim() ?? '' : '';
    };

    const filaments: import('../types').Filament[] = [];
    for (const line of lines.slice(1)) {
        const row = parseRow(line, delimiter);
        const colorRaw = col(row, 'Color');
        const color = normalizeHexColor(colorRaw, '');
        const tdRaw = col(row, 'TD');
        const td = parseFloat(tdRaw);
        if (!color || isNaN(td) || td < 0.5 || td > 10.0) continue;

        const rawId = col(row, 'Uuid').replace(/[{}]/g, '');
        const id = rawId || crypto.randomUUID();
        const colorName = col(row, 'Name');
        const brand = col(row, 'Brand') || undefined;
        const name = brand && colorName ? `${brand}-${colorName}-${color}` : colorName || undefined;

        filaments.push({ id, color, td, name, brand });
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
