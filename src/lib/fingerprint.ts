const FNV64_OFFSET = 0xcbf29ce484222325n;
const FNV64_PRIME = 0x100000001b3n;
const FNV64_MASK = 0xffffffffffffffffn;

/** Deterministic, browser-safe 64-bit fingerprint for cache and integrity keys. */
export function stableHash64(value: string): string {
    let hash = FNV64_OFFSET;

    for (let index = 0; index < value.length; index++) {
        hash ^= BigInt(value.charCodeAt(index));
        hash = (hash * FNV64_PRIME) & FNV64_MASK;
    }

    return hash.toString(16).padStart(16, '0');
}

export function fingerprintJson(prefix: string, value: unknown): string {
    return `${prefix}-${stableHash64(JSON.stringify(value))}`;
}
