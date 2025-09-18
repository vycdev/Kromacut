import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/Addons.js";

export function useThreeScene(
    mountRef: React.RefObject<HTMLDivElement | null>,
    setIsBuilding: (v: boolean) => void
) {
    const rafRef = useRef<number | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const meshRef = useRef<THREE.Mesh | null>(null);
    const materialRef = useRef<THREE.MeshStandardMaterial | null>(null);

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
        scene.add(mesh);
        meshRef.current = mesh;
        try {
            (window as unknown as { __STRATA_LAST_MESH?: THREE.Mesh }).__STRATA_LAST_MESH =
                mesh;
        } catch {
            /* no-op */
        }

        const resize = () => {
            if (!el || !cameraRef.current || !rendererRef.current) return;
            const w = el.clientWidth;
            const h = el.clientHeight;
            rendererRef.current.setSize(w, h);
            cameraRef.current!.aspect = w / h;
            cameraRef.current!.updateProjectionMatrix();
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
            // clear refs
            rendererRef.current = null;
            sceneRef.current = null;
            cameraRef.current = null;
            controlsRef.current = null;
            meshRef.current = null;
            materialRef.current = null;
            setIsBuilding(false);
        };
    }, [mountRef, setIsBuilding]);

    return {
        rendererRef,
        sceneRef,
        cameraRef,
        controlsRef,
        meshRef,
        materialRef,
    } as const;
}

export default useThreeScene;
