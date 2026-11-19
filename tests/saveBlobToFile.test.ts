import test from 'node:test';
import assert from 'node:assert/strict';
import { loadViteModule } from './helpers/viteModule.ts';

type SaveBlobModule = typeof import('../src/hooks/saveBlobToFile.ts');
type NativeCall = { command: string; args: Record<string, unknown> };

let saveModule: Promise<SaveBlobModule> | null = null;

const palette = {
    version: 2,
    id: 'save-test',
    name: 'Culori 🌈',
    colors: ['#123456', '#ffffff'],
    disabledColors: [0],
    colorNames: ['Albastru', 'Alb'],
    createdAt: 1,
    updatedAt: 1,
};
const options = {
    defaultFileName: 'palette.kpal',
    extension: 'kpal',
    filterName: 'Color palette',
};

const tempPathFor = (path: string) => path.replace(/[^/]+$/, (name) => `.${name}.kromacut-tmp`);

/** Fakes the Tauri runtime over an in-memory file map, so tests can check what ends up on disk. */
async function withNativeSave(
    write: (data: Uint8Array) => number,
    run: (
        save: SaveBlobModule['saveBlobToFile'],
        calls: NativeCall[],
        files: Map<string, Buffer>
    ) => Promise<void>,
    path: string | null = 'C:/prints/palette.kpal',
    files = new Map<string, Buffer>(),
    finish: () => void = () => undefined
) {
    const { saveBlobToFile } = await (saveModule ??= loadViteModule<SaveBlobModule>(
        '/src/hooks/saveBlobToFile.ts'
    ));
    const calls: NativeCall[] = [];
    const pending = new Map<string, string>();
    let openPath = '';
    const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const tauriDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'isTauri');
    Object.defineProperty(globalThis, 'isTauri', { configurable: true, value: true });
    Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: {
            __TAURI_INTERNALS__: {
                async invoke(command: string, args: Record<string, unknown>) {
                    calls.push({ command, args });
                    if (command === 'plugin:dialog|save') return path;
                    if (command === 'begin_safe_file_save') {
                        const tempPath = tempPathFor(args.path as string);
                        pending.set(tempPath, args.path as string);
                        files.set(tempPath, Buffer.alloc(0));
                        return tempPath;
                    }
                    if (command === 'plugin:fs|open') {
                        openPath = args.path as string;
                        files.set(openPath, Buffer.alloc(0));
                        return 91;
                    }
                    if (command === 'plugin:fs|write') {
                        const data = args.data as Uint8Array;
                        const count = write(data);
                        const chunk = data.subarray(0, count);
                        files.set(openPath, Buffer.concat([files.get(openPath)!, chunk]));
                        return count;
                    }
                    if (command === 'plugin:resources|close') return;
                    if (command === 'finish_safe_file_save') {
                        const tempPath = args.tempPath as string;
                        const destination = pending.get(tempPath)!;
                        pending.delete(tempPath);
                        try {
                            finish();
                            files.set(destination, files.get(tempPath)!);
                        } finally {
                            files.delete(tempPath);
                        }
                        return;
                    }
                    if (command === 'discard_safe_file_save') {
                        pending.delete(args.tempPath as string);
                        files.delete(args.tempPath as string);
                        return;
                    }
                    if (command === 'plugin:dialog|message') return 'Ok';
                    throw new Error(`Unexpected native command: ${command}`);
                },
            },
        },
    });
    try {
        await run(saveBlobToFile, calls, files);
    } finally {
        if (windowDescriptor) Object.defineProperty(globalThis, 'window', windowDescriptor);
        else Reflect.deleteProperty(globalThis, 'window');
        if (tauriDescriptor) Object.defineProperty(globalThis, 'isTauri', tauriDescriptor);
        else Reflect.deleteProperty(globalThis, 'isTauri');
    }
}

test('native palette saves retry partial writes before reporting success', async () => {
    await withNativeSave(
        (data) => Math.min(data.byteLength, 7),
        async (save, calls, files) => {
            const path = await save(new Blob([JSON.stringify(palette)]), options);
            assert.equal(path, 'C:/prints/palette.kpal');
            assert.deepEqual(JSON.parse(files.get(path)!.toString('utf8')), palette);
            assert.deepEqual([...files.keys()], [path]);
            assert.deepEqual(calls.find(({ command }) => command === 'plugin:fs|open')?.args, {
                path: 'C:/prints/.palette.kpal.kromacut-tmp',
                options: { read: false, write: true, create: true, truncate: true },
            });
            assert.deepEqual(
                calls.slice(-3).map(({ command }) => command),
                ['plugin:resources|close', 'finish_safe_file_save', 'plugin:dialog|message']
            );
        }
    );
});

test('a failed native overwrite keeps the existing file contents', async () => {
    const path = 'C:/prints/palette.kpal';
    const original = Buffer.from(JSON.stringify({ ...palette, name: 'Original' }));
    let writes = 0;
    await withNativeSave(
        (data) => {
            if (++writes > 1) throw new Error('Disk full');
            return Math.min(data.byteLength, 7);
        },
        async (save, calls, files) => {
            await assert.rejects(save(new Blob([JSON.stringify(palette)]), options), /Disk full/);
            assert.deepEqual(files.get(path), original);
            assert.deepEqual([...files.keys()], [path]);
            assert.ok(calls.some(({ command }) => command === 'discard_safe_file_save'));
            assert.ok(!calls.some(({ command }) => command === 'finish_safe_file_save'));
            assert.ok(!calls.some(({ command }) => command === 'plugin:dialog|message'));
        },
        path,
        new Map([[path, original]])
    );
});

test('a failed native replace keeps the existing file without reporting success', async () => {
    const path = 'C:/prints/palette.kpal';
    const original = Buffer.from('original palette');
    await withNativeSave(
        (data) => data.byteLength,
        async (save, calls, files) => {
            await assert.rejects(
                save(new Blob([JSON.stringify(palette)]), options),
                /Access denied/
            );
            assert.deepEqual(files.get(path), original);
            assert.deepEqual([...files.keys()], [path]);
            assert.ok(!calls.some(({ command }) => command === 'plugin:dialog|message'));
        },
        path,
        new Map([[path, original]]),
        () => {
            throw new Error('Access denied');
        }
    );
});

test('native saves reject a zero-byte write and close the file without reporting success', async () => {
    await withNativeSave(
        () => 0,
        async (save, calls) => {
            await assert.rejects(save(new Blob([JSON.stringify(palette)]), options));
            assert.deepEqual(
                calls.slice(-2).map(({ command }) => command),
                ['plugin:resources|close', 'discard_safe_file_save']
            );
            assert.ok(!calls.some(({ command }) => command === 'plugin:dialog|message'));
        }
    );
});

test('native save write failures close the file without reporting success', async () => {
    await withNativeSave(
        () => {
            throw new Error('Disk full');
        },
        async (save, calls) => {
            await assert.rejects(save(new Blob([JSON.stringify(palette)]), options), /Disk full/);
            assert.deepEqual(
                calls.slice(-2).map(({ command }) => command),
                ['plugin:resources|close', 'discard_safe_file_save']
            );
            assert.ok(!calls.some(({ command }) => command === 'plugin:dialog|message'));
        }
    );
});

test('canceling a native palette save performs no filesystem operations', async () => {
    await withNativeSave(
        () => assert.fail('Cancellation must not write'),
        async (save, calls) => {
            assert.equal(await save(new Blob([JSON.stringify(palette)]), options), null);
            assert.deepEqual(
                calls.map(({ command }) => command),
                ['plugin:dialog|save']
            );
        },
        null
    );
});
