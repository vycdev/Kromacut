# Phase 2 review — issues to fix

> **Status: RESOLVED (2026-07-02).** All four items fixed: the session JND fit moved
> out of the per-keystroke path into `handleSave` (live typing now costs ~60 ms per
> filament; merge reads no longer retrigger computation), the dead ternary is gone,
> the measure step gained Base/Match/Merge column headers, tooltips, and an amber
> warning when merge > match, and the design doc tracks the metamer strip as open.
> Verified: 227 tests, tsc, eslint green.
>
> **Residual follow-ups — RESOLVED (2026-07-02):**
> 1. ~~Synchronous save freeze~~ — Save now sets an `isSaving` "Fitting…" state,
>    disables the button, and defers the session fit past a paint
>    (`requestAnimationFrame` + `setTimeout`), resetting state in `finally`.
> 2. ~~Band-edge JND acceptance~~ — `fitSessionJnd` rejects solutions at
>    `JND_FIT_MIN`/`JND_FIT_MAX` and falls back to the default JND; covered by a
>    regression test with an out-of-band synthetic session.
> 3. ~~Cosmetic dead "session JND" badge branch in the live measure view~~ —
>    later upgraded by a codex PR review (preview and save could disagree when
>    the session fit fired) and fixed properly: the session JND is now fitted
>    once in a debounced background pass after the reads settle, the live
>    preview consumes it (badge reachable again), and Save reuses the cached
>    fit so saved values always equal previewed values.
>
> Verified after the fixes: 228 tests, tsc, eslint green.

Review of the uncommitted Phase 2 implementation (multi-base opacity reads, measured
per-channel TDs, session JND fit) against
[calibration-phase2-color.md](calibration-phase2-color.md).

**Overall: the implementation is faithful to the design and the math is right.**
Multi-base reads fit measured channel TDs with the heuristic as prior (single-read
degenerates exactly to Phase-1 behavior); the JND session fit uses a center-mode
residual for identifiability, requires ≥2 multi-base filaments, and has a
flat-residual fallback to 2.0; reads/channelSource/jndSource persist
backward-compatibly through the sanitizer; base auto-picking prunes by predicted
read usefulness and channel diversity; merge reads are stored as evidence only.
Tests cover the multi-base round-trip, JND recovery (within 0.25 of a synthetic
truth), and the fallback. 227 tests, tsc, eslint all green.

One significant issue and a few small ones:

---

## 1. HIGH (UX/perf) — the session fit freezes the UI for seconds on every keystroke

`computed` in
[FilamentCalibrationDialog.tsx](../src/components/FilamentCalibrationDialog.tsx)
calls `computeFrontlitCalibrationSession` synchronously inside a `useMemo` whose
deps include `reads` and `mergeReads` — i.e. it re-runs on **every keystroke** in
the measure step. Once ≥2 filaments have complete multi-base reads, that call
includes `fitSessionJnd`: ~20 JND candidates × (full channel-TD fit per eligible
filament), where one fit is ~500 score evaluations × reads × a 36-iteration ΔE00
bisection.

Measured: the synthetic session test (3 filaments × 3 reads) takes **4.3 s** in
node; a realistic 3×2 session is on the order of 1.5–3 s. The freeze lands at the
worst moment — while the user is typing the *last* reads (and typing a merge value,
which doesn't even affect the fit, retriggers the whole thing). AGENTS.md:
long-running work must keep the UI responsive.

Suggested fixes, in order of preference (can combine):

1. **Don't refit on keystrokes.** Debounce the session computation (~400 ms) AND
   exclude `mergeReads` from the fit input entirely (merge values are stored at
   save time; they have zero effect on the fit — build them into the reads array
   only in `handleSave`).
2. **Move the session fit off the main thread** using the existing worker pattern
   (`useAutoPaintWorker` precedent) if debouncing alone still feels janky.
3. **Cheapen the fit**: cache `opacityLayerThreshold` results keyed by
   (td-triple, base, jnd) across the JND grid; cut the bisection to ~20 iterations
   (layer-resolution accuracy needs far less than 2^-36); skip re-running the
   per-filament *display* fit when only the JND search is exploring.

A pragmatic minimal version: keep per-filament fits live (each ~25–75 ms, fine),
but run the **JND session fit only on demand** — when the user leaves the last
input / presses Save, with the badge updating from "default JND" to "session JND"
at that point. Everything stays deterministic.

## 2. LOW — pointless ternary in `computeFrontlitCalibration`

[calibration.ts](../src/lib/calibration.ts):
`const tdSingleValue = reads.length > 1 ? fit.tdSingleValue : fit.tdSingleValue;`
— both branches are identical. Replace with `const tdSingleValue = fit.tdSingleValue;`.

## 3. LOW (UX) — the "merge" input is unexplained in the dialog

The measure row shows two bare number inputs with placeholders "match" and
"merge". The docs explain the merge read, but the dialog doesn't — a first-time
user won't know what to type there or that it's optional. Add a `title` tooltip
(e.g. "Optional: first patch that looks the same as the patch before it") and/or a
tiny column-header row above the inputs. Also consider a soft validation hint when
`mergeLayers > opacityLayers` (physically odd: neighbors can't merge after the
rail match) — accept it, but flag it visually.

## 4. NOTE (not a defect) — metamer-pair validation strip not included

The design's physical acceptance artifact (printable strips of stacks predicted
indistinguishable vs. clearly different) is not in this change. Fine to land
Phase 2 without it, but it is the third Phase-3 gate signal, so it should be
tracked as the remaining open piece of Phase 2 rather than dropped.

---

## Reviewed and explicitly OK

- Single-read path returns exactly the Phase-1 result (prior = heuristic channel
  TDs anchored to the T* scalar); no behavior change for quick mode.
- `tdSingleValue = max(channel TDs)` for multi-read fits — consistent with the
  brightest-channel-anchor convention.
- JND fit: center-mode residual (interval mode would be flat within quantization
  intervals → unidentifiable); ≥2 eligible filaments required; improvement
  threshold before accepting; deterministic coarse+fine grid in [1.0, 3.0].
- Session JND, when fitted, is applied to the same session's single-read filaments
  too, and recorded via `jndSource: 'session-fit'` — matches the design.
- Sanitizer extensions are strict (bad `reads`/`channelSource`/`jndSource` reject
  the whole record) and Phase-1 records without `reads` still pass.
- Base auto-pick: prunes no-contrast and predicted-read-1 / >maxLayers pairs,
  anchors on the darkest useful base, prefers channel diversity then mid-wedge
  predicted reads; accurate mode defaults to 2 bases, capped at 3.
- Disagreeing multi-base reads (rms > 0.75 layers) reduce confidence and append a
  note — the Phase-3 residual signal is surfaced as designed.
- Uncalibrated filaments' predictions for pruning use `td × 0.1` mirroring
  `FRONTLIT_TD_SCALE` — consistent with auto-paint's fallback.
