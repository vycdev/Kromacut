import { Trans, useTranslation } from 'react-i18next';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { docs, defaultDocSlug } from '@/docs';
import type { DocLinkTarget, DocRecord, TocEntry } from '@/types/docs';
import { applyDocSeo } from '@/lib/seo';
import { buildDocsPath, parseDocsLocation } from '@/lib/docs/navigation';
import NotFoundPage from '@/components/NotFoundPage';
import MarkdownRenderer from './MarkdownRenderer';
import { useLocalizedDoc } from '@/hooks/useLocalizedDoc';
import { matchLanguage } from '@/lib/languagePreferences';

function getInitialTarget(): DocLinkTarget | null {
    if (typeof window === 'undefined') return { docSlug: defaultDocSlug };
    return parseDocsLocation(window.location);
}

function findDoc(slug: string | undefined): DocRecord | undefined {
    return docs.find((entry) => entry.meta.slug === slug);
}

function tocIndent(entry: TocEntry) {
    return Math.max(0, entry.depth - 1) * 12;
}

const DOC_NAV_GROUPS = [
    {
        id: 'start-here',
        label: 'docs.startHere',
        nested: false,
        slugs: ['overview', 'quick-start'],
    },
    {
        id: '3d-workflow',
        label: 'docs.printing',
        nested: true,
        slugs: [
            '3d-mode',
            'auto-paint',
            'flat-paint',
            'calibration-workflows',
            'calibration-theory',
            'generating-exporting-output',
        ],
    },
    {
        id: '2d-workflow',
        label: 'docs.preparation',
        nested: true,
        slugs: ['loading-images', 'image-adjustments', 'reducing-colors', 'dedithering-cleanup'],
    },
    {
        id: 'reference',
        label: 'docs.reference',
        nested: false,
        slugs: ['settings-and-controls', 'troubleshooting', 'faq'],
    },
] as const;

