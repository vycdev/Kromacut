---
title: FAQ
slug: faq
order: 100
description: Short answers to common Kromacut questions.
---

# FAQ

## What Is Hiding Distance?

Hiding Distance, or **HD**, is the frontlit opacity parameter, in mm, that Auto-paint uses to estimate how stacked filament layers will look. At a thickness equal to HD, the basic model leaves 10% of the underlying color's influence. The point where you can no longer see a difference also depends on the filament, base color, and viewing conditions.

Lower HD means a more opaque filament that covers in fewer layers. Higher HD means a more translucent filament that needs more depth.

HD replaces the Transmission Distance (TD) shown in earlier versions. You can enter a conventional backlit/lithophane TD through the convert button on a filament row. Kromacut multiplies it by 0.1 to obtain a starting HD estimate; this conversion is not a new physical measurement. See [Calibration workflows](calibration-workflows).

## Should I Use Manual Or Auto-paint?

Use **Manual** when you want direct artistic control over color order and layer heights.

Use **Auto-paint** when you have real filament colors and hiding distance values and want Kromacut to plan the stack automatically.

## Do I Need To Calibrate Filaments?

You can start with estimated hiding distances. Published Transmission Distance values for the exact filament you own can also provide a starting point: enter them through the convert button, not directly into the HD field.

Calibration usually improves Auto-paint results, especially when published values are unavailable or the result still looks wrong. Calibration is most useful when:

- A filament is translucent.
- Two filaments are visually similar.
- You want repeatable results across projects.

## What Is The Difference Between Palette Colors And Filament Colors?

Palette colors are image colors used in 2D mode and Manual mode.

Filament colors are physical materials used by Auto-paint. Auto-paint can generate virtual layer colors from the physical filament stack, but the exported print plan is still based on real filaments.

## Why Does The 3D Preview Need A Build Button?

3D generation can be expensive. Kromacut waits for **Build 3D Model** so changing a setting does not repeatedly start and cancel heavy work.

## Can I Export Without Using 3D Mode?

Use 2D mode to download the current source image, including applied edits. Bake live adjustments with **Apply** before downloading. Use 3D mode to build and export STL or 3MF models.

## Does Layer Preview Change The Export?

No. The **Layer Preview** range only changes what is visible in the preview. STL and 3MF exports include the full generated model.

## Which File Should I Print?

Choose **Download STL** for broad slicer compatibility and manual filament swaps.

Choose **Download 3MF** when your slicer supports color-aware 3MF files and you want to preserve colored layer objects.

## Why Are Heights Approximate?

Layer numbers depend on slicer behavior, especially first-layer height. Use the values shown in **Print Instructions**, then confirm the final swap layers in your slicer preview.

## Can I Share My Settings?

Yes. Export custom 2D palettes as `.kpal` files and Auto-paint filament profiles as `.kfil` files. Older `.kapp` filament profile files can still be imported.

## Does A Smaller Pixel Size Replace A Smaller Nozzle?

No. Pixel Size sets the physical size of image pixels. It can make a stroke narrower than the extrusion path your nozzle can produce. Set **Effective line width** in **3D Print Settings**, use the printable-detail preview in Auto-paint, and inspect the sliced result. See [3D mode](3d-mode).

## Does My Calibration Still Apply At A Different Layer Height?

Do not assume it does. HD measurements and appearance evidence have different roles. Proof and matrix evidence is checked against the settings and filaments it was recorded with. After changing layer height, inspect the active evidence and print a small validation sample. See [Calibration workflows](calibration-workflows).

## Why Are There More Preview Colors Than Spools?

Thin layers allow underlying filament to influence the visible color. Different thicknesses of the same ordered spools create different predicted blends. Auto-paint chooses from those reachable stack prefixes, while the exported parts still use the real filaments. See [Auto-paint](auto-paint).
