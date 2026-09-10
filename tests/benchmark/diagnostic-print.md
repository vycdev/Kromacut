# Frozen diagnostic print strips

This developer-run workflow prepares a physical experiment, not an optimizer benchmark. It fits
the **full** profile from one desktop diagnostic run, records predictions and complete recipes,
then exports separate 3MF thickness strips. It never changes application state or calibration.

```sh
npm run diagnostics:print -- --input path/to/trace.jsonl --design tests/benchmark/diagnostic-print-hope.json --out path/to/NEW-bundle
```

The example design targets the September 5 HOPE experiment with 0.08 mm regular layers and a
0.40 mm first model segment. The printed experiment used a 0.16 mm slicer first layer followed
by three 0.08 mm layers to fill that segment. This preserves its material boundaries; slicer
layer numbers differ from model layer numbers. It is **not a universal profile preset**.
A–C reproduce that print's complete orange,
cyan and white backing stacks; D–H compare simpler foundations; I–J repeat measured Matrix
recipes. Use a matching trace or create an explicit design for another experiment. A filament
color must identify exactly one filament; missing or ambiguous swatches are rejected.

`backing[].layers` counts physical layers, including the first layer in the first run.
`"opaque"` is allowed only for the first run and rounds the current model's 95% opacity floor
up to the layer grid. It is a model assumption, not a measured opacity guarantee. `topLayers`
lists the number of regular foreground layers on each pad, left to right. Zero exposes the full
backing, and duplicate counts provide repeat pads. The complete recipe includes every deeper
filament run. Known Matrix references preserve total filament thicknesses and explicitly warn
if the first-layer schedule changed or the foundation is below the model's opacity assumption.
They test repeatability/transfer, not independent prediction accuracy.

The output includes:

- A numbered HTML map, print instructions and one physical-material 3MF per stack family.
- The full profile, input trace, fitted model, predictions, contributor details and layer recipes.
- A source archive including uncommitted source, Git revision/diff, dependency lock and hashes.
- Serialized-3MF checks for closed meshes, winding, volume, pad-centre layer coverage, exact
  heights and material assignments. These do not replace inspecting the sliced toolpaths.
- A SHA-256 manifest written **last**, marking a complete pre-print bundle. Missing manifest
  means incomplete output; use a new directory for a retry. Existing directories are refused.
- A standalone `verify-bundle.mjs` integrity checker: run `node verify-bundle.mjs` in the bundle.
  Optional `traceMatches` in the design verify that designated pads exactly reproduce the
  recorded target stacks; old and fresh predictions are retained separately in the checks.
- An observations template to **copy outside** the frozen bundle before filling in results.

Choose only the strips needed to answer the current question; completing every family is not
required. One strip per print job keeps the swap count manageable.
Orientation is a top-left notch, and pad numbers are on the map rather than embossed on sample
surfaces. Measure the pad centres, never the gaps or first-layer margins. Preserve dimensions,
relative part heights and the layer grid. Verify the slicer's imported filament assignments.

The exporter embeds only generic slicer placeholders, not the user's printer/spool presets.
Actual temperatures, flow, nozzle, line width, speeds, infill direction, cooling and purge settings
are not recoverable from an Auto-paint trace. Record them and save the slicer project/output before
printing. Keep these settings fixed when comparing backing recipes or model revisions.

No photo is imported and no measured color is inferred. Photograph cooled strips under consistent
lighting and preserve original photos. Record observations before revealing the map's predicted
swatches; compare repeat pads first. Phone photographs alone are not absolute colorimetric truth.
Do not feed the results back into calibration until predictions, actual recipes, process settings
and repeatability have been checked.

## Replay predictions after a model change

```sh
node --no-warnings --experimental-strip-types scripts/replay-diagnostic-predictions.ts --bundle path/to/frozen-bundle --out tmp/NEW-replay --observations path/to/notes.md
```

The optional notes file records qualitative observations without turning photographs or visual
comparisons into measured RGB values. The command verifies the frozen manifest, refits the full
saved profile through current production code, and writes separate JSON and Markdown reports.
Run from the repository root with an existing output parent inside the workspace. Notes are
annotations excluded from fitting. Source changes during a replay are rejected.
It pins model-derived opaque foundations to their original printed layer counts and checks all
physical recipes, dimensions, and designated portrait matches before comparing predictions.
The original bundle and calibration remain unchanged, and an existing output directory is refused.

Appearance lookup receives each physical layer at its actual thickness. Coalesced filament runs
remain in the readable recipe table, but cannot stand in for a fixed-depth Matrix layer recipe.
Replay colors are retrospective predictions; the original pre-print predictions remain the
experimental record. Reusing a saved measured recipe checks evidence handling and repeatability,
not independent prediction accuracy. Use the training-isolated appearance benchmark for that.
