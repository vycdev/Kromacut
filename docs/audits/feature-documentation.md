# Illustrated documentation coverage audit

Scope: nontrivial 3D and 2D features on `develop`, with 3D first. The implementation and its handlers are the authority, not older prose or screenshots. This inventory is for maintaining the guide; user-facing pages live in `src/docs`.

## Coverage inventories

- [3D controls](3d-feature-coverage.md): print dimensions, layer snapping, manual stacks, filaments, Auto-paint, geometry options, confidence, inspection.
- [Calibration](calibration-feature-coverage.md): HD wedge, Palette Proof, Stack Matrix, profile ownership, compatibility and evidence.
- [2D controls](2d-feature-coverage.md): loading, cropping, resizing, touch-up, adjustments, quantization, palettes, swatches and dedithering.

## Cross-workflow and export controls

| Feature / control                                                  | Authoritative implementation                                                             | User-facing coverage                                                      | Illustration / demonstration                                       |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Build, progress, Build Anyway / cancel                             | `src/components/ThreeDControls.tsx`, `src/App.tsx`, build handler                        | `3d-mode`, `generating-exporting-output`                                  | `40_build_export_snapshot.svg`                                     |
| Built snapshot vs current settings; instructions attached to build | `ThreeDControls.tsx` builtState instruction fields; `useAppHandlers.ts` last mesh export | `generating-exporting-output`                                             | `40_build_export_snapshot.svg`                                     |
| PNG download vs live adjustments                                   | `useAppHandlers.ts` onDownloadImage; `CanvasPreview.tsx` exportImageBlob                 | `loading-images`, `image-adjustments`, `faq`                              | 2D pipeline illustration                                           |
| STL / 3MF and physical materials                                   | `useAppHandlers.ts`, `exportStl.ts`, `export3mf.ts`                                      | `generating-exporting-output`, `flat-paint`                               | Built stack and flat orientation diagrams                          |
| Start color, swaps, Copy, no-swaps / too-many-colors state         | `PrintInstructions.tsx`, `useSwapPlan.ts`                                                | `generating-exporting-output`, `troubleshooting`                          | `41_swap_layers.svg`                                               |
| New-layer number vs boundary Z vs top Z                            | `useSwapPlan.ts` Auto-paint and Manual formulas                                          | `generating-exporting-output#print-instructions`                          | Exact 0.10 / 0.04 mm example in `41_swap_layers.svg`               |
| Layer Preview, shaded/color/physical choices not export edits      | Preview controls and last mesh export                                                    | `3d-mode`, `generating-exporting-output`                                  | Preview diagram plus `40_build_export_snapshot.svg`                |
| Desktop Save As, browser download, cancellation                    | `src/hooks/saveBlobToFile.ts` as called by export handlers                               | `generating-exporting-output`, `settings-and-controls`, calibration guide | Control table and written consequence; no invented geometry effect |
| Collapse, reset, splitter, 2D/3D navigation                        | `CollapsibleCard.tsx`, `App.tsx`, `PrintSettingsCard.tsx`                                | `settings-and-controls`, relevant control guides                          | Relevant before/after diagrams; state vs geometry explained        |
| Shared Undo/Redo image history, not printer-setting history        | `App.tsx` useImageHistory and preview callbacks                                          | `3d-mode`, `loading-images`, `settings-and-controls`                      | Explicit scope and rebuild warning                                 |
| Remembered settings vs profile backups                             | `printSettingsStorage.ts`, profile manager, Auto-paint storage                           | `settings-and-controls`, `calibration-workflows`                          | Evidence context diagram                                           |
| Experimental multi-plate has no print effect                       | `Header.tsx` experimental toggle and `App.tsx` animation-only branch                     | `settings-and-controls#experimental-multi-plate-mode`                     | Explicitly documented as no geometry effect                        |
| Theme / resources / update / diagnostics                           | `Header.tsx`                                                                             | `settings-and-controls`                                                   | Readable control reference, no claimed print effect                |

## Accuracy corrections identified by the code audit

