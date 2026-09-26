import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import { i18n } from './lib/i18n';
import { initializeAppLanguage, subscribeToLanguagePreference } from './i18n';
import { isTauri } from '@tauri-apps/api/core';
import './index.css';
import './styles/language-layout.css';
import LandingPage from './components/LandingPage.tsx';
import NotFoundPage from './components/NotFoundPage.tsx';
import { applyThemeMode, getStoredThemeMode } from './lib/theme';
import { applyAppSeo, applyHomeSeo } from './lib/seo';
import { hasLaunched, selectRoute, shouldRedirectHomeToApp } from './lib/routes';

// Apply the saved theme preference before React paints.
applyThemeMode(getStoredThemeMode());

const desktopRuntime = isTauri();
if (
    shouldRedirectHomeToApp(
        window.location,
        desktopRuntime,
        window.navigator.userAgent,
        hasLaunched()
    )
) {
    window.history.replaceState(null, '', '/app');
}

const route = selectRoute(window.location.pathname, desktopRuntime);
const PrivacyPage = lazy(() => import('./components/PrivacyPage.tsx'));
const TermsPage = lazy(() => import('./components/TermsPage.tsx'));
const App = lazy(() => import('./App.tsx'));
function syncEntrySeo() {
    const currentRoute = selectRoute(window.location.pathname, desktopRuntime);
    if (currentRoute === 'landing') applyHomeSeo();
    else if (currentRoute === 'app') applyAppSeo();
}

void initializeAppLanguage().then(() => {
    syncEntrySeo();
    subscribeToLanguagePreference();
    i18n.on('languageChanged', syncEntrySeo);
    createRoot(document.getElementById('root')!).render(
        <StrictMode>
            <I18nextProvider i18n={i18n}>
                {route === 'landing' ? (
                    <LandingPage />
                ) : route === 'not-found' ? (
                    <NotFoundPage />
                ) : (
                    <Suspense
                        fallback={
                            <div
                                className="min-h-screen bg-background"
                                aria-label={i18n.t('navigation.loading')}
                            />
                        }
                    >
                        {route === 'privacy' ? (
                            <PrivacyPage />
                        ) : route === 'terms' ? (
                            <TermsPage />
                        ) : (
                            <App />
                        )}
                    </Suspense>
                )}
            </I18nextProvider>
        </StrictMode>
    );
});
