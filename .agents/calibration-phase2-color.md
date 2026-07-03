# Calibration Phase 2 — color accuracy via multi-base opacity reads

Status: core implementation complete; metamer-pair validation strip still open. Builds directly on the Phase 1
frontlit calibration (see [calibration-improvements.md](calibration-improvements.md),
implemented in `354f736` + the review fixes).

## Goal

Phase 1 pins each filament's overall optical magnitude (scalar frontlit TD) from a
single opacity read over one base. Two things remain heuristic:

1. **Per-channel TD ratios** — currently derived from the swatch color via the
   `1 + c/255 × 5.8` shape ([`deriveChannelTds`](../src/lib/calibration.ts)), anchored
   to the measured scalar. The ratios were never measured; they drive every stacked
   color blend the optimizer and preview compute, so they are the dominant remaining
   error source for intermediate/blended colors.
2. **The JND constant** — [`OPACITY_JND = 2.0`](../src/lib/calibration.ts) defines
   "indistinguishable from the reference rail" and sets the global TD scale
   (`TD = -d/log10(T*)` where `T*` depends on the JND). It was never validated against
   physical prints (the Phase-1 "Still to pin" item).

Phase 2 measures both, stays **camera-free**, and changes **only the calibration
side** — the optimizer and preview already consume per-channel TDs
(`calibration.td`), so better numbers flow through with zero pipeline changes.

## Core mechanism: the Phase-1 read, repeated over different colored bases

Phase 1 already generalized the opacity read to arbitrary bases (base-picker +
`solveOpacityTransmission(color, jnd, baseColor)`). Phase 2's entire measurement is:
**read the same filament over 2–3 different bases.**

Why this measures per-channel TDs: the opacity read is governed by the _slowest_
channel to converge, and which channel that is depends on the base.

- Yellow over **black**: R and G must build up from 0 → governed by td_r, td_g.
- Yellow over **blue**: the blue channel must attenuate 255 → ~0 → governed by td_b.
- Each additional base with a different channel signature adds an independent
  constraint on the (td_r, td_g, td_b) triple.

No new read type, no new geometry, no new judgment for the user's eye — still
"first patch that matches the rail beside it," which is the whole reason the
Phase-1 flow is robust.

### The fit

Per filament, given reads `{(base_i, n_i)}` at layer height `h`:

- Model: per-channel transmission `T_c(d) = 10^(-d / td_c)`; blended color =
  `blendSrgbChannel(base_c, filament_c, T_c(d))` per channel (the exact functions the
  optimizer uses).
- Predicted read for a candidate `(td_r, td_g, td_b)`:
  `n̂_i = min { n : ΔE00(blend(base_i, A, T(n·h)), A) ≤ JND }`.
- Fit: minimize `Σ_i (n̂_i − n_i)²` (or a smooth surrogate on log-TD) over the
  channel TDs, **regularized toward the Phase-1 anchor structure** (brightest-channel
  anchor + heuristic ratios as the prior) so 2 reads still give a stable answer.
  Deterministic — coarse grid + local refinement, no randomness.
- With **1 read** (Phase-1 case) the fit degenerates to exactly the current
  `deriveChannelTds` behavior. Phase 2 is a strict superset; single-base calibration
  keeps working unchanged.

Integer reads quantize each constraint, so prefer overdetermination (3 bases) over
exact solving, and keep `maxLayers` large enough that reads land mid-wedge (the
confidence logic already penalizes clipped reads).

### Optional secondary read: the adjacent-step merge point (the Phase-3 detector)

On the same wedge, the user can optionally also report **the last patch that still
looks different from its neighbor** (walking up the wedge, the point where adjacent
steps become indistinguishable). Still a same/not-same judgment between two
physically adjacent patches — same trust model as the rail read. Observed in
practice on the first physical Phase-1 print: large visible steps in the first few
layers, then diminishing returns well before the rail match.

