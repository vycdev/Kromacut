# Auto-paint benchmark

For diagnostics-only, training-isolated Matrix prediction checks, see
[Offline Matrix end-to-end validation](appearance-validation.md). Run `npm run benchmark:appearance -- --help`
for profile/desktop-trace inputs and reporting options. Unlike optimizer quality scores below, it
compares predictions with withheld photographed measurements, not image targets.

To prepare physical checks with full-profile predictions frozen before printing, see
[Frozen diagnostic print strips](diagnostic-print.md). The separate `diagnostics:print` command
exports numbered 3MF specimens, complete recipes, provenance and source snapshots without
changing calibration or running the optimizer.

To compare current-code predictions with an existing bundle, use the separate
[post-print replay](diagnostic-print.md#replay-predictions-after-a-model-change) workflow.

Run `npm run benchmark:autopaint > benchmark.json` to create a local JSON report. It is deliberately outside normal tests: it measures quality and cost across the saved profiles and image fixtures.

Run `npm run benchmark:hotpaths` for a short, deterministic comparison of the transition mapper, preserve-separation mapper, six-filament Exact search, full-image spatial weighting, and large-palette order reconciliation. Treat its checksums, optimizer score/order, layer count, and final-stack fingerprint as correctness gates: timing improvements are acceptable only when those values remain identical.

Run `npm run benchmark:calibrated` for the slower real-world eight-filament Exact K-logo case, `npm run benchmark:calibrated -- cats` for the 128-color Exact cats case, `npm run benchmark:calibrated -- desk-landscape` for the 128-color Thorough landscape case, or `npm run benchmark:calibrated -- prismatic-portrait` for the 128-color Thorough portrait case. They load the dated profile under `tests/assets/performance`, fit all saved Palette Proof and Stack Matrix evidence through the production path, then assert the case-specific optimizer result. Use these benchmarks when changing calibrated appearance lookup, preserve-separation scoring, optimizer traversal, optimizer memory behavior, or complex model-build performance. The legacy `benchmark:calibrated-exact` command remains an alias.

Run `npm run profile:calibrated -- cats` to capture a compact V8 sampling profile without Chrome's Performance trace buffer. The command writes `optimizer.cpuprofile`, a readable Markdown hot-function summary, and machine-readable summary JSON under `.profiles/<timestamp>-<case>`. The raw profile can also be loaded into Chrome DevTools. Other calibrated case names are accepted in place of `cats`.

Run `npm run profile:compare` after collecting multiple profiles to write `.profiles/comparison.md` and `.profiles/comparison.json`. The comparison includes only enriched runs when they are available, so older hotspot-only captures do not accidentally receive equal weight.

Run `npm run benchmark:calibrated-series -- cats thorough 3` for sequential, unprofiled repetitions of a calibrated workload. It rejects output that differs from the checked-in known-good result as well as nondeterministic output, then reports median timing, peak memory, and heap retained after an explicit GC under `.profiles/series`. Recorded non-baseline goldens currently cover `cats/separation-off`, `cats/repeats-0`, `cats/thorough`, and `k-logo/delta-e-40`; other case/variant pairs are rejected until an explicit golden is added.

The main number is `realizedError.weightedMean`. It replays the preview's Lab-space color-to-height projection and compares the virtual color at that printable height with the target color. Lower is better.

For a controlled comparison between revisions, override the captured automatic seed with the same explicit value and bypass the revision-specific golden assertions:

```sh
npm run benchmark:calibrated -- desk-landscape baseline --seed 1263681357 --report-only
```

The benchmark passes the fixture or override seed through to the production optimizer and reports weighted mean, p95, and coverage at Delta E 6. Use the same case, settings, and seed on both revisions; multiple fixed seeds are preferable for stochastic search tiers.

For Phase 3 and later, accept a change only when average realized error improves, no fixture regresses by more than 5%, and the 8-filament case stays within a 2-second budget on the comparison machine. Record the machine and the command when comparing reports.
