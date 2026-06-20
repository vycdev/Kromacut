# Auto-Paint Algorithm Improvement Plan

> Status: **PLANNED — no implementation started.**
> Source: code review of the Auto-paint pipeline (2026-06-11). All file/line references
> are against `develop` at commit `6b55485`.

This document records verified findings about the current Auto-paint algorithms and
turns them into a phased, testable improvement plan. Each phase is independently
shippable and ordered so that correctness fixes land before behavioral changes, and
measurement lands before everything.

---

## 1. Invariants that must hold in every phase

These come from product constraints and existing tests. Any phase that breaks one is
not shippable.

- **Result schema stability**: `AutoPaintResult` and `autoPaintToSliceHeights` output
  shapes are unchanged. Export (3MF/STL), persisted state (`ThreeDControlsStateShape`),
  and saved profiles all consume these.
- **Printability**: foundation zone always present; slice heights are exact
  `layerHeight` multiples (first = `max(firstLayerHeight, layerHeight)`); ≤500 layers
  (`autoPaint.ts:1516`); no zero-thickness zones.
- **Layer snapping**: per-pixel snapping behavior in `ThreeDView.tsx` untouched unless a
  phase explicitly targets it.
- **Determinism**: same inputs + same seed → byte-identical result. (Phase 3 makes the
  no-seed case deterministic too; it must not break the seeded case.)
- **Worker responsiveness**: algorithm work stays in `autoPaint.worker.ts`; the main
  thread never runs the optimizer.
- **User data compatibility**: persisted `optimizerAlgorithm` values
  (`auto | exhaustive | simulated-annealing | genetic`), saved profiles (`.kfil`/`.kapp`),
  and calibration data (`CalibrationResult`) keep their meaning.
- **Existing test suites stay green**: `tests/export3mf.test.ts` (manifoldness, color
  collapse, seeded auto-paint regression stacks) and `tests/e2e/kromacut-flow.spec.ts`.

---

## 2. Verified findings

### F1 — Legacy enhanced path is unreachable in production

`useAutoPaintWorker.ts:203-206` always sends `optimizerOptions` (at minimum
`{ algorithm }`), and `findBestFilamentOrder` (`autoPaint.ts:835-843`) routes to the
advanced optimizer whenever options are present. The legacy subset-aware search
(`findBestFilamentOrderLegacy`, `autoPaint.ts:974-1063`) only runs from tests and
`debugAutoPaint`. Production therefore always uses the weaker scorer (F2) and never
does subset selection (F3).

### F2 — Advanced optimizer scores a different physical model than what gets built

`scoreFilamentOrder` → `findBestAchievableColor` → `simulateStackAtHeight`
(`optimizer.ts:166-238`):

- Transition thickness budget is `prevFilament.td * 3` (`optimizer.ts:226`) — keyed to
  the **previous** filament's TD. The real zone model sizes zones by the **incoming**
  filament's TD and ΔE convergence (`calculateTransitionThickness`,
  `autoPaint.ts:284-325`).
- Because that budget is independent of color distance, the advanced score **cannot
  see transition cost** (a yellow→purple order is not penalized for its expensive
  transition).
- Samples 20 uniform heights; ignores foundation opacity, layer grid, and compression.
- Objective is pure weighted mean ΔE — it lacks the legacy scorer's height-spread,
  layer-count (0.5/layer), and transition-waste (1.5/entry) penalties
  (`scoreSequenceAgainstImage`, `autoPaint.ts:734-806`).
- Minor: `findBestAchievableColor`'s sampled height range includes the foundation TD
  that `simulateStackAtHeight` never consumes (top samples are duplicates).

The legacy scorer builds its palette via `calculateIdealHeight` — the same model that
`generateAutoLayers` builds geometry with and `autoPaintToSliceHeights` previews with.
The optimizer optimizes objective A; the build pipeline realizes model B.

### F3 — Subset selection lost

All three advanced algorithms permute the **full** filament set. Legacy evaluated all
non-empty subsets for ≤6 filaments (1,956 evaluations at N=6) and stopped greedy
addition when no filament helped for >6. Today nothing can drop a harmful filament;
repeated swaps can only add occurrences.

