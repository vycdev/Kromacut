import { useEffect, type MouseEvent } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import logo from '@/assets/logo.png';
import layered404 from '@/assets/not-found-layers.svg';
import { ArrowRight, ArrowUpRight, BookOpen } from 'lucide-react';
import { appPath, docsPath, landingPath } from '@/lib/routes';
import { applyNotFoundSeo, SITE_URL } from '@/lib/seo';
import { applyThemeMode, getStoredThemeMode, subscribeToSystemTheme } from '@/lib/theme';
import './not-found.css';

export default function NotFoundPage({ embedded = false }: { embedded?: boolean }) {
    const desktop = isTauri();
    const Container = embedded ? 'section' : 'main';

    const recoverInApp = (event: MouseEvent<HTMLAnchorElement>) => {
        if (
            !embedded ||
            event.defaultPrevented ||
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
        )
            return;
        // Keep the mounted workspace (and its unsaved image) when recovering
        // from an in-app docs link. Modified clicks retain native link behavior.
        event.preventDefault();
        window.history.pushState(null, '', event.currentTarget.getAttribute('href'));
        window.dispatchEvent(new PopStateEvent('popstate'));
    };

    useEffect(() => {
        applyNotFoundSeo();
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
    }, []);

    return (
        <Container
            className="not-found-page"
            data-testid="not-found-page"
            aria-labelledby="not-found-heading"
        >
            <div className="not-found-card">
                <header className="not-found-header">
                    <div className="not-found-brand">
                        <img src={logo} alt="" width="36" height="36" />
                        <span>Kromacut</span>
                    </div>
                    <span className="not-found-code" aria-label="Error 404">404</span>
                </header>
                <div className="not-found-content">
                    <div className="not-found-copy">
                        <p className="not-found-eyebrow">A little off the build plate</p>
                        <h1 id="not-found-heading">This page doesn't exist</h1>
                        <p className="not-found-description">
                            The link may be outdated, or the address may contain a typo.
                            {' '}Let's get you back to creating.
                        </p>
                        <div className="not-found-actions">
                            <a className="not-found-primary" href={appPath(desktop)} onClick={recoverInApp}>
                                Open Kromacut <ArrowRight aria-hidden="true" size={18} />
                            </a>
                            <a
                                className="not-found-secondary"
                                href={desktop ? `${SITE_URL}/?landing=1` : landingPath(false)}
                            >
                                Go to homepage
                            </a>
                        </div>
                    </div>
                    <div className="not-found-art" data-testid="not-found-art" aria-hidden="true">
                        <img src={layered404} alt="" width="520" height="460" />
                    </div>
                </div>
                <footer className="not-found-footer">
                    <p><BookOpen aria-hidden="true" size={18} /> Looking for a guide?</p>
                    <a
                        className="not-found-docs-link"
                        href={docsPath('overview')}
                        onClick={recoverInApp}
                    >
                        Browse documentation <ArrowUpRight aria-hidden="true" size={16} />
                    </a>
                </footer>
            </div>
        </Container>
    );
}
