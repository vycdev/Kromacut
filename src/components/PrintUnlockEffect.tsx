import React, { useEffect } from 'react';

const DURATION_MS = 2600;

function prefersReducedMotion(): boolean {
    return (
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
}

/**
 * A quick, self-timing FDM "print build" flourish that plays when the
 * experimental "Multi-plate mode" settings toggle is switched on. It
 * renders a full-screen, click-through overlay of a filament object printing
 * layer-by-layer with a sweeping nozzle, then calls `onDone` so the parent can
 * unmount it. Bows out immediately for anyone who prefers reduced motion.
 */
function PrintUnlockEffect({ onDone }: { onDone: () => void }): React.ReactElement | null {
    const reduced = prefersReducedMotion();

    useEffect(() => {
        const t = window.setTimeout(onDone, reduced ? 0 : DURATION_MS);
        return () => window.clearTimeout(t);
    }, [onDone, reduced]);

    if (reduced) return null;

    return (
        <div className="feat35-overlay" aria-hidden="true">
            <div className="feat35-stage">
                <div className="feat35-object" />
                <div className="feat35-nozzle">
                    <div className="feat35-tip" />
                </div>
                <div className="feat35-caption">
                    <span className="feat35-caption-main">MULTI-PLATE ONLINE</span>
                    <span className="feat35-caption-sub">experimental feature</span>
                </div>
            </div>
        </div>
    );
}

export default PrintUnlockEffect;
