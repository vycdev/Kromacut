import { useEffect } from 'react';
import logo from '@/assets/logo.png';
import { applyPrivacySeo, applyTermsSeo } from '@/lib/seo';
import { applyThemeMode, getStoredThemeMode, subscribeToSystemTheme } from '@/lib/theme';
import PublicContactEmail from './PublicContactEmail';
import './privacy-page.css';

interface LegalNotice {
    title: string;
    seoTitle: string;
    description: string;
    updated: string;
    intro: string;
    sections: {
        id: string;
        title: string;
        paragraphs: string[];
        links: { href: string; label: string }[];
    }[];
    contactTitle: string;
    contactDescription: string;
}

export default function LegalPage({ kind, notice }: { kind: 'privacy' | 'terms'; notice: LegalNotice }) {
    const headingId = `${kind}-heading`;
    const contactHeadingId = `${kind}-contact-heading`;

    useEffect(() => {
        const applyPageSeo = kind === 'privacy' ? applyPrivacySeo : applyTermsSeo;
        applyPageSeo(notice.seoTitle, notice.description);
        const syncTheme = () => applyThemeMode(getStoredThemeMode());
        syncTheme();
        const unsubscribe = subscribeToSystemTheme(() => {
            if (getStoredThemeMode() === 'system') syncTheme();
        });
        window.addEventListener('storage', syncTheme);
        return () => {
            unsubscribe();
            window.removeEventListener('storage', syncTheme);
        };
    }, [kind, notice.seoTitle, notice.description]);

    return (
        <main className="privacy-page" data-testid={`${kind}-page`} aria-labelledby={headingId}>
            <div className="privacy-shell">
                <header className="privacy-header">
                    <a className="privacy-brand" href="/?landing=1" aria-label="Kromacut homepage">
                        <img src={logo} width="36" height="36" alt="" />
                        <span>Kromacut</span>
                    </a>
                    <a className="privacy-app-link" href="/app">
                        Open Kromacut
                    </a>
                </header>
                <article className="privacy-article">
                    <p className="privacy-eyebrow">
                        {kind === 'privacy' ? 'Local-first. Clearly explained.' : 'Using Kromacut.'}
                    </p>
                    <h1 id={headingId}>{notice.title}</h1>
                    <p className="privacy-updated">Updated {notice.updated}</p>
                    <p className="privacy-intro">{notice.intro}</p>
                    <nav className="privacy-contents" aria-label="On this page">
                        <p>On this page</p>
                        <ul>
                            {notice.sections.map((section) => (
                                <li key={section.id}>
                                    <a href={`#${section.id}`}>{section.title}</a>
                                </li>
                            ))}
                            <li><a href={`#${contactHeadingId}`}>{notice.contactTitle}</a></li>
                        </ul>
                    </nav>
                    {notice.sections.map((section) => (
                        <section key={section.id} aria-labelledby={section.id}>
                            <h2 id={section.id}>{section.title}</h2>
                            {section.paragraphs.map((paragraph) => (
                                <p key={paragraph}>{paragraph}</p>
                            ))}
                            {section.links.length > 0 && (
                                <ul className="privacy-sources">
                                    {section.links.map((link) => (
                                        <li key={link.href}>
                                            <a href={link.href} rel="noreferrer">
                                                {link.label}
                                            </a>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>
                    ))}
                    <section aria-labelledby={contactHeadingId}>
                        <h2 id={contactHeadingId}>{notice.contactTitle}</h2>
                        <p>{notice.contactDescription}</p>
                        <PublicContactEmail />
                    </section>
                </article>
                <footer className="privacy-footer">
                    <a href="/?landing=1">Go to homepage</a>
                    <a href="/docs/overview">Browse documentation</a>
                    {kind === 'privacy' ? (
                        <a href="/terms">Terms &amp; conditions</a>
                    ) : (
                        <a href="/privacy">Privacy &amp; local data</a>
                    )}
                </footer>
            </div>
        </main>
    );
}
