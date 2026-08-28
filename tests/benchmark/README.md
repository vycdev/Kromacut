# Auto-paint benchmark

Run `npm run benchmark:autopaint > benchmark.json` to create a local JSON report. It is deliberately outside normal tests: it measures quality and cost across the saved profiles and image fixtures.

Run `npm run benchmark:hotpaths` for a short, deterministic comparison of the transition mapper, preserve-separation mapper, six-filament Exact search, full-image spatial weighting, and large-palette order reconciliation. Treat its checksums, optimizer score/order, layer count, and final-stack fingerprint as correctness gates: timing improvements are acceptable only when those values remain identical.

Run `npm run benchmark:calibrated` for the slower real-world eight-filament Exact K-logo case, `npm run benchmark:calibrated -- cats` for the 128-color Exact cats case, `npm run benchmark:calibrated -- desk-landscape` for the 128-color Thorough landscape case, or `npm run benchmark:calibrated -- prismatic-portrait` for the 128-color Thorough portrait case. They load the dated profile under `tests/assets/performance`, fit all saved Palette Proof and Stack Matrix evidence through the production path, then assert the case-specific optimizer result. Use these benchmarks when changing calibrated appearance lookup, preserve-separation scoring, optimizer traversal, optimizer memory behavior, or complex model-build performance. The legacy `benchmark:calibrated-exact` command remains an alias.

Run `npm run profile:calibrated -- cats` to capture a compact V8 sampling profile without Chrome's Performance trace buffer. The command writes `optimizer.cpuprofile`, a readable Markdown hot-function summary, and machine-readable summary JSON under `.profiles/<timestamp>-<case>`. The raw profile can also be loaded into Chrome DevTools. Other calibrated case names are accepted in place of `cats`.

Run `npm run profile:compare` after collecting multiple profiles to write `.profiles/comparison.md` and `.profiles/comparison.json`. The comparison includes only enriched runs when they are available, so older hotspot-only captures do not accidentally receive equal weight.

Run `npm run benchmark:calibrated-series -- cats thorough 3` for sequential, unprofiled repetitions of a calibrated workload. It rejects output that differs from the checked-in known-good result as well as nondeterministic output, then reports median timing, peak memory, and heap retained after an explicit GC under `.profiles/series`. Recorded non-baseline goldens currently cover `cats/separation-off`, `cats/repeats-0`, `cats/thorough`, and `k-logo/delta-e-40`; other case/variant pairs are rejected until an explicit golden is added.

The main number is `realizedError.weightedMean`. It replays the preview's Lab-space color-to-height projection and compares the virtual color at that printable height with the target color. Lower is better.

For Phase 3 and later, accept a change only when average realized error improves, no fixture regresses by more than 5%, and the 8-filament case stays within a 2-second budget on the comparison machine. Record the machine and the command when comparing reports.
