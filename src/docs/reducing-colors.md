---
title: Reducing Colors
slug: reducing-colors
order: 40
description: Use adjustments, palettes, quantization, and swatches.
---

# Reducing Colors

Color reduction turns a full image into a smaller palette that can become printable layers. This is the main 2D preparation step.

## Adjustments First

Use **Adjustments** to make the subject easier to separate before reducing colors. The controls are:

| Control                    | Use it for                                   |
| -------------------------- | -------------------------------------------- |
| Exposure                   | Overall brightness.                          |
| Contrast                   | Stronger or softer separation between tones. |
| Highlights and Shadows     | Recovering detail in bright or dark regions. |
| Whites and Blacks          | Moving the brightest and darkest endpoints.  |
| Saturation and Vibrance    | More or less color intensity.                |
| Hue, Temperature, and Tint | Correcting color shifts.                     |
| Clarity                    | Local contrast and edge definition.          |

Click **Apply** in the Adjustments panel to bake the current look into the image.

## Quantization Settings

Use **Quantization Settings** to reduce the image.

- **Palette** chooses the target color set. **Auto** lets Kromacut find colors from the image. Built-in palettes, supplier palettes, and custom palettes constrain the result to known colors.
- **Supplier Palettes** are built-in color sets matching real filament lines (for example Bambu Lab PLA Basic), so the reduced image only uses colors you can actually buy. They cannot be edited directly — clone one into a custom palette to adjust it.
- **Number of Colors** sets the target color count when using **Auto**.
- **Algorithm Weight** changes how strongly the selected algorithm groups colors. It is disabled when the algorithm is **None (postprocess only)**.
- **Algorithm** chooses the reduction method.
- **Apply** runs the reduction.

## Choosing An Algorithm

| Algorithm               | When to try it                                                             |
| ----------------------- | -------------------------------------------------------------------------- |
| None (postprocess only) | You already have the colors you want and only need palette postprocessing. |
| Posterize               | Simple graphic images with broad color regions.                            |
| Median-cut              | Fast general-purpose reduction.                                            |
| K-means                 | A good default for photos and mixed artwork.                               |
| Wu                      | Smooth photos or gradients that need balanced color buckets.               |
| Octree                  | Images with many distinct colors and sharp regions.                        |

If the result looks muddy, try fewer colors plus stronger contrast. If important colors disappear, increase **Number of Colors** or try another algorithm.

## Custom Palettes

The palette toolbar lets you create, edit, clone, import, export, or delete custom palettes.

- Custom palettes can be saved for later use.
- Palette files use the `.kpal` format.
- Pick colors that match real filament when you plan to use Manual mode.
- **Clone** copies the currently selected palette — including built-in and supplier palettes — into a new custom palette you can edit. The clone is named after the original with "(copy)" appended.

### Disabling Colors

In the palette editor, use the eye toggle on a color row to disable that color without deleting it — handy when a spool runs out but you plan to restock it. Disabled colors:

- Are skipped during quantization, so the reduced image only uses the enabled colors.
- Stay saved in the palette and are included when you export it.
- Show as `Name (enabled/total)` in the palette dropdown, for example `My Filaments (5/8)`.

At least one color must stay enabled.

## Image Colors

The **Image colors** panel shows detected swatches. The count excludes fully transparent pixels.

Click a swatch to open **Edit Color**. You can:

1. Change the color with the picker.
2. Type a hex value.
3. Adjust transparency.
4. Click **Apply** to replace the swatch in the image.
5. Click **Delete** to remove that color from the image.

> Tip: Keep Manual-mode palettes small. If the image has more than 64 colors, Kromacut disables swap instructions and asks you to reduce the image first.

Next: [Dedithering and cleanup](dedithering-cleanup).
