---
title: Troubleshooting
slug: troubleshooting
order: 90
description: Common issues and what to try first.
---

# Troubleshooting

Start here when a result looks wrong or a control is disabled.

## A Link Shows Page Not Found

The address may contain a typo or point to a page that no longer exists. Use **Open Kromacut** to reach the tool, **Go to homepage** to visit the landing page, or **Browse documentation** to find the current guide. An unknown documentation address is not automatically replaced with another guide.

## Build 3D Model Does Not Update The Preview

3D settings are not applied until you click **Build 3D Model**. Change the settings you want, then build again.

## Swap Instructions Are Disabled

In Manual mode, images with more than 64 colors disable swap instructions. Go back to **2D**, use **Quantization Settings**, and reduce the image to 64 colors or fewer. Flat Paint intentionally has no manual swap sequence because each printed layer can contain several filaments.

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

Check the **Appearance model** row separately. A high summary score does not guarantee physical accuracy. **Estimated only** or zero active matrix recipes means the current result has no applicable matrix measurements. Saving a calibrated profile does not make its evidence compatible with every layer height or changed filament set. See [Calibration workflows](calibration-workflows).

## A Toggle Turned Another Toggle Off

**Preserve color separation** and **Height dithering** are intentionally exclusive because they assign source colors to printable heights differently. **Smooth Meshing** and **Flat Paint** can be used together; rebuild after changing either setting. See [Flat Paint](flat-paint) and [Auto-paint](auto-paint).

## Color Separation Cannot Find A Result

The **Unique-match limit** is a hard predicted color-error limit. With **Require a unique match for every color** enabled, one unmatched color rejects the result. Consider reducing the 2D palette, adding a useful filament, allowing more transition height or repeats, or relaxing the limit. Turn strict matching off only if dropping distinct colors and merging their regions is acceptable. A previously built preview can remain on screen after rejection; it is not a successful build of the rejected settings.

## My Adjustments Disappear In 3D Or In A Download

Click **Apply** in Adjustments to bake the live look into the source image before quantizing, building or downloading. The adjustment preview and the source are separate. See [Image adjustments](image-adjustments).

## Deleting A Swatch Did Not Remove Its Pixels

**Delete** removes a palette option and remaps the image to remaining colors. It is not an eraser. Use the Eraser tool or set that swatch's transparency to zero for a cutout. Quantizing can make partly transparent pixels opaque, so inspect the silhouette again afterward.

## Collect An Auto-paint Diagnostic Trace

For a result that needs deeper investigation in the desktop app, enable **Record Auto-paint diagnostics** in **Settings**, run a new Auto-paint calculation, and use **Open folder** to locate the resulting `.jsonl` trace. Enable recording before the calculation starts. Building a mesh from an already-computed result does not record that earlier calculation. See [Desktop Auto-paint diagnostics](settings-and-controls#desktop-auto-paint-diagnostics) before sharing a trace.

## The 3D Build Is Slow

Large images, many colors, many layers, and smooth meshing all increase build time. Try:

- Cropping the image.
- Reducing color count.
- Selecting **None** for **Smooth Meshing**.
- Downsampling the image with **Resize Image**. Merely lowering Pixel Size makes the same mesh smaller, not simpler.
- Simplifying Auto-paint options.

## Exported File Opens With Unexpected Colors

For 3MF, review material or filament assignments in your slicer. Kromacut preserves color information where possible, but slicers can map colors to extruders differently.

For STL, no filament color assignments are carried in the file. Use the **Print Instructions** for filament swaps.

Auto-paint's Simulated view shows estimated blends; slicers normally show physical filament colors. Toggle Kromacut to **Physical** for the assignment check, then inspect the actual spool mapping. Neither view is proof of the final printed color.

## Crop Or Image Edits Went Too Far

Use **Undo**. Redo is available if you undo too far.

Next: [FAQ](faq).
