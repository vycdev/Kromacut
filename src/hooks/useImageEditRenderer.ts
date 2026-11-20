import { useCallback, useEffect, useRef, useState } from 'react';
import { createImageEditingClient } from '../lib/imageEditingClient';

type Preview = HTMLCanvasElement;

function releasePreview(image: Preview | undefined) {
    if (image) image.width = image.height = 1;
}

export function useImageEditRenderer(imageSrc: string | null) {
    const [previewFailed, setPreviewFailed] = useState(false);
    const client = useRef<ReturnType<typeof createImageEditingClient> | null>(null);
    const preview = useRef<{
        key?: string;
        source?: HTMLCanvasElement;
        image?: Preview;
        request?: AbortController;
    }>({});
    const exports = useRef(new Set<AbortController>());

    const render = useCallback(
        (
            source: HTMLCanvasElement,
            adjustments: Record<string, number>,
            output: 'preview' | 'png',
            signal: AbortSignal
        ) => {
            client.current ??= createImageEditingClient();
            return client.current.render(source, { adjustments }, output, signal);
        },
        []
    );

    const invalidatePreview = useCallback(() => {
        preview.current.request?.abort();
        releasePreview(preview.current.image);
        preview.current = {};
        setPreviewFailed(false);
    }, []);

    useEffect(() => {
        const pending = exports.current;
        return () => {
            pending.forEach((controller) => controller.abort());
        };
    }, [imageSrc]);

    useEffect(() => {
        return () => {
            preview.current.request?.abort();
            releasePreview(preview.current.image);
            preview.current = {};
            client.current?.dispose();
            client.current = null;
        };
    }, []);

    const adjustedPreview = useCallback(
        (
            source: HTMLCanvasElement,
            key: string,
            adjustments: Record<string, number>,
            redraw: () => void
        ) => {
            const previous = preview.current;
            if (previous.source !== source || previous.key !== key) {
                previous.request?.abort();
                if (previous.source !== source) releasePreview(previous.image);
                const request = new AbortController();
                const next = {
                    key,
                    source,
                    request,
                    image: previous.source === source ? previous.image : undefined,
                };
                preview.current = next;
                setPreviewFailed(false);
                void render(source, adjustments, 'preview', request.signal)
                    .then((result) => {
                        if (result instanceof Blob) throw new Error('Invalid preview result');
                        const canvas =
                            result instanceof HTMLCanvasElement
                                ? result
                                : (() => {
                                      try {
                                          const display = document.createElement('canvas');
                                          display.width = result.width;
                                          display.height = result.height;
                                          const ctx = display.getContext('2d');
                                          if (!ctx) throw new Error('Cannot display image preview');
                                          ctx.drawImage(result, 0, 0);
                                          return display;
                                      } finally {
                                          result.close();
                                      }
                                  })();
                        if (request.signal.aborted) {
                            releasePreview(canvas);
                            return;
                        }
                        releasePreview(next.image);
                        next.image = canvas;
                        redraw();
                    })
                    .catch((error: unknown) => {
                        if (request.signal.aborted) return;
                        console.warn('Image preview failed', error);
                        setPreviewFailed(true);
                    });
            }
            return preview.current.image ?? source;
        },
        [render]
    );

    const exportAdjusted = useCallback(
        async (source: HTMLCanvasElement, adjustments: Record<string, number>) => {
            const controller = new AbortController();
            exports.current.add(controller);
            try {
                const result = await render(source, adjustments, 'png', controller.signal);
                if (!(result instanceof Blob)) {
                    if (result instanceof HTMLCanvasElement) releasePreview(result);
                    else result.close();
                    throw new Error('Invalid image export result');
                }
                return controller.signal.aborted ? null : result;
            } catch (error) {
                if (controller.signal.aborted) return null;
                throw error;
            } finally {
                exports.current.delete(controller);
            }
        },
        [render]
    );

    const editPreview = () => {
        // Preserve immediate brush/text feedback. Recompute from the new
        // original only when the stroke/operation has committed.
        preview.current.request?.abort();
        return preview.current.image;
    };

    return { adjustedPreview, invalidatePreview, editPreview, exportAdjusted, previewFailed };
}
