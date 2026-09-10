import { readFileSync } from 'node:fs';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

try {
    const directory = resolve(process.argv[2] ?? dirname(fileURLToPath(import.meta.url)));
    const manifest = JSON.parse(readFileSync(resolve(directory, 'manifest.json'), 'utf8'));
    if (
        manifest.schemaVersion !== 1 ||
        manifest.status !== 'frozen-pre-print' ||
        !Object.keys(manifest.files ?? {}).length
    )
        throw new Error('Missing or incomplete frozen-bundle manifest');
    for (const [name, expected] of Object.entries(manifest.files)) {
        const path = resolve(directory, name),
            within = relative(directory, path);
        if (!within || within.startsWith('..') || isAbsolute(within))
            throw new Error('Unsafe manifest path');
        const bytes = readFileSync(path);
        if (
            bytes.length !== expected.bytes ||
            createHash('sha256').update(bytes).digest('hex') !== expected.sha256
        )
            throw new Error(`Changed file: ${name}`);
    }
    console.log(
        `OK: ${Object.keys(manifest.files).length} frozen payload files match their SHA-256 hashes. This verifies integrity, not physical color accuracy.`
    );
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}
