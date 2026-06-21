# Changelog

All notable changes to Kromacut are documented in this file.

## v3.2.0 - unreleased

### Added

- **Auto-paint regression baseline** - Added focused layer-invariant coverage, per-algorithm seeded determinism checks, and 24 seeded stack snapshots across the 2-, 4-, and 8-filament profiles, both image fixtures, Enhanced matching states, and repeated-swap states.
- **Auto-paint benchmark harness** - Added an on-demand JSON benchmark that measures palette and preview-realized color error, coverage, stack cost, compression impact, runtime, and optimizer iterations across the saved fixture profiles.

### Changed

- **Auto-paint optimizer objective** - Enhanced color matching now evaluates the same zone-compressed, layer-snapped color-to-height path used by the printable preview. All optimizer algorithms share that scorer, including Max Height constraints, so selected filament orders better match the finished model. Repeated optical calculations are memoized during searches.

### Fixed

- **Auto-paint optimizer cache and default seed** - Cache entries now include all target-color weights, every target cluster, and optimizer tuning values. Blank seeds now derive a stable value from the active inputs, making identical runs repeatable and cacheable instead of randomly changing.

- **Auto-paint region priority** - Center and Edge priority now use the actual locations of each image color. Center prioritizes colors near the image middle; Edge prioritizes colors near the outer border. The optimizer no longer allocates a full-image weight map or guesses location from color brightness.

- **Auto-paint layer cap** - Corrected the slice-data safety limit so exceptionally tall auto-paint stacks stop at 500 layers rather than returning 501.

## v3.1.0 - 2026-06-18

### Added

- **Orthographic camera toggle** - Added a camera toggle button to the 3D preview toolbar that switches between perspective and orthographic projection. The button shows the current mode and preserves the camera position and depth range when toggling. The selected mode persists across page refreshes.
- **Flat Paint mode (experimental)** - Added a Flat Paint option to Auto-paint that builds a uniform, face-down slab: each pixel column's layer order is reversed so the artwork sits flat against the build plate (pre-mirrored for face-down printing) under a transparent carrier layer, the back is filled with the foundation filament so every layer has the full footprint, and 3MF export merges the parts into one object per physical filament for AMS/toolchanger printers. Includes flat-mode print instructions, a performance warning for tall stacks, mutual exclusion with Smooth Meshing, and regression tests covering the layout, meshing, STL compaction, and 3MF grouping.
- **Desktop update settings** - Added desktop-only settings to manually check for updates and control whether update notices run on startup.
- **Next-best-color suggestion** — "Suggest next filament" button in the Auto-paint panel recommends the single filament addition that would most reduce the average color error (ΔE) across the image. The result card shows the suggested hex color, a recommended starting TD, an estimated ΔE improvement, the proportion of image pixels that benefit, and an isolation score. Clicking "Add to filaments" inserts the suggestion directly into the filament list with a `Kromacut-Suggestion-NN` name. This is an inventory-planning heuristic — re-run auto-paint after adding the suggestion to see the actual result.

### Changed

- **Header settings dialog** - Replaced the standalone theme toggle with a centered settings dialog that contains compact System, Dark, and Light theme options plus the current app version.
- **SEO-friendly docs URLs** - Documentation now uses real `/docs/...` URLs with per-page metadata, generated static HTML pages, a sitemap, and robots.txt output.

### Fixed

## v3.0.0 - 2026-06-01

### Added

- **In-app user documentation** - Added a bundled Markdown Docs view with a conventional guide table of contents, per-page tables of contents, stable heading links, header brand navigation back to the app, cross-document navigation, and end-user guides for the image-to-3D-print workflow
- **2D image resolution resize** - Added a 2D Resize Image tool for downscaling the current image by percentage before color reduction or 3D model generation
- **Filament profile renaming** - Added a rename action for saved Auto-paint filament profiles
- **Pre-build model size estimate** - Added an estimated 3D model size to the Pixel Size setting, shown as a blue input-height estimate beside the input when space allows so users can preview footprint and stack height before building the model

### Changed

- **Project license** - Kromacut is now licensed under `AGPL-3.0-only` instead of MIT so redistributed or hosted modified versions must stay open under the same copyleft terms
- **Web metadata** - Improved the page title, search description, canonical URL, social preview tags, and web app manifest metadata for hosted Kromacut pages
- **Filament profile extension** - Auto-paint filament profile exports now use `.kfil` by default while continuing to import legacy `.kapp` files
- **Smooth meshing performance** - Smooth mesh generation now uses one fast welded-grid algorithm with deterministic boundary-chain smoothing in a bounded sub-pixel envelope and fan-triangulated caps instead of contour tracing and cap cleanup, avoiding hangs and browser memory blowups on complex image layers

