import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
    plugins: [react()],
    optimizeDeps: {
        include: ['three'],
        // Treat three example controls as source to avoid stale optimized deps
        exclude: [
            'three/examples/jsm/controls/OrbitControls',
            'three/examples/jsm/controls/OrbitControls.js',
        ],
    },
});
