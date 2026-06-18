---
title: 3D Mode
slug: 3d-mode
order: 60
description: Configure print dimensions, Manual layers, Auto-paint, and preview controls.
---

# 3D Mode

3D mode turns the prepared image into a printable layer stack. The model does not rebuild automatically; click **Build 3D Model** after changing 3D settings.

## 3D Print Settings

Set these before building:

| Setting            | What it controls                                                                |
| ------------------ | ------------------------------------------------------------------------------- |
| Pixel Size (XY)    | The physical width and depth of each image pixel, in mm per pixel.              |
| Layer Height       | The normal slicer layer height. Swap layers are calculated from this value.     |
| First Layer Height | The slicer first-layer height. This affects the first layer and swap positions. |
| Smooth Meshing     | Smooths connected color boundary edges with welded topology.                    |

Use the reset button to return print settings to the app defaults.

## Manual Mode

Manual mode uses the colors shown in **Image colors**.

Use **Color Slice Heights** to:

- Drag colors into the order you want them printed.
- Adjust each color's slice height.
- Reset all heights and sorting if the stack gets confusing.

The first color is the starting color. Later colors become swap steps. For best results, think from bottom to top: dark or backing colors usually go first, lighter colors often go later.

## Auto-paint

Auto-paint uses real filament colors and **Transmission Distance (TD)** values. Add each filament you plan to use, then set:

- Filament name.
- Filament color.
- TD value.

Use the wand button to auto-estimate TD from color, or use the calibration button to measure TD from printed test patches.

## Calibrating Filament TD

Click the calibration button on a filament row to open **Calibrate Filament TD**. The wizard has three parts:

1. **Step 1: Print Test Patches** lists the filament, layer height, 100% infill, patch size, and layer counts. Use **Download Test Patches STL** if you want Kromacut to generate the patch model.
2. **Step 2: Measure RGB Values** lets you enter measurements manually or upload a photo with **Image Sampler**. Use **Fill White Reference** on the empty backlight first, then use **Fill Measurement RGB** for each printed patch.
3. **Calibration Complete** shows the fitted TD value, RGB channel estimates, white reference, and confidence. Click **Save Calibration** to apply it to the filament.

Use at least three saved measurements before calculating TD. More measurements usually improve confidence if the lighting and sampling setup stays consistent.

## Filament Profiles

Auto-paint profiles store reusable filament sets.

- **Save changes to current profile** updates the selected profile.
- **Save as new profile** creates a new profile name.
- **Rename selected profile** changes the selected profile name without changing its filaments.
- **Import profile from file** loads a `.kfil`, legacy `.kapp`, or `.json` profile.
- **Export current filaments as .kfil file** shares the current filament setup.
- **Delete selected profile** removes the selected profile.

## Max Height

**Max Height** limits the total model height in Auto-paint. Leave it on **Auto** for the physics-derived height. Set a smaller value when the model is too tall, but watch for compressed transition zones.

## Enhanced Color Matching

Enable **Enhanced color matching** when filament order matters and you want Kromacut to optimize the stack.

Optional controls appear with enhanced matching:

- **Allow repeated filament swaps** lets the same filament appear more than once.
- **Height dithering** uses printable height dots to smooth tonal transitions.
- **Line width** should roughly match the printer line or nozzle width used for dither dots.
- **Optimizer Settings** let you choose **Algorithm**, **Region priority**, and an optional **Seed**.

## Flat Paint

**Flat Paint (flat face-down print)** builds a uniform-thickness slab instead of a stepped relief. Every printed layer has the full model footprint:

- The artwork is placed face down against the build plate, under a **transparent carrier layer** that prints first and becomes the smooth viewing face. Use clear filament for the carrier object.
- Each pixel column's layer order is reversed so the print looks identical to the normal model when viewed from the face side, and the space behind the image is filled with the foundation filament.
- The model is already mirrored for face-down printing — do not mirror it again in the slicer. After printing, flip the piece over to view the image.

Because a single printed layer contains several filaments side by side, Flat Paint requires a multi-material printer (AMS or toolchanger). Export as **3MF**: the model contains one object per filament, plus the carrier object, ready for per-object filament assignment in the slicer.

Flat Paint works in both standard and enhanced color matching modes. Expect heavier geometry and slower slicing than a normal build — flat models are best for bookmarks, coasters, and other pieces that benefit from a smooth, glass-flat face.

Flat Paint and **Smooth Meshing** are mutually exclusive. Turning one on turns the other off because Flat Paint already uses a full-footprint slab layout instead of smoothed boundary contours.

## Optimizer Settings

| Setting         | Meaning                                                      |
| --------------- | ------------------------------------------------------------ |
| Algorithm       | Auto, Exhaustive, Simulated Annealing, or Genetic Algorithm. |
| Region priority | Uniform, Center-weighted, or Edge-weighted matching.         |
| Seed (optional) | A number that makes optimizer results repeatable.            |

Use **Auto (smart selection)** unless you have a reason to compare algorithms.

## Transition Zones And Confidence

After Auto-paint computes a result, Kromacut can show:

- **Transition Zones**, with height ranges and compressed-zone badges.
- **Result Confidence**, including Calibration, Coverage, and Compression scores.
- **Optimizer Performance**, including Algorithm, Quality Score, Iterations, Cache hit, and Converged.

Low confidence usually means you should calibrate filaments, add a missing filament color, or loosen a restrictive max height.

## Preview Controls

The toolbar in the top-right corner of the 3D preview contains controls for the active view:

- **Camera toggle** — switches between perspective and orthographic projection. Perspective gives a natural depth effect; orthographic removes foreshortening and is useful for checking layer alignment. The button icon reflects the current mode, and the camera position is preserved when toggling.
- **Undo / Redo** — steps through changes to the 3D settings.
- **Download** — exports the current model as a .stl or a .3mf.

## Layer Preview

After building, the bottom **Layer Preview** bar lets you show only a height range of the model. Drag the lower and upper handles to inspect how the print builds.

Hover over color segments to see the start layer or swap layer. The preview range is only for inspection; exports still include the complete model.

In Flat Paint mode the bar shows a plain track because printed layers contain several filaments at once — there is no single swap sequence. Orbit underneath the model to inspect the artwork face.

Next: [Generating and exporting output](generating-exporting-output).
