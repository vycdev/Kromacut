# Full-appearance multi-head search (#113)

The run search uses fitted optics and CIE76 to nominate at most 32 distinct orders
per window and per target group. Only these orders, plus the current order, reach
the full appearance model. Full ranking uses the original group members and their
usage weights with CIEDE2000, after the same RGB quantization as the routed preview
and gain gate. The shortlist deduplicates orders that differ only above the scored
surface. It is a bounded heuristic, not an exhaustive full-model optimum.

Windows are selected by regional opportunities. Requiring an improving shared
ordering rejected all Rocco windows in an initial full-model experiment even
though independent regions could improve. The shared ordering still supplies a
physical context for selecting later, non-overlapping windows. Final coordinate
reconciliation starts from each group's original stack and retains its current
path on ties. Fully scored choices are reused only when the physical prefix and
suffix outside that window match; changed contexts are searched again. This
avoids repeating the broad scan for every group in a single-window build.

The 0.25 usage-weighted mean CIEDE2000 build gate remains unchanged. In the measured
Rocco regression, Layer-based two-head routing improves by only 0.131, while
Color-based improves by 0.419. The former still falls back; reducing the gate just
to route it is not justified. These are model predictions, not measured prints.

## Reproduction

Run from the repository root with Node 24 and installed npm dependencies:

```sh
npm run benchmark:multi-head -- --prepare
npm run benchmark:multi-head -- --analysis-ref 3ede3177f231d1ae566ff8afb1313f772f50889e --output .profiles/multi-head/baseline.json
npm run benchmark:multi-head -- --output .profiles/multi-head/shortlist-32.json
npm run benchmark:multi-head -- --shortlist 8 --heads 4,6 --output .profiles/multi-head/shortlist-8.json
npm run benchmark:multi-head -- --shortlist 64 --heads 4,6 --output .profiles/multi-head/shortlist-64.json
```

`--prepare` fits the measured `8-colors-frontlit-2026-08-26/profile.kfil` through
the production importer/fitter: 26 Palette Proof rounds, 250 judgments, and one
1,024-cell Stack Matrix. Both cases use 0.08/0.4 mm layers and uniform priorities.
The cached JSON contains the complete model, stack, palette, and target mappings;
its SHA-256 and both final-stack fingerprints are recorded in every report.
`--input`, `--cases`, `--heads`, and `--modes` can restrict a replay.

- **Cats:** all 128 opaque colors of the saved 576×576 image, ordered as
  `useSwatches` does. The 12-run order comes from `cats/case.json`'s `replayResult`,
  with its 5.92 mm cap, 0.9 transition opacity, and preserve-separation settings.
  Preparation injects only that order into a temporary copy of Auto-paint; the
  current production stack construction and target mapping produce 70 layers and
  fingerprint `final-stack-v1-9684249d4a77bb3c`, which preparation asserts.
- **Rocco:** the existing regression's deterministic palette: every fourth pixel,
  5-bit RGB buckets, averaged channels, the 64 most frequent buckets with their
  counts. Standard Auto-paint uses the same measured model, automatic height, and
  its ordinary transition opacity; it produces 41 layers, eight runs, and
  fingerprint `final-stack-v1-8efddb6a6515bd5e`.

The historical cats Exact golden is **not** a validated preparation shortcut on
this base. A fresh Exact preparation was attempted and completed with fingerprint
`final-stack-v1-9cc07906da622021`, differing from the checked-in
`final-stack-v1-a4cfc2a6dae4f1ac`; its assertion failed before saving that result.
The matrix here therefore compares the explicitly reconstructed order above,
not that fresh Exact output or the issue's original numeric table. The original
fixture and captured artifacts were left unchanged. `--prepare --reoptimize`
can explicitly prepare a newly optimized case for a separate experiment.

Timings cover the run analysis, nozzle scheduling, and the normal full-model
build gate. They exclude preparation, mesh generation, and file export. A separate
preview replay is timed for measurement, but is not added twice to build time.
All heads 2–8 and both grouping modes are run sequentially; first-call setup and
JIT costs are included. Reports contain path hashes for deterministic replays.

## Measurements (2026-11-01)

Windows, AMD Ryzen 9 5950X (16 physical cores), Node v24.19.0. One unprofiled
pass per full-matrix combination. This was a shared development machine;
the baseline tail, candidate matrices, and validation overlapped. Treat timings
as approximate observed wall time, not isolated medians or latency guarantees.
The initial baseline process ended after saving 27 rows; eight-head Color-based
Rocco was replayed separately and its measured row was added, with provenance
retained in the merged report and separate resume report.
The four-head default-size replay reproduced all four path hashes and gains
exactly in both modes/cases. Repeating preparation also produced byte-identical
input JSON. All compared reports use input SHA-256
`5b85a3af7d84112ea067953247d02507bc5e13df0d8ae208635403a76668712d`.

