import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createElement, type ComponentType, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { createBuildRevision } from '../src/lib/threeDWorkLifecycle.ts';
import type { ThreeDControlsStateShape } from '../src/types/index.ts';
import type { AutoPaintResult } from '../src/lib/autoPaint.ts';
import type { ColorFirstResult } from '../src/lib/multiHeadAnalysisColorFirst.ts';
import type {
    MultiHeadWorkerRequest,
    MultiHeadWorkerResponse,
} from '../src/workers/multiHead.worker.ts';
import { loadViteModule, withViteTestServer } from './helpers/viteModule.ts';
import { multiHeadFixture } from './helpers/multiHeadFixture.ts';

const { multiHeadBuildSnapshot } = await loadViteModule<
    typeof import('../src/lib/multiHeadBuild.ts')
>('/src/lib/multiHeadBuild.ts');

function fallbackSnapshot() {
    // The swap hook only reads these physical material runs from the result.
    const autoPaintResult = {
        layers: [
            { filamentColor: '#112233', startHeight: 0, endHeight: 0.2 },
            { filamentColor: '#aabbcc', startHeight: 0.2, endHeight: 0.32 },
        ],
    } as AutoPaintResult;
    const state: ThreeDControlsStateShape = {
        layerHeight: 0.12,
        slicerFirstLayerHeight: 0.2,
        colorSliceHeights: [0.2, 0.12],
        colorOrder: [0, 1],
        filteredSwatches: [
            { hex: '#334455', a: 255 },
            { hex: '#778899', a: 255 },
        ],
        autoPaintFilamentSwatches: [
            { hex: '#112233', a: 255 },
            { hex: '#aabbcc', a: 255 },
        ],
        pixelSize: 0.1,
        filaments: [
            { id: 'a', color: '#112233', td: 0.5 },
            { id: 'b', color: '#aabbcc', td: 1 },
        ],
        paintMode: 'autopaint',
        autoPaintResult,
        printableFeaturePixels: {
            width: 1,
            height: 1,
            data: new Uint8ClampedArray([17, 34, 51, 255]),
            fingerprint: 'image-a',
        },
        multiHeadMode: true,
        multiHeadCount: 2,
        multiHeadSearchDepth: 'balanced',
        // A failed rebuild must clear any previously successful analysis.
        multiHeadWindows: [
            { windowStart: 0, windowEnd: 1 },
        ] as ThreeDControlsStateShape['multiHeadWindows'],
        patchedSliceData: {
            colorOrder: [0],
            colorSliceHeights: [0.32],
            swatches: [{ hex: '#ffffff', a: 255 }],
        },
        patchedTransitionZones: [],
        perColorLayerColors: new Map([['#112233', ['#ffffff']]]),
        colorLayerFilaments: new Map([['#112233', [1, 0]]]),
        windowRunFilaments: [['a', 'b']],
        nozzleAssignments: [[1, 0]],
        preWindowFilaments: ['a'],
        nonWindowedRanges: [{ rangeStart: 2, rangeEnd: 3, nozzleFilaments: ['a', 'b'] }],
    };
    return { state, built: multiHeadBuildSnapshot(state, null) };
}

test('failed multi-head builds retain the original physical stack and clear previous analysis assignments', () => {
    const { state, built } = fallbackSnapshot();
    assert.equal(built.multiHeadMode, false);
    assert.deepEqual(built.multiHeadWindows, []);
    for (const field of [
        'patchedTransitionZones',
        'patchedSliceData',
        'perColorLayerColors',
        'colorLayerFilaments',
        'windowRunFilaments',
        'nozzleAssignments',
        'preWindowFilaments',
        'nonWindowedRanges',
    ] as const)
        assert.equal(built[field], undefined, field);
    assert.equal(built.autoPaintResult, state.autoPaintResult);
    assert.equal(built.autoPaintFilamentSwatches, state.autoPaintFilamentSwatches);
    assert.equal(built.printableFeaturePixels, state.printableFeaturePixels);
    assert.equal(built.colorSliceHeights, state.colorSliceHeights);
    assert.equal(built.colorOrder, state.colorOrder);
    assert.equal(built.multiHeadCount, 2);
    assert.equal(state.multiHeadMode, true, 'the requested settings are not mutated');
});

test('image revisions discard delayed artwork, including same-size replacements and returning to the original image', async () => {
    const revision = createBuildRevision();
    const { built: imageA } = fallbackSnapshot();
    const imageB = {
        ...imageA,
        printableFeaturePixels: { ...imageA.printableFeaturePixels!, fingerprint: 'image-b' },
    };
    let displayed: ThreeDControlsStateShape = imageB;
    const isCurrent = revision.begin();
    let finish!: () => void;
    const analysis = new Promise<void>((resolve) => {
        finish = resolve;
    });
    const pending = (async () => {
        await analysis;
        if (isCurrent()) displayed = imageA;
    })();
    revision.invalidate(); // image A -> equal-sized image B
    revision.invalidate(); // B -> A still must not revive the old build
    finish();
    await pending;
    assert.equal(displayed, imageB);
    const latest = revision.begin();
    assert.equal(latest(), true);
    const replacement = revision.begin();
    assert.equal(latest(), false, 'a second build invalidates the first request');
    assert.equal(replacement(), true);
    revision.invalidate(); // unmount
    assert.equal(replacement(), false);
});

