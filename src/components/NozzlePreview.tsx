import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { NozzleSession } from '../lib/projectFile';
import { useNozzlePatch } from '../hooks/useNozzlePatch';
import { useNozzleComparison } from '../hooks/useNozzleComparison';
import { loadPrintSettingsFromStorage, DEFAULT_PRINT_SETTINGS } from '../lib/printSettingsStorage';

interface Props {
    initial?: NozzleSession | null;
    onSessionChange?: (state: NozzleSession) => void;
    imageAvailable: boolean;
    getImage: () => Promise<Blob | null>;
    onApply: (blob: Blob) => void;
}
interface Source {
    blob: Blob;
    pixels: ImageData;
    originalWidth: number;
    originalHeight: number;
    defaultWidth: number;
}
interface Scenario {
    nozzle: number;
    line: number;
    width: number;
}
type PreviewMode = 'appearance' | 'risk' | 'original' | 'patched';
const buttonStyle = 'rounded border px-3 py-2 disabled:opacity-40';

function Comparison({
    source,
    value,
    onChange,
    label,
    mode,
    patchEnabled,
    applying,
    onApply,
}: {
    source: Source;
    value: Scenario;
    onChange: (value: Scenario) => void;
    label: string;
    mode: PreviewMode;
    patchEnabled: boolean;
    applying: boolean;
    onApply: () => void;
}) {
    const { t } = useTranslation('workspace');
    const canvas = useRef<HTMLCanvasElement>(null);
    const { result, busy, error } = useNozzleComparison(
        source.pixels,
        value.width,
        value.line,
        patchEnabled
    );
    const ratio = source.originalHeight / source.originalWidth;
    useEffect(() => {
        if (!canvas.current) return;
        const pixels = new Uint8ClampedArray(
            mode === 'original' || !result
                ? source.pixels.data
                : mode === 'appearance'
                  ? result.appearance.data
                  : result.data
        );
        if (mode === 'risk' && result)
            for (let i = 0; i < result.changeMask.length; i++) {
                const at = i * 4;
                if (!pixels[at + 3]) continue;
                if (result.changeMask[i]) {
                    pixels[at] = result.changeMask[i] === 1 ? 245 : 236;
                    pixels[at + 1] = result.changeMask[i] === 1 ? 158 : 72;
                    pixels[at + 2] = result.changeMask[i] === 1 ? 11 : 153;
                } else
                    for (let c = 0; c < 3; c++) pixels[at + c] = Math.round(pixels[at + c] * 0.5);
            }
        canvas.current.width = source.pixels.width;
        canvas.current.height = source.pixels.height;
        canvas.current
            .getContext('2d')!
            .putImageData(new ImageData(pixels, source.pixels.width, source.pixels.height), 0, 0);
    }, [source, result, mode]);
    const flagged = result
        ? result.diagnostics.reassignedPixelCount + result.diagnostics.unsupportedPixelCount
        : null;
    return (
        <section
            aria-label={label}
            className="border rounded p-3 space-y-3"
            data-testid="nozzle-scenario"
        >
            <h3 className="font-semibold">{label}</h3>
            <fieldset disabled={applying} className="grid grid-cols-2 gap-3">
                <label>
                    {t('nozzle.diameter')}
                    <select
                        aria-label={t('nozzle.diameter')}
                        className="block border rounded bg-background w-full p-1"
                        value={value.nozzle}
                        onChange={(e) => {
                            const nozzle = Number(e.target.value);
                            onChange({
                                ...value,
                                nozzle,
                                line: Number((nozzle * 1.05).toFixed(3)),
                            });
                        }}
                    >
                        {[0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.8, 1, 1.2].map((n) => (
                            <option key={n} value={n}>
                                {n} mm
                            </option>
                        ))}
                    </select>
                </label>
                <label>
                    {t('nozzle.lineWidth')}
                    <input
                        aria-label={t('nozzle.lineWidth')}
                        type="number"
                        min="0.05"
                        max="3"
                        step="0.01"
                        className="block border rounded bg-background w-full p-1"
                        value={value.line}
                        onChange={(e) => {
                            const line = Number(e.target.value);
                            if (line >= 0.05 && line <= 3) onChange({ ...value, line });
                        }}
                    />
                </label>
                <label>
                    {t('nozzle.width')}
                    <input
                        aria-label={t('nozzle.width')}
                        type="number"
                        min="1"
                        max="2000"
                        step="1"
                        className="block border rounded bg-background w-full p-1"
                        value={Number(value.width.toFixed(2))}
                        onChange={(e) => {
                            const width = Number(e.target.value);
                            if (width >= 1 && width <= 2000) onChange({ ...value, width });
                        }}
                    />
                </label>
                <label>
                    {t('nozzle.height')}
                    <input
                        aria-label={t('nozzle.height')}
                        type="number"
                        min={ratio}
                        max={2000 * ratio}
                        step="1"
                        className="block border rounded bg-background w-full p-1"
                        value={Number((value.width * ratio).toFixed(2))}
                        onChange={(e) => {
                            const width = Number(e.target.value) / ratio;
                            if (width >= 1 && width <= 2000) onChange({ ...value, width });
                        }}
                    />
                </label>
            </fieldset>
            <p className="text-xs text-muted-foreground">
                {t('nozzle.sample', { value: (value.width / source.pixels.width).toFixed(3) })}
            </p>
            {value.line < (2 * value.width) / source.pixels.width && (
                <p className="text-xs">{t('nozzle.undersampled')}</p>
            )}
            <div className="bg-muted flex items-center justify-center min-h-32">
                <canvas
                    ref={canvas}
                    data-testid="nozzle-preview-canvas"
                    className="w-full h-auto max-w-full max-h-[42vh] object-contain"
                    style={{ imageRendering: 'pixelated' }}
                />
            </div>
            <p
                role="status"
                data-testid="nozzle-result"
                data-flagged={flagged ?? ''}
                data-changed={result?.appearance.changedPixelCount ?? ''}
            >
                {busy
                    ? t('nozzle.analyzing')
                    : error
                      ? t('nozzle.error')
                      : result
                        ? mode === 'original'
                            ? t('nozzle.original')
                            : mode === 'patched'
                              ? t('nozzle.patched')
                              : mode === 'appearance' && !result.appearance.coreCount
                                ? t('nozzle.noCores')
                                : t(mode === 'appearance' ? 'nozzle.changed' : 'nozzle.flagged', {
                                      value: (
                                          (100 *
                                              (mode === 'appearance'
                                                  ? result.appearance.changedPixelCount
                                                  : (flagged ?? 0))) /
                                          Math.max(1, result.diagnostics.sourceOpaquePixelCount)
                                      ).toFixed(2),
                                  })
                        : ''}
            </p>
            {patchEnabled && (
                <>
                    <p className="text-sm" data-testid="nozzle-patch-result">
                        {busy
                            ? t('nozzle.analyzing')
                            : result?.patch
                              ? t('nozzle.patchStats', {
                                    regions: result.patch.patchedRegionCount,
                                    pixels: result.patch.changedPixelCount,
                                    remaining: result.patch.unresolvedPixelCount,
                                })
                              : ''}
                    </p>
                    <button
                        className={buttonStyle}
                        disabled={busy || error || applying || !result?.patch}
                        onClick={onApply}
                    >
                        {t(applying ? 'nozzle.applying' : 'nozzle.applyPatch')}
                    </button>
                </>
            )}
        </section>
    );
}

