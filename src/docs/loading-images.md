---
title: Loading Images
slug: loading-images
order: 30
description: Import, crop, pan, zoom, and manage the source image.
---

# Loading Images

Kromacut starts with one image. You can use your own image or the app logo it loads by default.

## Choose A Source

Use any normal image file Kromacut can open in the web app or standalone desktop build. The preview toolbar includes a file upload button, and the preview area accepts drag and drop while you are in **2D** mode.

## Preview Controls

The 2D preview is intentionally pixel-crisp so the reduced image shows exact color regions.

- Scroll to zoom in or out.
- Drag the image to pan.
- Use **Undo** and **Redo** after image edits such as crop, adjustment bake, dedither, quantize, swatch changes, or clear.
- Use **Toggle checkerboard** when transparent pixels are hard to see.
- Use **Download image** to save the current 2D result as an image.

## Crop The Image

Click **Crop** to enter crop mode. Drag the crop rectangle or its handles, then click **Save crop**. Use **Cancel crop** if you do not want to keep the selection.

Cropping is useful before color reduction because it removes background areas that would otherwise influence the palette.

## Touch Up Pixels

The 2D preview toolbar includes five hard-edged tools for direct pixel editing. All edits are palette-safe: they use exact colors without blending, so no stray gradient pixels sneak into your palette. **Brush** paints with the selected color, **Eraser** makes pixels transparent, and **Fill** replaces a contiguous region of one exact color. **Text** creates bold, hard-edged lettering: click the image and type directly in an on-canvas text box that appears at that spot. The **color picker** lets you sample a color directly from the image and switches to Brush.

Set the Brush and Eraser size with a slider (1–64 image pixels), with a size-accurate cursor outline to guide you. For Text, the text box supports multiple lines (press Enter) and word-wraps at its width—drag the handle on its right edge to adjust the wrap width, and drag the move handle (arrows icon) above the box to reposition it. The size slider and color control update your text draft live. Apply your text with the check button or Ctrl+Enter, or discard it with the X button or Escape; clicking elsewhere on the image or switching tools also applies the current text. Choose your color from the current image palette, use a custom color input, or use the color picker tool to sample from the image.

Each completed stroke, fill, or text placement is exactly one **Undo** or **Redo** step. Drawing is live and never blocks the app. Press **Escape** to leave the active tool; while editing, middle-drag still pans and the mouse wheel still zooms. Image adjustments remain non-destructive: touch-up edits apply to the underlying source, and the active adjustments reapply on top.

## Resize The Image

Use **Resize Image** to reduce the source image resolution by percentage. This changes the actual pixel dimensions of the current image, so a 1000x800 image resized to 50% becomes 500x400 pixels.

Resizing is useful when the source image is much larger than the physical detail you want to print. Smaller images build faster, produce lighter 3D models, and make each pixel's physical size easier to reason about before reducing colors.

## Remove Or Replace An Image

Use **Remove image** to clear the current image. To replace it, choose another file or drag a new image into the preview.

## Tips

- Start with the cleanest image you can. Heavy compression, tiny details, and noisy backgrounds usually become extra color regions.
- Crop first, resize if needed, then adjust and reduce colors.
- Transparent border pixels are not useful for the 3D model. Keep only the visible subject area you want printed.

Next: [Reducing colors](reducing-colors).
