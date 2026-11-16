# Image workflow screenshots

Captured from the running app with the supplied `FROM THE STAGE.png` reference (1024 × 1024). These show UI behavior, not a physical print or slicer result.

| Screenshot | What it demonstrates |
| --- | --- |
| [Live thresholds](01-live-thresholds.png) | Three colors, two colored triangle handles, boundaries 48 and 144, live preview. |
| [Multiple palettes](02-multiple-palettes.png) | SUNLU and ELEGOO checked together while the requested color count remains three. |
| [Filament matches](03-filament-matches.png) | Ten CIEDE2000 candidates for the red image color; closest on the left, selected match reflected in the image. |
| [Nozzle appearance](04-nozzle-appearance.png) | 100 × 100 mm comparison: 0.4/0.2 mm nozzles with 0.42/0.21 mm line widths. |
| [Vulnerability legend](05-vulnerability-legend.png) | Categorical overlay and separate flagged-area percentages. |
| [Region patching](06-patched-regions.png) | Proposed adjacent-color merges, unresolved counts, and per-comparison Apply. |
| [Restored project](07-restored-project.png) | The portable session reopened in a fresh browser context. The capture script checks that visible pixels match the saved session. |

To reproduce with an image you may publish, start the app locally and run:

```sh
KROMACUT_TEST_URL=http://127.0.0.1:5186 \
KROMACUT_REFERENCE_IMAGE=/absolute/path/to/reference.png \
KROMACUT_ARTIFACT_DIR=docs/pr-images/image-workflow \
node scripts/capture-image-workflow.mjs
```

The capture uses a black/red/cream palette (`#101010`, `#af302e`, `#f4e6b8`), then previews the closest reference filaments. Nozzle estimates are geometric approximations: they do not calculate toolpaths or optical blending. The source image and saved session are not required by automated tests; their fixtures are generated independently.
