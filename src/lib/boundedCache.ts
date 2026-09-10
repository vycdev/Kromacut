/**
 * Small insertion-ordered cache with a strict retained-entry ceiling.
 *
 * Reads deliberately do not refresh insertion order. That keeps eviction
 * deterministic and avoids an extra delete/set pair on every hot-path lookup.
 */
export class BoundedCache<K, V> {
    private readonly entries = new Map<K, V>();
    readonly maxEntries: number;

    constructor(maxEntries: number) {
        this.maxEntries = Math.max(0, Math.floor(maxEntries));
    }

    get(key: K): V | undefined {
        return this.entries.get(key);
    }

    has(key: K): boolean {
        return this.entries.has(key);
    }

    set(key: K, value: V): void {
        if (this.maxEntries === 0) return;
        if (!this.entries.has(key) && this.entries.size >= this.maxEntries) {
            const oldest = this.entries.keys().next();
            if (!oldest.done) this.entries.delete(oldest.value);
        }
        this.entries.set(key, value);
    }

    clear(): void {
        this.entries.clear();
    }

    get size(): number {
        return this.entries.size;
    }
}