### Fixed

- **Desktop update notices** - Fixed the Tauri desktop update checker so it runs without requiring the disabled global Tauri API, reports when the release endpoint differs from the installed app, uses a solid notification surface, and opens the GitHub releases page from the download button
- **Windows desktop image drop** - Disabled Tauri's native webview file-drop interception so dragging image files onto the 2D canvas can reach the app's HTML drop handler on Windows
- **Smooth meshing layer coverage** - Smooth meshing now applies to every generated layer without mesher substitution state
- **Smooth STL export** - STL export now preserves smooth layer geometry instead of compacting smooth builds back into square-pixel heightfields
- **Manual 3D build trigger** - 3D print settings, including the smooth meshing toggle, no longer start or cancel preview mesh generation unless the user clicks **Build 3D Model**

## v2.6.0 - 2026-05-17

### Added

- **Meshing integrity tests** - Added unit coverage for greedy and smooth mesh generation, including the default logo image, manifold edge checks, winding/orientation checks, degenerate triangle checks, and multiple layer settings
- **Image fixture meshing coverage** - Added dedicated test fixtures for the 1024px logo source and a large GitHub issue JPEG, covering meshing and 3MF export topology with real image-derived masks
- **3MF layer-count export tests** - Added fixture-backed regression tests using saved `.kapp` filament profiles to verify generated layers, 3MF mesh objects, assembly references, build items, and slicer metadata parts stay in sync
- **3MF filament color export tests** - Added regression coverage that verifies exported base materials, project filament settings, mesh material indices, and slicer extruder metadata match the physical filament colors without missing colors or color-count explosions
- **Final export manifold tests** - Added 3MF and STL topology checks across both image fixtures, all saved filament profiles, both greedy and smooth meshers, and an 8-color auto-paint logo regression to catch boundary edges, non-manifold edges, and inverted normals after export serialization
- **Progress regression tests** - Added coverage for quantize, dedither, 3D model build, large-mesh 3MF/STL export, and image algorithm progress callbacks so progress percentages advance through their real work stages without going backwards
- **Browser export flow tests** - Added Playwright coverage for the normal image-to-print flow across quantization, dedither, auto-paint profiles, 3D mesh builds, STL downloads, 3MF downloads, export timing, browser memory samples, STL triangle counts, compact heightfield quad breakdowns, strict preview port handling, and auto-paint worker settling
- **Layer preview filament bar** - Added physical filament color segments, swap hover details, and a lower trim handle to the 3D layer preview bar

### Changed

- **3D preview lighting** - Reworked the 3D view shading to use flat face normals with balanced directional fill lighting, reducing fake shadow bands on flat meshed surfaces while keeping model depth and saturated filament colors readable
- **Export memory shape** - STL export now writes chunked binary parts instead of one huge contiguous buffer, and 3MF export now uses flat coordinate storage, typed triangle chunks, and chunked XML joins to reduce peak browser memory during large exports
- **STL export size** - Browser-generated STL exports now reuse Kromacut layer-mask metadata to write an exact fused heightfield surface where possible, avoiding internal layer faces while preserving a manifold printable shell
- **3MF package size** - 3MF exports now use DEFLATE compression to reduce generated archive size
- **Progress overlays** - Long-running progress cards now show elapsed time, estimated time remaining, current step labels, and step counts in a more polished layout
- **Agent guidance** - Refocused `AGENTS.md` on Kromacut-specific domain rules, topology/export caveats, persistence boundaries, testing guidance, and when agents should update the changelog

### Fixed

