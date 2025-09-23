import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import useThreeScene from '../hooks/useThreeScene';

interface ThreeDViewProps {
    imageSrc?: string | null;
    baseSliceHeight: number; // mm
    layerHeight: number; // mm (granularity)
    colorSliceHeights: number[]; // per color height increments (mm)
    colorOrder: number[]; // ordering (indices into swatches)
    swatches: { hex: string; a: number }[]; // filtered (non-transparent) swatches in original order
    pixelSize?: number; // mm per pixel horizontally (X & Z). Default 0.01 => 100px = 1mm
    heightScale?: number; // vertical exaggeration (1 = real scale)
    stepped?: boolean; // if true, flatten each cell to a uniform height (square plateaus instead of spikes)
    pixelColumns?: boolean; // if true, final build uses one plateau per image pixel (rectangular towers)
    rebuildSignal?: number;
}

// Convert hex color to RGB tuple
function hexToRGB(hex: string): [number, number, number] {
    const h = hex.replace(/^#/, '');
    const r = parseInt(h.slice(0, 2), 16) || 0;
    const g = parseInt(h.slice(2, 4), 16) || 0;
    const b = parseInt(h.slice(4, 6), 16) || 0;
    return [r, g, b];
}

// Simple color match: exact RGB equality (image already quantized to palette)
function findSwatchIndex(
    r: number,
    g: number,
    b: number,
    swatches: { hex: string; a: number }[]
): number {
    for (let i = 0; i < swatches.length; i++) {
        const [sr, sg, sb] = hexToRGB(swatches[i].hex);
        if (sr === r && sg === g && sb === b) return i;
    }
    return -1;
}

export default function ThreeDView({
    imageSrc,
    baseSliceHeight,
    layerHeight,
    colorSliceHeights,
    colorOrder,
    swatches,
    pixelSize = 0.01,
    heightScale = 1,
    stepped = true,
    pixelColumns = true,
    rebuildSignal = 0,
}: ThreeDViewProps) {
    const mountRef = useRef<HTMLDivElement | null>(null);
    const [isBuilding, setIsBuilding] = useState(false);
    const { cameraRef, controlsRef, meshRef, materialRef } = useThreeScene(mountRef, setIsBuilding);

    // Three.js initialization moved into `useThreeScene` hook for clarity.

    // Sync overlay visibility when build state changes
    useEffect(() => {
        const el = mountRef.current;
        if (!el) return;
        const overlay = Array.from(el.children).find(
            (c) => c.nodeType === 1 && (c as HTMLElement).textContent === 'Building 3D model…'
        ) as HTMLElement | undefined;
        if (!overlay) return;
        overlay.style.display = isBuilding ? 'flex' : 'none';
    }, [isBuilding]);

    // 2. Rebuild mesh geometry whenever inputs change (debounced, progressive, adaptive resolution)
    const buildTokenRef = useRef(0);
    const debounceTimerRef = useRef<number | null>(null);
    const lastParamsKeyRef = useRef<string | null>(null);
    const lastRebuildRef = useRef<number>(rebuildSignal);

    useEffect(() => {
        const mesh = meshRef.current;
        if (!mesh || !imageSrc) return;

        // If parent requested a rebuild via the rebuildSignal, clear the last params key
        // to force the effect to proceed even if params otherwise match.
        if (rebuildSignal !== lastRebuildRef.current) {
            lastParamsKeyRef.current = null;
            lastRebuildRef.current = rebuildSignal;
        }

        // Stable key of inputs to avoid duplicate builds when references unchanged
        const paramsKey = JSON.stringify({
            imageSrc,
            baseSliceHeight,
            layerHeight,
            colorSliceHeights,
            colorOrder,
            swatches: swatches.map((s) => s.hex),
            pixelSize,
            heightScale,
            stepped,
            pixelColumns,
        });
        if (paramsKey === lastParamsKeyRef.current) return; // nothing changed logically
        lastParamsKeyRef.current = paramsKey;

        // Debounce rapid changes (e.g., dragging slider)
        if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = window.setTimeout(() => {
            const token = ++buildTokenRef.current;
            // mark that a build is in progress for the overlay
            setIsBuilding(true);

            const chooseResolution = (w: number, h: number) => {
                const maxDim = Math.max(w, h);
                if (maxDim > 3000) return 512;
                if (maxDim > 2000) return 384;
                if (maxDim > 1600) return 320;
                if (maxDim > 1200) return 256;
                if (maxDim > 900) return 192;
                if (maxDim > 600) return 160;
                if (maxDim > 400) return 128;
                return 96;
            };

            const requestIdle = (fn: () => void) => {
                const ric = (
                    window as unknown as {
                        requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => void;
                    }
                ).requestIdleCallback;
                if (typeof ric === 'function') ric(fn, { timeout: 300 });
                else setTimeout(fn, 0);
            };

            // Shared image load (do once for preview + final)
            const loadImage = () =>
                new Promise<HTMLImageElement | null>((res) => {
                    const i = new Image();
                    i.crossOrigin = 'anonymous';
                    i.onload = () => res(i);
                    i.onerror = () => res(null);
                    i.src = imageSrc;
                });

            const buildGeometry = async (
                img: HTMLImageElement,
                resolution: number,
                mode: 'preview' | 'final',
                bbox?: {
                    minX: number;
                    minY: number;
                    boxW: number;
                    boxH: number;
                }
            ) => {
                if (token !== buildTokenRef.current) return; // superseded
                const w = img.naturalWidth;
                const h = img.naturalHeight;
                if (!w || !h) return;
                // const t0 = performance.now(); // instrumentation placeholder
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                if (!ctx) return;
                ctx.drawImage(img, 0, 0, w, h);
                const { data } = ctx.getImageData(0, 0, w, h);

                // Create a canvas-based texture for crisp sampling and apply nearest-neighbor filtering
                try {
                    const tex = new THREE.CanvasTexture(canvas);
                    tex.magFilter = THREE.NearestFilter;
                    tex.minFilter = THREE.NearestFilter;
                    tex.generateMipmaps = false;
                    tex.wrapS = THREE.ClampToEdgeWrapping;
                    tex.wrapT = THREE.ClampToEdgeWrapping;
                    // If a bounding box is provided, map UV 0..1 to that cropped region
                    if (bbox) {
                        tex.repeat.set(bbox.boxW / w, bbox.boxH / h);
                        tex.offset.set(bbox.minX / w, 1 - (bbox.minY + bbox.boxH) / h);
                    } else {
                        tex.repeat.set(1, 1);
                        tex.offset.set(0, 0);
                    }
                    tex.needsUpdate = true;
                    const mat = materialRef.current;
                    if (mat) {
                        mat.map = tex;
                        mat.vertexColors = false;
                        mat.needsUpdate = true;
                    }
                } catch {
                    /* ignore texture assign failure */
                }

                // Precompute cumulative heights
                const orderPositions = new Map<number, number>();
                colorOrder.forEach((fi, pos) => orderPositions.set(fi, pos));
                const cumulativePerOrderPos: number[] = [];
                let running = 0;
                colorOrder.forEach((fi, pos) => {
                    running += colorSliceHeights[fi] || 0;
                    cumulativePerOrderPos[pos] = running;
                });

                // Create indexed plane geometry (grid) and compute per-vertex heights on the indexed grid.
                const indexedPlane = new THREE.PlaneGeometry(1, 1, resolution, resolution);
                const idxPos = indexedPlane.getAttribute('position');
                const indexedVertexCount = idxPos.count;
                const YIELD_EVERY_MS = 12;
                let lastYield = performance.now();

                // Compute heights on the indexed grid vertices
                for (let vi = 0; vi < indexedVertexCount; vi++) {
                    const vx = idxPos.getX(vi);
                    const vz = idxPos.getY(vi);
                    const u = vx + 0.5;
                    const v = vz + 0.5;
                    const bMinX = bbox ? bbox.minX : 0;
                    const bMinY = bbox ? bbox.minY : 0;
                    const bW = bbox ? bbox.boxW : w;
                    const bH = bbox ? bbox.boxH : h;
                    const px = Math.min(w - 1, Math.max(0, Math.round(bMinX + u * (bW - 1))));
                    const py = Math.min(h - 1, Math.max(0, Math.round(bMinY + v * (bH - 1))));
                    const idx = (py * w + px) * 4;
                    const r = data[idx];
                    const g = data[idx + 1];
                    const bcol = data[idx + 2];
                    const a = data[idx + 3];
                    const opaque = a > 0;
                    let height = opaque ? baseSliceHeight : 0;
                    if (opaque && swatches.length) {
                        const swatchIndex = findSwatchIndex(r, g, bcol, swatches);
                        if (swatchIndex !== -1) {
                            const orderPos = orderPositions.get(swatchIndex);
                            if (orderPos !== undefined)
                                height += cumulativePerOrderPos[orderPos] || 0;
                        }
                    }
                    if (layerHeight > 0) height = Math.round(height / layerHeight) * layerHeight;
                    idxPos.setZ(vi, height);

                    if (performance.now() - lastYield > YIELD_EVERY_MS) {
                        await new Promise((r) => requestAnimationFrame(r));
                        if (token !== buildTokenRef.current) return;
                        lastYield = performance.now();
                    }
                }

                // Optional: flatten heights per cell to eliminate single-vertex spikes (creates square plateaus)
                if (stepped) {
                    const widthSegments = resolution;
                    const heightSegments = resolution;
                    const vertsPerRow = widthSegments + 1;
                    for (let y = 0; y < heightSegments; y++) {
                        for (let x = 0; x < widthSegments; x++) {
                            const a = y * vertsPerRow + x;
                            const bI = a + 1;
                            const c = a + vertsPerRow;
                            const d = c + 1;
                            const hA = idxPos.getZ(a);
                            const hB = idxPos.getZ(bI);
                            const hC = idxPos.getZ(c);
                            const hD = idxPos.getZ(d);
                            const cellH = Math.max(hA, hB, hC, hD);
                            idxPos.setZ(a, cellH);
                            idxPos.setZ(bI, cellH);
                            idxPos.setZ(c, cellH);
                            idxPos.setZ(d, cellH);
                        }
                        if (performance.now() - lastYield > YIELD_EVERY_MS) {
                            await new Promise((r) => requestAnimationFrame(r));
                            if (token !== buildTokenRef.current) return;
                            lastYield = performance.now();
                        }
                    }
                    idxPos.needsUpdate = true;
                }

                // If preview mode, convert the indexed grid to non-indexed for fast rendering and skip walls/bottom
                let finalGeom: THREE.BufferGeometry;
                if (mode === 'preview') {
                    finalGeom = indexedPlane.toNonIndexed();
                    indexedPlane.dispose();
                } else {
                    // Build final solid by duplicating the indexed grid (top + bottom) and stitching side walls
                    const widthSegments = resolution;
                    const heightSegments = resolution;
                    const vertsPerRow = widthSegments + 1;

                    const gridVertexCount = idxPos.count; // (resolution+1)^2
                    // Copy positions in indexed grid order
                    const topPositions = new Float32Array(gridVertexCount * 3);
                    for (let i = 0; i < gridVertexCount; i++) {
                        topPositions[i * 3 + 0] = idxPos.getX(i);
                        topPositions[i * 3 + 1] = idxPos.getY(i);
                        topPositions[i * 3 + 2] = idxPos.getZ(i);
                    }
                    const bottomPositions = new Float32Array(gridVertexCount * 3);
                    bottomPositions.set(topPositions);
                    for (let i = 0; i < gridVertexCount; i++) bottomPositions[i * 3 + 2] = 0;

                    // UVs in indexed grid order (duplicate for bottom)
                    const uvGrid = indexedPlane.getAttribute('uv') as THREE.BufferAttribute | null;
                    let combinedUVs: Float32Array | null = null;
                    if (uvGrid) {
                        combinedUVs = new Float32Array(uvGrid.count * 2 * 2);
                        for (let i = 0; i < uvGrid.count; i++) {
                            const u = uvGrid.getX(i);
                            const v = uvGrid.getY(i);
                            combinedUVs[i * 2] = u;
                            combinedUVs[i * 2 + 1] = v;
                            const bi = i + uvGrid.count;
                            combinedUVs[bi * 2] = u;
                            combinedUVs[bi * 2 + 1] = v;
                        }
                    }

                    // Build indices: top, bottom (reversed), and side walls referencing grid order
                    const topIndices: number[] = [];
                    for (let y = 0; y < heightSegments; y++) {
                        for (let x = 0; x < widthSegments; x++) {
                            const a = y * vertsPerRow + x;
                            const b = a + 1;
                            const c = a + vertsPerRow;
                            const d = c + 1;
                            topIndices.push(a, c, b, b, c, d);
                        }
                    }
                    const bottomOffset = gridVertexCount;
                    const indices: number[] = [...topIndices];
                    for (let i = topIndices.length - 1; i >= 0; i--) indices.push(bottomOffset + topIndices[i]);

                    const heightAt = (vx: number, vy: number) => topPositions[(vy * vertsPerRow + vx) * 3 + 2];
                    const pushWall = (tA: number, tB: number) => {
                        const bA = tA + bottomOffset;
                        const bB = tB + bottomOffset;
                        indices.push(tA, bA, bB, tA, bB, tB);
                    };
                    for (let x = 0; x < widthSegments; x++) {
                        if (heightAt(x, 0) > 0 || heightAt(x + 1, 0) > 0)
                            pushWall(0 * vertsPerRow + x, 0 * vertsPerRow + (x + 1));
                        if (heightAt(x, heightSegments) > 0 || heightAt(x + 1, heightSegments) > 0)
                            pushWall(heightSegments * vertsPerRow + (x + 1), heightSegments * vertsPerRow + x);
                    }
                    for (let y = 0; y < heightSegments; y++) {
                        if (heightAt(0, y) > 0 || heightAt(0, y + 1) > 0) pushWall((y + 1) * vertsPerRow + 0, y * vertsPerRow + 0);
                        if (heightAt(widthSegments, y) > 0 || heightAt(widthSegments, y + 1) > 0)
                            pushWall(y * vertsPerRow + widthSegments, (y + 1) * vertsPerRow + widthSegments);
                    }

                    const combinedPositions = new Float32Array(gridVertexCount * 2 * 3);
                    combinedPositions.set(topPositions, 0);
                    combinedPositions.set(bottomPositions, gridVertexCount * 3);

                    finalGeom = new THREE.BufferGeometry();
                    finalGeom.setAttribute('position', new THREE.BufferAttribute(combinedPositions, 3));
                    if (combinedUVs) finalGeom.setAttribute('uv', new THREE.BufferAttribute(combinedUVs, 2));
                    finalGeom.setIndex(indices);

                    // Expand to non-indexed to avoid 16-bit index limits and ensure per-face shading consistency
                    const indexedFinal = finalGeom;
                    finalGeom = indexedFinal.toNonIndexed();
                    indexedFinal.dispose();
                    finalGeom.computeVertexNormals();
                    indexedPlane.dispose();
                }

                if (token !== buildTokenRef.current) {
                    finalGeom.dispose();
                    return;
                }

                const oldGeom = mesh.geometry as THREE.BufferGeometry;
                mesh.geometry = finalGeom;
                oldGeom.dispose();
                try {
                    (
                        window as unknown as { __KROMACUT_LAST_MESH?: THREE.Mesh }
                    ).__KROMACUT_LAST_MESH = mesh;
                } catch {
                    /* ignore */
                }

                // Direct pixel to mm mapping: each pixel spans pixelSize mm.
                const finalW = bbox ? bbox.boxW : w;
                const finalH = bbox ? bbox.boxH : h;
                // Map pixel domain to X (width) & Y (height). Heights already in mm on Z; apply optional exaggeration via heightScale.
                mesh.scale.set(finalW * pixelSize, finalH * pixelSize, heightScale);

                // Auto-frame using bounding sphere for consistent view
                try {
                    const camera = cameraRef.current;
                    const controls = controlsRef.current;
                    if (camera && controls) {
                        const box = new THREE.Box3().setFromObject(mesh);
                        const sphere = new THREE.Sphere();
                        box.getBoundingSphere(sphere);
                        const fov = (camera.fov * Math.PI) / 180;
                        const distance = sphere.radius / Math.sin(fov / 2);
                        // Use an oblique direction to show thickness
                        const dir = new THREE.Vector3(0.9, 0.8, 1).normalize();
                        const camPos = sphere.center
                            .clone()
                            .add(dir.multiplyScalar(distance * 1.35));
                        camera.position.copy(camPos);
                        controls.target.copy(sphere.center);
                        camera.near = Math.max(0.01, sphere.radius * 0.01);
                        camera.far = sphere.radius * 20;
                        camera.updateProjectionMatrix();
                        controls.update();
                    }
                } catch {
                    /* framing failure ignored */
                }
                // (Optional instrumentation)
                // console.log(`[3D] ${mode} build @${resolution} took ${(performance.now()-t0).toFixed(1)}ms`);
            };

            // Build per-pixel column geometry (plateaus) for the FINAL pass when pixelColumns is enabled
            const buildPixelGeometry = async (
                img: HTMLImageElement,
                mode: 'preview' | 'final',
                bbox: { minX: number; minY: number; boxW: number; boxH: number }
            ) => {
                if (token !== buildTokenRef.current) return;
                const fullW = img.naturalWidth;
                const fullH = img.naturalHeight;
                const { minX, minY, boxW, boxH } = bbox;
                // Safety guard for enormous images
                if (boxW * boxH > 1_200_000) {
                    console.warn('[3D] pixelColumns fallback to adaptive (image too large)');
                    return buildGeometry(img, chooseResolution(boxW, boxH), mode, bbox);
                }
                const canvas = document.createElement('canvas');
                canvas.width = fullW;
                canvas.height = fullH;
                const ctx = canvas.getContext('2d');
                if (!ctx) return;
                ctx.drawImage(img, 0, 0, fullW, fullH);
                const { data } = ctx.getImageData(0, 0, fullW, fullH);

                // Create and assign a CanvasTexture for the pixelColumns path as well
                try {
                    const tex = new THREE.CanvasTexture(canvas);
                    tex.magFilter = THREE.NearestFilter;
                    tex.minFilter = THREE.NearestFilter;
                    tex.generateMipmaps = false;
                    tex.wrapS = THREE.ClampToEdgeWrapping;
                    tex.wrapT = THREE.ClampToEdgeWrapping;
                    // Map UV 0..1 to the bbox region
                    tex.repeat.set(boxW / fullW, boxH / fullH);
                    tex.offset.set(minX / fullW, 1 - (minY + boxH) / fullH);
                    tex.needsUpdate = true;
                    const mat = materialRef.current;
                    if (mat) {
                        mat.map = tex;
                        mat.vertexColors = false;
                        mat.needsUpdate = true;
                    }
                } catch {
                    /* ignore */
                }

                // Precompute cumulative heights
                const orderPositions = new Map<number, number>();
                colorOrder.forEach((fi, pos) => orderPositions.set(fi, pos));
                const cumulativePerOrderPos: number[] = [];
                let running = 0;
                colorOrder.forEach((fi, pos) => {
                    running += colorSliceHeights[fi] || 0;
                    cumulativePerOrderPos[pos] = running;
                });

                // Allocate arrays for pixel heights & colors
                const pixHeights = new Float32Array(boxW * boxH);
                const pixColors = new Uint8Array(boxW * boxH * 3);

                let lastYield = performance.now();
                const YIELD_MS = 12;
                for (let y = 0; y < boxH; y++) {
                    for (let x = 0; x < boxW; x++) {
                        const px = minX + x;
                        const py = minY + y;
                        const idx = (py * fullW + px) * 4;
                        const r = data[idx];
                        const g = data[idx + 1];
                        const b = data[idx + 2];
                        const a = data[idx + 3];
                        const opaque = a > 0;
                        let height = opaque ? baseSliceHeight : 0;
                        if (opaque && swatches.length) {
                            const swatchIndex = findSwatchIndex(r, g, b, swatches);
                            if (swatchIndex !== -1) {
                                const orderPos = orderPositions.get(swatchIndex);
                                if (orderPos !== undefined)
                                    height += cumulativePerOrderPos[orderPos] || 0;
                            }
                        }
                        if (layerHeight > 0)
                            height = Math.round(height / layerHeight) * layerHeight;
                        pixHeights[y * boxW + x] = height;
                        const base = (y * boxW + x) * 3;
                        pixColors[base] = r;
                        pixColors[base + 1] = g;
                        pixColors[base + 2] = b;
                    }
                    if (performance.now() - lastYield > YIELD_MS) {
                        await new Promise((r) => requestAnimationFrame(r));
                        if (token !== buildTokenRef.current) return;
                        lastYield = performance.now();
                    }
                }
                if (token !== buildTokenRef.current) return;

                // Geometry: one vertex per (boxW+1)*(boxH+1). Assign each vertex the height of its owning pixel (clamp to edge)
                const geom = new THREE.PlaneGeometry(1, 1, boxW, boxH);
                const posAttr = geom.getAttribute('position');
                const vertexColors = new Float32Array(posAttr.count * 3);
                const vertsPerRow = boxW + 1;
                for (let vy = 0; vy < boxH + 1; vy++) {
                    for (let vx = 0; vx < boxW + 1; vx++) {
                        const px = Math.min(boxW - 1, vx);
                        const py = Math.min(boxH - 1, vy);
                        const hVal = pixHeights[py * boxW + px];
                        const colorBase = (py * boxW + px) * 3;
                        const vi = vy * vertsPerRow + vx;
                        posAttr.setZ(vi, hVal);
                        vertexColors[vi * 3] = pixColors[colorBase] / 255;
                        vertexColors[vi * 3 + 1] = pixColors[colorBase + 1] / 255;
                        vertexColors[vi * 3 + 2] = pixColors[colorBase + 2] / 255;
                    }
                    if (performance.now() - lastYield > YIELD_MS) {
                        await new Promise((r) => requestAnimationFrame(r));
                        if (token !== buildTokenRef.current) return;
                        lastYield = performance.now();
                    }
                }
                geom.setAttribute('color', new THREE.BufferAttribute(vertexColors, 3));

                // For preview mode we skip walls/bottom
                let finalGeom: THREE.BufferGeometry = geom;
                if (mode === 'final') {
                    const topPositions = new Float32Array(posAttr.count * 3);
                    for (let i = 0; i < posAttr.count; i++) {
                        topPositions[i * 3] = posAttr.getX(i);
                        topPositions[i * 3 + 1] = posAttr.getY(i);
                        topPositions[i * 3 + 2] = posAttr.getZ(i);
                    }
                    const bottomPositions = new Float32Array(posAttr.count * 3);
                    bottomPositions.set(topPositions);
                    for (let i = 0; i < posAttr.count; i++) bottomPositions[i * 3 + 2] = 0;
                    const bottomColors = new Float32Array(vertexColors.length);
                    bottomColors.set(vertexColors);
                    const widthSegments = boxW;
                    const heightSegments = boxH;
                    const vertsRow = widthSegments + 1;
                    const topIndices: number[] = [];
                    for (let y = 0; y < heightSegments; y++) {
                        for (let x = 0; x < widthSegments; x++) {
                            const a = y * vertsRow + x;
                            const b = a + 1;
                            const c = a + vertsRow;
                            const d = c + 1;
                            topIndices.push(a, c, b, b, c, d);
                        }
                    }
                    const bottomOffset = posAttr.count;
                    const indices: number[] = [...topIndices];
                    for (let i = topIndices.length - 1; i >= 0; i--)
                        indices.push(bottomOffset + topIndices[i]);
                    const heightAt = (vx: number, vy: number) =>
                        topPositions[(vy * vertsRow + vx) * 3 + 2];
                    const pushWall = (tA: number, tB: number) => {
                        const bA = tA + bottomOffset;
                        const bB = tB + bottomOffset;
                        indices.push(tA, bA, bB, tA, bB, tB);
                    };
                    for (let x = 0; x < widthSegments; x++) {
                        if (heightAt(x, 0) > 0 || heightAt(x + 1, 0) > 0)
                            pushWall(0 * vertsRow + x, 0 * vertsRow + (x + 1));
                        if (heightAt(x, heightSegments) > 0 || heightAt(x + 1, heightSegments) > 0)
                            pushWall(
                                heightSegments * vertsRow + (x + 1),
                                heightSegments * vertsRow + x
                            );
                    }
                    for (let y = 0; y < heightSegments; y++) {
                        if (heightAt(0, y) > 0 || heightAt(0, y + 1) > 0)
                            pushWall((y + 1) * vertsRow + 0, y * vertsRow + 0);
                        if (heightAt(widthSegments, y) > 0 || heightAt(widthSegments, y + 1) > 0)
                            pushWall(
                                y * vertsRow + widthSegments,
                                (y + 1) * vertsRow + widthSegments
                            );
                    }
                    const combinedPositions = new Float32Array(topPositions.length * 2);
                    combinedPositions.set(topPositions, 0);
                    combinedPositions.set(bottomPositions, topPositions.length);
                    const combinedColors = new Float32Array(vertexColors.length * 2);
                    combinedColors.set(vertexColors, 0);
                    combinedColors.set(vertexColors, vertexColors.length);
                    finalGeom = new THREE.BufferGeometry();
                    finalGeom.setAttribute(
                        'position',
                        new THREE.BufferAttribute(combinedPositions, 3)
                    );
                    // Build UVs for grid: map XY from -0.5..0.5 to 0..1 for the top and bottom
                    const vertCount = posAttr.count;
                    const uvs = new Float32Array(vertCount * 2 * 2); // top + bottom
                    const vertsRowGrid = boxW + 1;
                    for (let vy = 0; vy < boxH + 1; vy++) {
                        for (let vx = 0; vx < boxW + 1; vx++) {
                            const vi = vy * vertsRowGrid + vx;
                            const u = vx / boxW;
                            const v = 1 - vy / boxH; // flip Y so texture appears upright
                            uvs[vi * 2] = u;
                            uvs[vi * 2 + 1] = v;
                            // duplicate for bottom verts
                            const bi = vi + vertCount;
                            uvs[bi * 2] = u;
                            uvs[bi * 2 + 1] = v;
                        }
                    }
                    finalGeom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
                    finalGeom.setAttribute('color', new THREE.BufferAttribute(combinedColors, 3));
                    finalGeom.setIndex(indices);
                    // Convert to non-indexed to avoid driver 16-bit index limits across devices
                    const indexed = finalGeom;
                    finalGeom = indexed.toNonIndexed();
                    indexed.dispose();
                    finalGeom.computeVertexNormals();
                    geom.dispose();
                }
                if (token !== buildTokenRef.current) return;
                // Swap onto mesh
                const mesh = meshRef.current;
                if (!mesh) return;
                const old = mesh.geometry as THREE.BufferGeometry;
                mesh.geometry = finalGeom;
                old.dispose();

                const finalW = boxW;
                const finalH = boxH;
                mesh.scale.set(finalW * pixelSize, finalH * pixelSize, heightScale);
            };

            (async () => {
                const img = await loadImage();
                if (!img || token !== buildTokenRef.current) return;
                const w = img.naturalWidth;
                const h = img.naturalHeight;
                // compute opaque bounding box
                const c = document.createElement('canvas');
                c.width = w;
                c.height = h;
                const cx = c.getContext('2d');
                if (!cx) return;
                cx.drawImage(img, 0, 0, w, h);
                const imgd = cx.getImageData(0, 0, w, h).data;
                let minX = w,
                    minY = h,
                    maxX = 0,
                    maxY = 0;
                for (let y = 0; y < h; y++) {
                    for (let x = 0; x < w; x++) {
                        const a = imgd[(y * w + x) * 4 + 3];
                        if (a > 0) {
                            if (x < minX) minX = x;
                            if (y < minY) minY = y;
                            if (x > maxX) maxX = x;
                            if (y > maxY) maxY = y;
                        }
                    }
                }
                if (maxX < minX || maxY < minY) {
                    // no opaque pixels — fallback to full image
                    minX = 0;
                    minY = 0;
                    maxX = w - 1;
                    maxY = h - 1;
                }
                const boxW = maxX - minX + 1;
                const boxH = maxY - minY + 1;
                const fullRes = chooseResolution(boxW, boxH);
                const previewRes = Math.max(32, Math.round(fullRes / 3));
                const bbox = { minX, minY, boxW, boxH };
                // Quick preview using bbox
                if (pixelColumns) {
                    // For performance, preview still uses adaptive sampling
                    await buildGeometry(img, previewRes, 'preview', bbox);
                } else {
                    await buildGeometry(img, previewRes, 'preview', bbox);
                }
                if (token !== buildTokenRef.current) {
                    setIsBuilding(false);
                    return;
                }
                // Schedule final build in an idle callback and await it so we can clear the building state
                await new Promise<void>((res) =>
                    requestIdle(async () => {
                        if (token !== buildTokenRef.current) {
                            res();
                            return;
                        }
                        if (pixelColumns) await buildPixelGeometry(img, 'final', bbox);
                        else await buildGeometry(img, fullRes, 'final', bbox);
                        res();
                    })
                );
                if (token === buildTokenRef.current) setIsBuilding(false);
            })();
        }, 120); // 120ms debounce

        return () => {
            if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current);
        };
    }, [
        imageSrc,
        baseSliceHeight,
        layerHeight,
        colorSliceHeights,
        colorOrder,
        swatches,
        pixelSize,
        heightScale,
        stepped,
        pixelColumns,
        rebuildSignal,
        cameraRef,
        controlsRef,
        materialRef,
        meshRef,
    ]);

    return <div style={{ width: '100%', height: '100%' }} ref={mountRef} />;
}
