import { useMemo, useRef, useState } from 'react';
import type { Swatch } from '../types';
import type { AutoPaintResult } from '../lib/autoPaint';

export type SwapEntry =
    | { type: 'start'; swatch: Swatch }
    | { type: 'swap'; swatch: Swatch; layer: number; height: number };

export interface UseSwapPlanOptions {
    colorOrder: number[];
    colorSliceHeights: number[];
    filtered: Swatch[];
    layerHeight: number;
    slicerFirstLayerHeight: number;
    paintMode: 'manual' | 'autopaint';
    autoPaintResult?: AutoPaintResult;
    disabled?: boolean;
    /** Flat Paint prints have no manual swap sequence (multi-material per layer) */
    flatPaint?: boolean;
}

export function useSwapPlan({
    colorOrder,
    colorSliceHeights,
    filtered,
    layerHeight,
    slicerFirstLayerHeight,
    paintMode,
    autoPaintResult,
    disabled = false,
    flatPaint = false,
}: UseSwapPlanOptions) {
    const swapPlan = useMemo(() => {
        if (disabled || flatPaint) {
            return [] as SwapEntry[];
        }

        // When auto-paint is active and we have computed layers, use those
        if (paintMode === 'autopaint' && autoPaintResult && autoPaintResult.layers.length > 0) {
            const plan: SwapEntry[] = [];
            autoPaintResult.layers.forEach(
                (
                    layer: { filamentColor: string; startHeight: number; endHeight: number },
                    idx: number
                ) => {
                    const sw: Swatch = { hex: layer.filamentColor, a: 255 };
                    if (idx === 0) {
                        plan.push({ type: 'start', swatch: sw });
                    } else {
                        const heightAt = layer.startHeight;
                        const effFirst = Math.max(0, slicerFirstLayerHeight || 0);
                        let layerNum = 1;
                        if (layerHeight > 0) {
                            const delta = Math.max(0, heightAt - effFirst);
                            layerNum = 2 + Math.round(delta / layerHeight);
                        }
                        plan.push({
                            type: 'swap',
                            swatch: sw,
                            layer: layerNum,
                            height: heightAt,
                        });
                    }
                }
            );
            return plan;
        }

        // Standard mode: Build cumulative slice heights
        const cumulativeHeights: number[] = [];
        let run = 0;
        for (let pos = 0; pos < colorOrder.length; pos++) {
            const fi = colorOrder[pos];
            const h = Number(colorSliceHeights[fi] ?? 0) || 0;
            const eff = pos === 0 ? Math.max(h, slicerFirstLayerHeight || 0) : h;
            run += eff;
            cumulativeHeights[pos] = run;
        }

        const plan: SwapEntry[] = [];
        for (let pos = 0; pos < colorOrder.length; pos++) {
            const fi = colorOrder[pos];
            const sw = filtered[fi];
            if (!sw) continue;
            if (pos === 0) {
                plan.push({ type: 'start', swatch: sw });
                continue;
            }
            const prevCum = cumulativeHeights[pos - 1] ?? 0;
            const heightAt = Math.max(0, prevCum);
            const effFirst = Math.max(0, slicerFirstLayerHeight || 0);
            let layerNum = 1;
            let displayHeight = heightAt;
            if (layerHeight > 0) {
                const delta = Math.max(0, heightAt - effFirst);
                layerNum = 2 + Math.round(delta / layerHeight);
                displayHeight = effFirst + (layerNum - 1) * layerHeight;
            }
            plan.push({
                type: 'swap',
                swatch: sw,
                layer: layerNum,
                height: displayHeight,
            });
        }
        return plan;
    }, [
        colorOrder,
        colorSliceHeights,
        filtered,
        layerHeight,
        slicerFirstLayerHeight,
        paintMode,
        autoPaintResult,
        disabled,
        flatPaint,
    ]);

    // Build a plain-text representation of the instructions for copying
    const buildInstructionsText = () => {
        const lines: string[] = [];
        const appendFooter = () => {
            lines.push('');
            lines.push('Notes: Heights are approximate. Confirm in slicer before printing.');
            lines.push('');
            lines.push('---------------------');
            lines.push('Made with Kromacut by vycdev!');
        };

        lines.push('3D Print Instructions');
        lines.push('---------------------');
        lines.push(`Layer height: ${layerHeight.toFixed(3)} mm`);
        lines.push(`First layer height: ${slicerFirstLayerHeight.toFixed(3)} mm`);
        lines.push('Recommended: Layer loops: 1; Infill: 100%');
        lines.push('');

        if (flatPaint) {
            lines.push('Flat Paint mode (flat face-down print):');
            lines.push('- Export as 3MF: the model contains one object per filament.');
            lines.push(
                '- Assign each object to its filament in the slicer (multi-material printer required).'
            );
            lines.push(
                '- Use clear/transparent filament for the carrier object — it is the first printed layer and becomes the smooth viewing face.'
            );
            lines.push(
                '- Print as-is: the artwork is already mirrored for face-down printing. Do not mirror in the slicer.'
            );
            lines.push('- After printing, flip the piece over: the image side is the bottom.');
            appendFooter();
            return lines.join('\n');
        }

        if (swapPlan.length) {
            const first = swapPlan[0];
            if (first.type === 'start') lines.push(`Start with color: ${first.swatch.hex}`);
        }

        lines.push('');
        lines.push('Color swap plan:');
        if (swapPlan.length <= 1) {
            lines.push('- No swaps — only one color configured.');
        } else {
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
        appendFooter();
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
                const ta = document.createElement('textarea');
                ta.value = text;
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
            console.error('Copy to clipboard failed', err);
        }
    };

    return {
        swapPlan,
        copied,
        copyToClipboard,
    };
}
