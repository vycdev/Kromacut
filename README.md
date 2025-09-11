# StrataPaint

Open source HueForge alternative built with React, TypeScript, and Vite.

## 🧭 Project Plan (Roadmap)

This project aims to be an open-source browser-based alternative to HueForge. High-level features and immediate roadmap:

- Image upload and preview (current): let users upload or drag-and-drop an image and preview it in the browser.
- Color reduction: apply a filter to reduce the image to N colors; user-selectable N.
- Color pickers: allow users to tweak/replace the generated palette colors.
- Layer heights: per-color layer height and a base layer height that the user can set.
- Ordering: drag/drop or controls to reorder colors (which affects layering order in the 3D model).
- Preview: show a live preview of the filtered image and the stacked layers view.
- STL export: generate a simple stacked 3D model and export as an STL file.
- Print instructions: output a short textual instruction list for the 3D printer (layer heights, color change layers, etc.).
- Persistence (future): localStorage/IndexedDB save for images and settings, plus optional project import/export.
- Future features: more advanced color quantization algorithms, palette auto-optimization, multilayer blending modes, and per-color infill settings.

If you'd like, we'll continue by implementing the color reduction UI next (selector for number of colors) and a CPU-based quantization pipeline in JS.

