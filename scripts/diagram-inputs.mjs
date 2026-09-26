import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const sha256 = (input) => createHash('sha256').update(input).digest('hex');

export function diagramInputHash(root) {
    const sourceFiles = [
        'src/assets/diagrams/layout.json',
        'src/styles/language-fonts.css',
        'public/fonts/languages/sources.json',
        'src/lib/languagePreferences.ts',
        'src/lib/docs/diagramFonts.ts',
        'src/lib/docs/diagramLocalization.ts',
        'scripts/fit-translated-diagrams.mjs',
        ...readdirSync(path.join(root, 'src/assets/diagrams'))
            .filter((file) => file.endsWith('.svg'))
            .map((file) => `src/assets/diagrams/${file}`),
        ...readdirSync(path.join(root, 'src/locales'))
            .map((locale) => `src/locales/${locale}/diagrams.json`)
            .filter((file) => existsSync(path.join(root, file))),
    ].sort();
    const hash = createHash('sha256');
    for (const file of sourceFiles)
        hash.update(file)
            .update('\0')
            .update(readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n'))
            .update('\0');
    return hash.digest('hex');
}