### F4 — Region weighting is spatially blind and its mode detection is inverted

- Swatches lose pixel positions at extraction (`useSwatches.ts:62-109` — pure color
  histogram).
- `applyRegionWeightHeuristic` (`autoPaint.ts:868-924`) reduces the full W×H weight map
  to mean+variance, then boosts clusters by **luminance band**, never by location.
- Numerically verified (replicated `generateCenterWeightedMapSimple` /
  `generateEdgeWeightedMapSimple` + normalization): center maps have variance
  ≈0.055-0.067 → classified `isHighContrast=true` → applies the **edge** adjustment;
  edge maps on 1:1/4:3 images have variance ≈0.045-0.048 → applies the **center**
  adjustment. The modes are swapped on square images and identical (both "edge") at
  16:9. Behavior depends on aspect ratio, never on image content.
- `generateAutoLayers:1267-1282` allocates the full Float32Array map per request
  (~45 MB for the 3888×2916 fixture) only to compute two scalars.
- The repeated-swaps path ignores region weights entirely
  (`buildRepeatedSwapSequence` clusters at `autoPaint.ts:1098` without them).

### F5 — Optimizer cache returns stale results across region modes

`OptimizerCache.getCacheKey` (`optimizer.ts:101-114`) hashes the first 20 cluster
colors but **not their weights**, and not `regionWeights` or SA/GA tuning params.
Region weighting only changes weights → identical key → with an explicit seed,
switching Region priority returns the cached previous-mode order (UI shows "Cache
hit").

### F6 — Non-deterministic by default

Without a user seed, SA/GA seed from `Date.now()` (`optimizer.ts:525`): same image +
filaments produce different orders run to run. Caching is also disabled in that case.

### F7 — Repeated swaps are a second, conflicting optimization

`buildRepeatedSwapSequence` (`autoPaint.ts:1088-1185`): greedy insert-only; position
loop starts at 1 (`:1137`) so the foundation can never change; capped at 4 insertions;
scored with the **legacy** objective on top of a base order chosen by the **advanced**
objective; no remove/relocate moves.

### F8 — Physics gaps shared by both paths

- `blendColors` (`autoPaint.ts:217-241`) lerps in gamma sRGB with a **scalar**
  transmission. Calibration already fits **per-channel TD** (`CalibrationResult.td:
[r,g,b]`, `calibration.ts:283-322`) that auto-paint never reads — only
  `tdSingleValue`.
- `FRONTLIT_TD_SCALE = 0.1` (`autoPaint.ts:271`) is a hard-coded global fudge.
- Zone _i_ blends over the **pure** color of filament _i−1_
  (`buildAchievableColorPalette:656-663`, `autoPaintToSliceHeights:1499-1506`). Valid
  pre-compression (zones are sized for ΔE convergence), wrong after `compressZones` —
  compressed previews look cleaner than the print will, and ordering is never re-scored
  under compression.
- ΔE is CIE76, which over-penalizes chroma differences in saturated regions.
- Note: gamma-space lerp is self-consistent with how calibration _measures_
  (`predictWorkingBlendRgb`, `calibration.ts:128-140` fits `tdSingleValue` against the
  same gamma-space model). Any change to the blend model must move together with
  calibration fitting or it invalidates calibrated TDs.

### F9 — Worker protocol: no progress, terminate-only cancel

`autoPaint.worker.ts` is single-shot request/response. Exhaustive at 8 filaments ≈
40,320 permutations × ~670 stack sims each with zero progress feedback. The hook
terminates + recreates the worker per input change (`useAutoPaintWorker.ts:177-219`),
paying worker startup each time.

### F10 — Minor issues

- `luminanceToHeight` (`autoPaint.ts:1551`) is dead code (no callers).
- `scoreSequenceAgainstImage` multiplies weighted ΔE by `imageTargets.length`
  (`autoPaint.ts:777`), so fixed penalty constants change relative strength with
  cluster count.
- SA neighbor allows `i === j` (wasted iterations) (`optimizer.ts:333-335`).
- Zone caps (`td * 0.7`) produce off-grid zone boundaries (hidden by per-pixel re-snap).
- UI "Exhaustive (≤8 filaments)" implies subset search; it is full-set permutations
  only. Hook silently downgrades exhaustive >8 to `auto`
  (`useAutoPaintWorker.ts:189-192`), duplicating a guard in `ThreeDControls.tsx:130-134`.
- `tests/`: **no unit tests exist for `autoPaint.ts` or `optimizer.ts` internals.**
  Coverage is indirect (export3mf seeded stacks, e2e flow).

---

## 3. The plan

Phases are ordered: measurement → low-risk correctness → objective unification →
search-space unification → polish → gated physics. Do not reorder Phase 4 before
Phase 3 (widening the search around a misaligned objective optimizes the wrong thing
harder).

### Phase 0 — Test baseline + benchmark harness (prerequisite for everything)

Goal: pin current behavior and make quality measurable before changing anything.

- [x] **0.1 Unit tests for `autoPaint.ts` pure functions** (new
  `tests/autoPaint.test.ts`):
  - `calculateTransitionThickness`: returns ≥ `layerHeight`; respects `0.7×TD` cap;
    early-exit for near-identical colors.
  - `compressZones`: zones tile `[0, H]` contiguously (each `startHeight` equals
    previous `endHeight`); ratio honored; no-op when under max.
  - `calculateIdealHeight`: foundation = `max(baseThickness, td×1.3)`; zone count =
    filament count.
  - `autoPaintToSliceHeights`: every slice = `layerHeight` (first =
    `max(firstLayerHeight, layerHeight)`); ≤500 layers; `virtualSwatches`,
    `filamentSwatches`, `colorSliceHeights`, `colorOrder` lengths agree.
- [x] **0.2 Seeded golden snapshots** of `generateAutoLayers` for the
      2/4/8-color `.kapp` profiles × both fixture images (`tests/assets`), with
      enhanced on/off and repeated swaps on/off: assert `filamentOrder`, zone
      boundaries (±1e-6), `totalHeight`, `compressionRatio`. These get **re-baselined
      deliberately** in Phases 3/4 — their job is making behavior changes visible,
      not frozen.
- [x] **0.3 Determinism tests**: per algorithm, same seed twice → deep-equal result.
- [ ] **0.4 Benchmark harness** (`tests/benchmark/autoPaintBench.ts`, runnable via a
  package script, not part of CI gating initially). Per image × profile × algorithm ×
  seed, emit JSON with:
  - Weighted mean ΔE (report **both** CIE76 and CIEDE2000) from clustered targets to
    nearest achievable palette color; weighted P95.
  - Coverage@2.3 and @5.0 (fraction of image weight within JND thresholds).
  - **End-to-end realized error**: run the ThreeDView polyline mapping (port of
    `ThreeDView.tsx:753-1002`, reuse the port in `tests/export3mf.test.ts:~700-768`)
    over fixture pixels; report pixel-weighted ΔE of mapped vs original. *This is the
    primary metric — it measures the whole pipeline, not the scorer's opinion of itself.*
  - Structure: total height, layer count, sequence length, wasted-layer fraction,
    compression ratio under a fixed `maxHeight` scenario.
  - Cost: wall time, evaluations, iterations.
  - Stability: cross-seed rank agreement for SA/GA.
- [ ] **0.5 Acceptance rule for later phases** (documented in the harness README):
      end-to-end realized ΔE improves on average across fixtures and regresses on no
      fixture beyond tolerance (suggest 5%), within cost budgets (≤2 s for 8 filaments).

Risk: none (additive). Estimated scope: tests only.

### Phase 1 — Region weighting made spatially correct; delete the heuristic

Goal: per-color weights actually reflect where colors sit in the image. Fixes F4.

- [ ] **1.1** Extend swatch extraction (`useSwatches.ts`) to accumulate, per color, in
      the same tile pass that builds the histogram: `centerWeight` and `edgeWeight`
      (sum of the geometric per-pixel weight functions evaluated inline — no
      Float32Array maps materialized). Both modes computed in one pass so switching
      modes never rescans the image. Swatch entries gain optional fields; existing
      consumers unaffected.
- [ ] **1.2** Thread the chosen mode's weighted count through
      `useAutoPaintWorker` → worker request → `generateAutoLayers`: when mode ≠
      `uniform`, use the weighted count as `count` input to `clusterImageColors`
      (which already weights by count). Keep raw count for display.
- [ ] **1.3** Delete `applyRegionWeightHeuristic` (`autoPaint.ts:868-924`) and the
      per-request map generation in `generateAutoLayers:1267-1282`. Remove
      `regionWeights` from `OptimizerOptions`/`ScoringContext` (or keep as deprecated
      no-op field if persisted anywhere — verify; current persistence stores only the
      mode string, so removal should be safe).
- [ ] **1.4** Repeated-swaps path uses the same weighted targets (fixes the
      inconsistency at `autoPaint.ts:1098`).
- [ ] **1.5 Tests**: synthetic fixture (red center disc on blue border):
  - `center` mode must rank red clusters above blue; `edge` mode the reverse.
  - Mode `uniform` byte-identical to pre-change output (golden snapshot).
  - No `Float32Array(width*height)` allocation in the worker path (can assert via
    absence of the code path / memory not practical — code-level assertion).

Risk: low-medium (plumbing). User-visible: center/edge modes start doing what their
labels say (today they are swapped or no-ops — treat as bug fix, note in CHANGELOG).

### Phase 2 — Cache correctness + determinism by default

Goal: fix F5, F6. Small, independent, immediately shippable.

- [ ] **2.1** Cache key includes cluster **weights**, full cluster set (not first 20),
      and all algorithm-relevant options (temperature, cooling, population, mutation,
      elite, maxIterations). Simplest robust form: hash a canonical JSON of
      `{filaments, clusters(L,a,b,weight), layerHeight, firstLayerHeight, algorithm,
    seed, tuning}`.
- [ ] **2.2** Default seed = stable 32-bit hash of the same canonical inputs instead of
      `Date.now()` (`optimizer.ts:525`). User-provided seed still overrides. This makes
      every run reproducible and cacheable; remove the `hasExplicitSeed` cache gating.
- [ ] **2.3 Tests**: same inputs, no seed, twice → identical result. Toggling region
      mode with a fixed seed → different cache entries (regression test for F5).
      Changing only `temperature` → cache miss.

Risk: low. User-visible: results stop changing between identical runs (improvement);
"Cache hit" indicator becomes trustworthy.

### Phase 3 — Unify the objective (one scorer, zone-accurate)

Goal: the optimizer optimizes the same model the pipeline builds. Fixes F2; partially
F8 (scoring side of the pure-background issue can be folded in here or deferred to
Phase 6b).

- [ ] **3.1** Move/share the palette builder: expose `buildAchievableColorPalette` +
      `scoreSequenceAgainstImage` (or a thin `scoreSequence(sequence, context)`
      wrapper) for use by `optimizer.ts`. `ScoringContext` carries the weighted Lab
      targets as today.
- [ ] **3.2** Replace `scoreFilamentOrder`/`findBestAchievableColor`/
      `simulateStackAtHeight` with the unified scorer in exhaustive, SA, and GA.
- [ ] **3.3 Performance work so per-eval cost stays acceptable**:
  - Memoize `calculateTransitionThickness(bgColorHex, filamentId)` per optimizer run —
    pair space ≤ N², eliminates the dominant inner loop.
  - Memoize palette per unique sequence string (SA revisits neighbors).
  - Fix the score-scale fragility while touching it: normalize by total target weight
    instead of multiplying by `imageTargets.length` (`autoPaint.ts:777`), and rescale
    the structural penalty constants to match (calibrate against Phase 0 harness so
    rankings on fixtures are preserved or improved — this is a tuning task, use the
    harness).
- [ ] **3.4** SA neighbor: redraw `j` until `j ≠ i` (F10).
- [ ] **3.5 Tests**: property test — the score the optimizer reports for its chosen
      order equals `scoreSequence` of that order under the build model (was untrue
      before). Re-baseline Phase 0 golden snapshots; harness must satisfy the Phase 0.5
      acceptance rule. Budget: ≤2 s for 8 filaments (exhaustive falls back per
      existing UI guard).

Risk: medium — orders will change for users (expected: improvement, verified by
harness). Determinism preserved (seeded). Schema unchanged.

### Phase 4 — Variable-length search space (subsets + repeats, natively)

Goal: one search over sequences, restoring subset selection (F3) and integrating
repeats (F7). Replaces `buildRepeatedSwapSequence`.

Search space: sequences of filament occurrences, length 1..(N + 4), no consecutive
duplicates, repeats allowed **only when** `allowRepeatedSwaps` is on (otherwise
sequences are permutations of subsets). 500-layer guard enforced via scoring penalty +
hard cap.

- [ ] **4.1** `exhaustive` (≤6 filaments): all permutations of all non-empty subsets
      (1,956 evals at N=6 — legacy semantics restored) under the unified scorer. When
      repeats are on, extend with the bounded insertion expansion as a post-pass _of
      the same scorer_ (cheap and already consistent), or fold repeats into beam
      search (4.2) and route there. Update UI label/threshold honestly (≤6, not ≤8;
      keep the existing >threshold downgrade-to-auto behavior in one place — remove
      the duplicate guard, F10).
- [ ] **4.2** **Beam search** (new internal algorithm, used by `auto` for 7-12
      filaments): build sequences bottom-up; at each depth keep top-K (K≈100, tunable
      via harness) partial stacks scored with the unified scorer; candidate extensions
      = any non-duplicate filament occurrence + "stop" (subset selection falls out
      naturally). Deterministic, anytime, trivially reports progress (depth/maxDepth).
- [ ] **4.3** **Variable-length SA** (replaces permutation SA; used by
      `simulated-annealing` and by `auto` for >12): moves = swap(i,j), relocate(i→j),
      insert(filament, pos) [only if repeats allowed or filament unused],
      remove(pos) [if length > 1], replace(pos, filament). Seeded move selection;
      geometric cooling as today.
- [ ] **4.4** GA (`genetic` UI value): keep permutation GA over the full set initially
      but wrap with subset-aware repair, or route `genetic` to variable-length SA with
      a different default budget if GA quality on the harness is not competitive.
      Decide on harness data, not in advance.
- [ ] **4.5** Delete `buildRepeatedSwapSequence`; `generateAutoLayers` passes
      `allowRepeatedSwaps` into optimizer options instead
      (`autoPaint.ts:1307-1316`).
- [ ] **4.6 Tests**: printability invariants (foundation exists; no consecutive
  duplicate filament ids; sequence length caps; result schema unchanged; slice snapping
  unchanged); per-seed determinism for each algorithm; harness non-regression per
  Phase 0.5; specific scenario tests:
  - A filament strictly worse than every alternative (e.g., a near-duplicate hue with
    worse TD) gets dropped (subset regression — impossible today).
  - Thin-white-over-red produces a pink intermediate when repeats are on (repeated-swap
    regression).
  - `allowRepeatedSwaps=false` → no filament appears twice.

Risk: medium-high (largest behavioral change; biggest quality upside). UI: **no new
dropdown entries** — `auto/exhaustive/simulated-annealing/genetic` keep their persisted
values and re-map internally (decision log §4).

### Phase 5 — Worker progress + lifecycle polish

Goal: fix F9 ergonomics. Independent of phases 3-4 but nicer after them (beam search
has natural progress).

- [ ] **5.1** Optimizer accepts `onProgress(iteration, total, bestScore)`; worker
      throttles (~10 Hz) `postMessage({ type: 'progress', id, ... })`; final message
      keeps the current shape (`{ id, result }`) for compatibility.
- [ ] **5.2** Hook surfaces `progress` in `UseAutoPaintWorkerResult`; AutoPaintTab
      shows it next to the spinner ("Optimizing… 43%").
- [ ] **5.3** Keep terminate-based cancel; optionally keep a warm worker between
      requests and cancel via `id` checks instead of terminate (measure startup cost
      first — only do this if it's noticeable).
- [ ] **5.4 Tests**: progress monotonic 0→1 (mirror `tests/algorithms-progress.test.ts`
      pattern); stale progress messages (old `id`) ignored.

Risk: low.

### Phase 6 — Physics upgrades (each gated behind a constant + harness validation)

Goal: close F8 where measurement proves it helps. Each item independent; ship only
with harness evidence. These change preview colors for existing projects — CHANGELOG
each.

- [ ] **6a Per-channel TD blending where calibration exists**: `blendColors` uses
      `calibration.td: [r,g,b]` (per-channel transmission, gamma-space — consistent
      with how calibration measures) when present; scalar `tdSingleValue` fallback
      unchanged for uncalibrated filaments. Touches `blendColors` call sites in
      `autoPaint.ts` only; `Filament` already carries `calibration`.
- [ ] **6b Compression-aware backgrounds**: carry the actual blended end-color of zone
      _i−1_ forward as zone _i_'s background in `buildAchievableColorPalette` and
      `autoPaintToSliceHeights` (today: pure color, `autoPaint.ts:656-663, 1499-1506`).
      Makes compressed previews honest and lets the (unified) scorer see compression
      damage. Optionally: when `compressionRatio < 0.9`, re-score the top-k candidate
      orders under compression and pick the best (bounded cost).
- [ ] **6c CIEDE2000** behind a metric constant for scoring + clustering distances
      (~3-4× distance cost; affordable at ≤32 targets). Adopt only if harness shows
      end-to-end improvement on saturated fixtures.
- [ ] **6d FRONTLIT_TD_SCALE**: leave at 0.1 for now; add a calibration-wizard-derived
      frontlit factor as a future item (requires new measurement flow — out of scope).
- [ ] **6e Cleanup**: delete dead `luminanceToHeight` (`autoPaint.ts:1551`); update the
      stale module doc header (`autoPaint.ts:1-17`).

Risk: medium (visual shifts); mitigated by gating + harness + CHANGELOG.

---

## 4. Decision log

- **No new UI algorithm choices.** Persisted `optimizerAlgorithm` values keep their
  names; internals re-map (`auto` → subset-exhaustive ≤6 / beam 7-12 / var-length SA
  above; `exhaustive` → subset-exhaustive with honest ≤6 cap; `simulated-annealing` →
  variable-length SA; `genetic` → keep or alias per Phase 4.4 harness data). Beam
  search is an `auto` implementation detail, not a dropdown entry. Rationale: choices
  are speed/quality trade-offs users already understand; renaming breaks saved
  profiles/state.
- **Rejected: DP / shortest-path over discretized color states.** Reachable-color
  state space (Lab × height with path-dependent blending) discretizes poorly; beam
  search captures the same "build bottom-up, prune" idea without state-explosion risk.
- **Rejected (for now): variable-length genomes in GA.** Crossover design is fiddly;
  at ≤16 filaments variable-length SA + beam cover the space. Revisit only if harness
  shows SA stuck.
- **Gamma-space blending stays** (not switched to linear-light): calibration fits TDs
  against the same gamma-space model, so the pair is self-consistent; changing it
  would invalidate users' calibrated TDs (F8 note). Per-channel TD (6a) improves hue
  realism without breaking that consistency.
- **`buildRepeatedSwapSequence` is deleted in Phase 4**, not improved in place — its
  objective-mixing is structural (F7).

## 5. Quick reference: finding → phase

| Finding                                   | Fixed in            |
| ----------------------------------------- | ------------------- |
| F1 legacy path dead / weak scorer in prod | Phase 3 (+4)        |
| F2 misaligned objective                   | Phase 3             |
| F3 subset selection lost                  | Phase 4             |
| F4 region weighting blind/inverted        | Phase 1             |
| F5 stale cache across modes               | Phase 2             |
| F6 non-deterministic default              | Phase 2             |
| F7 repeated swaps bolt-on                 | Phase 4             |
| F8 physics gaps                           | Phase 6 (a-d)       |
| F9 worker progress                        | Phase 5             |
| F10 minor issues                          | Phases 3.4, 4.1, 6e |
| No unit tests / no benchmark              | Phase 0             |
