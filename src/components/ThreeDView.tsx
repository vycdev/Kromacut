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

    useEffect(() => {
        const el = mountRef.current;
        if (!el) return;

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(el.clientWidth, el.clientHeight);
        el.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0b0c0d);

        const camera = new THREE.PerspectiveCamera(
            45,
            el.clientWidth / el.clientHeight,
            0.1,
            1000
        );
        camera.position.set(0, 0.9, 1.8);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;

        // lights
        const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
        hemi.position.set(0, 1, 0);
        scene.add(hemi);
        const dir = new THREE.DirectionalLight(0xffffff, 0.8);
        dir.position.set(2, 3, 1);
        scene.add(dir);

        // fallback plane material
        // Geometry resolution: adapt to image size but cap for performance
        const TARGET_RES = 256; // subdivisions per side for plane
        const geometry = new THREE.PlaneGeometry(
            1.0,
            1.0,
            TARGET_RES,
            TARGET_RES
        ); // 1x1 square
        const material = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            metalness: 0.0,
            roughness: 0.85,
            side: THREE.DoubleSide,
            vertexColors: true,
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.x = -Math.PI / 2; // lay flat
        scene.add(mesh);

        // Build height + color data from image according to stacking rules
        // Steps:
        // 1. Draw image to an offscreen canvas (treat partial alpha >0 as opaque).
        // 2. For each vertex sample the corresponding pixel.
        // 3. Height starts at baseSliceHeight if pixel opaque (>0 alpha) else 0.
        // 4. Determine pixel swatch index; then compute additional stacked height:
        //    For ordered colors (colorOrder), a lower index slice covers all higher indices.
        //    If pixel's swatch is at position P in colorOrder, add sum(colorSliceHeights for order indices <= P).
        // 5. Heights are discrete (no smoothing) - direct staircase.

        const applyHeightMap = async () => {
            if (!imageSrc) return;
            try {
                const img = await new Promise<HTMLImageElement | null>(
                    (res) => {
                        const i = new Image();
                        i.crossOrigin = "anonymous";
                        i.onload = () => res(i);
                        i.onerror = () => res(null);
                        i.src = imageSrc;
                    }
                );
                if (!img) return;
                const w = img.naturalWidth;
                const h = img.naturalHeight;
                if (!w || !h) return;
                const canvas = document.createElement("canvas");
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext("2d");
                if (!ctx) return;
                ctx.drawImage(img, 0, 0, w, h);
                const imageData = ctx.getImageData(0, 0, w, h);
                const data = imageData.data;

                // Precompute mapping from swatch index -> cumulative stacked height contribution (including its own slice)
                // Build an array ordered by colorOrder positions for quick cumulative sums.
                const orderPositions = new Map<number, number>();
                colorOrder.forEach((fi, pos) => orderPositions.set(fi, pos));
                const cumulativePerOrderPos: number[] = [];
                let running = 0;
                colorOrder.forEach((fi, pos) => {
                    const sliceHeight = colorSliceHeights[fi] || 0;
                    running += sliceHeight;
                    cumulativePerOrderPos[pos] = running;
                });

                // Prepare attributes
                const positionAttr = geometry.getAttribute("position");
                const vertexCount = positionAttr.count;
                // We'll color vertices with top slice color (actual pixel color)
                const colors = new Float32Array(vertexCount * 3);

                // We'll replace z (since plane rotated later, original y is up after rotation) -> use positionAttr for displacement along its normal before rotation
                for (let vi = 0; vi < vertexCount; vi++) {
                    // Map vertex (u,v) to pixel coordinate (nearest neighbor)
                    const vx = positionAttr.getX(vi); // in [-0.5,0.5] after plane creation? Actually PlaneGeometry spans width and height centered at origin.
                    const vz = positionAttr.getY(vi); // PlaneGeometry Y is vertical in plane's local before rotation; after rotation becomes Z. We'll treat (x,y) as plane axes prior to rotation.
                    // Convert to UV in [0,1]
                    const u = vx + 0.5; // since plane spans [-0.5,0.5]
                    const v = vz + 0.5;
                    const px = Math.min(
                        w - 1,
                        Math.max(0, Math.round(u * (w - 1)))
                    );
                    const py = Math.min(
                        h - 1,
                        Math.max(0, Math.round((1 - v) * (h - 1)))
                    ); // flip v so image isn't upside down
                    const idx = (py * w + px) * 4;
                    const r = data[idx];
                    const g = data[idx + 1];
                    const b = data[idx + 2];
                    const a = data[idx + 3];
                    const opaque = a > 0; // treat partial as opaque
                    let height = 0;
                    if (opaque) height = baseSliceHeight;
                    // find swatch index if opaque
                    if (opaque && swatches.length) {
                        const swatchIndex = findSwatchIndex(r, g, b, swatches);
                        if (swatchIndex !== -1) {
                            const orderPos = orderPositions.get(swatchIndex);
                            if (orderPos !== undefined) {
                                height += cumulativePerOrderPos[orderPos] || 0;
                            }
                        }
                    }
                    // assign height to vertex Y component (since plane rotated later, using position.y for elevation after rotation.x)
                    positionAttr.setZ(vi, height); // Actually for PlaneGeometry attributes: (x,y,z) with y=0 initially; we'll use z for up after rotation? Simpler: adjust positionAttr.setZ.
                    // Assign color = pixel color (normalized)
                    colors[vi * 3 + 0] = r / 255;
                    colors[vi * 3 + 1] = g / 255;
                    colors[vi * 3 + 2] = b / 255;
                }
                positionAttr.needsUpdate = true;
                const colorAttr = new THREE.BufferAttribute(colors, 3);
                geometry.setAttribute("color", colorAttr);
                geometry.computeVertexNormals();
            } catch (err) {
                // ignore failures quietly
                if (console && console.warn)
                    console.warn("3D stacking build failed", err);
            }
        };

        applyHeightMap();

        // handle resize
        const resize = () => {
            if (!el) return;
            const w = el.clientWidth;
            const h = el.clientHeight;
            renderer.setSize(w, h);
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
        };

        const ro = new ResizeObserver(resize);
        ro.observe(el);

        // animation loop
        const animate = () => {
            controls.update();
            renderer.render(scene, camera);
            rafRef.current = requestAnimationFrame(animate);
        };
        rafRef.current = requestAnimationFrame(animate);

        // cleanup
        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            ro.disconnect();
            controls.dispose();
            geometry.dispose();
            material.dispose();
            renderer.dispose();
            if (renderer.domElement && renderer.domElement.parentNode)
                renderer.domElement.parentNode.removeChild(renderer.domElement);
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
