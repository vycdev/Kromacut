import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { readFileSync } from 'node:fs';

const packageJson = JSON.parse(
    readFileSync(new URL('./package.json', import.meta.url), 'utf8')
) as { version: string };

// https://vite.dev/config/
export default defineConfig({
    base: '/',
    plugins: [react(), tailwindcss()],
    define: {
        __APP_VERSION__: JSON.stringify(packageJson.version),
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    optimizeDeps: {
        include: ['three'],
        // Treat three example controls as source to avoid stale optimized deps
        exclude: [
            'three/examples/jsm/controls/OrbitControls',
            'three/examples/jsm/controls/OrbitControls.js',
        ],
    },
});
