import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { readFileSync } from 'node:fs';
import { SUPPORTED_LANGUAGES } from './src/lib/languagePreferences';

const packageJson = JSON.parse(
    readFileSync(new URL('./package.json', import.meta.url), 'utf8')
) as { version: string };

/** Keep browser installation text local too, without changing the installed app identity. */
function localizedManifests(): Plugin {
    const languages = SUPPORTED_LANGUAGES.filter(({ code }) => code !== 'en');
    const render = (language: string) => {
        const base = JSON.parse(
            readFileSync(new URL('./public/site.webmanifest', import.meta.url), 'utf8')
        );
        const messages = JSON.parse(
            readFileSync(new URL(`./src/locales/${language}/public.json`, import.meta.url), 'utf8')
        );
        return JSON.stringify({
            ...base,
            lang: language,
            description: messages.seo.appDescription,
        });
    };
    return {
        name: 'localized-web-app-manifests',
        configureServer(server) {
            server.middlewares.use((request, response, next) => {
                const pathname = request.url?.split(/[?#]/)[0];
                const match = languages.find(
                    ({ code }) => pathname === `/${code}/site.webmanifest`
                );
                if (!match) return next();
                response.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
                response.end(render(match.code));
            });
        },
        generateBundle() {
            for (const { code } of languages) {
                this.emitFile({
                    type: 'asset',
                    fileName: `${code}/site.webmanifest`,
                    source: render(code),
                });
            }
        },
    };
}

// https://vite.dev/config/
export default defineConfig({
    base: '/',
    plugins: [react(), tailwindcss(), localizedManifests()],
    define: {
        __APP_VERSION__: JSON.stringify(packageJson.version),
    },
    server: {
        watch: {
            // Tauri watches native sources itself. Cargo outputs can be locked while linking.
            ignored: ['**/src-tauri/**'],
        },
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    optimizeDeps: {
        // Start from the app, not generated HTML in native build output or test reports.
        entries: ['index.html'],
        include: ['three'],
        // Treat three example controls as source to avoid stale optimized deps
        exclude: [
            'three/examples/jsm/controls/OrbitControls',
            'three/examples/jsm/controls/OrbitControls.js',
        ],
    },
});
