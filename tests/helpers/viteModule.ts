import { resolve } from 'node:path';
import { createServer, type ViteDevServer } from 'vite';

export async function withViteTestServer<T>(
    load: (server: ViteDevServer) => Promise<T>
): Promise<T> {
    const server = await createServer({
        appType: 'custom',
        cacheDir: 'dist/.vite-test-cache',
        configFile: false,
        logLevel: 'error',
        optimizeDeps: { noDiscovery: true },
        resolve: { alias: { '@': resolve(process.cwd(), 'src') } },
        root: process.cwd(),
        server: { hmr: false, middlewareMode: true },
    });

    try {
        return await load(server);
    } finally {
        await server.close();
    }
}

export function loadViteModule<T>(modulePath: string): Promise<T> {
    return withViteTestServer(
        async (server) => (await server.ssrLoadModule(modulePath)) as T
    );
}
