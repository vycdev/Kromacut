---
title: Reducing Colors
slug: reducing-colors
order: 40
description: Understand the two-stage reduction pipeline, fixed palettes, and the difference between recoloring and transparency.
---

# Reducing Colors

Quantization replaces many source colors with a smaller set, simplifying regions used by Manual and Auto-paint 3D workflows. A 2D palette contains target image colors, not an Auto-paint filament profile or measured print predictions.

Crop and resize first. If you changed [image adjustments](image-adjustments), click Apply in that panel before quantizing.

## The Two-Stage Pipeline


**Algorithm Weight** and **Number of Colors** do different jobs. K-means with Weight 128 first groups the source into up to 128 colors. Auto with Number of Colors 16 then merges that result to at most 16. Weight is not a percentage, opacity, or filament count.

| Field or action                        | Meaning                                                                                                                                            |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Palette: Auto                          | Finds image-dependent colors, then limits their count.                                                                                             |
| Palette: built-in, supplier, or custom | First reduces to the requested count, then matches the enabled colors from all checked palettes using Delta E00. Matches may merge. |
| Number of Colors | Final upper limit before palette matching: 2 to 256, default 16. Editable with any palette selection. |
| Algorithm Weight                       | Intermediate palette budget: 2 to 256, default 128. A larger value usually retains more intermediate detail, not necessarily a better final match. |
| Algorithm                              | First-stage reduction method. Default: K-means.                                                                                                    |
| Apply                                  | Processes the underlying image and creates an Undo step. Changing a setting alone does not recolor it.                                             |
| Reset arrow                            | Restores Auto, 16 colors, Weight 128, and K-means. It does not restore an earlier image.                                                           |

Output can contain fewer colors than requested. Raising the target after reduction cannot recover discarded colors: **Undo** first to compare alternatives from the same source.

Quantization preserves fully transparent pixels but makes **all partially transparent pixels fully opaque**. A soft alpha edge is not a partially printed edge.

## Choose An Algorithm

These methods group colors. None adds a spatial dither pattern or guarantees that a small feature will survive your nozzle's line width.

| Algorithm               | What changes                                                                                                    | Useful comparison                                                                                    |
| ----------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| None (postprocess only) | Skips the first-stage quantizer; Weight is disabled. Final count reduction or fixed-palette mapping still runs. | Directly map clean artwork to a known palette. It is not a universal “leave image unchanged” switch. |
| Posterize               | Divides RGB channels into discrete steps, then enforces Weight.                                                 | Deliberately stepped graphics; available channel levels change in discrete jumps.                    |
| Median-cut              | Splits the color distribution into buckets represented by average colors.                                       | Compare when another method loses an important tonal group.                                          |
| K-means                 | Finds pixel-count-weighted color clusters using random initialization.                                          | A starting point for photos and mixed artwork. Runs from the same source can differ slightly.        |
| Wu                      | Uses color-distribution statistics to choose divisions with less within-group variation.                        | Compare on gradients and photographs.                                                                |
| Octree                  | Groups colors through RGB subdivisions and combines groups to fit the budget.                                   | Compare on artwork with many distinct regions.                                                       |

There is no universally best algorithm. Inspect the subject, small lettering, and important accents at the intended physical size.

## Fixed And Supplier Palettes

Check one or more palettes to restrict the output to their combined enabled colors. After first-stage reduction, the image is reduced to the requested color count, then matched using CIEDE2000. Multiple target colors may choose the same filament, producing fewer colors. This is image-color matching, not filament optical simulation.

