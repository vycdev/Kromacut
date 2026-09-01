# Color optimization experiment decision, September 2026

## Decision

All experiments and the final integration use frozen `upstream/develop` commit
`36f88893674bba53c6d7edda5734ac127a13e269` with Node 22.23.2. No experiment is ready to
combine. The integration branch therefore contains this decision record only.

| State | Validation mean / p90 ΔE00 | Realized weighted mean / p95 / worst ΔE00; coverage@6 | Preserved / merged colors | Order, repeats, zones, layers, height, fingerprint | Evaluations, wall time, peak RSS | Repeatability | Decision |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Phase 1, grouped validation, `d25cfb62adf9b45cca283b912ef7d2a8f78a01f8` | Row folds `10.1604 / 15.3412` to grouped `10.6659 / 15.8939`; train mean stayed `10.1166` | Four-fixture average `9.4107 / 17.3137 / 26.7433; 26.42%` to `9.2380 / 17.1704 / 26.3891; 25.86%` | Total `168 / 243` to `166 / 245`; Desk coverage fell 2.49 points and one color was lost | Orders changed on Desk and Prismatic; `3-4` repeats, `10-12` zones, `52-70` layers, `4.48-5.92 mm`; per-fixture fingerprints are in phase-1 evidence | `139,487-771,794` candidate iterations, mean wall `264,872 ms`, max RSS `442,003,456 B`; timings were noisy | Two candidate runs matched optics state, anchors, realized metrics, and optimizer result | **Revise.** Leakage resistance and all 1,030 anchors are supported, but the single-matrix fallback and coverage/preservation tradeoff need broader profile evidence. Omit. |
| Phase 2, hybrid CIEDE2000, `faa656e2d01bfd817ca85bb3e5f93ec0339d7af0` | Not an optics-fit experiment | Eight-row fast aggregate `10.7690 / 21.1002 / 40.9917; 23.30%` to `10.6981 / 17.8761 / 23.7214; 18.51%` | Preserve rows total `104 / 307` to `140 / 271` | All eight fast orders changed; `0` repeats, `6-8` zones, `32-47` layers, `2.88-4.08 mm`; exact fingerprints are in phase-2 evidence | `589` evaluations per fast row; median runtime `1.2836x` baseline; max measured RSS `226,926,592 B` | Repeated fast run matched all 8 rows | **Revise.** Fast and fixed-palette results are promising and quality budgets pass, but coverage falls 4.79 points in aggregate. More importantly, the phase-4 Exact replay changed from the recorded `779,955`-iteration, 22/27-color result to an unreviewed `109,600`-iteration, 27/27-color result and failed the calibrated replay assertion. Omit until Exact behavior and its golden are deliberately validated. |
| Phase 3, incremental prefix, `b43d15adb3002099ae63bba2637b08d4b1044bbe` | Not an optics-fit experiment | Equivalent scores and palettes for all 109,600 no-repeat candidates; realized aggregate metrics were not separately recorded | Exact K-logo stayed `22 / 5` | Same order, `3` repeats, `10` zones, `52` layers, `4.48 mm`, `final-stack-v1-ef8db13469d7ed46` | `311,803` score evaluations; optimizer mean `417,326.642` to `409,759.674 ms`; mean RSS `284,059,648` to `263,178,240 B` | Four calibrated runs matched; exhaustive checksum matched with zero mismatches | **Discard.** End-to-end time improved only 1.8%, and the memory improvement was unstable. Omit. |
| Final retained state | Frozen-base row-fold values `10.1604 / 15.3412` | Eight-row fast aggregate `10.7690 / 21.1002 / 40.9917; 23.30%` | Preserve rows total `104 / 307` | `0` repeats, `7-8` zones, `36-46` layers, `3.20-4.00 mm`; orders and eight fingerprints are in `results/phase-4/final-combined/` | `589` evaluations per row; mean wall `724.78` and `725.22 ms`; max RSS `224,972,800` and `228,397,056 B` | Two runs matched every non-timing and non-memory field | **Keep frozen base only.** No experimental commit is cherry-picked. |

Wall-time and RSS figures come from each experiment's own isolated harness and are not compared across
harnesses. Phase 1 used calibrated fixture settings, Phase 2 used fixed fast/no-repeat settings, and
Phase 3 used calibrated Exact replay.

## Combined-state verification

The initially retained Phase 2 candidate was benchmarked on the integration branch rather than
accepted from isolated results. Its two eight-row fast runs reproduced the Phase 2 evidence exactly.
The required calibrated Exact K-logo replay then failed its immutable expected-result assertion:

- recorded baseline: 779,955 iterations, 22 of 27 colors preserved, 3 repeats, 10 zones, 52 layers,
  4.48 mm;
- candidate: 109,600 iterations, 27 of 27 colors preserved, 0 repeats, 6 zones, 36 layers, 3.20 mm,
  `final-stack-v1-29dc958559623ed7`.

The result may be useful, but Phase 2 did not measure or independently review that Exact behavior.
The commit was therefore reclassified from Keep to Revise and removed without changing the replay
fixture or weakening an assertion.

The final retained state is the frozen base. Two actual integration-branch fast replays matched all
orders, mappings, stack structures, quality metrics, and fingerprints. The complete Node 22.23.2
suite reproduced the frozen-base known failure only: 539 of 541 tests passed, with the B&W enhanced
repeat golden leaf and its parent failing. Lint and production build passed. The calibrated Exact
replay is expected to retain the separately documented frozen-base fingerprint mismatch; its raw
output is stored with the phase-4 evidence.

## Merge instructions

1. Merge none of PRs #75, #74, or #76 as currently written.
2. Use this decision-only branch for the durable experiment record.
3. Revisit Phase 1 after multi-profile grouped-validation evidence.
4. Revisit Phase 2 only after the Exact K-logo result, all Exact quality metrics, replay expectation,
   and coverage tradeoffs receive deliberate review.
5. Do not revive Phase 3 unless a new implementation demonstrates a material end-to-end gain.
