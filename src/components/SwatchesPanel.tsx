import React, { useState, useEffect } from 'react';
import { RgbaColorPicker } from 'react-colorful';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { X } from 'lucide-react';

interface SwatchEntry {
    hex: string;
    a: number;
    count: number;
    isTransparent?: boolean;
}
interface Props {
    swatches: SwatchEntry[];
    loading: boolean;
    cap: number;
    onSwatchDelete?: (sw: SwatchEntry) => Promise<void> | void;
    onSwatchApply?: (original: SwatchEntry, newHex: string) => Promise<void> | void;
}

export const SwatchesPanel: React.FC<Props> = ({
    swatches,
    loading,
    cap,
    onSwatchDelete,
    onSwatchApply,
}) => {
    const [openSwatch, setOpenSwatch] = useState<SwatchEntry | null>(null);
    const [pickerColor, setPickerColor] = useState<string>('#000000');
    const [rgba, setRgba] = useState<{
        r: number;
        g: number;
        b: number;
        a: number;
    }>({ r: 0, g: 0, b: 0, a: 1 });

    useEffect(() => {
        if (openSwatch) {
            // initialize picker color and RGBA from the swatch
            const hex = (openSwatch.hex || '#000000').replace(/^#/, '');
            const r = parseInt(hex.slice(0, 2), 16) || 0;
            const g = parseInt(hex.slice(2, 4), 16) || 0;
            const b = parseInt(hex.slice(4, 6), 16) || 0;
            const a = typeof openSwatch.a === 'number' ? openSwatch.a / 255 : 1;
            setRgba({ r, g, b, a });
            // include alpha byte in the displayed hex (RRGGBBAA)
            const aHex = Math.round(a * 255)
                .toString(16)
                .padStart(2, '0');
            setPickerColor(
                '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('') + aHex
            );
        }
    }, [openSwatch]);

    const closeModal = () => setOpenSwatch(null);

    return (
        <Card className="p-4 border border-border/50 space-y-4">
            <div className="flex justify-between items-center">
                <div>
                    <h3 className="text-sm font-semibold text-foreground">Image colors</h3>
                    <p className="text-xs text-muted-foreground mt-1">Detected color palette</p>
                </div>
                <div className="flex items-center gap-2">
                    <span
                        className="px-2 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold font-mono"
                        aria-hidden
                        title="Number of opaque color swatches (transparent excluded)"
                    >
                        {swatches.filter((s) => !s.isTransparent).length}
                    </span>
                    {loading && (
                        <span className="text-xs text-muted-foreground animate-pulse">
                            Updating…
                        </span>
                    )}
                </div>
            </div>
            <div
                className="grid gap-2 p-3 rounded-lg bg-muted/30"
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(15px, 1fr))' }}
                aria-live="polite"
            >
                {swatches.length === 0 ? (
                    <div className="col-span-full py-4 text-center text-sm text-muted-foreground">
                        No swatches
                    </div>
                ) : (
                    swatches.slice(0, cap).map((s) => {
                        const swatchStyle: React.CSSProperties = {};
                        if (s.a === 0) {
                            swatchStyle.background = `repeating-conic-gradient(rgba(255,255,255,0.1) 0% 25%, rgba(0,0,0,0.1) 0% 50%) 50% / 4px 4px`;
                        } else if (s.a < 255) {
                            const r = parseInt(s.hex.slice(1, 3), 16) || 0;
                            const g = parseInt(s.hex.slice(3, 5), 16) || 0;
                            const b = parseInt(s.hex.slice(5, 7), 16) || 0;
                            const alpha = (s.a / 255).toFixed(3);
                            swatchStyle.background = `linear-gradient(rgba(${r}, ${g}, ${b}, ${alpha}), rgba(${r}, ${g}, ${b}, ${alpha})), repeating-conic-gradient(rgba(255,255,255,0.1) 0% 25%, rgba(0,0,0,0.1) 0% 50%) 50% / 4px 4px`;
                        } else {
                            swatchStyle.background = s.hex;
                        }
                        return (
                            <button
                                key={s.hex + '-' + s.a}
                                type="button"
                                onClick={() => setOpenSwatch(s)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        setOpenSwatch(s);
                                    }
                                }}
                                title={`${s.hex}${
                                    s.a === 0 ? ' (transparent)' : ''
                                }  alpha:${s.a}  count:${s.count}`}
                                className="rounded border border-border/70 cursor-pointer hover:border-primary hover:shadow-md transition-all duration-200 hover:scale-110"
                                style={{ aspectRatio: '1', ...swatchStyle }}
                            />
                        );
                    })
                )}
            </div>

            {/* Modal: color picker + Apply / Cancel */}
            {openSwatch && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label="Edit swatch color"
                    onKeyDown={(e) => {
                        if (e.key === 'Escape') closeModal();
                    }}
                    className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
                >
                    <Card className="w-full max-w-sm border border-border/50 shadow-xl">
                        {/* Header */}
                        <div className="flex justify-between items-center p-6 border-b border-border/50">
                            <div>
                                <h2 className="font-semibold text-foreground text-base">
                                    Edit Color
                                </h2>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Adjust the color and transparency
                                </p>
                            </div>
                            <button
                                aria-label="Close"
                                onClick={() => closeModal()}
                                className="h-6 w-6 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="p-6 space-y-5">
                            {/* Color picker */}
                            <div className="flex justify-center">
                                <RgbaColorPicker
                                    color={rgba}
                                    onChange={(c: {
                                        r: number;
                                        g: number;
                                        b: number;
                                        a: number;
                                    }) => {
                                        setRgba(c);
                                        const aHex = Math.round(c.a * 255)
                                            .toString(16)
                                            .padStart(2, '0');
                                        setPickerColor(
                                            '#' +
                                                [c.r, c.g, c.b]
                                                    .map((v) => v.toString(16).padStart(2, '0'))
                                                    .join('') +
                                                aHex
                                        );
                                    }}
                                />
                            </div>

                            {/* Hex input and Preview in a row */}
                            <div className="space-y-2">
                                <label className="text-xs font-medium text-foreground">
                                    Hex Value
                                </label>
                                <Input
                                    value={pickerColor}
                                    onChange={(e) => {
                                        const v = e.target.value;
                                        if (/^#?[0-9a-fA-F]{0,8}$/.test(v)) {
                                            const hex = v.startsWith('#') ? v.slice(1) : v;
                                            if (hex.length === 8) {
                                                const r = parseInt(hex.slice(0, 2), 16) || 0;
                                                const g = parseInt(hex.slice(2, 4), 16) || 0;
                                                const b = parseInt(hex.slice(4, 6), 16) || 0;
                                                const a =
                                                    (parseInt(hex.slice(6, 8), 16) || 255) / 255;
                                                setRgba((p) => ({
                                                    ...p,
                                                    r,
                                                    g,
                                                    b,
                                                    a,
                                                }));
                                            } else if (hex.length === 6) {
                                                const r = parseInt(hex.slice(0, 2), 16) || 0;
                                                const g = parseInt(hex.slice(2, 4), 16) || 0;
                                                const b = parseInt(hex.slice(4, 6), 16) || 0;
                                                setRgba((p) => ({
                                                    ...p,
                                                    r,
                                                    g,
                                                    b,
                                                }));
                                            }
                                            setPickerColor(v.startsWith('#') ? v : '#' + v);
                                        }
                                    }}
                                    placeholder="#RRGGBBAA"
                                    className="font-mono text-sm"
                                />
                            </div>

                            {/* Actions */}
                            <div className="flex gap-2 pt-3">
                                <Button
                                    variant="outline"
                                    className="flex-1 transition-colors"
                                    onClick={async () => {
                                        if (!openSwatch) return;
                                        try {
                                            if (onSwatchDelete) {
                                                await onSwatchDelete(openSwatch);
                                            }
                                        } catch (err) {
                                            console.warn('swatch delete handler failed', err);
                                        }
                                        closeModal();
                                    }}
                                >
                                    Delete
                                </Button>

                                <Button
                                    className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold transition-all duration-200 shadow-md hover:shadow-lg hover:scale-105 active:scale-95"
                                    onClick={async () => {
                                        if (!openSwatch) return;
                                        let hex = pickerColor || '';
                                        const normFromRgba = () => {
                                            const { r, g, b, a } = rgba;
                                            const aHex = Math.round(a * 255)
                                                .toString(16)
                                                .padStart(2, '0');
                                            return (
                                                '#' +
                                                [r, g, b]
                                                    .map((v) => v.toString(16).padStart(2, '0'))
                                                    .join('') +
                                                aHex
                                            );
                                        };
                                        if (!/^#?[0-9a-fA-F]{6,8}$/.test(hex)) {
                                            hex = normFromRgba();
                                        } else {
                                            if (!hex.startsWith('#')) hex = '#' + hex;
                                            hex = '#' + hex.slice(1).toLowerCase();
                                            if (hex.length === 7) {
                                                const aHex = Math.round(rgba.a * 255)
                                                    .toString(16)
                                                    .padStart(2, '0');
                                                hex = hex + aHex;
                                            }
                                        }
                                        try {
                                            if (onSwatchApply) {
                                                await onSwatchApply(openSwatch, hex);
                                            }
                                        } catch (err) {
                                            console.warn('swatch apply handler failed', err);
                                        }
                                        closeModal();
                                    }}
                                >
                                    Apply
                                </Button>
                            </div>
                        </div>
                    </Card>
                </div>
            )}
        </Card>
    );
};

// (native color input used; integrated sliders removed)