- Algorithm Weight controls an intermediate quantization palette size, not generic effect strength.
- Source and adjusted preview are distinct; bake adjustments before workflows that consume the source.
- Deleting a swatch remaps the palette; erasure/zero alpha removes pixels.
- Resizing pixels can simplify geometry; changing mm/pixel alone cannot reduce mesh complexity.
- The 3D toolbar's Undo/Redo callbacks operate on image history.
- Preview trimming and display styles do not change the exported mesh.
- Auto-paint output being calculated is separate from building that output.
- A Max Height cap on appearance stacks is not an unconditional guarantee about the carrier-inclusive Flat Paint slab.
- Changing regular layer height affects empirical calibration eligibility. Matrix backing transfer and first-layer behavior must not be reduced to a blanket all-settings-equal rule.
- Confidence summaries, exact search labels and color-accurate rendering do not certify measured physical accuracy.
- Standard Auto-paint maps normalized image luminance to height; equal-brightness hues can share a height. Enhanced mapping considers image color.
- Height dithering redistributes fractional-height error when present. Already-discrete mappings may remain unchanged, so the illustration is explicitly conditional.
- Profile duplicate detection includes appearance evidence. Same-ID files without usable evidence do not erase an existing profile's measurements.
- HD is a frontlit model parameter; 10% modeled show-through at one HD is not an unconditional visual match threshold.
- A diagnostic trace records a new Auto-paint calculation, not a mesh build from an already-computed result.

## Verification gates

Completion requires source/control coverage review, actual rendered illustration inspection, docs navigation and image integrity tests, production build/static pages, responsive browser checks and lint. Passing structural checks alone is not evidence that prose or illustrations describe the implementation correctly.

- `npm run test:docs`: metadata, sidebar membership, cross-page anchors, local image existence and accessibility metadata.
- `node scripts/verify-doc-illustrations.mjs`: readable SVG labels, bounds, native-size renders and contact sheets in `test-results/docs-illustrations` for human/agent visual inspection.
- `npm run build`: TypeScript, bundled app and statically generated docs with image-file verification.
- `npm run test:e2e:docs`: every documentation route at desktop and mobile widths, loaded image counts, full-size links, direct anchor and keyboard navigation, mobile navigation collapse, and the static pages without JavaScript.
- `npm run lint`: project lint gate.

## Completion evidence, 2026-09-12

| Requirement                                      | Current evidence                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Inventory nontrivial 3D features first           | `3d-feature-coverage.md` and `calibration-feature-coverage.md` map the current controls, handler side effects, availability, output meaning, guide sections, and diagrams. Source cross-review corrected standard mapping, dithering, profile imports, and calibration scope.                                                        |
| Inventory and document nontrivial 2D features    | `2d-feature-coverage.md` maps loading, pixel tools, all twelve adjustments, quantizers, palettes, alpha editing, dedithering, and their downstream print effects.                                                                                                                                                                    |
| Complete missing practical guides in `src/docs`  | Four new guides: Auto-paint Controls, Flat Paint, Calibration Workflows, and Image Adjustments. Core 3D and 2D pages were rewritten; overview, quick start, export, settings, troubleshooting, and FAQ agree with them. The collection has 15 pages.                                                                                 |
| Explain effects, dependencies, and limits        | Tables and examples distinguish source edits, physical geometry, optical prediction, display-only controls, reset/persistence consequences, and slicer alignment. Existing 3D section anchors still resolve after the split.                                                                                                         |
| Provide useful, readable illustrations           | 27 local SVG schematics: 23 new and four redesigned calibration figures. Every SVG has accessible title/description metadata, at least 18px text at native size, and no text outside its viewBox. All four contact sheets and focused native/in-page renders were visually reviewed; spacing and misleading diagrams were corrected. |
| Make the guides usable in the app and on the web | 3D-first sidebar groups, full-size illustration links, and collapsible mobile navigation. Desktop and mobile page screenshots were inspected, including the final mobile layout and the Flat Paint/height-dithering figures.                                                                                                         |
| Verify current implementation                    | `npm run test:docs`: 3/3 pass. `npm run lint`: pass. `npm run test:e2e:docs`: 5/5 pass, including its fresh production build and static-page verification. `node scripts/verify-doc-illustrations.mjs`: all 27 pass. `git diff --check`: pass.                                                                                       |
| Stay on develop and preserve unrelated work      | Branch is `develop`. Existing candidate-print assets and unrelated `tmp` contents were not removed. No commit or push was performed.                                                                                                                                                                                                 |

Browser coverage visits every guide at 1440px and 390px, loads every documented image, checks layout bounds and full-size links, follows an anchor and keyboard navigation, exercises both mobile navigation panels, and visits every generated static page with JavaScript disabled. The production build retains the existing large-chunk warning; it completes successfully.

The source/control inventories are semantic evidence; structural tests do not independently prove the physical explanations. No printer settings, optical algorithms, or model/export geometry are changed by this documentation work. Generated QA captures are under ignored `test-results`, not published assets.
