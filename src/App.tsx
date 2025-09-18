import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import ThreeDControls from './components/ThreeDControls';
import ThreeDView from './components/ThreeDView';
import './App.css';
import logo from './assets/logo.png';
import tdTestImg from './assets/tdTest.png';
import CanvasPreview from './components/CanvasPreview';
import type { CanvasPreviewHandle } from './components/CanvasPreview';
import { PaletteSelector } from './components/PaletteSelector';
import { ControlsPanel } from './components/ControlsPanel';
import { SwatchesPanel } from './components/SwatchesPanel';
import AdjustmentsPanel from './components/AdjustmentsPanel';
import DeditherPanel from './components/DeditherPanel';
import { ADJUSTMENT_DEFAULTS } from './lib/applyAdjustments';
import SLIDER_DEFS from './components/sliderDefs';
import { useSwatches } from './hooks/useSwatches';
import type { SwatchEntry } from './hooks/useSwatches';
import { useImageHistory } from './hooks/useImageHistory';
import { useQuantize } from './hooks/useQuantize';
// ...existing imports

function App(): React.ReactElement | null {
  const [dragOver, setDragOver] = useState(false);
  // `weight` is the algorithm parameter; `finalColors` is the postprocess target
  const [weight, setWeight] = useState<number>(128);
  const [finalColors, setFinalColors] = useState<number>(16);
  const [algorithm, setAlgorithm] = useState<string>('kmeans');
  const SWATCH_CAP = 2 ** 14;
  // default to the Auto palette
  const [selectedPalette, setSelectedPalette] = useState<string>('auto');
  const { imageSrc, setImage, clearCurrent, undo, redo, canUndo, canRedo } = useImageHistory(
    logo,
    undefined
  );
  const { swatches, swatchesLoading, invalidate, immediateOverride } = useSwatches(imageSrc);
  // adjustments managed locally inside AdjustmentsPanel now
  // initial selectedPalette derived from initial weight above
  const inputRef = useRef<HTMLInputElement | null>(null);
  const canvasPreviewRef = useRef<CanvasPreviewHandle | null>(null);
  const [showCheckerboard, setShowCheckerboard] = useState<boolean>(true);
  const [isCropMode, setIsCropMode] = useState(false);
  const { applyQuantize } = useQuantize({
    algorithm,
    weight,
    finalColors,
    selectedPalette,
    imageSrc,
    setImage: (u, push = true) => {
      invalidate();
      setImage(u, push);
    },
    onImmediateSwatches: (colors: SwatchEntry[]) => immediateOverride(colors),
  });

  // persistent (committed) adjustments applied on redraw. Key/value map.
  const [adjustments, setAdjustments] = useState<Record<string, number>>(ADJUSTMENT_DEFAULTS);
  // epoch counter to force remount of AdjustmentsPanel when we bake & reset
  const [adjustmentsEpoch, setAdjustmentsEpoch] = useState(0);
  // UI mode toggles (2D / 3D) - UI only for now
  const [mode, setMode] = useState<'2d' | '3d'>('2d');
  const [exportingSTL, setExportingSTL] = useState(false);
  const [exportProgress, setExportProgress] = useState(0); // 0..1
  // 3D printing shared state
  const [threeDState, setThreeDState] = useState<{
    layerHeight: number;
    baseSliceHeight: number;
    colorSliceHeights: number[];
    colorOrder: number[];
    filteredSwatches: { hex: string; a: number }[];
    pixelSize: number;
  }>({
    layerHeight: 0.12,
    baseSliceHeight: 0.2,
    colorSliceHeights: [],
    colorOrder: [],
    filteredSwatches: [],
    pixelSize: 0.1,
  });
  // Signal to force a rebuild of the 3D view when incremented
  const [threeDBuildSignal, setThreeDBuildSignal] = useState(0);
  const prevModeRef = useRef<typeof mode>(mode);

  // When the user switches to 3D mode, trigger the rebuild signal (same effect as the Rebuild button).
  // Schedule the rebuild on a short timeout so that the ThreeDControls have a chance to mount
  // and emit their initial state (filteredSwatches / color heights) before ThreeDView starts building.
  useEffect(() => {
    let t: number | undefined;
    if (prevModeRef.current !== mode && mode === '3d') {
      t = window.setTimeout(() => setThreeDBuildSignal((s) => s + 1), 50);
    }
    prevModeRef.current = mode;
    return () => {
      if (t) clearTimeout(t);
    };
  }, [mode]);

  // removed duplicate syncing: manual changes to the numeric input should set Auto via onWeightChange
  // redraw when image changes
  useEffect(() => {
    canvasPreviewRef.current?.redraw();
  }, [imageSrc]);

  const handleFiles = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file');
      return;
    }
    const url = URL.createObjectURL(file);
    invalidate();
    setImage(url, true);
  };

  // removed unused handlers (inline handlers used instead)

  const clear = () => {
    clearCurrent();
    if (inputRef.current) inputRef.current.value = '';
  };

  // splitter & layout management preserved below

  // wheel/pan handled in CanvasPreview
  // startPan handled in CanvasPreview
  // resize observer handled by CanvasPreview; keep for layout redraw hook
  // Layout splitter state
  const layoutRef = useRef<HTMLDivElement | null>(null);
  const [leftWidth, setLeftWidth] = useState<number>(0);
  const draggingRef = useRef(false);
  const startXRef = useRef(0);
  const startLeftRef = useRef(0);

  // initialize leftWidth once on mount
  useEffect(() => {
    const el = layoutRef.current;
    if (el) setLeftWidth(Math.floor(el.clientWidth / 4));
  }, []);

  // apply leftWidth to CSS variable on the layout element so grid is CSS-driven
  useEffect(() => {
    const el = layoutRef.current;
    if (el) el.style.setProperty('--left-width', `${leftWidth}px`);
  }, [leftWidth]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      const delta = e.clientX - startXRef.current;
      const newLeft = startLeftRef.current + delta;
      const el = layoutRef.current;
      if (!el) return;
      const min = Math.floor(el.clientWidth * 0.25);
      const max = el.clientWidth - min;
      const clamped = Math.max(min, Math.min(max, newLeft));
      setLeftWidth(clamped);
      requestAnimationFrame(() => {
        try {
          canvasPreviewRef.current?.redraw();
        } catch {
          /* ignore rapid drag redraw error */
        }
      });
    };
    const onUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  // redraw when leftWidth changes (splitter moved)
  useEffect(() => {
    canvasPreviewRef.current?.redraw();
  }, [leftWidth]);

  // observe layout changes (in case grid resizing affects preview size)
  useEffect(() => {
    const el = layoutRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const min = Math.floor(el.clientWidth * 0.25);
      const max = el.clientWidth - min;
      setLeftWidth((lw) => {
        if (lw < min) return min;
        if (lw > max) return max;
        return lw;
      });
      canvasPreviewRef.current?.redraw();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const onSplitterDown = (e: React.MouseEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    startXRef.current = e.clientX;
    startLeftRef.current =
      leftWidth || (layoutRef.current ? Math.floor(layoutRef.current.clientWidth / 2) : 300);
  };
  // Stable handler to avoid recreating function each render and to prevent redundant state sets
  const handleThreeDStateChange = useCallback(
    (s: {
      layerHeight: number;
      baseSliceHeight: number;
      colorSliceHeights: number[];
      colorOrder: number[];
      filteredSwatches: { hex: string; a: number }[];
      pixelSize: number;
    }) => {
      setThreeDState((prev) => {
        if (
          prev.layerHeight === s.layerHeight &&
          prev.baseSliceHeight === s.baseSliceHeight &&
          prev.colorSliceHeights === s.colorSliceHeights &&
          prev.colorOrder === s.colorOrder &&
          prev.filteredSwatches === s.filteredSwatches &&
          prev.pixelSize === s.pixelSize
        ) {
          return prev; // no change; avoid triggering rerender cascade
        }
        return s;
      });
    },
    []
  );

  return (
    <div className="uploader-root">
      <header className="app-header">
        <div className="header-left">
          <img src={logo} alt="StrataPaint" className="header-logo" />
          <span className="header-title">StrataPaint</span>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="header-btn header-btn--test"
            onClick={() => {
              // load the bundled test image into the preview
              invalidate();
              setImage(tdTestImg, true);
            }}
            title="Load TD Test"
          >
            <i className="fa-solid fa-image" aria-hidden />
            <span>Load TD Test</span>
          </button>
          <a
            className="header-btn header-btn--github"
            href="https://github.com/vycdev/StrataPaint"
            target="_blank"
            rel="noopener noreferrer"
          >
            <i className="fa-brands fa-github" aria-hidden />
            <span>GitHub</span>
          </a>
          <a
            className="header-btn header-btn--patreon"
            href="https://www.patreon.com/cw/vycdev"
            target="_blank"
            rel="noopener noreferrer"
          >
            <i className="fa-brands fa-patreon" aria-hidden />
            <span>Support me</span>
          </a>
        </div>
      </header>
      <div className="app-layout" ref={layoutRef}>
        <aside className="sidebar">
          <div className="controls-group mode-section" aria-hidden={false}>
            <div className="mode-tabs">
              <button
                type="button"
                className={`mode-btn ${mode === '2d' ? 'mode-btn--active' : ''}`}
                onClick={() => setMode('2d')}
                aria-pressed={mode === '2d'}
              >
                2D Mode
              </button>
              <button
                type="button"
                className={`mode-btn ${mode === '3d' ? 'mode-btn--active' : ''}`}
                onClick={() => setMode('3d')}
                aria-pressed={mode === '3d'}
              >
                3D Mode
              </button>
            </div>
          </div>
          <div className="controls-panel">
            {mode === '2d' ? (
              <>
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) handleFiles(e.target.files[0]);
                  }}
                  className="hidden-file-input"
                />
                {/* file input stays here (hidden); uploader buttons moved to preview actions */}
                <div className="controls-scroll">
                  <AdjustmentsPanel
                    key={adjustmentsEpoch}
                    defs={SLIDER_DEFS}
                    initial={ADJUSTMENT_DEFAULTS}
                    onCommit={(vals) => {
                      setAdjustments(vals);
                      // schedule a redraw
                      requestAnimationFrame(() => canvasPreviewRef.current?.redraw());
                    }}
                    onBake={async () => {
                      if (!canvasPreviewRef.current) return;
                      try {
                        const blob = await canvasPreviewRef.current.exportAdjustedImageBlob?.();
                        if (!blob) return;
                        const url = URL.createObjectURL(blob);
                        invalidate();
                        setImage(url, true);
                        // After baking, reset adjustments state to defaults
                        setAdjustments(ADJUSTMENT_DEFAULTS);
                        setAdjustmentsEpoch((e) => e + 1);
                      } catch (e) {
                        console.warn('Bake adjustments failed', e);
                      }
                    }}
                  />
                  <DeditherPanel
                    canvasRef={canvasPreviewRef}
                    onApplyResult={(url) => {
                      invalidate();
                      setImage(url, true);
                    }}
                  />
                  <PaletteSelector
                    selected={selectedPalette}
                    onSelect={(id, size) => {
                      setSelectedPalette(id);
                      // set the postprocess target to the palette size, but do not lock it
                      if (id !== 'auto') setFinalColors(size);
                    }}
                  />
                  <ControlsPanel
                    // finalColors controls postprocessing result count
                    finalColors={finalColors}
                    onFinalColorsChange={(n) => {
                      setFinalColors(n);
                      // changing the final colors should switch to auto palette
                      setSelectedPalette('auto');
                    }}
                    // weight remains the algorithm parameter
                    weight={weight}
                    onWeightChange={(n) => {
                      setWeight(n);
                    }}
                    algorithm={algorithm}
                    setAlgorithm={setAlgorithm}
                    onApply={() => applyQuantize(canvasPreviewRef)}
                    disabled={!imageSrc || isCropMode}
                    weightDisabled={algorithm === 'none'}
                  />
                  <SwatchesPanel
                    swatches={swatches}
                    loading={swatchesLoading}
                    cap={SWATCH_CAP}
                    onSwatchDelete={async (deleted) => {
                      // Build override palette from current swatches excluding the deleted one
                      const remaining = swatches.filter(
                        (s) => !(s.hex === deleted.hex && s.a === deleted.a)
                      );
                      const palette = remaining.filter((s) => s.a !== 0).map((s) => s.hex);
                      // target is number of image colors - 1 (clamped to at least 2)
                      const target = Math.max(2, palette.length);
                      // applyQuantize with override palette and override final colors
                      try {
                        await applyQuantize(canvasPreviewRef, {
                          overridePalette: palette,
                          overrideFinalColors: target,
                        });
                      } catch (err) {
                        console.warn('applyQuantize failed for swatch delete', err);
                      }
                    }}
                    onSwatchApply={async (original, newHex) => {
                      // Perform literal pixel replacement on the full-size image
                      if (!canvasPreviewRef.current || !imageSrc) return;
                      try {
                        const blob = await canvasPreviewRef.current.exportImageBlob();
                        if (!blob) return;
                        const img = await new Promise<HTMLImageElement | null>((res) => {
                          const i = new Image();
                          i.onload = () => res(i);
                          i.onerror = () => res(null);
                          i.src = URL.createObjectURL(blob);
                        });
                        if (!img) return;
                        const w = img.naturalWidth;
                        const h = img.naturalHeight;
                        const c = document.createElement('canvas');
                        c.width = w;
                        c.height = h;
                        const ctx = c.getContext('2d');
                        if (!ctx) return;
                        ctx.drawImage(img, 0, 0, w, h);
                        const data = ctx.getImageData(0, 0, w, h);
                        const dd = data.data;
                        const parseHex = (s: string) => {
                          const raw = s.replace(/^#/, '');
                          const r = Number.parseInt(raw.slice(0, 2), 16);
                          const g = Number.parseInt(raw.slice(2, 4), 16);
                          const b = Number.parseInt(raw.slice(4, 6), 16);
                          const a = raw.length >= 8 ? Number.parseInt(raw.slice(6, 8), 16) : 255;
                          return [
                            Number.isNaN(r) ? 0 : r,
                            Number.isNaN(g) ? 0 : g,
                            Number.isNaN(b) ? 0 : b,
                            Number.isNaN(a) ? 255 : a,
                          ] as [number, number, number, number];
                        };
                        const [r1, g1, b1] = parseHex(original.hex);
                        const [r2, g2, b2, newA] = parseHex(newHex);
                        // Apply the new alpha when replacing pixels. If newHex had no alpha, newA === 255.
                        if (original.a === 0) {
                          // Replace fully transparent pixels.
                          for (let i = 0; i < dd.length; i += 4) {
                            if (dd[i + 3] === 0) {
                              if (newA === 0) {
                                // canonical transparent representation: black + alpha 0
                                dd[i] = 0;
                                dd[i + 1] = 0;
                                dd[i + 2] = 0;
                                dd[i + 3] = 0;
                              } else {
                                dd[i] = r2;
                                dd[i + 1] = g2;
                                dd[i + 2] = b2;
                                dd[i + 3] = newA;
                              }
                            }
                          }
                        } else {
                          // Replace pixels that match the original RGB and original alpha exactly
                          const origA = original.a;
                          for (let i = 0; i < dd.length; i += 4) {
                            if (dd[i + 3] !== origA) continue;
                            if (dd[i] === r1 && dd[i + 1] === g1 && dd[i + 2] === b1) {
                              if (newA === 0) {
                                // set canonical transparent black
                                dd[i] = 0;
                                dd[i + 1] = 0;
                                dd[i + 2] = 0;
                                dd[i + 3] = 0;
                              } else {
                                dd[i] = r2;
                                dd[i + 1] = g2;
                                dd[i + 2] = b2;
                                dd[i + 3] = newA;
                              }
                            }
                          }
                        }
                        ctx.putImageData(data, 0, 0);
                        const outBlob = await new Promise<Blob | null>((res) =>
                          c.toBlob((b) => res(b), 'image/png')
                        );
                        if (!outBlob) return;
                        const url = URL.createObjectURL(outBlob);
                        invalidate();
                        setImage(url, true);
                      } catch (err) {
                        console.warn('literal replace failed', err);
                      }
                    }}
                  />
                </div>
              </>
            ) : (
              <ThreeDControls
                swatches={swatches}
                onChange={handleThreeDStateChange}
                persisted={threeDState}
              />
            )}
          </div>
        </aside>
        <div
          className="splitter"
          onMouseDown={onSplitterDown}
          role="separator"
          aria-orientation="vertical"
        />
        <main className="preview-area">
          <div
            className={`dropzone ${dragOver ? 'dragover' : ''}`}
            onDrop={(e) => {
              e.preventDefault();
              // disable dropping into the scene when in 3D mode
              if (mode === '3d') {
                setDragOver(false);
                return;
              }
              setDragOver(false);
              const file = e.dataTransfer.files && e.dataTransfer.files[0];
              if (file) handleFiles(file);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              // don't show drag overlay or allow drops in 3D mode
              if (mode === '3d') return;
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
          >
            {mode === '2d' ? (
              <CanvasPreview
                ref={canvasPreviewRef}
                imageSrc={imageSrc}
                isCropMode={isCropMode}
                showCheckerboard={showCheckerboard}
                adjustments={adjustments}
              />
            ) : (
              <ThreeDView
                imageSrc={imageSrc}
                baseSliceHeight={threeDState.baseSliceHeight}
                layerHeight={threeDState.layerHeight}
                colorSliceHeights={threeDState.colorSliceHeights}
                colorOrder={threeDState.colorOrder}
                swatches={threeDState.filteredSwatches}
                pixelSize={threeDState.pixelSize}
                rebuildSignal={threeDBuildSignal}
              />
            )}
            <div className="preview-actions">
              <button
                className="preview-action-btn"
                title="Undo"
                aria-label="Undo"
                disabled={isCropMode || !canUndo}
                onClick={() => undo()}
              >
                <i className="fa-solid fa-rotate-left" aria-hidden />
              </button>
              <button
                className="preview-action-btn"
                title="Redo"
                aria-label="Redo"
                disabled={isCropMode || !canRedo}
                onClick={() => redo()}
              >
                <i className="fa-solid fa-rotate-right" aria-hidden />
              </button>
              {mode === '2d' &&
                (!isCropMode ? (
                  <button
                    className="preview-crop-btn"
                    title="Crop"
                    aria-label="Crop"
                    disabled={!imageSrc}
                    onClick={() => {
                      if (imageSrc) setIsCropMode(true);
                    }}
                  >
                    <i className="fa-solid fa-crop" aria-hidden="true"></i>
                  </button>
                ) : (
                  <>
                    <button
                      className="preview-crop-btn preview-crop-btn--save"
                      title="Save crop"
                      aria-label="Save crop"
                      onClick={async () => {
                        if (!canvasPreviewRef.current) return;
                        const blob = await canvasPreviewRef.current.exportCroppedImage();
                        if (!blob) return;
                        const url = URL.createObjectURL(blob);
                        invalidate();
                        setImage(url, true);
                        setIsCropMode(false);
                      }}
                    >
                      <i className="fa-solid fa-floppy-disk" aria-hidden="true"></i>
                    </button>
                    <button
                      className="preview-crop-btn preview-crop-btn--cancel"
                      title="Cancel crop"
                      aria-label="Cancel crop"
                      onClick={() => setIsCropMode(false)}
                    >
                      <i className="fa-solid fa-xmark" aria-hidden="true"></i>
                    </button>
                  </>
                ))}
              {/* Download full image button (same style as crop) */}
              <button
                className="preview-crop-btn"
                title={
                  mode === '3d'
                    ? exportingSTL
                      ? `Exporting STL… ${Math.round(exportProgress * 100)}%`
                      : 'Download STL'
                    : 'Download image'
                }
                aria-label={
                  mode === '3d'
                    ? exportingSTL
                      ? 'Exporting STL'
                      : 'Download STL'
                    : 'Download image'
                }
                disabled={!imageSrc || exportingSTL}
                onClick={async () => {
                  if (mode === '3d') {
                    if (exportingSTL) return;
                    interface StrataWindow extends Window {
                      __STRATA_LAST_MESH?: THREE.Mesh;
                    }
                    const threeMesh = (window as StrataWindow).__STRATA_LAST_MESH;
                    if (!threeMesh) {
                      alert('3D mesh not ready yet');
                      return;
                    }
                    const geometry = threeMesh.geometry as THREE.BufferGeometry;
                    const pos = geometry.getAttribute('position');
                    if (!pos) {
                      alert('No geometry to export');
                      return;
                    }
                    geometry.computeVertexNormals();
                    const index = geometry.getIndex();
                    const sx = threeMesh.scale.x;
                    const sy = threeMesh.scale.y;
                    const sz = threeMesh.scale.z;
                    // Prepare async incremental export
                    setExportingSTL(true);
                    setExportProgress(0);
                    // Determine triangle count first
                    const getTri = (a: number, b: number, c: number) => {
                      const ax = pos.getX(a),
                        ay = pos.getY(a),
                        az = pos.getZ(a);
                      const bx = pos.getX(b),
                        by = pos.getY(b),
                        bz = pos.getZ(b);
                      const cx = pos.getX(c),
                        cy = pos.getY(c),
                        cz = pos.getZ(c);
                      const ux = bx - ax,
                        uy = by - ay,
                        uz = bz - az;
                      const vx = cx - ax,
                        vy = cy - ay,
                        vz = cz - az;
                      let nx = uy * vz - uz * vy;
                      let ny = uz * vx - ux * vz;
                      let nz = ux * vy - uy * vx;
                      const len = Math.hypot(nx, ny, nz) || 1;
                      nx /= len;
                      ny /= len;
                      nz /= len;
                      return {
                        ax,
                        ay,
                        az,
                        bx,
                        by,
                        bz,
                        cx,
                        cy,
                        cz,
                        nx,
                        ny,
                        nz,
                      };
                    };
                    const totalTris = index ? index.count / 3 : pos.count / 3;
                    const headerBytes = 80;
                    const triSize = 50;
                    const totalBytes = headerBytes + 4 + totalTris * triSize;
                    let buffer: ArrayBuffer;
                    try {
                      buffer = new ArrayBuffer(totalBytes);
                    } catch (allocErr) {
                      console.warn('Allocation failed for binary STL', allocErr);
                      alert('Model too large for binary STL in memory.');
                      setExportingSTL(false);
                      return;
                    }
                    const view = new DataView(buffer);
                    const headerStr = 'StrataPaint Binary STL';
                    for (let i = 0; i < headerStr.length && i < 80; i++)
                      view.setUint8(i, headerStr.charCodeAt(i));
                    view.setUint32(headerBytes, totalTris, true);
                    const sx_f = sx,
                      sy_f = sy,
                      sz_f = sz;
                    const CHUNK = 20000;
                    let offset = headerBytes + 4;
                    try {
                      const writeTri = (t: ReturnType<typeof getTri>) => {
                        view.setFloat32(offset + 0, t.nx, true);
                        view.setFloat32(offset + 4, t.ny, true);
                        view.setFloat32(offset + 8, t.nz, true);
                        view.setFloat32(offset + 12, t.ax * sx_f, true);
                        view.setFloat32(offset + 16, t.ay * sy_f, true);
                        view.setFloat32(offset + 20, t.az * sz_f, true);
                        view.setFloat32(offset + 24, t.bx * sx_f, true);
                        view.setFloat32(offset + 28, t.by * sy_f, true);
                        view.setFloat32(offset + 32, t.bz * sz_f, true);
                        view.setFloat32(offset + 36, t.cx * sx_f, true);
                        view.setFloat32(offset + 40, t.cy * sy_f, true);
                        view.setFloat32(offset + 44, t.cz * sz_f, true);
                        view.setUint16(offset + 48, 0, true);
                        offset += triSize;
                      };
                      if (index) {
                        for (let i = 0, tri = 0; i < index.count; i += 3, tri++) {
                          const a = index.getX(i),
                            b = index.getX(i + 1),
                            c = index.getX(i + 2);
                          writeTri(getTri(a, b, c));
                          if (tri % CHUNK === 0) {
                            setExportProgress(tri / totalTris);
                            await new Promise((r) => setTimeout(r, 0));
                          }
                        }
                      } else {
                        for (let i = 0, tri = 0; i < pos.count; i += 3, tri++) {
                          writeTri(getTri(i, i + 1, i + 2));
                          if (tri % CHUNK === 0) {
                            setExportProgress(tri / totalTris);
                            await new Promise((r) => setTimeout(r, 0));
                          }
                        }
                      }
                      setExportProgress(1);
                      const blob = new Blob([buffer], {
                        type: 'model/stl',
                      });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = 'model.stl';
                      document.body.appendChild(a);
                      a.click();
                      a.remove();
                      URL.revokeObjectURL(url);
                    } catch (err) {
                      console.warn('STL export failed', err);
                      alert('STL export failed. See console for details.');
                    } finally {
                      setExportingSTL(false);
                      setTimeout(() => setExportProgress(0), 300);
                    }
                    return;
                  }
                  // 2D image path
                  if (!canvasPreviewRef.current) return;
                  const blob = await canvasPreviewRef.current.exportImageBlob();
                  if (!blob) {
                    alert('No image available to download');
                    return;
                  }
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'image.png';
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  URL.revokeObjectURL(url);
                }}
              >
                {mode === '3d' && exportingSTL ? (
                  <i className="fa-solid fa-spinner fa-spin" aria-hidden="true" />
                ) : (
                  <i className="fa-solid fa-download" aria-hidden="true" />
                )}
              </button>
              {mode === '2d' && (
                <>
                  <button
                    className="preview-crop-btn"
                    title="Toggle checkerboard"
                    aria-label="Toggle checkerboard"
                    onClick={() => setShowCheckerboard((s) => !s)}
                  >
                    <i className="fa-solid fa-square" aria-hidden />
                  </button>
                  {/* moved uploader buttons into the top-right preview actions */}
                  <button
                    className="preview-crop-btn"
                    title="Choose file"
                    aria-label="Choose file"
                    onClick={() => inputRef.current?.click()}
                  >
                    <i className="fa-solid fa-file-upload" aria-hidden />
                  </button>
                  <button
                    className="preview-crop-btn"
                    title="Remove image"
                    aria-label="Remove image"
                    onClick={clear}
                    disabled={!imageSrc || isCropMode}
                  >
                    <i className="fa-solid fa-trash" aria-hidden />
                  </button>
                </>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
