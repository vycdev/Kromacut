---
title: Calibration Theory
slug: calibration-theory
order: 62
description: The optics and math behind filament hiding-distance calibration.
---

# Calibration Theory

Calibration measures each filament's **hiding distance (HD)**: the depth at which it visually hides what is printed beneath it. Auto-paint's color model depends on this value per filament, so a measured HD is better than an estimate. This page covers what the calibration wedge measures and how Kromacut converts a single patch read into a full optical model.

For the step-by-step wizard, see [3D mode](3d-mode).

## Why Thin Layers Blend

A print is viewed frontlit: light enters the top surface, passes down through the filament, reflects off what is underneath, and passes back out. A thin layer only partly hides what is below it, so the color you see is a mix of the filament's own color and the color showing through from beneath. Auto-paint uses this show-through to build in-between colors from a small filament set, which is why HD has to be accurate.

![Thin filament layers over a black base only partly hide it; each added layer multiplies the show-through until the stack matches the opaque filament color.](06_frontlit_hiding_distance.svg)

Kromacut models the show-through with a Beer-Lambert law. A thickness `d` of filament transmits

```
T = 10^(−d / HD)
```

of the underlying color. Each added layer multiplies the show-through, so a stack reaches opacity geometrically. The rate is a material property: a dense black hides in a fraction of a millimeter, a translucent white can need ten times the depth. That rate is the hiding distance.

The Transmission Distance printed on spool sheets, or measured with backlit TD test prints, describes light passing *through* the filament once (lithophane-style). Frontlit viewing passes light through the layer twice and reads it against reflection, so a conventional TD is roughly 10× the hiding distance. Kromacut accepts conventional TD as input (the convert button on each filament row) but stores and simulates with HD.

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

Next: [Multi-head printing](multi-head-printing).
