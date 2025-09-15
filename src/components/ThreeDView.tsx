import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/Addons.js";

interface ThreeDViewProps {
    imageSrc?: string | null;
}

export default function ThreeDView({ imageSrc }: ThreeDViewProps) {
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
        const geometry = new THREE.PlaneGeometry(1.0, 1.0, 256, 256);
        const material = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            metalness: 0.0,
            roughness: 0.8,
            displacementScale: 0.08,
            displacementBias: 0,
            side: THREE.DoubleSide,
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.x = -Math.PI / 2; // lay flat so Y is up
        scene.add(mesh);

        // load image as texture and use as displacement map + color map
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let texture: any = null;
        if (imageSrc) {
            const loader = new THREE.TextureLoader();
            // cross origin setting for remote images
            (loader as unknown as { crossOrigin: string }).crossOrigin = "";
            loader.load(
                imageSrc,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (tex: any) => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (tex as any).wrapS = (tex as any).wrapT = (
                        THREE as any
                    ).RepeatWrapping;
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (tex as any).minFilter = (THREE as any).LinearFilter;
                    // safe fallback for anisotropy
                    try {
                        (tex as any).anisotropy =
                            renderer.capabilities.getMaxAnisotropy();
                    } catch (err) {
                        if (typeof console !== "undefined" && console.warn)
                            console.warn("Failed to set anisotropy", err);
                    }
                    texture = tex;
                    // use texture as color map and displacement map approximation
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (material as any).map = tex;
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (material as any).displacementMap = tex;
                    material.needsUpdate = true;
                },
                undefined,
                () => {
                    /* ignore load errors */
                }
            );
        }

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
            if (texture) texture.dispose();
            renderer.dispose();
            if (renderer.domElement && renderer.domElement.parentNode)
                renderer.domElement.parentNode.removeChild(renderer.domElement);
        };
    }, [imageSrc]);

    return <div style={{ width: "100%", height: "100%" }} ref={mountRef} />;
}
