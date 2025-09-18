import React, { useCallback, useEffect, useRef, useState } from 'react';

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
    const handleBake = useCallback(() => {
      // Ensure any in-progress drag is flushed before bake
      if (dirtyRef.current) {
        dirtyRef.current = false;
        onCommit?.(valuesRef.current);
      }
      onBake?.(valuesRef.current);
    }, [onBake, onCommit]);

    return (
      <div className="controls-group adjustments-group">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            fontSize: 13,
            fontWeight: 700,
            marginBottom: 8,
          }}
        >
          <span>Adjustments</span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              type="button"
              onClick={handleBake}
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: '2px 6px',
                border: '1px solid #555',
                background: '#2a2a2a',
                color: '#eee',
                borderRadius: 3,
                cursor: 'pointer',
              }}
              title="Apply (bake) adjustments to the image"
              aria-label="Apply adjustments"
            >
              Apply
            </button>
            <button
              type="button"
              onClick={handleReset}
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: '2px 6px',
                border: '1px solid #444',
                background: '#222',
                color: '#ddd',
                borderRadius: 3,
                cursor: 'pointer',
              }}
              title="Reset all adjustments to defaults"
              aria-label="Reset adjustments"
            >
              Reset
            </button>
          </div>
        </div>
        <div className="adjustments-content">
          {defs.map((s) => {
            const displayVal = values[s.key];
            return (
              <label key={s.key} className="adjustment-row">
                <div className="adjustment-label">
                  {s.label}
                  <span className="adjustment-unit">
                    {displayVal}
                    {s.unit ? ` ${s.unit}` : ''}
                  </span>
                </div>
                <input
                  type="range"
                  min={s.min}
                  max={s.max}
                  step={s.step}
                  value={displayVal}
                  onChange={(e) => {
                    // mark drag started if not already (covers keyboard / clicks)
                    if (!draggingRef.current) {
                      draggingRef.current = true;
                    }
                    scheduleSet(s.key, Number(e.target.value));
                  }}
                  onPointerDown={() => {
                    draggingRef.current = true;
                  }}
                  onPointerUp={() => handlePointerUp()}
                  onBlur={() => handlePointerUp()}
                />
              </label>
            );
          })}
        </div>
      </div>
    );
  }
);

AdjustmentsPanel.displayName = 'AdjustmentsPanel';

export default AdjustmentsPanel;
