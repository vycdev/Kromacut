import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { applyThemeMode, getStoredThemeMode } from './lib/theme';
import { applyHomeSeo } from './lib/seo';

// Apply the saved theme preference before React paints.
applyThemeMode(getStoredThemeMode());
applyHomeSeo();

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <App />
    </StrictMode>
);
