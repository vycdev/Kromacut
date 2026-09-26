import diagramTextLengths from '../../generated/diagramTextLengths.json' with { type: 'json' };

/** SVG templates are repository-owned. Translations are text, never executable markup. */
export function localizeDiagramSvg(
    template: string,
    messages: Record<string, string>,
    language: string,
    fontCss = '',
    diagramName = ''
): string {
    const escapeXml = (text: string) =>
        text
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&apos;');
    return template
        .replace('<svg ', `<svg xml:lang="${escapeXml(language)}" `)
        .replace(
            /(<svg\b[^>]*>)/,
            fontCss
                ? `$1<style>${fontCss}\ntext{font-family:'Kromacut Diagram',sans-serif!important}</style>`
                : '$1'
        )
        .replace(
            /<(text|title|desc)([^>]*\bdata-i18n="([^"]+)"[^>]*)>[\s\S]*?<\/\1>/g,
            (_all, tag: string, attributes: string, key: string) => {
                const translated = messages[key];
                if (typeof translated !== 'string' || !translated.trim()) {
                    throw new Error(`Missing diagram translation: ${language}/${key}`);
                }
                const layouts = diagramTextLengths as Record<
                    string,
                    Record<string, Record<string, number>>
                >;
                const width = layouts[language]?.[diagramName]?.[key];
                const fit =
                    tag === 'text' && width
                        ? ` textLength="${width}" lengthAdjust="spacingAndGlyphs"`
                        : '';
                let content = escapeXml(translated);
                // Only a template explicitly marked for emphasis accepts this
                // one inert marker. All other translation content stays escaped.
                if (attributes.includes('data-i18n-rich="label"')) {
                    content = `<tspan fill="#b3c2d4">${content.replace(/&lt;label&gt;([\s\S]*?)&lt;\/label&gt;/g, '<tspan font-weight="700" fill="#f1f5f9">$1</tspan>')}</tspan>`;
                }
                return `<${tag}${attributes}${fit}>${content}</${tag}>`;
            }
        );
}
