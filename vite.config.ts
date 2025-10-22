import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

// https://vite.dev/config/
export default defineConfig({
    plugins: [react(), tailwindcss()],
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
