import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMultiHeadSchedule } from '../src/lib/multiHeadSchedule.ts';
import type { Filament, MultiHeadRangeAssignment } from '../src/types/index.ts';
import type { WindowResult } from '../src/lib/multiHeadAnalysis.ts';

// Minimal window — buildMultiHeadSchedule only reads `windowStart`.
const win = (start: number): WindowResult =>
    ({ windowStart: start, windowEnd: start }) as unknown as WindowResult;

const fil = (id: string, color: string): Filament => ({ id, color, td: 0.5 });

const FILAMENTS = [
    fil('A', '#aaaaaa'),
    fil('B', '#bbbbbb'),
    fil('C', '#cccccc'),
    fil('D', '#dddddd'),
];

test('buildMultiHeadSchedule returns null without the required inputs', () => {
    assert.equal(buildMultiHeadSchedule({}), null);
    assert.equal(
        buildMultiHeadSchedule({ multiHeadWindows: [win(0)], filaments: FILAMENTS }),
        null,
        'needs nozzleAssignments + windowRunFilaments too'
    );
});

test('buildMultiHeadSchedule: pre-print load + a full 2-head swap at a window boundary', () => {
    const events = buildMultiHeadSchedule({
        multiHeadWindows: [win(0), win(8)],
        nozzleAssignments: [
            [0, 1],
            [0, 1],
        ],
        windowRunFilaments: [
            ['A', 'B'],
            ['C', 'D'],
        ],
        filaments: FILAMENTS,
    });

    assert.ok(events, 'expected a schedule');
    assert.equal(events!.length, 2);

    const [load, swap] = events!;

    // Pre-print event: layer 0, no swaps, both heads loaded.
    assert.equal(load.startLayer, 0);
    assert.equal(load.isPrePrint, true);
    assert.equal(load.swapCount, 0);
    assert.deepEqual(
        load.nozzles.map((n) => [n.nozzle, n.filamentId, n.filamentHex, n.changed]),
        [
            [1, 'A', '#aaaaaa', false],
            [2, 'B', '#bbbbbb', false],
        ]
    );

    // Swap checkpoint: windowStart 8 -> 1-based startLayer 9, both heads change.
    assert.equal(swap.startLayer, 9);
    assert.equal(swap.isPrePrint, false);
    assert.equal(swap.swapCount, 2);
    assert.deepEqual(
        swap.nozzles.map((n) => [n.nozzle, n.filamentId, n.changed]),
        [
            [1, 'C', true],
            [2, 'D', true],
        ]
    );
});

test('buildMultiHeadSchedule: only the heads that actually change are counted as swaps', () => {
    const events = buildMultiHeadSchedule({
        multiHeadWindows: [win(0), win(4)],
        nozzleAssignments: [
            [0, 1],
            [0, 1],
        ],
        // head 1 keeps 'A', head 2 changes 'B' -> 'C'
        windowRunFilaments: [
            ['A', 'B'],
            ['A', 'C'],
        ],
        filaments: FILAMENTS,
    });

    const swap = events!.at(-1)!;
    assert.equal(swap.startLayer, 5);
    assert.equal(swap.swapCount, 1);
    assert.deepEqual(
        swap.nozzles.map((n) => n.changed),
        [false, true]
    );
});

test('buildMultiHeadSchedule: non-windowed ranges participate and sort by start layer', () => {
    const range: MultiHeadRangeAssignment = {
        rangeStart: 12,
        rangeEnd: 20,
        nozzleFilaments: ['A', 'D'],
    };
    const events = buildMultiHeadSchedule({
        multiHeadWindows: [win(0)],
        nozzleAssignments: [[0, 1]],
        windowRunFilaments: [['A', 'B']],
        nonWindowedRanges: [range],
        filaments: FILAMENTS,
    });

    assert.equal(events!.length, 2);
    assert.equal(events![0].startLayer, 0); // pre-print (window at 0)
    assert.equal(events![1].startLayer, 13); // range at 12 -> 1-based 13
    // head 1 stays 'A', head 2 'B' -> 'D'
    assert.equal(events![1].swapCount, 1);
});

test('buildMultiHeadSchedule returns null when windows and nonWindowedRanges are both empty', () => {
    assert.equal(
        buildMultiHeadSchedule({
            multiHeadWindows: [],
            nozzleAssignments: [],
            windowRunFilaments: [],
            filaments: FILAMENTS,
        }),
        null,
        'empty raw event list should produce null'
    );
});

