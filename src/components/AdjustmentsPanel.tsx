import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Card } from '@/components/ui/card';
import { Check, RotateCcw } from 'lucide-react';

export type SliderDef = {
    key: string;
    label: string;
    min: number;
    max: number;
    step: number;
    default: number;
    unit?: string;
};

interface Props {
    defs: SliderDef[];
    initial?: Record<string, number>;
    /** Called when user finishes a slider drag (pointer up). */
    onCommit?: (vals: Record<string, number>) => void;
    /** Explicit bake/apply: permanently apply current adjustments to the underlying image. */
    onBake?: (vals: Record<string, number>) => void;
}

// Memoize to avoid parent re-render noise when props are stable
export const AdjustmentsPanel: React.FC<Props> = React.memo(
    ({ defs, initial, onCommit, onBake }) => {
        // Local state only; parent not updated per-drag
        const [values, setValues] = useState<Record<string, number>>(() => {
            const base: Record<string, number> = {};
            defs.forEach((d) => {
                base[d.key] = initial?.[d.key] ?? d.default;
            });
            return base;
        });
        // Keep a ref to latest values for unmount commit without recreating flush
        const valuesRef = useRef(values);
        valuesRef.current = values;

        // Track if a commit is pending (user dragging)
        const dirtyRef = useRef(false);
        const frameRef = useRef<number | null>(null);
        // Track active dragging so we only flush once per drag interaction
        const draggingRef = useRef(false);

        const scheduleSet = useCallback((k: string, v: number) => {
            setValues((prev) => {
                if (prev[k] === v) return prev; // no change
                return { ...prev, [k]: v };
            });
            dirtyRef.current = true;
        }, []);

        const flush = useCallback(() => {
            if (!dirtyRef.current) return;
            dirtyRef.current = false;
            onCommit?.(valuesRef.current);
        }, [onCommit]);

        // Commit on unmount ONLY (not on every value change)
        useEffect(() => {
            return () => {
                if (dirtyRef.current) {
                    onCommit?.(valuesRef.current);
                    dirtyRef.current = false;
                }
            };
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, []);

        const handlePointerUp = useCallback(() => {
            if (!draggingRef.current) return; // only commit if a drag was active
            draggingRef.current = false;
            // Defer flush to next frame so final value state is applied
            if (frameRef.current) cancelAnimationFrame(frameRef.current);
            frameRef.current = requestAnimationFrame(() => flush());
        }, [flush]);

        // Attach a global pointerup listener only while dragging (simple approach)
        useEffect(() => {
            const up = () => handlePointerUp();
            window.addEventListener('pointerup', up);
            return () => window.removeEventListener('pointerup', up);
        }, [handlePointerUp]);

        const handleReset = useCallback(() => {
            const next: Record<string, number> = {};
            defs.forEach((d) => (next[d.key] = d.default));
            setValues(next);
            draggingRef.current = false;
            // Direct commit (immediate) for reset action
            onCommit?.(next);
            dirtyRef.current = false;
        }, [defs, onCommit]);

        const handleResetSingle = useCallback(
            (key: string, defaultVal: number) => {
                setValues((prev) => {
                    if (prev[key] === defaultVal) return prev;
                    return { ...prev, [key]: defaultVal };
                });
                draggingRef.current = false;
                dirtyRef.current = true;
                onCommit?.({ ...valuesRef.current, [key]: defaultVal });
            },
            [onCommit]
        );

        const handleBake = useCallback(() => {
            // Ensure any in-progress drag is flushed before bake
            if (dirtyRef.current) {
                dirtyRef.current = false;
                onCommit?.(valuesRef.current);
            }
            onBake?.(valuesRef.current);
        }, [onBake, onCommit]);

        return (
            <Card className="p-4 border border-border/50 space-y-4">
                <div className="flex items-center justify-between gap-2">
                    <div>
                        <h3 className="text-sm font-semibold text-foreground">Adjustments</h3>
                        <p className="text-xs text-muted-foreground mt-1">
                            Fine-tune image properties
                        </p>
                    </div>
                    <Button
                        type="button"
                        onClick={handleBake}
                        size="sm"
                        className="bg-green-600 hover:bg-green-700 text-white font-semibold transition-all duration-200 shadow-md hover:shadow-lg hover:scale-105 active:scale-95 gap-1.5"
                        title="Apply (bake) adjustments to the image"
                        aria-label="Apply adjustments"
                    >
                        <Check className="w-4 h-4" />
                        <span>Apply</span>
                    </Button>
                </div>
                <div className="h-px bg-border/50" />
                <div className="space-y-4">
                    {defs.map((s) => {
                        const displayVal = values[s.key];
                        const isDefault = displayVal === s.default;
                        return (
                            <div key={s.key} className="space-y-2">
                                <div className="flex justify-between items-center text-sm gap-2">
                                    <span className="font-medium text-foreground">{s.label}</span>
                                    <div className="flex items-center gap-2">
                                        <span className="px-2 py-1 rounded-full bg-primary/10 text-primary text-xs font-mono font-semibold">
                                            {displayVal}
                                            {s.unit ? ` ${s.unit}` : ''}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                handleResetSingle(s.key, s.default);
                                            }}
                                            disabled={isDefault}
                                            title={`Reset ${s.label} to default`}
                                            aria-label={`Reset ${s.label}`}
                                            className="h-5 w-5 flex-shrink-0 flex items-center justify-center rounded-md text-muted-foreground hover:text-amber-600 hover:bg-amber-600/15 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-muted-foreground select-none"
                                        >
                                            <RotateCcw className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>
                                <Slider
                                    min={s.min}
                                    max={s.max}
                                    step={s.step}
                                    value={[displayVal]}
                                    onValueChange={(val) => {
                                        if (!draggingRef.current) {
                                            draggingRef.current = true;
                                        }
                                        scheduleSet(s.key, val[0]);
                                    }}
                                    onPointerDown={() => {
                                        draggingRef.current = true;
                                    }}
                                    onPointerUp={() => handlePointerUp()}
                                    onBlur={() => handlePointerUp()}
                                />
                            </div>
                        );
                    })}
                </div>
            </Card>
        );
    }
);

AdjustmentsPanel.displayName = 'AdjustmentsPanel';

export default AdjustmentsPanel;
