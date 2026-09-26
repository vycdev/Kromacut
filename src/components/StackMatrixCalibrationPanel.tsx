import { useTranslation } from 'react-i18next';
import { i18n, translate } from '@/lib/i18n';
import { translateRuntimeMessage } from '@/lib/runtimeMessages';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    AlertTriangle,
    Camera,
    Check,
    Crosshair,
    Download,
    Grid3X3,
    LoaderCircle,
    Move,
    Plus,
    RotateCcw,
    RotateCw,
    ScanSearch,
    Trash2,
    ZoomIn,
    ZoomOut,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { saveBlobToFile } from '@/hooks/saveBlobToFile';
import type { Filament } from '@/types';
import type { AutoPaintProfile } from '@/lib/profileManager';
import {
    applyStackMatrixPanelOwnerUpdate,
    createStackMatrixPanelOwnerStates,
    reconcileStackMatrixPanelOwnerStates,
    stackMatrixPanelOwnerState,
    type StackMatrixPanelOwnerState,
    type StackMatrixPanelOwnerStates,
} from '@/lib/stackMatrixPanelState';
import {
    fingerprintAppearanceFilaments,
    MAX_STACK_MATRIX_RECIPE_LAYERS,
    type StackMatrixCalibrationV1,
} from '@/lib/appearanceProfile';
import {
    completeStackMatrixCalibration,
    lightestStackMatrixFilamentId,
    sampleStackMatrixPhoto,
    STACK_MATRIX_GAP_MM,
    STACK_MATRIX_PATCH_SIZE_MM,
    stackMatrixPhysicalSize,
    type MatrixPhotoPoint,
} from '@/lib/stackMatrixCalibration';
import {
    approachStackMatrixCornerMove,
    constrainStackMatrixCornerMove,
    estimateStackMatrixMarkerCenters,
    rectifyStackMatrixPhoto,
    rotateStackMatrixPhotoPixels,
    stackMatrixOuterCorners,
    stackMatrixTemplateLines,
    type MatrixCornerEstimate,
} from '@/lib/stackMatrixPhotoAlignment';
import type {
    StackMatrixWorkerCompleteResponse,
    StackMatrixWorkerJob,
    StackMatrixWorkerRequest,
    StackMatrixWorkerResponse,
} from '@/workers/stackMatrix.worker';

interface StackMatrixCalibrationPanelProps {
    filaments: Filament[];
    layerHeight: number;
    firstLayerHeight: number;
    profile?: AutoPaintProfile;
    profileDirty?: boolean;
    onUpsert?: (record: StackMatrixCalibrationV1) => void;
    onDelete?: (matrixId: string) => void;
}

interface LoadedPhoto {
    sourceCanvas: HTMLCanvasElement;
    pixels: Uint8ClampedArray;
    width: number;
    height: number;
    fileName: string;
    profileId: string | null;
    recordId: string;
}

interface PhotoLoupeState {
    point: MatrixPhotoPoint;
    left: number;
    top: number;
    sourceRadius: number;
}

interface PendingCornerDrag {
    cornerIndex: number;
    point: MatrixPhotoPoint;
    localX: number;
    localY: number;
    bounds: DOMRect;
}

interface PhotoViewportSize {
    width: number;
    height: number;
}

interface PendingMatrixGeneration {
    worker: Worker;
    reject: (reason: Error) => void;
}

const SAMPLE_CHOICES = [64, 144, 256, 400, 625, 1024, 1296, 1600, 2025];
const POINT_LABEL_KEYS = [
    'matrix.topLeft',
    'matrix.topRight',
    'matrix.bottomRight',
    'matrix.bottomLeft',
];
const CORNER_MARKER_LAYOUT = [
    { cornerIndex: 0, number: 1, labelKey: 'matrix.topLeft', rightAligned: false },
    { cornerIndex: 1, number: 2, labelKey: 'matrix.topRight', rightAligned: true },
    { cornerIndex: 3, number: 4, labelKey: 'matrix.bottomLeft', rightAligned: false },
    { cornerIndex: 2, number: 3, labelKey: 'matrix.bottomRight', rightAligned: true },
] as const;
let nextMatrixWorkerRequestId = 1;

function isImageFile(file: Pick<File, 'name' | 'type'>): boolean {
    return (
        file.type.startsWith('image/') ||
        (!file.type && /\.(avif|bmp|gif|heic|heif|jpe?g|png|webp)$/i.test(file.name))
    );
}

function filamentLabel(filament: Filament): string {
    return filament.name || filament.brand || filament.color;
}

function formatMatrixThickness(thickness: number): string {
    return thickness.toLocaleString(i18n.resolvedLanguage, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 6,
    });
}

