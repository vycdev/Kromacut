import React from "react";

type SliderDef = {
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
  adjustments: Record<string, number>;
  setAdjustment: (k: string, v: number) => void;
}

export const AdjustmentsPanel: React.FC<Props> = ({ defs, adjustments, setAdjustment }) => {
  return (
    <div className="controls-group adjustments-group">
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          marginBottom: 8,
        }}
      >
        Adjustments
      </div>
      <div className="adjustments-content">
        {defs.map((s) => (
          <label key={s.key} className="adjustment-row">
            <div className="adjustment-label">
              {s.label}
              <span className="adjustment-unit">
                {adjustments[s.key]}
                {s.unit ? ` ${s.unit}` : ""}
              </span>
            </div>
            <input
              type="range"
              min={s.min}
              max={s.max}
              step={s.step}
              value={adjustments[s.key]}
              onChange={(e) => setAdjustment(s.key, Number(e.target.value))}
            />
          </label>
        ))}
      </div>
    </div>
  );
};

export default AdjustmentsPanel;
