# High-target Auto-paint search (#103)

Measured on 2026-11-15, Windows, AMD Ryzen 9 5950X, Node v24.19.0. Baseline:
`31b3881d1cdcb3cd24eee50d207aa141a3ce8fab` (develop). Seed: **12345**.
Raw samples: [before](results/high-target-search/before.jsonl) and
[after](results/high-target-search/after.jsonl).

## Workload and reproduction

```sh
node --no-warnings --experimental-strip-types tests/benchmark/highTargetSearch.ts 16,1024,4096,16384,142066 --search
```

Run the same driver against both revisions. For this comparison, the baseline's
`autoPaint.ts` and `optimizer.ts` were extracted with `git show` to temporary
sibling modules, with their mutual imports redirected to those baseline modules.
The driver loaded those modules for the baseline, then the current modules in a
fresh process. The temporary modules were removed afterward. The Vite module
loader uses middleware mode with HTTP and WebSocket listeners disabled.

The synthetic input permutes 24-bit RGB with an odd multiplier, guaranteeing
distinct colors, with weights 1–5. It is **not** the unavailable original photo
or its reconstruction from the issue. The four filaments and physical settings
match the issue: white HD 0.677, black 0.05, green 0.885, yellow 0.556; layers
0.12/0.20 mm, height cap 5 mm. No profile conversion or rounding changed.

Scoring warms all 24 four-filament permutations, then measures three batches of
24 uncached sequence evaluations at the default Detailed (90%) opacity. Every batch hashes all compact evaluation
fields, not just the selected order. Search uses Fast / Compact (80%), seed
12345, result caching off, and repeats 0 or 12. Searches are censored at the
first progress callback after 15 seconds; a censored run is not a completion
time, and its progress must not be extrapolated to an ETA. Timings vary with
JIT, GC, and host activity; these samples do not establish universal speedups.

## Scoring results

Median milliseconds per 24 candidates:

| Distinct targets | Before | After | Time reduction |
| ---: | ---: | ---: | ---: |
| 16 | 17.55 | 22.23 | −26.7% |
| 1,024 | 113.63 | 104.88 | 7.7% |
| 4,096 | 397.49 | 405.83 | −2.1% |
| 16,384 | 1,567.38 | 1,480.17 | 5.6% |
| 142,066 | 17,975.32 | 16,878.27 | 6.1% |

Evaluation fingerprints are **identical at every target count**. The optimization
reuses the exact winning rerank error in the objective, exact `Math.hypot`
chromas within a palette/target rerank, per-palette uncertainty penalties, and
per-segment squared lengths. It preserves arithmetic order, tie breaking,
target order/weights, percentile sorting, seeds, and optimizer traversal. The
workspace stores only one scalar error per target and resets it for each
palette. Exact anchors and separation retain their full-error fallback. No
colors are clustered, sampled, or approximated, and no cross-candidate target
mapping cache is retained.

## Threshold evidence

Before the change, complete Fast / Compact searches took:

| Distinct targets | Repeats off | Repeats 12 |
| ---: | ---: | ---: |
| 16 | 0.072 s | 1.455 s |
| 1,024 | 0.377 s | 6.756 s |
| 4,096 | 1.503 s | Still running after 15.015 s |
| 16,384 | 6.627 s | Still running after 15.047 s |
| 142,066 | Still running after 15.485 s | Still running after 15.114 s |

The initial Fast / Compact sweep informed a 4,096-target cutoff, but review
showed that it missed expensive default Balanced / Detailed searches with
repeats below that count. An expanded sweep on the same machine, seed, and
synthetic input uses the current exact scorer and a 45-second censor limit:

```sh
node --no-warnings --experimental-strip-types tests/benchmark/highTargetSearch.ts 512,1024,2048 --search-only --algorithm=balanced --opacity=0.9 --timeout-ms=45000
```

| Distinct targets | Repeats off | Repeats 12 |
| ---: | ---: | ---: |
| 512 | 0.260 s | 12.134 s |
| 1,024 | 0.305 s | 19.574 s |
| 2,048 | 0.570 s | 36.557 s |

All six runs completed; see [raw Balanced / Detailed results](results/high-target-search/balanced-detailed.jsonl).
**1,024** is the first sampled default-algorithm count exceeding 15 seconds with
repeats, so it is the revised advisory threshold for Enhanced matching. Applying
the same boundary across settings can also warn about cheap runs, such as Fast
with repeats off. It is a color-count advisory, not a time limit, ETA, or
guarantee that smaller palettes finish quickly: filament count, deeper search,
repeat budget, and hardware all affect runtime. Standard matching bypasses the
gate. The count excludes zero-weight targets, matching the worker's prepared
target count, and uses the printable image after optional isolated-speck cleanup
rather than pixel dimensions or the capped 2D swatch list.

Afterward, the 1,024-target repeated search completed in 6.613 s with the same
score and final-stack fingerprint (baseline 6.756 s); large repeated runs still
exceeded the censor limit. This is a modest exact optimization. Quantization
remains the effective way to reduce work by orders of magnitude, so guidance
and explicit cancellation are essential.

## Equivalence and UX regression gates

- `autoPaintSearchEquivalence.test.ts` compares complete final stacks, fingerprints,
  and exact scores against frozen pre-change scoring functions for all 12 existing
  enhanced image/profile cases (2/4/8 filaments, logo/JPEG, repeats on/off) and four
  synthetic searches with seed 12345. The reference contains the baseline commit's
  CIEDE2000, reranking, mapping, and evaluation functions, protected by a checksum
  and loaded in a separate module graph. Both paths execute on the runtime under
  test: literal fingerprints captured on Windows/Node 24 differ from Linux/Node 22
  and are unsuitable as portable goldens. Comparisons remain exact, with no numeric
  tolerance. The reference also checks reused workspaces through palette-size,
  exact-anchor, surface-eligibility, and separation changes.
- Existing Auto-paint goldens remain unchanged.
- `autoPaintSearchPolicy.test.ts` checks the revised exact boundary and standard-matching
  bypass; `auto-paint-search.spec.ts` checks the pre-search gate, the cheaper
  preset, running/debounced cancellation, stale progress, restart, input changes,
  settings round-trips for both Run and Cancel decisions, and leaving 3D. Both
  round-trip regressions fail before invalidating stale decisions. Its optimizer worker is held so races are deterministic;
  printable-image analysis uses the real worker. The debounce test uses a paused
  browser clock so its clicks cannot race the 250 ms timer on a slow CI host.
- To isolate smoke tests from another checkout, set `KROMACUT_E2E_PORT` and run
  the normal scripts. The verification used port **5287**, confirmed by its
  listener command line to belong to this worktree. Port 5173 was untouched.
