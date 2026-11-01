# Cats Exact reproducibility (#117)

The cats replay expectation was stale after intentional changes to calibrated
prediction and printable foundations. The captured `observedResult`, original
profile, image, screenshots, reference 3MF, and all captured artifact hashes remain
unchanged. This experiment is separate from the recorded-order #113 matrix.

## Fingerprint investigation

The replay golden was last refreshed by `176917cc3f59dc8392ac1f5524f89b978b7f3908`
on September 2. To isolate construction and prediction from search, the audit
loads each revision's source from `git archive` into an ignored directory, imports
the same profile through that revision's production importer, fits its appearance
model, and builds the old recorded order. Only order selection is bypassed; the
rest of Auto-paint is production code. No working checkout is changed.

All five audits use swatch SHA-256
`dcf074c26e02243d6b16f2e51146af64921182ef0b518f277c960ce406a99174`,
profile SHA-256 `42b7259d58a1babea72d7d9e561d6240338b111246312cc00ae418f23786d091`,
and source-image SHA-256
`e067bd7c3d89de2fd710997a65dd91199948038f3403f7325c90ab5add3fa7a9`.
The palette contains all 128 opaque colors and all 331,776 pixels in the same
reversed HSL order as the canonical calibrated benchmark.

| Source | Fixed-order fingerprint | Layers | Height mm |
|:---|:---|---:|---:|
| `176917c` (golden refresh) | `a4cfc2a6dae4f1ac` | 70 | 5.92 |
| `1e18d3d` (calibration constraints) | `92720b1ba6b05acf` | 59 | 5.04 |
| `f4de749` (prediction/printability correction) | `316e15e3209e780f` | 70 | 5.92 |
| `e8e8121` (measured-prefix continuation) | `9684249d4a77bb3c` | 70 | 5.92 |
| `c0ef02c` (merged develop) | `9684249d4a77bb3c` | 70 | 5.92 |

All fingerprints have the `final-stack-v1-` prefix. Reproducing the old fingerprint
exactly on its historical source rules out an input reconstruction discrepancy for
that saved final stack. `1e18d3d` constrained evidence use and adjusted transition
physics; `f4de749` aligned actual-prefix prediction and protected opaque printable
foundations; `e8e8121` added measured-prefix continuation and Matrix prediction
coverage. These changes are documented in their commits and have existing
prediction/printability regressions. Physical-layer and predicted-color hashes
change across these revisions, so this is more than a hash-format change.

At `e8e8121` and merged develop, the fitted model, physical layers, predicted
colors, target mappings, and final-stack fingerprint all match. Later height
dithering changes do not affect this fixture's disabled-dithering stack. The
fixed-order audit does not claim to have rerun historical Exact search or to
measure historical optimization runtime.

Inspection of `optimizer.ts` between the golden refresh and merged develop shows
diagnostic callbacks and equivalent retained-candidate bookkeeping, rather than a
new traversal or selection algorithm. The relevant single-head optimizer and
appearance sources are also unchanged between the issue's `3ede3177` base and
`c0ef02c`; the intervening multi-head merges do not explain this drift.

The [audit summary](results/cats-exact/2026-11-01/recorded-order-audit.json)
records those hashes. Its five compressed evidence files preserve the complete
results. [The artifact manifest](results/cats-exact/2026-11-01/artifact-manifest.json)
records compressed and uncompressed SHA-256 values. The old #113 order is frozen
in [its own file](results/multi-head-appearance/2026-11-01-recorded-cats-order.json),
so updating the current replay golden cannot silently change that experiment.

## Fresh Exact replay

The independent fresh run on merged develop reproduced
`final-stack-v1-9cc07906da622021`. Its full result was saved successfully before
the old iterations assertion failed (`773564` versus `772424`), demonstrating
that the expensive result survives a real stale-golden failure.