**Supplier Palettes** are unofficial reference sets of filament names and advertised hex colors. They do not guarantee current product availability or printed-color accuracy. For example, Bambu reference colors use [Bambu Lab's filament hex chart](https://store.bblcdn.com/s7/default/1084369ef84345bbaa5d704a492954e0/Bambu_PLA_Basic_Hex_Code.pdf). Kromacut is not affiliated with or endorsed by manufacturers.

Built-in and supplier palettes are read-only. Clone one to customize it. Use [filament calibration](calibration-theory) separately for actual spool and layer behavior.

## Custom Palettes

| Control                 | What to do                                                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Create new palette      | Name it and add at least one enabled valid color. It becomes selected.                                                                     |
| Edit selected palette   | Changes a custom palette, not current image pixels. Apply quantization afterward.                                                          |
| Add color               | Adds a picker, hex field, and optional name. Valid entries use `#RGB` or `#RRGGBB`; invalid rows are omitted on Save.                      |
| Optional color name     | Labels a color, for example a spool name. It does not change matching.                                                                     |
| Eye toggle              | Disables a saved color without deleting it. At least one valid color must remain enabled.                                                  |
| Remove row              | Deletes the row; you cannot remove the last row.                                                                                           |
| Clone                   | Copies a non-Auto palette to an editable custom palette, preserving names and disabled flags.                                              |
| Import                  | Reads a `.kpal` file and reports imported, overwritten, duplicate, or renamed entries. Selects the first imported palette when applicable. |
| Export                  | Saves the selected custom palette as `.kpal`, including names and disabled colors. Clone built-ins first to export an editable copy.       |
| Delete selected palette | Removes the saved palette and returns its selection to Auto. Does not erase image pixels.                                                  |
| Save / Cancel           | Commits or discards the editor draft.                                                                                                      |

A selector label such as **My Spools (5/8)** means five enabled colors out of eight saved entries. Only enabled colors participate. Palettes and the selection are saved locally; export backups before clearing app/browser storage. They are separate from [filament profiles](settings-and-controls#filament-profile-files).

## Image Colors

Image colors describes the underlying image, not live unbaked adjustments. Its badge excludes fully transparent pixels. Tooltips show hex, alpha, and pixel count. Different alpha values can create separate entries with the same RGB. Very colorful images have a bounded displayed list rather than every photographic color.

Click a swatch for **Edit Color**. Use the RGBA picker or hex field, then Apply. Six-digit hex changes RGB while retaining the picker's current alpha; eight-digit hex explicitly includes alpha. Use the transparency control or an explicit alpha suffix when opacity matters.

![Opaque replacement recolors every exact match, alpha zero removes those pixels, and Delete remaps colors rather than cutting holes.](35_swatch_operations.svg)

| Action                          | What changes                                                                                                                                                 |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Apply an opaque color           | Replaces every exact RGB-and-alpha match throughout the image, including disconnected regions.                                                               |
| Apply fully transparent alpha   | Removes exact matching pixels from the visible image and printable silhouette. Matching subject pixels disappear too.                                        |
| Apply to the transparent swatch | Replaces all fully transparent pixels, potentially adding a background or filling holes.                                                                     |
| Delete                          | Requantizes using the remaining target palette. It does **not** erase pixels. The selected first-stage algorithm still runs, so other colors can change too. |
| Close / Escape                  | Discards the uncommitted edit.                                                                                                                               |

Choose **None (postprocess only)** before Delete for direct mapping to the remaining palette. Use [Fill or Eraser](loading-images#touch-up-pixels) for a local change. Undo if more of the image changes than intended.

Manual swap instructions are disabled above 64 nontransparent colors. A smaller palette can simplify the stack even below that limit, but fewer targets do not automatically mean fewer Auto-paint filament changes.

Next: [Dedithering and cleanup](dedithering-cleanup).

## Live Brightness Thresholds

Use **Color thresholds → Edit thresholds**, directly below **Image colors**, in 2D mode for explicit brightness bands. Choose 2–64 colors; N colors give N−1 triangle handles. Drag a triangle or enter its 0–255 boundary numerically. A pixel at the boundary belongs to the next band. Colors are assigned by luminance. Output colors are automatically ordered darkest to lightest when loading palettes or editing colors; threshold positions remain fixed. Handles cannot cross. Changing the color count evenly redistributes the boundaries.

The preview updates during dragging (downsampled for large images). **Apply thresholds** processes the full-resolution working image as one undoable edit. **Cancel** (or Escape) preserves it, including when Apply is still running. The editor captures current preview adjustments and filament choices automatically. Alpha values, including partially transparent pixels, are preserved. Start from the original image when comparing different threshold choices, using Undo after applying. Continue directly to Manual 3D mode; further quantization can change the regions. Some bands may be empty, or identical selected colors may merge, so check the generated swap plan.

While quantizing or dedithering, image imports, threshold editing, filament Apply and nozzle comparison are unavailable. Wait for processing to finish before starting another edit; pending edits from an earlier image or processing state are discarded.

**Cached palettes**

Successful color reduction and threshold Apply automatically save the resulting palette locally. Identical color sets are reused regardless of order. Find them under Custom palettes, where they can be renamed, exported or deleted. The threshold editor also has a Saved / brand palettes selector; choosing a palette with a different color count resets the thresholds to even spacing. Cancel does not cache an unapplied draft. This saves colors, not the source image or threshold positions.

**Windows images in WSL**

Windows Explorer file drops may not reach the WSLg window. Use Open Windows path: in Explorer, choose Copy as path, paste it, and press Open image. Drive paths are converted to their mounted /mnt/ locations. Alternatively use the normal file picker under /mnt/c, /mnt/r or /mnt/s. Network shares must be mounted first.

**Filament references and recommendations**

Supplier palettes include Bambu Lab PLA Basic, Polymaker Panchroma Basic PLA, selected Prusament PLA/PETG colors, SUNLU PLA Classic and ELEGOO PLA (community RFID). SUNLU values come from its official color table; ELEGOO values are community-transcribed RFID references reported by PandaWorks, labeled accordingly in palettes and results. Their published hex values are color references, not a guarantee of appearance, availability, or a calibrated layer-blending model. The Prusament selection omits transparent and most effect colors; listed opaque alpha suffixes were removed. Data sources and retrieval dates are recorded alongside the catalog.

Below Color thresholds, use Filament color recommender to click image swatches (up to 32 selected). Filter by brand and material (PLA initially), then compare the ten closest individual filament colors for each target, as ten small swatches in a popup above the clicked image color, closest on the left. Hover for filament details; click a match to select it and show its name below. ΔE00 is perceptual color difference; lower is closer. There are no invented percentage accuracy scores. A closest match can still be poor. The recommender does not model opacity, gloss, lighting, thickness or multi-layer mixing. Choose a candidate for each target and Save matched palette to create a reusable custom palette with filament names. No image colors or print settings are changed by saving. Different targets can share one matching color, reducing the saved palette's size.

Saved / brand palettes in the threshold editor includes these brand palettes. Colors remain ordered dark to light.

In the recommender, only the color whose popup is open is highlighted. Clicking another preview swatch switches that popup; clicking it again closes it. Choosing a filament updates that swatch in the palette preview above Select top colors. Clicking the chosen filament again deselects it and restores the source color. Select top colors explicitly replaces every choice with its closest available match, including earlier manual choices. Clear selection resets all choices. The preview covers up to 32 most frequent image colors.

The brand menu has checkboxes: choose several companies to rank their colors together. Unchecking all companies gives no matches. Brand or material changes clear previous choices; use Select top colors to regenerate them. Save matched palette is available once each displayed image color has a choice. Filament choices also update the large image preview live; clearing choices restores its source colors. Use Apply to image to commit the preview before exporting or building 3D; the edit supports Undo. Any pending image adjustments are included when applying. Saving a palette alone does not commit the image.

Edit thresholds automatically starts from the current image palette, including live filament choices, ordered darkest to lightest. It refreshes that palette on each opening. Duplicate colors merge; above 64 distinct colors, the most frequent source colors supply up to 64 bands. A single-color image uses two identical bands. Boundaries are redistributed only when the band count changes.

**Nozzle and size comparison**

In 2D, open Compare nozzle sizes to inspect two nozzle/print-size combinations side by side, without slicing, optimization or mesh generation. The comparison captures the current image preview, including filament choices and adjustments. It crops transparent margins, keeps the image aspect ratio, and starts from the saved 3D pixel size. Print width and height describe that cropped artwork. Link dimensions keeps both comparisons at the same size; uncheck it to compare different dimensions. Use current 3D size restores the starting dimensions. Comparison controls do not change the image or saved print settings. Apply patch to image explicitly commits the selected cleanup to the image used for later model generation.

Nozzle selection initially estimates line width as 1.05 times its diameter (0.42 mm for a 0.4 mm nozzle). Enter the intended slicer line width for a more relevant comparison; nozzle diameter alone does not determine deposited width. Highlight vulnerable regions marks connected color regions with no interior large enough for the chosen line footprint: amber means a wider neighboring region exists, pink means none does. Choose Original image to view the original colors. The percentage counts flagged visible pixels, not predicted print accuracy or failure probability. The warning overlay alone does not change any source pixels.

Preview analysis runs in background workers and reuses recent results. The longest preview edge is limited to 1024 pixels. Sampling scale is shown; results under two preview pixels per line width are marked undersampled. Reduce the palette before analysis for more useful results.

This is a connected-region screening tool. It does not inspect thin branches attached to a wider region, layer stacks, optical blending, extrusion compensation, or adaptive-width toolpaths. Unmarked regions are not guaranteed printable. Compare actual sliced previews before printing. References: [Prusa minimum feature guidance](https://help.prusa3d.com/article/modeling-with-3d-printing-in-mind_164135) and [Arachne variable-width perimeters](https://help.prusa3d.com/article/arachne-perimeter-generator_352769).

## Image History Shortcuts

Ctrl+Z undoes the last applied image edit; Ctrl+Shift+Z redoes it (Cmd works on macOS too). These are the same actions as the toolbar buttons. Text fields retain normal text undo, and modal drafts/crop/active processing do not trigger image undo behind them. Live filament choices and unfinished threshold edits enter image history only when applied.

**Estimated nozzle appearance and legend**

The nozzle comparison now opens in Estimated printed appearance, with 0.4 mm and 0.2 mm nozzles (initial line widths 0.42 and 0.21 mm). Changing nozzle, line width or physical dimensions updates the displayed colors and boundaries, not just warning marks. Original image remains available for comparison. The approximation finds pixel-grid interior points with clearance for half the line width and reconstructs color areas from the nearest surviving interior points. Thin regions and attached narrow features can lose their color; boundaries can round or simplify. Source alpha, silhouette and RGB palette are retained. If no usable interior survives, it reports that no estimate is available instead of inventing a result.

This is a geometric color-region approximation, not calculated perimeters or infill. It does not simulate extrusion flow, adaptive-width paths, layer overlap, translucency or actual printed surface texture. Pixel sampling limits accuracy, especially below two samples per line width. The changed-area percentage measures differences from the input, not predicted printing failure.

Highlight vulnerable regions is a separate categorical overlay. A flagged connected region has no interior broad enough for the selected line width. Amber has a wider neighboring region; pink has no wider neighbor. Dimmed source colors are unflagged. These categories are not low and high severity, so there is no severity gradient. The flagged-area percentage is not a failure probability, and this connected-region warning can miss thin branches attached to larger regions. The appearance reconstruction and warning overlay answer different questions and need not mark identical pixels.

**Patch vulnerable regions**

Enable Patch vulnerable regions to preview cleanup for both comparisons. Each flagged connected color region is recolored as one group using an edge-adjacent wider region. The closest perceptual color (CIEDE2000) wins; equal distances prefer the longest shared boundary, then a stable RGB order. Only original unflagged neighbors qualify: there are no cascading merges, no jumps across transparent gaps, and no new palette colors. Regions with no suitable neighbor remain and are counted as unresolved. Transparency, silhouette and unflagged pixels are preserved. Thin branches attached to wider regions are not detected by this whole-region analysis.

Patched image shows the exact proposed color merges at preview resolution. Estimated printed appearance and Highlight vulnerable regions are recalculated from the patched image; Original image always shows the captured source. Turning the toggle off or closing the comparison does not edit the image. Apply patch to image under either comparison recomputes its cleanup at full source resolution, including transparent margins, and commits one undoable edit. Ctrl+Z undoes it; Ctrl+Shift+Z redoes it. Existing preview adjustments and filament choices are baked into an applied result. A reduced preview may differ from the full-resolution application.

Apply uses that comparison's width and line width to decide which regions to merge; it does not change the saved 3D dimensions or slicer settings. Use matching dimensions when generating the model. This cleanup is a design edit based on a geometric estimate, not a guarantee of printability.

**Save and reopen a Kromacut project**

Use the Project controls below the 2D/3D tabs. Name the project and choose Save project to create a `.kromacut` file. Open project loads it later, after confirming replacement of the current session. Save your current work first if you want to keep it.

The file embeds PNG copies of the current image and its undo/redo history, so original source paths are not required. It also stores adjustments, quantization algorithm and color count, snapshots of every selected palette, current filament recommendation filters and choices, nozzle comparison settings, print dimensions, manual color order and layer heights, and Auto-paint filament/settings state. Restored palettes are merged into your library without overwriting unrelated palette IDs. Applied threshold and patch edits are already part of the image history. Unapplied modal drafts, generated mesh/optimizer results, and the camera's exact position are not included. Rebuild 3D Model before exporting a reopened project.

The native app offers a save-file dialog; the browser downloads the same format. Open project uses a file picker. The format is versioned and validates all settings and embedded images before changing the session. Limits: 256 MiB project file, 512 MiB expanded archive, 200 unique history images and 25 million pixels per image. Invalid or newer unsupported files leave the current session intact.
