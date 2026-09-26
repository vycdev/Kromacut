import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function appImageUpdateInformation(repository) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) {
        throw new Error('Expected a GitHub owner/repository');
    }
    return `gh-releases-zsync|${repository.replace('/', '|')}|latest|Kromacut_*_amd64.AppImage.zsync`;
}

export function appImageFilename(tag) {
    if (!/^v\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(tag)) {
        throw new Error('AppImage releases require a version tag such as v4.1.0');
    }
    return `Kromacut_${tag.slice(1)}_amd64.AppImage`;
}

/** Validate the classic zsync sidecar emitted by linuxdeploy/appimagetool. */
export function validateAppImageUpdate({ repository, tag, updateInformation, size, sha1, zsync }) {
    const filename = appImageFilename(tag);
    const expected = appImageUpdateInformation(repository);
    if (updateInformation.trim() !== expected) {
        throw new Error(`AppImage update information must be ${expected}`);
    }

    const end = zsync.indexOf('\n\n');
    if (end < 0 || end > 65536) throw new Error('Missing or oversized zsync header');
    const lines = zsync.subarray(0, end).toString('utf8').split('\n');
    if (!lines[0].startsWith('zsync: ')) throw new Error('Missing zsync format identifier');
    const fields = new Map();
    for (const line of lines) {
        const colon = line.indexOf(': ');
        if (colon < 1) throw new Error('Malformed zsync header');
        const key = line.slice(0, colon);
        if (fields.has(key)) throw new Error(`Duplicate zsync header: ${key}`);
        fields.set(key, line.slice(colon + 2));
    }
    if (fields.get('Filename') !== filename)
        throw new Error('zsync filename does not match release');
    if (fields.get('Length') !== String(size) || size <= 0) {
        throw new Error('zsync length does not match AppImage');
    }
    if (!/^[a-f\d]{40}$/i.test(sha1) || fields.get('SHA-1')?.toLowerCase() !== sha1.toLowerCase()) {
        throw new Error('zsync SHA-1 does not match AppImage');
    }
    const downloadUrl = `https://github.com/${repository}/releases/download/${tag}/${filename}`;
    // appimagetool normally emits the basename, resolved beside the release's .zsync.
    if (![filename, downloadUrl].includes(fields.get('URL'))) {
        throw new Error('zsync URL does not point to this release AppImage');
    }
    const blocksize = Number(fields.get('Blocksize'));
    const lengths = /^(\d+),(\d+),(\d+)$/.exec(fields.get('Hash-Lengths') ?? '');
    if (
        !Number.isSafeInteger(blocksize) ||
        blocksize < 1 ||
        !Number.isInteger(Math.log2(blocksize))
    ) {
        throw new Error('Invalid zsync block size');
    }
    if (
        !lengths ||
        ![1, 2].includes(Number(lengths[1])) ||
        Number(lengths[2]) < 2 ||
        Number(lengths[2]) > 4 ||
        Number(lengths[3]) < 1 ||
        Number(lengths[3]) > 16
    ) {
        throw new Error('Invalid zsync hash lengths');
    }
    const checksumBytes = Math.ceil(size / blocksize) * (Number(lengths[2]) + Number(lengths[3]));
    if (zsync.length - end - 2 !== checksumBytes) {
        throw new Error('Truncated or unexpected zsync block checksums');
    }
    return filename;
}

export async function checkAppImageRelease(directory, repository, tag) {
    const filename = appImageFilename(tag);
    const files = await readdir(directory);
    const images = files.filter((name) => name.endsWith('.AppImage'));
    const sidecars = files.filter((name) => name.endsWith('.AppImage.zsync'));
    if (
        images.length !== 1 ||
        images[0] !== filename ||
        sidecars.length !== 1 ||
        sidecars[0] !== `${filename}.zsync`
    ) {
        throw new Error(`Expected exactly ${filename} and its matching .zsync file`);
    }
    const imagePath = path.resolve(directory, filename);
    // This runs only the built AppImage runtime's metadata command, not the GUI or FUSE mount.
    const updateInformation = execFileSync(imagePath, ['--appimage-updateinformation'], {
        encoding: 'utf8',
        timeout: 10000,
    });
    const hash = createHash('sha1');
    for await (const chunk of createReadStream(imagePath)) hash.update(chunk);
    validateAppImageUpdate({
        repository,
        tag,
        updateInformation,
        size: (await stat(imagePath)).size,
        sha1: hash.digest('hex'),
        zsync: await readFile(`${imagePath}.zsync`),
    });
    console.log(`Validated update information and .zsync for ${filename}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    const [directory, repository, tag] = process.argv.slice(2);
    if (!directory || !repository || !tag) {
        console.error(
            'Usage: node scripts/check-appimage-update.mjs <bundle-directory> <owner/repo> <version-tag>'
        );
        process.exitCode = 1;
    } else {
        await checkAppImageRelease(directory, repository, tag).catch((error) => {
            console.error(error.message);
            process.exitCode = 1;
        });
    }
}