The current replay has 773,564 optimizer iterations, score 704000033.9608843,
11 filament runs, 70 physical layers, and 5.92 mm height. It uses four extra
occurrences across seven selected filaments. The separation report preserves 64
unique colors within the configured limit; the other 64 reuse printable colors.
All 128 mapped colors are within Delta E 20, with a maximum of
19.97267362401115. Partial matching remains allowed; this is not full unique
separation. The Exact-tier metadata correctly reports `best-found` and a
single-removal-minimal result, rather than global optimality with repeats.

The [initial full result](results/cats-exact/2026-11-01/fresh-exact-initial.json.gz)
has result SHA-256
`1b35967127485e938a5edd824e18c29e1ee559c7006ebeeb71e9cf81531d875b`.
Only `replayResult` is refreshed. `observedResult` and its artifact hashes retain
the captured UI/3MF observation. Cross-version scores and color counts use
different predictors and are not evidence of physical print improvement.

## Warmed runtime evidence (2026-11-01)

AMD Ryzen 9 5950X 16-Core Processor, 32 logical CPUs, win32 10.0.26300 / x64, Node v24.19.0. Production source is `c0ef02c1acd297261f0a1008f3216996556c9717` with an empty source diff. The executed harness and helpers are archived alongside the data, with byte hashes in the manifest.

### Single-head Exact

One complete warmup preceded two measured calls in the same Node process, with result caching disabled. The independent reproduction and warmup are excluded from the summary. The warmup overlapped the functional matrix pilot and validation; both measured calls ran sequentially after those jobs finished. This remained a shared host with uncontrolled background activity.

| Stage / unit | Sample 1 | Sample 2 | Median | Minimum to maximum | Spread |
|:---|---:|---:|---:|:---|---:|
| Appearance fitting / ms | 1547.215 | 1951.436 | 1749.325 | 1547.215 to 1951.436 | 404.221 |
| Exact optimization / s | 1155.997 | 1188.362 | 1172.180 | 1155.997 to 1188.362 | 32.365 |

The excluded full warmup took 2012.018 ms to fit and 1011.955 s to optimize. All four complete results (independent reproduction, warmup, and both measured calls) have the same full result SHA-256 shown above. Automatic seed resolution is recorded as `1767617981`; the fixture still requests automatic seeding. Two measured observations give a midpoint median and observed range, not a tail-latency estimate.

[The calibrated summary](results/cats-exact/2026-11-01/calibrated-series-summary.json) retains every timing sample, memory diagnostics, settings, evidence counts, and metadata. The measured runner printed its successful golden-validation summary. PowerShell nevertheless reported wrapper status 1 after converting routine redirected stderr progress into `NativeCommandError` records; [the original console log](results/cats-exact/2026-11-01/exact-repeated-console.log.gz) preserves that provenance. Independent [saved-result validation](results/cats-exact/2026-11-01/exact-validation-status.json) exited successfully and checked all four complete results against the updated golden. The final CLI restricts routine stderr progress to terminals and rejects existing output paths before fitting or optimization; the archived harness records the code actually measured.

### Fresh-stack multi-head matrix

Each of the 14 combinations had one full warmup followed by three measured calls: 56 total samples, including 42 measured samples. The matrix ran after the Exact process ended, without overlapping optimizer, test, lint, or build jobs from this task. The Node child process exited 0. Each sample asserts that the complete single-head reference remains unchanged, and every repeated path hash, gain, window count, and fallback outcome matches both its warmup and the independent functional pilot.

All 14 combinations build successfully; none falls back. Gains are full-model, usage-weighted mean CIEDE2000 reductions against the same `9cc07906da622021` snapshot. The unchanged gate is 0.25. These results provide no reason to lower it.

#### Layer-based

| Heads | Predicted gain | Analysis median s | Build-validation median ms | Total median s (min to max) | Fallback |
|---:|---:|---:|---:|:---|:---|
| 2 | 0.840612 | 0.636 | 29.006 | 0.675 (0.604 to 0.756) | no |
| 3 | 1.106691 | 1.792 | 31.994 | 1.824 (1.819 to 1.929) | no |
| 4 | 1.499083 | 2.578 | 43.421 | 2.623 (2.376 to 2.700) | no |
| 5 | 1.607486 | 7.854 | 58.143 | 7.919 (7.024 to 8.103) | no |
| 6 | 1.141753 | 8.894 | 44.857 | 8.953 (8.910 to 8.971) | no |
| 7 | 1.404187 | 20.101 | 44.808 | 20.149 (19.988 to 20.757) | no |
| 8 | 1.469251 | 16.060 | 49.101 | 16.109 (15.601 to 16.333) | no |