- **Slicer-safe 3MF and meshing topology** - 3MF export now preserves shared vertex connectivity for non-indexed preview geometry while keeping separate colored layer objects, and greedy/smooth meshing now avoids degenerate cap triangles and inverted hole wall winding that could trigger non-manifold or missing-layer slicer warnings
- **Auto-paint smooth 3MF topology** - 3MF export now welds raw Kromacut export vertices at serialized precision, smooth meshing rejects cap triangles that collapse during 3MF coordinate rounding, and diagonal-only pixel contacts are bridged during meshing, preventing non-manifold edges in the 8-color logo regression
- **Desktop large-file saves** - Native STL/3MF/PNG saves now stream blob data to disk in chunks instead of sending one huge array through Tauri IPC, avoiding large-export `RangeError: Invalid array length` failures on Windows
- **Smooth meshing footprint safety** - Smooth corner cuts and simplification shortcuts now stay inside the source pixel footprint without running support-repair or clipping passes during smooth layer generation
- **3MF smooth layer packaging** - Smooth layers now export as one manifold mesh object per non-empty color layer, and auto-paint exports use the intended physical filament colors instead of the preview's virtual blend colors
- **Smooth mesh build progress** - 3D build progress now stays monotonic while smooth layers are generated
- **3MF export progress** - 3MF export progress now reports explicit geometry collection, vertex writing, triangle writing, and zip compression phases instead of reusing an earlier percentage range
- **2D processing progress** - Quantize and dedither progress bars now display their staged producer progress directly instead of masking backwards updates in the app shell
- **Auto-paint worker cancellation** - Auto-paint now cancels stale worker requests, surfaces worker errors, and prevents accidental exhaustive optimization above its safe filament count instead of leaving the 3D build button stuck on `Computing...`
- **Progress bar fill accuracy** - Determinate progress bars now update without width-transition lag, keeping the blue fill aligned with the displayed percentage during dedither, export, and mesh generation
- **Print setting decimal inputs** - Pixel size, layer height, and first-layer height fields now allow partial decimal edits like `0` and `0.` before committing or clamping to valid print settings
- **Progress step feedback** - Long-running overlays now show separate overall and current-step progress bars across quantization, dedither passes, mesh generation, STL export, and 3MF export; exports also give the browser a frame to render the overlay before heavy work starts and keep very fast exports visible briefly
- **Compact STL topology** - Fused heightfield STL exports now triangulate conforming surface boundaries and repair diagonal corner contacts, preventing non-manifold edges in large 4-color image stacks
- **Layer preview exports** - STL and 3MF exports now include every generated physical layer regardless of the 3D preview trim range, preserving complete models and correct filament color mapping

## v2.5.0 - 2026-05-03

### Added

- **Calibration test patches STL** — Download button in the TD calibration wizard's print step generates a ready-to-print STL of all test patches (2, 4, 6, 8, 10 layers) as a single connected model, sized to the current layer height setting
- **White-reference TD calibration** - The calibration wizard can now capture a measured backlight white reference so TD fitting normalizes against the real light source instead of assuming pure `255,255,255`
- **Calibration image sampler** - Upload a photo or screenshot and click directly on it to sample RGB values into either the white reference or the current measurement fields
- **3D smooth meshing** - Optional smooth meshing mode that softens voxel stair-steps into smoother edge contours for cleaner 3D print geometry
- **Desktop Save As exports** - Tauri builds now use native Save As dialogs for PNG, STL, and 3MF exports, then confirm the saved path after writing the file

### Changed

- **Calibration wizard Step 2 UI** - The measurement popup is now wider and less cramped, with clearer sampler targeting, live RGB previews, cleaner measurement cards, and improved status callouts
- **Windows installer packaging** - Windows releases now ship NSIS setup installers only, with a normal online installer and a larger offline WebView2 installer variant
- **Release notes automation** - The native app release pipeline now reads the matching version entry from `CHANGELOG.md` and publishes it in the GitHub release body

### Fixed

- **Calibration persistence and refresh** - White reference data is preserved with filament calibrations and profile/worker refresh logic now picks up calibration metadata changes even when the final TD value stays the same
- **Smooth meshing with height dithering** - Height-dithered layers now keep their top and bottom caps when smooth meshing is enabled, preventing walls-only/non-manifold-looking layer artifacts

## v2.4.0 - 2026-04-05

### Fixed

- **Linux binary name** — Tauri Cargo package renamed from `app` to `kromacut`, fixing the installed binary being `/usr/bin/app` on Debian instead of `/usr/bin/kromacut`
- **3D settings lost on mode switch** — Enhanced color matching, repeated swaps, height dithering, and dither line width are now preserved when switching between 2D and 3D modes; settings are also restored across page reloads via localStorage

### Added

