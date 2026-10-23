---
title: Multi-Head Printing
slug: multi-head-printing
order: 65
description: Group auto-paint layers into head windows to print more colors with fewer manual swaps.
---

# Multi-Head Printing

Multi-head mode lets an auto-paint model use more filaments than you could reasonably hand-swap one layer at a time. Instead of a single active filament that changes at every color boundary, the print keeps **N heads** loaded at once and only pauses to reload them at planned checkpoints. Kromacut works out which filament belongs on each head, and when, so the finished stack matches the target colors with the fewest swaps.

Multi-head is a post-processing step layered on top of [auto-paint](3d-mode): it takes the filament stack auto-paint already chose and reorganizes it across heads. It does not replace color reduction, calibration, or the auto-paint solve.

## Prerequisites

Multi-head mode appears in the **Auto-Paint** panel and is only available when:

- **Auto-paint is the active paint mode**, and
- at least one **filament** is loaded in the filament list.

The head count must be between **2 and 8**. The per-window search cost grows as K^N (filaments per head, across N heads), so the upper limit keeps a build bounded; higher values are clamped to 8. Calibrated filaments give better color matches here for the same reason they do in single-head auto-paint — see [Calibration theory](calibration-theory).

Multi-head mode and **Flat Paint** are mutually exclusive: turning one on turns the other off, because a flat face-down slab has no stepped layer stack for the head schedule to reorder.

If the analysis can't find any head layout that improves on the normal stack — or the background worker fails — the build falls back to a normal single-head model and tells you why. It never exports a multi-head file with guessed head assignments; adjust the head count or search depth and rebuild.

## Runs and Windows

Multi-head thinks in two units. A **run** is a contiguous block of layers printed with one filament; its height comes from the source color's brightness. A **window** is exactly **N consecutive runs**, where N is your head count. The printer holds all N heads for the duration of a window and only pauses at window boundaries.

![Print height split into color runs, with every N consecutive runs grouped into a window; the printer pauses at each window boundary to reload heads.](01_window_run_diagram.svg)

Grouping runs into windows is what saves swaps: within a window, up to N filaments are available with no interruption, so short color runs that would each need their own swap in single-head mode can share one pause instead.

## Choosing Filaments per Window

For each window, Kromacut evaluates filament-per-head assignments and keeps the one whose blended result is closest (lowest ΔE) to the window's target colors. Because reordering and repeats are allowed, the number of candidate combinations grows as **K^N** — K filaments across N heads.

![A grid of every filament-per-slot combination for a window, with the lowest-ΔE ordering marked best; a table shows how the K^N combo count grows with filaments and heads.](05_combo_search_space.svg)

The **Search depth** control moves two knobs together as this space grows — how many head windows the optimizer opens, and how many filament orders it tries within each one:

- **Fast** — opens fewer windows and samples a small, fixed set of filament orders per window. Quickest, roughest match.
- **Balanced** — the default; a good compromise for most images.
- **Thorough** — opens as many windows as fit and searches filament orders near-exhaustively. Slowest, best match.

When K^N is small enough, every depth checks all of it; the sampling only kicks in on large windows. The sample is fixed (no randomness), so rebuilding with the same inputs gives the same result. Search depth does **not** change which image colors are considered — every depth uses the same target color groups (see [Color Grouping](#color-grouping)).

The analysis runs in a background worker, so the interface stays responsive while a deep search runs, and leaving the 3D panel cancels an in-progress run.

## Color Grouping

Before the search runs, Kromacut groups your palette into the target colors it will try to reproduce. The **Color grouping** control decides how:

- **Layer-based (current)** — colors that map to the same print height are merged into one target. Because height is driven by brightness, two colors of similar brightness but different hue collapse together. This caps the number of distinct colors at roughly the number of printer layers, no matter how many colors your image was quantized to.
- **Color-based (per-hue)** — distinct hues are kept as distinct targets even when they share a height, so the optimizer can try to reproduce them separately.

Color-based grouping removes the height-collapse bottleneck, but it is not an automatic "more colors" switch. How many distinct colors actually appear also depends on how many head **windows** the optimizer opens: colors only diverge from the shared base stack inside a window, so the benefit grows with your **head count** and can be small — or occasionally negative — at low head counts (for example, two heads). It also asks the optimizer to solve for more targets, so builds take longer, and the number of color groups is capped to keep the search bounded. As always, the colors you can actually get are limited by what your loaded filaments and head swaps can physically make at each height.

Treat this as a setting to try per-image rather than a guaranteed win: build with each option and keep whichever looks better for your print.

## Why Head Order Matters

The heads in a window are not interchangeable. Frontlit color is built by light passing down through the stack and back out, so the **outer layers dominate** the perceived color (the same Beer-Lambert blending described in [Calibration theory](calibration-theory)). The same three filaments in a different per-layer order produce a different color.

![The same three filaments in two different layer arrangements produce two different perceived colors, because outer layers dominate the frontlit blend.](03_beer_lambert_blending.svg)

This is why the search evaluates orderings rather than just filament sets, and why the head assignment for a window is specific, not arbitrary.

## The Head Schedule

Build the model to generate the schedule. It appears as **Head Schedule** in the Print Instructions panel — until then the panel prompts you to build. The schedule lists, in layer order:

- a **before-print** setup showing the filament to load on each head, and
- a **swap checkpoint** at each layer where one or more heads change filament.

![A compacted nozzle swap schedule showing which filament each head carries across windows, with the changed heads highlighted as swap events.](02_nozzle_swap_schedule.svg)

Only heads that actually change are flagged at each checkpoint, and windows that need no reload are merged away, so every listed pause is a real one. A head that a window does not use keeps whatever it is already carrying — and is pre-loaded with the filament it will need next — so a head's first use never costs an extra swap. A head that is never used anywhere in the print is marked **EMPTY**.

### Printing from the schedule

When you export to 3MF, the swap checkpoints are written into the file as **pause markers** (pause / `M600`) at their layers. During the print the machine pauses at each checkpoint; reload the heads flagged for that checkpoint according to the schedule, then resume. Layer heights in the schedule are approximate — confirm them in your slicer before printing.

Kromacut schedules swaps at pauses rather than driving physically separate extruders, so multi-head mode works on an ordinary single-nozzle printer.

## Settings That Change the Schedule

The generated stacks and swap plan depend on your inputs, so changing any of these and rebuilding can change the schedule:

- **Head count** — more heads mean larger windows and, usually, fewer pauses.
- **Search depth** — a deeper search can pick different filament assignments.
- **Color grouping** — Layer-based vs. per-hue grouping changes the target colors the search solves for (see [Color Grouping](#color-grouping)).
- **Filament list and calibration** — the available filaments and their hiding distances drive every color match.
- **Layer height and first-layer height** — these set where run and window boundaries land.

Multi-head settings (mode, head count, search depth, and color grouping) are remembered between sessions along with the rest of your auto-paint setup.

Next: [Generating and exporting output](generating-exporting-output).
