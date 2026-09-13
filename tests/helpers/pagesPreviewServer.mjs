import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';

// Deliberately do not rewrite missing routes to index.html, as Vite preview does.
// GitHub Pages serves the site's 404.html while preserving the bad URL and status.
const outputDirectory = await realpath(path.resolve('dist'));
const notFoundPage = await readFile(path.join(outputDirectory, '404.html'));
const port = Number(process.env.PORT ?? 5183);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
}
const contentTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
    '.txt': 'text/plain; charset=utf-8',
    '.xml': 'application/xml; charset=utf-8',
};

function isInsideOutput(filename) {
    const relative = path.relative(outputDirectory, filename);
    return relative === '' || (
        relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
    );
}

createServer(async (request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405, { Allow: 'GET, HEAD' });
        response.end();
        return;
    }

    try {
        const pathname = decodeURIComponent(new URL(request.url, `http://127.0.0.1:${port}`).pathname);
        let filename = path.resolve(outputDirectory, `.${pathname}`);
        if (!isInsideOutput(filename)) throw new Error('Path outside build output');
        if ((await stat(filename)).isDirectory()) filename = path.join(filename, 'index.html');
        filename = await realpath(filename);
        if (!isInsideOutput(filename)) throw new Error('Symlink outside build output');
        const data = await readFile(filename);
        response.writeHead(200, {
            'Content-Type': contentTypes[path.extname(filename)] ?? 'application/octet-stream',
            'Cache-Control': 'no-store',
        });
        response.end(request.method === 'HEAD' ? undefined : data);
    } catch {
        response.writeHead(404, {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store',
        });
        response.end(request.method === 'HEAD' ? undefined : notFoundPage);
    }
}).listen(port, '127.0.0.1');