Why it matters: the exponential model makes a _fixed quantitative prediction_ about
where this merge point sits relative to the rail-match point. Per channel,
step-to-step change ∝ `r^n(1−r)` while distance-to-rail ∝ `r^n` (with
`r = 10^(-h/td)`), so neighbors merge when the remaining gap to the rail is still
≈ `JND/(1−r)` — e.g. ~3× JND at h=0.08, TD≈0.5. Diminishing returns per layer is
therefore **expected** and does not by itself indicate scattering.

What _would_ indicate scattering (a longer-than-exponential tail): merge points
landing systematically earlier — relative to the rail match — than the fitted
exponential predicts, consistently across filaments. The merge read costs nothing
extra to print, is optional at entry (never blocks saving a calibration), and is
stored alongside the opacity reads purely as model-form evidence. It can also serve
as a soft extra constraint in the TD fit when present.

### JND: fit it from the same data instead of hand-tuning

For one filament read over two bases, the implied TDs must agree — and
`T*(A over B1)` vs `T*(A over B2)` respond _differently_ to the JND (the ΔE00
geometry along each blend path differs), so cross-base consistency identifies it.

- Treat JND as **one global parameter shared across all filaments and reads** in a
  calibration session (it is a human-vision constant, never per-filament — same
  principle as Phase 1).
- Fit: outer 1-D search of JND over a sane band **[1.0, 3.0]**, minimizing the total
  cross-base fit residual from the per-filament fits above; many (filament × base)
  reads vs. one parameter → well overdetermined.
- Fallback: if the session has too few multi-base reads or the residual curve is
  flat, keep `OPACITY_JND = 2.0` and report that in the UI/notes. Never silently fit
  JND from a single filament.
- Once fitted, store the session JND and use it for subsequent single-read
  calibrations too.

