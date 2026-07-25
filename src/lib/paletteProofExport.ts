import type { FinalPrintableStackSnapshot } from '../types/appearance';
import { exportObjectTo3MFBlob } from './export3mf';
import { buildPaletteProofGeometry, disposePaletteProofGeometry } from './paletteProofGeometry';
import type { PaletteProofSpec } from './paletteProof';
import { validatePaletteProofSpec } from './paletteProof';

export interface PaletteProofExportOptions {
    onProgress?: (progress: number) => void;
    onZipProgress?: (progress: { percent: number; currentFile?: string | null }) => void;
}

export interface PaletteProofManifest {
    schemaVersion: 1;
    proof: PaletteProofSpec;
    finalStack: FinalPrintableStackSnapshot;
}

function assertValidProof(snapshot: FinalPrintableStackSnapshot, spec: PaletteProofSpec): void {
    const errors = validatePaletteProofSpec(snapshot, spec);
    if (errors.length > 0) {
        throw new Error(`Invalid Palette Proof specification: ${errors.join('; ')}`);
    }
}

export function buildPaletteProofManifest(
    snapshot: FinalPrintableStackSnapshot,
    spec: PaletteProofSpec
): PaletteProofManifest {
    assertValidProof(snapshot, spec);
    return {
        schemaVersion: 1,
        proof: spec,
        finalStack: snapshot,
    };
}

export function buildPaletteProofPrintInstructions(
    snapshot: FinalPrintableStackSnapshot,
    spec: PaletteProofSpec
): string {
    assertValidProof(snapshot, spec);
    const maxPrefixIndex = Math.max(...spec.cells.map((cell) => cell.prefixIndex));
    const usedLayers = snapshot.layers.slice(0, maxPrefixIndex + 1);
    const reinforcementLayers = spec.layout.reinforcementLayers ?? 0;
    const lines = [
        'Kromacut Palette Proof Print Instructions',
        '------------------------------------------',
        `Proof ID: ${spec.id}`,
        `Final stack: ${snapshot.fingerprint}`,
        `Coupon size: ${spec.layout.widthMm.toFixed(1)} x ${spec.layout.heightMm.toFixed(1)} mm`,
        `Sample spacing: ${
            spec.layout.gapMm === 0
                ? 'touching (no gaps)'
                : `${spec.layout.gapMm.toFixed(1)} mm gaps`
        }`,
        `Corner radius: ${spec.layout.cornerRadiusMm.toFixed(1)} mm`,
        `Layer height: ${snapshot.settings.layerHeight.toFixed(3)} mm`,
        `First layer height: ${snapshot.settings.firstLayerHeight.toFixed(3)} mm`,
        `Printed layers: ${usedLayers.length}`,
        ...(reinforcementLayers > 0
            ? [`Reinforcement grid: ${reinforcementLayers} layer(s) above the first layer`]
            : []),
        '',
        'Slicer setup:',
        '- Keep the coupon face-up and at 100% scale.',
        '- Use 100% infill and one perimeter/wall.',
        '- Confirm every 3MF layer part is assigned to the matching physical filament.',
        '- The missing corner is the top-left marker in the Kromacut patch map.',
        '- The target color row is screen-only and is not printed.',
        ...(reinforcementLayers > 0
            ? [
                  '- Reinforcement occupies only margins and trenches; sample squares keep their exact stacks.',
              ]
            : [
                  '- Touching active cells are joined per layer; every sample keeps its exact stack height.',
              ]),
        '',
        'Physical sequence:',
    ];

    let previousFilamentId: string | undefined;
    let sequenceIndex = 1;
    for (const layer of usedLayers) {
        if (layer.filamentId === previousFilamentId) continue;
        if (previousFilamentId === undefined) {
            lines.push(
                `${sequenceIndex}. Start with ${layer.filamentColor} (${layer.filamentId}) at layer 1.`
            );
        } else {
            lines.push(
                `${sequenceIndex}. Change to ${layer.filamentColor} (${layer.filamentId}) before layer ${
                    layer.index + 1
                } at Z ${layer.startHeight.toFixed(3)} mm.`
            );
        }
        previousFilamentId = layer.filamentId;
        sequenceIndex++;
    }

    lines.push('');
    lines.push('Patch references:');
    for (const column of spec.columns) {
        lines.push(
            `Column ${column.column + 1}: target ${column.targetColor.hex.toUpperCase()} (${column.targetMappingId})`
        );
        for (const cellId of column.cellIds) {
            const cell = spec.cells.find((candidate) => candidate.id === cellId);
            if (!cell) continue;
            const location =
                cell.physicalPatchId === 'foundation-reference'
                    ? 'foundation margin'
                    : `matrix cell ${cell.id}`;
            lines.push(
                `- ${cell.id}: ${location}, prefix ${cell.prefixIndex + 1}, ${cell.candidateRole}`
            );
        }
    }

    lines.push('');
    lines.push('View the printed top surface under the lighting used for normal evaluation.');
    return lines.join('\n');
}

export async function exportPaletteProof3MF(
    snapshot: FinalPrintableStackSnapshot,
    spec: PaletteProofSpec,
    options: PaletteProofExportOptions = {}
): Promise<Blob> {
    const geometry = buildPaletteProofGeometry(snapshot, spec);
    const manifest = buildPaletteProofManifest(snapshot, spec);
    const instructions = buildPaletteProofPrintInstructions(snapshot, spec);

    try {
        return await exportObjectTo3MFBlob(geometry.object, {
            layerHeight: snapshot.settings.layerHeight,
            firstLayerHeight: snapshot.settings.firstLayerHeight,
            onProgress: options.onProgress,
            onZipProgress: options.onZipProgress,
            metadataFiles: [
                {
                    name: 'palette-proof.json',
                    content: JSON.stringify(manifest, null, 2),
                    contentType: 'application/json',
                },
                {
                    name: 'palette-proof-instructions.txt',
                    content: instructions,
                    contentType: 'text/plain',
                },
            ],
        });
    } finally {
        disposePaletteProofGeometry(geometry.object);
    }
}