test('buildMultiHeadSchedule: idle nozzle (-1) carries previous filament across windows', () => {
    // Window 0: N1→A, N2→B. Window 1: N1→idle (keeps A), N2→C.
    const events = buildMultiHeadSchedule({
        multiHeadWindows: [win(0), win(4)],
        nozzleAssignments: [
            [0, 1],  // window 0: both active
            [-1, 0], // window 1: N1 idle, N2 takes run 0 (C)
        ],
        windowRunFilaments: [
            ['A', 'B'],
            ['C'],
        ],
        filaments: FILAMENTS,
    });

    assert.ok(events, 'expected a schedule');
    const swap = events!.at(-1)!;
    assert.equal(swap.swapCount, 1, 'only N2 changed');
    assert.deepEqual(
        swap.nozzles.map((n) => [n.filamentId, n.changed]),
        [['A', false], ['C', true]]
    );
});

test('buildMultiHeadSchedule: unused heads are pre-loaded from the next phase, merging the checkpoint', () => {
    // Phase 1 (range) uses only head 2; phase 2 (window) loads A/B on both heads.
    // Head 1 must be pre-loaded with A before the print, so the window boundary
    // needs no swap at all and collapses into the pre-print event.
    const range: MultiHeadRangeAssignment = {
        rangeStart: 0,
        rangeEnd: 4,
        nozzleFilaments: ['', 'B'],
    };
    const events = buildMultiHeadSchedule({
        multiHeadWindows: [win(5)],
        nozzleAssignments: [[0, 1]],
        windowRunFilaments: [['A', 'B']],
        nonWindowedRanges: [range],
        filaments: FILAMENTS,
    });

    assert.ok(events, 'expected a schedule');
    assert.equal(events!.length, 1, 'identical phases should merge into the pre-print event');
    const load = events![0];
    assert.equal(load.isPrePrint, true);
    assert.equal(load.swapCount, 0);
    assert.deepEqual(
        load.nozzles.map((n) => [n.filamentId, n.empty]),
        [
            ['A', false],
            ['B', false],
        ]
    );
});

test('buildMultiHeadSchedule: a head never used in the print shows EMPTY, not a fake filament', () => {
    // Two heads configured, but the whole print only ever uses head 1.
    const events = buildMultiHeadSchedule({
        multiHeadWindows: [win(0)],
        nozzleAssignments: [[0, -1]],
        windowRunFilaments: [['A']],
        filaments: FILAMENTS,
    });

    assert.ok(events);
    const [load] = events!;
    assert.equal(load.nozzles[0].filamentId, 'A');
    const idle = load.nozzles[1];
    assert.equal(idle.empty, true);
    assert.equal(idle.filamentName, 'EMPTY');
    assert.notEqual(idle.filamentHex, '#888888');
});

test('buildMultiHeadSchedule: range with an unused head slot does not report a phantom swap', () => {
    // Window loads A/B; the later range only lists head 2 ('' for head 1).
    // Head 1 keeps A — the range must not count a swap to a nonexistent filament.
    const range: MultiHeadRangeAssignment = {
        rangeStart: 10,
        rangeEnd: 14,
        nozzleFilaments: ['', 'C'],
    };
    const events = buildMultiHeadSchedule({
        multiHeadWindows: [win(0)],
        nozzleAssignments: [[0, 1]],
        windowRunFilaments: [['A', 'B']],
        nonWindowedRanges: [range],
        filaments: FILAMENTS,
    });

    assert.equal(events!.length, 2);
    const swap = events![1];
    assert.equal(swap.swapCount, 1, 'only head 2 (B -> C) swaps');
    assert.deepEqual(
        swap.nozzles.map((n) => [n.filamentId, n.changed]),
        [
            ['A', false],
            ['C', true],
        ]
    );
});

test('buildMultiHeadSchedule: consecutive windows with identical loads are merged', () => {
    const events = buildMultiHeadSchedule({
        multiHeadWindows: [win(0), win(6), win(12)],
        nozzleAssignments: [
            [0, 1],
            [0, 1],
            [0, 1],
        ],
        windowRunFilaments: [
            ['A', 'B'],
            ['A', 'B'], // same loads — no checkpoint
            ['C', 'B'],
        ],
        filaments: FILAMENTS,
    });

    assert.ok(events);
    assert.equal(events!.length, 2, 'zero-swap window boundary should be merged away');
    assert.equal(events![0].isPrePrint, true);
    assert.equal(events![1].startLayer, 13);
    assert.equal(events![1].swapCount, 1);
});

test('buildMultiHeadSchedule: unknown filament ID uses #888888 fallback hex', () => {
    const events = buildMultiHeadSchedule({
        multiHeadWindows: [win(0)],
        nozzleAssignments: [[0, 1]],
        windowRunFilaments: [['A', 'GHOST']],
        filaments: FILAMENTS, // GHOST not in FILAMENTS
    });

    assert.ok(events);
    const unknownNozzle = events![0].nozzles.find((n) => n.filamentId === 'GHOST');
    assert.ok(unknownNozzle, 'expected a nozzle entry for the unknown filament');
    assert.equal(unknownNozzle!.filamentHex, '#888888');
});