function swatchLuminance(hex: string): number {
    const value = hex.replace(/^#/, '');
    const channels = [0, 2, 4].map((offset) =>
        Number.parseInt(value.slice(offset, offset + 2), 16)
    );
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function stacksEqual(left: readonly number[], right: readonly number[]): boolean {
    return left.length === right.length && left.every((value, index) => value === right[index]);
}

function cornerMarkerColor(record: StackMatrixCalibrationV1, cornerIndex: number): string {
    const stack = record.cornerStacks[cornerIndex] ?? [];
    const sample = record.samples.find((candidate) => stacksEqual(candidate.stack, stack));
    const visibleFilamentIndex = stack.at(-1);
    return (
        sample?.predictedColor.hex ??
        (visibleFilamentIndex === undefined
            ? undefined
            : record.filaments[visibleFilamentIndex]?.color) ??
        '#808080'
    );
}

function recordLabel(record: StackMatrixCalibrationV1): string {
    const date = new Date(record.createdAt).toLocaleString(i18n.resolvedLanguage, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
    return translate('calibration:matrix.recordLabel', {
        count: record.samples.length,
        date,
        status: translate(
            record.status === 'complete'
                ? 'calibration:matrix.calibrated'
                : 'calibration:matrix.awaitingPhoto'
        ),
    });
}

function copyPoints(points: readonly MatrixPhotoPoint[]): MatrixPhotoPoint[] {
    return points.map((point) => ({ ...point }));
}

function drawTemplateSegments(
    context: CanvasRenderingContext2D,
    lines: ReturnType<typeof stackMatrixTemplateLines>,
    lineScale: number,
    mapPoint: (point: MatrixPhotoPoint) => MatrixPhotoPoint = (point) => point
) {
    const drawGroup = (outer: boolean) => {
        context.beginPath();
        for (const line of lines) {
            if (line.outer !== outer) continue;
            const start = mapPoint(line.start);
            const end = mapPoint(line.end);
            context.moveTo(start.x, start.y);
            context.lineTo(end.x, end.y);
        }
        context.strokeStyle = 'rgba(0, 0, 0, 0.72)';
        context.lineWidth = (outer ? 3.5 : 2) * lineScale;
        context.stroke();
        context.strokeStyle = outer ? 'rgba(10, 132, 255, 0.95)' : 'rgba(255, 255, 255, 0.64)';
        context.lineWidth = (outer ? 2 : 0.75) * lineScale;
        context.stroke();
    };
    drawGroup(false);
    drawGroup(true);
}

function clipToPolygon(context: CanvasRenderingContext2D, points: readonly MatrixPhotoPoint[]) {
    if (points.length !== 4) return;
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index++) {
        context.lineTo(points[index].x, points[index].y);
    }
    context.closePath();
    context.clip();
}

export default function StackMatrixCalibrationPanel({
    filaments,
    layerHeight,
    firstLayerHeight,
    profile,
    profileDirty,
    onUpsert,
    onDelete,
}: StackMatrixCalibrationPanelProps) {
    const { t } = useTranslation('calibration');
    const records = useMemo(
        () => profile?.appearance?.stackMatrices ?? [],
        [profile?.appearance?.stackMatrices]
    );
    const profileId = profile?.id ?? null;
    const [storedOwnerStates, setStoredOwnerStates] = useState<StackMatrixPanelOwnerStates>(() =>
        createStackMatrixPanelOwnerStates(profileId, records)
    );
    const ownerState = useMemo(
        () => stackMatrixPanelOwnerState(storedOwnerStates, profileId, records),
        [profileId, records, storedOwnerStates]
    );
    const { localRecord, activeRecordId, creatingNew } = ownerState;
    const [selectedIds, setSelectedIds] = useState<Set<string>>(
        () => new Set(filaments.slice(0, 8).map((filament) => filament.id))
    );
    const [maximumRecipeThicknessDraft, setMaximumRecipeThicknessDraft] = useState(() =>
        String(Math.min(0.8, layerHeight * MAX_STACK_MATRIX_RECIPE_LAYERS))
    );
    const [maximumSwapCycles, setMaximumSwapCycles] = useState<number | undefined>(160);
    const [maximumSamples, setMaximumSamples] = useState(256);
    const [backingId, setBackingId] = useState(() =>
        lightestStackMatrixFilamentId(filaments.slice(0, 8))
    );
    const [busy, setBusy] = useState(false);
    const [generationPhase, setGenerationPhase] = useState<
        'planning' | 'exporting' | 'saving' | null
    >(null);
    const [error, setError] = useState<string | null>(null);
    const [photo, setPhoto] = useState<LoadedPhoto | null>(null);
    const [photoZoom, setPhotoZoom] = useState(1);
    const [photoViewportSize, setPhotoViewportSize] = useState<PhotoViewportSize>({
        width: 0,
        height: 0,
    });
    const [photoDragActive, setPhotoDragActive] = useState(false);
    const [corners, setCorners] = useState<MatrixPhotoPoint[]>([]);
    const [cornerEstimate, setCornerEstimate] = useState<MatrixCornerEstimate | null>(null);
    const [alignmentAdjusted, setAlignmentAdjusted] = useState(false);
    const [alignmentConfirmed, setAlignmentConfirmed] = useState(false);
    const [draggingCorner, setDraggingCorner] = useState<number | null>(null);
    const [selectedCorner, setSelectedCorner] = useState<number | null>(null);
    const [showTemplate, setShowTemplate] = useState(true);
    const [photoLoupe, setPhotoLoupe] = useState<PhotoLoupeState | null>(null);
    const [referenceCorrection, setReferenceCorrection] = useState(false);
    const [measuredColors, setMeasuredColors] = useState<Array<[number, number, number]>>([]);
    const photoCanvasRef = useRef<HTMLCanvasElement>(null);
    const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
    const loupeCanvasRef = useRef<HTMLCanvasElement>(null);
    const loupeContainerRef = useRef<HTMLDivElement>(null);
    const rectifiedCanvasRef = useRef<HTMLCanvasElement>(null);
    const lutPreviewCanvasRef = useRef<HTMLCanvasElement>(null);
    const photoViewportRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const initialCornersRef = useRef<MatrixPhotoPoint[]>([]);
    const liveCornersRef = useRef<MatrixPhotoPoint[]>([]);
    const photoDragDepthRef = useRef(0);
    const draggingCornerRef = useRef<number | null>(null);
    const pendingCornerDragRef = useRef<PendingCornerDrag | null>(null);
    const cornerDragFrameRef = useRef<number | null>(null);
    const generationWorkerRef = useRef<PendingMatrixGeneration | null>(null);
    const generationRequestRef = useRef(0);
    const panelMountedRef = useRef(true);
    const photoLoadGenerationRef = useRef(0);
    const recordsRef = useRef(records);
    const previousProfileIdRef = useRef(profileId);
    recordsRef.current = records;
    const activePhotoOwnerRef = useRef({
        profileId,
        recordId: activeRecordId,
    });
    activePhotoOwnerRef.current = {
        profileId,
        recordId: activeRecordId,
    };

    const updateOwnerState = useCallback(
        (
            expectedProfileId: string | null,
            update: (current: StackMatrixPanelOwnerState) => StackMatrixPanelOwnerState
        ) => {
            setStoredOwnerStates((current) =>
                applyStackMatrixPanelOwnerUpdate(
                    current,
                    expectedProfileId,
                    activePhotoOwnerRef.current.profileId,
                    recordsRef.current,
                    update
                )
            );
        },
        []
    );

    const cancelGenerationWorker = useCallback((message: string) => {
        const pending = generationWorkerRef.current;
        if (!pending) return;
        generationWorkerRef.current = null;
        pending.worker.terminate();
        pending.reject(new Error(message));
    }, []);

    const runGenerationWorker = useCallback(
        (job: StackMatrixWorkerJob): Promise<StackMatrixWorkerCompleteResponse> => {
            cancelGenerationWorker('Stack Matrix generation was replaced');
            const id = nextMatrixWorkerRequestId++;
            return new Promise((resolve, reject) => {
                const worker = new Worker(
                    new URL('../workers/stackMatrix.worker.ts', import.meta.url),
                    { type: 'module' }
                );
                generationWorkerRef.current = { worker, reject };
                const finish = () => {
                    worker.terminate();
                    if (generationWorkerRef.current?.worker === worker) {
                        generationWorkerRef.current = null;
                    }
                };
                worker.onmessage = (event: MessageEvent<StackMatrixWorkerResponse>) => {
                    const response = event.data;
                    if (response.id !== id) return;
                    if (response.type === 'phase') {
                        setGenerationPhase(response.phase);
                        return;
                    }
                    finish();
                    if (response.type === 'error') {
                        reject(new Error(response.error));
                    } else {
                        resolve(response);
                    }
                };
                worker.onerror = (event) => {
                    finish();
                    reject(new Error(event.message || 'Stack Matrix worker failed'));
                };
                worker.onmessageerror = () => {
                    finish();
                    reject(new Error('Stack Matrix worker returned an unreadable result'));
                };
                worker.postMessage({ id, ...job } as StackMatrixWorkerRequest);
            });
        },
        [cancelGenerationWorker]
    );

    useEffect(() => {
        panelMountedRef.current = true;
        return () => {
            panelMountedRef.current = false;
            generationRequestRef.current += 1;
            photoLoadGenerationRef.current += 1;
            cancelGenerationWorker('Stack Matrix generation was cancelled');
            if (cornerDragFrameRef.current !== null) {
                cancelAnimationFrame(cornerDragFrameRef.current);
            }
        };
    }, [cancelGenerationWorker]);

    useEffect(() => {
        setStoredOwnerStates((current) =>
            reconcileStackMatrixPanelOwnerStates(current, profileId, records)
        );
    }, [profileId, records]);

    useEffect(() => {
        if (previousProfileIdRef.current === profileId) return;
        previousProfileIdRef.current = profileId;
        generationRequestRef.current += 1;
        cancelGenerationWorker('Stack Matrix generation was cancelled after changing profiles');
        setBusy(false);
        setGenerationPhase(null);
        setError(null);
        setSelectedIds(new Set(filaments.slice(0, 8).map((filament) => filament.id)));
        setBackingId(lightestStackMatrixFilamentId(filaments.slice(0, 8)));
    }, [cancelGenerationWorker, filaments, profileId]);

    useEffect(() => {
        photoLoadGenerationRef.current += 1;
        setPhoto(null);
        setPhotoZoom(1);
        setCorners([]);
        setCornerEstimate(null);
        setAlignmentAdjusted(false);
        setAlignmentConfirmed(false);
        setDraggingCorner(null);
        setSelectedCorner(null);
        setPhotoLoupe(null);
        setMeasuredColors([]);
        initialCornersRef.current = [];
        liveCornersRef.current = [];
        draggingCornerRef.current = null;
        pendingCornerDragRef.current = null;
        if (cornerDragFrameRef.current !== null) {
            cancelAnimationFrame(cornerDragFrameRef.current);
            cornerDragFrameRef.current = null;
        }
    }, [activeRecordId, profileId]);

    const activeRecord = useMemo(() => {
        if (localRecord?.id === activeRecordId) return localRecord;
        return records.find((record) => record.id === activeRecordId) ?? null;
    }, [activeRecordId, localRecord, records]);
    const alignmentAutoAccepted = Boolean(
        cornerEstimate &&
        !alignmentAdjusted &&
        cornerEstimate.method === 'detected' &&
        cornerEstimate.confidence >= 0.55
    );
    const alignmentReady = alignmentAutoAccepted || alignmentConfirmed;
    const selectedFilaments = useMemo(
        () => filaments.filter((filament) => selectedIds.has(filament.id)).slice(0, 8),
        [filaments, selectedIds]
    );
    useEffect(() => {
        if (!selectedFilaments.some((filament) => filament.id === backingId)) {
            setBackingId(lightestStackMatrixFilamentId(selectedFilaments));
        }
    }, [backingId, selectedFilaments]);
    const backingFilament = selectedFilaments.find((filament) => filament.id === backingId);
    const maximumRecipeThickness = Number(maximumRecipeThicknessDraft);
    const stackLayerCount = Math.floor(maximumRecipeThickness / layerHeight + 1e-7);
    const plannedFoundationHeight = Math.max(0.001, layerHeight, firstLayerHeight);
    const plannedColorRegionHeight = stackLayerCount * layerHeight;
    const thicknessValid =
        maximumRecipeThicknessDraft.trim() !== '' &&
        Number.isFinite(maximumRecipeThickness) &&
        stackLayerCount >= 1 &&
        stackLayerCount <= MAX_STACK_MATRIX_RECIPE_LAYERS &&
        maximumRecipeThickness <= layerHeight * MAX_STACK_MATRIX_RECIPE_LAYERS + 1e-7;
    const combinationCount = selectedFilaments.length ** stackLayerCount;
    const estimatedSamples = thicknessValid ? Math.min(combinationCount, maximumSamples) : 0;
    const estimatedColumns = Math.ceil(Math.sqrt(estimatedSamples));
    const estimatedRows = Math.ceil(estimatedSamples / Math.max(1, estimatedColumns));
    const estimatedWidth =
        (estimatedColumns + 2) * STACK_MATRIX_PATCH_SIZE_MM +
        (estimatedColumns + 1) * STACK_MATRIX_GAP_MM;
    const estimatedHeight =
        (estimatedRows + 2) * STACK_MATRIX_PATCH_SIZE_MM +
        (estimatedRows + 1) * STACK_MATRIX_GAP_MM;
    const canCreate = Boolean(
        profile &&
        !profileDirty &&
        onUpsert &&
        selectedFilaments.length >= 2 &&
        thicknessValid &&
        backingFilament
    );
    const toggleFilament = (filamentId: string) => {
        setSelectedIds((current) => {
            const next = new Set(current);
            if (next.has(filamentId)) {
                if (next.size > 2) {
                    next.delete(filamentId);
                }
            } else if (next.size < 8) {
                next.add(filamentId);
            }
            return next;
        });
    };

    const handleCreateAndDownload = useCallback(async () => {
        if (!canCreate) return;
        const requestProfileId = profileId;
        const requestGeneration = ++generationRequestRef.current;
        setBusy(true);
        setGenerationPhase('planning');
        setError(null);
        try {
            const { record: exported, blob } = await runGenerationWorker({
                type: 'create',
                filaments: selectedFilaments,
                options: {
                    layerHeight,
                    firstLayerHeight,
                    maximumRecipeThickness,
                    maximumSwapCycles,
                    previousMatrices: records,
                    maximumSamples,
                    backingFilamentId: backingId,
                    ownerProfileFingerprint: profile
                        ? fingerprintAppearanceFilaments(profile.filaments)
                        : undefined,
                },
            });
            if (
                !panelMountedRef.current ||
                generationRequestRef.current !== requestGeneration ||
                activePhotoOwnerRef.current.profileId !== requestProfileId
            )
                return;
            setGenerationPhase('saving');
            const savedPath = await saveBlobToFile(blob, {
                defaultFileName: `kromacut-stack-matrix-${exported.samples.length}.3mf`,
                extension: '3mf',
                filterName: translate('calibration:matrix.saveDialogFormat'),
            });
            if (
                savedPath === null ||
                !panelMountedRef.current ||
                generationRequestRef.current !== requestGeneration ||
                activePhotoOwnerRef.current.profileId !== requestProfileId
            )
                return;
            let persistenceWarning: string | null = null;
            try {
                onUpsert?.(exported);
            } catch (caught) {
                persistenceWarning = `3MF saved, but its plan is only available in this session: ${caught instanceof Error ? caught.message : 'profile storage failed'}`;
            }
            updateOwnerState(requestProfileId, (current) => ({
                ...current,
                localRecord: exported,
                activeRecordId: exported.id,
                creatingNew: false,
            }));
            setPhoto(null);
            setPhotoZoom(1);
            setCorners([]);
            setCornerEstimate(null);
            setAlignmentAdjusted(false);
            setAlignmentConfirmed(false);
            setMeasuredColors([]);
            setError(persistenceWarning);
        } catch (caught) {
            if (
                !panelMountedRef.current ||
                generationRequestRef.current !== requestGeneration ||
                activePhotoOwnerRef.current.profileId !== requestProfileId
            )
                return;
            setError(caught instanceof Error ? caught.message : 'Could not create Stack Matrix');
        } finally {
            if (
                panelMountedRef.current &&
                generationRequestRef.current === requestGeneration &&
                activePhotoOwnerRef.current.profileId === requestProfileId
            ) {
                setBusy(false);
                setGenerationPhase(null);
            }
        }
    }, [
        backingId,
        canCreate,
        firstLayerHeight,
        layerHeight,
        maximumSamples,
        maximumRecipeThickness,
        maximumSwapCycles,
        onUpsert,
        profile,
        profileId,
        records,
        runGenerationWorker,
        selectedFilaments,
        updateOwnerState,
    ]);

    const handleDownloadAgain = useCallback(async () => {
        if (!activeRecord) return;
        const requestProfileId = profileId;
        const requestGeneration = ++generationRequestRef.current;
        setBusy(true);
        setGenerationPhase('exporting');
        setError(null);
        try {
            const { record: exported, blob } = await runGenerationWorker({
                type: 'export',
                record: activeRecord,
            });
            if (
                !panelMountedRef.current ||
                generationRequestRef.current !== requestGeneration ||
                activePhotoOwnerRef.current.profileId !== requestProfileId
            )
                return;
            setGenerationPhase('saving');
            const savedPath = await saveBlobToFile(blob, {
                defaultFileName: `kromacut-stack-matrix-${exported.samples.length}.3mf`,
                extension: '3mf',
                filterName: translate('calibration:matrix.saveDialogFormat'),
            });
            if (
                savedPath === null ||
                !panelMountedRef.current ||
                generationRequestRef.current !== requestGeneration ||
                activePhotoOwnerRef.current.profileId !== requestProfileId
            )
                return;
            let persistenceWarning: string | null = null;
            try {
                onUpsert?.(exported);
            } catch (caught) {
                persistenceWarning = `3MF saved, but its refreshed export metadata was not saved: ${caught instanceof Error ? caught.message : 'profile storage failed'}`;
            }
            updateOwnerState(requestProfileId, (current) => ({
                ...current,
                localRecord: exported,
            }));
            setError(persistenceWarning);
        } catch (caught) {
            if (
                !panelMountedRef.current ||
                generationRequestRef.current !== requestGeneration ||
                activePhotoOwnerRef.current.profileId !== requestProfileId
            )
                return;
            setError(caught instanceof Error ? caught.message : 'Could not export Stack Matrix');
        } finally {
            if (
                panelMountedRef.current &&
                generationRequestRef.current === requestGeneration &&
                activePhotoOwnerRef.current.profileId === requestProfileId
            ) {
                setBusy(false);
                setGenerationPhase(null);
            }
        }
    }, [activeRecord, onUpsert, profileId, runGenerationWorker, updateOwnerState]);

    const detectPhotoAlignment = useCallback(
        (loadedPhoto: LoadedPhoto) => {
            if (!activeRecord) return;
            const estimate = estimateStackMatrixMarkerCenters(
                loadedPhoto.pixels,
                loadedPhoto.width,
                loadedPhoto.height,
                activeRecord.grid.rows,
                activeRecord.grid.columns
            );
            const nextCorners = copyPoints(estimate.corners);
            initialCornersRef.current = copyPoints(nextCorners);
            liveCornersRef.current = copyPoints(nextCorners);
            setCorners(nextCorners);
            setCornerEstimate(estimate);
            setAlignmentAdjusted(false);
            setAlignmentConfirmed(estimate.method === 'detected' && estimate.confidence >= 0.55);
            setDraggingCorner(null);
            setSelectedCorner(null);
            setPhotoLoupe(null);
            draggingCornerRef.current = null;
            pendingCornerDragRef.current = null;
            if (cornerDragFrameRef.current !== null) {
                cancelAnimationFrame(cornerDragFrameRef.current);
                cornerDragFrameRef.current = null;
            }
        },
        [activeRecord]
    );

    const handlePhotoFile = useCallback(
        (file: File | undefined) => {
            if (!file || !activeRecord) return;
            if (!isImageFile(file)) {
                setError('Drop an image file for the Stack Matrix photo');
                return;
            }
            const loadGeneration = ++photoLoadGenerationRef.current;
            const photoProfileId = profileId;
            const recordId = activeRecord.id;
            const url = URL.createObjectURL(file);
            const image = new Image();
            image.onload = () => {
                const activeOwner = activePhotoOwnerRef.current;
                if (
                    loadGeneration !== photoLoadGenerationRef.current ||
                    activeOwner.profileId !== photoProfileId ||
                    activeOwner.recordId !== recordId
                ) {
                    URL.revokeObjectURL(url);
                    return;
                }
                const scale = Math.min(1, 1200 / Math.max(image.naturalWidth, image.naturalHeight));
                const width = Math.max(1, Math.round(image.naturalWidth * scale));
                const height = Math.max(1, Math.round(image.naturalHeight * scale));
                const scratch = document.createElement('canvas');
                scratch.width = width;
                scratch.height = height;
                const context = scratch.getContext('2d', { willReadFrequently: true });
                if (!context) {
                    setError('This browser could not read the Stack Matrix photo');
                    URL.revokeObjectURL(url);
                    return;
                }
                context.drawImage(image, 0, 0, width, height);
                const pixels = context.getImageData(0, 0, width, height).data;
                const loadedPhoto = {
                    sourceCanvas: scratch,
                    pixels: new Uint8ClampedArray(pixels),
                    width,
                    height,
                    fileName: file.name,
                    profileId: photoProfileId,
                    recordId,
                };
                setPhoto(loadedPhoto);
                setPhotoZoom(1);
                detectPhotoAlignment(loadedPhoto);
                setMeasuredColors([]);
                setError(null);
                URL.revokeObjectURL(url);
            };
            image.onerror = () => {
                const activeOwner = activePhotoOwnerRef.current;
                if (
                    loadGeneration === photoLoadGenerationRef.current &&
                    activeOwner.profileId === photoProfileId &&
                    activeOwner.recordId === recordId
                ) {
                    setError('Could not open that photo');
                }
                URL.revokeObjectURL(url);
            };
            image.src = url;
        },
        [activeRecord, detectPhotoAlignment, profileId]
    );

    const handleRotatePhoto = useCallback(
        (direction: 'clockwise' | 'counterclockwise') => {
            if (!photo) return;
            const rotated = rotateStackMatrixPhotoPixels(
                photo.pixels,
                photo.width,
                photo.height,
                direction
            );
            const scratch = document.createElement('canvas');
            scratch.width = rotated.width;
            scratch.height = rotated.height;
            const context = scratch.getContext('2d', { willReadFrequently: true });
            if (!context) {
                setError('This browser could not rotate the Stack Matrix photo');
                return;
            }
            context.putImageData(
                new ImageData(rotated.pixels, rotated.width, rotated.height),
                0,
                0
            );
            const rotatedPhoto: LoadedPhoto = {
                ...photo,
                ...rotated,
                sourceCanvas: scratch,
            };
            setPhoto(rotatedPhoto);
            setPhotoZoom(1);
            detectPhotoAlignment(rotatedPhoto);
            setMeasuredColors([]);
            setError(null);
        },
        [detectPhotoAlignment, photo]
    );

    const handlePhotoDragEnter = (event: React.DragEvent<HTMLElement>) => {
        event.preventDefault();
        event.stopPropagation();
        photoDragDepthRef.current += 1;
        if (event.dataTransfer.types.includes('Files')) setPhotoDragActive(true);
    };

    const handlePhotoDragOver = (event: React.DragEvent<HTMLElement>) => {
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = 'copy';
    };

    const handlePhotoDragLeave = (event: React.DragEvent<HTMLElement>) => {
        event.preventDefault();
        event.stopPropagation();
        photoDragDepthRef.current = Math.max(0, photoDragDepthRef.current - 1);
        if (photoDragDepthRef.current === 0) setPhotoDragActive(false);
    };

    const handlePhotoDrop = (event: React.DragEvent<HTMLElement>) => {
        event.preventDefault();
        event.stopPropagation();
        photoDragDepthRef.current = 0;
        setPhotoDragActive(false);
        const file = Array.from(event.dataTransfer.files).find(isImageFile);
        if (!file) {
            setError('Drop an image file for the Stack Matrix photo');
            return;
        }
        handlePhotoFile(file);
    };

    const drawPhotoOverlay = useCallback(
        (points: readonly MatrixPhotoPoint[], activeCorner: number | null) => {
            const canvas = overlayCanvasRef.current;
            if (!canvas || !photo) return;
            if (canvas.width !== photo.width) canvas.width = photo.width;
            if (canvas.height !== photo.height) canvas.height = photo.height;
            const context = canvas.getContext('2d');
            if (!context) return;
            context.clearRect(0, 0, canvas.width, canvas.height);
            const displayScale = photo.width / Math.max(1, canvas.getBoundingClientRect().width);
            if (showTemplate && activeRecord && points.length === 4) {
                try {
                    const lines = stackMatrixTemplateLines(
                        points,
                        activeRecord.grid.rows,
                        activeRecord.grid.columns
                    );
                    const outer = stackMatrixOuterCorners(
                        points,
                        activeRecord.grid.rows,
                        activeRecord.grid.columns
                    );
                    context.save();
                    clipToPolygon(context, outer);
                    drawTemplateSegments(context, lines, displayScale);
                    context.restore();
                } catch {
                    // A constrained drag keeps the previous valid layout until geometry recovers.
                }
            }
            points.forEach((point, index) => {
                context.beginPath();
                context.arc(
                    point.x,
                    point.y,
                    (index === activeCorner ? 14 : 11) * displayScale,
                    0,
                    Math.PI * 2
                );
                context.fillStyle = index === activeCorner ? '#ffffff' : '#0a84ff';
                context.fill();
                context.lineWidth = 3 * displayScale;
                context.strokeStyle = index === activeCorner ? '#0a84ff' : '#ffffff';
                context.stroke();
                context.fillStyle = index === activeCorner ? '#0a84ff' : '#ffffff';
                context.font = `bold ${12 * displayScale}px sans-serif`;
                context.textAlign = 'center';
                context.textBaseline = 'middle';
                context.fillText(String(index + 1), point.x, point.y);
            });
        },
        [activeRecord, photo, showTemplate]
    );

    const drawPhotoLoupe = useCallback(
        (loupe: PhotoLoupeState, points: readonly MatrixPhotoPoint[]) => {
            const canvas = loupeCanvasRef.current;
            if (!canvas || !photo) return;
            const size = 176;
            if (canvas.width !== size) canvas.width = size;
            if (canvas.height !== size) canvas.height = size;
            const context = canvas.getContext('2d');
            if (!context) return;
            context.clearRect(0, 0, size, size);
            context.fillStyle = '#000000';
            context.fillRect(0, 0, size, size);
            const radius = loupe.sourceRadius;
            context.drawImage(
                photo.sourceCanvas,
                loupe.point.x - radius,
                loupe.point.y - radius,
                radius * 2,
                radius * 2,
                0,
                0,
                size,
                size
            );
            if (showTemplate && activeRecord && points.length === 4) {
                try {
                    const lines = stackMatrixTemplateLines(
                        points,
                        activeRecord.grid.rows,
                        activeRecord.grid.columns
                    );
                    const outer = stackMatrixOuterCorners(
                        points,
                        activeRecord.grid.rows,
                        activeRecord.grid.columns
                    );
                    const loupeScale = size / (radius * 2);
                    const mapPoint = (point: MatrixPhotoPoint) => ({
                        x: (point.x - loupe.point.x) * loupeScale + size / 2,
                        y: (point.y - loupe.point.y) * loupeScale + size / 2,
                    });
                    context.save();
                    clipToPolygon(context, outer.map(mapPoint));
                    drawTemplateSegments(context, lines, 1, mapPoint);
                    context.restore();
                } catch {
                    // Keep the magnified photo useful even if template geometry is unavailable.
                }
            }
            context.strokeStyle = 'rgba(255,255,255,0.95)';
            context.lineWidth = 1;
            context.beginPath();
            context.moveTo(size / 2, 12);
            context.lineTo(size / 2, size - 12);
            context.moveTo(12, size / 2);
            context.lineTo(size - 12, size / 2);
            context.stroke();
            context.strokeStyle = '#0a84ff';
            context.lineWidth = 2;
            context.beginPath();
            context.arc(size / 2, size / 2, 8, 0, Math.PI * 2);
            context.stroke();
        },
        [activeRecord, photo, showTemplate]
    );

    useEffect(() => {
        const canvas = photoCanvasRef.current;
        if (!canvas || !photo) return;
        canvas.width = photo.width;
        canvas.height = photo.height;
        const context = canvas.getContext('2d');
        if (!context) return;
        context.drawImage(photo.sourceCanvas, 0, 0);
    }, [photo]);

    useEffect(() => {
        const viewport = photoViewportRef.current;
        if (!viewport || !photo) return;
        const updateSize = () => {
            const bounds = viewport.getBoundingClientRect();
            setPhotoViewportSize((current) => {
                const width = Math.max(1, Math.round(bounds.width));
                const height = Math.max(1, Math.round(bounds.height));
                return current.width === width && current.height === height
                    ? current
                    : { width, height };
            });
        };
        updateSize();
        const observer = new ResizeObserver(updateSize);
        observer.observe(viewport);
        return () => observer.disconnect();
    }, [photo]);

    useEffect(() => {
        if (draggingCorner !== null) return;
        liveCornersRef.current = copyPoints(corners);
        drawPhotoOverlay(corners, selectedCorner);
    }, [
        corners,
        draggingCorner,
        drawPhotoOverlay,
        photoViewportSize.height,
        photoViewportSize.width,
        photoZoom,
        selectedCorner,
    ]);

    useEffect(() => {
        if (!photoLoupe) return;
        drawPhotoLoupe(photoLoupe, liveCornersRef.current);
    }, [drawPhotoLoupe, photoLoupe]);

    useEffect(() => {
        const canvas = rectifiedCanvasRef.current;
        if (!canvas || !photo || !activeRecord || corners.length !== 4 || draggingCorner !== null)
            return;
        try {
            const rectified = rectifyStackMatrixPhoto(
                photo.pixels,
                photo.width,
                photo.height,
                corners,
                activeRecord.grid.rows,
                activeRecord.grid.columns,
                320
            );
            canvas.width = rectified.width;
            canvas.height = rectified.height;
            const context = canvas.getContext('2d');
            if (!context) return;
            context.putImageData(
                new ImageData(rectified.pixels, rectified.width, rectified.height),
                0,
                0
            );
        } catch {
            // Keep the previous preview while a handle briefly crosses a degenerate position.
        }
    }, [activeRecord, corners, draggingCorner, photo]);

    useEffect(() => {
        if (!photo || !activeRecord || corners.length !== 4) {
            setMeasuredColors([]);
            return;
        }
        if (draggingCorner !== null) return;
        try {
            setMeasuredColors(
                sampleStackMatrixPhoto(
                    photo.pixels,
                    photo.width,
                    photo.height,
                    corners,
                    activeRecord,
                    referenceCorrection
                )
            );
            setError(null);
        } catch (caught) {
            setMeasuredColors([]);
            setError(caught instanceof Error ? caught.message : 'Could not sample the photo');
        }
    }, [activeRecord, corners, draggingCorner, photo, referenceCorrection]);

    useEffect(() => {
        const canvas = lutPreviewCanvasRef.current;
        if (!canvas || !activeRecord || measuredColors.length === 0) return;
        const { columns, rows } = activeRecord.grid;
        canvas.width = columns;
        canvas.height = rows;
        const context = canvas.getContext('2d');
        if (!context) return;
        const pixels = new Uint8ClampedArray(columns * rows * 4);
        for (let index = 0; index < measuredColors.length; index++) {
            const color = measuredColors[index];
            const offset = index * 4;
            pixels[offset] = color[0];
            pixels[offset + 1] = color[1];
            pixels[offset + 2] = color[2];
            pixels[offset + 3] = 255;
        }
        context.putImageData(new ImageData(pixels, columns, rows), 0, 0);
    }, [activeRecord, measuredColors]);

    const pointFromCanvasEvent = (
        event: React.PointerEvent<HTMLCanvasElement>
    ): {
        point: MatrixPhotoPoint;
        localX: number;
        localY: number;
        bounds: DOMRect;
    } | null => {
        if (!photo) return null;
        const bounds = event.currentTarget.getBoundingClientRect();
        const localX = event.clientX - bounds.left;
        const localY = event.clientY - bounds.top;
        const normalizedX = Math.max(0, Math.min(1, localX / bounds.width));
        const normalizedY = Math.max(0, Math.min(1, localY / bounds.height));
        return {
            bounds,
            localX,
            localY,
            point: {
                x: normalizedX * photo.width,
                y: normalizedY * photo.height,
            },
        };
    };

    const createLoupeState = (
        point: MatrixPhotoPoint,
        localX: number,
        localY: number,
        bounds: DOMRect
    ): PhotoLoupeState | null => {
        if (!photo) return null;
        const loupeSize = 184;
        const gap = 24;
        let left = localX + gap;
        if (left + loupeSize > bounds.width - 8) left = localX - loupeSize - gap;
        left = Math.max(8, Math.min(bounds.width - loupeSize - 8, left));
        const top = Math.max(8, Math.min(bounds.height - loupeSize - 8, localY - loupeSize / 2));
        return {
            point,
            left,
            top,
            sourceRadius: Math.max(12, (34 * photo.width) / Math.max(1, bounds.width)),
        };
    };

    const applyPendingCornerDrag = (pending: PendingCornerDrag): boolean => {
        if (!activeRecord || !photo || liveCornersRef.current.length !== 4) return false;
        const currentPoint = liveCornersRef.current[pending.cornerIndex];
        const maxDistance = 24 * (photo.width / Math.max(1, pending.bounds.width));
        const constrainedTarget = constrainStackMatrixCornerMove(
            liveCornersRef.current,
            pending.cornerIndex,
            pending.point,
            activeRecord.grid.rows,
            activeRecord.grid.columns
        );
        const constrainedPoint = approachStackMatrixCornerMove(
            liveCornersRef.current,
            pending.cornerIndex,
            pending.point,
            activeRecord.grid.rows,
            activeRecord.grid.columns,
            maxDistance
        );
        const nextCorners = liveCornersRef.current.map((corner, index) =>
            index === pending.cornerIndex ? constrainedPoint : corner
        );
        liveCornersRef.current = nextCorners;
        drawPhotoOverlay(nextCorners, pending.cornerIndex);

        const loupe = createLoupeState(
            constrainedPoint,
            pending.localX,
            pending.localY,
            pending.bounds
        );
        if (!loupe) return false;
        const container = loupeContainerRef.current;
        if (container) {
            container.style.left = `${loupe.left}px`;
            container.style.top = `${loupe.top}px`;
        }
        drawPhotoLoupe(loupe, nextCorners);
        return (
            Math.hypot(
                constrainedTarget.x - constrainedPoint.x,
                constrainedTarget.y - constrainedPoint.y
            ) > 0.25 &&
            Math.hypot(constrainedPoint.x - currentPoint.x, constrainedPoint.y - currentPoint.y) >
                1e-6
        );
    };

    const scheduleCornerDragFrame = () => {
        if (cornerDragFrameRef.current !== null) return;
        cornerDragFrameRef.current = requestAnimationFrame(() => {
            cornerDragFrameRef.current = null;
            const pending = pendingCornerDragRef.current;
            if (!pending || draggingCornerRef.current !== pending.cornerIndex) return;
            const shouldContinue = applyPendingCornerDrag(pending);
            if (shouldContinue) scheduleCornerDragFrame();
            else pendingCornerDragRef.current = null;
        });
    };

    const handleCanvasPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
        const mapped = pointFromCanvasEvent(event);
        if (!mapped || !photo) return;
        if (corners.length < 4) {
            setCorners((current) => {
                const next = [...current, mapped.point];
                liveCornersRef.current = copyPoints(next);
                return next;
            });
            return;
        }
        const nearest = corners.reduce(
            (best, corner, index) => {
                const displayX = (corner.x / photo.width) * mapped.bounds.width;
                const displayY = (corner.y / photo.height) * mapped.bounds.height;
                const distance = Math.hypot(displayX - mapped.localX, displayY - mapped.localY);
                return distance < best.distance ? { index, distance } : best;
            },
            { index: -1, distance: Infinity }
        );
        if (nearest.index < 0 || nearest.distance > 44) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        draggingCornerRef.current = nearest.index;
        setDraggingCorner(nearest.index);
        setSelectedCorner(nearest.index);
        setAlignmentAdjusted(true);
        setAlignmentConfirmed(false);
        setPhotoLoupe(
            createLoupeState(
                liveCornersRef.current[nearest.index],
                mapped.localX,
                mapped.localY,
                mapped.bounds
            )
        );
    };

    const handleCanvasPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
        const cornerIndex = draggingCornerRef.current;
        if (cornerIndex === null) return;
        const mapped = pointFromCanvasEvent(event);
        if (!mapped) return;
        pendingCornerDragRef.current = { cornerIndex, ...mapped };
        scheduleCornerDragFrame();
    };

    const finishCornerDrag = (event: React.PointerEvent<HTMLCanvasElement>) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
        if (cornerDragFrameRef.current !== null) {
            cancelAnimationFrame(cornerDragFrameRef.current);
            cornerDragFrameRef.current = null;
        }
        const pending = pendingCornerDragRef.current;
        pendingCornerDragRef.current = null;
        if (pending && draggingCornerRef.current === pending.cornerIndex) {
            applyPendingCornerDrag(pending);
        }
        setCorners(copyPoints(liveCornersRef.current));
        draggingCornerRef.current = null;
        setDraggingCorner(null);
        setPhotoLoupe(null);
    };

    const handleDetectAgain = () => {
        if (photo) detectPhotoAlignment(photo);
    };

    const handleResetAlignment = () => {
        if (initialCornersRef.current.length !== 4) return;
        const nextCorners = copyPoints(initialCornersRef.current);
        liveCornersRef.current = copyPoints(nextCorners);
        setCorners(nextCorners);
        setAlignmentAdjusted(false);
        setAlignmentConfirmed(
            cornerEstimate?.method === 'detected' && cornerEstimate.confidence >= 0.55
        );
        setDraggingCorner(null);
        setSelectedCorner(null);
        setPhotoLoupe(null);
        draggingCornerRef.current = null;
        pendingCornerDragRef.current = null;
        if (cornerDragFrameRef.current !== null) {
            cancelAnimationFrame(cornerDragFrameRef.current);
            cornerDragFrameRef.current = null;
        }
    };

    const handleSave = () => {
        if (
            !activeRecord ||
            !photo ||
            photo.profileId !== profileId ||
            photo.recordId !== activeRecord.id ||
            !cornerEstimate ||
            !alignmentReady ||
            measuredColors.length !== activeRecord.samples.length
        )
            return;
        try {
            const completed = completeStackMatrixCalibration(
                activeRecord,
                measuredColors,
                photo.fileName,
                referenceCorrection,
                undefined,
                {
                    alignmentConfidence: cornerEstimate.confidence,
                    alignmentMethod:
                        !alignmentAdjusted && cornerEstimate.method === 'detected'
                            ? 'detected'
                            : 'manual',
                    alignmentVerified: true,
                }
            );
            onUpsert?.(completed);
            updateOwnerState(profileId, (current) => ({
                ...current,
                localRecord: completed,
            }));
            setError(null);
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Could not save Stack Matrix');
        }
    };

    const handleDelete = () => {
        if (!activeRecord || !onDelete || busy) return;
        try {
            onDelete(activeRecord.id);
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Could not delete Stack Matrix');
            return;
        }
        const remaining = records.filter((record) => record.id !== activeRecord.id);
        updateOwnerState(profileId, (current) => ({
            ...current,
            localRecord: null,
            activeRecordId: remaining.at(-1)?.id ?? null,
            creatingNew: remaining.length === 0,
        }));
        setPhoto(null);
        setCorners([]);
        setCornerEstimate(null);
        setAlignmentAdjusted(false);
        setAlignmentConfirmed(false);
        setMeasuredColors([]);
    };

    if (!creatingNew && activeRecord) {
        const physicalSize = stackMatrixPhysicalSize(activeRecord);
        const foundationHeight = activeRecord.foundationLayerThicknesses.reduce(
            (sum, thickness) => sum + thickness,
            0
        );
        const colorRegionHeight = activeRecord.stackLayerCount * activeRecord.process.layerHeight;
        const totalPrintLayers =
            activeRecord.foundationLayerThicknesses.length + activeRecord.stackLayerCount;
        const usedFilamentCount = new Set(activeRecord.samples.flatMap((sample) => sample.stack))
            .size;
        const fitScale = photo
            ? Math.min(
                  photoViewportSize.width / photo.width,
                  photoViewportSize.height / photo.height
              )
            : 0;
        const fittedPhotoWidth = photo ? Math.max(1, photo.width * fitScale) : 0;
        const fittedPhotoHeight = photo ? Math.max(1, photo.height * fitScale) : 0;
        const displayedPhotoWidth = fittedPhotoWidth * photoZoom;
        const displayedPhotoHeight = fittedPhotoHeight * photoZoom;
        const photoWorkspaceWidth = Math.max(photoViewportSize.width, displayedPhotoWidth);
        const photoWorkspaceHeight = Math.max(photoViewportSize.height, displayedPhotoHeight);
        return (
            <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                    {records.length > 0 && (
                        <Select
                            value={activeRecord.id}
                            onValueChange={(recordId) =>
                                updateOwnerState(profileId, (current) => ({
                                    ...current,
                                    activeRecordId: recordId,
                                }))
                            }
                            disabled={busy}
                        >
                            <SelectTrigger className="min-w-[20rem] flex-1">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {records.map((record) => (
                                    <SelectItem key={record.id} value={record.id}>
                                        {recordLabel(record)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                    <Button
                        variant="outline"
                        onClick={() =>
                            updateOwnerState(profileId, (current) => ({
                                ...current,
                                creatingNew: true,
                            }))
                        }
                        disabled={busy}
                    >
                        <Plus className="mr-1.5 h-4 w-4" />
                        {t('matrix.newMatrix')}
                    </Button>
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={handleDelete}
                        disabled={busy}
                        aria-label={t('matrix.deleteStackMatrix')}
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </div>

                <Card className="grid gap-3 p-4 md:grid-cols-[1fr_auto]">
                    <div>
                        <div className="flex items-center gap-2 text-sm font-semibold">
                            <Grid3X3 className="h-4 w-4 text-primary" />
                            {t(
                                activeRecord.status === 'complete'
                                    ? 'matrix.measuredRecipes'
                                    : 'matrix.recipeCells',
                                { count: activeRecord.samples.length }
                            )}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                            {t('matrix.dataCellsMmColorLayers', {
                                value1: activeRecord.grid.columns,
                                value2: activeRecord.grid.rows,
                                value3: physicalSize.width.toFixed(1),
                                value4: physicalSize.height.toFixed(1),
                                value5: activeRecord.schemaVersion === 2 ? t('matrix.upTo') : '',
                                value6: activeRecord.stackLayerCount,
                                value7:
                                    activeRecord.selection === 'exhaustive'
                                        ? t('matrix.allCombinations')
                                        : activeRecord.selection === 'adaptive-gamut'
                                          ? t('matrix.adaptiveCoverage')
                                          : t('matrix.hdSelectedGamut'),
                            })}
                        </p>
                        <p
                            className="mt-1 text-xs text-muted-foreground"
                            data-testid="matrix-saved-height-summary"
                        >
                            {t('matrix.mmFoundationMmColorRegionMmTotalPrint', {
                                value1: formatMatrixThickness(foundationHeight),
                                value2: formatMatrixThickness(colorRegionHeight),
                                value3: formatMatrixThickness(foundationHeight + colorRegionHeight),
                                value4: totalPrintLayers,
                            })}
                        </p>
                        {activeRecord.planning && (
                            <p className="mt-1 text-xs text-muted-foreground">
                                {t('matrix.mmColorStackCapPlannedMaterialChangesPrior', {
                                    value1: (
                                        activeRecord.stackLayerCount *
                                        activeRecord.process.layerHeight
                                    ).toFixed(2),
                                    value2: activeRecord.planning.estimatedSwapCycles,
                                    value3: activeRecord.planning.compatibleHistoryCount,
                                    value4: activeRecord.planning.referenceSampleCount,
                                    value5:
                                        activeRecord.planning.unmeasuredSampleCount !== undefined
                                            ? t('matrix.unmeasuredRecipes', {
                                                  count: activeRecord.planning
                                                      .unmeasuredSampleCount,
                                              })
                                            : '',
                                })}
                            </p>
                        )}
                        {activeRecord.planning?.unmeasuredSampleCount === 0 && (
                            <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                                {t('matrix.thisPlanOnlyRepeatsMeasuredRecipesADifferent')}
                            </p>
                        )}
                        {activeRecord.planning &&
                            usedFilamentCount < activeRecord.filaments.length && (
                                <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                                    {t('matrix.thisPlanUsesOfSelectedFilamentsUnusedFilaments', {
                                        value1: usedFilamentCount,
                                        value2: activeRecord.filaments.length,
                                    })}
                                </p>
                            )}
                    </div>
                    <div className="flex items-center gap-2">
                        {activeRecord.status === 'complete' && (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                                <Check className="h-4 w-4" />
                                {t('matrix.calibrated')}
                            </span>
                        )}
                        <Button variant="outline" onClick={handleDownloadAgain} disabled={busy}>
                            {busy ? (
                                <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" />
                            ) : (
                                <Download className="mr-1.5 h-4 w-4" />
                            )}
                            <span aria-live="polite">
                                {generationPhase === 'saving'
                                    ? t('matrix.saving3MF')
                                    : busy
                                      ? t('matrix.building3MF')
                                      : t('matrix.download3MF')}
                            </span>
                        </Button>
                    </div>
                </Card>

                <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
                    <Card
                        className={`p-4 transition-colors ${photoDragActive ? 'border-primary bg-primary/5 ring-1 ring-primary' : ''}`}
                        aria-label={t('matrix.stackMatrixPhotoDropZone')}
                        onDragEnter={handlePhotoDragEnter}
                        onDragOver={handlePhotoDragOver}
                        onDragLeave={handlePhotoDragLeave}
                        onDrop={handlePhotoDrop}
                    >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <h5 className="text-sm font-semibold">
                                    {t('matrix.photographThePrintedMatrix')}
                                </h5>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    {t('matrix.useDiffuseFrontLightingAndAvoidGlare')}
                                </p>
                            </div>
                            <div className="flex flex-wrap items-center justify-end gap-2">
                                {photo && (
                                    <>
                                        <div className="flex items-center rounded-md border border-border bg-background p-0.5">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8"
                                                onClick={() =>
                                                    handleRotatePhoto('counterclockwise')
                                                }
                                                aria-label={t('matrix.rotatePhotoLeft90Degrees')}
                                                title={t('matrix.rotatePhotoLeft90')}
                                            >
                                                <RotateCcw className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8"
                                                onClick={() => handleRotatePhoto('clockwise')}
                                                aria-label={t('matrix.rotatePhotoRight90Degrees')}
                                                title={t('matrix.rotatePhotoRight90')}
                                            >
                                                <RotateCw className="h-4 w-4" />
                                            </Button>
                                        </div>
                                        <div className="flex items-center rounded-md border border-border bg-background p-0.5">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8"
                                                onClick={() =>
                                                    setPhotoZoom((current) =>
                                                        Math.max(1, current - 0.5)
                                                    )
                                                }
                                                disabled={photoZoom <= 1}
                                                aria-label={t('matrix.zoomPhotoOut')}
                                                title={t('matrix.zoomOut')}
                                            >
                                                <ZoomOut className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                className="h-8 min-w-12 px-1.5 text-[11px] tabular-nums"
                                                onClick={() => setPhotoZoom(1)}
                                                disabled={photoZoom === 1}
                                                aria-label={t('matrix.resetPhotoZoomTo100Percent')}
                                                title={t('matrix.resetZoom')}
                                            >
                                                {Math.round(photoZoom * 100)}%
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8"
                                                onClick={() =>
                                                    setPhotoZoom((current) =>
                                                        Math.min(4, current + 0.5)
                                                    )
                                                }
                                                disabled={photoZoom >= 4}
                                                aria-label={t('matrix.zoomPhotoIn')}
                                                title={t('matrix.zoomIn')}
                                            >
                                                <ZoomIn className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </>
                                )}
                                <Button
                                    variant="outline"
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    <Camera className="mr-1.5 h-4 w-4" />
                                    {t('matrix.choosePhoto')}
                                </Button>
                            </div>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(event) => {
                                    handlePhotoFile(event.target.files?.[0]);
                                    event.currentTarget.value = '';
                                }}
                            />
                        </div>
                        <div
                            className="mt-3 rounded-md border border-border/70 bg-muted/20 p-3"
                            aria-label={t('matrix.printedMatrixCornerOrientationKey')}
                        >
                            <div className="mb-2 flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-xs font-semibold">
                                        {t('matrix.printedCornerKey')}
                                    </p>
                                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                                        {t('matrix.rotateThePrintUntilItsCornerColorsMatch')}
                                    </p>
                                </div>
                                <span className="whitespace-nowrap rounded-full border border-border bg-background px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                    {t('matrix.topEdge')}
                                </span>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                {CORNER_MARKER_LAYOUT.map((marker) => {
                                    const color = cornerMarkerColor(
                                        activeRecord,
                                        marker.cornerIndex
                                    );
                                    const textColor =
                                        swatchLuminance(color) < 140 ? '#ffffff' : '#000000';
                                    return (
                                        <div
                                            key={marker.number}
                                            className={`flex items-center gap-2 rounded-md border border-border/60 bg-background/70 p-2 ${marker.rightAligned ? 'flex-row-reverse text-right' : ''}`}
                                        >
                                            <span
                                                className="grid h-8 w-8 flex-none place-items-center rounded-md border border-black/25 text-xs font-bold shadow-sm"
                                                style={{ backgroundColor: color, color: textColor }}
                                                title={t('matrix.marker', {
                                                    value1: t(marker.labelKey),
                                                    value2: color,
                                                })}
                                            >
                                                {marker.number}
                                            </span>
                                            <span className="min-w-0">
                                                <span className="block text-xs font-medium">
                                                    {t(marker.labelKey)}
                                                </span>
                                                <span className="block font-mono text-[10px] uppercase text-muted-foreground">
                                                    {color}
                                                </span>
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                        <div className="mt-3 flex gap-3 rounded-md border border-primary/40 bg-primary/10 p-3">
                            <Move className="mt-0.5 h-5 w-5 flex-none text-primary" />
                            <div>
                                <p className="text-sm font-semibold">
                                    {t('matrix.alignTheHandlesWithThePrintedMarkerCenters')}
                                </p>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                    {t('matrix.putEachHandleInTheCenterOfIts')}
                                </p>
                                {photo && draggingCorner !== null && (
                                    <p className="mt-2 text-sm font-medium text-primary">
                                        {t('matrix.adjustingMarker', {
                                            value1: t(POINT_LABEL_KEYS[draggingCorner]),
                                        })}
                                    </p>
                                )}
                                {photo && draggingCorner === null && corners.length === 4 && (
                                    <p className="mt-2 text-sm font-medium text-emerald-600">
                                        {t('matrix.fourMarkerCentersReadyForReview')}
                                    </p>
                                )}
                            </div>
                        </div>
                        {photo ? (
                            <div className="mt-3 space-y-2">
                                <div
                                    ref={photoViewportRef}
                                    className="relative h-[clamp(30rem,68vh,52rem)] w-full overflow-auto rounded-md border border-border bg-black"
                                >
                                    <div
                                        className="relative"
                                        style={{
                                            width: photoWorkspaceWidth,
                                            height: photoWorkspaceHeight,
                                        }}
                                    >
                                        <div
                                            className="absolute"
                                            style={{
                                                left:
                                                    (photoWorkspaceWidth - displayedPhotoWidth) / 2,
                                                top:
                                                    (photoWorkspaceHeight - displayedPhotoHeight) /
                                                    2,
                                                width: displayedPhotoWidth,
                                                height: displayedPhotoHeight,
                                            }}
                                        >
                                            <canvas
                                                ref={photoCanvasRef}
                                                className="block h-full w-full"
                                                aria-hidden="true"
                                            />
                                            <canvas
                                                ref={overlayCanvasRef}
                                                className={`absolute inset-0 block h-full w-full touch-none ${draggingCorner !== null ? 'cursor-grabbing' : 'cursor-grab'}`}
                                                onPointerDown={handleCanvasPointerDown}
                                                onPointerMove={handleCanvasPointerMove}
                                                onPointerUp={finishCornerDrag}
                                                onPointerCancel={finishCornerDrag}
                                            />
                                            {photoLoupe && draggingCorner !== null && (
                                                <div
                                                    ref={loupeContainerRef}
                                                    className="pointer-events-none absolute z-10 overflow-hidden rounded-full border-4 border-primary bg-black shadow-2xl ring-2 ring-black/70"
                                                    style={{
                                                        left: photoLoupe.left,
                                                        top: photoLoupe.top,
                                                        width: 184,
                                                        height: 184,
                                                    }}
                                                >
                                                    <canvas
                                                        ref={loupeCanvasRef}
                                                        className="block h-44 w-44 rounded-full"
                                                    />
                                                    <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/75 px-2 py-0.5 text-[10px] font-medium text-white">
                                                        {t(POINT_LABEL_KEYS[draggingCorner])}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                    <Crosshair className="h-3.5 w-3.5 flex-none text-primary" />
                                    {t('matrix.100FitsTheFullPhotoZoomInAnd')}
                                </div>
                            </div>
                        ) : (
                            <button
                                type="button"
                                className="mt-3 flex min-h-56 w-full items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground hover:border-primary/60 hover:text-foreground"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                {photoDragActive
                                    ? t('matrix.dropThePhotoHere')
                                    : t('matrix.uploadOrDropAPhotoOfThisExact')}
                            </button>
                        )}
                    </Card>

                    <Card className="space-y-4 p-4">
                        <div>
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <h5 className="text-sm font-semibold">
                                        {t('matrix.matrixAlignment')}
                                    </h5>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        {t('matrix.matchTheProjectedGridToThePrintedCells')}
                                    </p>
                                </div>
                                {photo && cornerEstimate && (
                                    <span
                                        className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-medium ${cornerEstimate.method === 'detected' && cornerEstimate.confidence >= 0.55 ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600' : 'border-amber-500/40 bg-amber-500/10 text-amber-600'}`}
                                    >
                                        {alignmentAdjusted
                                            ? t('matrix.adjusted')
                                            : cornerEstimate.method === 'detected' &&
                                                cornerEstimate.confidence >= 0.55
                                              ? t('matrix.autoDetected')
                                              : t('matrix.reviewAlignment')}
                                    </span>
                                )}
                            </div>
                            <div className="mt-3 grid grid-cols-2 gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleDetectAgain}
                                    disabled={!photo}
                                >
                                    <ScanSearch className="mr-1.5 h-3.5 w-3.5" />
                                    {t('matrix.detectAgain')}
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleResetAlignment}
                                    disabled={!photo || initialCornersRef.current.length !== 4}
                                >
                                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                                    {t('matrix.reset')}
                                </Button>
                            </div>
                        </div>
                        <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 p-3">
                            <div>
                                <Label htmlFor="matrix-template-grid" className="text-xs">
                                    {t('matrix.showTemplateGrid')}
                                </Label>
                                <p className="mt-0.5 text-[11px] text-muted-foreground">
                                    {t('matrix.exactCellBoundariesProjectedOntoThePhoto')}
                                </p>
                            </div>
                            <Switch
                                id="matrix-template-grid"
                                checked={showTemplate}
                                onCheckedChange={setShowTemplate}
                                disabled={!photo}
                            />
                        </div>
                        {photo && cornerEstimate && !alignmentAutoAccepted && (
                            <div className="flex items-center justify-between gap-3 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
                                <div>
                                    <Label htmlFor="matrix-alignment-confirmed" className="text-xs">
                                        {t('matrix.iVerifiedEveryGridLineAndMarkerCenter')}
                                    </Label>
                                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                                        {t(
                                            'matrix.requiredForAdjustedOrLowConfidenceAlignmentBefore'
                                        )}
                                    </p>
                                </div>
                                <Switch
                                    id="matrix-alignment-confirmed"
                                    checked={alignmentConfirmed}
                                    onCheckedChange={setAlignmentConfirmed}
                                />
                            </div>
                        )}
                        {photo && corners.length === 4 && (
                            <div>
                                <div className="overflow-hidden rounded-md border border-border bg-black">
                                    <canvas
                                        ref={rectifiedCanvasRef}
                                        className="block h-auto w-full"
                                    />
                                </div>
                                <div className="mt-1.5 flex items-center justify-between gap-2">
                                    <p className="text-[11px] font-medium">
                                        {t('matrix.perspectiveCorrectedPreview')}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground">
                                        {t('matrix.cellsShouldLookSquare')}
                                    </p>
                                </div>
                            </div>
                        )}
                        <div className="border-t border-border/60 pt-4">
                            <h5 className="text-sm font-semibold">{t('matrix.photoProcessing')}</h5>
                            <p className="mt-1 text-xs text-muted-foreground">
                                {t('matrix.rawSamplingKeepsTheCameraSColorCast')}
                            </p>
                        </div>
                        <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 p-3">
                            <Label htmlFor="matrix-reference-correction" className="text-xs">
                                {t('matrix.referenceMarkerCorrection')}
                            </Label>
                            <Switch
                                id="matrix-reference-correction"
                                checked={referenceCorrection}
                                onCheckedChange={setReferenceCorrection}
                            />
                        </div>
                        {measuredColors.length > 0 && (
                            <div>
                                <div className="overflow-hidden rounded border border-border bg-black">
                                    <canvas
                                        ref={lutPreviewCanvasRef}
                                        className="block h-auto w-full"
                                        style={{ imageRendering: 'pixelated' }}
                                        aria-label={t(
                                            'matrix.extractedLUTPreviewWithSampledCells',
                                            { count: measuredColors.length }
                                        )}
                                        onPointerMove={(event) => {
                                            const bounds =
                                                event.currentTarget.getBoundingClientRect();
                                            const column = Math.min(
                                                activeRecord.grid.columns - 1,
                                                Math.floor(
                                                    ((event.clientX - bounds.left) / bounds.width) *
                                                        activeRecord.grid.columns
                                                )
                                            );
                                            const row = Math.min(
                                                activeRecord.grid.rows - 1,
                                                Math.floor(
                                                    ((event.clientY - bounds.top) / bounds.height) *
                                                        activeRecord.grid.rows
                                                )
                                            );
                                            const index = row * activeRecord.grid.columns + column;
                                            const color = measuredColors[index];
                                            event.currentTarget.title = color
                                                ? t('matrix.cellColor', {
                                                      index: index + 1,
                                                      color: color.join(', '),
                                                  })
                                                : t('matrix.unusedCell');
                                        }}
                                    />
                                </div>
                                <p className="mt-1.5 text-[11px] text-muted-foreground">
                                    {t('matrix.extractedLUTPreview')}
                                </p>
                            </div>
                        )}
                        {error && (
                            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                                {translateRuntimeMessage(error)}
                            </p>
                        )}
                        <Button
                            onClick={handleSave}
                            disabled={
                                measuredColors.length !== activeRecord.samples.length ||
                                !alignmentReady
                            }
                            title={
                                alignmentReady
                                    ? undefined
                                    : t('matrix.verifyTheProjectedGridAlignmentBeforeSaving')
                            }
                            className="w-full"
                        >
                            <Check className="mr-1.5 h-4 w-4" />
                            {activeRecord.status === 'complete'
                                ? t('matrix.replaceCalibration')
                                : t('matrix.saveCalibration')}
                        </Button>
                    </Card>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h4 className="flex items-center gap-2 text-sm font-semibold">
                        <Grid3X3 className="h-4 w-4 text-primary" />
                        {t('matrix.newStackMatrix')}
                    </h4>
                    <p className="mt-1 max-w-3xl text-xs text-muted-foreground">
                        {t('matrix.samplesColorRecipesUpToAThicknessCap')}
                    </p>
                </div>
                {records.length > 0 && (
                    <Button
                        variant="outline"
                        onClick={() =>
                            updateOwnerState(profileId, (current) => ({
                                ...current,
                                creatingNew: false,
                            }))
                        }
                    >
                        {t('matrix.backToSavedMatrices')}
                    </Button>
                )}
            </div>

            {!profile || profileDirty ? (
                <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                    <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
                    {!profile
                        ? t('matrix.saveANamedFilamentProfileBeforeCreatingA')
                        : t('matrix.saveOrOverwriteTheEditedFilamentProfileFirst')}
                </div>
            ) : null}

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
                <Card className="p-4">
                    <div className="mb-3 flex items-center justify-between">
                        <div>
                            <h5 className="text-sm font-semibold">{t('matrix.filaments')}</h5>
                            <p className="text-xs text-muted-foreground">
                                {t('matrix.choose28InProfileOrder')}
                            </p>
                        </div>
                        <span className="text-xs text-muted-foreground">
                            {t('matrix.selected', { count: selectedFilaments.length })}
                        </span>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                        {filaments.map((filament) => {
                            const selected = selectedIds.has(filament.id);
                            return (
                                <button
                                    key={filament.id}
                                    type="button"
                                    className={`flex items-center gap-2 rounded-md border px-3 py-2 text-left text-xs transition-colors ${selected ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/40'}`}
                                    onClick={() => toggleFilament(filament.id)}
                                >
                                    <span
                                        className="h-6 w-6 flex-none rounded border border-border"
                                        style={{ backgroundColor: filament.color }}
                                    />
                                    <span className="min-w-0 truncate">
                                        {filamentLabel(filament)}
                                    </span>
                                    {selected && <Check className="ml-auto h-4 w-4 text-primary" />}
                                </button>
                            );
                        })}
                    </div>
                </Card>

                <Card className="space-y-3 p-4">
                    <div className="grid grid-cols-2 items-end gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="matrix-maximum-thickness" className="text-xs">
                                {t('matrix.maxColorThicknessMm')}
                            </Label>
                            <Input
                                id="matrix-maximum-thickness"
                                type="number"
                                min={layerHeight}
                                max={Number(
                                    (layerHeight * MAX_STACK_MATRIX_RECIPE_LAYERS).toFixed(6)
                                )}
                                step={layerHeight}
                                value={maximumRecipeThicknessDraft}
                                onChange={(event) =>
                                    setMaximumRecipeThicknessDraft(event.target.value)
                                }
                                aria-invalid={!thicknessValid}
                                aria-describedby="matrix-thickness-help"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="matrix-maximum-cells" className="text-xs">
                                {t('matrix.maximumCells')}
                            </Label>
                            <Select
                                value={String(maximumSamples)}
                                onValueChange={(value) => setMaximumSamples(Number(value))}
                            >
                                <SelectTrigger id="matrix-maximum-cells">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {SAMPLE_CHOICES.map((count) => (
                                        <SelectItem key={count} value={String(count)}>
                                            {count.toLocaleString(i18n.resolvedLanguage)} (
                                            {Math.sqrt(count)} × {Math.sqrt(count)})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <p id="matrix-thickness-help" className="text-xs text-muted-foreground">
                        {thicknessValid
                            ? t('matrix.upToColorLayersMmAboveAOne', {
                                  value1: stackLayerCount,
                                  value2: formatMatrixThickness(plannedColorRegionHeight),
                              })
                            : t('matrix.enterToMm1PrintLayers', {
                                  value1: layerHeight,
                                  value2: Number(
                                      (layerHeight * MAX_STACK_MATRIX_RECIPE_LAYERS).toFixed(6)
                                  ),
                                  value3: MAX_STACK_MATRIX_RECIPE_LAYERS,
                              })}
                    </p>
                    <div className="space-y-1.5">
                        <Label htmlFor="matrix-swap-budget" className="text-xs">
                            {t('matrix.plannedMaterialChangeBudget')}
                        </Label>
                        <Select
                            value={
                                maximumSwapCycles === undefined
                                    ? 'unlimited'
                                    : String(maximumSwapCycles)
                            }
                            onValueChange={(value) =>
                                setMaximumSwapCycles(
                                    value === 'unlimited' ? undefined : Number(value)
                                )
                            }
                        >
                            <SelectTrigger id="matrix-swap-budget">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {[40, 80, 160, 320, 640].map((count) => (
                                    <SelectItem key={count} value={String(count)}>
                                        {t('matrix.changes', { count })}
                                    </SelectItem>
                                ))}
                                <SelectItem value="unlimited">
                                    {t('matrix.noPlannerLimit')}
                                </SelectItem>
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                            {t('matrix.includesReferenceMarkersThePlannerMayUseFewer')}
                        </p>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="matrix-backing-filament" className="text-xs">
                            {t('matrix.backingFilament')}
                        </Label>
                        <Select value={backingId} onValueChange={setBackingId}>
                            <SelectTrigger id="matrix-backing-filament">
                                <SelectValue>
                                    {backingFilament && (
                                        <span className="flex min-w-0 items-center gap-2">
                                            <span
                                                className="h-4 w-4 flex-none rounded-sm border border-border"
                                                style={{ backgroundColor: backingFilament.color }}
                                                aria-hidden="true"
                                            />
                                            <span className="truncate">
                                                {filamentLabel(backingFilament)}
                                            </span>
                                        </span>
                                    )}
                                </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                                {selectedFilaments.map((filament) => (
                                    <SelectItem key={filament.id} value={filament.id}>
                                        <span className="flex min-w-0 items-center gap-2">
                                            <span
                                                className="h-4 w-4 flex-none rounded-sm border border-border"
                                                style={{ backgroundColor: filament.color }}
                                                aria-hidden="true"
                                            />
                                            <span className="truncate">
                                                {filamentLabel(filament)}
                                            </span>
                                        </span>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                            {t('matrix.theFoundationIsOneFirstLayerWithoutAutomatic')}
                        </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
                            <div className="text-[11px] text-muted-foreground">
                                {t('matrix.layerHeight')}
                            </div>
                            <div className="mt-0.5 text-sm font-medium tabular-nums">
                                {layerHeight.toFixed(2)} mm
                            </div>
                        </div>
                        <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
                            <div className="text-[11px] text-muted-foreground">
                                {t('matrix.firstLayerHeight')}
                            </div>
                            <div className="mt-0.5 text-sm font-medium tabular-nums">
                                {firstLayerHeight.toFixed(2)} mm
                            </div>
                        </div>
                    </div>
                </Card>
            </div>

            <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="text-xs">
                    <div className="font-medium text-foreground">
                        {t('matrix.upToRecipeCellsAdaptiveCoverage', {
                            value1: estimatedSamples.toLocaleString(i18n.resolvedLanguage),
                        })}
                    </div>
                    <div className="mt-0.5 text-muted-foreground">
                        {t('matrix.upToMmMmLayersFaceUp', {
                            value1: estimatedWidth.toFixed(1),
                            value2: estimatedHeight.toFixed(1),
                            value3: layerHeight.toFixed(2),
                        })}
                    </div>
                    {thicknessValid && (
                        <div
                            className="mt-0.5 text-muted-foreground"
                            data-testid="matrix-new-height-summary"
                        >
                            {t('matrix.mmFoundationMmColorRegionMmTotalPrint2', {
                                value1: formatMatrixThickness(plannedFoundationHeight),
                                value2: formatMatrixThickness(plannedColorRegionHeight),
                                value3: formatMatrixThickness(
                                    plannedFoundationHeight + plannedColorRegionHeight
                                ),
                                value4: stackLayerCount + 1,
                            })}
                        </div>
                    )}
                    <div className="mt-0.5 text-muted-foreground">
                        {maximumSwapCycles === undefined
                            ? t('matrix.noPlannerMaterialChangeLimit')
                            : t('matrix.budgetPlannedMaterialChanges', {
                                  value1: maximumSwapCycles,
                              })}
                        {t('matrix.actualCountAfterPlanning')}
                    </div>
                    <div className="mt-0.5 max-w-2xl text-muted-foreground">
                        {t('matrix.previousCompletedMeasurementsAreConsideredWhenTheirProfile')}
                    </div>
                </div>
                <Button
                    onClick={handleCreateAndDownload}
                    disabled={!canCreate || busy || !selectedIds.has(backingId)}
                >
                    {busy ? (
                        <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" />
                    ) : (
                        <Download className="mr-1.5 h-4 w-4" />
                    )}
                    <span aria-live="polite">
                        {generationPhase === 'planning'
                            ? t('matrix.planningRecipes')
                            : generationPhase === 'exporting'
                              ? t('matrix.building3MF')
                              : generationPhase === 'saving'
                                ? t('matrix.saving3MF')
                                : t('matrix.createAndDownload3MF')}
                    </span>
                </Button>
            </Card>
            {error && (
                <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    {translateRuntimeMessage(error)}
                </p>
            )}
        </div>
    );
}
