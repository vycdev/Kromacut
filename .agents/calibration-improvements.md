# Calibration redesign — print-and-read-back

Status: design / detailed outline. Not implemented yet. Supersedes the earlier
photo-based outline in this file.

## Decision: scrap the photo-based calibration

The current system ([`src/lib/calibration.ts`](../src/lib/calibration.ts),
[`src/components/FilamentCalibrationWizard.tsx`](../src/components/FilamentCalibrationWizard.tsx))
asks users to photograph backlit patches and sample RGB. It is being **removed**:

- Hard to make accurate (lighting, white balance, monitor, single-pixel samples).
- Bad UX (cameras, color pickers, manual RGB entry).
- It measures *backlit* transmission, but prints are viewed *frontlit*, so the
  result is then mangled by a magic constant
  ([`FRONTLIT_TD_SCALE = 0.1`](../src/lib/autoPaint.ts#L395)).

## New shape (the big outline, with decisions made)

1. User selects one or more filaments from a profile and hits **Calibrate**.
2. App generates a **calibration print** (STL *or* 3MF + instructions) to download.
3. User prints it.
4. User **reads numbers off the physical print** and types them back into the app.
5. App fits a frontlit TD per filament and writes it onto the profile. Auto-paint
   and the preview use it directly — no more `FRONTLIT_TD_SCALE`.

Locked design decisions (from user):

- **Read-back = read a number off the print.** No camera. The user's eye reads a
  *threshold*, which is robust to lighting and monitor calibration (the exact
  weaknesses that sank the photo flow).
- **Base = fixed black.** Wedges print over a black base, matching the common
  frontlit base. No base-color picker in v1.
- **Format = user chooses** 3MF (multi-material, AMS-friendly) or STL (+ swap
  instructions, universal).

---

## The core mechanism: opacity threshold vs. an adjacent reference

The single most valuable, eye-readable quantity for a frontlit print is **how many
layers it takes for the filament to fully hide the black base** (its opacity
point). One number per filament pins the optical curve far better than the current
global 0.1 fudge.

Why this is robust where color-matching/photos are not: the user is not judging an
absolute color against a monitor. They compare each wedge step to a **fully-opaque
reference patch of the same filament printed right next to the wedge**, and report
the first step that is *indistinguishable from the reference*. Relative
"same/not-same" judgments against an adjacent physical reference are reliable under
almost any lighting.

```
Filament A wedge (over black base):           Reference
 layers: 1   2   3   4   5   6   7   8        (~20 layers,
        [▓] [▒] [░] [.] [ ] [ ] [ ] [ ]   |   fully opaque)
         black showing through ──► full color    [█]

App asks: "Find the first patch that looks the same as the reference block."
User types: 6
```

**One read only.** A second "mid-fade" read was considered and dropped: a partial-
transmission point has no sharp visual cue — there's nothing to compare it against,
so the eye can't place it accurately (the whole reason the opacity read works is the
adjacent fully-opaque reference). The opacity threshold is the single number.

### Print geometry (per filament)

- A row of square patches, patch *i* = *i* layers of the filament, *i = 1..N*.
- All patches sit on a shared **black base** (enough black layers to be opaque on
  its own, e.g. 4–6).
- One tall **reference patch** (same filament, ~20 layers / guaranteed opaque)
  adjacent to the wedge.
- Unambiguous orientation + indexing: leftmost patch = 1 layer; add an asymmetric
  corner marker so the user can't read it backwards, and show the matching layout
  diagram in the app. (Tiny embossed digits don't print reliably — rely on
  position + the in-app legend, not printed numbers.)
- Patch size ~12–15 mm so steps are easy to compare by eye.

### From a number to a TD (the fit)

- **Thickness must use the real layer-height model, not `layers × layerHeight`.**
  Auto-paint's first printed layer is `printableFirstLayerHeight = max(layerHeight,
  firstLayerHeight)`, every layer after is `layerHeight`
  ([`autoPaint.ts`](../src/lib/autoPaint.ts#L648)). The calibration generator, the
  TD fit, and auto-paint must all share this one conversion or the TD is biased.
  - In the calibration print the color wedge sits **on top of the black base**, so
    its layers are all regular `layerHeight`; the black base's bottom layer takes
    the first-layer height (for printability, doesn't affect color thickness).
  - `d_opaque = opacityLayers × layerHeight`. Store `firstLayerHeight` +
    `layerHeight` with the calibration so the number stays interpretable if print
    settings change later.
- The read maps to TD through a **per-color "effective opacity transmission" `T*`**
  derived from a perceptual just-noticeable-difference (JND), not a hand-picked
  number. Two decoupled steps:
  1. Solve `ΔE00(blendSrgbChannel(0, filament, T), filament) = JND` for `T*`.
     Depends only on the filament's own swatch color + the JND (ΔE00 is monotonic
     in T → unique; bisection). `T*` is *not* a function of TD.
  2. `TD = -d_opaque / log10(T*)`.
  This is the same `TD = -d/log10(T_opaque)` form as before, but `T_opaque = T*` is
  *computed per filament* instead of guessed — so a bright filament (small `T*`)
  gets a large TD and a dark one (large `T*`) a small TD automatically. The blend
  and ΔE00 are the exact functions the optimizer already uses.
- **JND is a standard human-vision constant** (CIEDE2000 JND ≈ 1; use ~1–2.5 to
  absorb lighting/observer spread). It is NOT fit to any filament — per-filament
  optics are captured by the read itself. Brand/batch/compound variation needs no
  constant change; changing filament just means re-reading that filament.
- Model boundary: single-TD Beer-Lambert assumes absorption, no scattering, so the
  read pins the *endpoint* accurately but intermediate-layer color may drift — that
  drift is Phase 2's job, not this fit's.
- Confidence = simple function of whether the resulting TD lands in a plausible
  range. No more per-channel least-squares from RGB samples.

### Per-channel TD — derive RGB channel TDs from the single read

Auto-paint consumes calibrated per-channel TDs
([`USE_CALIBRATED_CHANNEL_TD`](../src/lib/autoPaint.ts#L396),
`calibratedTdChannels`), so we keep that path alive by **computing the single TD
and converting it to RGB channel TDs** using the filament's own swatch color.

Physical basis: over a black base, the visible color settles channel-by-channel.
The brightest channel is the *most transmissive* (largest TD) and therefore the
**last** to reach full color — so the opacity the eye reads is governed by that
channel. That makes the brightest channel the natural anchor for the measured TD.

Proposed conversion (deterministic, reuses the existing heuristic shape from
[`estimateTDFromColor`](../src/lib/colorUtils.ts#L39) = `1.0 + luminance*5.8`):

1. Per channel, raw TD shape `rawTD_c = 1.0 + c_norm*5.8`, where `c_norm ∈ [0,1]`
   is that channel of the filament swatch.
2. Anchor on the brightest channel: `k = TD_measured / rawTD_{argmax c}`.
3. `td_c = k * rawTD_c` for R, G, B. `tdSingleValue = TD_measured`.

This preserves the color-driven per-channel *ratios* while pinning the overall
magnitude to the measurement. The exact ratio model is a knob to validate against
the 7-color frontlit set; the structure (single read → channels) is fixed.

---

## Generating the print

Extend [`generateCalibrationPatchesStl.ts`](../src/lib/generateCalibrationPatchesStl.ts)
(already builds patch rows) to add: the black base layers, the reference patch,
the orientation marker, and a 3MF variant.

- **3MF:** reuse the app's existing multi-material 3MF export path. Materials =
  black base + each selected filament. Slicer auto-assigns; minimal instructions.
- **STL:** geometry only + generated text instructions ("load black, print to
  layer X; swap to filament A; …"). Universal, manual swaps.
- **Multi-filament layout & swap burden:** one wedge+reference block per filament,
  tiled in a grid. Single-extruder users would face many swaps for a combined
  print (black + N colors). Decision: default to **one block per filament file**
  for non-AMS (each = black + 1 color = a single swap), and offer a **combined
  tiled file** for AMS/multi-material users. The "let the user choose format"
  decision pairs naturally with a "combined vs per-filament" toggle.

---

## UX flow

1. **Profile UI → Calibrate.** Multi-select filaments (checkboxes).
2. **Configure:** layer height (from print settings), max layers N (default ~10–12),
   patch size; base is black (fixed); pick 3MF/STL and combined/per-filament.
3. **Generate & download** + show printable instructions (viewing conditions,
   how to find the opacity patch vs the reference, orientation).
4. **Enter results:** a list of the selected filaments, each with an "opacity
   patch #" input (and optional second read). A live predicted swatch updates as
   they type so they get immediate feedback.
5. **Save:** frontlit TD written to each profile; preview + auto-paint update.

---

## Integration & data

- [`src/lib/autoPaint.ts`](../src/lib/autoPaint.ts): **remove `FRONTLIT_TD_SCALE`**.
  Measured TD is already frontlit-correct. For uncalibrated filaments, re-baseline
  the default frontlit TD (today's `estimateTDFromColor` heuristic was implicitly a
  backlit value scaled by 0.1 — that baseline must be re-derived).
- [`src/types/index.ts`](../src/types/index.ts): replace the calibration shape.
  New `FrontlitCalibration { opacityLayers, td: [r,g,b], tdSingleValue,
  layerHeight, firstLayerHeight, basis: 'black-frontlit', printedAt, notes? }`.
  Remove `measurements`, `whiteReference`, and all RGB-sample fields.

### Breaking changes are fine — no deprecation, aggressive removal

The user has OK'd breaking changes with **no migration notice**. So:
- **Delete** `FilamentCalibrationWizard.tsx` entirely.
- **Gut** `calibration.ts`: drop the Beer-Lambert RGB-sample fit, white-reference
  handling, per-channel least-squares, confidence-from-CV, import/export of the old
  shape. Keep/replace with just: the opacity→TD fit, the channel conversion, and
  generator helpers.
- Persistence ([`profileManager.ts`](../src/lib/profileManager.ts),
  `useProfileManager.ts`, `.kfil`/`.kapp`, localStorage): old `CalibrationResult`
  fields are simply **ignored/stripped on load** — no conversion, no notice. The
  filament keeps its plain TD; calibration just reads as absent until recalibrated.
- Rewrite `tests/calibration.test.ts`; drop fixtures tied to the old flow.
- Audit other call sites of the removed exports (`predictTransmission`,
  `calculateTDFromMeasurements`, `validateWhiteReference`, etc.) and delete dead UI.
- Docs (`src/docs/*`) + `CHANGELOG.md`.

---

## Phase 2 — color accuracy (combos), still later

Single-filament frontlit TD fixes "too many / too few layers" and most of the
color drift, because the preview uses the same TD. Fine-grained accuracy of
*stacked color blends* is a second pass: print a matrix of 2–3 color combinations,
**pruned to only printable combos using the Phase-1 TDs** (no longer assuming a
high TD ⇒ far fewer cells), and correct the blend predictor.

Open question for Phase 2: keep it camera-free. On-screen color matching reintro-
duces the monitor problem, so prefer ordinal/threshold-style reads here too (e.g.
"at which layer does color A stop showing through color B") rather than absolute
color matching. To be designed after Phase 1 lands.

---

## Decisions resolved

- **Read-back:** single opacity-threshold number, read against an adjacent opaque
  reference patch. No camera. (Mid-fade second read dropped — not eye-readable.)
- **Base:** fixed black.
- **Format:** user picks 3MF or STL; plus combined (AMS) vs per-filament files.
- **Per-channel TD:** compute single TD → derive R/G/B channel TDs from the swatch
  color (conversion above).
- **Layer heights:** thickness uses the shared `max(layerHeight, firstLayerHeight)`
  first-layer model; store both heights with the calibration.
- **Migration:** none. Breaking change, old calibration silently stripped.

## Still to pin

- **JND value** (1 vs ~2.5): a viewing-robustness choice, *not* a filament fit.
  Sanity-check against the 7-color frontlit set that the resulting prints look
  right; do not derive it from those specific filaments.
- Default max layers N and patch size for the wedge.
- The per-channel ratio model (validate the `1.0 + c*5.8` shape frontlit).
</content>
