export function checkReleaseNotes(
    root: string,
    releaseTag?: string,
    releaseRef?: string
): { version: string; languageCount: number; errors: string[] };
