import type { Filament, MultiHeadRangeAssignment } from '../types';
import type { WindowResult } from './multiHeadAnalysis';

/** One nozzle's assignment at a schedule event. */
export interface MultiHeadNozzleEntry {
    nozzle: number; // 1-based
    filamentHex: string;
    filamentId: string;
    /** Human-readable filament name; falls back to hex when the filament has no name. */
    filamentName: string;
    /** True when this nozzle's filament differs from the previous event (requires a physical swap). */
    changed: boolean;
    /** True when this head is never used anywhere in the print (nothing to load). */
    empty?: boolean;
}

/** A single event in the head-load schedule: either the initial load or a swap checkpoint. */
export interface MultiHeadScheduleEvent {
    /** 1-based printer layer number where this event occurs (0 = before print starts). */
    startLayer: number;
    /** State of every nozzle at this event. */
    nozzles: MultiHeadNozzleEntry[];
    /** Number of nozzles that change filament at this event. */
    swapCount: number;
    /** True for the synthetic "before print" event that shows the initial head setup. */
    isPrePrint?: boolean;
}

export interface BuildMultiHeadScheduleParams {
    multiHeadWindows?: WindowResult[];
    nozzleAssignments?: number[][];
    windowRunFilaments?: string[][];
    nonWindowedRanges?: MultiHeadRangeAssignment[];
    filaments?: Filament[];
}

/**
 * Build the per-checkpoint head-load schedule for multi-head mode, ordered by layer.
 *
 * Each window/non-windowed range starts a "phase" with a specific filament loaded on
 * each nozzle. Where a nozzle's filament differs from the previous phase, the operator
 * must physically swap it — those checkpoints (swapCount > 0) are the layers where the
 * print must pause. Heads that a phase does not use are pre-loaded with the filament
 * they will need in a later phase (so the first use never forces a swap); heads that
 * are never used at all are reported as EMPTY. Consecutive phases with identical head
 * loads are merged into one. The result is consumed both by the on-screen Head
 * Schedule and by the 3MF exporter (to emit pause/`M600` markers at swap layers).
 */
export function buildMultiHeadSchedule({
    multiHeadWindows,
    nozzleAssignments,
    windowRunFilaments,
    nonWindowedRanges,
    filaments,
}: BuildMultiHeadScheduleParams): MultiHeadScheduleEvent[] | null {
    if (
        !multiHeadWindows?.length ||
        !nozzleAssignments?.length ||
        !windowRunFilaments?.length ||
        !filaments?.length
    )
        return null;

    const hexById = new Map<string, string>();
    const nameById = new Map<string, string>();
    for (const f of filaments) {
        hexById.set(f.id, f.color);
        nameById.set(f.id, f.name ?? f.color);
    }

    // Build a unified sorted list of all print-order events: real windows +
    // non-windowed ranges (pre-window, gaps, post-window).
    type RawEvent =
        | { kind: 'window'; startLayer0: number; w: number }
        | { kind: 'range'; startLayer0: number; range: MultiHeadRangeAssignment };

    const rawEvents: RawEvent[] = [];

    for (let w = 0; w < multiHeadWindows.length; w++) {
        rawEvents.push({ kind: 'window', startLayer0: multiHeadWindows[w].windowStart, w });
    }
    if (nonWindowedRanges) {
        for (const range of nonWindowedRanges) {
            rawEvents.push({ kind: 'range', startLayer0: range.rangeStart, range });
        }
    }

    rawEvents.sort((a, b) => a.startLayer0 - b.startLayer0);
    if (rawEvents.length === 0) return null;

    // Pass 1: resolve which filament is loaded on each head at every event,
    // carrying the previous load forward when a head is idle/unused in a phase.
    const idsPerEvent: string[][] = [];
    let loadedIds: string[] = [];

    for (const raw of rawEvents) {
        let newLoadedIds: string[];

        if (raw.kind === 'window') {
            const assgn = nozzleAssignments[raw.w] ?? [];
            const runs = windowRunFilaments[raw.w] ?? [];
            if (loadedIds.length === 0) loadedIds = new Array(assgn.length).fill('');
            newLoadedIds = assgn.map((r, k) => (r === -1 ? loadedIds[k] : (runs[r] ?? '')));
        } else {
            if (loadedIds.length === 0)
                loadedIds = new Array(raw.range.nozzleFilaments.length).fill('');
            // A range may leave a head unused (''): keep whatever is already loaded
            // rather than treating it as a swap to nothing.
            newLoadedIds = raw.range.nozzleFilaments.map((fid, k) => fid || loadedIds[k] || '');
        }

        idsPerEvent.push(newLoadedIds);
        loadedIds = newLoadedIds;
    }

    // Pass 2: back-fill heads that are still unloaded from later events, so each
    // head is pre-loaded (before print / at the previous checkpoint) with the
    // filament it will need next instead of showing a nonexistent filament and
    // forcing a pointless swap when the head first becomes active. A head left
    // '' after this is never used anywhere in the print.
    for (let i = idsPerEvent.length - 2; i >= 0; i--) {
        const cur = idsPerEvent[i];
        const next = idsPerEvent[i + 1];
        for (let k = 0; k < cur.length; k++) {
            if (!cur[k]) cur[k] = next[k] ?? '';
        }
    }

    // Pass 3: emit schedule events. Phases whose head loads are identical to the
    // previous phase need no checkpoint and are merged away.
    const events: MultiHeadScheduleEvent[] = [];
    let prevIds: string[] | null = null;

    for (let i = 0; i < rawEvents.length; i++) {
        const ids = idsPerEvent[i];
        const isFirst = prevIds === null;

        const nozzles: MultiHeadNozzleEntry[] = [];
        let swapCount = 0;
        for (let k = 0; k < ids.length; k++) {
            const fid = ids[k];
            const empty = fid === '';
            const hex = empty ? 'transparent' : (hexById.get(fid) ?? '#888888');
            const name = empty ? 'EMPTY' : (nameById.get(fid) ?? hex);
            const changed = !isFirst && fid !== prevIds![k];
            if (changed) swapCount++;
            nozzles.push({
                nozzle: k + 1,
                filamentHex: hex,
                filamentId: fid,
                filamentName: name,
                changed,
                empty,
            });
        }

        prevIds = ids;
        if (!isFirst && swapCount === 0) continue;

        events.push({
            startLayer: isFirst ? 0 : rawEvents[i].startLayer0 + 1,
            nozzles,
            swapCount,
            isPrePrint: isFirst,
        });
    }

    return events.length > 0 ? events : null;
}
