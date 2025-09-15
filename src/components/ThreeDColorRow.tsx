import React from "react";

type Props = {
    fi: number;
    displayIdx: number;
    hex: string;
    value: number;
    layerHeight: number;
    isDragOver: boolean;
    dragPosition: "above" | "below" | null;
    onDragStart: (e: React.DragEvent<HTMLDivElement>, fi: number) => void;
    onDragOver: (
        e: React.DragEvent<HTMLDivElement>,
        displayIdx: number
    ) => void;
    onDragLeave: () => void;
    onDrop: (e: React.DragEvent<HTMLDivElement>, displayIdx: number) => void;
    onChange: (fi: number, value: number) => void;
};

const swatchBoxStyle: React.CSSProperties = {
    width: 28,
    height: 20,
    border: "1px solid #ccc",
    borderRadius: 3,
};

function ThreeDColorRowInner({
    fi,
    displayIdx,
    hex,
    value,
    layerHeight,
    isDragOver,
    dragPosition,
    onDragStart,
    onDragOver,
    onDragLeave,
    onDrop,
    onChange,
}: Props) {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const v = Number(e.target.value);
        if (Number.isNaN(v)) return;
        onChange(fi, v);
    };

    const boxShadow = isDragOver
        ? dragPosition === "above"
            ? "inset 0 2px 0 0 rebeccapurple"
            : "inset 0 -2px 0 0 rebeccapurple"
        : undefined;

    return (
        <div
            onDragOver={(e) => onDragOver(e, displayIdx)}
            onDragLeave={onDragLeave}
            onDrop={(e) => onDrop(e, displayIdx)}
            style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                boxShadow,
                borderRadius: isDragOver ? 6 : undefined,
            }}
        >
            <div
                draggable
                onDragStart={(e) => onDragStart(e, fi)}
                style={{
                    width: 20,
                    height: 20,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "grab",
                    color: "#666",
                }}
                aria-label="Reorder color"
                title="Drag to reorder"
            >
                <i className="fa-solid fa-grip-vertical" aria-hidden />
            </div>
            <div style={{ ...swatchBoxStyle, background: hex }} />
            <input
                type="range"
                min={layerHeight}
                max={10}
                step={layerHeight}
                value={value}
                onChange={handleChange}
                className="range--styled"
                style={{ flex: 1 }}
            />
            <div style={{ width: 72, textAlign: "right" }}>
                {value.toFixed(2)} mm
            </div>
        </div>
    );
}

export default React.memo(ThreeDColorRowInner);
