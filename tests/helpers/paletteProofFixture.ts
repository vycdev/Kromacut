import type {
    CanonicalSrgbColor,
    FinalPrintableStackSnapshot,
    FinalStackPaletteEntrySnapshot,
    FinalStackTargetMappingSnapshot,
} from '../../src/types/appearance.ts';

function color(red: number, green: number, blue: number): CanonicalSrgbColor {
    const rgb = [red, green, blue] as const;
    const hex = `#${rgb.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
    return { space: 'srgb', encoding: 'uint8', whitePoint: 'D65', rgb, hex };
}

export function buildPaletteProofSnapshot(
    layerCount: number,
    targetCount: number = 8
): FinalPrintableStackSnapshot {
    const layers = Array.from({ length: layerCount }, (_, index) => {
        const predictedColor = color(
            (index * 47) % 256,
            (60 + index * 31) % 256,
            (180 + index * 19) % 256
        );
        return {
            id: `layer-${index + 1}`,
            index,
            filamentId: `filament-${index % 4}`,
            filamentColor: predictedColor.hex,
            startHeight: index === 0 ? 0 : 0.16 + (index - 1) * 0.08,
            endHeight: 0.16 + index * 0.08,
            thickness: index === 0 ? 0.16 : 0.08,
            zoneIndex: index,
            canonicalStackKey: `stack-v1-${index + 1}`,
            basePredictedColor: predictedColor,
            basePredictedLab: [15 + index * 12, -25 + index * 7, 30 - index * 5] as const,
            predictedColor,
            predictedLab: [15 + index * 12, -25 + index * 7, 30 - index * 5] as const,
            appearanceStatus: 'estimated' as const,
        };
    });
    const palette: FinalStackPaletteEntrySnapshot[] = layers.map((layer) => ({
        id: `prefix-${layer.index + 1}`,
        index: layer.index,
        layerId: layer.id,
        height: layer.endHeight,
        canonicalStackKey: layer.canonicalStackKey,
        basePredictedColor: layer.basePredictedColor,
        basePredictedLab: layer.basePredictedLab,
        predictedColor: layer.predictedColor,
        predictedLab: layer.predictedLab,
        appearanceStatus: layer.appearanceStatus,
    }));
    const weightTotal = (targetCount * (targetCount + 1)) / 2;
    const targetMappings: FinalStackTargetMappingSnapshot[] = Array.from(
        { length: targetCount },
        (_, index) => {
            const paletteIndex = layerCount === 0 ? 0 : index % layerCount;
            const entry = palette[paletteIndex];
            const targetColor = color(
                (20 + index * 23) % 256,
                (220 - index * 17 + 256) % 256,
                (40 + index * 29) % 256
            );
            return {
                id: `target-${index + 1}`,
                index,
                targetColor,
                targetLab: [20 + index * 8, -35 + index * 9, 40 - index * 6],
                usageWeight: (targetCount - index) / weightTotal,
                paletteIndex,
                paletteEntryId: entry?.id ?? 'none',
                canonicalStackKey: entry?.canonicalStackKey ?? 'none',
                projectedHeight: entry?.height ?? 0,
                predictedColor: entry?.predictedColor ?? color(0, 0, 0),
                predictedLab: entry?.predictedLab ?? [0, 0, 0],
                sampleContext: { geometryClass: 'unknown' },
            };
        }
    );

    return {
        schemaVersion: 1,
        fingerprint: `final-stack-${layerCount}-${targetCount}`,
        modelFingerprint: 'appearance-model-test',
        modelVersion: 'rgb-beer-lambert-v1',
        appearanceModel: {
            schemaVersion: 1,
            modelVersion: 'lab-rank-local-v7',
            fingerprint: 'appearance-rank-model-test',
            contextFingerprint: 'appearance-context-test',
            applied: false,
            gateReason: 'insufficient-evidence',
            deltaL: 0,
            logChromaScale: 0,
            confidence: 0,
            observationCount: 0,
            trainingObservationCount: 0,
            trainingDistinctStackCount: 0,
            noneCount: 0,
            distinctStackCount: 0,
            heldOutCount: 0,
            heldOutDistinctStackCount: 0,
            baselineAgreement: 0,
            fittedAgreement: 0,
            sourceProofIds: [],
            comparedStackKeys: [],
            exactAnchors: [],
            localEvidence: [],
            empiricalLuts: [],
        },
        settings: {
            layerHeight: 0.08,
            firstLayerHeight: 0.16,
            requestedMaxHeight: null,
            printableMaxHeight: layers.at(-1)?.endHeight ?? 0,
            transitionOpacity: 0.9,
            compressionRatio: 1,
        },
        totalHeight: layers.at(-1)?.endHeight ?? 0,
        truncated: false,
        layers,
        zones: [],
        swapSequence: [],
        palette,
        targetMappings,
    };
}
