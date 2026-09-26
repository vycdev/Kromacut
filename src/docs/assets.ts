import logoImage from '@/assets/logo.png';
import tdTestImage from '@/assets/tdTest.png';
import hdWedgesPhoto from '@/assets/hd-wedges-eight-colors-2026-09-13.jpg';
import { i18n } from '@/lib/i18n';
import { localizeDiagramSvg } from '@/lib/docs/diagramLocalization';
import { selectDiagramFontFaces } from '@/lib/docs/diagramFonts';
import fontStylesheet from '@/styles/language-fonts.css?raw';
import type { DocRecord } from '@/types/docs';

// Keep diagrams as files, including small SVGs, so the static documentation and
// the app can both link to the same built assets.
const diagrams = import.meta.glob('../assets/diagrams/*.svg', {
    eager: true,
    query: '?url&no-inline',
    import: 'default',
});
const diagramTemplates = import.meta.glob('../assets/diagrams/*.svg', {
    eager: true,
    query: '?raw',
    import: 'default',
});
const localizedAssets = new Map<string, string>();
const pendingAssets = new Map<string, Promise<void>>();
const fontData = new Map<string, Promise<string>>();

function loadFontData(url: string): Promise<string> {
    const cached = fontData.get(url);
    if (cached) return cached;
    const result = fetch(url)
        .then(async (response) => {
            if (!response.ok) throw new Error(`Unable to load bundled font: ${url}`);
            const bytes = new Uint8Array(await response.arrayBuffer());
            let binary = '';
            for (let index = 0; index < bytes.length; index += 8192)
                binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
            return `data:font/woff2;base64,${btoa(binary)}`;
        })
        .catch((error) => {
            fontData.delete(url);
            throw error;
        });
    fontData.set(url, result);
    return result;
}

export async function prepareLocalizedDocAssets(doc: DocRecord, language: string): Promise<void> {
    if (language === 'en') return;
    const names = Object.keys(DOC_ASSETS).filter(
        (name) => name.endsWith('.svg') && doc.content.includes(name)
    );
    await Promise.all(
        names.map(async (name) => {
            const key = `${language}/${name}`;
            if (localizedAssets.has(key)) return;
            const existing = pendingAssets.get(key);
            if (existing) return existing;
            const pending = (async () => {
                const template = diagramTemplates[`../assets/diagrams/${name}`];
                const messages = i18n.getResource(
                    language,
                    'diagrams',
                    name.replace(/\.svg$/, '')
                ) as Record<string, string> | undefined;
                if (typeof template !== 'string' || !messages)
                    throw new Error(`Missing localized diagram: ${key}`);
                const faces = selectDiagramFontFaces(
                    fontStylesheet,
                    language,
                    Object.values(messages).join(' ')
                );
                const fontCss = (
                    await Promise.all(
                        faces.map(async (face) =>
                            face.css.replace(face.url, await loadFontData(face.url))
                        )
                    )
                ).join('\n');
                const svg = localizeDiagramSvg(
                    template,
                    messages,
                    language,
                    fontCss,
                    name.replace(/\.svg$/, '')
                );
                // Blob links also support opening the illustration at full size; browsers
                // deliberately block top-level navigation to data: URLs. This bounded
                // cache lives with the tab; its URLs are released when the tab closes.
                localizedAssets.set(
                    key,
                    URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
                );
            })().finally(() => pendingAssets.delete(key));
            pendingAssets.set(key, pending);
            return pending;
        })
    );
}

const DOC_ASSETS: Record<string, string> = {
    'kromacut-logo.png': logoImage,
    'td-test.png': tdTestImage,
    'hd-wedges-eight-colors-2026-09-13.jpg': hdWedgesPhoto,
    ...Object.fromEntries(
        Object.entries(diagrams).map(([path, url]) => [path.split('/').pop()!, String(url)])
    ),
};

export function resolveDocAsset(src: string): string | undefined {
    const explicitMatch = Object.keys(DOC_ASSETS).find((key) => src.includes(key));
    if (explicitMatch) {
        const language = i18n.resolvedLanguage ?? 'en';
        const template = diagramTemplates[`../assets/diagrams/${explicitMatch}`];
        if (language !== 'en' && typeof template === 'string') {
            const key = `${language}/${explicitMatch}`;
            // A translated guide is published only after preparation succeeds.
            // Never cache a fontless fallback that could later shadow the full SVG.
            return localizedAssets.get(key);
        }
        return DOC_ASSETS[explicitMatch];
    }

    const clean = src
        .trim()
        .replace(/^\.?\//, '')
        .split(/\s+/)[0]
        .replace(/^["']|["']$/g, '');
    return DOC_ASSETS[clean];
}
