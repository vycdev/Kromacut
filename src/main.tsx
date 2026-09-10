import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { isTauri } from '@tauri-apps/api/core';
import './index.css';
import LandingPage from './components/LandingPage.tsx';
import { applyThemeMode, getStoredThemeMode } from './lib/theme';
import { applyAppSeo, applyHomeSeo } from './lib/seo';
import {
    hasLaunched,
    selectRoute,
    shouldRedirectHomeToApp,
} from './lib/routes';

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
const App = lazy(() => import('./App.tsx'));
if (route === 'landing') {
    applyHomeSeo();
} else if (route === 'app') {
    applyAppSeo();
}

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        {route === 'landing' ? (
            <LandingPage />
        ) : (
            <Suspense
                fallback={
                    <div className="min-h-screen bg-background" aria-label="Loading Kromacut" />
                }
            >
                <App />
            </Suspense>
        )}
    </StrictMode>
);
