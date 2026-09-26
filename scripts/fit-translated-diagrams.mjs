// Maintainer tool: use the browser's actual CJK/Indic shaping and variable fonts.
// Build jobs verify the checked-in measurements; they do not need a browser.
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { selectDiagramFontFaces } from '../src/lib/docs/diagramFonts.ts';
import { localizeDiagramSvg } from '../src/lib/docs/diagramLocalization.ts';
import { SUPPORTED_LANGUAGES } from '../src/lib/languagePreferences.ts';
import { diagramInputHash, sha256 } from './diagram-inputs.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (filename) => JSON.parse(readFileSync(path.join(root, filename), 'utf8'));
const layout = readJson('src/assets/diagrams/layout.json');
const css = readFileSync(path.join(root, 'src/styles/language-fonts.css'), 'utf8');
const partial = process.argv.includes('--partial');
const output = {};
const cramped = [];
const fontData = new Map();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });

try {
    for (const { code: language } of SUPPORTED_LANGUAGES) {
        if (language === 'en') continue;
        const filename = `src/locales/${language}/diagrams.json`;
        if (partial && !existsSync(path.join(root, filename))) continue;
        const catalog = readJson(filename);
        output[language] = {};
        for (const [diagram, metrics] of Object.entries(layout)) {
            const messages = catalog[diagram];
            if (partial && (!messages || Object.keys(metrics).some((key) => !messages[key])))
                continue;
            if (!messages) throw new Error(`Missing diagram: ${language}/${diagram}`);
            const fontCss = selectDiagramFontFaces(css, language, Object.values(messages).join(' '))
                .map((face) => {
                    if (!fontData.has(face.url))
                        fontData.set(
                            face.url,
                            `data:font/woff2;base64,${readFileSync(path.join(root, 'public', face.url.slice(1))).toString('base64')}`
                        );
                    return face.css.replace(face.url, fontData.get(face.url));
                })
                .join('\n');
            const template = readFileSync(
                path.join(root, `src/assets/diagrams/${diagram}.svg`),
                'utf8'
            );
            // Omit diagramName to measure unfitted text, regardless of old output.
            const svg = localizeDiagramSvg(template, messages, language, fontCss);
            await page.setContent(svg);
            await page.evaluate(() => document.fonts.ready);
            const widths = await page.evaluate(() => {
                const result = {};
                for (const element of document.querySelectorAll('text[data-i18n]')) {
                    const key = element.dataset.i18n;
                    result[key] = Math.max(result[key] || 0, element.getComputedTextLength());
                }
                return result;
            });
            output[language][diagram] = {};
            for (const [key, metric] of Object.entries(metrics)) {
                const naturalWidth = widths[key];
                if (!Number.isFinite(naturalWidth) || naturalWidth <= 0)
                    throw new Error(`Unmeasured text: ${language}/${diagram}/${key}`);
                if (naturalWidth > metric.width) {
                    output[language][diagram][key] = metric.width;
                    if (metric.width / naturalWidth < 0.7)
                        cramped.push({
                            language,
                            diagram,
                            key,
                            ratio: +(metric.width / naturalWidth).toFixed(2),
                            text: messages[key],
                        });
                }
            }
        }
        console.log(`Measured ${Object.keys(output[language]).length} diagrams: ${language}`);
    }
} finally {
    await browser.close();
}

const serialized = `${JSON.stringify(output, null, 2)}\n`;
writeFileSync(path.join(root, 'src/generated/diagramTextLengths.json'), serialized);
writeFileSync(
    path.join(root, 'src/generated/diagramTextLengths.meta.json'),
    `${JSON.stringify(
        {
            schemaVersion: 1,
            complete: !partial,
            inputHash: diagramInputHash(root),
            outputHash: sha256(serialized),
        },
        null,
        2
    )}\n`
);
mkdirSync(path.join(root, 'tmp'), { recursive: true });
writeFileSync(
    path.join(root, 'tmp/i18n-diagram-fit-review.json'),
    `${JSON.stringify(cramped, null, 2)}\n`
);
console.log(
    `Fitted diagram typography for ${Object.keys(output).length} languages. ${cramped.length} labels need visual review; see tmp/i18n-diagram-fit-review.json.`
);
