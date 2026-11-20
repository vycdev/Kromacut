import { renderImageEdit } from './renderImageEdit';
import type { ImageEditRequest, ImageEditResponse, ImageEditSnapshot } from '../types/imageEditing';

type RenderOutput = Extract<ImageEditRequest, { kind: 'render' }>['output'];
type WorkerResult = ImageBitmap | Blob | null;

export function createImageEditingClient() {
    let worker: Worker | undefined;
    let nextId = 0;
    let workerUnsupported = false;
    const pending = new Map<
        number,
        { resolve: (result: WorkerResult) => void; reject: (error: unknown) => void }
    >();

    function dispose(
        reason: unknown = new DOMException('Image rendering cancelled', 'AbortError')
    ) {
        worker?.terminate();
        worker = undefined;
        for (const request of pending.values()) request.reject(reason);
        pending.clear();
    }

    function getWorker() {
        if (worker) return worker;
        const connection = new Worker(
            new URL('../workers/imageEditing.worker.ts', import.meta.url),
            {
                type: 'module',
            }
        );
        connection.onmessage = ({ data }: MessageEvent<ImageEditResponse>) => {
            const request = pending.get(data.id);
            if (!request) {
                if (data.kind === 'result' && !(data.image instanceof Blob)) data.image.close();
                return;
            }
            if (data.kind === 'unsupported') {
                workerUnsupported = true;
                request.resolve(null);
            } else if (data.kind === 'error') {
                request.reject(new Error(data.message));
            } else {
                request.resolve(data.image);
            }
        };
        connection.onerror = (event) => {
            if (worker === connection) dispose(new Error(event.message || 'Image worker failed'));
        };
        connection.onmessageerror = () => {
            if (worker === connection)
                dispose(new Error('Image worker response could not be read'));
        };
        worker = connection;
        return connection;
    }

    async function renderInWorker(
        source: HTMLCanvasElement,
        settings: Omit<ImageEditSnapshot, 'bitmap'>,
        output: RenderOutput,
        signal: AbortSignal
    ): Promise<WorkerResult> {
        if (
            workerUnsupported ||
            typeof Worker === 'undefined' ||
            typeof createImageBitmap !== 'function' ||
            typeof OffscreenCanvas === 'undefined'
        ) {
            return null;
        }
        const bitmap = await createImageBitmap(source);
        let sent = false;
        try {
            signal.throwIfAborted();
            const connection = getWorker();
            const id = ++nextId;
            let abort: (() => void) | undefined;
            try {
                return await new Promise<WorkerResult>((resolve, reject) => {
                    pending.set(id, { resolve, reject });
                    abort = () => {
                        pending.delete(id);
                        reject(signal.reason);
                        const cancel: ImageEditRequest = { kind: 'cancel', id };
                        connection.postMessage(cancel);
                    };
                    signal.addEventListener('abort', abort, { once: true });
                    const request: ImageEditRequest = {
                        id,
                        kind: 'render',
                        snapshot: { bitmap, ...settings },
                        output,
                    };
                    connection.postMessage(request, [bitmap]);
                    sent = true;
                });
            } finally {
                pending.delete(id);
                if (abort) signal.removeEventListener('abort', abort);
            }
        } finally {
            if (!sent) bitmap.close();
        }
    }

    async function render(
        source: HTMLCanvasElement,
        settings: Omit<ImageEditSnapshot, 'bitmap'>,
        output: RenderOutput,
        signal: AbortSignal
    ): Promise<ImageBitmap | HTMLCanvasElement | Blob> {
        signal.throwIfAborted();
        const result = await renderInWorker(source, settings, output, signal);
        if (result) return result;
        signal.throwIfAborted();
        // Older WebKit can lack worker 2D surfaces. Snapshot the source before
        // yielding so later touch-up strokes cannot alter an in-progress edit.
        function makeCanvas(w: number, h: number) {
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            return canvas;
        }
        const snapshot = makeCanvas(source.width, source.height);
        const ctx = snapshot.getContext('2d');
        if (!ctx) throw new Error('Cannot capture image edits');
        ctx.drawImage(source, 0, 0);
        try {
            const canvas = await renderImageEdit(snapshot, settings, makeCanvas, signal);
            if (output === 'preview') return canvas;
            try {
                const png = await new Promise<Blob | null>((resolve) =>
                    canvas.toBlob(resolve, 'image/png')
                );
                signal.throwIfAborted();
                if (!png) throw new Error('Cannot encode image edits');
                return png;
            } finally {
                canvas.width = canvas.height = 1;
            }
        } finally {
            snapshot.width = snapshot.height = 1;
        }
    }

    return { render, dispose };
}
