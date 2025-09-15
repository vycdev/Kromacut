import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/Addons.js";

interface ThreeDViewProps {
    imageSrc?: string | null;
    baseSliceHeight: number; // mm
    layerHeight: number; // mm (granularity)
    colorSliceHeights: number[]; // per color height increments (mm)
    colorOrder: number[]; // ordering (indices into swatches)
    swatches: { hex: string; a: number }[]; // filtered (non-transparent) swatches in original order
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
}: ThreeDViewProps) {
    const mountRef = useRef<HTMLDivElement | null>(null);
    const rafRef = useRef<number | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const meshRef = useRef<THREE.Mesh | null>(null);
    const materialRef = useRef<THREE.MeshStandardMaterial | null>(null);

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
        mesh.rotation.x = -Math.PI / 2;
        scene.add(mesh);
        meshRef.current = mesh;

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

        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            ro.disconnect();
            controls.dispose();
            placeholderGeom.dispose();
            material.dispose();
            renderer.dispose();
            if (renderer.domElement.parentNode)
                renderer.domElement.parentNode.removeChild(renderer.domElement);
        };
    }, []);

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
        });
        if (paramsKey === lastParamsKeyRef.current) return; // nothing changed logically
        lastParamsKeyRef.current = paramsKey;

        // Debounce rapid changes (e.g., dragging slider)
        if (debounceTimerRef.current)
            window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = window.setTimeout(() => {
            const token = ++buildTokenRef.current;
            const MAX_VIEW_DIM_MM = 120;

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
                mode: "preview" | "final"
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
                    const px = Math.min(
                        w - 1,
                        Math.max(0, Math.round(u * (w - 1)))
                    );
                    const py = Math.min(
                        h - 1,
                        Math.max(0, Math.round(v * (h - 1)))
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

                const maxDimPx = Math.max(w, h);
                const mmPerPixel = MAX_VIEW_DIM_MM / maxDimPx;
                mesh.scale.x = w * mmPerPixel;
                mesh.scale.z = h * mmPerPixel;
                // (Optional instrumentation)
                // console.log(`[3D] ${mode} build @${resolution} took ${(performance.now()-t0).toFixed(1)}ms`);
            };

            (async () => {
                const img = await loadImage();
                if (!img || token !== buildTokenRef.current) return;
                const w = img.naturalWidth;
                const h = img.naturalHeight;
                const fullRes = chooseResolution(w, h);
                const previewRes = Math.max(32, Math.round(fullRes / 3));
                // Quick preview
                await buildGeometry(img, previewRes, "preview");
                if (token !== buildTokenRef.current) return;
                requestIdle(() => {
                    buildGeometry(img, fullRes, "final");
                });
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
    ]);

    return <div style={{ width: "100%", height: "100%" }} ref={mountRef} />;
}
