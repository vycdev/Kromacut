const XML_REPLACEMENT_CHARACTER = '\uFFFD';

function isXml10CodePoint(codePoint: number): boolean {
    return (
        codePoint === 0x09 ||
        codePoint === 0x0a ||
        codePoint === 0x0d ||
        (codePoint >= 0x20 && codePoint <= 0xd7ff) ||
        (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
        (codePoint >= 0x10000 && codePoint <= 0x10ffff)
    );
}

/** Escape an arbitrary string for a quoted XML 1.0 attribute. */
export function escapeXmlAttribute(value: string): string {
    let escaped = '';

    for (const character of value) {
        const safeCharacter = isXml10CodePoint(character.codePointAt(0)!)
            ? character
            : XML_REPLACEMENT_CHARACTER;

        switch (safeCharacter) {
            case '&':
                escaped += '&amp;';
                break;
            case '<':
                escaped += '&lt;';
                break;
            case '>':
                escaped += '&gt;';
                break;
            case '"':
                escaped += '&quot;';
                break;
            case "'":
                escaped += '&apos;';
                break;
            default:
                escaped += safeCharacter;
        }
    }

    return escaped;
}
