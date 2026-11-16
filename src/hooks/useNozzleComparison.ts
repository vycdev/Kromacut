import { useEffect, useRef, useState } from 'react';
import { concealPrintableFeatureBuffers } from '../lib/printableFeatures';
import type {
    NozzleComparisonResponse,
    NozzleComparisonResult,
} from '../workers/nozzlePreview.worker';

/** Bounded image analysis only; no optimizer, mesh generation or slicing. */
export function useNozzleComparison(
    source: ImageData | null,
    widthMm: number,
    lineWidthMm: number,
    patchEnabled = false
) {
    const [result, setResult] = useState<NozzleComparisonResult | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(false);
    const cache = useRef<{ source: ImageData | null; values: Map<string, NozzleComparisonResult> }>(
        { source: null, values: new Map() }
    );
    useEffect(() => {
        setResult(null);
        setError(false);
        if (!source) {
            setBusy(false);
            return;
        }
        if (cache.current.source !== source) cache.current = { source, values: new Map() };
        const key = `${widthMm}:${lineWidthMm}:${patchEnabled}`;
        const cached = cache.current.values.get(key);
        if (cached) {
            setResult(cached);
            setBusy(false);
            return;
        }
        setBusy(true);
        let worker: Worker | undefined;
        let cancelled = false;
        const timer = setTimeout(() => {
            try {
                worker = new Worker(
                    new URL('../workers/nozzlePreview.worker.ts', import.meta.url),
                    { type: 'module' }
                );
                worker.onmessage = (event: MessageEvent<NozzleComparisonResponse>) => {
                    if (cancelled) return;
                    if (event.data.result) {
                        const value = concealPrintableFeatureBuffers(event.data.result);
                        concealPrintableFeatureBuffers(value.appearance);
                        cache.current.values.set(key, value);
                        if (cache.current.values.size > 4)
                            cache.current.values.delete(cache.current.values.keys().next().value!);
                        setResult(value);
                    } else setError(true);
                    setBusy(false);
                    worker?.terminate();
                };
                worker.onerror = (event) => {
                    event.preventDefault();
                    if (cancelled) return;
                    setError(true);
                    setBusy(false);
                    worker?.terminate();
                };
                worker.onmessageerror = () => {
                    if (cancelled) return;
                    setError(true);
                    setBusy(false);
                    worker?.terminate();
                };
                const data = new Uint8ClampedArray(source.data);
                worker.postMessage(
                    {
                        id: 1,
                        width: source.width,
                        height: source.height,
                        data,
                        pixelSizeMm: widthMm / source.width,
                        lineWidthMm,
                        omitAtRiskPixels: false,
                        patchEnabled,
                    },
                    [data.buffer]
                );
            } catch {
                setError(true);
                setBusy(false);
            }
        }, 180);
        return () => {
            cancelled = true;
            clearTimeout(timer);
            worker?.terminate();
        };
    }, [source, widthMm, lineWidthMm, patchEnabled]);
    return { result, busy, error };
}
