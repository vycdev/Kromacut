import { invoke } from '@tauri-apps/api/core';

/** Must match `FILE_NAME_HEADER` in `src-tauri/src/slicer_handoff.rs`. */
const SLICER_FILE_NAME_HEADER = 'X-Kromacut-File-Name';
/** Must match `SLICER_APP_HEADER` in `src-tauri/src/slicer_handoff.rs`. */
const SLICER_APP_HEADER = 'X-Kromacut-Slicer-App';

/** A slicer the desktop app can open models with, as reported by the native side. */
export interface SlicerApp {
    name: string;
    path: string;
}

/** Desktop only: slicers installed in their usual locations (Bambu Studio, Orca, Prusa, Cura). */
export function listSlicerApps(): Promise<SlicerApp[]> {
    return invoke<SlicerApp[]>('list_slicer_apps');
}

/** Desktop only: the slicer at `path`, or `null` when it no longer exists or cannot launch. */
export function findSlicerApp(path: string): Promise<SlicerApp | null> {
    return invoke<SlicerApp | null>('find_slicer_app', { path });
}

/**
 * Desktop only: lets the user pick a slicer app with the native file dialog. Resolves to `null`
 * when the dialog is cancelled and rejects when the picked file is not a launchable app.
 */
export function pickSlicerApp(title: string, filterName: string): Promise<SlicerApp | null> {
    return invoke<SlicerApp | null>('pick_slicer_app', { title, filterName });
}

/**
 * Desktop only: hands an exported 3MF to the native app, which writes it to Kromacut's cache and
 * opens it with `slicer`, or with the system's default 3MF application when `slicer` is `null`.
 * The archive travels as raw IPC bytes rather than JSON so large models are not inflated into
 * number arrays. Header values must be ASCII, so the slicer path is percent-encoded. Resolves to
 * the opened path.
 */
export async function openModelInSlicer(
    blob: Blob,
    fileName: string,
    slicer: SlicerApp | null = null
): Promise<string> {
    const model = new Uint8Array(await blob.arrayBuffer());
    const headers: Record<string, string> = { [SLICER_FILE_NAME_HEADER]: fileName };
    if (slicer) headers[SLICER_APP_HEADER] = encodeURIComponent(slicer.path);
    return invoke<string>('open_model_in_slicer', model, { headers });
}
