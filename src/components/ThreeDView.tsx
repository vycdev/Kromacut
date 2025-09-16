import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/Addons.js";

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
}

// Convert hex color to RGB tuple
function hexToRGB(hex: string): [number, number, number] {
    const h = hex.replace(/^#/, "");
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
}: ThreeDViewProps) {
    const mountRef = useRef<HTMLDivElement | null>(null);
    const rafRef = useRef<number | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const meshRef = useRef<THREE.Mesh | null>(null);
    const materialRef = useRef<THREE.MeshStandardMaterial | null>(null);
    const [isBuilding, setIsBuilding] = useState(false);

    // 1. Initialize Three.js scene once
    useEffect(() => {
        const el = mountRef.current;
        if (!el) return;
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(el.clientWidth, el.clientHeight);
        el.appendChild(renderer.domElement);
        rendererRef.current = renderer;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0b0c0d);
        sceneRef.current = scene;

        const camera = new THREE.PerspectiveCamera(
            45,
            el.clientWidth / el.clientHeight,
            0.1,
            1000
        );
        camera.position.set(0, 0.9, 1.8);
        cameraRef.current = camera;

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controlsRef.current = controls;

        // Lights
        const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
        hemi.position.set(0, 1, 0);
        scene.add(hemi);
        const dir = new THREE.DirectionalLight(0xffffff, 0.8);
        dir.position.set(2, 3, 1);
        scene.add(dir);

        // Placeholder plane (very low res) – will be replaced when image builds
        const placeholderGeom = new THREE.PlaneGeometry(1, 1, 1, 1);
        const material = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            metalness: 0.0,
            roughness: 0.85,
            side: THREE.DoubleSide,
            vertexColors: true,
            flatShading: true,
        });
        materialRef.current = material;
        const mesh = new THREE.Mesh(placeholderGeom, material);
        // We keep the geometry un-rotated so that:
        // X axis -> image width, Y axis -> image height, Z axis -> vertical (height map)
        // (Typical 3D printing coordinate system uses Z as vertical.)
        scene.add(mesh);
        meshRef.current = mesh;
        try {
            (
                window as unknown as { __STRATA_LAST_MESH?: THREE.Mesh }
            ).__STRATA_LAST_MESH = mesh;
        } catch {
            /* no-op */
        }

        const resize = () => {
            if (!el || !cameraRef.current || !rendererRef.current) return;
            const w = el.clientWidth;
            const h = el.clientHeight;
            rendererRef.current.setSize(w, h);
            cameraRef.current.aspect = w / h;
            cameraRef.current.updateProjectionMatrix();
        };
        const ro = new ResizeObserver(resize);
        ro.observe(el);

        const animate = () => {
            controls.update();
            renderer.render(scene, camera);
            rafRef.current = requestAnimationFrame(animate);
        };
        rafRef.current = requestAnimationFrame(animate);

        // Create an overlay element for build-in-progress messaging
        const overlay = document.createElement("div");
        overlay.style.position = "absolute";
        overlay.style.left = "0";
        overlay.style.top = "0";
        overlay.style.width = "100%";
        overlay.style.height = "100%";
        overlay.style.display = "none";
        overlay.style.alignItems = "center";
        overlay.style.justifyContent = "center";
        overlay.style.pointerEvents = "none";
        overlay.style.zIndex = "10";
        overlay.style.color = "#fff";
        overlay.style.fontFamily = "sans-serif";
        overlay.style.fontSize = "14px";
        overlay.textContent = "Building 3D model…";
        el.style.position = el.style.position || "relative";
        el.appendChild(overlay);

        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            ro.disconnect();
            controls.dispose();
            placeholderGeom.dispose();
            material.dispose();
            renderer.dispose();
            if (renderer.domElement.parentNode)
                renderer.domElement.parentNode.removeChild(renderer.domElement);
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        };
    }, []);

    // Sync overlay visibility when build state changes
    useEffect(() => {
        const el = mountRef.current;
        if (!el) return;
        const overlay = Array.from(el.children).find(
            (c) => c.nodeType === 1 && (c as HTMLElement).textContent === "Building 3D model…"
        ) as HTMLElement | undefined;
        if (!overlay) return;
        overlay.style.display = isBuilding ? "flex" : "none";
    }, [isBuilding]);

    // 2. Rebuild mesh geometry whenever inputs change (debounced, progressive, adaptive resolution)
    const buildTokenRef = useRef(0);
    const debounceTimerRef = useRef<number | null>(null);
    const lastParamsKeyRef = useRef<string | null>(null);

    useEffect(() => {
        const mesh = meshRef.current;
        if (!mesh || !imageSrc) return;

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
        if (debounceTimerRef.current)
            window.clearTimeout(debounceTimerRef.current);
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
                        requestIdleCallback?: (
                            cb: () => void,
                            opts?: { timeout: number }
                        ) => void;
                    }
                ).requestIdleCallback;
                if (typeof ric === "function") ric(fn, { timeout: 300 });
                else setTimeout(fn, 0);
            };

            // Shared image load (do once for preview + final)
            const loadImage = () =>
                new Promise<HTMLImageElement | null>((res) => {
                    const i = new Image();
                    i.crossOrigin = "anonymous";
                    i.onload = () => res(i);
                    i.onerror = () => res(null);
                    i.src = imageSrc;
                });

            const buildGeometry = async (
                img: HTMLImageElement,
                resolution: number,
                mode: "preview" | "final",
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
                const canvas = document.createElement("canvas");
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext("2d");
                if (!ctx) return;
                ctx.drawImage(img, 0, 0, w, h);
                const { data } = ctx.getImageData(0, 0, w, h);

                // Precompute cumulative heights
                const orderPositions = new Map<number, number>();
                colorOrder.forEach((fi, pos) => orderPositions.set(fi, pos));
                const cumulativePerOrderPos: number[] = [];
                let running = 0;
                colorOrder.forEach((fi, pos) => {
                    running += colorSliceHeights[fi] || 0;
                    cumulativePerOrderPos[pos] = running;
                });

                const planeGeom = new THREE.PlaneGeometry(
                    1,
                    1,
                    resolution,
                    resolution
                );
                const posAttr = planeGeom.getAttribute("position");
                const vertexCount = posAttr.count;
                const colors = new Float32Array(vertexCount * 3);

                // Progressive yielding to keep main thread responsive
                let lastYield = performance.now();
                const YIELD_EVERY_MS = 12;
                for (let vi = 0; vi < vertexCount; vi++) {
                    const vx = posAttr.getX(vi);
                    const vz = posAttr.getY(vi);
                    const u = vx + 0.5;
                    const v = vz + 0.5;
                    // Map to bounding box if provided, otherwise full image
                    const bMinX = bbox ? bbox.minX : 0;
                    const bMinY = bbox ? bbox.minY : 0;
                    const bW = bbox ? bbox.boxW : w;
                    const bH = bbox ? bbox.boxH : h;
                    const px = Math.min(
                        w - 1,
                        Math.max(0, Math.round(bMinX + u * (bW - 1)))
                    );
                    const py = Math.min(
                        h - 1,
                        Math.max(0, Math.round(bMinY + v * (bH - 1)))
                    );
                    const idx = (py * w + px) * 4;
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
                    posAttr.setZ(vi, height);
                    colors[vi * 3 + 0] = r / 255;
                    colors[vi * 3 + 1] = g / 255;
                    colors[vi * 3 + 2] = b / 255;
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
                            const hA = posAttr.getZ(a);
                            const hB = posAttr.getZ(bI);
                            const hC = posAttr.getZ(c);
                            const hD = posAttr.getZ(d);
                            // Use max so that a tall pixel produces a full-height plateau rather than being averaged down
                            const cellH = Math.max(hA, hB, hC, hD);
                            posAttr.setZ(a, cellH);
                            posAttr.setZ(bI, cellH);
                            posAttr.setZ(c, cellH);
                            posAttr.setZ(d, cellH);
                        }
                        if (performance.now() - lastYield > YIELD_EVERY_MS) {
                            await new Promise((r) => requestAnimationFrame(r));
                            if (token !== buildTokenRef.current) return;
                            lastYield = performance.now();
                        }
                    }
                    posAttr.needsUpdate = true;
                }
                planeGeom.setAttribute(
                    "color",
                    new THREE.BufferAttribute(colors, 3)
                );

                // If preview mode, skip walls/bottom for speed
                let finalGeom: THREE.BufferGeometry;
                if (mode === "preview") {
                    finalGeom = planeGeom;
                } else {
                    const widthSegments = resolution;
                    const heightSegments = resolution;
                    const vertsPerRow = widthSegments + 1;
                    const topVertexCount = posAttr.count;
                    const topPositions = new Float32Array(topVertexCount * 3);
                    for (let i = 0; i < topVertexCount; i++) {
                        topPositions[i * 3 + 0] = posAttr.getX(i);
                        topPositions[i * 3 + 1] = posAttr.getY(i);
                        topPositions[i * 3 + 2] = posAttr.getZ(i);
                    }
                    const bottomPositions = new Float32Array(
                        topVertexCount * 3
                    );
                    for (let i = 0; i < topVertexCount; i++) {
                        bottomPositions[i * 3 + 0] = topPositions[i * 3 + 0];
                        bottomPositions[i * 3 + 1] = topPositions[i * 3 + 1];
                        bottomPositions[i * 3 + 2] = 0;
                    }
                    const bottomColors = new Float32Array(topVertexCount * 3);
                    bottomColors.set(colors);
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
                    const bottomOffset = topVertexCount;
                    const indices: number[] = [...topIndices];
                    for (let i = topIndices.length - 1; i >= 0; i--)
                        indices.push(bottomOffset + topIndices[i]);
                    const heightAt = (vx: number, vy: number) =>
                        topPositions[(vy * vertsPerRow + vx) * 3 + 2];
                    const pushWall = (tA: number, tB: number) => {
                        const bA = tA + bottomOffset;
                        const bB = tB + bottomOffset;
                        indices.push(tA, bA, bB, tA, bB, tB);
                    };
                    for (let x = 0; x < widthSegments; x++) {
                        if (heightAt(x, 0) > 0 || heightAt(x + 1, 0) > 0)
                            pushWall(
                                0 * vertsPerRow + x,
                                0 * vertsPerRow + (x + 1)
                            );
                        if (
                            heightAt(x, heightSegments) > 0 ||
                            heightAt(x + 1, heightSegments) > 0
                        )
                            pushWall(
                                heightSegments * vertsPerRow + (x + 1),
                                heightSegments * vertsPerRow + x
                            );
                    }
                    for (let y = 0; y < heightSegments; y++) {
                        if (heightAt(0, y) > 0 || heightAt(0, y + 1) > 0)
                            pushWall(
                                (y + 1) * vertsPerRow + 0,
                                y * vertsPerRow + 0
                            );
                        if (
                            heightAt(widthSegments, y) > 0 ||
                            heightAt(widthSegments, y + 1) > 0
                        )
                            pushWall(
                                y * vertsPerRow + widthSegments,
                                (y + 1) * vertsPerRow + widthSegments
                            );
                    }
                    const combinedPositions = new Float32Array(
                        topVertexCount * 2 * 3
                    );
                    combinedPositions.set(topPositions, 0);
                    combinedPositions.set(bottomPositions, topVertexCount * 3);
                    const combinedColors = new Float32Array(
                        topVertexCount * 2 * 3
                    );
                    combinedColors.set(colors, 0);
                    combinedColors.set(bottomColors, topVertexCount * 3);
                    finalGeom = new THREE.BufferGeometry();
                    finalGeom.setAttribute(
                        "position",
                        new THREE.BufferAttribute(combinedPositions, 3)
                    );
                    finalGeom.setAttribute(
                        "color",
                        new THREE.BufferAttribute(combinedColors, 3)
                    );
                    finalGeom.setIndex(indices);
                    finalGeom.computeVertexNormals();
                    planeGeom.dispose();
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
                        window as unknown as { __STRATA_LAST_MESH?: THREE.Mesh }
                    ).__STRATA_LAST_MESH = mesh;
                } catch {
                    /* ignore */
                }

                // Direct pixel to mm mapping: each pixel spans pixelSize mm.
                const finalW = bbox ? bbox.boxW : w;
                const finalH = bbox ? bbox.boxH : h;
                // Map pixel domain to X (width) & Y (height). Heights already in mm on Z; apply optional exaggeration via heightScale.
                mesh.scale.set(
                    finalW * pixelSize,
                    finalH * pixelSize,
                    heightScale
                );

                if (typeof window !== "undefined") {
                    console.debug("[3D] scaled model", {
                        pxW: finalW,
                        pxH: finalH,
                        mmW: finalW * pixelSize,
                        mmH: finalH * pixelSize,
                        aspect: (finalW / finalH).toFixed(3),
                        heightScale,
                        scale: mesh.scale.toArray(),
                    });
                }

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
                mode: "preview" | "final",
                bbox: { minX: number; minY: number; boxW: number; boxH: number }
            ) => {
                if (token !== buildTokenRef.current) return;
                const fullW = img.naturalWidth;
                const fullH = img.naturalHeight;
                const { minX, minY, boxW, boxH } = bbox;
                // Safety guard for enormous images
                if (boxW * boxH > 1_200_000) {
                    console.warn(
                        "[3D] pixelColumns fallback to adaptive (image too large)"
                    );
                    return buildGeometry(
                        img,
                        chooseResolution(boxW, boxH),
                        mode,
                        bbox
                    );
                }
                const canvas = document.createElement("canvas");
                canvas.width = fullW;
                canvas.height = fullH;
                const ctx = canvas.getContext("2d");
                if (!ctx) return;
                ctx.drawImage(img, 0, 0, fullW, fullH);
                const { data } = ctx.getImageData(0, 0, fullW, fullH);

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
                            const swatchIndex = findSwatchIndex(
                                r,
                                g,
                                b,
                                swatches
                            );
                            if (swatchIndex !== -1) {
                                const orderPos =
                                    orderPositions.get(swatchIndex);
                                if (orderPos !== undefined)
                                    height +=
                                        cumulativePerOrderPos[orderPos] || 0;
                            }
                        }
                        if (layerHeight > 0)
                            height =
                                Math.round(height / layerHeight) * layerHeight;
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
                const posAttr = geom.getAttribute("position");
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
                        vertexColors[vi * 3 + 1] =
                            pixColors[colorBase + 1] / 255;
                        vertexColors[vi * 3 + 2] =
                            pixColors[colorBase + 2] / 255;
                    }
                    if (performance.now() - lastYield > YIELD_MS) {
                        await new Promise((r) => requestAnimationFrame(r));
                        if (token !== buildTokenRef.current) return;
                        lastYield = performance.now();
                    }
                }
                geom.setAttribute(
                    "color",
                    new THREE.BufferAttribute(vertexColors, 3)
                );

                // For preview mode we skip walls/bottom
                let finalGeom: THREE.BufferGeometry = geom;
                if (mode === "final") {
                    const topPositions = new Float32Array(posAttr.count * 3);
                    for (let i = 0; i < posAttr.count; i++) {
                        topPositions[i * 3] = posAttr.getX(i);
                        topPositions[i * 3 + 1] = posAttr.getY(i);
                        topPositions[i * 3 + 2] = posAttr.getZ(i);
                    }
                    const bottomPositions = new Float32Array(posAttr.count * 3);
                    bottomPositions.set(topPositions);
                    for (let i = 0; i < posAttr.count; i++)
                        bottomPositions[i * 3 + 2] = 0;
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
                        if (
                            heightAt(x, heightSegments) > 0 ||
                            heightAt(x + 1, heightSegments) > 0
                        )
                            pushWall(
                                heightSegments * vertsRow + (x + 1),
                                heightSegments * vertsRow + x
                            );
                    }
                    for (let y = 0; y < heightSegments; y++) {
                        if (heightAt(0, y) > 0 || heightAt(0, y + 1) > 0)
                            pushWall((y + 1) * vertsRow + 0, y * vertsRow + 0);
                        if (
                            heightAt(widthSegments, y) > 0 ||
                            heightAt(widthSegments, y + 1) > 0
                        )
                            pushWall(
                                y * vertsRow + widthSegments,
                                (y + 1) * vertsRow + widthSegments
                            );
                    }
                    const combinedPositions = new Float32Array(
                        topPositions.length * 2
                    );
                    combinedPositions.set(topPositions, 0);
                    combinedPositions.set(bottomPositions, topPositions.length);
                    const combinedColors = new Float32Array(
                        vertexColors.length * 2
                    );
                    combinedColors.set(vertexColors, 0);
                    combinedColors.set(vertexColors, vertexColors.length);
                    finalGeom = new THREE.BufferGeometry();
                    finalGeom.setAttribute(
                        "position",
                        new THREE.BufferAttribute(combinedPositions, 3)
                    );
                    finalGeom.setAttribute(
                        "color",
                        new THREE.BufferAttribute(combinedColors, 3)
                    );
                    finalGeom.setIndex(indices);
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
                mesh.scale.set(
                    finalW * pixelSize,
                    finalH * pixelSize,
                    heightScale
                );
            };

            (async () => {
                const img = await loadImage();
                if (!img || token !== buildTokenRef.current) return;
                const w = img.naturalWidth;
                const h = img.naturalHeight;
                // compute opaque bounding box
                const c = document.createElement("canvas");
                c.width = w;
                c.height = h;
                const cx = c.getContext("2d");
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
                    await buildGeometry(img, previewRes, "preview", bbox);
                } else {
                    await buildGeometry(img, previewRes, "preview", bbox);
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
                        if (pixelColumns) await buildPixelGeometry(img, "final", bbox);
                        else await buildGeometry(img, fullRes, "final", bbox);
                        res();
                    })
                );
                if (token === buildTokenRef.current) setIsBuilding(false);
            })();
        }, 120); // 120ms debounce

        return () => {
            if (debounceTimerRef.current)
                window.clearTimeout(debounceTimerRef.current);
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
    ]);

    return <div style={{ width: "100%", height: "100%" }} ref={mountRef} />;
}
