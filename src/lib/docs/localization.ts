import type { DocRecord, MarkdownBlock } from '../../types/docs.ts';

/** Keep public anchors canonical even when a heading uses another writing system. */
export function preserveCanonicalDocAnchors(
    canonical: DocRecord,
    translated: DocRecord
): DocRecord {
    if (
        canonical.meta.slug !== translated.meta.slug ||
        canonical.toc.length !== translated.toc.length
    ) {
        throw new Error(`Incompatible translated document: ${canonical.meta.slug}`);
    }
    const ids = new Map<string, string>();
    const toc = translated.toc.map((heading, index) => {
        const original = canonical.toc[index];
        if (heading.depth !== original.depth) {
            throw new Error(`Incompatible translated heading: ${canonical.meta.slug}/${index}`);
        }
        ids.set(heading.id, original.id);
        return { ...heading, id: original.id };
    });
    const mapBlocks = (blocks: MarkdownBlock[]): MarkdownBlock[] =>
        blocks.map((block) => {
            if (block.type === 'heading') return { ...block, id: ids.get(block.id) ?? block.id };
            if (block.type === 'blockquote') return { ...block, blocks: mapBlocks(block.blocks) };
            if (block.type === 'list')
                return {
                    ...block,
                    items: block.items.map((item) => ({ ...item, nested: mapBlocks(item.nested) })),
                };
            return block;
        });
    return {
        ...translated,
        meta: { ...translated.meta, order: canonical.meta.order },
        toc,
        blocks: mapBlocks(translated.blocks),
    };
}
