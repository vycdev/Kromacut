---
title: Calibration Theory
slug: calibration-theory
order: 62
description: The optics and math behind hiding-distance, Palette Proof, and Stack Matrix calibration.
---

# Calibration Theory

Kromacut has three complementary calibration tools. **Hiding Distance** measures the physical opacity of each filament. **Palette Proof** asks you to rank a small set of printed candidates for colors that matter to one job. **Stack Matrix** photographs many known physical recipes and records their observed colors. They all feed the same Auto-paint stack model, but they answer different questions.

For the step-by-step wizard, see [3D mode](3d-mode).

## Why Thin Layers Blend

A print is viewed frontlit: light enters the top surface, passes down through the filament, reflects off what is underneath, and passes back out. A thin layer only partly hides what is below it, so the color you see is a mix of the filament's own color and the color showing through from beneath. Auto-paint uses this show-through to build in-between colors from a small filament set, which is why HD has to be accurate.

![Thin filament layers over a black base only partly hide it; each added layer multiplies the show-through until the stack matches the opaque filament color.](06_frontlit_hiding_distance.svg)

Kromacut models the show-through with a Beer-Lambert law. A thickness `d` of filament transmits

```
T = 10^(−d / HD)
```

of the underlying color. Each added layer multiplies the show-through, so a stack reaches opacity geometrically. The rate is a material property: a dense black hides in a fraction of a millimeter, a translucent white can need ten times the depth. That rate is the hiding distance.

The Transmission Distance printed on spool sheets, or measured with backlit TD test prints, describes light passing _through_ the filament once (lithophane-style). Frontlit viewing passes light through the layer twice and reads it against reflection, so a conventional TD is roughly 10× the hiding distance. Kromacut accepts conventional TD as input (the convert button on each filament row) but stores and simulates with HD.

## The Wedge

Camera-based color measurement is unreliable: cameras auto-correct, screens differ, and lighting shifts. The wedge avoids judging any color in isolation. Each tile prints patches of 1 to N filament layers over a base, with a **reference rail** of the same filament at full opacity beside them and a foot marking the 1-layer end.

![The calibration wedge: numbered patches of increasing layer count beside a fully opaque reference rail; you report the first patch that looks identical to the rail.](07_calibration_wedge.svg)

You report the **first patch that looks identical to the rail beside it**. The rail is the filament's own opaque color sitting millimeters away under the same light, so the comparison holds across rooms, screens, and prints. Thin patches show the base through; at some patch the difference drops below what the eye can distinguish, and that patch number is the measurement.

## From a Read to a Hiding Distance

The reported patch marks the thickness at which show-through dropped below a **just-noticeable difference (JND)**: the smallest visible color difference, about 2 ΔE00 in everyday viewing.

Kromacut solves this backward. For the filament color over the base color, it computes `T*`, the show-through that places the blended color exactly one JND from the opaque filament color. `T*` depends only on the two colors and the JND, with no hand-tuned opacity constant. The read gives the thickness at which the print reached that point, `d* = patch × layer height`, and Beer-Lambert inverts to:

```
HD = −d* / log10(T*)
```

![As layers stack, the color difference between patch and rail decays; the reported patch pins where it crosses one JND, and inverting the transmission law yields the hiding distance.](08_opacity_solve.svg)

Base contrast matters here: a black filament over a black base never differs from its rail by a full JND, so there is nothing to measure. The wizard detects this and assigns dark filaments a lighter base.

## Palette Proof Evidence

A Palette Proof compares real printed prefixes against colors from the current artwork. Kromacut keeps the physical layer recipe, its original HD prediction, the requested target color, and every answer. That lets one sheet provide two kinds of evidence without pretending every choice is an exact measurement.

**Best available** supports the selected recipe and rejects the unselected alternatives near that target, but does not force the selected patch to equal the target color. **Close** adds a partial local color correction. **Dead on** adds the strongest correction and preserves the exact tested opaque suffix as a direct anchor. Every selected patch in a tie receives support. **None** rejects plausible candidates near the target without inventing a correction direction.

These effects are local in both physical-recipe space and color space. Recent, optically dominant layers count most when Kromacut compares recipes; moving the same filament elsewhere in the recent stack is a weaker match. Evidence also fades as the simulated stack color or requested target moves away from the reviewed color. Several similar recipes that repeatedly lose near green targets therefore reinforce a local warning for nearby green stacks, while an unrelated red recipe is left alone.

Close and Dead-on corrections feed the same predicted Lab colors used by optimizer scoring and the final preview. Support and rejection evidence add a bounded target-aware optimizer preference, so repeated evidence can break a close numerical tie without overriding actual color error or exact anchors. The broader global lightness/chroma fit remains separate and must still pass its held-out validation gate. Local evidence and Dead-on anchors can remain useful when that global fit is gated, and all derived parameters are rebuilt deterministically from the saved raw judgments.

## Stack Matrix Calibration

The Stack Matrix starts as a LUT-style measurement rather than another opacity-wedge solve. A recipe is a fixed number of real filament layers over one opaque foundation. For `N` selected filaments and `L` recipe layers there are `N^L` possible recipes. Kromacut prints all of them when they fit the selected board capacity. When they do not, it evaluates a deterministic pool distributed across the recipe-index space with the existing per-channel HD values, converts the predictions to Lab, keeps every pure-filament recipe, and fills the remaining cells with a farthest-color selection. The pool is bounded for very large spaces, avoiding an exhaustive `N^L` scan while retaining reproducible broad coverage. The saved HD measurements therefore remain the priors that plan the board and initialize its physical model.

