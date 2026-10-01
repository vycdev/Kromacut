import { Trans, useTranslation } from 'react-i18next';
import { CollapsibleCard, DirtyDot } from '@/components/CollapsibleCard';
import type { SwapEntry } from '../hooks/useSwapPlan';
import type { SmoothMeshingStrength } from '../types';

interface PrintInstructionsProps {
    swapPlan: SwapEntry[];
    layerHeight: number;
    slicerFirstLayerHeight: number;
    copied: boolean;
    onCopy: () => void;
    tooManyColors?: boolean;
    colorCount?: number;
    /** Flat Paint prints swap filaments per layer via AMS — no manual plan */
    flatPaint?: boolean;
    /** Flat Paint is printed face-up without a transparent carrier. */
    flatPaintFaceUp?: boolean;
    smoothMeshingStrength?: SmoothMeshingStrength;
}

export default function PrintInstructions({
    swapPlan,
    layerHeight,
    slicerFirstLayerHeight,
    copied,
    onCopy,
    tooManyColors = false,
    colorCount = 0,
    flatPaint = false,
    flatPaintFaceUp = false,
    smoothMeshingStrength = 'none',
}: PrintInstructionsProps) {
    const { t } = useTranslation('printing');
    const strengthKeys = {
        none: 'printSettingsCard.smoothingNone',
        minimal: 'printSettingsCard.smoothingMinimal',
        medium: 'printSettingsCard.smoothingMedium',
        aggressive: 'printSettingsCard.smoothingAggressive',
    };
    return (
        <CollapsibleCard
            id="print-instructions"
            title={t('printInstructions.printInstructions')}
            subtitle={t('printInstructions.generatedSwapPlanForYourPrinter')}
            headingLevel={4}
            className="mt-6"
            collapsedSummary={
                tooManyColors ? (
                    <DirtyDot title={t('printInstructions.tooManyColorsForASwapPlan')} />
                ) : undefined
            }
            actions={
                <button
                    type="button"
                    onClick={onCopy}
                    title={t('printInstructions.copyPrintInstructionsToClipboard')}
                    aria-pressed={copied}
                    disabled={tooManyColors}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 ${
                        copied
                            ? 'bg-green-600 text-white'
                            : 'bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed'
                    }`}
                >
                    {copied ? t('printInstructions.copied') : t('printInstructions.copy')}
                </button>
            }
        >
            <div className="space-y-4 text-sm">
                {/* Recommended Settings */}
                <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                    <div className="font-semibold text-foreground mb-2">
                        {t('printInstructions.recommendedSettings')}
                    </div>
                    <div className="space-y-1 text-muted-foreground text-xs">
                        <div data-testid="print-instructions-smoothing">
                            {t('printSettingsCard.smoothMeshing')}:{' '}
                            {t(strengthKeys[flatPaint ? 'none' : smoothMeshingStrength])}
                        </div>
                        <div>
                            <Trans
                                ns="printing"
                                i18nKey="printInstructions.wallLoops"
                                components={{
                                    value: <span className="text-foreground font-medium" />,
                                }}
                            />
                        </div>
                        <div>
                            <Trans
                                ns="printing"
                                i18nKey="printInstructions.infill"
                                components={{
                                    value: <span className="text-foreground font-medium" />,
                                }}
                            />
                        </div>
                        <div>
                            <Trans
                                ns="printing"
                                i18nKey="printInstructions.layerHeight"
                                values={{ height: layerHeight.toFixed(3) }}
                                components={{
                                    value: <span className="text-foreground font-mono" />,
                                }}
                            />
                        </div>
                        <div>
                            <Trans
                                ns="printing"
                                i18nKey="printInstructions.firstLayerHeight"
                                values={{ height: slicerFirstLayerHeight.toFixed(3) }}
                                components={{
                                    value: <span className="text-foreground font-mono" />,
                                }}
                            />
                        </div>
                    </div>
                </div>

                {/* Flat Paint: no manual swap sequence — slicer assigns filaments */}
                {flatPaint ? (
                    <div className="p-3 rounded-lg bg-accent/5 border border-border/50 space-y-2">
                        <div className="font-semibold text-foreground">
                            {t('printInstructions.flatPaintMultiMaterialPrint')}
                        </div>
                        <ul className="list-disc pl-4 space-y-1 text-muted-foreground text-xs">
                            <li>
                                <Trans
                                    ns="printing"
                                    i18nKey="printInstructions.exportMultiMaterial"
                                    components={{ format: <span className="font-semibold" /> }}
                                />
                            </li>
                            {flatPaintFaceUp ? (
                                <>
                                    <li>
                                        {t(
                                            'printInstructions.noClearOrTransparentCarrierObjectIsIncluded'
                                        )}
                                    </li>
                                    <li>{t('printInstructions.printAsIsAndFaceUpDoNotMirror')}</li>
                                    <li>
                                        {t('printInstructions.theArtworkIsExposedOnTheTopSurface')}
                                    </li>
                                </>
                            ) : (
                                <>
                                    <li>
                                        <Trans
                                            ns="printing"
                                            i18nKey="printInstructions.transparentCarrier"
                                            components={{
                                                material: <span className="font-semibold" />,
                                            }}
                                        />
                                    </li>
                                    <li>
                                        {t(
                                            'printInstructions.printAsIsTheArtworkIsAlreadyMirroredFor'
                                        )}
                                    </li>
                                    <li>
                                        {t(
                                            'printInstructions.afterPrintingFlipThePieceOverToViewThe'
                                        )}
                                    </li>
                                </>
                            )}
                        </ul>
                    </div>
                ) : (
                    <>
                        {/* Start Color */}
                        <div>
                            <div className="font-semibold text-foreground mb-3">
                                {t('printInstructions.startWithColor')}
                            </div>
                            {tooManyColors ? (
                                <div className="text-muted-foreground text-sm p-3 rounded-lg bg-muted/30">
                                    —
                                </div>
                            ) : swapPlan.length && swapPlan[0].type === 'start' ? (
                                (() => {
                                    const sw = swapPlan[0].swatch;
                                    return (
                                        <div className="flex items-center gap-3 p-4 rounded-lg bg-primary/5 border-2 border-primary/30 shadow-sm">
                                            <span
                                                className="block w-8 h-8 rounded-md border-2 border-border flex-shrink-0 shadow-md"
                                                style={{ background: sw.hex }}
                                                title={sw.hex}
                                            />
                                            <span className="font-mono text-sm font-semibold text-foreground">
                                                {sw.hex}
                                            </span>
                                        </div>
                                    );
                                })()
                            ) : (
                                <div className="text-muted-foreground text-sm p-3 rounded-lg bg-muted/30">
                                    —
                                </div>
                            )}
                        </div>

                        {/* Color Swap Plan */}
                        <div>
                            <div className="font-semibold text-foreground mb-2">
                                {t('printInstructions.colorSwapPlan')}
                            </div>
                            {tooManyColors ? (
                                <div className="text-amber-600 text-sm p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                                    {t('printInstructions.tooManyColors', { count: colorCount })}
                                </div>
                            ) : swapPlan.length <= 1 ? (
                                <div className="text-muted-foreground text-sm p-3 rounded-lg bg-accent/5 border border-border/50">
                                    {t('printInstructions.onlyOneColorConfiguredNoSwapsNeeded')}
                                </div>
                            ) : (
                                <ol className="space-y-2">
                                    {swapPlan.map((entry, idx) => {
                                        if (entry.type === 'start') return null;
                                        return (
                                            <li
                                                key={idx}
                                                className="flex items-start gap-2 text-muted-foreground text-xs p-2 rounded bg-accent/5"
                                            >
                                                <span className="text-primary font-semibold flex-shrink-0">
                                                    {idx}.
                                                </span>
                                                <div className="flex-1 flex flex-col gap-1.5">
                                                    <div className="flex items-center gap-2">
                                                        <Trans
                                                            ns="printing"
                                                            i18nKey="printInstructions.swapToColor"
                                                            values={{ color: entry.swatch.hex }}
                                                            components={{
                                                                swatch: (
                                                                    <span
                                                                        className="inline-block w-4 h-4 rounded border border-border flex-shrink-0"
                                                                        style={{
                                                                            background:
                                                                                entry.swatch.hex,
                                                                        }}
                                                                    />
                                                                ),
                                                                color: (
                                                                    <span className="font-mono text-foreground" />
                                                                ),
                                                            }}
                                                        />
                                                    </div>
                                                    <div>
                                                        <Trans
                                                            ns="printing"
                                                            i18nKey="printInstructions.atLayer"
                                                            values={{
                                                                layer: entry.layer,
                                                                height: entry.height.toFixed(3),
                                                            }}
                                                            components={{
                                                                layer: (
                                                                    <span className="font-semibold text-foreground" />
                                                                ),
                                                                height: (
                                                                    <span className="font-mono text-foreground" />
                                                                ),
                                                            }}
                                                        />
                                                    </div>
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ol>
                            )}
                        </div>
                    </>
                )}

                <div className="text-xs text-muted-foreground p-3 rounded-lg bg-accent/5 border border-border/50">
                    <span>ℹ️</span>{' '}
                    <span className="italic">
                        {t(
                            'printInstructions.heightsAreApproximateAlwaysConfirmInYourSlicerBefore'
                        )}
                    </span>
                </div>
            </div>
        </CollapsibleCard>
    );
}
