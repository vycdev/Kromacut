import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { diagramInputHash, sha256 } from './diagram-inputs.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try {
    const metadata = JSON.parse(
        readFileSync(path.join(root, 'src/generated/diagramTextLengths.meta.json'), 'utf8')
    );
    const output = readFileSync(
        path.join(root, 'src/generated/diagramTextLengths.json'),
        'utf8'
    ).replaceAll('\r\n', '\n');
    if (
        !metadata.complete ||
        metadata.schemaVersion !== 1 ||
        metadata.inputHash !== diagramInputHash(root) ||
        metadata.outputHash !== sha256(output)
    ) {
        throw new Error('Diagram translations, templates, fonts, or measurements changed.');
    }
    console.log('Translated diagram measurements are complete and current.');
} catch (error) {
    console.error(
        `${error.message}\nRun npm run i18n:fit-diagrams, inspect the reported labels, and save the generated measurements.`
    );
    process.exitCode = 1;
}
