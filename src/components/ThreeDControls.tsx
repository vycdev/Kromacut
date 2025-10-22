import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Input, NumberInput } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import ThreeDColorRow from './ThreeDColorRow';
import { Sortable, SortableContent, SortableOverlay } from '@/components/ui/sortable';

type Swatch = { hex: string; a: number };

interface ThreeDControlsStateShape {
    layerHeight: number;
    baseSliceHeight: number;
    colorSliceHeights: number[];
    colorOrder: number[];
    filteredSwatches: Swatch[];
    pixelSize: number; // mm per pixel (XY)
}

interface ThreeDControlsProps {
    swatches: Swatch[] | null;
    onChange?: (state: ThreeDControlsStateShape) => void;
    /**
     * Persisted state from a previous mount used to hydrate this component
     * when the user switches away from 3D mode and comes back later.
     */
    persisted?: ThreeDControlsStateShape | null;
}

export default function ThreeDControls({ swatches, onChange, persisted }: ThreeDControlsProps) {
    // 3D printing controls (owned by this component)
    const [layerHeight, setLayerHeight] = useState<number>(persisted?.layerHeight ?? 0.12); // mm
    const [baseSliceHeight, setBaseSliceHeight] = useState<number>(
        persisted?.baseSliceHeight ?? 0.2
    );
    const [colorSliceHeights, setColorSliceHeights] = useState<number[]>(
        persisted?.colorSliceHeights?.slice() ?? []
    );
    const [pixelSize, setPixelSize] = useState<number>(persisted?.pixelSize ?? 0.1); // mm per pixel (XY plane)

    // derive non-transparent swatches once per render and memoize
    const filtered = useMemo(() => {
        return swatches ? swatches.filter((s) => s.a !== 0) : [];
    }, [swatches]);

    // ordering state: indices into `filtered` that control displayed order.
    const [colorOrder, setColorOrder] = useState<number[]>(persisted?.colorOrder?.slice() ?? []);
    const prevFilteredRef = useRef<Swatch[] | null>(
        persisted?.filteredSwatches ? persisted.filteredSwatches.slice() : null
    );
    const prevHeightsRef = useRef<number[]>(
        persisted?.colorSliceHeights ? persisted.colorSliceHeights.slice() : []
    );
    const prevOrderRef = useRef<number[]>(
        persisted?.colorOrder ? persisted.colorOrder.slice() : []
    );

    // guard so we only emit immediately after hydration if needed
    const hydratedRef = useRef<boolean>(false);
    useEffect(() => {
        if (persisted && !hydratedRef.current) {
            hydratedRef.current = true; // states already initialized from persisted above
        }
    }, [persisted]);

    // Note: baseSliceHeight is intentionally freeform now (no snapping to layerHeight).
    // We still enforce reasonable bounds when the user edits it.

    // Initialize or resize per-color slice heights and preserve ordering when swatches change.
    useEffect(() => {
        // If we have no swatches currently (e.g., initial mount while upstream still loading),
        // avoid clearing previously persisted state. We'll wait for real data.
        if (filtered.length === 0) return;

        const prevFiltered = prevFilteredRef.current || [];
        const prevHeights = prevHeightsRef.current || [];
        const prevOrder = prevOrderRef.current || [];

        // Map prior heights by (hex,a) signature for quick lookup.
        const heightMap = new Map<string, number>();
        for (let i = 0; i < prevFiltered.length; i++) {
            const pf = prevFiltered[i];
            const key = pf.hex + ':' + pf.a;
            heightMap.set(key, prevHeights[i]);
        }

        const nextHeights = filtered.map((s) => {
            const key = s.hex + ':' + s.a;
            const existing = heightMap.get(key);
            const base = typeof existing === 'number' ? existing : layerHeight;
            const clamped = Math.max(layerHeight, Math.min(10, base));
            const multiple = Math.round(clamped / layerHeight) * layerHeight;
            const snapped = Math.max(layerHeight, Math.min(10, multiple));
            return Number(snapped.toFixed(8));
        });
        setColorSliceHeights(nextHeights);

        // Reconstruct order using previous colorOrder mapping if available.
        const nextOrder: number[] = [];
        if (prevOrder.length && prevFiltered.length) {
            // prevOrder contains indices into prevFiltered; iterate in that order.
            for (const prevIdx of prevOrder) {
                const sw = prevFiltered[prevIdx];
                if (!sw) continue;
                const idx = filtered.findIndex((f) => f.hex === sw.hex && f.a === sw.a);
                if (idx !== -1 && !nextOrder.includes(idx)) nextOrder.push(idx);
            }
        }
        // Fallback / append any remaining colors not yet in order.
        for (let i = 0; i < filtered.length; i++) if (!nextOrder.includes(i)) nextOrder.push(i);
        setColorOrder(nextOrder);

        // Stash for next diff
        prevFilteredRef.current = filtered.slice();
        prevHeightsRef.current = nextHeights.slice();
        prevOrderRef.current = nextOrder.slice();
    }, [filtered, layerHeight]);

    // stable per-row change handler so memoized rows don't re-render due to
    // a new function identity being created each parent render
    const onRowChange = useCallback((idx: number, v: number) => {
        setColorSliceHeights((prev) => {
            const next = prev.slice();
            next[idx] = v;
            return next;
        });
    }, []);

    // Handle sortable reordering
    const handleColorOrderChange = useCallback((newOrder: string[]) => {
        const newColorOrder = newOrder.map((v) => Number(v));
        setColorOrder(newColorOrder);
        prevOrderRef.current = newColorOrder.slice();
    }, []);

    // Emit consolidated state upwards only when references or primitive values actually change.
    const lastEmittedRef = useRef<{
        layerHeight: number;
        baseSliceHeight: number;
        colorSliceHeights: number[];
        colorOrder: number[];
        filteredSwatches: Swatch[];
        pixelSize: number;
    } | null>(null);

    useEffect(() => {
        if (!onChange) return;
        const prev = lastEmittedRef.current;
        const same =
            prev &&
            prev.layerHeight === layerHeight &&
            prev.baseSliceHeight === baseSliceHeight &&
            prev.colorSliceHeights === colorSliceHeights &&
            prev.colorOrder === colorOrder &&
            prev.filteredSwatches === filtered &&
            prev.pixelSize === pixelSize;
        if (same) return;
        const next: ThreeDControlsStateShape = {
            layerHeight,
            baseSliceHeight,
            colorSliceHeights,
            colorOrder,
            filteredSwatches: filtered,
            pixelSize,
        };
        lastEmittedRef.current = next;
        onChange(next);
    }, [
        onChange,
        layerHeight,
        baseSliceHeight,
        colorSliceHeights,
        colorOrder,
        filtered,
        pixelSize,
    ]);

    // Prepare dynamic 3D print instruction data derived from current control state
    type SwapEntry =
        | { type: 'start'; swatch: Swatch }
        | { type: 'swap'; swatch: Swatch; layer: number; height: number };

    // Build cumulative slice heights following the same logic used by the renderer
    const cumulativeHeights: number[] = [];
    let run = 0;
    for (let pos = 0; pos < colorOrder.length; pos++) {
        const fi = colorOrder[pos];
        const h = Number(colorSliceHeights[fi] ?? 0) || 0;
        run += h;
        cumulativeHeights[pos] = run;
    }

    // Build swap plan entries (typed)
    const swapPlan: SwapEntry[] = [];
    for (let pos = 0; pos < colorOrder.length; pos++) {
        const fi = colorOrder[pos];
        const sw = filtered[fi];
        if (!sw) continue;
        if (pos === 0) {
            swapPlan.push({ type: 'start', swatch: sw });
            continue;
        }
        const prevCum = cumulativeHeights[pos - 1] ?? 0;
        const heightAt = Math.max(0, (baseSliceHeight ?? 0) + prevCum);
        const layerNum = layerHeight > 0 ? Math.floor(heightAt / layerHeight) + 1 : 1;
        swapPlan.push({
            type: 'swap',
            swatch: sw,
            layer: layerNum,
            height: heightAt,
        });
    }

    // Build a plain-text representation of the instructions for copying
    const buildInstructionsText = () => {
        const lines: string[] = [];
        lines.push('3D Print Instructions');
        lines.push('---------------------');
        lines.push(`Layer height: ${layerHeight.toFixed(3)} mm`);
        // static recommended settings
        lines.push('Recommended: Layer loops: 1; Infill: 100%');
        lines.push('');

        if (swapPlan.length) {
            const first = swapPlan[0];
            if (first.type === 'start') lines.push(`Start with color: ${first.swatch.hex}`);
        }

        lines.push('');
        lines.push('Color swap plan:');
        if (swapPlan.length <= 1) {
            lines.push('- No swaps — only one color configured.');
        } else {
            // number the entries for clarity
            let idx = 1;
            for (const entry of swapPlan) {
                if (entry.type === 'start') {
                    lines.push(`${idx}. Start with ${entry.swatch.hex}`);
                } else {
                    lines.push(
                        `${idx}. Swap to ${entry.swatch.hex} at layer ${
                            entry.layer
                        } (~${entry.height.toFixed(3)} mm)`
                    );
                }
                idx++;
            }
        }
        lines.push('');
        lines.push('Notes: Heights are approximate. Confirm in slicer before printing.');
        return lines.join('\n');
    };

    // Clipboard copy with fallback and brief copied feedback
    const [copied, setCopied] = useState(false);
    const copyTimerRef = useRef<number | null>(null);
    const copyToClipboard = async () => {
        const text = buildInstructionsText();
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(text);
            } else {
                // fallback for older browsers
                const ta = document.createElement('textarea');
                ta.value = text;
                // avoid scrolling to bottom
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.focus();
                ta.select();
                document.execCommand('copy');
                ta.remove();
            }
            setCopied(true);
            if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
            copyTimerRef.current = window.setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            // best-effort: ignore failures silently for now
            console.error('Copy to clipboard failed', err);
        }
    };

    // Get the current display order for the sortable
    const displayOrder =
        colorOrder.length === filtered.length ? colorOrder : filtered.map((_, i) => i);

    return (
        <div className="space-y-4">
            {/* Settings Section Header */}
            <div className="space-y-1 px-1">
                <h3 className="text-sm font-semibold text-foreground">3D Print Settings</h3>
                <p className="text-xs text-muted-foreground">Configure your printing parameters</p>
            </div>

            {/* Pixel size (XY scaling) */}
            <Card className="p-4 border border-border/50 hover:border-border transition-colors">
                <label className="block space-y-3">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <span className="font-semibold text-foreground">Pixel Size (XY)</span>
                            <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary font-medium">
                                mm/pixel
                            </span>
                        </div>
                        <span className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-mono font-semibold">
                            {pixelSize.toFixed(3)}
                        </span>
                    </div>
                    <NumberInput
                        min={0.01}
                        max={10}
                        step={0.01}
                        value={pixelSize}
                        onChange={(e) => {
                            const v = Number(e.target.value);
                            if (Number.isNaN(v)) return;
                            setPixelSize(Math.max(0.01, Math.min(10, v)));
                        }}
                    />
                </label>
            </Card>

            {/* Layer height */}
            <Card className="p-4 border border-border/50 hover:border-border transition-colors">
                <label className="block space-y-3">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <span className="font-semibold text-foreground">Layer Height</span>
                            <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary font-medium">
                                mm
                            </span>
                        </div>
                        <span className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-mono font-semibold">
                            {layerHeight.toFixed(2)}
                        </span>
                    </div>
                    <NumberInput
                        min={0.01}
                        max={10}
                        step={0.01}
                        value={layerHeight}
                        onChange={(e) => {
                            const v = Number(e.target.value);
                            if (!Number.isNaN(v)) setLayerHeight(v);
                        }}
                    />
                </label>
            </Card>

            {/* Base slice height */}
            <Card className="p-4 border border-border/50 hover:border-border transition-colors">
                <label className="block space-y-3">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <span className="font-semibold text-foreground">Base Slice Height</span>
                            <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary font-medium">
                                mm
                            </span>
                        </div>
                        <span className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-mono font-semibold">
                            {baseSliceHeight.toFixed(2)}
                        </span>
                    </div>
                    <NumberInput
                        min={0}
                        max={10}
                        step={0.01}
                        value={baseSliceHeight}
                        onChange={(e) => {
                            let v = Number(e.target.value);
                            if (Number.isNaN(v)) return;
                            v = Math.max(0, Math.min(10, v));
                            setBaseSliceHeight(v);
                        }}
                    />
                </label>
            </Card>

            {/* Per-color slice heights with Sortable */}
            <Card className="p-4 border border-border/50">
                <div className="flex justify-between items-center mb-4">
                    <div>
                        <h4 className="font-semibold text-foreground">Color Slice Heights</h4>
                        <p className="text-xs text-muted-foreground mt-1">
                            Drag to reorder, adjust sliders to customize
                        </p>
                    </div>
                    <span className="px-2 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold">
                        {filtered.length} colors
                    </span>
                </div>
                <div className="h-px bg-border/50 mb-4" />
                <Sortable
                    value={displayOrder.map(String)}
                    onValueChange={handleColorOrderChange}
                    orientation="vertical"
                >
                    <SortableContent asChild>
                        <div className="space-y-2">
                            {displayOrder.map((fi, displayIdx) => {
                                const s = filtered[fi];
                                const val = colorSliceHeights[fi] ?? layerHeight;
                                return (
                                    <ThreeDColorRow
                                        key={`${s.hex}-${fi}`}
                                        fi={fi}
                                        displayIdx={displayIdx}
                                        hex={s.hex}
                                        value={val}
                                        layerHeight={layerHeight}
                                        onChange={onRowChange}
                                    />
                                );
                            })}
                        </div>
                    </SortableContent>
                    <SortableOverlay>
                        <div className="rounded-lg bg-primary/10 h-11" />
                    </SortableOverlay>
                </Sortable>
            </Card>

            {/* 3D printing instruction group (dynamic) */}
            <Card className="p-4 border border-border/50 mt-6">
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <h4 className="font-semibold text-foreground">Print Instructions</h4>
                        <p className="text-xs text-muted-foreground mt-1">
                            Generated swap plan for your printer
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={copyToClipboard}
                        title="Copy print instructions to clipboard"
                        aria-pressed={copied}
                        className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 ${
                            copied
                                ? 'bg-green-600 text-white'
                                : 'bg-primary text-primary-foreground hover:bg-primary/90'
                        }`}
                    >
                        {copied ? '✓ Copied!' : 'Copy'}
                    </button>
                </div>

                <div className="h-px bg-border/50 mb-4" />

                <div className="space-y-4 text-sm">
                    {/* Recommended Settings */}
                    <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                        <div className="font-semibold text-foreground mb-2">
                            Recommended Settings
                        </div>
                        <div className="space-y-1 text-muted-foreground text-xs">
                            <div>
                                • Wall loops: <span className="text-foreground font-medium">1</span>
                            </div>
                            <div>
                                • Infill: <span className="text-foreground font-medium">100%</span>
                            </div>
                            <div>
                                • Layer height:{' '}
                                <span className="text-foreground font-mono">
                                    {layerHeight.toFixed(3)} mm
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Start Color */}
                    <div>
                        <div className="font-semibold text-foreground mb-2">Start with Color</div>
                        {swapPlan.length && swapPlan[0].type === 'start' ? (
                            (() => {
                                const sw = swapPlan[0].swatch;
                                return (
                                    <div className="flex items-center gap-3 p-3 rounded-lg bg-accent/5 border border-border/50">
                                        <span
                                            className="block w-6 h-6 rounded border-2 border-border flex-shrink-0"
                                            style={{ background: sw.hex }}
                                            title={sw.hex}
                                        />
                                        <span className="font-mono text-sm text-foreground">
                                            {sw.hex}
                                        </span>
                                    </div>
                                );
                            })()
                        ) : (
                            <div className="text-muted-foreground text-sm">—</div>
                        )}
                    </div>

                    {/* Color Swap Plan */}
                    <div>
                        <div className="font-semibold text-foreground mb-2">Color Swap Plan</div>
                        {swapPlan.length <= 1 ? (
                            <div className="text-muted-foreground text-sm p-3 rounded-lg bg-accent/5 border border-border/50">
                                Only one color configured — no swaps needed.
                            </div>
                        ) : (
                            <ol className="space-y-2">
                                {swapPlan.map((entry, idx) => {
                                    if (entry.type === 'start')
                                        return (
                                            <li
                                                key={idx}
                                                className="flex items-center gap-2 text-muted-foreground text-xs"
                                            >
                                                <span className="text-primary font-semibold flex-shrink-0">
                                                    {idx}.
                                                </span>
                                                Start with{' '}
                                                <span className="font-mono text-foreground">
                                                    {entry.swatch.hex}
                                                </span>
                                            </li>
                                        );
                                    return (
                                        <li
                                            key={idx}
                                            className="flex items-start gap-2 text-muted-foreground text-xs p-2 rounded bg-accent/5"
                                        >
                                            <span className="text-primary font-semibold flex-shrink-0">
                                                {idx}.
                                            </span>
                                            <div className="flex-1">
                                                Swap to
                                                <span className="inline-flex items-center gap-2 ml-2">
                                                    <span
                                                        className="inline-block w-4 h-4 rounded border border-border"
                                                        style={{ background: entry.swatch.hex }}
                                                    />
                                                    <span className="font-mono text-foreground">
                                                        {entry.swatch.hex}
                                                    </span>
                                                </span>
                                                <div className="mt-1">
                                                    at layer{' '}
                                                    <span className="font-semibold text-foreground">
                                                        {entry.layer}
                                                    </span>{' '}
                                                    (~
                                                    <span className="font-mono text-foreground">
                                                        {entry.height.toFixed(3)} mm
                                                    </span>
                                                    )
                                                </div>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ol>
                        )}
                    </div>

                    <div className="text-xs text-muted-foreground p-3 rounded-lg bg-accent/5 border border-border/50 italic">
                        ℹ️ Heights are approximate. Always confirm in your slicer before printing.
                    </div>
                </div>
            </Card>
        </div>
    );
}