The matrix prints face-up so its foundation, first-layer thickness, and following recipe layers use the same physical order as a normal Kromacut build. Four corner recipes identify orientation and define the perspective transform. After printing, photograph the face under diffuse front lighting. Kromacut estimates the board, then lets you drag four numbered marker-center handles with a magnified crosshair. An exact projected cell grid and a live rectified preview make perspective, tilt, and skew errors visible before Kromacut samples a central inset in each cell's own projective coordinates. This per-cell inset stays away from borders even when perspective makes one side of the board much narrower. Low-confidence or manually adjusted alignment requires explicit review confirmation, and that confidence and review state are saved with the measurements. Raw sampling is the conservative default. Optional reference-marker correction estimates a per-channel lighting gain from the four known marker recipes, which can reduce a color cast but can also hide a real lighting-dependent difference.

A completed matrix stores predicted and photographed sRGB colors beside the immutable physical recipes in the named filament profile. All stored compatible matrices jointly refit one effective physical model while keeping the saved swatch colors, HD calibration, and raw matrix measurements untouched. The fit treats those saved values as regularized priors, then uses every weighted matrix sample to estimate effective RGB-channel HD, effective opaque filament color, a nonlinear transmission exponent for contiguous runs of one filament, and an ordered interaction between the visible filament and the substrate below it. Sparse evidence stays on the original priors, and a fitted model is used only when there are enough samples and it improves mean matrix ΔE. This lets measurements of actual stacked PLA correct systematic behavior that an opacity wedge alone cannot observe without turning camera-derived values into a replacement HD calibration.

The compatible matrices also remain scattered empirical LUTs in predicted Lab and physical recipe space, so a newer sparse board does not erase recipes measured by an earlier board. Kromacut weights each board by reviewed alignment confidence, measured recipe coverage, recency, and robust agreement with recipes measured by at least two other boards. With only one or two observations of a recipe, agreement remains neutral because there is not enough evidence to identify an outlier. An exact fixed-depth layer recipe combines its photographed Lab observations directly. A missing recipe combines deterministic inverse-distance interpolations of nearby photographed Lab values, with physical layer order weighted toward the optically dominant top layers. Interpolation is allowed only inside each matrix's local predicted-Lab coverage and a bounded recipe neighborhood; otherwise the jointly fitted physical model is used. Outside compatible matrix evidence, that model falls back to the saved Beer-Lambert/HD priors. This avoids unsupported photo extrapolation while letting both optimizer scoring and the final preview share the same prediction. Dead-on Palette Proof anchors still take priority over matrix evidence, and matrix cells are observations rather than desired image targets, so printing a broad matrix does not make the optimizer chase every sampled color.

## Prediction Uncertainty

Every printable prefix receives a confidence alongside its predicted Lab color. The confidence keeps four inputs visible instead of collapsing them into unexplained certainty:

- **Measurement distance:** predicted-color distance and physical-recipe distance to the nearest compatible measured recipe.
- **Local agreement:** whether nearby samples describe a consistent correction from simulated to photographed color.
- **Held-out error:** every matrix recipe is predicted once without using its own empirical sample, while the effective physical model is refitted in deterministic folds and evaluated on the omitted cells.
- **Prediction method:** an exact physical observation starts with more support than interpolation, a fitted estimate, or pure Beer-Lambert simulation.

The optimizer adds at most five ΔE-equivalent points for a wholly uncertain match. This is large enough for an empirically supported near-match to beat a speculative perfect-looking gray, but it remains bounded so evidence confidence cannot overwhelm major visible color error. Dead-on anchors keep their explicit priority, and Preserve color separation still judges feasibility against raw ΔE00 rather than the risk-adjusted cost. Optimizer palettes, final preview layers, and saved target mappings retain the same confidence object, preventing search and rendering from silently using different evidence assumptions.

Photo calibration is inherently sensitive to the camera, exposure, glare, white balance, and viewing light. The camera-free wedge remains the preferred way to measure material HD. Use a Stack Matrix when you want broad empirical recipe colors under a controlled setup, and use Palette Proof when you care most about a few colors in one image.

## Per-Channel Hiding Distances

Filaments do not absorb red, green, and blue equally (an orange filament passes red but blocks blue), so a single scalar HD is an approximation. Kromacut blends with three per-channel hiding distances:

- **One base read (Quick mode):** RGB values are estimated from the filament's swatch color, anchored so the brightest (most transmissive) channel matches the measured scalar HD.
- **Multiple base reads (Accurate mode):** each base stresses different channels (a red base reveals red transmission, a white base exercises all three). Kromacut fits the per-channel triple that best predicts all reads at once, replacing the color estimate with a measured result.

## The Session JND Fit

The default JND of 2 ΔE00 is a human-vision constant, but a given viewer and lighting may sit slightly off it. When a session has at least two filaments with multi-base reads, Kromacut also fits a single shared JND (1 to 3) that best explains every read together. The fit is kept only when it clearly beats the default; otherwise the session uses the constant.

## Confidence

Each calibration carries a confidence score for how well the measurement was pinned down:

- A read at either end of the wedge (patch 1, or the last patch) lowers confidence: the true opacity point may lie outside the printed range. Print a longer wedge or a finer layer height and recalibrate.
- Multi-base reads that disagree under the best fit lower confidence, and the disagreement is noted on the calibration.
- Confidence decays after six months, as filaments age and spools change.

Uncalibrated filaments get a lower score based on how plausible their estimated HD is.

## What Changes After Calibrating

Per-channel hiding distances feed both the **colors** auto-paint predicts for each stack and the **thickness** of its transition zones. Calibrating can change generated stack heights and the swap plan, not just the preview.

A calibration belongs to the material it measured: it is tied to the swatch color it was calibrated for, editing the filament's color deactivates it, and recalibrating replaces the previous measurement rather than averaging into it.