export default function DocsPage() {
    const { t, i18n } = useTranslation('public');
    const initialTarget = useMemo(getInitialTarget, []);
    const [activeDocSlug, setActiveDocSlug] = useState(initialTarget?.docSlug);
    const [pendingHeading, setPendingHeading] = useState(initialTarget?.headingSlug);
    const [activeHeading, setActiveHeading] = useState(initialTarget?.headingSlug);
    const [contentsOpen, setContentsOpen] = useState(false);
    const [headingsOpen, setHeadingsOpen] = useState(false);
    const scrollRef = useRef<HTMLElement | null>(null);

    const canonical = findDoc(activeDocSlug);
    const {
        doc: activeDoc,
        failed,
        retry,
    } = useLocalizedDoc(canonical, matchLanguage(i18n.resolvedLanguage) ?? 'en');
    const localizedDocs = useMemo<DocRecord[]>(
        () =>
            docs.map((doc) => ({
                ...doc,
                meta: {
                    ...doc.meta,
                    title: t(`docsMeta:${doc.meta.slug}.title`),
                    description: t(`docsMeta:${doc.meta.slug}.description`),
                },
            })),
        [t]
    );

    const navigate = useCallback((target: DocLinkTarget) => {
        setActiveDocSlug(target.docSlug);
        setPendingHeading(target.headingSlug);
        setActiveHeading(target.headingSlug);
        setContentsOpen(false);
        setHeadingsOpen(false);
        window.history.pushState(null, '', buildDocsPath(target.docSlug, target.headingSlug));
    }, []);

    useEffect(() => {
        const onLocationChange = () => {
            const target = parseDocsLocation(window.location);
            setActiveDocSlug(target?.docSlug);
            setPendingHeading(target?.headingSlug);
            setActiveHeading(target?.headingSlug);
            setContentsOpen(false);
            setHeadingsOpen(false);
        };
        window.addEventListener('hashchange', onLocationChange);
        window.addEventListener('popstate', onLocationChange);
        return () => {
            window.removeEventListener('hashchange', onLocationChange);
            window.removeEventListener('popstate', onLocationChange);
        };
    }, []);

    useEffect(() => {
        if (activeDoc) applyDocSeo(activeDoc);
    }, [activeDoc]);

    useEffect(() => {
        const scrollElement = scrollRef.current;
        if (!scrollElement) return;

        const timeout = window.setTimeout(() => {
            if (pendingHeading) {
                const heading = document.getElementById(pendingHeading);
                if (heading) {
                    heading.scrollIntoView({ block: 'start' });
                    return;
                }
            }
            scrollElement.scrollTo({ top: 0 });
        }, 0);
        return () => window.clearTimeout(timeout);
    }, [activeDoc?.meta.slug, pendingHeading]);

    useEffect(() => {
        const root = scrollRef.current;
        if (!root || !activeDoc || activeDoc.toc.length === 0) return;

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

    if (!canonical) return <NotFoundPage embedded />;
    if (!activeDoc)
        return (
            <main className="flex h-full flex-col items-center justify-center gap-4 p-6">
                <p role={failed ? 'alert' : 'status'}>
                    {t(failed ? 'docs.loadFailed' : 'docs.loading')}
                </p>
                {failed && (
                    <button className="rounded-md border border-border px-4 py-2" onClick={retry}>
                        {t('docs.retry')}
                    </button>
                )}
            </main>
        );

    return (
        <div className="flex h-full min-h-0 w-full flex-col bg-background text-foreground lg:flex-row">
            <nav
                aria-label={t('docs.label')}
                className="max-h-48 flex-shrink-0 overflow-y-auto border-b border-border bg-card/70 px-4 py-2 lg:max-h-none lg:w-72 lg:border-b-0 lg:border-r lg:py-4"
            >
                <h2 className="text-sm font-semibold text-foreground">
                    <span className="hidden lg:block">{t('docs.contents')}</span>
                    <button
                        type="button"
                        aria-expanded={contentsOpen}
                        aria-controls="docs-contents-panel"
                        onClick={() => setContentsOpen((open) => !open)}
                        className="flex min-h-11 w-full items-center justify-between rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
                    >
                        {t('docs.contents')}
                        <ChevronDown
                            aria-hidden="true"
                            className={`h-4 w-4 ${contentsOpen ? 'rotate-180' : ''}`}
                        />
                    </button>
                </h2>
                <div
                    id="docs-contents-panel"
                    className={`${contentsOpen ? 'block' : 'hidden'} lg:block`}
                >
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {t('docs.description')}
                    </p>
                    <div className="mt-3 space-y-5">
                        {DOC_NAV_GROUPS.map((group) => {
                            const groupDocs = group.slugs
                                .map((slug) => localizedDocs.find((doc) => doc.meta.slug === slug))
                                .filter((doc): doc is DocRecord => doc !== undefined);
                            if (groupDocs.length === 0) return null;

                            return (
                                <section key={group.id} aria-labelledby={`docs-nav-${group.id}`}>
                                    <h3
                                        id={`docs-nav-${group.id}`}
                                        className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                                    >
                                        {t(group.label)}
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
                                                                selected
                                                                    ? 'text-primary'
                                                                    : 'text-foreground'
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

            <aside className="max-h-44 flex-shrink-0 overflow-y-auto border-t border-border bg-card/70 px-4 py-2 lg:max-h-none lg:w-64 lg:border-l lg:border-t-0 lg:py-4">
                <nav aria-label={t('docs.currentHeadings')}>
                    <h2 className="text-sm font-semibold text-foreground">
                        <span className="hidden lg:block">{t('docs.onThisPage')}</span>
                        <button
                            type="button"
                            aria-expanded={headingsOpen}
                            aria-controls="docs-headings-panel"
                            onClick={() => setHeadingsOpen((open) => !open)}
                            className="flex min-h-11 w-full items-center justify-between rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
                        >
                            {t('docs.onThisPage')}
                            <ChevronDown
                                aria-hidden="true"
                                className={`h-4 w-4 ${headingsOpen ? 'rotate-180' : ''}`}
                            />
                        </button>
                    </h2>
                    <div
                        id="docs-headings-panel"
                        className={`${headingsOpen ? 'block' : 'hidden'} lg:block`}
                    >
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                            <Trans
                                t={t}
                                i18nKey="docs.headingsInside"
                                values={{ title: activeDoc.meta.title }}
                                components={{ name: <span className="font-semibold" /> }}
                            />
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
                    </div>
                </nav>
            </aside>
        </div>
    );
}
