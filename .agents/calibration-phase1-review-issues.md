# Phase 1 review — issues to fix before Phase 2

> **Status: ALL RESOLVED (2026-07-02).** All six issues below were fixed in the
> follow-up changes (calibration sanitizer + load-path stripping, first-layer-aware
> base height, STL swap instructions, `basis: 'frontlit'` rename, per-row calibrate
> button with reset-on-open, changelog cleanup). Verified: 224 tests pass, tsc and
> eslint clean. Kept for history; Phase 2 is unblocked.

Review of commits `354f736` (frontlit opacity-read calibration) and `bd4fa71` (Load TD
Test button removal) against the plan in
[calibration-improvements.md](calibration-improvements.md). The core fit
(`solveOpacityTransmission`, `computeFrontlitCalibration`, `deriveChannelTds`), the
dialog flow, the 3MF slot mapping, and the round-trip tests all match the plan and are
in good shape. The issues below are ordered by severity; #1 and #2 are blockers for
calling Phase 1 done.

---

## 1. HIGH — Old persisted calibrations are not stripped on load, and now bypass the frontlit scale

The plan requires: "old `CalibrationResult` fields are simply **ignored/stripped on
load**." That stripping was never implemented — the commit touched no persistence code.

Three load paths pass `filament.calibration` through untyped/unvalidated:

