import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const nativeRoot = resolve('src-tauri');
const read = (path: string) => readFileSync(resolve(nativeRoot, path), 'utf8');
const config = JSON.parse(read('tauri.conf.json'));

test('desktop packages claim only Kromacut formats and ship matching icons/MIME globs', () => {
    const associations = config.bundle.fileAssociations;
    assert.deepEqual(associations.flatMap((item: { ext: string[] }) => item.ext).sort(), [
        'kapp',
        'kfil',
        'kpal',
    ]);
    const linux = JSON.parse(read('tauri.linux.conf.json')).bundle.linux;
    const mime = read('linux/kromacut-mime.xml');
    const mac = JSON.parse(read('tauri.macos.conf.json')).bundle.macOS;
    const macPlist = read(mac.infoPlist);
    for (const association of associations) {
        assert.ok(mime.includes(`type="${association.mimeType}"`));
        for (const extension of association.ext)
            assert.ok(mime.includes(`pattern="*.${extension}"`));
        const type = macPlist
            .split('<dict>')
            .find((part) =>
                part.includes(`<string>${association.exportedType.identifier}</string>`)
            )!;
        for (const extension of association.ext)
            assert.ok(type.includes(`<string>${extension}</string>`));
        const iconName = /<key>CFBundleTypeIconFile<\/key><string>([^<]+)<\/string>/.exec(type)![1];
        const icon = mac.files[`Resources/${iconName}`];
        assert.ok(existsSync(resolve(nativeRoot, icon)));
        for (const format of ['deb', 'rpm', 'appimage']) {
            const files = linux[format].files;
            assert.equal(files['/usr/share/mime/packages/kromacut.xml'], 'linux/kromacut-mime.xml');
            const iconName = association.mimeType.replace('/', '-');
            for (const size of [32, 128]) {
                const source =
                    files[`/usr/share/icons/hicolor/${size}x${size}/mimetypes/${iconName}.png`];
                const png = readFileSync(resolve(nativeRoot, source));
                assert.equal(png.readUInt32BE(16), size);
                assert.equal(png.readUInt32BE(20), size);
            }
        }
    }
    // appimage's staging uses the Debian desktop template before custom files are copied.
    for (const format of ['deb', 'rpm']) {
        assert.match(read(linux[format].desktopTemplate), /^Exec=\{\{exec\}\} %F$/m);
        assert.equal(linux[format].postInstallScript, linux[format].postRemoveScript);
        assert.match(
            read(linux[format].postInstallScript),
            /update-mime-database \/usr\/share\/mime/
        );
    }
    const hooks = read(config.bundle.windows.nsis.installerHooks);
    assert.ok(hooks.includes('"Software\\Classes"'));
    assert.ok(hooks.includes('${KROMACUT_ASSOCIATIONS_ROOT}\\${FILECLASS}\\shell\\open\\command'));
    assert.ok(hooks.includes('$\\"$INSTDIR\\${MAINBINARYNAME}.exe$\\" $\\"%1$\\"'));
});

test('Windows association macros preserve previous and later handlers through upgrades/removal', (t) => {
    if (process.platform !== 'win32' || !process.env.LOCALAPPDATA) {
        t.skip('Requires Windows and the NSIS compiler downloaded by Tauri');
        return;
    }
    const compiler = join(process.env.LOCALAPPDATA, 'tauri', 'NSIS', 'makensis.exe');
    if (!existsSync(compiler)) {
        t.skip('Run a Windows Tauri bundle build to download the NSIS compiler first');
        return;
    }
    const directory = mkdtempSync(join(tmpdir(), 'kromacut-associations-'));
    const output = join(directory, 'association-test.exe');
    try {
        execFileSync(
            compiler,
            [
                '/V2',
                `/DTEST_OUTFILE=${output}`,
                `/DTEST_ID=${basename(directory)}`,
                `/DASSOCIATIONS_FILE=${resolve(nativeRoot, 'windows/file-associations.nsh')}`,
                resolve('tests/native/file-associations.nsi'),
            ],
            { windowsHide: true, timeout: 30_000, stdio: 'pipe' }
        );
        // The harness only touches its unique HKCU Software\\Kromacut test key,
        // not real file associations, and removes that key before it exits.
        execFileSync(output, ['/S'], { windowsHide: true, timeout: 30_000, stdio: 'pipe' });
    } finally {
        assert.equal(dirname(directory), resolve(tmpdir()));
        assert.ok(basename(directory).startsWith('kromacut-associations-'));
        rmSync(directory, { recursive: true, force: true });
    }
});
