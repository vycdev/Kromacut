import React, { useEffect, useRef, useState } from "react";
import "./App.css";

function App(): React.ReactElement | null {
    const [imageSrc, setImageSrc] = useState<string | null>(null);
    const [dragOver, setDragOver] = useState(false);
    const inputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        return () => {
            if (imageSrc) URL.revokeObjectURL(imageSrc);
        };
    }, [imageSrc]);

    const handleFiles = (file?: File) => {
        if (!file) return;
        if (!file.type.startsWith("image/")) {
            // lightweight validation
            // keep this minimal for now
            alert("Please upload an image file");
            return;
        }
        if (imageSrc) URL.revokeObjectURL(imageSrc);
        const url = URL.createObjectURL(file);
        setImageSrc(url);
    };

    const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) handleFiles(e.target.files[0]);
    };

    const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files && e.dataTransfer.files[0];
        if (file) handleFiles(file);
    };

    const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setDragOver(true);
    };

    const clear = () => {
        if (imageSrc) {
            URL.revokeObjectURL(imageSrc);
            setImageSrc(null);
        }
        if (inputRef.current) inputRef.current.value = "";
    };

    return (
        <div className="uploader-root">
            <h1>StrataPaint — Upload Photo</h1>

            <div className="app-layout">
                <aside className="sidebar">
                    <div className="controls-panel">
                        <h2>Controls</h2>
                        <p className="muted">
                            Image settings and project controls will appear
                            here.
                        </p>
                        {/* placeholder for future controls (color count, layer heights, etc.) */}
                    </div>
                </aside>

                <main className="preview-area">
                    <div
                        className={`dropzone ${dragOver ? "dragover" : ""}`}
                        onDrop={onDrop}
                        onDragOver={onDragOver}
                        onDragLeave={() => setDragOver(false)}
                        onClick={() => inputRef.current?.click()}
                    >
                        {imageSrc ? (
                            <img
                                src={imageSrc}
                                alt="uploaded preview"
                                className="preview"
                            />
                        ) : (
                            <div className="placeholder">
                                <p>Click or drop an image here to upload</p>
                                <button
                                    type="button"
                                    onClick={() => inputRef.current?.click()}
                                >
                                    Choose file
                                </button>
                            </div>
                        )}

                        <input
                            ref={inputRef}
                            type="file"
                            accept="image/*"
                            onChange={onChange}
                            style={{ display: "none" }}
                        />
                    </div>

                    {imageSrc && (
                        <div className="controls">
                            <button onClick={clear}>Remove</button>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}

export default App;
