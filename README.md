# StrataPaint

Open-source HueForge-style tool for converting images into stacked, color-layered 3D prints.

StrataPaint is a browser-first app that helps you reduce an image to a small palette, preview how the image maps to stacked layers, tweak per-color layer heights and ordering, and export a printable STL along with printer swap instructions.

## Notable Features

- Image upload and preview (drag & drop or file picker).
- Color reduction / quantization with selectable color count.
- Inline color pickers to tweak or replace generated palette colors.
- Per-color slice heights and a configurable base slice height.
- Reorder colors with drag-and-drop to control stack order (darkest → lightest default ordering).
- Live 2D preview and a 3D stacked preview rendered with three.js.
- 3D model export to binary STL (suitable for slicers).
- Plain-text 3D print instructions that describe layer heights and exact layers where filament swaps are required.
- Copy-to-clipboard button for the print instructions (produces a clean, copyable plain-text plan).

## Notable implementation details

- Frontend: React + TypeScript + Vite.
- 3D Rendering: three.js with BufferGeometry. The geometry pipeline produces per-face (non-indexed) triangles so each color slice renders as a solid block (no blended vertex colors) and vertical side walls are preserved.
- Texture sampling: we create a `CanvasTexture` from the preview canvas and use `NearestFilter` with mipmaps disabled so the texture stays crisp when mapped onto the 3D mesh. The texture UVs are adjusted (repeat/offset) so the canvas region aligns with the mesh bounding box.
- Color ordering: palette swatches are derived from image pixels, then ordered by hue/saturation/lightness and presented from darkest to lightest by default (you can reorder manually).
- 

## How to use

- Upload or drag an image into the preview area.
- Adjust quantization settings to reduce to the desired number of colors.
- Tweak or replace swatches using the color pickers in the Swatches panel.
- Open the 3D panel to configure per-color slice heights, base slice height, pixel size, and the color order.
- When ready, click `Download STL` (in the preview-actions bar when in 3D mode) to export a binary STL file suitable for slicing.
- Use the `Copy` button in the 3D controls to copy a plain-text print plan that lists layer heights and swap layers (hex codes are followed by friendly color names where available).

## 3D / printing specifics and tips

- Base slice height default: `0.20 mm`
- Layer height default: `0.12 mm`
- Layer height used to compute the exact layer numbers at which color swaps happen in the plain-text plan. 
- Per-color slice heights are snapped/multiplied to sensible values relative to `layerHeight` when the swatches change or are initialized.

## Contributing

Contributions welcome. Open issues or PRs for bugs, improvements, or feature suggestions. If you plan a larger change (architecture, algorithms), open an issue first describing the approach so we can discuss it.

## License

This project is open-source — see the `LICENSE` file in the repository.
