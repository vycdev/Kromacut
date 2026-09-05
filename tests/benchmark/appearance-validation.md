# Offline Matrix end-to-end validation

This developer-run benchmark evaluates photographed Matrix observations through the public
supported-prefix predictor and appearance resolver. It does **not** change normal prediction,
optimizer ranking, fit acceptance gates, profiles, or application settings. No printer is needed
to run it. It is separate from optimizer quality/performance benchmarks and Playwright UI tests.

```sh
npm run benchmark:appearance -- --input tests/assets/performance/8-colors-frontlit-2026-08-26/profile.kfil --out .agents/matrix-validation-run1
```

Alternatively, pass a desktop Auto-paint diagnostic `.jsonl` file, or an exported `.kapp`/`.kfil`
profile. The trace supplies its recorded filaments, appearance evidence, and process settings;
the source image and optimizer result are not used as ground truth. Select `--run N` (zero-based)
if the trace contains several runs, or `--profile ID` if an export contains several profiles.
Legacy profile input uses the same in-memory parser/migrations as the app and is never saved back.

`--out` must name a **new** directory. The command writes `report.md` and a detailed `report.json`,
refusing existing output directories. Use an ignored directory such as `.agents` or `.profiles`;
reports include sample/filament IDs, measurements, and the input path and are not automatically
published or committed. `--help` lists every option. Profiles with several Matrix layer heights
require `--layer-height`; otherwise the recorded height is used. The default reporting threshold
is ΔE00 10, configurable with `--delta-e`. This threshold only counts validation errors and never
changes prediction or matching. Four folds are used by default; `--folds` allows 2–10.

## What gets withheld

- **Recipe:** identical full physical recipes (including backing, thicknesses and contiguous-run
  normalization) stay together across all boards. Each recipe is tested once against a model
  rebuilt without any of its observations. Familiar/unfamiliar ordered-pair summaries are separate;
  this is unseen-recipe testing, not a guarantee that every query is thickness interpolation.
- **Interaction:** groups are the final ordered substrate/foreground pair. When a pair is held
  out, every training recipe containing that pair **anywhere** is purged, not just recipes ending
  in that pair. This tests harder pair generalization. Several pairs may be withheld together and
  training is smaller than in recipe folds, so the two scores are not a controlled one-variable
  comparison. Foundation-only recipes have no interaction and are not scored in this scenario.
- **Board/photo:** whole groups are withheld, allowing repeat-measurement checks on other boards.
  Exact duplicate boards and matching photo names stay together. Without session metadata, distinct
  board IDs are only proxies for independent prints/photos. With one group this scenario is skipped,
  with **null** scores rather than an invented perfect score.

For known sessions, `--sessions sessions.json` accepts an object such as
`{"matrix-id-1":"print-photo-session-A","matrix-id-2":"print-photo-session-A","matrix-id-3":"print-photo-session-B"}`.
Assign every included Matrix. Keep repeated photos of the same physical print together, even if
their filenames differ. Matching photo names and duplicate boards are still merged as safeguards.

Every fold starts with only training observations: the physical fit and its internal acceptance
validation, pair support, Matrix weights/recency/agreement, empirical coordinates, coverage radii,
conditional LUT validation and exact anchors are all rebuilt. Historical preview coordinates are
recomputed from fixed priors in temporary copies, so stale full-data predictions cannot leak in
when the optical fit falls back. Withheld and purged observations are absent from these copies.
This is an outer evaluation of the existing deployed fit-selection policy, not a replacement gate.

The `matrix-end-to-end-v2` report passes the original physical layer sequence, including each
foundation and recipe layer, to appearance lookup. Coalesced material runs are used only for
duplicate grouping, interaction holdouts, and the compact recipe display. Earlier v1 reports
could miss fixed-depth Matrix evidence by passing those compact runs to lookup; rerun both
revisions with the same corrected validator before comparing full-pipeline scores.

## Scope and interpretation

The benchmark validates the **complete Matrix pathway conditional on fixed filament/wedge
priors**. Wedge data is independent input, not part of these holdouts. If someone adjusted swatch
colors or wedge values using the withheld Matrix, that provenance must be disclosed; the benchmark
cannot undo such manual leakage. All Palette Proof judgments/sessions are excluded from training
and scoring because their source photographs/print sessions cannot reliably be linked to Matrix
observations. Human preference judgments are also not measured RGB truth.

Normal Matrix compatibility rules are reused. Reference-corrected boards are excluded because their
photographed values were adjusted toward simulator predictions; incompatible, unmeasured and
explicitly unverified boards are also excluded. This affects evaluation copies only, not the profile.

Three predictions are compared with **the same held-out photograph measurements**:

1. `baseline`: nominal swatches and fixed wedge/HD prior, without Matrix learning.
2. `physical`: training-only Matrix optical fit, including deployed support limits and continuation.
3. `full`: that physical prediction plus training-only empirical lookup and measured recipe anchors.

The report gives unweighted sample mean, median, p90/p95, worst ΔE00 and counts inside the reporting
threshold. It also records improved/regressed counts, pair-level summaries, exact-match counts,
fold membership/purges, fit gates/fingerprints, per-sample predictions, contributor IDs and actual
run thicknesses inside/outside fitted support. Confidence is logged for diagnosis, not used to
weight away bad predictions or presented as a probability. A full-pipeline score worse than baseline
is a result to investigate, **not** a reason for the benchmark to fail or hide the fold.

Physical layers and any estimated backing-transfer or measured-prefix-continuation provenance
are also retained per sample. These use only the training copies; a held-out sample cannot become
its own anchor or continuation source.

One photographed Matrix can test prediction of unseen recipes under that photograph's conditions.
It cannot measure camera accuracy, lighting robustness, cross-print repeatability, or the true color
of an unprinted optimizer-selected stack. Large errors with good average improvement still matter.
Do not tune against the held-out data and continue calling that same result independent validation;
reserve fresh boards/sessions or a separate untouched test set for subsequent model comparisons.

## Before spending filament

1. Verify leakage/pipeline regression tests, review worst cases and compare physical versus full
   errors. Establish whether the next change concerns a software bug, interpolation, or unsupported
   combinations. Keep benchmark results separate from claims of improved physical accuracy.
2. Freeze the chosen model revision, profile and layer/backing settings. Record predictions **before**
   printing a small set of diagnostic recipes: disputed pairs/thicknesses, a known reference, and
   repeats where useful. Nearby thicknesses help distinguish competing model explanations.
3. Print and photograph those patches together under consistent light. Keep their first measurements
   out of calibration until predictions have been scored. Afterwards they can become new evidence;
   do not reuse the resulting in-sample score as a generalization claim.
4. Use a full-image print as a later acceptance check for both color and printable detail. It does
   not replace the controlled patch comparison.

There is no requirement to buy a calibration chart for this first benchmark or initial repeatability
test. A camera comparison remains a camera comparison; independent measurement control is a separate
improvement, not something these scores silently assume.