#### Color-based

| Heads | Predicted gain | Analysis median s | Build-validation median ms | Total median s (min to max) | Fallback |
|---:|---:|---:|---:|:---|:---|
| 2 | 1.092071 | 0.953 | 31.449 | 0.981 (0.979 to 1.034) | no |
| 3 | 1.374295 | 2.537 | 31.367 | 2.573 (2.404 to 3.215) | no |
| 4 | 1.817450 | 3.815 | 51.390 | 3.862 (3.805 to 4.254) | no |
| 5 | 2.087211 | 11.314 | 57.419 | 11.374 (11.115 to 11.525) | no |
| 6 | 1.495227 | 9.664 | 81.092 | 9.745 (9.678 to 10.694) | no |
| 7 | 1.791982 | 20.704 | 75.003 | 20.777 (20.681 to 23.148) | no |
| 8 | 1.869465 | 15.478 | 65.758 | 15.556 (14.893 to 16.269) | no |

The [raw matrix report](results/cats-exact/2026-11-01/fresh-exact-multi-head.json) contains every individual warmup/measured timing, each stage's medians/minima/maxima/ranges, predictions, decisions, and path hashes. The [complete cached input](results/cats-exact/2026-11-01/cases-exact.json.gz) has uncompressed SHA-256 `076ef1d6dc7460257ac445cd103b5437827a8ab138e12c28a074d94852b39dec`; decompress it and pass its JSON path through `--input` to replay the matrix without reoptimizing. More heads do not guarantee a larger gain.

## Reproduction

Use Node 24 with installed npm dependencies, from the repository root:

```sh
node --no-warnings --experimental-strip-types tests/benchmark/catsReplayAudit.ts 176917c 1e18d3d f4de749 e8e8121 c0ef02c
npm run benchmark:calibrated -- cats baseline --warmups 1 --runs 2 --output .profiles/issue-117/exact.json
npm run benchmark:multi-head -- --prepare --calibrated-result .profiles/issue-117/exact.json.measured-1.json --input .profiles/issue-117/cases-exact.json
npm run benchmark:multi-head -- --cases cats --input .profiles/issue-117/cases-exact.json --warmups 1 --runs 3 --output .profiles/issue-117/matrix.json
```

Every completed calibrated run is saved before quality replay or golden checks,
including warmups. Each evidence file contains the complete `AutoPaintResult`,
fitted model, filament list, ordered swatches, settings, input/result hashes,
timings, revision, source-diff hash, and machine/Node metadata. Existing evidence
files cannot be overwritten. `--report-only` bypasses revision-specific golden
checks while retaining structural and repeated-result assertions. `--source-ref`
can run historical production source with the same fixture reconstruction. The
ref is resolved once; the archived source and recorded source revision use that
commit even if the requested branch or tag moves during setup.
Git metadata and input/harness hashes are captured before fitting/search and
reused when saving, so later source edits or missing provenance files cannot
prevent saving a completed result or relabel it with the changed files.
Choose a new `--output` prefix for each series; known collisions are rejected
before fitting or optimization. Archived evidence is marked `-text` in Git so
its byte hashes survive checkout line-ending settings.

The recorded runs used the archived harness. Provenance capture, archived-ref
pinning, cached-input consistency, and case-selection checks were strengthened
during self-review; these setup changes preserve the exact cached input SHA-256
above. The 23 archived evidence artifacts and their hashes remain unchanged.

