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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import type { Filament } from '@/types';
import type { AutoPaintProfile } from '@/lib/profileManager';
import {
    fingerprintAppearanceFilaments,
    type StackMatrixCalibrationV1,
} from '@/lib/appearanceProfile';
import {
    completeStackMatrixCalibration,
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

const SAMPLE_CHOICES = [64, 144, 256, 400, 625, 1024, 1296, 1600, 2025];
const POINT_LABELS = ['Top-left', 'Top-right', 'Bottom-right', 'Bottom-left'];
const CORNER_MARKER_LAYOUT = [
    { cornerIndex: 0, number: 1, label: 'Top-left', rightAligned: false },
    { cornerIndex: 1, number: 2, label: 'Top-right', rightAligned: true },
    { cornerIndex: 3, number: 4, label: 'Bottom-left', rightAligned: false },
    { cornerIndex: 2, number: 3, label: 'Bottom-right', rightAligned: true },
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

function downloadBlob(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
}

function recordLabel(record: StackMatrixCalibrationV1): string {
    const date = new Date(record.createdAt).toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
    return `${record.samples.length} cells / ${date} / ${record.status === 'complete' ? 'Calibrated' : 'Awaiting photo'}`;
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
    const records = useMemo(
        () => profile?.appearance?.stackMatrices ?? [],
        [profile?.appearance?.stackMatrices]
    );
    const newestRecord = records.at(-1);
    const [localRecord, setLocalRecord] = useState<StackMatrixCalibrationV1 | null>(null);
    const [activeRecordId, setActiveRecordId] = useState<string | null>(newestRecord?.id ?? null);
    const [creatingNew, setCreatingNew] = useState(records.length === 0);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(
        () => new Set(filaments.slice(0, 8).map((filament) => filament.id))
    );
    const [stackLayerCount, setStackLayerCount] = useState(5);
    const [maximumSamples, setMaximumSamples] = useState(256);
    const [backingId, setBackingId] = useState(() => {
        const lightest = [...filaments].sort(
            (left, right) => swatchLuminance(right.color) - swatchLuminance(left.color)
        )[0];
        return lightest?.id ?? '';
    });
    const [busy, setBusy] = useState(false);
    const [generationPhase, setGenerationPhase] = useState<'planning' | 'exporting' | null>(null);
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
    const generationWorkerRef = useRef<Worker | null>(null);

    const runGenerationWorker = useCallback(
        (job: StackMatrixWorkerJob): Promise<StackMatrixWorkerCompleteResponse> => {
            generationWorkerRef.current?.terminate();
            const id = nextMatrixWorkerRequestId++;
            return new Promise((resolve, reject) => {
                const worker = new Worker(
                    new URL('../workers/stackMatrix.worker.ts', import.meta.url),
                    { type: 'module' }
                );
                generationWorkerRef.current = worker;
                const finish = () => {
                    worker.terminate();
                    if (generationWorkerRef.current === worker) {
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
        []
    );

    useEffect(() => {
        return () => {
            generationWorkerRef.current?.terminate();
            if (cornerDragFrameRef.current !== null) {
                cancelAnimationFrame(cornerDragFrameRef.current);
            }
        };
    }, []);

    useEffect(() => {
        if (!activeRecordId && newestRecord) setActiveRecordId(newestRecord.id);
    }, [activeRecordId, newestRecord]);

    useEffect(() => {
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
    }, [activeRecordId]);

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
    const backingFilament = selectedFilaments.find((filament) => filament.id === backingId);
    const combinationCount = selectedFilaments.length ** stackLayerCount;
    const minimumFilamentSwaps = stackLayerCount * Math.max(0, selectedFilaments.length - 1);
    const estimatedColumns = Math.ceil(Math.sqrt(Math.min(combinationCount, maximumSamples)));
    const estimatedRows = Math.ceil(
        Math.min(combinationCount, maximumSamples) / Math.max(1, estimatedColumns)
    );
    const estimatedWidth =
        (estimatedColumns + 2) * STACK_MATRIX_PATCH_SIZE_MM +
        (estimatedColumns + 1) * STACK_MATRIX_GAP_MM;
    const estimatedHeight =
        (estimatedRows + 2) * STACK_MATRIX_PATCH_SIZE_MM +
        (estimatedRows + 1) * STACK_MATRIX_GAP_MM;
    const canCreate = Boolean(
        profile && !profileDirty && onUpsert && selectedFilaments.length >= 2
    );
    const toggleFilament = (filamentId: string) => {
        setSelectedIds((current) => {
            const next = new Set(current);
            if (next.has(filamentId)) {
                if (next.size > 2) {
                    next.delete(filamentId);
                    if (filamentId === backingId) {
                        setBackingId([...next][0] ?? '');
                    }
                }
            } else if (next.size < 8) {
                next.add(filamentId);
            }
            return next;
        });
    };

    const handleCreateAndDownload = useCallback(async () => {
        if (!canCreate) return;
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
                    stackLayerCount,
                    maximumSamples,
                    backingFilamentId: backingId,
                    ownerProfileFingerprint: profile
                        ? fingerprintAppearanceFilaments(profile.filaments)
                        : undefined,
                },
            });
            downloadBlob(blob, `kromacut-stack-matrix-${exported.samples.length}.3mf`);
            let persistenceWarning: string | null = null;
            try {
                onUpsert?.(exported);
            } catch (caught) {
                persistenceWarning = `3MF downloaded, but its plan is only available in this session: ${caught instanceof Error ? caught.message : 'profile storage failed'}`;
            }
            setLocalRecord(exported);
            setActiveRecordId(exported.id);
            setCreatingNew(false);
            setPhoto(null);
            setPhotoZoom(1);
            setCorners([]);
            setCornerEstimate(null);
            setAlignmentAdjusted(false);
            setAlignmentConfirmed(false);
            setMeasuredColors([]);
            setError(persistenceWarning);
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Could not create Stack Matrix');
        } finally {
            setBusy(false);
            setGenerationPhase(null);
        }
    }, [
        backingId,
        canCreate,
        firstLayerHeight,
        layerHeight,
        maximumSamples,
        onUpsert,
        profile,
        runGenerationWorker,
        selectedFilaments,
        stackLayerCount,
    ]);

    const handleDownloadAgain = useCallback(async () => {
        if (!activeRecord) return;
        setBusy(true);
        setGenerationPhase('exporting');
        setError(null);
        try {
            const { record: exported, blob } = await runGenerationWorker({
                type: 'export',
                record: activeRecord,
            });
            downloadBlob(blob, `kromacut-stack-matrix-${exported.samples.length}.3mf`);
            let persistenceWarning: string | null = null;
            try {
                onUpsert?.(exported);
            } catch (caught) {
                persistenceWarning = `3MF downloaded, but its refreshed export metadata was not saved: ${caught instanceof Error ? caught.message : 'profile storage failed'}`;
            }
            setLocalRecord(exported);
            setError(persistenceWarning);
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Could not export Stack Matrix');
        } finally {
            setBusy(false);
            setGenerationPhase(null);
        }
    }, [activeRecord, onUpsert, runGenerationWorker]);

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
            if (!file) return;
            if (!isImageFile(file)) {
                setError('Drop an image file for the Stack Matrix photo');
                return;
            }
            const url = URL.createObjectURL(file);
            const image = new Image();
            image.onload = () => {
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
                };
                setPhoto(loadedPhoto);
                setPhotoZoom(1);
                detectPhotoAlignment(loadedPhoto);
                setMeasuredColors([]);
                setError(null);
                URL.revokeObjectURL(url);
            };
            image.onerror = () => {
                setError('Could not open that photo');
                URL.revokeObjectURL(url);
            };
            image.src = url;
        },
        [detectPhotoAlignment]
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
            setLocalRecord(completed);
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
        setLocalRecord(null);
        const remaining = records.filter((record) => record.id !== activeRecord.id);
        setActiveRecordId(remaining.at(-1)?.id ?? null);
        setCreatingNew(remaining.length === 0);
        setPhoto(null);
        setCorners([]);
        setCornerEstimate(null);
        setAlignmentAdjusted(false);
        setAlignmentConfirmed(false);
        setMeasuredColors([]);
    };

    if (!creatingNew && activeRecord) {
        const physicalSize = stackMatrixPhysicalSize(activeRecord);
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
                            onValueChange={setActiveRecordId}
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
                    <Button variant="outline" onClick={() => setCreatingNew(true)} disabled={busy}>
                        <Plus className="mr-1.5 h-4 w-4" />
                        New matrix
                    </Button>
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={handleDelete}
                        disabled={busy}
                        aria-label="Delete Stack Matrix"
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </div>

                <Card className="grid gap-3 p-4 md:grid-cols-[1fr_auto]">
                    <div>
                        <div className="flex items-center gap-2 text-sm font-semibold">
                            <Grid3X3 className="h-4 w-4 text-primary" />
                            {activeRecord.samples.length}{' '}
                            {activeRecord.status === 'complete'
                                ? 'measured recipes'
                                : 'recipe cells'}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                            {activeRecord.grid.columns} × {activeRecord.grid.rows} data cells /{' '}
                            {physicalSize.width.toFixed(1)} × {physicalSize.height.toFixed(1)} mm /{' '}
                            {activeRecord.stackLayerCount} color layers /{' '}
                            {activeRecord.selection === 'exhaustive'
                                ? 'all combinations'
                                : 'HD-selected gamut'}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        {activeRecord.status === 'complete' && (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                                <Check className="h-4 w-4" /> Calibrated
                            </span>
                        )}
                        <Button variant="outline" onClick={handleDownloadAgain} disabled={busy}>
                            {busy ? (
                                <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" />
                            ) : (
                                <Download className="mr-1.5 h-4 w-4" />
                            )}
                            <span aria-live="polite">
                                {busy ? 'Building 3MF…' : 'Download 3MF'}
                            </span>
                        </Button>
                    </div>
                </Card>

                <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
                    <Card
                        className={`p-4 transition-colors ${photoDragActive ? 'border-primary bg-primary/5 ring-1 ring-primary' : ''}`}
                        aria-label="Stack Matrix photo drop zone"
                        onDragEnter={handlePhotoDragEnter}
                        onDragOver={handlePhotoDragOver}
                        onDragLeave={handlePhotoDragLeave}
                        onDrop={handlePhotoDrop}
                    >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <h5 className="text-sm font-semibold">
                                    Photograph the printed matrix
                                </h5>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    Use diffuse front lighting and avoid glare.
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
                                                aria-label="Rotate photo left 90 degrees"
                                                title="Rotate photo left 90°"
                                            >
                                                <RotateCcw className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8"
                                                onClick={() => handleRotatePhoto('clockwise')}
                                                aria-label="Rotate photo right 90 degrees"
                                                title="Rotate photo right 90°"
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
                                                aria-label="Zoom photo out"
                                                title="Zoom out"
                                            >
                                                <ZoomOut className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                className="h-8 min-w-12 px-1.5 text-[11px] tabular-nums"
                                                onClick={() => setPhotoZoom(1)}
                                                disabled={photoZoom === 1}
                                                aria-label="Reset photo zoom to 100 percent"
                                                title="Reset zoom"
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
                                                aria-label="Zoom photo in"
                                                title="Zoom in"
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
                                    <Camera className="mr-1.5 h-4 w-4" /> Choose photo
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
                            aria-label="Printed matrix corner orientation key"
                        >
                            <div className="mb-2 flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-xs font-semibold">Printed corner key</p>
                                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                                        Rotate the print until its corner colors match this layout.
                                    </p>
                                </div>
                                <span className="whitespace-nowrap rounded-full border border-border bg-background px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                    ↑ Top edge
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
                                                title={`${marker.label} marker: ${color}`}
                                            >
                                                {marker.number}
                                            </span>
                                            <span className="min-w-0">
                                                <span className="block text-xs font-medium">
                                                    {marker.label}
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
                                    Align the handles with the printed marker centers
                                </p>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                    Put each handle in the center of its colored marker cell, just
                                    diagonally outside the dense recipe grid—not on the last recipe
                                    cell or the physical board corner. The blue outline should
                                    extend half a cell beyond every handle.
                                </p>
                                {photo && draggingCorner !== null && (
                                    <p className="mt-2 text-sm font-medium text-primary">
                                        Adjusting {POINT_LABELS[draggingCorner].toLowerCase()}{' '}
                                        marker
                                    </p>
                                )}
                                {photo && draggingCorner === null && corners.length === 4 && (
                                    <p className="mt-2 text-sm font-medium text-emerald-600">
                                        Four marker centers ready for review
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
                                                        {POINT_LABELS[draggingCorner]}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                    <Crosshair className="h-3.5 w-3.5 flex-none text-primary" />
                                    100% fits the full photo. Zoom in and scroll the workspace for
                                    precise placement; the magnifier crosshair is the sampled
                                    center.
                                </div>
                            </div>
                        ) : (
                            <button
                                type="button"
                                className="mt-3 flex min-h-56 w-full items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground hover:border-primary/60 hover:text-foreground"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                {photoDragActive
                                    ? 'Drop the photo here'
                                    : 'Upload or drop a photo of this exact matrix'}
                            </button>
                        )}
                    </Card>

                    <Card className="space-y-4 p-4">
                        <div>
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <h5 className="text-sm font-semibold">Matrix alignment</h5>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        Match the projected grid to the printed cells, then verify
                                        that the corrected preview is square.
                                    </p>
                                </div>
                                {photo && cornerEstimate && (
                                    <span
                                        className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-medium ${cornerEstimate.method === 'detected' && cornerEstimate.confidence >= 0.55 ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600' : 'border-amber-500/40 bg-amber-500/10 text-amber-600'}`}
                                    >
                                        {alignmentAdjusted
                                            ? 'Adjusted'
                                            : cornerEstimate.method === 'detected' &&
                                                cornerEstimate.confidence >= 0.55
                                              ? 'Auto-detected'
                                              : 'Review alignment'}
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
                                    <ScanSearch className="mr-1.5 h-3.5 w-3.5" /> Detect again
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleResetAlignment}
                                    disabled={!photo || initialCornersRef.current.length !== 4}
                                >
                                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset
                                </Button>
                            </div>
                        </div>
                        <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 p-3">
                            <div>
                                <Label htmlFor="matrix-template-grid" className="text-xs">
                                    Show template grid
                                </Label>
                                <p className="mt-0.5 text-[11px] text-muted-foreground">
                                    Exact cell boundaries projected onto the photo
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
                                        I verified every grid line and marker center
                                    </Label>
                                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                                        Required for adjusted or low-confidence alignment before
                                        these samples become exact calibration evidence.
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
                                        Perspective-corrected preview
                                    </p>
                                    <p className="text-[10px] text-muted-foreground">
                                        Cells should look square
                                    </p>
                                </div>
                            </div>
                        )}
                        <div className="border-t border-border/60 pt-4">
                            <h5 className="text-sm font-semibold">Photo processing</h5>
                            <p className="mt-1 text-xs text-muted-foreground">
                                Raw sampling keeps the camera’s color cast. Reference correction
                                uses the four known marker recipes to reduce lighting bias.
                            </p>
                        </div>
                        <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 p-3">
                            <Label htmlFor="matrix-reference-correction" className="text-xs">
                                Reference marker correction
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
                                        aria-label={`Extracted LUT preview with ${measuredColors.length} sampled cells`}
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
                                                ? `Cell ${index + 1}: rgb(${color.join(', ')})`
                                                : 'Unused matrix cell';
                                        }}
                                    />
                                </div>
                                <p className="mt-1.5 text-[11px] text-muted-foreground">
                                    Extracted LUT preview
                                </p>
                            </div>
                        )}
                        {error && (
                            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                                {error}
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
                                    : 'Verify the projected grid alignment before saving'
                            }
                            className="w-full"
                        >
                            <Check className="mr-1.5 h-4 w-4" />
                            {activeRecord.status === 'complete'
                                ? 'Replace calibration'
                                : 'Save calibration'}
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
                        New Stack Matrix
                    </h4>
                    <p className="mt-1 max-w-3xl text-xs text-muted-foreground">
                        Prints every fixed-depth recipe that fits. If there are too many, Kromacut
                        uses the current per-channel HD values to keep the most color-diverse
                        recipes.
                    </p>
                </div>
                {records.length > 0 && (
                    <Button variant="outline" onClick={() => setCreatingNew(false)}>
                        Back to saved matrices
                    </Button>
                )}
            </div>

            {!profile || profileDirty ? (
                <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                    <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
                    {!profile
                        ? 'Save a named filament profile before creating a Stack Matrix.'
                        : 'Save or overwrite the edited filament profile first; matrix evidence belongs to an exact profile.'}
                </div>
            ) : null}

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
                <Card className="p-4">
                    <div className="mb-3 flex items-center justify-between">
                        <div>
                            <h5 className="text-sm font-semibold">Filaments</h5>
                            <p className="text-xs text-muted-foreground">
                                Choose 2–8 in profile order.
                            </p>
                        </div>
                        <span className="text-xs text-muted-foreground">
                            {selectedFilaments.length} selected
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
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label className="text-xs">Recipe layers</Label>
                            <Select
                                value={String(stackLayerCount)}
                                onValueChange={(value) => setStackLayerCount(Number(value))}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {[3, 4, 5, 6].map((count) => (
                                        <SelectItem key={count} value={String(count)}>
                                            {count}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs">Maximum cells</Label>
                            <Select
                                value={String(maximumSamples)}
                                onValueChange={(value) => setMaximumSamples(Number(value))}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {SAMPLE_CHOICES.map((count) => (
                                        <SelectItem key={count} value={String(count)}>
                                            {count.toLocaleString()} ({Math.sqrt(count)} ×{' '}
                                            {Math.sqrt(count)})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs">Opaque backing</Label>
                        <Select value={backingId} onValueChange={setBackingId}>
                            <SelectTrigger>
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
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
                            <div className="text-[11px] text-muted-foreground">Layer height</div>
                            <div className="mt-0.5 text-sm font-medium tabular-nums">
                                {layerHeight.toFixed(2)} mm
                            </div>
                        </div>
                        <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
                            <div className="text-[11px] text-muted-foreground">
                                First layer height
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
                        {Math.min(combinationCount, maximumSamples).toLocaleString()} of{' '}
                        {combinationCount.toLocaleString()} recipes
                    </div>
                    <div className="mt-0.5 text-muted-foreground">
                        About {estimatedWidth.toFixed(1)} × {estimatedHeight.toFixed(1)} mm /{' '}
                        {layerHeight.toFixed(2)} mm layers / face-up
                    </div>
                    <div className="mt-0.5 text-muted-foreground">
                        At least {minimumFilamentSwaps.toLocaleString()} filament swaps / slicer may
                        add more
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
                            ? 'Planning recipes…'
                            : generationPhase === 'exporting'
                              ? 'Building 3MF…'
                              : 'Create and download 3MF'}
                    </span>
                </Button>
            </Card>
            {error && (
                <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    {error}
                </p>
            )}
        </div>
    );
}
