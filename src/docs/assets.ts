import logoImage from '@/assets/logo.png';
import tdTestImage from '@/assets/tdTest.png';

// Keep diagrams as files, including small SVGs, so the static documentation and
// the app can both link to the same built assets.
const diagrams = import.meta.glob('../assets/diagrams/*.svg', {
    eager: true,
    query: '?url&no-inline',
    import: 'default',
});

const DOC_ASSETS: Record<string, string> = {
    'kromacut-logo.png': logoImage,
    'td-test.png': tdTestImage,
    ...Object.fromEntries(
        Object.entries(diagrams).map(([path, url]) => [path.split('/').pop()!, String(url)])
    ),
};

export function resolveDocAsset(src: string): string | undefined {
    const explicitMatch = Object.keys(DOC_ASSETS).find((key) => src.includes(key));
    if (explicitMatch) return DOC_ASSETS[explicitMatch];

    const clean = src
        .trim()
        .replace(/^\.?\//, '')
        .split(/\s+/)[0]
        .replace(/^["']|["']$/g, '');
    return DOC_ASSETS[clean];
}
