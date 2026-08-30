import assert from 'node:assert/strict';
import type JSZip from 'jszip';

const XML_3MF_MEMBERS = [
    '[Content_Types].xml',
    '_rels/.rels',
    '3D/3dmodel.model',
    'Metadata/model_settings.config',
    'Metadata/kromacut.config',
] as const;

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

export async function assertValidXml10Members(zip: JSZip): Promise<Record<string, string>> {
    const members: Record<string, string> = {};

    for (const path of XML_3MF_MEMBERS) {
        const file = zip.file(path);
        assert.ok(file, `${path} present`);
        const xml = await file.async('string');

        for (const character of xml) {
            assert.ok(
                isXml10CodePoint(character.codePointAt(0)!),
                `${path} contains an XML 1.0-invalid character`
            );
        }

        members[path] = xml;
    }

    return members;
}