Across the same 28 combinations, fallback fell from **19/28** to
**1/28**. Every candidate predicted gain was at least the baseline's,
and every previously accepted build remained accepted. The maximum candidate
analysis-plus-build-gate time was **32.58 s**.
The sole retained fallback is two-head Layer-based Rocco (gain 0.131).
The minimum accepted candidate gain is 0.386,
so the 0.25 gate does not reject the measured useful candidate layouts. There is
no print evidence supporting a different threshold; it remains a conservative
policy choice rather than a physically validated perceptual boundary.

Gain is the reduction in full-model, usage-weighted mean CIEDE2000 against the
original single-head snapshot: **positive is better**. A no-window result has
gain zero. Times below are analysis plus the normal corrected-color build gate,
in seconds; they exclude the extra standalone preview measurement.

### Cats / Layer-based

| Heads | Baseline gain | Full gain | Baseline s | Full s | Fallback, old → new |
|---:|---:|---:|---:|---:|:---|
| 2 | 0.000 | 0.386 | 0.553 | 1.497 | yes → no |
| 3 | 0.000 | 0.980 | 0.024 | 1.826 | yes → no |
| 4 | 0.000 | 1.070 | 0.093 | 2.702 | yes → no |
| 5 | 0.000 | 1.195 | 0.801 | 6.224 | yes → no |
| 6 | 0.000 | 1.111 | 7.499 | 10.939 | yes → no |
| 7 | 0.000 | 1.304 | 22.622 | 28.256 | yes → no |
| 8 | 0.000 | 1.733 | 21.407 | 26.457 | yes → no |

### Cats / Color-based

| Heads | Baseline gain | Full gain | Baseline s | Full s | Fallback, old → new |
|---:|---:|---:|---:|---:|:---|
| 2 | 0.000 | 0.518 | 0.007 | 1.393 | yes → no |
| 3 | 0.000 | 1.149 | 0.015 | 2.926 | yes → no |
| 4 | 0.000 | 1.425 | 0.085 | 4.599 | yes → no |
| 5 | 0.000 | 1.845 | 0.855 | 12.774 | yes → no |
| 6 | 0.000 | 1.657 | 8.144 | 12.583 | yes → no |
| 7 | 0.000 | 1.827 | 23.866 | 32.580 | yes → no |
| 8 | 0.000 | 2.481 | 23.084 | 29.383 | yes → no |

### Rocco / Layer-based

| Heads | Baseline gain | Full gain | Baseline s | Full s | Fallback, old → new |
|---:|---:|---:|---:|---:|:---|
| 2 | 0.000 | 0.131 | 0.002 | 0.044 | yes → yes |
| 3 | -0.822 | 1.080 | 0.040 | 0.080 | yes → no |
| 4 | 0.099 | 1.189 | 0.159 | 0.172 | yes → no |
| 5 | 0.222 | 1.195 | 1.708 | 0.560 | yes → no |
| 6 | 0.490 | 1.390 | 29.270 | 5.341 | no → no |
| 7 | 0.490 | 1.390 | 43.317 | 4.799 | no → no |
| 8 | 0.490 | 1.390 | 44.105 | 4.321 | no → no |

### Rocco / Color-based

| Heads | Baseline gain | Full gain | Baseline s | Full s | Fallback, old → new |
|---:|---:|---:|---:|---:|:---|
| 2 | 0.000 | 0.419 | 0.002 | 0.147 | yes → no |
| 3 | 1.223 | 1.668 | 0.092 | 0.399 | no → no |
| 4 | 2.872 | 3.038 | 0.816 | 0.527 | no → no |
| 5 | 3.081 | 3.298 | 11.882 | 0.901 | no → no |
| 6 | 3.398 | 3.636 | 232.814 | 6.207 | no → no |
| 7 | 3.554 | 3.777 | 406.658 | 5.268 | no → no |
| 8 | 3.554 | 3.777 | 306.585 | 5.027 | no → no |

The largest observed increase is about 11.92 s (five-head Color-based cats),
where the baseline opened no windows. Seven-head Color-based cats rises from
23.87 s to 32.58 s. This is an acceptable observed cost for Balanced worker
search because it now produces useful routes while staying below 33 s in this
matrix. Rocco improves substantially at high head counts; seven-head Color-based
falls from 406.66 s to 5.27 s. This is a judgment about these measured cases,
not a general runtime bound.

### Shortlist-size check

