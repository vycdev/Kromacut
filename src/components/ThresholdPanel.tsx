import { useEffect, useMemo, useRef, useState } from 'react';
import * as Slider from '@radix-ui/react-slider';
import { useTranslation } from 'react-i18next';
import { thresholdPixels, evenThresholds, orderedThresholdBands } from '../lib/thresholds';

interface Props {
    imageSrc: string | null;
    currentColors: string[];
    getImage: () => Promise<Blob | null>;
    palettes: { id: string; label: string; colors: string[] }[];
    onApply: (url: string, colors: string[]) => void;
}

export default function ThresholdPanel({
    imageSrc,
    palettes,
    currentColors,
    getImage,
    onApply,
}: Props) {
    const { t } = useTranslation('workspace');
    const [open, setOpen] = useState(false);
    const [paletteColors, setColors] = useState(['#000000', '#888888', '#ffffff']);
    const bands = useMemo(() => orderedThresholdBands(paletteColors), [paletteColors]);
    const colors = useMemo(() => bands.map((b) => b.color), [bands]);
    const [thresholds, setThresholds] = useState(evenThresholds(3));
    const [source, setSource] = useState<ImageData | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(false);
    const [original, setOriginal] = useState(false);
    const canvas = useRef<HTMLCanvasElement>(null);
    const dialog = useRef<HTMLDialogElement>(null);
    const fullImage = useRef<HTMLImageElement | null>(null);
    const captureImage = useRef(getImage);
    captureImage.current = getImage;
    const buttonStyle = 'rounded border px-3 py-2 hover:bg-muted disabled:opacity-40';

    useEffect(() => {
        if (!open || !imageSrc) return;
        let cancelled = false;
        setSource(null);
        setError(false);
        dialog.current?.showModal();
        const img = new Image();
        let sourceUrl: string | undefined;
        img.onload = () => {
            if (cancelled) return;
            fullImage.current = img;
            // Bound preview work; Apply always processes the full-resolution source.
            const scale = Math.min(1, 1000 / Math.max(img.width, img.height));
            const c = document.createElement('canvas');
            c.width = Math.max(1, Math.round(img.width * scale));
            c.height = Math.max(1, Math.round(img.height * scale));
            const ctx = c.getContext('2d')!;
            ctx.drawImage(img, 0, 0, c.width, c.height);
            const data = ctx.getImageData(0, 0, c.width, c.height);
            setSource(data);
        };
        img.onerror = () => {
            if (!cancelled) setError(true);
        };
        void captureImage
            .current()
            .then((blob) => {
                if (cancelled) return;
                if (!blob) throw new Error('No preview image');
                sourceUrl = URL.createObjectURL(blob);
                img.src = sourceUrl;
            })
            .catch(() => {
                if (!cancelled) setError(true);
            });
        return () => {
            cancelled = true;
            fullImage.current = null;
            if (sourceUrl) URL.revokeObjectURL(sourceUrl);
        };
    }, [open, imageSrc]);

    useEffect(() => {
        if (!open || !source) return;
        const frame = requestAnimationFrame(() => {
            const c = canvas.current;
            if (!c) return;
            c.width = source.width;
            c.height = source.height;
            const pixels = original
                ? source
                : new ImageData(
                      thresholdPixels(source.data, thresholds, colors),
                      source.width,
                      source.height
                  );
            c.getContext('2d')!.putImageData(pixels, 0, 0);
        });
        return () => cancelAnimationFrame(frame);
    }, [open, source, thresholds, colors, original]);

    function changeCount(count: number) {
        if (!Number.isInteger(count) || count < 2 || count > 64) return;
        setColors((prev) =>
            Array.from(
                { length: count },
                (_, i) =>
                    prev[i] ??
                    '#' +
                        Math.round((255 * i) / (count - 1))
                            .toString(16)
                            .padStart(2, '0')
                            .repeat(3)
            )
        );
        setThresholds(evenThresholds(count));
    }
    function changeThreshold(index: number, value: number) {
        if (!Number.isFinite(value)) return;
        setThresholds((prev) =>
            prev.map((v, i) =>
                i === index
                    ? Math.max(
                          index ? prev[index - 1] + 1 : 1,
                          Math.min(
                              index < prev.length - 1 ? prev[index + 1] - 1 : 255,
                              Math.round(value)
                          )
                      )
                    : v
            )
        );
    }
    async function apply() {
        const img = fullImage.current;
        if (!img || busy) return;
        setBusy(true);
        try {
            await new Promise((resolve) => setTimeout(resolve, 0));
            const c = document.createElement('canvas');
            c.width = img.width;
            c.height = img.height;
            const ctx = c.getContext('2d')!;
            ctx.drawImage(img, 0, 0);
            const data = ctx.getImageData(0, 0, c.width, c.height);
            data.data.set(thresholdPixels(data.data, thresholds, colors));
            ctx.putImageData(data, 0, 0);
            const blob = await new Promise<Blob | null>((resolve) =>
                c.toBlob(resolve, 'image/png')
            );
            if (!blob) throw new Error('PNG encoding failed');
            onApply(URL.createObjectURL(blob), colors);
            setOpen(false);
        } catch {
            setError(true);
        } finally {
            setBusy(false);
        }
    }
    return (
        <section className="rounded border p-3 space-y-2">
            <h3 className="font-semibold">{t('threshold.title')}</h3>
            <p className="text-sm text-muted-foreground">{t('threshold.summary')}</p>
            <button
                className={buttonStyle}
                disabled={!imageSrc}
                onClick={() => {
                    const current = [
                        ...new Set(
                            currentColors
                                .filter((color) => /^#[0-9a-f]{6}$/i.test(color))
                                .map((color) => color.toUpperCase())
                        ),
                    ].slice(0, 64);
                    if (current.length === 1) current.push(current[0]);
                    if (current.length >= 2) {
                        setColors(current);
                        if (thresholds.length !== current.length - 1)
                            setThresholds(evenThresholds(current.length));
                    }
                    setOriginal(false);
                    setOpen(true);
                }}
            >
                {t('threshold.open')}
            </button>
            {open && (
                <dialog
                    ref={dialog}
                    onCancel={(e) => {
                        e.preventDefault();
                        if (!busy) setOpen(false);
                    }}
                    className="fixed inset-0 m-auto w-[min(1100px,95vw)] max-h-[95vh] overflow-auto bg-card text-foreground border rounded-xl p-5 shadow-xl backdrop:bg-black/70"
                >
                    <h2 className="text-xl font-semibold">{t('threshold.title')}</h2>
                    <p className="text-sm my-2">{t('threshold.help')}</p>
                    <div className="grid md:grid-cols-[1fr_300px] gap-6">
                        <div className="min-w-0">
                            <div className="bg-muted flex justify-center items-center h-[min(52vh,550px)]">
                                <canvas
                                    ref={canvas}
                                    data-testid="threshold-preview"
                                    style={{
                                        maxWidth: '100%',
                                        maxHeight: '100%',
                                        objectFit: 'contain',
                                    }}
                                />
                            </div>
                            <label className="flex gap-2 mt-3">
                                <input
                                    type="checkbox"
                                    checked={original}
                                    onChange={(e) => setOriginal(e.target.checked)}
                                />
                                {t('threshold.original')}
                            </label>
                            <div className="mt-6 px-3 pb-7">
                                <Slider.Root
                                    min={1}
                                    max={255}
                                    step={1}
                                    minStepsBetweenThumbs={1}
                                    value={thresholds}
                                    onValueChange={setThresholds}
                                    className="relative flex items-center w-full h-10 touch-none select-none"
                                >
                                    <Slider.Track
                                        className="relative grow h-5 rounded border"
                                        style={{
                                            background: 'linear-gradient(to right, #000, #fff)',
                                        }}
                                    />
                                    {thresholds.map((value, i) => (
                                        <Slider.Thumb
                                            key={i}
                                            aria-label={t('threshold.boundary', { n: i + 1 })}
                                            className="block relative w-5 h-10 cursor-ew-resize focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
                                        >
                                            <span
                                                style={{
                                                    position: 'absolute',
                                                    top: 20,
                                                    left: 0,
                                                    width: 20,
                                                    height: 17,
                                                    filter: 'drop-shadow(0 0 1px white) drop-shadow(0 1px 1px black)',
                                                }}
                                            >
                                                <span
                                                    data-testid="threshold-marker"
                                                    style={{
                                                        display: 'block',
                                                        width: '100%',
                                                        height: '100%',
                                                        clipPath:
                                                            'polygon(50% 0, 100% 100%, 0 100%)',
                                                        background: `linear-gradient(to right, ${colors[i]} 50%, ${colors[i + 1]} 50%)`,
                                                    }}
                                                />
                                            </span>
                                            <span className="absolute top-9 left-1/2 -translate-x-1/2 text-xs font-mono">
                                                {value}
                                            </span>
                                        </Slider.Thumb>
                                    ))}
                                </Slider.Root>
                            </div>
                        </div>
                        <div className="space-y-3 max-h-[65vh] overflow-auto">
                            <label className="block space-y-1">
                                {t('threshold.cached')}
                                <select
                                    aria-label={t('threshold.cached')}
                                    value=""
                                    className="w-full border rounded p-2 bg-background"
                                    onChange={(e) => {
                                        const palette = palettes.find(
                                            (p) => p.id === e.target.value
                                        );
                                        if (
                                            !palette ||
                                            palette.colors.length < 2 ||
                                            palette.colors.length > 64
                                        )
                                            return;
                                        setColors([...palette.colors]);
                                        if (palette.colors.length !== colors.length)
                                            setThresholds(evenThresholds(palette.colors.length));
                                    }}
                                >
                                    <option value="">{t('threshold.chooseCached')}</option>
                                    {palettes
                                        .filter(
                                            (p) => p.colors.length >= 2 && p.colors.length <= 64
                                        )
                                        .map((p) => (
                                            <option key={p.id} value={p.id}>
                                                {p.label}
                                            </option>
                                        ))}
                                </select>
                            </label>
                            <label className="flex items-center justify-between">
                                {t('threshold.count')}
                                <input
                                    aria-label={t('threshold.count')}
                                    type="number"
                                    min={2}
                                    max={64}
                                    value={colors.length}
                                    onChange={(e) => changeCount(Number(e.target.value))}
                                    className="border rounded w-20 p-1 bg-background"
                                />
                            </label>
                            <button
                                className={buttonStyle}
                                onClick={() => setThresholds(evenThresholds(colors.length))}
                            >
                                {t('threshold.reset')}
                            </button>
                            {colors.map((color, i) => (
                                <div key={bands[i].id} className="border rounded p-2 space-y-2">
                                    <label className="flex items-center gap-2">
                                        <input
                                            type="color"
                                            aria-label={t('threshold.color', { n: i + 1 })}
                                            value={color}
                                            onChange={(e) =>
                                                setColors((prev) =>
                                                    prev.map((c, n) =>
                                                        n === bands[i].id ? e.target.value : c
                                                    )
                                                )
                                            }
                                        />
                                        <span>{t('threshold.color', { n: i + 1 })}</span>
                                        <span className="text-xs ml-auto">
                                            {i ? thresholds[i - 1] : 0}–
                                            {i < thresholds.length ? thresholds[i] - 1 : 255}
                                        </span>
                                    </label>
                                    {i < thresholds.length && (
                                        <label className="flex justify-between items-center text-sm">
                                            {t('threshold.boundary', { n: i + 1 })}
                                            <input
                                                aria-label={t('threshold.value', { n: i + 1 })}
                                                type="number"
                                                min={i ? thresholds[i - 1] + 1 : 1}
                                                max={
                                                    i + 1 < thresholds.length
                                                        ? thresholds[i + 1] - 1
                                                        : 255
                                                }
                                                value={thresholds[i]}
                                                onChange={(e) =>
                                                    changeThreshold(i, Number(e.target.value))
                                                }
                                                className="w-20 border rounded p-1 bg-background"
                                            />
                                        </label>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                    {error && <p role="alert">{t('threshold.error')}</p>}
                    <div className="flex justify-end gap-3 mt-4">
                        <button
                            className={buttonStyle}
                            disabled={busy}
                            onClick={() => setOpen(false)}
                        >
                            {t('threshold.cancel')}
                        </button>
                        <button className={buttonStyle} disabled={!source || busy} onClick={apply}>
                            {t(busy ? 'threshold.applying' : 'threshold.apply')}
                        </button>
                    </div>
                </dialog>
            )}
        </section>
    );
}
