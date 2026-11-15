import { invoke } from '@tauri-apps/api/core';

/** Must match `FILE_NAME_HEADER` in `src-tauri/src/slicer_handoff.rs`. */
const SLICER_FILE_NAME_HEADER = 'X-Kromacut-File-Name';

/**
 * Desktop only: hands an exported 3MF to the native app, which writes it to Kromacut's cache and
 * opens it with the system's default 3MF application. The archive travels as raw IPC bytes rather
 * than JSON so large models are not inflated into number arrays. Resolves to the opened path.
 */
export async function openModelInSlicer(blob: Blob, fileName: string): Promise<string> {
    const model = new Uint8Array(await blob.arrayBuffer());
    return invoke<string>('open_model_in_slicer', model, {
        headers: { [SLICER_FILE_NAME_HEADER]: fileName },
    });
}