Eight combinations (four and six heads, both cases and modes) were measured at
sizes 8 and 64, alongside the size-32 matrix. Size 32 captures at least 97.1% of
the size-64 gain at every sampled point. Size 8 loses about 0.424 CIEDE2000 gain
on six-head Color-based cats; size 64 adds only 0.003–0.004 on four-head cats
while those observed runtimes rise from 2.70/4.60 s to 4.92/7.94 s. Keep 32 as
the bounded compromise. Size-8/64 results at other head counts are unmeasured.

| Case / mode / heads | Size 8 gain / s | Size 32 gain / s | Size 64 gain / s |
|:---|---:|---:|---:|
| cats / luminance / 4 | 1.044 / 1.811 | 1.070 / 2.702 | 1.074 / 4.920 |
| cats / luminance / 6 | 0.947 / 10.001 | 1.111 / 10.939 | 1.144 / 11.906 |
| cats / color / 4 | 1.322 / 1.766 | 1.425 / 4.599 | 1.429 / 7.940 |
| cats / color / 6 | 1.234 / 11.078 | 1.657 / 12.583 | 1.694 / 15.140 |
| rocco / luminance / 4 | 1.128 / 0.082 | 1.189 / 0.172 | 1.189 / 0.227 |
| rocco / luminance / 6 | 1.390 / 5.027 | 1.390 / 5.341 | 1.407 / 5.119 |
| rocco / color / 4 | 3.009 / 0.243 | 3.038 / 0.527 | 3.078 / 0.628 |
| rocco / color / 6 | 3.595 / 5.724 | 3.636 / 6.207 | 3.661 / 5.969 |

Raw measured reports: [baseline](results/multi-head-appearance/2026-11-01-baseline.json), [shortlist-32](results/multi-head-appearance/2026-11-01-shortlist-32.json), [shortlist-8](results/multi-head-appearance/2026-11-01-shortlist-8.json), [shortlist-64](results/multi-head-appearance/2026-11-01-shortlist-64.json), [shortlist-32-repeat](results/multi-head-appearance/2026-11-01-shortlist-32-repeat.json), [baseline-8-resume](results/multi-head-appearance/2026-11-01-baseline-8-resume.json).

## Limits

Fast and Thorough runtime, other images/profiles/layer settings, non-uniform
priority benchmark matrices, browser-worker transfer time, complete geometry and
export wall time, and physical print quality are not measured here. Regression
tests cover those paths' relevant invariants, including original home layers,
zero-weight printable colors, regional weights, changed substrates, multiple
windows, routed physical heads, geometry, exports, and schedules. More heads or a
larger shortlist do not guarantee a better result.

## Validation

- `npm test`: 1,034 passed, zero failures/skips. Includes auto-paint, appearance,
  multi-head build/geometry/schedule/wiring, 3MF/export, meshing/topology, and
  localization coverage.
- `npm run lint`: passed.
- `npm run build`: passed, including translation, release-note, guide, and diagram
  checks, TypeScript, Vite, and all 12 localized public-page builds.
- Full size-32 matrix: 28 measured combinations. Size-8/64 pilots: eight each.
  Four-head replay: all four path hashes and gains exactly reproduced.
- Benchmark report assertions: no predicted-gain regression in any of the 28
  comparisons and no loss of previously accepted builds. `git diff --check`
  passed.

Self-review added a seeded integration regression covering 120 corrected-stack
cases with uneven and zero usage weights, both grouping modes, and 2–4 heads.
After that addition, all 67 focused analysis/appearance tests, lint, TypeScript,
and diff checks passed. The 1,034-test full-suite run above predates this one new
test; production code and the measured benchmark inputs/results are unchanged.

## Integration with merged filament requirements (#114)

Before opening the #113 PR, the branch was updated to develop commit
`45120d14ea19136c65387609c2ae2f157341fae5` (merged #116 / issue #114).
The combined code at `dae8494ba1e6e7ec95d7d1f91455ef751e76f97d` passed all
1,050 tests, lint, and the full build. All 98 focused search, requirements,
build, and schedule tests also passed after resolving the overlap. Assertions
that used removed analyzer bookkeeping now check actual paths/windows; the
Rocco schedule regression checks every printed layer and exact window filament
requirements on the measured profile, rather than comparing swap counts with
an older profile/search objective.

A fresh 28-case replay on this combined code reproduced every default-size
filament-path hash, predicted gain, and fallback outcome exactly. One case still
falls back. Its maximum observed analysis-plus-build-gate time was 27.27 s;
these remain shared-machine, single-pass observations. The historical tables
above retain their original recorded timings. The integration replay is saved
separately in [the post-#114 report](results/multi-head-appearance/2026-11-01-after-issue-114.json).