This absorbs the unfinished Phase-1 validation task ("sanity-check JND against the
7-color frontlit set"): the first real Phase-2 calibration session of that filament
set _is_ the JND measurement.

## Combo pruning (which bases to print each filament over)

Auto-pick 2–3 bases per filament from the user's own profile filaments, pruned with
the Phase-1 TDs exactly as the original plan intended:

- Drop pairs where `solveOpacityTransmission` returns undefined (no contrast → no
  read possible; already handled/errored in Phase 1).
- Drop pairs whose **predicted** read (from current TDs) is 1 (base hidden
  immediately — zero information) or > maxLayers (never converges in the wedge).
- Among survivors, greedily pick bases maximizing channel diversity: score each
  candidate base by how differently it weights the three channels for this filament
  (e.g., which channel the predicted read is governed by), and pick a set covering
  different governing channels. Black (or the darkest filament) stays in the set as
  the anchor read.
- The user can override the auto-picked set (same Select UI as Phase 1's base step,
  now multi-select per filament).

Note: bases only contribute their _surface color_ (they print opaque), so an
uncalibrated filament can serve as a base — no calibration-order dependency.

## Print & UX

- **Geometry:** unchanged tile generator. Phase 2 print = one tile per
  (filament, base) pair instead of one per filament. Combined 3MF tiles or one STL
  printed per pair (still exactly one swap each); the per-filament swap-instruction
  list from the review fixes extends naturally ("Yellow over Blue: base = Blue, swap
  after layer 5 / Z 0.52 mm").
- **Dialog:** same four steps. Base step gains multi-select; Measure step shows one
  read row per (filament, base) with the same live predicted swatch. A "quick"
  single-base mode (= Phase 1 behavior) remains the default for one-off filaments;
  "accurate" multi-base mode is the Phase 2 addition.
- Keep the read count honest: 5 filaments × 3 bases = 15 reads is the practical
  ceiling for one session; default to 2 bases (anchor + one contrast base) and let
  the user opt into 3.

## Data shape

Extend `FrontlitCalibration` **backward-compatibly** (the sanitizer from the review
fixes must keep accepting Phase-1 records):

```ts
interface FrontlitCalibration {
    // existing Phase-1 fields unchanged; opacityLayers/baseColor describe the
    // anchor read for compatibility
    ...
    /** All reads used for the fit (anchor read included). Absent = Phase-1 single read.
     *  mergeLayers = optional adjacent-step merge point (Phase-3 evidence). */
    reads?: Array<{ baseColor: string; opacityLayers: number; mergeLayers?: number }>;
    /** 'heuristic' (Phase-1 ratio model) or 'measured' (multi-base fit). */
    channelSource?: 'heuristic' | 'measured';
    /** JND actually used; already stored. Add where it came from. */
    jndSource?: 'default' | 'session-fit';
}
```

Sanitizer: `reads`, `channelSource`, `jndSource` optional; validate elements if
present. No migration needed — Phase-1 records read as anchor-only.

Confidence: multi-base calibrations with consistent reads score higher; a filament
whose reads _disagree_ badly under the best fit gets flagged (that disagreement is
also the scattering signal — see below).

## Phase 3 gate (scattering) — decided by Phase-2 data, not folded in

Phase 3 = upgrading the blend model from single-exponential absorption to something
scattering-aware (Kubelka-Munk style). **Deliberately NOT included in Phase 2**:

- It adds ~2 parameters per channel per filament; fitting that from a handful of
  integer reads is ill-conditioned without evidence the extra form is needed.
- The blend function sits on the optimizer hot path; KM composition is more
  expensive — only pay if the data demands it.
- A model-form change shifts every stack prediction (goldens, previews, existing
  calibrations churn). Do it once, with evidence, not speculatively.

Phase 2 instead **collects the decision data as a byproduct**:

1. Cross-base fit residuals: multi-base reads that no per-channel TD triple can
   reconcile (beyond integer quantization) → absorption model at its limit. Surface
   as reduced confidence + a note, per filament.
2. Adjacent-step merge reads (above) landing systematically earlier than the fitted
   exponential predicts → long-tail/scattering signature.
3. Metamer-pair validation disagreements concentrated on stacks involving specific
   filaments (white/pastel filaments are the likely offenders — TiO2 is nearly pure
   scattering).

Gate: if ≥2 of these signals agree across the 7-color set, design Phase 3 (likely a
single scattering-fraction parameter per filament, not full per-channel KM, fitted
from the same reads). If not, Phase 3 is unnecessary and the exponential stands.

## Explicitly out of scope (v1 of Phase 2)

- **Scattering model itself** — detection only, per the gate above.
- **Camera/photo anything.** Still banned.
- **On-screen color matching.** Still banned (monitor problem).

## Validation & acceptance

- **Synthetic round-trips:** generate reads from a known (td_r, td_g, td_b) + JND,
  run the fit, recover within integer-read quantization (mirrors the Phase-1 test
  style in `tests/frontlitCalibration.test.ts`).
- **JND identifiability test:** synthetic multi-filament session with a known JND;
  the outer fit recovers it; a flat-residual session falls back to 2.0.
- **Physical acceptance — metamer pairs:** after calibrating the 7-color set, have
  the app print a small strip of stack _pairs_ the model predicts to be
  indistinguishable (e.g., "2 layers A over B" next to "1 layer A' over B'" with
  predicted ΔE00 < JND) plus a few pairs predicted clearly different. Count
  agreements by eye. This is a yes/no ordinal judgment (camera-free, monitor-free)
  and directly tests what auto-paint relies on: stacked-blend predictions.

## Open questions / to pin during implementation

- Default bases per filament: 2 vs 3 (read burden vs. fit conditioning).
- Fit details: exact objective surrogate, regularization weight toward the
  heuristic prior, grid resolution. Must stay deterministic.
- Whether the session-fitted JND should retroactively rescale existing Phase-1
  calibrations (they stored their JND, so it's computable — probably yes, with the
  stored `jnd` recording what was actually used).
- Where the metamer-pair validation strip lives in the UI (part of the calibration
  dialog vs. a separate "verify calibration" action).