export default function NozzlePreview({
    imageAvailable,
    getImage,
    onApply,
    initial,
    onSessionChange,
}: Props) {
    const { t } = useTranslation('workspace');
    const [open, setOpen] = useState(false);
    const [source, setSource] = useState<Source | null>(null);
    const [error, setError] = useState(false);
    const [mode, setMode] = useState<PreviewMode>(initial?.mode ?? 'appearance');
    const [patchEnabled, setPatchEnabled] = useState(initial?.patchEnabled ?? false);
    const patch = useNozzlePatch();
    const [linked, setLinked] = useState(initial?.linked ?? true);
    const [scenarios, setScenarios] = useState<Scenario[]>(
        initial?.scenarios ?? [
            { nozzle: 0.4, line: 0.42, width: 100 },
            { nozzle: 0.2, line: 0.21, width: 100 },
        ]
    );
    const initializedWidth = useRef(!!initial);
    useEffect(() => {
        if (initializedWidth.current) onSessionChange?.({ scenarios, linked, patchEnabled, mode });
    }, [scenarios, linked, patchEnabled, mode, onSessionChange]);
    const dialog = useRef<HTMLDialogElement>(null);
    const generation = useRef(0);
    useEffect(() => {
        if (open) dialog.current?.showModal();
    }, [open]);
    useEffect(
        () => () => {
            generation.current++;
        },
        []
    );
    const close = () => {
        patch.cancel();
        generation.current++;
        setOpen(false);
        setSource(null);
    };
    async function start() {
        const id = ++generation.current;
        setSource(null);
        setError(false);
        setOpen(true);
        let bitmap: ImageBitmap | undefined;
        try {
            const blob = await getImage();
            if (!blob) throw new Error('No image');
            bitmap = await createImageBitmap(blob);
            const full = document.createElement('canvas');
            full.width = bitmap.width;
            full.height = bitmap.height;
            const ctx = full.getContext('2d')!;
            ctx.drawImage(bitmap, 0, 0);
            const data = ctx.getImageData(0, 0, full.width, full.height).data;
            let minX = full.width,
                minY = full.height,
                maxX = -1,
                maxY = -1;
            for (let y = 0; y < full.height; y++)
                for (let x = 0; x < full.width; x++)
                    if (data[(y * full.width + x) * 4 + 3]) {
                        minX = Math.min(minX, x);
                        minY = Math.min(minY, y);
                        maxX = Math.max(maxX, x);
                        maxY = Math.max(maxY, y);
                    }
            if (maxX < 0) throw new Error('Empty image');
            const width = maxX - minX + 1,
                height = maxY - minY + 1;
            const scale = Math.min(1, 1024 / Math.max(width, height));
            const preview = document.createElement('canvas');
            preview.width = Math.max(1, Math.round(width * scale));
            preview.height = Math.max(1, Math.round(height * scale));
            const out = preview.getContext('2d')!;
            out.imageSmoothingEnabled = false;
            out.drawImage(full, minX, minY, width, height, 0, 0, preview.width, preview.height);
            if (id !== generation.current) return;
            const pixelSize =
                loadPrintSettingsFromStorage()?.pixelSize ?? DEFAULT_PRINT_SETTINGS.pixelSize;
            const defaultWidth = Math.min(2000, Math.max(1, width * pixelSize));
            if (!initializedWidth.current) {
                setScenarios((prev) => prev.map((s) => ({ ...s, width: defaultWidth })));
                initializedWidth.current = true;
            }
            setSource({
                blob,
                pixels: out.getImageData(0, 0, preview.width, preview.height),
                originalWidth: width,
                originalHeight: height,
                defaultWidth,
            });
        } catch {
            if (id === generation.current) setError(true);
        } finally {
            bitmap?.close();
        }
    }
    return (
        <section className="border rounded p-3 space-y-2">
            <h3 className="font-semibold">{t('nozzle.title')}</h3>
            <button className={buttonStyle} disabled={!imageAvailable} onClick={start}>
                {t('nozzle.open')}
            </button>
            {open && (
                <dialog
                    ref={dialog}
                    aria-label={t('nozzle.title')}
                    onCancel={(e) => {
                        e.preventDefault();
                        close();
                    }}
                    className="fixed inset-0 m-auto w-[min(1200px,96vw)] max-h-[95vh] overflow-auto bg-card text-foreground border rounded-xl p-5 shadow-xl backdrop:bg-black/70"
                >
                    <h2 className="text-xl font-semibold">{t('nozzle.title')}</h2>
                    <p className="text-sm my-2">
                        {t('nozzle.estimate')} {t('nozzle.best')} {t('nozzle.noChanges')}
                    </p>
                    <fieldset disabled={patch.busy} className="flex flex-wrap gap-4 my-3 text-sm">
                        <label>
                            <input
                                type="checkbox"
                                checked={linked}
                                onChange={(e) => {
                                    setLinked(e.target.checked);
                                    if (e.target.checked)
                                        setScenarios((prev) => [
                                            prev[0],
                                            { ...prev[1], width: prev[0].width },
                                        ]);
                                }}
                            />{' '}
                            {t('nozzle.link')}
                        </label>
                        <label>
                            {t('nozzle.view')}{' '}
                            <select
                                aria-label={t('nozzle.view')}
                                value={mode}
                                onChange={(e) => setMode(e.target.value as PreviewMode)}
                                className="bg-background border rounded p-1"
                            >
                                {patchEnabled && (
                                    <option value="patched">{t('nozzle.patched')}</option>
                                )}
                                <option value="appearance">{t('nozzle.appearance')}</option>
                                <option value="risk">{t('nozzle.overlay')}</option>
                                <option value="original">{t('nozzle.original')}</option>
                            </select>
                        </label>
                        <label>
                            <input
                                type="checkbox"
                                checked={patchEnabled}
                                onChange={(e) => {
                                    setPatchEnabled(e.target.checked);
                                    setMode(e.target.checked ? 'patched' : 'appearance');
                                }}
                            />{' '}
                            {t('nozzle.patchToggle')}
                        </label>
                        <button
                            className={buttonStyle}
                            disabled={!source}
                            onClick={() =>
                                setScenarios((prev) =>
                                    prev.map((s) => ({ ...s, width: source!.defaultWidth }))
                                )
                            }
                        >
                            {t('nozzle.currentSize')}
                        </button>
                    </fieldset>
                    {patchEnabled && (
                        <p className="text-sm mb-3">
                            {t('nozzle.patchHelp')} {t('nozzle.patchApplyHelp')}
                        </p>
                    )}
                    {patch.status && (
                        <p role="alert">
                            {t(patch.status === 'error' ? 'nozzle.error' : 'nozzle.noPatch')}
                        </p>
                    )}
                    <p className="text-xs mb-3">
                        {t('nozzle.autoWidth')} {t('nozzle.aspect')} {t('nozzle.bounds')}
                    </p>
                    {!source && <p role="status">{t(error ? 'nozzle.error' : 'nozzle.loading')}</p>}
                    {source && (
                        <>
                            {(source.originalWidth !== source.pixels.width ||
                                source.originalHeight !== source.pixels.height) && (
                                <p className="text-sm">
                                    {t('nozzle.sampled', {
                                        width: source.pixels.width,
                                        height: source.pixels.height,
                                    })}
                                </p>
                            )}
                            <div className="grid md:grid-cols-2 gap-4">
                                {scenarios.map((value, index) => (
                                    <Comparison
                                        key={index}
                                        source={source}
                                        value={value}
                                        label={t('nozzle.scenario', { n: index + 1 })}
                                        mode={mode}
                                        patchEnabled={patchEnabled}
                                        applying={patch.busy}
                                        onApply={async () => {
                                            const id = generation.current;
                                            const blob = await patch.apply(
                                                source.blob,
                                                source.originalWidth,
                                                value.width,
                                                value.line
                                            );
                                            if (blob && id === generation.current) {
                                                onApply(blob);
                                                close();
                                            }
                                        }}
                                        onChange={(next) =>
                                            setScenarios((prev) =>
                                                prev.map((s, i) =>
                                                    i === index
                                                        ? next
                                                        : linked
                                                          ? { ...s, width: next.width }
                                                          : s
                                                )
                                            )
                                        }
                                    />
                                ))}
                            </div>
                            {mode === 'risk' ? (
                                <div
                                    className="border rounded p-3 my-3 space-y-2 text-sm"
                                    data-testid="nozzle-legend"
                                >
                                    <strong>{t('nozzle.legend')}</strong>
                                    <div className="flex flex-wrap gap-4">
                                        <span className="flex gap-2 items-center">
                                            <i className="w-4 h-4 bg-neutral-600 rounded" />
                                            {t('nozzle.notFlagged')}
                                        </span>
                                        <span className="flex gap-2 items-center">
                                            <i className="w-4 h-4 bg-amber-500 rounded" />
                                            {t('nozzle.amber')}
                                        </span>
                                        <span className="flex gap-2 items-center">
                                            <i className="w-4 h-4 bg-pink-500 rounded" />
                                            {t('nozzle.pink')}
                                        </span>
                                    </div>
                                    <p>
                                        {t('nozzle.riskDefinition')} {t('nozzle.fitDefinition')}
                                    </p>
                                    <p>
                                        {t('nozzle.riskCategories')} {t('nozzle.notSeverity')}
                                    </p>
                                    <p>
                                        {t('nozzle.areaDefinition')} {t('nozzle.notProbability')}
                                    </p>
                                </div>
                            ) : mode === 'appearance' ? (
                                <p className="text-sm my-3">
                                    {t('nozzle.appearanceHelp')} {t('nozzle.appearanceDetails')}{' '}
                                    {t('nozzle.appearanceEdges')} {t('nozzle.silhouette')}
                                </p>
                            ) : null}
                            <p className="text-xs text-muted-foreground">
                                {t('nozzle.limits')} {t('nozzle.attached')} {t('nozzle.slicer')}
                            </p>
                        </>
                    )}
                    <div className="flex justify-end mt-4">
                        <button className={buttonStyle} onClick={close}>
                            {t('nozzle.close')}
                        </button>
                    </div>
                </dialog>
            )}
        </section>
    );
}
