import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export function useThreeScene(
    mountRef: React.RefObject<HTMLDivElement | null>,
    setIsBuilding: (v: boolean) => void
) {
    const rafRef = useRef<number | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | THREE.OrthographicCamera | null>(null);
    const perspCameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const modelGroupRef = useRef<THREE.Group | null>(null);
    const materialRef = useRef<THREE.MeshStandardMaterial | null>(null);

    const requestRenderRef = useRef<(() => void) | null>(null);
    const switchCameraRef = useRef<((isOrtho: boolean) => void) | null>(null);

    useEffect(() => {
        const el = mountRef.current;
        if (!el) return;
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(el.clientWidth, el.clientHeight);
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.28;
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        el.appendChild(renderer.domElement);
        rendererRef.current = renderer;

        const scene = new THREE.Scene();
        // Set background based on current theme
        const isDarkMode = document.documentElement.classList.contains('dark');
        scene.background = new THREE.Color(isDarkMode ? 0x0b0c0d : 0xffffff);
        sceneRef.current = scene;

        const camera = new THREE.PerspectiveCamera(45, el.clientWidth / el.clientHeight, 0.1, 1000);
        camera.position.set(0, 0.9, 1.8);
        perspCameraRef.current = camera;
        cameraRef.current = camera;

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controlsRef.current = controls;

        // Balanced preview lights. Mesh geometry/export data is untouched; directional
        // fill keeps dark faces readable without bleaching saturated filament colors.
        const ambient = new THREE.AmbientLight(0xffffff, 0.18);
        scene.add(ambient);

        const hemiLight = new THREE.HemisphereLight(0xffffff, 0x657080, 0.85);
        scene.add(hemiLight);

        const key = new THREE.DirectionalLight(0xffffff, 1.55);
        key.position.set(2, 3, 2);
        scene.add(key);

        const fill = new THREE.DirectionalLight(0xe6efff, 0.75);
        fill.position.set(-3, 2.2, 2.5);
        scene.add(fill);

        const rim = new THREE.DirectionalLight(0xffffff, 0.25);
        rim.position.set(0, 3, -4);
        scene.add(rim);

        // Container for the model parts
        const modelGroup = new THREE.Group();
        scene.add(modelGroup);
        modelGroupRef.current = modelGroup;

        const material = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            side: THREE.FrontSide,
            metalness: 0,
            roughness: 0.7,
            flatShading: true,
        });
        materialRef.current = material;

        // (Optional) Add a placeholder if needed, or just leave empty group until build.
        // For backwards compat with "last mesh" hack:
        try {
            (window as unknown as { __KROMACUT_LAST_MESH?: THREE.Object3D }).__KROMACUT_LAST_MESH =
                modelGroup;
        } catch {
            /* no-op */
        }

        const requestRender = () => {
            if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return;
            if (controlsRef.current) controlsRef.current.update();
            rendererRef.current.render(sceneRef.current, cameraRef.current);
        };
        requestRenderRef.current = requestRender;

        const switchCamera = (isOrtho: boolean) => {
            const cam = cameraRef.current;
            const persp = perspCameraRef.current;
            const ctrl = controlsRef.current;
            if (!cam || !persp || !ctrl || !el) return;
            const aspect = el.clientWidth / el.clientHeight;

            if (isOrtho && cam instanceof THREE.PerspectiveCamera) {
                const target = ctrl.target.clone();
                const dist = cam.position.distanceTo(target);
                const fovRad = (cam.fov * Math.PI) / 180;
                const viewH = 2 * dist * Math.tan(fovRad / 2);
                const viewW = viewH * aspect;
                const ortho = new THREE.OrthographicCamera(
                    -viewW / 2, viewW / 2, viewH / 2, -viewH / 2, cam.near, cam.far
                );
                ortho.position.copy(cam.position);
                ortho.quaternion.copy(cam.quaternion);
                ortho.updateProjectionMatrix();
                cameraRef.current = ortho;
                ctrl.object = ortho as unknown as THREE.Camera;
            } else if (!isOrtho && cam instanceof THREE.OrthographicCamera) {
                persp.position.copy(cam.position);
                persp.quaternion.copy(cam.quaternion);
                persp.near = cam.near;
                persp.far = cam.far;
                persp.aspect = aspect;
                persp.updateProjectionMatrix();
                cameraRef.current = persp;
                ctrl.object = persp as unknown as THREE.Camera;
            }
            ctrl.update();
            requestRender();
        };
        switchCameraRef.current = switchCamera;

        const resize = () => {
            if (!el || !cameraRef.current || !rendererRef.current) return;
            const w = el.clientWidth;
            const h = el.clientHeight;
            rendererRef.current.setSize(w, h);
            const cam = cameraRef.current;
            if (cam instanceof THREE.PerspectiveCamera) {
                cam.aspect = w / h;
            } else if (cam instanceof THREE.OrthographicCamera) {
                const viewH = cam.top - cam.bottom;
                const viewW = viewH * (w / h);
                cam.left = -viewW / 2;
                cam.right = viewW / 2;
            }
            cam.updateProjectionMatrix();
            requestRender();
        };
        const ro = new ResizeObserver(resize);
        ro.observe(el);

        // Watch for theme changes
        const updateBackgroundForTheme = () => {
            const isDarkMode = document.documentElement.classList.contains('dark');
            if (sceneRef.current) {
                sceneRef.current.background = new THREE.Color(isDarkMode ? 0x0b0c0d : 0xffffff);
            }
            requestRender();
        };

        const themeObserver = new MutationObserver(() => {
            updateBackgroundForTheme();
        });
        themeObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['class'],
        });

        const animate = () => {
            if (controlsRef.current) controlsRef.current.update();
            if (cameraRef.current) renderer.render(scene, cameraRef.current);
            rafRef.current = requestAnimationFrame(animate);
        };
        rafRef.current = requestAnimationFrame(animate);

        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            ro.disconnect();
            themeObserver.disconnect();
            controls.dispose();
            material.dispose();
            renderer.dispose();
            if (renderer.domElement.parentNode)
                renderer.domElement.parentNode.removeChild(renderer.domElement);
            // clear refs
            rendererRef.current = null;
            sceneRef.current = null;
            cameraRef.current = null;
            perspCameraRef.current = null;
            controlsRef.current = null;
            modelGroupRef.current = null;
            materialRef.current = null;
            switchCameraRef.current = null;
            setIsBuilding(false);
        };
    }, [mountRef, setIsBuilding]);

    return {
        rendererRef,
        sceneRef,
        cameraRef,
        controlsRef,
        modelGroupRef,
        materialRef,
        requestRender: () => requestRenderRef.current?.(),
        switchCamera: (isOrtho: boolean) => switchCameraRef.current?.(isOrtho),
    } as const;
}

export default useThreeScene;
