---
title: Troubleshooting
slug: troubleshooting
order: 90
description: Common issues and what to try first.
---

# Troubleshooting

Start here when a result looks wrong or a control is disabled.

## Build 3D Model Does Not Update The Preview

3D settings are not applied until you click **Build 3D Model**. Change the settings you want, then build again.

## Swap Instructions Are Disabled

If the image has more than 64 colors, Kromacut disables swap instructions. Go back to **2D**, use **Quantization Settings**, and reduce the image to 64 colors or fewer.

## The Model Is Too Tall

Try these in order:

1. In Auto-paint, set **Max Height** lower and watch for compressed transition zones.
2. In Manual mode, check the image color count. Many colors create many stacked slices, so the model naturally becomes taller.
3. Reduce colors in **2D** if you do not need every color as a separate printed layer.
4. In Manual mode, reduce one or more color slice heights.
5. Confirm **Layer Height** and **First Layer Height** match your actual slicer settings.

## The Model Is Too Large In X Or Y

Lower **Pixel Size (XY)** to make the model smaller. Crop the image first if there is unused border or background.

## The Image Has Speckles Or Tiny Islands

Use **Dedither** after reducing colors. If the image still has too many isolated pixels, try fewer colors or a different quantization algorithm.

## Auto-paint Looks Inaccurate

Common causes:

- Filament hiding distances are estimates instead of calibrated values.
- The filament set does not cover the image colors well.
- **Max Height** is compressing transition zones too much.
- The optimizer needs **Enhanced color matching** enabled.
- The important subject is in the center or edges but **Region priority** is set to **Uniform**.

Calibrate your filaments and check **Result Confidence** for clues.

For a result that needs deeper investigation in the desktop app, enable **Record Auto-paint diagnostics** in **Settings**, rebuild it, and use **Open folder** to locate the resulting `.jsonl` trace. Enable recording before the calculation starts.

## The 3D Build Is Slow

Large images, many colors, many layers, and smooth meshing all increase build time. Try:

- Cropping the image.
- Reducing color count.
- Turning off **Smooth Meshing**.
- Using a smaller physical size.
- Simplifying Auto-paint options.

## Exported File Opens With Unexpected Colors

For 3MF, review material or filament assignments in your slicer. Kromacut preserves color information where possible, but slicers can map colors to extruders differently.

For STL, color is not the main data in the file. Use the **Print Instructions** for filament swaps.

## Crop Or Image Edits Went Too Far

Use **Undo**. Redo is available if you undo too far.

Next: [FAQ](faq).
