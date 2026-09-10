---
title: FAQ
slug: faq
order: 100
description: Short answers to common Kromacut questions.
---

# FAQ

## What Is Hiding Distance?

Hiding Distance, or **HD**, is the depth of material (in mm) at which a filament visually hides whatever is beneath it when viewed front-lit — the way finished prints are actually seen. Auto-paint uses HD to estimate how stacked filament layers will look.

Lower HD means a more opaque filament that covers in fewer layers. Higher HD means a more translucent filament that needs more depth.

HD replaces the Transmission Distance (TD) shown in earlier versions. Conventional TD describes backlit transmission (as measured by lithophane TD test prints) and is roughly 10× the hiding distance; you can still enter a conventional TD via the convert button on a filament row and Kromacut converts it for you.

## Should I Use Manual Or Auto-paint?

Use **Manual** when you want direct artistic control over color order and layer heights.

Use **Auto-paint** when you have real filament colors and hiding distance values and want Kromacut to plan the stack automatically.

## Do I Need To Calibrate Filaments?

You can start with estimated hiding distances. You can also check whether the filament maker, seller, or community has published Transmission Distance values for the exact filament you own — enter those through the convert button and Kromacut turns them into hiding distances.

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

Use 2D mode to download the processed image. Use 3D mode to build and export STL or 3MF models.

## Does Layer Preview Change The Export?

No. The **Layer Preview** range only changes what is visible in the preview. STL and 3MF exports include the full generated model.

## Which File Should I Print?

Choose **Download STL** for broad slicer compatibility and manual filament swaps.

Choose **Download 3MF** when your slicer supports color-aware 3MF files and you want to preserve colored layer objects.

## Why Are Heights Approximate?

Layer numbers depend on slicer behavior, especially first-layer height. Use the values shown in **Print Instructions**, then confirm the final swap layers in your slicer preview.

## Can I Share My Settings?

Yes. Export custom 2D palettes as `.kpal` files and Auto-paint filament profiles as `.kfil` files. Older `.kapp` filament profile files can still be imported.
