import React, { useState, useEffect } from 'react';
import { RgbaColorPicker } from 'react-colorful';

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
        <div className="controls-group">
            <div className="swatches-header">
                <span>Image colors</span>
                <span
                    className="swatch-count"
                    aria-hidden
                    title="Number of opaque color swatches (transparent excluded)"
                >
                    ({swatches.filter((s) => !s.isTransparent).length})
                </span>
                {loading && <span className="swatches-loading">Updating…</span>}
            </div>
            <div className="swatches" aria-live="polite">
                {swatches.length === 0 ? (
                    <div className="swatches-empty">No swatches</div>
                ) : (
                    swatches.slice(0, cap).map((s) => {
                        const style: React.CSSProperties = {};
                        if (s.a === 0) {
                            style.background = `repeating-conic-gradient(#666 0% 25%, #333 0% 50%) 50% / 8px 8px`;
                        } else if (s.a < 255) {
                            // semi-transparent color: render the color on top of the checkerboard
                            const r = parseInt(s.hex.slice(1, 3), 16) || 0;
                            const g = parseInt(s.hex.slice(3, 5), 16) || 0;
                            const b = parseInt(s.hex.slice(5, 7), 16) || 0;
                            const alpha = (s.a / 255).toFixed(3);
                            // Top layer: solid rgba color (with alpha). Bottom: checkerboard scaled to 8px.
                            style.background = `linear-gradient(rgba(${r}, ${g}, ${b}, ${alpha}), rgba(${r}, ${g}, ${b}, ${alpha})), repeating-conic-gradient(#666 0% 25%, #333 0% 50%) 50% / 8px 8px`;
                        } else {
                            style.background = s.hex;
                        }
                        return (
                            <div
                                key={s.hex + '-' + s.a}
                                className="swatch swatch-interactive"
                                role="button"
                                tabIndex={0}
                                onClick={() => setOpenSwatch(s)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        setOpenSwatch(s);
                                    }
                                }}
                                title={`${s.hex}${
                                    s.a === 0 ? ' (transparent)' : ''
                                }  alpha:${s.a}  count:${s.count}`}
                                style={style}
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
                    className="swatch-modal-overlay"
                >
                    <div className="swatch-modal">
                        <div className="swatch-modal-header">
                            <div className="swatch-modal-title">Edit swatch</div>
                            <button
                                aria-label="Close"
                                onClick={() => closeModal()}
                                className="swatch-modal-close"
                            >
                                <i className="fa-solid fa-xmark" aria-hidden="true" />
                            </button>
                        </div>

                        <div className="swatch-modal-body">
                            {/* Left column: picker and actions */}
                            <div className="swatch-modal-left">
                                <div className="swatch-picker-wrapper">
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

                                {/* actions moved to the right column (preview area) */}
                                <div style={{ marginTop: 'auto' }} />
                            </div>
                            {/* Right column: preview above hex input */}
                            <div className="swatch-modal-right">
                                <div style={{ width: '100%' }}>
                                    <div
                                        aria-hidden
                                        className="w-8 h-8 border border-border rounded"
                                    >
                                        <div
                                            aria-hidden
                                            className="w-full h-full rounded"
                                            style={{
                                                background: `rgba(${rgba.r}, ${rgba.g}, ${rgba.b}, ${rgba.a})`,
                                            }}
                                        />
                                    </div>
                                </div>

                                <input
                                    value={pickerColor}
                                    onChange={(e) => {
                                        const v = e.target.value;
                                        // allow up to 8 hex digits (RRGGBBAA)
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
                                    className="swatch-hex-input"
                                />
                                <div className="swatch-actions">
                                    <button
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
                                        className="swatch-delete-btn"
                                    >
                                        Delete
                                    </button>

                                    <button
                                        onClick={async () => {
                                            if (!openSwatch) return;
                                            // normalize hex: allow 6 or 8 digit input; always produce 8-digit (#RRGGBBAA)
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
                                                // normalize to lowercase
                                                hex = '#' + hex.slice(1).toLowerCase();
                                                // if user provided 6-digit, append alpha from rgba
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
                                        className="swatch-apply-btn"
                                    >
                                        Apply
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// (native color input used; integrated sliders removed)
