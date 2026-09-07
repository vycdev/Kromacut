# Calibrated optimizer performance fixture

This dataset captures a real eight-filament profile with accumulated appearance evidence across multiple optimizer workloads. Keep the checked-in normalized profile and reference artifacts byte-for-byte intact.

Reference 3MF files are stored through Git LFS because the real geometry artifacts can exceed GitHub's normal per-file limit.

The profile contains 26 Palette Proof rounds, 250 target judgments, and one completed 1,024-cell Stack Matrix. Individual image cases live in subdirectories so the same physical calibration can be benchmarked against more than one processed image.

Each case keeps its captured UI and 3MF summary in `observedResult` as immutable captured artifact/UI data. When current production behavior intentionally differs—because exported inputs cannot reconstruct hidden state exactly or because a correctness fix changes the prediction—a separate `replayResult` is the deterministic benchmark golden. Do not rewrite the observed result or artifact hashes to match a newer replay.

`k-logo/case.json` records the settings and observed result for the built-in `tests/assets/1024x1024p.png` image. The screenshots and generated 3MF are reference artifacts; benchmark code should consume the profile, source image, settings, and expected optimizer summary rather than parsing screenshots.

The captured UI used automatic height and produced a 6.00 mm result with 12 transition zones and 71 physical layers. The substrate-aware Stack Matrix correction intentionally changed the current replay, so the case now records that replay separately while retaining the supplied 3MF and captured result unchanged.

`cats/case.json` adds an unmodified 576 x 576, 128-color image using the same profile and 3D settings. Its captured automatic height resolves to 5.92 mm, with a substantially larger reference 3MF because the image geometry is more complex. This case is intended to expose both optimizer target-scaling costs and post-optimization model-build costs; its corrected current-code result is stored separately from the physical observation.

`desk-landscape/case.json` adds an unmodified 1,448 x 1,086, 128-color landscape image and its 87 MB reference 3MF. It uses Thorough search, a stricter maximum color error of Delta E 15, a 0.42 mm effective line width with at-risk colors retained, and a captured automatic height of 6.08 mm. This broadens coverage beyond Exact traversal and adds a large wide-aspect geometry/export artifact; the corrected current-code replay is stored separately.

`prismatic-portrait/case.json` adds an unmodified 1,024 x 1,536, 128-color portrait with a dense mix of saturated geometric regions and its 249 MB reference 3MF. It uses Thorough search, a maximum color error of Delta E 25, retained at-risk colors, and a captured automatic height of 6.32 mm. The supplied exported profile, source, and visible settings do not reproduce the captured optimizer order exactly, so the case deliberately records the UI/3MF observation and deterministic current-code replay separately instead of treating reconstructed output as artifact truth. The large portrait geometry also reproduces the development-mode printable-detail handoff that exposed React recursively inspecting megapixel typed-array props.
