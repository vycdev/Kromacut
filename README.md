<img align="left" height="125" width="125" src="./content/logo.png">

# Kromacut

[![Patreon](https://img.shields.io/badge/Patreon-Support-orange?logo=patreon&logoColor=white)](https://www.patreon.com/cw/vycdev) [![Discord](https://img.shields.io/badge/Discord-Join%20Chat-5865F2?logo=discord&logoColor=white)](https://discord.gg/nU63sFMcnX) [![YouTube](https://img.shields.io/badge/YouTube-@vycdev-red?logo=youtube&logoColor=white)](https://www.youtube.com/@vycdev) [![Release](https://img.shields.io/github/v/release/vycdev/kromacut?cacheSeconds=3600)](https://github.com/vycdev/Kromacut/releases/latest) [![Repo size](https://img.shields.io/github/repo-size/vycdev/kromacut?cacheSeconds=3600)](https://github.com/vycdev/Kromacut) [![Total downloads](https://img.shields.io/github/downloads/vycdev/Kromacut/total?label=total%20downloads&cacheSeconds=3600)](https://github.com/vycdev/Kromacut/releases) [![Latest downloads](https://img.shields.io/github/downloads/vycdev/Kromacut/latest/total?cacheSeconds=3600)](https://github.com/vycdev/Kromacut/releases/latest)

Open-source HueForge-style tool for converting images into stacked, color-layered 3D prints.

Kromacut is a browser-first app that converts images into multi-color lithophane 3D prints. It offers two powerful workflows:

**Auto-paint mode** — Define your actual filaments (color + Transmission Distance), and Kromacut automatically computes optimal layer stacks using physically accurate Beer-Lambert optical blending. Features include a calibration wizard, advanced optimizer (simulated annealing/genetic algorithms), and region weighting for spatial priority.

**Manual mode** — Reduce images to a small palette, manually tweak per-color layer heights and ordering, and fine-tune every aspect of the stack with complete control.

Both modes include live 2D/3D previews, layer-by-layer visualization, and export to STL/3MF with detailed print instructions.

## Examples

A quick look at what Kromacut produces from a source image to a printable model:

- Fuji test image (2D input) → 3D preview → per-color sliced view → real print

| 2D Input | 3D Preview |
|---|---|
| <img src="content/fuji2d_new.png" alt="Fuji 2D Input" width="600" /> | <img src="content/fuji3d_new.png" alt="Fuji 3D Preview" width="600" /> |
| Sliced by Colors | Real Print |
| <img src="content/fuji3dsliced.png" alt="Fuji Sliced" width="600" /> | <img src="content/printed.jpg" alt="Printed Result" width="600" /> |

Another minimal test you can try yourself in the app header: the Transmission Distance (TD) test image.

| TD Test |
|---|
| <img src="src/assets/tdTest.png" alt="TD Test Image" width="600" /> |

## Notable Features

- Image upload and preview (drag & drop or file picker).
- Color reduction / quantization with selectable color count.
- Inline color pickers to tweak or replace generated palette colors.
- Per-color slice heights and a configurable base slice height.
- Reorder colors with drag-and-drop to control stack order (darkest → lightest default ordering).
- Live 2D preview and a 3D stacked preview rendered with three.js.
- **Layer-by-layer preview slider** — Interactively visualize how the print builds up by dragging a slider to show/hide layers at specific heights.
- 3D model export to binary STL or 3MF (Preview) suitable for multi-material slicers.
- Plain-text 3D print instructions that describe layer heights and exact layers where filament swaps are required.
- Copy-to-clipboard button for the print instructions (produces a clean, copyable plain-text plan).
- **Filament calibration wizard** — Accurately determine Transmission Distance (TD) values through measured samples with confidence scoring.
- **Advanced optimizer** — Simulated annealing and genetic algorithms find optimal filament ordering for complex multi-color prints.
- **Region weighting** — Prioritize accuracy in specific image areas (center, edges) during auto-paint optimization.

## Notable implementation details

- Frontend: React + TypeScript + Vite.
- 3D Rendering: three.js with BufferGeometry. The geometry pipeline produces per-face (non-indexed) triangles so each color slice renders as a solid block (no blended vertex colors) and vertical side walls are preserved.
- Texture sampling: we create a `CanvasTexture` from the preview canvas and use `NearestFilter` with mipmaps disabled so the texture stays crisp when mapped onto the 3D mesh. The texture UVs are adjusted (repeat/offset) so the canvas region aligns with the mesh bounding box.
- Color ordering: palette swatches are derived from image pixels, then ordered by hue/saturation/lightness and presented from darkest to lightest by default (you can reorder manually).
- Async mesh generation: The greedy meshing algorithm yields control back to the browser every 8ms during large mesh builds, keeping the UI responsive. Boundary vertex filtering uses binary search for optimal performance.


## How to use

### Quick start (Auto-paint mode — Recommended)

1. Upload or drag an image into the preview area.
2. Switch to the **Auto-paint** tab in the 3D controls panel.
3. Click **Add Filament** and configure your filaments:
   - Use the **calibration wizard** (calibrate icon) to measure accurate TD values, or
   - Enter TD values manually.
4. Enable **Enhanced color matching** for optimal results (auto-selects best algorithm).
5. (Optional) Set **Region weighting** to Center or Edge to prioritize important areas.
6. Use the **layer-by-layer preview slider** to verify transitions.
7. Export via **Download STL** or **Download 3MF** and follow the print plan.

See the [Auto-paint section](#auto-paint) for complete details.

### Manual mode workflow

1. Upload or drag an image into the preview area.
2. Adjust quantization settings to reduce to the desired number of colors.
3. Tweak or replace swatches using the color pickers in the Swatches panel.
4. Open the 3D panel → **Manual** tab to configure:
   - Per-color slice heights
   - Base slice height
   - Pixel size
   - Color order (drag-and-drop)
5. Preview in 3D and use the layer slider to inspect the stack.
6. Click `Download STL` or `Download 3MF` to export your model.
7. Use the `Copy` button to copy the plain-text print plan with layer heights and swap instructions.

## 3D / printing specifics and tips

- Base slice height default: `0.20 mm`
- Layer height default: `0.12 mm`
- Layer height used to compute the exact layer numbers at which color swaps happen in the plain-text plan. 
- Per-color slice heights are snapped/multiplied to sensible values relative to `layerHeight` when the swatches change or are initialized.

### Layer-by-layer preview

The 3D view includes an interactive **height slider** at the bottom that lets you visualize how the print builds up layer by layer:

- Drag the slider to show/hide layers progressively from base (0mm) to full height
- Current height and layer information displayed in real-time
- Slider step size matches your configured layer height for accurate control
- Helps verify filament swap positions and catch potential issues before printing

This is especially useful for complex multi-color prints where you need to understand exactly when each color transition occurs.

## Auto-paint

Auto-paint is an automated layer-generation mode that replaces the manual palette/swatch workflow. Instead of reducing an image to a fixed number of colors and manually tuning per-color slice heights, you define a set of **filaments** (each with a color and a Transmission Distance) and let the algorithm compute the optimal layer stack automatically.

### Core concepts

- **Filaments**: Each filament has a hex color and a **Transmission Distance (TD)** value (in mm). TD describes how translucent the filament is — at a thickness equal to TD, only ~10% of light passes through. Dark/opaque filaments have low TD (e.g. 0.5 mm); light/translucent filaments have high TD (e.g. 6+ mm). When you add a filament without specifying a TD, Kromacut estimates one from the color's luminance and saturation.
- **Beer-Lambert optical blending**: The algorithm simulates how light transmits through stacked filament layers using the Beer-Lambert law: `transmission = 10^(-thickness / TD)`. This physically models the color you see when printing thin semi-transparent layers on top of each other.
- **Transition zones**: Each filament in the stack needs enough vertical space to visually transition from the color below it to its own pure color. The algorithm simulates adding layers one at a time until the blended color converges (DeltaE < 2.3 — the "just noticeable difference" threshold) or opacity exceeds 85%. The result is a set of transition zones, each with a start height, end height, and the filament used.
- **Luminance-to-height mapping**: Once the transition zones are computed, each pixel's brightness is mapped to a target height in the model. Dark pixels get the minimum height (base layer only), bright pixels get the full height (all layers), and mid-tones fall proportionally in between. This produces the characteristic lithophane-style relief where image brightness = model thickness.

### How it works (step by step)

1. **Define filaments** — Add your filament colors and Transmission Distances in the Auto-paint tab. Use the color picker and TD input for each filament row.
2. **Filament ordering** — By default filaments are sorted by luminance (darkest on the bottom, lightest on top). With **Enhanced color matching** enabled, the algorithm evaluates orderings to find the one that best reproduces the image's color palette.
3. **Transition zone calculation** — For each consecutive pair of filaments, the algorithm simulates Beer-Lambert blending layer-by-layer until the color converges. The first (darkest) filament gets a foundation zone thick enough to be ~95% opaque (`TD × 1.3`).
4. **Height compression** — If the ideal height exceeds a user-set **Max Height**, all zones are uniformly compressed. The UI shows which zones are compressed and by how much.
5. **Virtual swatch generation** — The transition zones are sampled at each layer-height increment to produce a sequence of blended colors (virtual swatches). These drive the 3D preview and the height map, where each pixel maps to the layer whose blended color best matches.

### Filament Calibration

Each filament row in the Auto-paint tab includes a **calibration wizard** to help you determine accurate Transmission Distance values:

1. **Click the calibrate icon** next to any filament to open the calibration wizard.
2. **Print test samples** — The wizard guides you through printing 3-5 samples of different thicknesses (e.g., 0.3mm, 0.6mm, 1.0mm, 1.5mm, 2.0mm).
3. **Measure luminance** — Use a light meter or camera to measure how much light passes through each sample, or visually compare against reference colors.
4. **Automatic TD calculation** — The wizard performs exponential regression on your measurements to compute the optimal TD value with a confidence score (High/Medium/Low/Very Low).
5. **Save profile** — Keep calibrated filaments in a reusable profile for future projects.

Calibrated filaments display a confidence badge next to their TD value. Higher confidence = more accurate optical simulation = better print results.

### Advanced Optimizer

When **Enhanced color matching** is enabled, Kromacut uses advanced optimization algorithms to find the best filament order:

| Algorithm | When Used | Description |
|---|---|---|
| **Exhaustive search** | 1-4 filaments | Evaluates all possible orderings to guarantee the optimal solution. Fast for small sets. |
| **Simulated Annealing** | 5-8 filaments | Physics-inspired probabilistic search that escapes local minima via controlled randomness. Balances quality and speed. |
| **Genetic Algorithm** | 9+ filaments | Evolution-inspired population-based search with crossover and mutation. Best for large filament sets where exhaustive search is prohibitive (8! = 40,320 permutations). |
| **Auto** | Default | Automatically selects the best algorithm based on filament count and search space size. |

The optimizer displays metadata after generation:
- **Algorithm used** — Which method was selected
- **Quality score** — Lower is better (weighted DeltaE + penalties)
- **Iterations** — How many orderings were evaluated
- **Converged** — Whether the algorithm reached a stable solution
- **Cache hit** — Whether results were retrieved from cache (instant)

**Optimizer seed** — Set a random seed for reproducible results across runs. Useful for A/B testing different configurations.

### Region Weighting

Prioritize accuracy in specific image regions during optimization:

| Mode | Description |
|---|---|
| **Uniform** | All pixels weighted equally (default). |
| **Center** | Gaussian falloff from center — faces and subjects in the middle get higher priority. |
| **Edge** | Colors nearer the outer edges of the image get higher priority. |

Region weighting is most useful when filament budget is limited and you want the optimizer to focus on visually important areas.

### Options

| Option | Description |
|---|---|
| **Max Height** | Constrains the total model height (mm). When set below the auto-calculated ideal, zones are uniformly compressed. Leave blank or click `Auto` for the physics-derived default. |
| **Enhanced color matching** | Optimizes filament ordering for best color reproduction rather than simple luminance sorting. Uses advanced algorithms (exhaustive, simulated annealing, genetic) automatically selected based on filament count. Scoring considers weighted DeltaE accuracy, height spread, layer count, and transition waste. |
| **Allow repeated filament swaps** | (Requires Enhanced color matching) Allows a filament to appear more than once in the stack. This creates intermediate blended colors — for example, a thin white layer over red produces pink. The algorithm greedily inserts up to 4 extra swaps, each at the position that best improves the score. |
| **Height dithering** | (Requires Enhanced color matching) Applies block-aware Floyd-Steinberg error diffusion to the quantized height map. Instead of sharp stair-steps between layer heights, dithering produces a stippled gradient that simulates intermediate heights, resulting in smoother tonal transitions in the print. Edge pixels between different heights are protected from dithering to avoid staircase artifacts. |
| **Flat Paint (flat face-down print)** | Builds a uniform-thickness slab printed image-side down instead of a stepped relief. Each pixel column's layer order is reversed so the artwork sits against the build plate (already mirrored — don't mirror in the slicer) under a transparent carrier layer, and the back is filled with the foundation filament so every layer has the full footprint. The result has a smooth, glass-flat face — great for bookmarks and coasters. Requires a multi-material printer (AMS/toolchanger); export as 3MF, which contains one object per filament plus the clear carrier object. Flat Paint and Smooth Meshing toggle each other off because flat prints always use the full-footprint slab layout. |
| **Dither line width** | (Requires Height dithering) Controls the minimum dot size for the dither pattern in mm. This should roughly match your printer's line/nozzle width so dither dots are actually printable. Default: `0.42 mm`. |
| **Optimizer algorithm** | Choose which optimization algorithm to use: Auto (recommended), Exhaustive, Simulated Annealing, or Genetic. Auto selects the best algorithm based on search space size. |
| **Optimizer seed** | Set a random seed for reproducible optimizer results. Leave blank for random behavior. Useful for testing and comparing configurations. |
| **Region weighting** | Prioritize specific image regions: Uniform (equal), Center (Gaussian falloff), or Edge (Sobel detection). Helps focus quality budget on important areas. |

### Filament profiles

Auto-paint configurations (filament lists) can be saved, loaded, and shared as **profiles**:

- **Save / Save New** — Persist the current filament set under a name. Overwrite an existing profile or create a new one.
- **Load** — Select a saved profile from the dropdown to restore its filaments.
- **Rename** — Change the selected profile name without changing its filaments.
- **Export** — Download the current filaments as a `.kfil` file (JSON) to share with others.
- **Import** — Load a `.kfil`, legacy `.kapp`, or `.json` profile file from disk.
- **Delete** — Remove a saved profile.

Profiles are stored in browser `localStorage` and persist across sessions.

### Transition zones panel

When auto-paint is active and filaments are defined, the UI displays a **Transition Zones** panel showing:

- Each zone's filament color swatch and hex code.
- The start and end height of each zone (in mm) and its thickness (Δ).
- A **compressed** badge on zones that have been reduced below their ideal thickness due to a Max Height constraint.
- Total model height and total number of physical layers.

### Next-best-color suggestion

After running auto-paint, a **Suggest next filament** button appears at the bottom of the panel. Click it to run a blend-aware analysis that finds the single filament addition that would most reduce the average color error (ΔE) across the image.

The result card shows:

| Field | Description |
|---|---|
| **Hex** | Suggested filament color. |
| **Est. ΔE** | Estimated reduction in blend-aware average ΔE if this filament is added. A rough relative estimate — not a calibration confidence rating. |
| **TD** | Recommended starting Transmission Distance, borrowed from the nearest existing filament by color distance. Adjust after printing a test patch. |
| **Captures** | Percentage of image pixels whose blend-aware color error would improve with this filament. |
| **Isolation** | How far this color sits from existing filaments in perceptual color space (0–1). Higher means it fills a more distinct gap; lower means it overlaps territory already covered by blending. |

Click **Add to filaments** to insert the suggestion directly into the filament list (named `Kromacut-Suggestion-01`, `02`, etc.). You can then re-run auto-paint with the expanded set and repeat as many times as needed.

**How it works (heuristic):** The algorithm estimates how well the current filament set covers the image's color range by checking each image color against each filament and Beer-Lambert blend curve. It identifies underserved colors (those with the largest estimated error) and generates candidates from those colors plus extrapolated positions — colors that, when optically blended with an existing filament, would be closer to the underserved target. The winner is the candidate whose addition most reduces weighted-average estimated error across all image pixels. This is an inventory-planning heuristic: the improvement numbers are relative estimates, not predictions of a specific auto-paint result.

### Quick start

1. Load an image into Kromacut.
2. Switch to the **Auto-paint** tab (inside the 3D controls panel).
3. Click **Add Filament** and configure each filament's color and TD to match your real filament stock.
   - **Tip:** Use the calibration wizard (calibrate icon on each row) to measure accurate TD values.
4. (Optional) Enable **Enhanced color matching** for better results with complex images. The optimizer will automatically select the best algorithm (exhaustive, simulated annealing, or genetic) based on your filament count.
5. (Optional) Set **Region weighting** to Center or Edge to prioritize accuracy in visually important areas.
6. The 3D preview updates automatically. Adjust **Max Height** if the model is too tall.
7. Use the **layer-by-layer preview slider** at the bottom of the 3D view to verify color transitions.
8. Export the model via **Download STL** or **Download 3MF** and follow the printed swap plan.

## 3MF Export (Preview)

Kromacut now supports exporting directly to `.3mf` format. This file format preserves color information by splitting the model into separate objects for each color, automatically assigned to different extruders/filaments.

**Disclaimer:** This feature is currently in **PREVIEW**. While Kromacut preserves colors, the rest of the settings in the slicer profile should be manually adjusted. Please report any issues or weird behaviors you encounter on the GitHub Issues page.

<img src="content/3mf_export.png" alt="3MF Export" width="600" />

## Transmission Distance (TD) — what it is and how to use it here

Transmission Distance (TD) is the concept HueForge uses to produce perceptual intermediate shades by stacking translucent filament layers: instead of relying purely on opaque color pigments, TD models how light transmits through thin layers of filament and how stacking different colors (and varying thickness) produces new perceived colors. For a full conceptual description see the HueForge blog: https://shop.thehueforge.com/blogs/news/what-is-hueforge

### Two workflow modes in Kromacut:

**1. Auto-paint mode (Automatic TD processing)** — The recommended approach for TD-based prints:

- **Automatic Beer-Lambert blending** — Kromacut simulates light transmission through stacked filament layers using physically accurate optical models.
- **Filament-based workflow** — Define your actual filaments (color + TD values) and let the algorithm compute optimal layer stacks automatically.
- **Calibration wizard** — Measure accurate TD values from physical test prints for each filament.
- **Advanced optimizer** — Simulated annealing and genetic algorithms find the best filament ordering for complex images.
- **Transition zones** — Automatically calculated vertical zones where each filament blends from the color below to its own pure color.

See the [Auto-paint section](#auto-paint) above for full details.

**2. Manual mode (Traditional workflow)** — For users who want complete control:

- Reduce your image to a palette with *more colors* than you actually intend to print. The extra colors give you candidate shades to use as intermediate/translucent-looking layers.
- Use the per-color slice heights and ordering controls in the 3D panel to approximate the stacked thicknesses and ordering that would produce the target intermediate shades.
- Small adjustments to `base slice height`, per-color slice heights, and `layerHeight` change the produced layer numbers and perceived blends.
- Iterate with actual filament on small test prints — translucency and perceived mix depend heavily on filament brand, color, and print settings.

**Recommendation:** Use Auto-paint mode for TD-based prints. It handles the complex Beer-Lambert physics and optimization automatically, producing better results than manual approximation.

### TD test image (for manual mode experimentation)

- This repository includes a small test image `tdTest.png` (found in `src/assets/tdTest.png`).
- The app header includes a `Load TD Test` button that will load that image into the preview so you can quickly experiment with manual layer ordering and per-color slice heights.
- This is primarily useful for testing manual mode workflows or understanding how layer heights affect perceived color.

Quick manual workflow experiment:

1. Click `Load TD Test` in the app header.
2. Reduce colors to your desired number.
3. Switch to Manual mode (3D Controls → Manual tab).
4. Adjust per-color slice heights and ordering.
5. Generate and download your 3D model.
6. Follow the layer color swap instructions and print your 3D model to see results.  

Preview of the included TD test image:

<img src="src/assets/tdTest.png" alt="TD Test Image" width="600" />

## Native Desktop App (Tauri)

Kromacut can be built as a **native desktop application** for macOS, Windows, and Linux using [Tauri](https://tauri.app/), offering better performance than the web version:

- **Better performance:** Native webview for faster rendering
- **Smaller size:** compact native bundle with low runtime overhead
- **Lower memory usage:** More efficient resource utilization
- **Automatic updates:** Built-in update checker notifies you of new versions

The desktop app includes an automatic update checker. See [UPDATE_CHECKER.md](docs/UPDATE_CHECKER.md) for details.

### Building

```bash
# Install Rust (one-time setup)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"

# Install dependencies
npm install

# Run in development mode
npm run tauri:dev

# Build production app
npm run tauri:build
```

The production build creates:
- `Kromacut.app` in `src-tauri/target/release/bundle/macos/`
- `Kromacut_0.1.0_aarch64.dmg` installer in `src-tauri/target/release/bundle/dmg/`

### Releases

Pre-built native apps are automatically released on GitHub:

1. Download the latest release from the [Releases page](https://github.com/vycdev/Kromacut/releases)
2. Choose the right file for your platform:
   - **macOS Apple Silicon (M1/M2/M3)**: `*_aarch64.dmg`
   - **macOS Intel**: `*_x86_64.dmg`
   - **Windows**: `*-setup.exe`
   - **Windows offline**: `*_offline-setup.exe`
   - **Linux**: `*.AppImage` or `*.deb`
3. Install and launch

**macOS "Kromacut is damaged" error?** The app isn't code-signed. Run `sudo xattr -d com.apple.quarantine /Applications/Kromacut.app` in Terminal to fix it.

**Windows SmartScreen warning?** The app isn't signed. Click "More info" → "Run anyway".

**Windows WebView2 requirement?** Kromacut uses Tauri, which runs on Microsoft Edge WebView2 on Windows. The standard Windows installers include the small WebView2 bootstrapper, and the setup installer checks for a recent enough WebView2 runtime. Use the offline setup installer on machines without internet access.

> **Note:** To eliminate the macOS quarantine requirement entirely, the app would need to be signed with an Apple Developer ID certificate and notarized through Apple's notarization service. This requires an [Apple Developer Program membership](https://developer.apple.com/programs/) ($99/year). See [TAURI.md](docs/TAURI.md#code-signing--notarization-future-enhancement) for details.

To create a new release, see [TAURI.md](docs/TAURI.md#automated-releases-github).

See [TAURI.md](docs/TAURI.md) for complete documentation on development, building, and distribution.

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=vycdev/kromacut&type=date&legend=top-left)](https://www.star-history.com/#vycdev/kromacut&type=date&legend=top-left)

## Contributing

Contributions welcome. Open issues or PRs for bugs, improvements, or feature suggestions. If you plan a larger change (architecture, algorithms), open an issue first describing the approach so we can discuss it.

## License

Kromacut is free software licensed under the GNU Affero General Public License v3.0 only (`AGPL-3.0-only`). See the `LICENSE` file in the repository.

Copyright (C) 2025 vycdev. Redistribution and modified versions must preserve the copyright and license notices. Modified desktop distributions must provide the corresponding source under the AGPL, and modified hosted/network versions must also offer source access to their users.
