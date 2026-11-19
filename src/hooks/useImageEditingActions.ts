import { useRef, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { CanvasPreviewHandle } from '../components/CanvasPreview';
import { ADJUSTMENT_DEFAULTS } from '../lib/applyAdjustments';
import { decodeImage } from '../lib/decodeImage';
import { calculateImageResizeDimensions } from '../lib/imageResize';
import { useImageEditGuard } from './useImageEditGuard';
import type { useImageImport } from './useImageImport';
import type { useImageCanvas } from './useImageCanvas';
import type { useProcessingState } from './useProcessingState';
import type { useQuantize } from './useQuantize';

interface Params {
    imageSrc: string | null;
    imageCanvasLoading: boolean;
    canvasPreviewRef: RefObject<CanvasPreviewHandle | null>;
    inputRef: RefObject<HTMLInputElement | null>;
    importFile: ReturnType<typeof useImageImport>['importFile'];
    cancelPendingImport: () => void;
    prepareImageCanvas: ReturnType<typeof useImageCanvas>['prepareImageCanvas'];
    invalidate: () => void;
    setImage: (url: string, pushHistory: boolean) => void;
    clearCurrent: () => void;
    resetTouchUp: () => void;
    setAdjustments: (values: Record<string, number>) => void;
    resetAdjustmentsPanel: () => void;
    exitCrop: () => void;
    processing: ReturnType<typeof useProcessingState>;
    setProcessingStep: (step: {
        stepIndex: number;
        stepCount: number;
        label?: string;
        stepProgress?: number;
    }) => void;
    quantize: ReturnType<typeof useQuantize>['applyQuantize'];
}

/** Own the edit lifecycle without changing image history or the shared canvas cache. */
export function useImageEditingActions({
    imageSrc,
    imageCanvasLoading,
    canvasPreviewRef,
    inputRef,
    importFile,
    cancelPendingImport,
    prepareImageCanvas,
    invalidate,
    setImage,
    clearCurrent,
    resetTouchUp,
    setAdjustments,
    resetAdjustmentsPanel,
    exitCrop,
    processing,
    setProcessingStep,
    quantize,
}: Params) {
    const { t } = useTranslation('common');
    const processingActive = processing.isQuantizing || processing.isDedithering;
    const beginGuardedEdit = useImageEditGuard(imageSrc, processingActive);
    const beginSourceEdit = useImageEditGuard(imageSrc, false);
    // Synchronous ownership closes the gap before React renders the processing flag.
    const operation = useRef({ busy: false, generation: 0 });
    const beginEdit = () => {
        if (operation.current.busy) return null;
        const current = beginGuardedEdit();
        if (!current) return null;
        const generation = operation.current.generation;
        return () =>
            current() && !operation.current.busy && generation === operation.current.generation;
    };
    const beginProcessingEdit = () => {
        if (imageCanvasLoading || !beginEdit() || !imageSrc) return null;
        operation.current.busy = true;
        const generation = ++operation.current.generation;
        cancelPendingImport();
        const current = beginSourceEdit()!;
        // This operation owns the lock; setting its own processing flag must not cancel it.
        return () => current() && generation === operation.current.generation;
    };
    const endProcessingEdit = () => {
        operation.current.busy = false;
        operation.current.generation++;
    };
    const commit = (blob: Blob) => {
        const url = URL.createObjectURL(blob);
        invalidate();
        setImage(url, true);
        return url;
    };
    const handleFiles = async (file?: File) => {
        const current = beginEdit();
        if (!file || !current) return;
        await importFile(file, imageSrc !== null, (url, canvas, sourceFile) => {
            if (!current()) {
                URL.revokeObjectURL(url);
                return;
            }
            resetTouchUp();
            invalidate();
            prepareImageCanvas(url, canvas, sourceFile);
            setImage(url, true);
        });
    };
    const clearImage = () => {
        if (!beginEdit()) return;
        resetTouchUp();
        clearCurrent();
        if (inputRef.current) inputRef.current.value = '';
    };
    const resizeCurrentImage = async (percent: number) => {
        const current = beginEdit();
        if (!current || !canvasPreviewRef.current || !imageSrc) return;
        let sourceUrl: string | null = null;
        try {
            const sourceBlob = await canvasPreviewRef.current.exportImageBlob();
            if (!sourceBlob || !current()) return;
            sourceUrl = URL.createObjectURL(sourceBlob);
            const img = await decodeImage(sourceUrl);
            if (!img || !current()) return;
            const target = calculateImageResizeDimensions(
                img.naturalWidth,
                img.naturalHeight,
                percent
            );
            if (target.width >= img.naturalWidth && target.height >= img.naturalHeight) return;
            const canvas = document.createElement('canvas');
            canvas.width = target.width;
            canvas.height = target.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, target.width, target.height);
            const blob = await new Promise<Blob | null>((resolve) =>
                canvas.toBlob(resolve, 'image/png')
            );
            if (blob && current()) commit(blob);
        } catch (error) {
            if (current()) {
                console.warn('Image resize failed', error);
                alert(t('app.resizeFailed'));
            }
        } finally {
            if (sourceUrl) URL.revokeObjectURL(sourceUrl);
        }
    };
    const bakeAdjustments = async (values: Record<string, number>) => {
        const current = beginEdit();
        if (!current || !canvasPreviewRef.current) return;
        try {
            const blob = await canvasPreviewRef.current.exportAdjustedImageBlob?.(values);
            if (!blob || !current()) return;
            commit(blob);
            setAdjustments(ADJUSTMENT_DEFAULTS);
            resetAdjustmentsPanel();
        } catch (error) {
            if (current()) console.warn('Bake adjustments failed', error);
        }
    };
    const saveCrop = async () => {
        const current = beginEdit();
        if (!current || !canvasPreviewRef.current) return;
        const blob = await canvasPreviewRef.current.exportCroppedImage();
        if (!blob || !current()) return;
        commit(blob);
        exitCrop();
    };
    // CanvasPreview already binds asynchronous strokes to their source and tool session.
    const touchUpGeneration = operation.current.generation;
    const commitTouchUp = (blob: Blob) => {
        if (
            processingActive ||
            operation.current.busy ||
            touchUpGeneration !== operation.current.generation
        )
            return;
        return commit(blob);
    };
    const applyQuantize: Params['quantize'] = async (canvasRef, options) => {
        const current = beginProcessingEdit();
        if (!current) return;
        processing.setIsQuantizing(true);
        processing.setProcessingLabel('Quantizing...');
        setProcessingStep({
            stepIndex: 1,
            stepCount: 5,
            label: 'Loading image data',
            stepProgress: 0,
        });
        processing.setProcessingProgress(0);
        processing.setProcessingIndeterminate(false);
        try {
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
            if (current()) await quantize(canvasRef, options);
        } finally {
            endProcessingEdit();
            processing.setIsQuantizing(false);
            processing.setProcessingProgress(1);
            processing.setProcessingIndeterminate(false);
        }
    };
    const onDeditherWorkingChange = (working: boolean) => {
        processing.setIsDedithering(working);
        if (working) {
            processing.setProcessingLabel('Dedithering...');
            setProcessingStep({
                stepIndex: 1,
                stepCount: 1,
                label: 'Dedithering pass 1',
                stepProgress: 0,
            });
            processing.setProcessingProgress(0);
            processing.setProcessingIndeterminate(false);
        } else {
            endProcessingEdit();
        }
    };
    return {
        beginEdit,
        beginProcessingEdit,
        handleFiles,
        clearImage,
        resizeCurrentImage,
        bakeAdjustments,
        saveCrop,
        commitTouchUp,
        applyQuantize,
        onDeditherWorkingChange,
    };
}
