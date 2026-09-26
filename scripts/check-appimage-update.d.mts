import type { Buffer } from 'node:buffer';

export function appImageUpdateInformation(repository: string): string;
export function appImageFilename(tag: string): string;

export interface AppImageUpdateMetadata {
    repository: string;
    tag: string;
    updateInformation: string;
    size: number;
    sha1: string;
    zsync: Buffer;
}

export function validateAppImageUpdate(metadata: AppImageUpdateMetadata): string;
export function checkAppImageRelease(
    directory: string,
    repository: string,
    tag: string
): Promise<void>;
