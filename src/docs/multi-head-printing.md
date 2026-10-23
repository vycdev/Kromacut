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

When K^N is small enough, every depth checks all of it; the sampling only kicks in on large windows. The sample is fixed (no randomness), so rebuilding with the same inputs gives the same result. Search depth does **not** change which image colors are considered — every depth uses the same target colors.

The analysis runs in a background worker, so the interface stays responsive while a deep search runs, and leaving the 3D panel cancels an in-progress run.

The generated stacks and swap plan depend on your inputs, so changing any of these and rebuilding can change the schedule:

- **Head count** — more heads mean larger windows and, usually, fewer pauses.
- **Search depth** — a deeper search can pick different filament assignments.
- **Filament list and calibration** — the available filaments and their hiding distances drive every color match.
- **Layer height and first-layer height** — these set where run and window boundaries land.

Multi-head settings (mode, head count, and search depth) are remembered between sessions along with the rest of your auto-paint setup.

Next: [Generating and exporting output](generating-exporting-output).
