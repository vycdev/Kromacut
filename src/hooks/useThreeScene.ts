import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
    cameraKeepOutBounds,
    framePerspectiveCamera,
    keepCameraOutsideBounds,
    matchOrthographicToPerspective,
    orthographicFromPerspective,
    syncPerspectiveFromOrthographic,
} from '../lib/cameraProjection.ts';

export function useThreeScene(
    mountRef: React.RefObject<HTMLDivElement | null>,
    setIsBuilding: (v: boolean) => void,
    active = true
) {
    const rafRef = useRef<number | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | THREE.OrthographicCamera | null>(null);
    const perspCameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const modelGroupRef = useRef<THREE.Group | null>(null);
    const materialRef = useRef<THREE.MeshStandardMaterial | null>(null);
    // Model bounds plus a margin, set when a model is framed. The camera never enters them.
    const cameraBoundsRef = useRef<THREE.Box3 | null>(null);
    const [sceneReady, setSceneReady] = useState(false);
    const activeRef = useRef(active);
    activeRef.current = active;

    const requestRenderRef = useRef<(() => void) | null>(null);
    const switchCameraRef = useRef<((isOrtho: boolean) => void) | null>(null);
    const frameModelRef = useRef<((model: THREE.Box3) => void) | null>(null);
    const requestRender = useCallback(() => requestRenderRef.current?.(), []);
    const switchCamera = useCallback(
        (isOrtho: boolean) => switchCameraRef.current?.(isOrtho),
        []
    );
    const frameModel = useCallback((model: THREE.Box3) => frameModelRef.current?.(model), []);

    useEffect(() => {
        const el = mountRef.current;
        if (!el) return;
        let cancelled = false;
        let firstFrame: number | null = null;
        let secondFrame: number | null = null;
        let disposeScene: (() => void) | undefined;

        setSceneReady(false);
        firstFrame = window.requestAnimationFrame(() => {
            secondFrame = window.requestAnimationFrame(() => {
                if (cancelled) return;
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

        // Applies OrbitControls input, then pushes the camera back out if it moved into the model.
        const updateControls = () => {
            const ctrl = controlsRef.current;
            const cam = cameraRef.current;
            const persp = perspCameraRef.current;
            if (!ctrl || !cam || !persp) return;
            ctrl.update();
            const bounds = cameraBoundsRef.current;
            if (!bounds || modelGroup.children.length === 0) return;
            keepCameraOutsideBounds(cam, ctrl.target, bounds, persp.fov);
        };

        const requestRender = () => {
            if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return;
            updateControls();
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
                const ortho = orthographicFromPerspective(cam, ctrl.target, aspect);
                cameraRef.current = ortho;
                ctrl.object = ortho as unknown as THREE.Camera;
            } else if (!isOrtho && cam instanceof THREE.OrthographicCamera) {
                syncPerspectiveFromOrthographic(persp, cam, ctrl.target, aspect);
                cameraRef.current = persp;
                ctrl.object = persp as unknown as THREE.Camera;
            }
            updateControls();
            requestRender();
        };
        switchCameraRef.current = switchCamera;

        // Frames a newly built model in perspective terms. An active orthographic camera takes the
        // same framing, so rebuilding frames the model identically in both projections.
        const frameModel = (model: THREE.Box3) => {
            const cam = cameraRef.current;
            const persp = perspCameraRef.current;
            const ctrl = controlsRef.current;
            if (!cam || !persp || !ctrl || model.isEmpty()) return;

            framePerspectiveCamera(persp, model, ctrl.target);
            if (cam instanceof THREE.OrthographicCamera) {
                // Keep the aspect ratio the resize handler maintains for this camera.
                const aspect = (cam.right - cam.left) / (cam.top - cam.bottom);
                matchOrthographicToPerspective(cam, persp, ctrl.target, aspect);
            }
            cameraBoundsRef.current = cameraKeepOutBounds(model);
            updateControls();
        };
        frameModelRef.current = frameModel;

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
            if (activeRef.current) {
                updateControls();
                if (cameraRef.current) renderer.render(scene, cameraRef.current);
            }
            rafRef.current = requestAnimationFrame(animate);
        };
        rafRef.current = requestAnimationFrame(animate);
        setSceneReady(true);

        disposeScene = () => {
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
            frameModelRef.current = null;
            cameraBoundsRef.current = null;
            setIsBuilding(false);
            setSceneReady(false);
        };
            });
        });

        return () => {
            cancelled = true;
            if (firstFrame !== null) window.cancelAnimationFrame(firstFrame);
            if (secondFrame !== null) window.cancelAnimationFrame(secondFrame);
            disposeScene?.();
        };
    }, [mountRef, setIsBuilding]);

    return {
        rendererRef,
        sceneRef,
        cameraRef,
        controlsRef,
        modelGroupRef,
        materialRef,
        requestRender,
        switchCamera,
        frameModel,
        sceneReady,
    } as const;
}

export default useThreeScene;
