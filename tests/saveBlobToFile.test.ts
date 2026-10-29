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

async function withNativeSave(
    write: (data: Uint8Array) => number,
    run: (save: SaveBlobModule['saveBlobToFile'], calls: NativeCall[]) => Promise<void>,
    path: string | null = 'C:/prints/palette.kpal'
) {
    const { saveBlobToFile } = await (saveModule ??=
        loadViteModule<SaveBlobModule>('/src/hooks/saveBlobToFile.ts'));
    const calls: NativeCall[] = [];
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
                    if (command === 'plugin:fs|open') return 91;
                    if (command === 'plugin:fs|write') return write(args.data as Uint8Array);
                    if (command === 'plugin:resources|close') return;
                    if (command === 'plugin:dialog|message') return 'Ok';
                    throw new Error(`Unexpected native command: ${command}`);
                },
            },
        },
    });
    try {
        await run(saveBlobToFile, calls);
    } finally {
        if (windowDescriptor) Object.defineProperty(globalThis, 'window', windowDescriptor);
        else Reflect.deleteProperty(globalThis, 'window');
        if (tauriDescriptor) Object.defineProperty(globalThis, 'isTauri', tauriDescriptor);
        else Reflect.deleteProperty(globalThis, 'isTauri');
    }
}

test('native palette saves retry partial writes before reporting success', async () => {
    const accepted: number[] = [];
    await withNativeSave(
        (data) => {
            const count = Math.min(data.byteLength, 7);
            accepted.push(...data.subarray(0, count));
            return count;
        },
        async (save, calls) => {
            const path = await save(new Blob([JSON.stringify(palette)]), options);
            assert.equal(path, 'C:/prints/palette.kpal');
            assert.deepEqual(JSON.parse(Buffer.from(accepted).toString('utf8')), palette);
            assert.deepEqual(calls.find(({ command }) => command === 'plugin:fs|open')?.args, {
                path,
                options: { read: false, write: true, create: true, truncate: true },
            });
            assert.deepEqual(calls.slice(-2).map(({ command }) => command), [
                'plugin:resources|close',
                'plugin:dialog|message',
            ]);
        }
    );
});

test('native saves reject a zero-byte write and close the file without reporting success', async () => {
    await withNativeSave(
        () => 0,
        async (save, calls) => {
            await assert.rejects(save(new Blob([JSON.stringify(palette)]), options));
            assert.equal(calls.at(-1)?.command, 'plugin:resources|close');
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
            assert.equal(calls.at(-1)?.command, 'plugin:resources|close');
            assert.ok(!calls.some(({ command }) => command === 'plugin:dialog|message'));
        }
    );
});

test('canceling a native palette save performs no filesystem operations', async () => {
    await withNativeSave(
        () => assert.fail('Cancellation must not write'),
        async (save, calls) => {
            assert.equal(await save(new Blob([JSON.stringify(palette)]), options), null);
            assert.deepEqual(calls.map(({ command }) => command), ['plugin:dialog|save']);
        },
        null
    );
});
