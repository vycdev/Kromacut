export interface DiagramFontFace {
    css: string;
    url: string;
}

/** Select only the Unicode subsets actually used by a self-contained SVG. */
export function selectDiagramFontFaces(
    stylesheet: string,
    language: string,
    text: string
): DiagramFontFace[] {
    const family =
        language === 'ja'
            ? 'Noto Sans JP'
            : language === 'zh-CN'
              ? 'Noto Sans SC'
              : language === 'hi'
                ? 'Noto Sans Devanagari'
                : language === 'bn'
                  ? 'Noto Sans Bengali'
                  : 'Noto Sans';
    const points = new Set([...text].map((character) => character.codePointAt(0)!));
    const faces: DiagramFontFace[] = [];
    for (const match of stylesheet.matchAll(/@font-face\s*\{([^}]+)\}/g)) {
        const block = match[0];
        const fontFamily = block.includes(`font-family: '${family}'`) ? family : 'Noto Sans';
        if (!block.includes(`font-family: '${fontFamily}'`)) continue;
        const url = block.match(/url\(([^)]+)\)/)?.[1];
        const unicodeRange = block.match(/unicode-range:\s*([^;]+)/)?.[1];
        if (!url || !unicodeRange) continue;
        const matches = unicodeRange.split(',').some((range) => {
            const [start, end] = range.trim().replace(/^U\+/i, '').split('-');
            const minimum = Number.parseInt(start.replaceAll('?', '0'), 16);
            const maximum = Number.parseInt((end ?? start).replaceAll('?', 'F'), 16);
            return [...points].some((point) => point >= minimum && point <= maximum);
        });
        if (matches)
            faces.push({
                url,
                css: block.replace(
                    `font-family: '${fontFamily}'`,
                    "font-family: 'Kromacut Diagram'"
                ),
            });
    }
    return faces;
}
