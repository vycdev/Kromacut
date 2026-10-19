---
title: Quick Start
slug: quick-start
order: 20
description: A practical first run from image to export.
---

# Quick Start

This guide walks through a typical project from image loading to export.

## Load Or Import An Image

Use the upload button in the preview toolbar or drag an image into the 2D preview.

After loading, use the mouse wheel to zoom and drag the preview to pan. If the image has transparency, the checkerboard button can make transparent areas easier to see.

## Adjust The Image

In **2D**, use **Adjustments** before reducing colors. Exposure, contrast, highlights, shadows, whites, blacks, saturation, vibrance, hue, temperature, tint, and clarity can all change which colors the palette tools find.

Click **Apply** in the Adjustments panel to bake the current adjustments into the image before reducing colors, building 3D geometry, or downloading it. Live adjustments alone are a preview, not an updated source image. See [Image adjustments](image-adjustments) for before/after examples and reset behavior.

## Resize If Needed

If the image is much larger than the detail you want to print, use **Resize Image** to downscale it by percentage before reducing colors. This reduces the actual pixel dimensions, which can make the later 3D model faster to build and easier to size physically.

## Reduce Colors

In **Quantization Settings**:

1. Leave **Palette** on **Auto** unless you already have a specific palette in mind.
2. Start with **Number of Colors** set to **16**. Lower it for fewer source color regions, or raise it if the preview needs more detail. In Auto-paint, this count is not the number of spools or swaps.
3. Leave **Algorithm** on the default **K-means** option. It is the recommended starting algorithm for most images.
4. Click **Apply**.

Use the **Image colors** panel to inspect the result. Click a swatch to edit it or delete it from the palette. Deleting remaps pixels to the remaining colors; use the Eraser or set alpha to zero (fully transparent) to remove pixels from the silhouette.

## Dedither Or Clean Up

If color reduction leaves isolated speckles, use **Dedither** as a denoising pass. It is especially useful because individual stray pixels in the 2D image can become individual bits of geometry in the 3D model.

Start with the default **Weight** and **Passes**, then click **Apply**. Increase passes only when the image still has too many isolated pixels after one pass.

## Enable 3D Mode

Click **3D**. Set the print basics first:

- **Pixel Size (XY)** controls the physical width and depth of each image pixel.
- **Layer Height** should match the slicer layer height you plan to use.
- **First Layer Height** should match your slicer first-layer setting.
- **Smooth Meshing** offers None, Minimal, Medium, and Aggressive strengths for model outlines; Medium preserves the original smoothing.

## Choose Manual Or Auto-paint

Use **Manual** when you want direct control over the reduced image colors. Manual mode uses the swatches from **Image colors**: drag colors into the print order you want, then use each row slider to decide how much height that color contributes. This is a good first choice when you already know the layer order you want or you are matching a small, simple palette.

Use **Auto-paint** when you want Kromacut to plan the physical filament stack for you. Auto-paint starts from your real filaments instead of the reduced image swatches, then uses each filament's color and **Hiding Distance (HD)** — the depth at which it hides what's beneath — to estimate how stacked layers will look.

For a first Auto-paint run:

1. Add the filaments you actually plan to print with.
2. Set each filament color as accurately as you can.
3. Set each filament's **HD**. The wand estimate is fine for experimenting, and you can convert a conventional TD value (≈10× the HD); calibrated hiding distances usually give the best results.
4. Leave **Max Height** on **Auto** at first.
5. Enable **Enhanced color matching** if the first result misses important colors or you want the optimizer to search for a better filament order.

After Auto-paint computes a stack, check the transition zones and confidence details before exporting. Low confidence usually means the filament set is missing a useful color, the hiding distances need calibration, or the max height is too restrictive.

## Generate And Export

Click **Build 3D Model**. When the model appears, use the **Layer Preview** slider to inspect how the print builds from bottom to top.

Open the download menu and choose **Download STL** or **Download 3MF**. Then copy the **Print Instructions** so you have the start color, swap layers, and recommended slicer settings.

Next: [3D mode](3d-mode), [Auto-paint](auto-paint), or [Generating and exporting output](generating-exporting-output#before-you-export).