The multi-head preparation can consume a saved calibrated result, verifying its
result hash, cats palette, measured profile, physical grid, height cap,
separation settings, repeat budget, and fitted-model context without repeating
the expensive Exact run. It requires metadata from an uncached Exact search;
recorded-order audit results and optimizer cache hits cannot be labeled fresh
Exact input. Contradictory cached settings are rejected before writing the input.
Saved cats evidence defaults to selecting cats. Unknown preparation names,
missing option values, and explicitly requested run cases absent from the input
are rejected before replacing an existing input or report.
Head counts must be integers from 2 through 8, and grouping modes must be
`luminance` or `color`; unsupported values fail before preparation or measurement.
The report output must differ from the cached input and any saved Exact evidence
being consumed. Aliases through hard links and Windows path casing are rejected
before writing either input or report.
Replay also verifies complete optimizer results against any recorded preparation
checksum before measurement. A changed result cannot retain the original
`fresh-exact` provenance, and rejection preserves the input and previous report.
Ordinary `--prepare` continues to reconstruct the frozen #113 order;
`--prepare --reoptimize --cases cats` explicitly searches again and saves its full
result before checking expectations. Each multi-head sample is written before
determinism assertions. Warmup rows remain visible but are excluded from medians.

## Timing boundaries and limits

Appearance fitting times only `fitAppearanceRankModel` on imported profile
evidence. Single-head optimization times `generateAutoLayers` with result caching
disabled: order search, repeat tiers, minimization, physical stack construction,
and final target mapping. Module loading, input reconstruction, explicit GC,
evidence serialization, quality replay, and golden assertions are outside those
timings.

Multi-head analysis includes Balanced regional selection, full-model group
reconciliation, and nozzle scheduling. Build validation times
`multiHeadBuildSnapshot`, including corrected predictions, the unchanged 0.25
usage-weighted mean CIEDE2000 gate, conversion, and safe fallback validation.
Analysis is followed immediately by build validation; their sum is the reported
total. A separately timed preview and gain replay runs afterwards and is excluded
from that total, so it cannot warm the timed build first. None of these measures mesh
generation, STL/3MF export, or browser-worker transfer.

The Exact tier exhausts its base ordered-subset search; its configured repeat
search does not establish an exhaustive full-appearance global optimum.

These are model predictions, not measured print improvements. The shared machine
is not an isolated benchmark host. Other images, profile/settings variants,
search depths, non-uniform priorities, historical Exact runtime, geometry/export
time, and physical print quality are not remeasured for #117. Filament requirements
remain governed by merged #114 behavior.
Other calibrated cases, non-baseline variant goldens, and other hardware/Node
versions are unchanged and unmeasured by this follow-up.

## Validation

- `npm test`: 1,084 passed, with zero failures or skips and exit code 0 after self-review fixes.
- Thirty-four evidence/CLI regressions passed, covering full-result retention after
  a failed assertion or missing provenance sources, replacement refusal, swatch
  reconstruction, immutable captured observations/hashes, timing summaries, and
  cached grid/profile/palette/model consistency, genuine uncached Exact metadata,
  height caps, separation controls, repeat budgets, rejected case selections
  preserving existing inputs/reports, report paths aliasing saved inputs/evidence,
  invalid head counts/grouping modes, stale replay provenance, and archived
  source attribution when refs move.
- `npm run lint` and `npm run build`: passed after the final CLI changes.
- CLI regression subprocesses run asynchronously so pending Vite module imports
  can progress. Blocking launches caused two full-suite attempts to abort on a
  module-transport timeout; the final validation uses asynchronous launches.
- All four saved full Exact results pass independent current-golden validation.
  The output-collision check rejected a reused path in 2.34 seconds, before
  fitting/search, and left the existing evidence unchanged.
- All 56 matrix samples completed with Node exit 0; every repeated outcome and
  single-head reference hash is stable. All stage samples and spreads are saved.
- Ordinary recorded-order preparation still produces byte-identical #113 input
  SHA-256 `5b85a3af7d84112ea067953247d02507bc5e13df0d8ae208635403a76668712d`.
  Six two-head smoke samples also exactly reproduce its recorded paths, gains,
  window counts, and fallback decisions.
- Artifact hashes and compressed payload hashes verify; `git diff --check`
  passes. All validations are local; no test CI workflow is configured for PRs
  targeting develop.