- **DevTools in release builds** — Right-click → Inspect is now available in packaged Tauri builds via the `devtools` feature flag
- **Filament names** — Each filament in the auto-paint list now has an optional name field; defaults to `Filament #<hex>` and updates live with color changes until a custom name is set; names are saved in filament profiles and backward-compatible with old profiles ([#21](https://github.com/vycdev/Kromacut/issues/21))

### Changed

- `.claude/` directory removed from git tracking
- Removed deprecated `baseUrl` from `tsconfig.app.json` (redundant with `paths` in bundler mode)

## v2.3.2 - 2026-03-13

### Added

- **Native desktop app** — Tauri-based builds for macOS (Apple Silicon + Intel), Windows, and Linux
- **Filament calibration wizard** — Measure accurate TD values from physical test prints with confidence scoring
- **Advanced optimizer** — Simulated annealing and genetic algorithms for finding optimal filament ordering
- **Region weighting** — Prioritize accuracy in center or edge regions during auto-paint optimization
- **Auto-paint Web Worker** — Optimizer runs off the main thread with debounced dispatch and cancellation
- **Update checker** — Desktop app checks `kromacut.com/version.json` for new versions
- **Theme persistence** — Dark/light mode choice saved to localStorage
- **Sticky Build 3D Model button** — Stays visible when scrolling through settings
- GitHub Actions release workflow for automated multi-platform builds
- GitHub Actions deploy workflow triggers on version tags

### Changed

- `filamentCoverage` confidence metric now uses deltaE-based color matching instead of filament-count heuristic
- Calibration quality metric uses actual filament calibration data instead of hardcoded value
- Region weights integrated into optimizer scoring via `applyRegionWeightHeuristic`
- CSP properly configured for Tauri (whitelists `kromacut.com` and Google Fonts)
- Vite base path set to `/` for custom domain deployment
- Docs (`TAURI.md`, `UPDATE_CHECKER.md`) moved to `docs/` folder
- README updated for multi-platform support with correct release links

### Fixed

- `package-lock.json` version synced to match `package.json`
- Google Fonts blocked in Tauri production builds due to missing CSP directives
- `useAutoPaintWorker` firing excessively due to unstable object references
- Build 3D Model button had transparent gap at top of scroll container

## v2.2.0 - 2026-02-15

### Added

- **Auto-paint mode** — Define filaments with color and Transmission Distance, automatic Beer-Lambert optical blending computes optimal layer stacks
- **Enhanced color matching** — Optimizer evaluates filament orderings for best color reproduction
- **Repeated filament swaps** — Allow filaments to appear multiple times in the stack for intermediate blended colors
- **Height dithering** — Floyd-Steinberg error diffusion for smoother tonal transitions
- **Filament profiles** — Save, load, import/export (`.kapp` files) auto-paint configurations
- **Transition zones** — Automatic calculation of vertical zones where filament colors blend
- **Processing overlay** — Unified progress indicator for quantization and dedithering
- **Build warning dialog** — Warns before building 3D geometry when layer count or pixel count is high
- **Resizable splitter** — Draggable two-pane layout with percentage-based sizing
- Print settings persistence to localStorage
- Auto-paint state persistence to localStorage

### Changed

- Refactored hooks architecture — business logic extracted into custom hooks (`useSwatches`, `useQuantize`, `useThreeScene`, `useAppHandlers`, `useImageHistory`, `useFilaments`, `useProfileManager`, `useColorSlicing`, `useSwapPlan`, `useProcessingState`, `useBuildWarning`)
- Greedy meshing algorithm made async with periodic yielding for UI responsiveness
- 3MF export enriched with layer height, first layer height, and filament colors

## v2.0.0 - 2025-12-01

### Added

- **3MF export** — Multi-material export with per-color objects and slicer metadata
- **Layer-by-layer preview slider** — Interactive height slider to visualize print buildup
- Greedy meshing with separate wall generation to prevent T-junctions
- Slicer first layer height setting
- Model dimension display in 3D view

### Changed

- Complete 3D engine rewrite with BufferGeometry per-face triangles
- Wall generation based on pixel occupancy to reduce banding
- Texture uses `NearestFilter` with disabled mipmaps for crisp pixel mapping

### Fixed

- Non-manifold edge prevention
- Color swap instruction accuracy
- Inverted normals in mesh generation

## v1.0.0 - 2025-10-01

### Added

- Image upload with drag-and-drop support
- Color quantization (posterize, median-cut, K-means, octree, Wu algorithms)
- Dedithering (median-filter smoothing pass)
- Inline color pickers for palette tweaking
- Per-color slice heights with drag-and-drop reordering
- Live 2D canvas preview and 3D stacked preview (Three.js)
- Binary STL export
- Plain-text print instructions with copy-to-clipboard
- Image adjustments (exposure, contrast, saturation, etc.)
- Undo/redo history for image operations
- Dark/light theme toggle
- Predefined color palettes
