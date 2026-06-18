import { createElement } from 'react';
import type {
    DocLinkTarget,
    MarkdownBlock,
    MarkdownInlineNode,
    MarkdownListItem,
    MarkdownRendererProps,
} from '@/types/docs';
import { resolveDocAsset } from '@/docs/assets';
import { buildDocsPath, isSafeExternalHref, resolveDocHref } from '@/lib/docs/navigation';

function linkClassName() {
    return 'font-semibold text-primary underline underline-offset-4 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm';
}

function renderInlineNodes(
    nodes: MarkdownInlineNode[],
    props: MarkdownRendererProps,
    keyPrefix: string
) {
    return nodes.map((node, index) => {
        const key = `${keyPrefix}-${index}`;
        if (node.type === 'text') return node.value;
        if (node.type === 'code') {
            return (
                <code
                    key={key}
                    className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.92em] text-foreground"
                >
                    {node.value}
                </code>
            );
        }
        if (node.type === 'strong') {
            return (
                <strong key={key} className="font-semibold text-foreground">
                    {renderInlineNodes(node.children, props, key)}
                </strong>
            );
        }
        if (node.type === 'emphasis') {
            return <em key={key}>{renderInlineNodes(node.children, props, key)}</em>;
        }
        if (node.type === 'image') {
            const src = resolveDocAsset(node.src);
            if (!src) {
                return (
                    <span key={key} className="text-sm text-muted-foreground">
                        {node.alt || node.src}
                    </span>
                );
            }
            return (
                <img
                    key={key}
                    src={src}
                    alt={node.alt}
                    title={node.title}
                    loading="lazy"
                    className="my-4 max-h-80 rounded-md border border-border object-contain"
                />
            );
        }

        const target = resolveDocHref(node.href, props.doc.meta.slug, props.docs);
        if (target) {
            return (
                <a
                    key={key}
                    href={buildDocsPath(target.docSlug, target.headingSlug)}
                    onClick={(event) => {
                        event.preventDefault();
                        props.onNavigate(target);
                    }}
                    className={linkClassName()}
                >
                    {renderInlineNodes(node.children, props, key)}
                </a>
            );
        }

        if (isSafeExternalHref(node.href)) {
            return (
                <a
                    key={key}
                    href={node.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={linkClassName()}
                >
                    {renderInlineNodes(node.children, props, key)}
                </a>
            );
        }

        return <span key={key}>{renderInlineNodes(node.children, props, key)}</span>;
    });
}

function renderListItem(item: MarkdownListItem, props: MarkdownRendererProps, key: string) {
    return (
        <li key={key} className="pl-1">
            <span>{renderInlineNodes(item.children, props, `${key}-inline`)}</span>
            {item.nested.map((block, index) => renderBlock(block, props, `${key}-nested-${index}`))}
        </li>
    );
}

function headingClassName(depth: number) {
    const base =
        'group scroll-mt-6 font-semibold tracking-normal text-foreground transition-colors';

    if (depth === 1) return `${base} text-3xl sm:text-4xl mb-4`;
    if (depth === 2) return `${base} text-2xl mt-10 mb-3 border-b border-border pb-2`;
    if (depth === 3) return `${base} text-xl mt-8 mb-2`;
    return `${base} text-base mt-6 mb-2`;
}

function renderHeading(
    block: Extract<MarkdownBlock, { type: 'heading' }>,
    props: MarkdownRendererProps
) {
    const target: DocLinkTarget = { docSlug: props.doc.meta.slug, headingSlug: block.id };
    const level = Math.min(6, Math.max(1, block.depth));

    return createElement(
        `h${level}`,
        {
            id: block.id,
            className: headingClassName(level),
        },
        <>
            <span>{renderInlineNodes(block.children, props, `heading-${block.id}`)}</span>
            <a
                href={buildDocsPath(target.docSlug, target.headingSlug)}
                onClick={(event) => {
                    event.preventDefault();
                    props.onNavigate(target);
                }}
                className="ml-2 text-primary opacity-0 transition-opacity hover:text-primary/80 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background group-hover:opacity-70"
                aria-label={`Link to ${block.text}`}
            >
                #
            </a>
        </>
    );
}

function renderBlock(block: MarkdownBlock, props: MarkdownRendererProps, key: string) {
    if (block.type === 'heading') {
        return <div key={key}>{renderHeading(block, props)}</div>;
    }
    if (block.type === 'paragraph') {
        return (
            <p key={key} className="my-4 leading-7 text-foreground/90">
                {renderInlineNodes(block.children, props, key)}
            </p>
        );
    }
    if (block.type === 'blockquote') {
        return (
            <blockquote
                key={key}
                className="my-6 border-l-4 border-primary/60 bg-primary/5 py-2 pl-4 text-foreground/90"
            >
                {block.blocks.map((child, index) => renderBlock(child, props, `${key}-${index}`))}
            </blockquote>
        );
    }
    if (block.type === 'list') {
        const ListTag = block.ordered ? 'ol' : 'ul';
        return (
            <ListTag
                key={key}
                className={`my-4 space-y-2 pl-6 leading-7 text-foreground/90 ${
                    block.ordered ? 'list-decimal' : 'list-disc'
                }`}
            >
                {block.items.map((item, index) => renderListItem(item, props, `${key}-${index}`))}
            </ListTag>
        );
    }
    if (block.type === 'code') {
        return (
            <pre
                key={key}
                className="my-5 overflow-x-auto rounded-md border border-border bg-muted p-4 text-sm"
            >
                <code className="font-mono text-foreground">{block.value}</code>
            </pre>
        );
    }
    if (block.type === 'table') {
        return (
            <div key={key} className="my-6 overflow-x-auto rounded-md border border-border">
                <table className="w-full border-collapse text-left text-sm">
                    <thead className="bg-muted text-foreground">
                        <tr>
                            {block.headers.map((header, index) => (
                                <th
                                    key={`${key}-head-${index}`}
                                    className="border-b border-border px-3 py-2 font-semibold"
                                >
                                    {renderInlineNodes(header, props, `${key}-head-${index}`)}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {block.rows.map((row, rowIndex) => (
                            <tr key={`${key}-row-${rowIndex}`} className="odd:bg-muted/30">
                                {row.map((cell, cellIndex) => (
                                    <td
                                        key={`${key}-row-${rowIndex}-${cellIndex}`}
                                        className="border-b border-border/60 px-3 py-2 align-top text-foreground/90 last:border-b-0"
                                    >
                                        {renderInlineNodes(
                                            cell,
                                            props,
                                            `${key}-row-${rowIndex}-${cellIndex}`
                                        )}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    }
    return <hr key={key} className="my-8 border-border" />;
}

export default function MarkdownRenderer(props: MarkdownRendererProps) {
    return (
        <article
            aria-label={props.doc.meta.title}
            className="docs-markdown min-w-0 text-base text-foreground"
        >
            {props.doc.blocks.map((block, index) => renderBlock(block, props, `block-${index}`))}
        </article>
    );
}
