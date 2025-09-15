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

                // Build filled solid: add bottom surface and simple perimeter walls
                // (Interior holes not walled yet; transparent interior cavities will remain open.)
                const widthSegments = TARGET_RES;
                const heightSegments = TARGET_RES;
                const vertsPerRow = widthSegments + 1;
                const topVertexCount = vertexCount;
                const topPositions = new Float32Array(topVertexCount * 3);
                for (let i = 0; i < topVertexCount; i++) {
                    topPositions[i * 3 + 0] = positionAttr.getX(i);
                    topPositions[i * 3 + 1] = positionAttr.getY(i);
                    topPositions[i * 3 + 2] = positionAttr.getZ(i); // height in local (before rotation)
                }
                // Bottom positions (z=0 where top has >0; still 0 elsewhere). We keep same x,y.
                const bottomPositions = new Float32Array(topVertexCount * 3);
                for (let i = 0; i < topVertexCount; i++) {
                    bottomPositions[i * 3 + 0] = topPositions[i * 3 + 0];
                    bottomPositions[i * 3 + 1] = topPositions[i * 3 + 1];
                    bottomPositions[i * 3 + 2] = 0; // base plane
                }
                // Colors for bottom duplicate top colors
                const bottomColors = new Float32Array(topVertexCount * 3);
                bottomColors.set(colors);

                // Indices for top (reuse existing if present, else build)
                const topIndices: number[] = [];
                if (geometry.index) {
                    const arr = geometry.index.array as ArrayLike<number>;
                    for (let i = 0; i < arr.length; i++)
                        topIndices.push(arr[i]);
                } else {
                    for (let y = 0; y < heightSegments; y++) {
                        for (let x = 0; x < widthSegments; x++) {
                            const a = y * vertsPerRow + x;
                            const b = a + 1;
                            const c = a + vertsPerRow;
                            const d = c + 1;
                            // two triangles (a,c,b) (b,c,d) matching PlaneGeometry winding
                            topIndices.push(a, c, b, b, c, d);
                        }
                    }
                }

                const bottomOffset = topVertexCount;
                const indices: number[] = [];
                // Top surface indices
                indices.push(...topIndices);
                // Bottom surface: reverse winding for proper normals
                for (let i = topIndices.length - 1; i >= 0; i--) {
                    indices.push(bottomOffset + topIndices[i]);
                }

                // Helper to get height from topPositions (z component)
                const heightAt = (vx: number, vy: number) => {
                    const idx = vy * vertsPerRow + vx;
                    return topPositions[idx * 3 + 2];
                };

                // Add perimeter side walls (edges where y==0, y==heightSegments, x==0, x==widthSegments)
                const pushWall = (tA: number, tB: number) => {
                    const bA = tA + bottomOffset;
                    const bB = tB + bottomOffset;
                    // Two triangles (tA, bA, bB) (tA, bB, tB)
                    indices.push(tA, bA, bB, tA, bB, tB);
                };

                // y == 0 edge
                for (let x = 0; x < widthSegments; x++) {
                    const h1 = heightAt(x, 0);
                    const h2 = heightAt(x + 1, 0);
                    if (h1 > 0 || h2 > 0) {
                        const v1 = 0 * vertsPerRow + x;
                        const v2 = 0 * vertsPerRow + (x + 1);
                        pushWall(v1, v2);
                    }
                }
                // y == heightSegments edge
                for (let x = 0; x < widthSegments; x++) {
                    const h1 = heightAt(x, heightSegments);
                    const h2 = heightAt(x + 1, heightSegments);
                    if (h1 > 0 || h2 > 0) {
                        const v1 = heightSegments * vertsPerRow + x;
                        const v2 = heightSegments * vertsPerRow + (x + 1);
                        pushWall(v2, v1); // reverse order so normals face outward
                    }
                }
                // x == 0 edge
                for (let y = 0; y < heightSegments; y++) {
                    const h1 = heightAt(0, y);
                    const h2 = heightAt(0, y + 1);
                    if (h1 > 0 || h2 > 0) {
                        const v1 = y * vertsPerRow + 0;
                        const v2 = (y + 1) * vertsPerRow + 0;
                        pushWall(v2, v1); // oriented outward
                    }
                }
                // x == widthSegments edge
                for (let y = 0; y < heightSegments; y++) {
                    const h1 = heightAt(widthSegments, y);
                    const h2 = heightAt(widthSegments, y + 1);
                    if (h1 > 0 || h2 > 0) {
                        const v1 = y * vertsPerRow + widthSegments;
                        const v2 = (y + 1) * vertsPerRow + widthSegments;
                        pushWall(v1, v2); // outward
                    }
                }

                // Combine buffers
                const combinedPositions = new Float32Array(
                    (topVertexCount + topVertexCount) * 3
                );
                combinedPositions.set(topPositions, 0);
                combinedPositions.set(bottomPositions, topVertexCount * 3);
                const combinedColors = new Float32Array(
                    (topVertexCount + topVertexCount) * 3
                );
                combinedColors.set(colors, 0);
                combinedColors.set(bottomColors, topVertexCount * 3);

                geometry.setAttribute(
                    "position",
                    new THREE.BufferAttribute(combinedPositions, 3)
                );
                geometry.setAttribute(
                    "color",
                    new THREE.BufferAttribute(combinedColors, 3)
                );
                geometry.setIndex(indices);
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
