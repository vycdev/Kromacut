interface PaletteProofGroupRecord {
    id: string;
    exportedAt: string;
    proof: {
        targetColorMode?: 'original' | 'fitted';
        targetSetMappingIds?: readonly string[];
        columns: readonly { targetMappingId: string }[];
    };
}

export interface PaletteProofTargetGroup<T extends PaletteProofGroupRecord> {
    key: string;
    number: number;
    records: readonly T[];
}

export function paletteProofTargetSetKey(proof: PaletteProofGroupRecord['proof']): string {
    return JSON.stringify({
        mode: proof.targetColorMode ?? 'original',
        targets: [
            ...(proof.targetSetMappingIds ??
                proof.columns.map((column) => column.targetMappingId)),
        ].sort((left, right) => left.localeCompare(right)),
    });
}

export function groupPaletteProofRecords<T extends PaletteProofGroupRecord>(
    records: readonly T[]
): PaletteProofTargetGroup<T>[] {
    const groups: Array<{ key: string; records: T[] }> = [];
    const groupsByKey = new Map<string, { key: string; records: T[] }>();
    const chronological = [...records].sort(
        (left, right) =>
            left.exportedAt.localeCompare(right.exportedAt) || left.id.localeCompare(right.id)
    );

    for (const record of chronological) {
        const key = paletteProofTargetSetKey(record.proof);
        let group = groupsByKey.get(key);
        if (!group) {
            group = { key, records: [] };
            groupsByKey.set(key, group);
            groups.push(group);
        }
        group.records.push(record);
    }

    return groups.map((group, index) => ({
        key: group.key,
        number: index + 1,
        records: group.records,
    }));
}