- `loadProfiles()` — [profileManager.ts:17-30](../src/lib/profileManager.ts#L17-L30)
  (localStorage `kromacut.autopaint.profiles`)
- `importProfiles()` filament validation — [profileManager.ts:165-168](../src/lib/profileManager.ts#L165-L168)
  (`.kfil` / profile JSON import; only checks `id`/`color`/`td`)
- `loadAutoPaintPersisted()` — [App.tsx:108-142](../src/App.tsx#L108-L142)
  (localStorage `kromacut.autopaint.v1`, `parsed.filaments` used as-is)

Why this is actively harmful, not just cosmetic: the old `CalibrationResult` shape
(`{ measurements, whiteReference, td: [r,g,b], tdSingleValue, confidence,
calibrationDate }`) survives a JSON round-trip and **structurally satisfies the two
runtime checks that matter**:

- `scaleFilamentForFrontlight()` ([autoPaint.ts:411-419](../src/lib/autoPaint.ts#L411-L419))
  skips the `FRONTLIT_TD_SCALE = 0.1` fallback for any truthy `calibration`.
- `calibratedTdChannels()` ([autoPaint.ts:402-409](../src/lib/autoPaint.ts#L402-L409))
  only checks that `calibration.td` is a finite-positive array — which the old backlit
  fit also produced.

So a user with an old photo calibration gets their **backlit** TDs (~2–6 mm, which the
old pipeline multiplied by 0.1) fed into the simulation as if they were measured
frontlit TDs — roughly 10× too transmissive, silently, producing drastically wrong
layer stacks. The changelog says "recalibrate any previously calibrated filaments" but
nothing in code enforces or even detects it. `computeProfileConfidence()` and the
FilamentRow "calibrated" badge also accept the old object (it has `confidence` +
`calibrationDate`, and the old flow also set `td = tdSingleValue`, so the
`calibrationMatchesTd` guard passes).

**Fix:** add a single validator (e.g. in `calibration.ts`:
`sanitizeFrontlitCalibration(value: unknown): FrontlitCalibration | undefined`) that
accepts an object only if it matches the new shape — cheapest reliable discriminators
are `basis === 'black-frontlit'` plus finite `opacityLayers >= 1` (old shape has
neither) — and returns `undefined` otherwise. Apply it to `filament.calibration` in all
three load paths above. A defensive `basis`/`opacityLayers` check inside
`calibratedTdChannels`/`scaleFilamentForFrontlight` is cheap extra insurance since
worker inputs come from persisted state. Add a regression test: a profile JSON carrying
an old-shape calibration loads with `calibration === undefined` and the filament falls
back to the `FRONTLIT_TD_SCALE` path.

---

## 2. HIGH — Calibration print geometry ignores first-layer height, so patch layer counts are wrong when sliced

`baseHeight()` ([generateCalibrationPrint.ts:88-90](../src/lib/generateCalibrationPrint.ts#L88-L90))
is `baseLayers × layerHeight`, with a comment claiming "The slicer applies its own
first-layer height when printing, so this is just baseLayers worth of regular layers."
That reasoning is inverted: because the slicer's first layer is taller, the Z grid is
`firstLayer + n × layerHeight`, and a base built from regular layers only does NOT land
on that grid.

Defaults make it concrete: `layerHeight 0.08`, `firstLayerHeight 0.2` (and the embedded
3MF project sets `initial_layer_print_height = max(layerHeight, firstLayerHeight)` =
0.2, [generateCalibrationPrint.ts:571](../src/lib/generateCalibrationPrint.ts#L571)).
Slicer layer tops: 0.2, 0.28, 0.36, 0.44, … Base top: 5 × 0.08 = **0.40 mm — mid-layer**.
Every wedge patch top (0.40 + i × 0.08) is then also mid-layer. The slicer will
realize each patch with a color layer count that differs from the nominal patch number
(off by one, or with a partial base/color boundary layer), so the number the user reads
back does not correspond to `opacityLayers × layerHeight` of filament — the exact bias
the plan warned about ("Thickness must use the real layer-height model, not
`layers × layerHeight`").

**Fix:** make the base absorb the first layer:
`baseHeight = max(layerHeight, firstLayerHeight) + (baseLayers − 1) × layerHeight`.
Then the base top and every patch/rail top land exactly on the slicer grid (0.2 + 4×0.08
= 0.52; patches at 0.52 + i×0.08 ✓), and each color patch is exactly `i` regular
layers, which is what `computeFrontlitCalibration` assumes. Update the stale comment,
the `calibrationPrint.test.ts` expectations, and add an assertion that the base top and
patch tops are integer multiples of `layerHeight` above `max(layerHeight,
firstLayerHeight)`. Note the wedge/rail math itself needs no change — only the base
thickness.

This matters for both formats: the 3MF embeds the matching first-layer height itself;
for STL the dialog should tell the user which layer height AND first-layer height to
slice with (see #3).

---

## 3. MEDIUM — STL flow lacks concrete per-filament print/swap instructions

The plan specifies generated text instructions for STL ("load black, print to layer X;
swap to filament A"). What shipped is one generic sentence ("base, then swap to the
color above the base" — [FilamentCalibrationDialog.tsx:523](../src/components/FilamentCalibrationDialog.tsx#L523)).
Two concrete gaps:

- **No per-filament base reminder.** The Base step lets the user pick a different base
  per filament, and the TD fit uses that choice (`resolveBaseColor` →
  `computeFrontlitCalibration.baseColor`). At print time nothing shows which base goes
  with which filament; printing over the wrong base silently produces a wrong fit.
- **No exact swap point.** After fixing #2 the swap is well-defined: pause/swap after
  layer `baseLayers`, i.e. at Z = `max(layerHeight, firstLayerHeight) +
  (baseLayers − 1) × layerHeight`. Show the layer number and Z, plus "slice at layer
  height H, first layer F" so the user's slicer settings match the geometry.

A per-filament line in the Print step ("Red: base = Black, swap after layer 5 /
Z 0.52 mm") is enough; a downloadable .txt is optional polish.

---

## 4. MEDIUM — `basis: 'black-frontlit'` is hardcoded even for non-black bases

`computeFrontlitCalibration` always stores `basis: 'black-frontlit'`
([calibration.ts:224](../src/lib/calibration.ts#L224)) while also storing the actual
`baseColor`, which the base-picker feature lets be white or anything else. A
calibration over white then carries a self-contradictory record. This is a persisted
user-data field in a brand-new format — rename it **now**, before it ships, rather than
migrating later. Suggestion: `basis: 'frontlit'` with `baseColor` as the sole source of
truth (keep `baseColor` required rather than optional). If #1's sanitizer keys on
`basis`, update both together.

---

## 5. LOW — `initialFilamentId` preselect is dead and would be stale if wired

The only caller is `handleOpenCalibration()` with no id
([AutoPaintTab.tsx:490](../src/components/AutoPaintTab.tsx#L490)), so per-filament
preselect never happens. Even if an id were passed, the dialog captures
`initialFilamentId` in a `useState` initializer at mount
([FilamentCalibrationDialog.tsx:107-109](../src/components/FilamentCalibrationDialog.tsx#L107-L109))
and only re-reads it in `reset()`, which runs via a 300 ms `setTimeout` holding a
possibly stale closure — racing AutoPaintTab's own 300 ms reset of
`calibratingFilamentId` to null. Either delete the prop and the AutoPaintTab id
plumbing, or fix properly (sync selection in an effect when `open` flips true).

---

## 6. LOW — Stale changelog entry for the deleted photo sampler

`CHANGELOG.md` unreleased "Changed" still lists **"Calibration image sampler"**
(circular brush overlay) — a refinement to the photo wizard that this same unreleased
version deleted. Per AGENTS.md changelog guidance (entries classify against the last
release), remove that bullet; the frontlit-calibration "Added" bullet already covers
the replacement.

---

## Reviewed and explicitly OK (no action)

- Fit math: `T*` bisection over any base, `TD = -d/log10(T*)`, brightest-channel anchor
  in `deriveChannelTds` — all match the plan; round-trip tests recover synthetic TDs
  within integer-read quantization.
- The base-picker (vs the plan's fixed black base) is a sound generalization — the solve
  handles arbitrary bases and errors out on low contrast with a helpful message.
- Keeping `FRONTLIT_TD_SCALE` as the *uncalibrated-only* fallback rather than deleting
  it outright is a reasonable reading of the plan's "re-baseline the default."
- Overlapping closed shells in the STL (orientation foot into base, patches butting the
  rail): slicers union coincident shells within one solid; fine for a standalone
  calibration part.
- 3MF slot mapping to real profile filaments in profile order, no phantom base, no
  `<assemble>` block — matches the refined design and is test-covered.
- All 219 tests pass on the current branch.
