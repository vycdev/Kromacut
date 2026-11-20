import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { decodeProject, encodeProject, type ProjectFile } from '../lib/projectFile';
import { saveBlobToFile } from '../hooks/saveBlobToFile';
interface Props {
    disabled: boolean;
    canSave: boolean;
    name: string;
    onNameChange: (name: string) => void;
    onCapture: () => Promise<ProjectFile>;
    onRestore: (project: ProjectFile) => Promise<void>;
}
export default function ProjectControls({
    disabled,
    canSave,
    name,
    onNameChange,
    onCapture,
    onRestore,
}: Props) {
    const { t } = useTranslation('workspace');
    const [busy, setBusy] = useState(false);
    const running = useRef(false);
    const [status, setStatus] = useState<string | null>(null);
    const [pending, setPending] = useState<ProjectFile | null>(null);
    const input = useRef<HTMLInputElement>(null),
        dialog = useRef<HTMLDialogElement>(null);
    useEffect(() => {
        if (pending) dialog.current?.showModal();
    }, [pending]);
    const error = (e: unknown) =>
        setStatus(
            e instanceof Error && ['version', 'tooLarge'].includes(e.message) ? e.message : 'error'
        );
    async function save() {
        if (running.current || disabled || !canSave) return;
        running.current = true;
        setBusy(true);
        setStatus(null);
        try {
            const project = await onCapture();
            const archive = await encodeProject(project);
            const saved = await saveBlobToFile(archive, {
                defaultFileName: `${
                    Array.from(name)
                        .filter((c) => c.charCodeAt(0) >= 32)
                        .join('')
                        .replace(/[<>:"/\\|?*]/g, '_')
                        .trim() || 'Kromacut'
                }.kromacut`,
                extension: 'kromacut',
                filterName: 'Kromacut',
            });
            if (saved) setStatus('saved');
        } catch (e) {
            error(e);
        } finally {
            running.current = false;
            setBusy(false);
        }
    }
    async function open(file: File) {
        if (running.current || disabled) return;
        running.current = true;
        setBusy(true);
        setStatus(null);
        try {
            setPending(await decodeProject(file));
        } catch (e) {
            error(e);
        } finally {
            running.current = false;
            setBusy(false);
        }
    }
    async function restore() {
        if (!pending || running.current || disabled) return;
        running.current = true;
        setBusy(true);
        setStatus(null);
        try {
            await onRestore(pending);
            setPending(null);
            setStatus('opened');
        } catch (e) {
            setPending(null);
            error(e);
        } finally {
            running.current = false;
            setBusy(false);
        }
    }
    return (
        <section className="border-b p-3 space-y-2" aria-label={t('project.title')}>
            <label className="flex items-center gap-2 text-sm">
                <span>{t('project.title')}</span>
                <input
                    aria-label={t('project.name')}
                    className="border rounded bg-background px-2 min-w-0 flex-1"
                    value={name}
                    maxLength={256}
                    disabled={busy || disabled}
                    onChange={(e) => onNameChange(e.target.value)}
                />
            </label>
            <div className="flex flex-wrap gap-2">
                <button
                    className="border rounded px-2 py-1 disabled:opacity-40"
                    disabled={busy || disabled || !canSave}
                    onClick={save}
                >
                    {t('project.save')}
                </button>
                <button
                    className="border rounded px-2 py-1 disabled:opacity-40"
                    disabled={busy || disabled}
                    onClick={() => input.current?.click()}
                >
                    {t('project.open')}
                </button>
                <input
                    ref={input}
                    type="file"
                    accept=".kromacut"
                    data-testid="project-file-input"
                    className="hidden"
                    disabled={busy || disabled}
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (file && !busy && !disabled) void open(file);
                    }}
                />
            </div>
            {(busy || status) && (
                <p
                    role={
                        status === 'error' || status === 'tooLarge' || status === 'version'
                            ? 'alert'
                            : 'status'
                    }
                    className="text-sm"
                >
                    {t(`project.${busy ? 'busy' : status}`)}
                </p>
            )}
            {pending && (
                <dialog
                    ref={dialog}
                    aria-label={t('project.open')}
                    onCancel={(e) => {
                        e.preventDefault();
                        if (!busy) setPending(null);
                    }}
                    className="fixed inset-0 m-auto w-[min(480px,90vw)] bg-card text-foreground border rounded p-5 shadow-xl backdrop:bg-black/70"
                >
                    <h2 className="font-semibold">{pending.state.name}</h2>
                    <p className="my-3">{t('project.replace')}</p>
                    <div className="flex justify-end gap-2">
                        <button
                            disabled={busy}
                            className="border rounded px-3 py-2"
                            onClick={() => setPending(null)}
                        >
                            {t('project.cancel')}
                        </button>
                        <button
                            disabled={busy || disabled}
                            className="border rounded px-3 py-2"
                            onClick={restore}
                        >
                            {t('project.open')}
                        </button>
                    </div>
                </dialog>
            )}
        </section>
    );
}
