import type { ProjectArchive, ProjectHistory } from './projectFile';
import { inspectProjectPng } from './projectFile';
export interface ImageSession {
    current: string;
    past: string[];
    future: string[];
}
/** Encode original edit-history images, without baking adjustable preview settings. */
export async function captureProjectImages(
    session: ImageSession
): Promise<{ images: Uint8Array[]; history: ProjectHistory }> {
    const urls = [...new Set([session.current, ...session.past, ...session.future])];
    if (urls.length > 200) throw new Error('tooLarge');
    const images: Uint8Array[] = [];
    let total = 0;
    for (const url of urls) {
        const response = await fetch(url);
        if (!response.ok) throw new Error('image');
        const bitmap = await createImageBitmap(await response.blob());
        try {
            if (bitmap.width * bitmap.height > 25_000_000) throw new Error('tooLarge');
            const canvas = document.createElement('canvas');
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
            canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
            const blob = await new Promise<Blob | null>((resolve) =>
                canvas.toBlob(resolve, 'image/png')
            );
            if (!blob) throw new Error('image');
            total += blob.size;
            if (total > 256 * 1024 * 1024) throw new Error('tooLarge');
            images.push(new Uint8Array(await blob.arrayBuffer()));
        } finally {
            bitmap.close();
        }
    }
    return {
        images,
        history: {
            current: urls.indexOf(session.current),
            past: session.past.map((u) => urls.indexOf(u)),
            future: session.future.map((u) => urls.indexOf(u)),
        },
    };
}
/** Decode every image before changing any workspace state. */
export async function prepareProjectImages(project: ProjectArchive): Promise<ImageSession> {
    for (const bytes of project.images) {
        const expected = inspectProjectPng(bytes);
        const bitmap = await createImageBitmap(
            new Blob([new Uint8Array(bytes)], { type: 'image/png' })
        );
        const valid = bitmap.width === expected.width && bitmap.height === expected.height;
        bitmap.close();
        if (!valid) throw new Error('image');
    }
    const referenced = new Set([
        project.history.current,
        ...project.history.past,
        ...project.history.future,
    ]);
    const urls = project.images.map((bytes, index) =>
        referenced.has(index)
            ? URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'image/png' }))
            : ''
    );
    return {
        current: urls[project.history.current],
        past: project.history.past.map((i) => urls[i]),
        future: project.history.future.map((i) => urls[i]),
    };
}
export function revokeProjectImages(session: ImageSession) {
    new Set([session.current, ...session.past, ...session.future]).forEach((url) =>
        URL.revokeObjectURL(url)
    );
}
