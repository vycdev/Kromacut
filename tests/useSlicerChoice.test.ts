import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { SlicerApp } from '../src/lib/desktopSlicer.ts';
import { loadViteModule } from './helpers/viteModule.ts';

if (!('localStorage' in globalThis)) {
    const store: Record<string, string> = {};
    Object.defineProperty(globalThis, 'localStorage', {
        value: {
            getItem: (key: string) => store[key] ?? null,
            setItem: (key: string, value: string) => {
                store[key] = value;
            },
            removeItem: (key: string) => {
                delete store[key];
            },
            clear: () => {
                for (const key of Object.keys(store)) delete store[key];
            },
        },
    });
}

type SlicerChoiceModule = typeof import('../src/hooks/useSlicerChoice.ts');

const { loadSlicerPreference, saveSlicerPreference } =
    await import('../src/lib/slicerPreference.ts');

const bambu: SlicerApp = { name: 'Bambu Studio', path: '/Applications/BambuStudio.app' };
const orca: SlicerApp = { name: 'Orca Slicer', path: '/Applications/OrcaSlicer.app' };

/**
 * Saves `bambu` and holds `find_slicer_app` until `release` is called. `restore` puts the
 * original `window` back.
 */
function holdSavedSlicerLookup() {
    globalThis.localStorage.clear();
    saveSlicerPreference({ kind: 'app', app: bambu });

    let release!: (app: SlicerApp | null) => void;
    const lookup = new Promise<SlicerApp | null>((resolve) => (release = resolve));
    const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: {
            __TAURI_INTERNALS__: {
                invoke(command: string) {
                    if (command === 'find_slicer_app') return lookup;
                    throw new Error(`Unexpected native command: ${command}`);
                },
            },
        },
    });
    const restore = () => {
        if (windowDescriptor) Object.defineProperty(globalThis, 'window', windowDescriptor);
        else Reflect.deleteProperty(globalThis, 'window');
    };
    return { release, restore };
}

/**
 * Saves `bambu`, then clicks Open in Slicer while `find_slicer_app` is held, saves `orca` from
 * Settings, and only then lets the lookup resolve to `found`.
 */
async function saveDuringSlowCheck(found: SlicerApp | null) {
    const { useSlicerChoice } = await loadViteModule<SlicerChoiceModule>(
        '/src/hooks/useSlicerChoice.ts'
    );
    const { release, restore } = holdSavedSlicerLookup();

    const opened: (SlicerApp | null)[] = [];
    try {
        let choice!: ReturnType<SlicerChoiceModule['useSlicerChoice']>;
        function Probe() {
            choice = useSlicerChoice(async (slicer) => {
                opened.push(slicer);
            });
            return null;
        }
        renderToStaticMarkup(createElement(Probe));

        const open = choice.onOpenInSlicer();
        choice.onChangeSavedSlicer();
        choice.onChooserConfirm(orca, true);
        release(found);
        await open;
    } finally {
        restore();
    }
    return opened;
}

test('a missing saved slicer found late does not forget the slicer saved in Settings', async () => {
    await saveDuringSlowCheck(null);
    assert.deepEqual(loadSlicerPreference(), { kind: 'app', app: orca });
});

test('a saved slicer found late does not open the model after Settings changed it', async () => {
    const opened = await saveDuringSlowCheck(bambu);
    assert.ok(!opened.includes(bambu), 'the model must not open in the replaced slicer');
    assert.deepEqual(loadSlicerPreference(), { kind: 'app', app: orca });
});

test('a saved slicer found late exports with the build that finished during the check', async () => {
    const { useSlicerChoice } = await loadViteModule<SlicerChoiceModule>(
        '/src/hooks/useSlicerChoice.ts'
    );
    const { release, restore } = holdSavedSlicerLookup();

    // Each export callback carries the settings of the build it was rendered with, as the
    // App's 3MF options do, while the exported mesh is always the latest one.
    const exported: { build: number; slicer: SlicerApp | null }[] = [];
    try {
        let open: Promise<void> | undefined;
        function Probe() {
            const [build, setBuild] = useState(1);
            const choice = useSlicerChoice(async (slicer) => {
                exported.push({ build, slicer });
            });
            if (!open) {
                // Click Open in Slicer with build 1, then let build 2 finish during the check.
                // A render-phase update re-renders this same instance with the new export.
                open = choice.onOpenInSlicer();
                setBuild(2);
            }
            return null;
        }
        renderToStaticMarkup(createElement(Probe));

        release(bambu);
        await open;
    } finally {
        restore();
    }
    assert.deepEqual(exported, [{ build: 2, slicer: bambu }]);
});
