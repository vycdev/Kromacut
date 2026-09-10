import { invoke, isTauri } from '@tauri-apps/api/core';

export const AUTO_PAINT_DIAGNOSTIC_EVENT_SCHEMA_VERSION = 1;

interface NativeDiagnosticSession {
    id: string;
    path: string;
}

export interface DesktopDiagnosticSession extends NativeDiagnosticSession {
    closed: boolean;
    queue: Promise<void>;
    writeError?: string;
}

export interface AutoPaintDiagnosticFileEvent {
    schemaVersion: typeof AUTO_PAINT_DIAGNOSTIC_EVENT_SCHEMA_VERSION;
    sessionId: string;
    recordedAt: string;
    kind: string;
    payload?: unknown;
}

export async function beginAutoPaintDiagnosticSession(): Promise<DesktopDiagnosticSession | null> {
    if (!isTauri()) return null;

    const native = await invoke<NativeDiagnosticSession>('begin_auto_paint_diagnostic');
    return {
        ...native,
        closed: false,
        queue: Promise.resolve(),
    };
}

function diagnosticLine(
    session: DesktopDiagnosticSession,
    kind: string,
    payload?: unknown
): string {
    const event: AutoPaintDiagnosticFileEvent = {
        schemaVersion: AUTO_PAINT_DIAGNOSTIC_EVENT_SCHEMA_VERSION,
        sessionId: session.id,
        recordedAt: new Date().toISOString(),
        kind,
        ...(payload === undefined ? {} : { payload }),
    };
    return JSON.stringify(event);
}

export function appendAutoPaintDiagnostic(
    session: DesktopDiagnosticSession | null,
    kind: string,
    payload?: unknown
): void {
    if (!session || session.closed || session.writeError) return;

    let line: string;
    try {
        line = diagnosticLine(session, kind, payload);
    } catch (error) {
        session.writeError = error instanceof Error ? error.message : String(error);
        console.error('[autoPaintDiagnostics] Could not serialize diagnostic event:', error);
        return;
    }

    session.queue = session.queue
        .then(async () => {
            await invoke('append_auto_paint_diagnostic', {
                sessionId: session.id,
                entries: [line],
            });
        })
        .catch((error) => {
            session.writeError = error instanceof Error ? error.message : String(error);
            console.error('[autoPaintDiagnostics] Could not write diagnostic event:', error);
        });
}

export function finishAutoPaintDiagnosticSession(
    session: DesktopDiagnosticSession | null,
    kind: string,
    payload?: unknown
): void {
    if (!session || session.closed) return;

    appendAutoPaintDiagnostic(session, kind, payload);
    session.closed = true;
    session.queue = session.queue
        .then(async () => {
            await invoke('finish_auto_paint_diagnostic', { sessionId: session.id });
        })
        .catch((error) => {
            session.writeError = error instanceof Error ? error.message : String(error);
            console.error('[autoPaintDiagnostics] Could not close diagnostic file:', error);
        });
}

export async function openAutoPaintDiagnosticsDirectory(): Promise<string> {
    if (!isTauri()) throw new Error('Auto-paint diagnostic files are available in the desktop app');
    return invoke<string>('open_auto_paint_diagnostics_directory');
}
