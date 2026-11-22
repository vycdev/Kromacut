import { invoke, isTauri } from '@tauri-apps/api/core';
import { message, save } from '@tauri-apps/plugin-dialog';
import { open } from '@tauri-apps/plugin-fs';
import { translate } from '../lib/i18n';
import { translateRuntimeMessage } from '../lib/runtimeMessages';

export interface SaveBlobOptions {
    defaultFileName: string;
    extension: string;
    filterName: string;
}

async function streamBlobToTauriFile(filePath: string, blob: Blob) {
    const file = await open(filePath, {
        read: false,
        write: true,
        create: true,
        truncate: true,
    });
    const reader = blob.stream().getReader();

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            let offset = 0;
            while (offset < value.byteLength) {
                const written = await file.write(value.subarray(offset));
                if (written === 0) throw new Error(translate('messages:files.writeFailed'));
                offset += written;
            }
        }
    } finally {
        reader.releaseLock();
        await file.close();
    }
}

// Writes next to the destination and renames over it only after the whole blob is written, so a
// failed overwrite leaves the existing file intact.
async function writeBlobToTauriFile(filePath: string, blob: Blob) {
    const tempPath = await invoke<string>('begin_safe_file_save', { path: filePath });
    try {
        await streamBlobToTauriFile(tempPath, blob);
    } catch (error) {
        await invoke('discard_safe_file_save', { tempPath }).catch(() => undefined);
        throw error;
    }
    await invoke('finish_safe_file_save', { tempPath });
}

export async function saveBlobToFile(blob: Blob, options: SaveBlobOptions): Promise<string | null> {
    if (isTauri()) {
        const filePath = await save({
            title: translate('messages:files.save', {
                format: translateRuntimeMessage(options.filterName),
            }),
            defaultPath: options.defaultFileName,
            filters: [
                {
                    name: translateRuntimeMessage(options.filterName),
                    extensions: [options.extension],
                },
            ],
        });

        if (!filePath) return null;

        await writeBlobToTauriFile(filePath, blob);
        await message(translate('messages:files.saved', { path: filePath }), {
            title: 'Kromacut',
            kind: 'info',
        });
        return filePath;
    }

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = options.defaultFileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    return options.defaultFileName;
}
