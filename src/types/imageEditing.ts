export interface ImageEditSnapshot {
    bitmap: ImageBitmap;
    adjustments: Record<string, number>;
    replacements?: Record<string, string>;
}

export type ImageEditRequest =
    | { kind: 'render'; id: number; snapshot: ImageEditSnapshot; output: 'preview' | 'png' }
    | { kind: 'cancel'; id: number };

export type ImageEditResponse =
    | { id: number; kind: 'result'; image: ImageBitmap | Blob }
    | { id: number; kind: 'unsupported' }
    | { id: number; kind: 'error'; message: string };
