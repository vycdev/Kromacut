---
title: Generating And Exporting Output
slug: generating-exporting-output
order: 70
description: Build the model, inspect it, export files, and copy print instructions.
---

# Generating And Exporting Output

The export workflow starts after your 2D image and 3D controls are ready.

## Before You Export

Check these items:

1. In 2D mode, reduce the image to a practical number of colors.
2. In 3D mode, confirm **Pixel Size (XY)**, **Layer Height**, and **First Layer Height** match your slicer.
3. Choose **Manual** or **Auto-paint**.
4. Click **Build 3D Model**.
5. Inspect the model and the **Layer Preview**.

If Kromacut shows a **Performance Warning**, the build may be slow because of image size, pixel count, layer count, or similar workload. You can continue with **Build Anyway** or cancel and simplify the job.

## Build 3D Model

Click **Build 3D Model** whenever you want the preview and export geometry to reflect current 3D settings.

While building, Kromacut shows progress such as reading image color layers, mapping image colors, or building color layers. Export controls become useful again once the overlay disappears and the updated model is ready to inspect.

## Choose STL Or 3MF

Open the 3D download menu and choose:

| Format | Use it when                                                                                |
| ------ | ------------------------------------------------------------------------------------------ |
| STL    | You want a widely supported single-geometry model and will handle filament swaps manually. |
| 3MF    | You want color-aware output for slicers that can preserve multiple colored objects.        |

3MF export preserves physical filament colors in Auto-paint where possible. Still review slicer assignments before printing.

For **Flat Paint** models the download menu offers only 3MF: the model contains one object per physical filament plus a transparent carrier object, and an uncolored single-geometry STL of the flat slab would be useless. Flat Paint turns off **Smooth Meshing** because the flat slab layout does not use smoothed boundary contours.

## Print Instructions

The **Print Instructions** panel gives you:

- Recommended wall loops, infill, layer height, and first-layer height.
- **Start with Color**.
- **Color Swap Plan** with layer numbers and approximate heights.
- A **Copy** button for the full plain-text plan.

Use the copied plan beside your slicer preview. The layer numbers depend on **Layer Height** and **First Layer Height**, so keep those values consistent.

In Flat Paint mode there is no manual swap plan. The panel instead summarizes the multi-material workflow: assign each 3MF object to its filament, use clear filament for the carrier, and print without mirroring.

## Recommended Slicer Setup

Kromacut recommends:

- Wall loops: `1`
- Infill: `100%`
- Layer height: the value shown in **Print Instructions**
- First layer height: the value shown in **Print Instructions**

Always inspect the slicer preview before printing. Heights are approximate, and slicers can display layer changes differently depending on first-layer settings.

## Export Tips

- Build the model after changing 3D settings.
- Do not rely only on the visible layer preview trim; export includes the full model.
- If the model is very large, consider cropping the image or increasing **Pixel Size (XY)** only if the physical size still works for your print.
- If swap instructions are disabled because there are too many colors, return to [Reducing colors](reducing-colors#image-colors).

Next: [Settings and controls](settings-and-controls).
