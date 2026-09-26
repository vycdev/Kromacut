import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
    appImageFilename,
    appImageUpdateInformation,
    checkAppImageRelease,
    validateAppImageUpdate,
} from '../scripts/check-appimage-update.mjs';

const repository = 'vycdev/Kromacut';
const tag = 'v4.1.0';
const filename = 'Kromacut_4.1.0_amd64.AppImage';
const bytes = Buffer.alloc(3073, 42);
const sha1 = createHash('sha1').update(bytes).digest('hex');

function fixture(overrides: Record<string, string> = {}, checksumBytes = 16) {
    const headers = {
        zsync: '0.6.2',
        Filename: filename,
        MTime: 'Sat, 26 Sep 2026 12:00:00 +0000',
        Blocksize: '2048',
        Length: String(bytes.length),
        'Hash-Lengths': '2,3,5',
        URL: filename,
        'SHA-1': sha1,
        ...overrides,
    };
    return Buffer.concat([
        Buffer.from(
            Object.entries(headers)
                .map(([key, value]) => `${key}: ${value}`)
                .join('\n') + '\n\n'
        ),
        Buffer.alloc(checksumBytes),
    ]);
}

function validate(zsync = fixture(), updateInformation = appImageUpdateInformation(repository)) {
    return validateAppImageUpdate({
        repository,
        tag,
        size: bytes.length,
        sha1,
        zsync,
        updateInformation,
    });
}

test('AppImage update discovery follows stable releases and the exact architecture', () => {
    assert.equal(
        appImageUpdateInformation(repository),
        'gh-releases-zsync|vycdev|Kromacut|latest|Kromacut_*_amd64.AppImage.zsync'
    );
    assert.equal(appImageFilename(tag), filename);
    assert.throws(() => appImageFilename('develop'), /version tag/);
    assert.throws(() => appImageUpdateInformation('vycdev|Kromacut'), /owner\/repository/);
});

test('zsync accepts the matching relative URL or exact release URL', () => {
    assert.equal(validate(), filename);
    assert.equal(
        validate(
            fixture({
                URL: `https://github.com/${repository}/releases/download/${tag}/${filename}`,
            })
        ),
        filename
    );
    assert.equal(validate(fixture(), `${appImageUpdateInformation(repository)}\n`), filename);
});

test('AppImage update metadata rejects missing, wrong-repository, wrong-architecture and prerelease discovery', () => {
    for (const information of [
        '',
        appImageUpdateInformation('someone/else'),
        appImageUpdateInformation(repository).replace('amd64', 'aarch64'),
        appImageUpdateInformation(repository).replace('|latest|', '|latest-all|'),
    ]) {
        assert.throws(() => validate(fixture(), information), /update information/);
    }
});

test('zsync rejects stale artifacts and unsafe or mismatched download locations', () => {
    assert.throws(
        () => validate(fixture({ Filename: 'Kromacut_4.0.0_amd64.AppImage' })),
        /filename/
    );
    assert.throws(() => validate(fixture({ Length: String(bytes.length + 1) })), /length/);
    assert.throws(() => validate(fixture({ 'SHA-1': '0'.repeat(40) })), /SHA-1/);
    for (const url of [
        '/home/runner/build.AppImage',
        '../other.AppImage',
        'https://example.com/other.AppImage',
        `https://github.com/${repository}/releases/download/v4.0.0/${filename}`,
    ]) {
        assert.throws(() => validate(fixture({ URL: url })), /URL/);
    }
});

test('zsync requires a valid header and complete block checksum table', () => {
    assert.throws(() => validate(Buffer.from('not a control file')), /header/);
    assert.throws(() => validate(fixture({ Blocksize: '3000' })), /block size/);
    assert.throws(() => validate(fixture({ 'Hash-Lengths': '0,3,5' })), /hash lengths/);
    assert.throws(() => validate(fixture({ 'Hash-Lengths': '2,0,5' })), /hash lengths/);
    assert.throws(() => validate(fixture({ 'Hash-Lengths': '2,1,5' })), /hash lengths/);
    assert.throws(() => validate(fixture({ 'Hash-Lengths': '2,3,17' })), /hash lengths/);
    assert.throws(() => validate(fixture({}, 15)), /block checksums/);
    assert.throws(() => validate(fixture({}, 17)), /block checksums/);
    assert.throws(() => validate(fixture({ URL: `${filename}\nURL: ${filename}` })), /Duplicate/);
});

test('release validator rejects missing sidecars, ambiguous artifacts and tag mismatches before execution', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'kromacut-appimage-test-'));
    try {
        await assert.rejects(checkAppImageRelease(directory, repository, tag), /Expected exactly/);
        await writeFile(path.join(directory, filename), bytes);
        await assert.rejects(checkAppImageRelease(directory, repository, tag), /matching .zsync/);
        await writeFile(path.join(directory, `${filename}.zsync`), fixture());
        await assert.rejects(
            checkAppImageRelease(directory, repository, 'v4.2.0'),
            /Expected exactly/
        );
        await writeFile(path.join(directory, 'stale.AppImage.zsync'), fixture());
        await assert.rejects(checkAppImageRelease(directory, repository, tag), /Expected exactly/);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
