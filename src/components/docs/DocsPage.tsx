import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { docs, defaultDocSlug } from '@/docs';
import type { DocLinkTarget, DocRecord, TocEntry } from '@/types/docs';
import { applyDocSeo } from '@/lib/seo';
import { buildDocsPath, parseDocsLocation } from '@/lib/docs/navigation';
import MarkdownRenderer from './MarkdownRenderer';

function getInitialTarget(): DocLinkTarget {
    if (typeof window === 'undefined') return { docSlug: defaultDocSlug };
    return parseDocsLocation(window.location) ?? { docSlug: defaultDocSlug };
}

function findDoc(slug: string): DocRecord {
    const doc = docs.find((entry) => entry.meta.slug === slug) ?? docs[0];
    if (!doc) {
        throw new Error('No documentation files were bundled.');
    }
    return doc;
}

function tocIndent(entry: TocEntry) {
    return Math.max(0, entry.depth - 1) * 12;
}

const DOC_NAV_GROUPS = [
    {
        id: 'start-here',
        label: 'Start Here',
        nested: false,
        slugs: ['overview', 'quick-start'],
    },
    {
        id: 'workflow',
        label: 'Workflow',
        nested: true,
        slugs: [
            'loading-images',
            'reducing-colors',
            'dedithering-cleanup',
            '3d-mode',
            'generating-exporting-output',
        ],
    },
    {
        id: 'reference',
        label: 'Reference',
        nested: false,
        slugs: ['settings-and-controls', 'troubleshooting', 'faq'],
    },
] as const;

