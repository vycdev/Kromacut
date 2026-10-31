---
title: Multi-Head Printing
slug: multi-head-printing
order: 65
description: Plan filament assignments, head reloads, and 3MF exports for multi-head printing.
---

# Multi-Head Printing

Multi-head mode reorganizes the printable stack chosen by [Auto-paint](auto-paint). Each image region can use a different filament on the same layer. Several heads keep filaments available between manual reloads; the analysis seeks better predicted color matches and schedules the required reloads. Fewer pauses are possible, but not guaranteed.

## Prerequisites

- Use **Auto-paint** with at least one filament in its list, then enable **Multi-head mode**.
- Choose **2–8 heads** and a **Search depth**, then **Build 3D Model**. Analysis needs at least two available filaments to form a useful window.

Multi-head and **Flat Paint** are mutually exclusive. Calibrate the filaments you actually own; see [Calibration theory](calibration-theory). Mode, head count, and search depth are remembered between sessions. Rebuild after changing inputs.

## Runs and Windows

A **run** is a contiguous block of layers using one filament in the Auto-paint stack. Its thickness comes from the printable Auto-paint result, including calibration and height constraints, rather than source brightness alone.

A **window** spans N consecutive runs. N is limited by the selected head count, the available filaments, and the runs above the first run, which always keeps its filament; heads that are not needed stay **EMPTY** in the head schedule. The analysis selects useful, non-overlapping windows; it does not automatically group every run. Runs outside selected windows keep their planned filament and are included in the head schedule.

![Color runs grouped into example windows, with remaining runs retaining their planned filament.](01_window_run_diagram.svg)

## Choosing Filaments per Window

With K distinct filaments in a window and N run positions, there are **K^N** possible orders, including repeats. The analysis compares predicted blends using **ΔE** color difference and assigns an order to each image color region. A run position is not a fixed physical head: the schedule maps the required filaments to heads.

![Changing the order of the same filaments changes the predicted blend; the colors are schematic.](03_beer_lambert_blending.svg)

![The 27 orders for three filaments and three positions, with a table showing how K^N grows.](05_combo_search_space.svg)

**Search depth** controls how readily windows are selected, how many can be selected, and how many orders are tested:

- **Fast** uses fewer window-selection iterations and a smaller combination budget.
- **Balanced** is the default compromise between effort and coverage.
- **Thorough** allows more windows and a larger combination budget; it can still sample large search spaces.

Within each depth's budget, all combinations are tested. Larger spaces use a bounded, deterministic sample plus the current order. Identical inputs give repeatable results. Every depth considers the same image colors; deeper search does not guarantee a better physical print.

## Head Schedule and Export

After a successful build, the preview shows each region's routed, simulated color. **Physical colors** shows the actual filament instead. Open **Print Instructions** and follow the **Head Schedule**:

- Before printing, load each listed filament into its numbered head. Leave **EMPTY** heads unused.
- At each listed layer checkpoint, reload only the marked heads. Unchanged loads are retained; not every window boundary needs a pause.
- Export **3MF** to preserve routed geometry, physical filament colors, and head assignments. The file records the selected head count as extruders and adds **M600** pause markers at the schedule's swap checkpoints. STL does not preserve these assignments.

![Three heads retain unchanged filaments between phases; only changed head loads require manual reloads.](02_nozzle_swap_schedule.svg)

Use a compatible multi-head printer. Verify head mapping, first-layer and regular layer heights, and pause handling in your slicer before printing. One checkpoint can require reloading several heads.

## Fallback and Rebuilding

If analysis fails or finds no usable layout that improves the normal stack, the build produces a normal single-head model with a notice and its original start color and swap instructions. Try different filaments, a different head count, or another search depth, then rebuild.

Analysis runs in a background worker. Leaving the 3D panel or changing the image cancels pending analysis; build again for the new image. Instructions and exports describe the built model, so rebuild to apply changed settings.

Next: [Generating and exporting output](generating-exporting-output).
