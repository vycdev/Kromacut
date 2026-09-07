/**
 * Shared naming helpers for user-managed collections (palettes, profiles).
 */

/** Derive a unique name by appending a numeric suffix if the name already exists. */
export function deduplicateName(name: string, existingNames: Iterable<string>): string {
    const names = new Set(existingNames);
    if (!names.has(name)) return name;
    let suffix = 2;
    while (names.has(`${name} (${suffix})`)) suffix++;
    return `${name} (${suffix})`;
}