export default function DocsPage() {
    const initialTarget = useMemo(getInitialTarget, []);
    const [activeDocSlug, setActiveDocSlug] = useState(initialTarget.docSlug);
    const [pendingHeading, setPendingHeading] = useState(initialTarget.headingSlug);
    const [activeHeading, setActiveHeading] = useState(initialTarget.headingSlug);
    const scrollRef = useRef<HTMLElement | null>(null);

    const activeDoc = findDoc(activeDocSlug);

    const navigate = useCallback((target: DocLinkTarget) => {
        const nextDoc = findDoc(target.docSlug);
        setActiveDocSlug(nextDoc.meta.slug);
        setPendingHeading(target.headingSlug);
        setActiveHeading(target.headingSlug);
        window.history.pushState(null, '', buildDocsPath(nextDoc.meta.slug, target.headingSlug));
    }, []);

    useEffect(() => {
        const onLocationChange = () => {
            const target = parseDocsLocation(window.location);
            if (!target) return;
            const nextDoc = findDoc(target.docSlug);
            setActiveDocSlug(nextDoc.meta.slug);
            setPendingHeading(target.headingSlug);
            setActiveHeading(target.headingSlug);
        };
        window.addEventListener('hashchange', onLocationChange);
        window.addEventListener('popstate', onLocationChange);
        return () => {
            window.removeEventListener('hashchange', onLocationChange);
            window.removeEventListener('popstate', onLocationChange);
        };
    }, []);

    useEffect(() => {
        applyDocSeo(activeDoc);
    }, [activeDoc]);

    useEffect(() => {
        const scrollElement = scrollRef.current;
        if (!scrollElement) return;

        window.setTimeout(() => {
            if (pendingHeading) {
                const heading = document.getElementById(pendingHeading);
                if (heading) {
                    heading.scrollIntoView({ block: 'start' });
                    return;
                }
            }
            scrollElement.scrollTo({ top: 0 });
        }, 0);
    }, [activeDoc.meta.slug, pendingHeading]);

    useEffect(() => {
        const root = scrollRef.current;
        if (!root || activeDoc.toc.length === 0) return;

        const headings = activeDoc.toc
            .map((entry) => document.getElementById(entry.id))
            .filter((element): element is HTMLElement => element !== null);
        if (headings.length === 0) return;

        const observer = new IntersectionObserver(
            (entries) => {
                const visible = entries
                    .filter((entry) => entry.isIntersecting)
                    .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
                if (visible[0]?.target.id) {
                    setActiveHeading(visible[0].target.id);
                }
            },
            {
                root,
                rootMargin: '0px 0px -65% 0px',
                threshold: [0, 1],
            }
        );

        headings.forEach((heading) => observer.observe(heading));
        return () => observer.disconnect();
    }, [activeDoc]);

    return (
        <div className="flex h-full min-h-0 w-full flex-col bg-background text-foreground lg:flex-row">
            <nav
                aria-label="Documentation"
                className="max-h-48 flex-shrink-0 overflow-y-auto border-b border-border bg-card/70 px-4 py-4 lg:max-h-none lg:w-72 lg:border-b-0 lg:border-r"
            >
                <div className="mb-3">
                    <h2 className="text-sm font-semibold text-foreground">Contents</h2>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        User guide for turning images into printable color layers.
                    </p>
                </div>
                <div className="space-y-5">
                    {DOC_NAV_GROUPS.map((group) => {
                        const groupDocs = group.slugs
                            .map((slug) => docs.find((doc) => doc.meta.slug === slug))
                            .filter((doc): doc is DocRecord => doc !== undefined);
                        if (groupDocs.length === 0) return null;

                        return (
                            <section key={group.id} aria-labelledby={`docs-nav-${group.id}`}>
                                <h3
                                    id={`docs-nav-${group.id}`}
                                    className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                                >
                                    {group.label}
                                </h3>
                                <ul
                                    className={
                                        group.nested
                                            ? 'ml-2 space-y-1 border-l border-border pl-3'
                                            : 'space-y-1'
                                    }
                                >
                                    {groupDocs.map((doc) => {
                                        const selected = doc.meta.slug === activeDoc.meta.slug;
                                        return (
                                            <li key={doc.meta.slug}>
                                                <a
                                                    href={buildDocsPath(doc.meta.slug)}
                                                    onClick={(event) => {
                                                        event.preventDefault();
                                                        navigate({ docSlug: doc.meta.slug });
                                                    }}
                                                    className={`block border-l-2 px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                                                        selected
                                                            ? 'border-primary bg-muted text-foreground'
                                                            : 'border-transparent text-foreground hover:border-border hover:bg-muted/60'
                                                    }`}
                                                    aria-current={selected ? 'page' : undefined}
                                                >
                                                    <span
                                                        className={`block text-sm font-semibold ${
                                                            selected ? 'text-primary' : 'text-foreground'
                                                        }`}
                                                    >
                                                        {doc.meta.title}
                                                    </span>
                                                    {doc.meta.description && (
                                                        <span
                                                            className={`mt-1 block text-xs leading-5 ${
                                                                selected
                                                                    ? 'text-foreground/80'
                                                                    : 'text-muted-foreground'
                                                            }`}
                                                        >
                                                            {doc.meta.description}
                                                        </span>
                                                    )}
                                                </a>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </section>
                        );
                    })}
                </div>
            </nav>

            <main ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto" tabIndex={-1}>
                <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
                    <MarkdownRenderer
                        doc={activeDoc}
                        docs={docs}
                        activeHeading={activeHeading}
                        onNavigate={navigate}
                    />
                </div>
            </main>

            <aside className="max-h-44 flex-shrink-0 overflow-y-auto border-t border-border bg-card/70 px-4 py-4 lg:max-h-none lg:w-64 lg:border-l lg:border-t-0">
                <nav aria-label="Current document headings">
                    <h2 className="text-sm font-semibold text-foreground">On This Page</h2>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        Headings inside{' '}
                        <span className="font-semibold">{activeDoc.meta.title}</span>.
                    </p>
                    <div className="mt-3 space-y-1">
                        {activeDoc.toc.map((entry) => {
                            const selected = entry.id === activeHeading;
                            return (
                                <a
                                    key={entry.id}
                                    href={buildDocsPath(activeDoc.meta.slug, entry.id)}
                                    onClick={(event) => {
                                        event.preventDefault();
                                        navigate({
                                            docSlug: activeDoc.meta.slug,
                                            headingSlug: entry.id,
                                        });
                                    }}
                                    className={`block rounded-md px-2 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                                        selected
                                            ? 'bg-primary/10 text-primary'
                                            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                                    }`}
                                    style={{ paddingLeft: `${8 + tocIndent(entry)}px` }}
                                    aria-current={selected ? 'location' : undefined}
                                >
                                    {entry.title}
                                </a>
                            );
                        })}
                    </div>
                </nav>
            </aside>
        </div>
    );
}
