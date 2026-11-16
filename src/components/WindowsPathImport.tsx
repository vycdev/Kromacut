import { useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
export default function WindowsPathImport({ onFile }: { onFile: (file: File) => void }) {
    const { t } = useTranslation('workspace');
    const [path, setPath] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    if (!isTauri()) return null;
    async function open() {
        if (!path.trim() || busy) return;
        setBusy(true);
        setError('');
        try {
            const result = await invoke<{ name: string; mime: string; bytes: number[] }>(
                'read_image_path',
                { path }
            );
            const file = new File([new Uint8Array(result.bytes)], result.name, {
                type: result.mime,
            });
            const bitmap = await createImageBitmap(file);
            bitmap.close();
            onFile(file);
        } catch (err) {
            setError(String(err));
        } finally {
            setBusy(false);
        }
    }
    return (
        <section className="rounded border p-3 space-y-2">
            <h3 className="font-semibold">{t('threshold.windowsPath')}</h3>
            <p className="text-sm">{t('threshold.copyPath')}</p>
            <input
                aria-label={t('threshold.windowsPath')}
                placeholder={t('threshold.pathExample')}
                value={path}
                onChange={(e) => setPath(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') void open();
                }}
                className="w-full rounded border bg-background p-2"
            />
            <button
                disabled={busy || !path.trim()}
                onClick={open}
                className="border rounded px-3 py-2 disabled:opacity-40"
            >
                {t(busy ? 'threshold.openingPath' : 'threshold.openPath')}
            </button>
            {error && (
                <p role="alert" className="text-sm">
                    {error}
                </p>
            )}
        </section>
    );
}