test('fallback instructions show the original start color and swaps in every language; schedules and copied text are localized', async () => {
    await withViteTestServer(async (server) => {
        const { default: PrintInstructions } = (await server.ssrLoadModule(
            '/src/components/PrintInstructions.tsx'
        )) as { default: ComponentType<Record<string, unknown>> };
        const { default: ThreeDControls } = (await server.ssrLoadModule(
            '/src/components/ThreeDControls.tsx'
        )) as { default: ComponentType<Record<string, unknown>> };
        const { useSwapPlan } = (await server.ssrLoadModule(
            '/src/hooks/useSwapPlan.ts'
        )) as typeof import('../src/hooks/useSwapPlan.ts');
        const { i18n } = (await server.ssrLoadModule(
            '/src/lib/i18n.ts'
        )) as typeof import('../src/lib/i18n.ts');
        const render = (node: ReactNode) =>
            renderToStaticMarkup(createElement(I18nextProvider, { i18n }, node));
        const { built, state: requested } = fallbackSnapshot();
        const options = {
            colorOrder: built.colorOrder,
            colorSliceHeights: built.colorSliceHeights,
            filtered: built.filteredSwatches,
            layerHeight: built.layerHeight,
            slicerFirstLayerHeight: built.slicerFirstLayerHeight,
            paintMode: built.paintMode,
            autoPaintResult: built.autoPaintResult,
            filaments: built.filaments,
        };
        let plan!: ReturnType<typeof useSwapPlan>;
        function Probe() {
            plan = useSwapPlan(options);
            return null;
        }
        render(createElement(Probe));
        assert.deepEqual(
            plan.swapPlan.map((entry) => entry.swatch.hex),
            ['#112233', '#aabbcc']
        );
        assert.equal(plan.multiHeadPlan, null);
        const props = {
            ...plan,
            multiHeadMode: built.multiHeadMode,
            layerHeight: built.layerHeight,
            slicerFirstLayerHeight: built.slicerFirstLayerHeight,
            onCopy: () => {},
        };
        let copied = '';
        const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
        const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
        Object.defineProperty(globalThis, 'navigator', {
            configurable: true,
            value: {
                clipboard: {
                    writeText: async (text: string) => {
                        copied = text;
                    },
                },
            },
        });
        Object.defineProperty(globalThis, 'window', {
            configurable: true,
            value: { setTimeout: () => 1, clearTimeout: () => {} },
        });
        try {
            for (const language of [
                'en',
                'fr',
                'de',
                'it',
                'ro',
                'es',
                'ja',
                'zh-CN',
                'hi',
                'pt-PT',
                'uk',
                'bn',
            ]) {
                const catalog = JSON.parse(
                    readFileSync(`src/locales/${language}/printing.json`, 'utf8')
                );
                i18n.addResourceBundle(language, 'printing', catalog);
                await i18n.changeLanguage(language);
                const html = render(createElement(PrintInstructions, props));
                assert.ok(html.includes(catalog.printInstructions.startWithColor), language);
                assert.ok(html.includes(catalog.printInstructions.colorSwapPlan), language);
                assert.ok(html.includes('#112233') && html.includes('#aabbcc'), language);
                assert.ok(!html.includes(catalog.multiHead.schedule), language);
                if (language === 'en' || language === 'ro') {
                    const controlsProps = {
                        active: false,
                        swatches: [],
                        imageSrc: null,
                        imageDimensions: null,
                        builtState: built,
                        persisted: requested,
                        calibrationDialogOpen: false,
                        onCalibrationDialogOpenChange: () => {},
                        profileSaveNewOpen: false,
                        onProfileSaveNewOpenChange: () => {},
                        profileRenameOpen: false,
                        onProfileRenameOpenChange: () => {},
                        onFilamentEditingChange: () => {},
                    };
                    const controlsHtml = render(createElement(ThreeDControls, controlsProps));
                    assert.ok(
                        controlsHtml.includes(catalog.printInstructions.startWithColor),
                        language
                    );
                    assert.ok(
                        controlsHtml.includes(catalog.printInstructions.colorSwapPlan),
                        language
                    );
                    assert.ok(!controlsHtml.includes(catalog.multiHead.schedule), language);
                    const fixture = multiHeadFixture();
                    const routed = multiHeadBuildSnapshot(fixture.state, fixture.result);
                    const routedHtml = render(
                        createElement(ThreeDControls, {
                            ...controlsProps,
                            builtState: routed,
                        })
                    );
                    assert.ok(routedHtml.includes(catalog.multiHead.schedule), language);
                    assert.ok(routedHtml.includes(catalog.multiHead.empty), language);
                    assert.ok(
                        routedHtml.includes(i18n.t('printing:multiHead.head', { head: 3 })),
                        language
                    );
                }
                await plan.copyToClipboard();
                assert.ok(copied.includes('#112233') && copied.includes('#aabbcc'), language);

                // Render and copy an explicit schedule, including a never-used head.
                const scheduleOptions = {
                    ...options,
                    multiHeadWindows: [
                        { windowStart: 0 },
                        { windowStart: 2 },
                    ] as ThreeDControlsStateShape['multiHeadWindows'],
                    windowRunFilaments: [['a'], ['b']],
                    nozzleAssignments: [
                        [0, -1],
                        [0, -1],
                    ],
                };
                function ScheduleProbe() {
                    plan = useSwapPlan(scheduleOptions);
                    return null;
                }
                render(createElement(ScheduleProbe));
                const scheduleHtml = render(
                    createElement(PrintInstructions, {
                        ...props,
                        multiHeadMode: true,
                        multiHeadPlan: plan.multiHeadPlan,
                    })
                );
                assert.ok(scheduleHtml.includes(catalog.multiHead.schedule), language);
                assert.ok(scheduleHtml.includes(catalog.multiHead.empty), language);
                assert.ok(
                    scheduleHtml.includes(i18n.t('printing:multiHead.head', { head: 1 })),
                    language
                );
                await plan.copyToClipboard();
                assert.ok(copied.includes(catalog.multiHead.schedule), language);
                assert.ok(copied.includes(catalog.multiHead.empty), language);
                assert.ok(
                    copied.includes(
                        i18n.t('printing:multiHead.swapCheckpointText', { layer: 3, swaps: 1 })
                    ),
                    language
                );
                assert.doesNotMatch(copied, /\{\{|<detail>|<action>/);
                render(createElement(Probe));
            }
        } finally {
            await i18n.changeLanguage('en');
            if (navigatorDescriptor)
                Object.defineProperty(globalThis, 'navigator', navigatorDescriptor);
            else Reflect.deleteProperty(globalThis, 'navigator');
            if (windowDescriptor) Object.defineProperty(globalThis, 'window', windowDescriptor);
            else Reflect.deleteProperty(globalThis, 'window');
        }
    });
});

test('multi-head worker cancellation settles old requests and ignores late replies while newer analysis completes', async () => {
    await withViteTestServer(async (server) => {
        const { useMultiHeadWorker } = (await server.ssrLoadModule(
            '/src/hooks/useMultiHeadWorker.ts'
        )) as typeof import('../src/hooks/useMultiHeadWorker.ts');
        let hook!: ReturnType<typeof useMultiHeadWorker>;
        function Probe() {
            hook = useMultiHeadWorker();
            return null;
        }
        renderToStaticMarkup(createElement(Probe));
        class FakeWorker {
            static instances: FakeWorker[] = [];
            static failure: 'construct' | 'post' | null = null;
            request!: MultiHeadWorkerRequest;
            terminated = false;
            onmessage?: (event: { data: MultiHeadWorkerResponse }) => void;
            constructor() {
                if (FakeWorker.failure === 'construct') throw new Error('Worker unavailable');
                FakeWorker.instances.push(this);
            }
            postMessage(request: MultiHeadWorkerRequest) {
                if (FakeWorker.failure === 'post') throw new Error('Cannot clone request');
                this.request = request;
            }
            terminate() {
                this.terminated = true;
            }
            reply(result: ColorFirstResult) {
                this.onmessage?.({ data: { id: this.request.id, result } });
            }
        }
        const workerDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
        Object.defineProperty(globalThis, 'Worker', { configurable: true, value: FakeWorker });
        const { built } = fallbackSnapshot();
        const params = {
            filaments: built.filaments,
            autoPaintResult: built.autoPaintResult!,
            imageSwatches: [],
            layerHeight: 0.12,
            firstLayerHeight: 0.2,
            n: 2,
            searchDepth: 'balanced' as const,
        };
        const result = { windows: [], patchedLayers: [] } as unknown as ColorFirstResult;
        try {
            const old = hook.run(params);
            const oldWorker = FakeWorker.instances.at(-1)!;
            const latest = hook.run(params);
            assert.equal(await old, null);
            assert.equal(oldWorker.terminated, true);
            oldWorker.reply(result);
            FakeWorker.instances.at(-1)!.reply(result);
            assert.equal(await latest, result);
            const cancelled = hook.run(params);
            hook.cancel();
            assert.equal(await cancelled, null);
            for (const failure of ['construct', 'post'] as const) {
                FakeWorker.failure = failure;
                assert.equal(await hook.run(params), null, failure);
            }
        } finally {
            if (workerDescriptor) Object.defineProperty(globalThis, 'Worker', workerDescriptor);
            else Reflect.deleteProperty(globalThis, 'Worker');
        }
    });
});
