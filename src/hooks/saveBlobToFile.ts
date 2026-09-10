import { isTauri } from '@tauri-apps/api/core';
import { message, save } from '@tauri-apps/plugin-dialog';
import { open } from '@tauri-apps/plugin-fs';

export interface SaveBlobOptions {
    defaultFileName: string;
    extension: string;
    filterName: string;
}

async function writeBlobToTauriFile(filePath: string, blob: Blob) {
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
            await file.write(value);
        }
    } finally {
        reader.releaseLock();
        await file.close();
    }
}

export async function saveBlobToFile(
    blob: Blob,
    options: SaveBlobOptions
): Promise<string | null> {
    if (isTauri()) {
        const filePath = await save({
            title: `Save ${options.filterName}`,
            defaultPath: options.defaultFileName,
            filters: [
                {
                    name: options.filterName,
                    extensions: [options.extension],
                },
            ],
        });

        if (!filePath) return null;

        await writeBlobToTauriFile(filePath, blob);
        await message(`Saved to:\n${filePath}`, {
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
