# Changelog

All notable changes to Kromacut are documented in this file.

## v3.2.0 - unreleased

### Added

- **Community showcase** - Added two credited print photos from the Kromacut community to the landing page, with a link back to the original Reddit post.
- **Printable feature-size simulation** - Auto-paint now analyzes the processed image through the selected effective extrusion width before color mapping. Regions too narrow to support a printable path are matched to a printable neighboring color; optional **Omit at-risk colors from matching** substitution happens before swatch extraction to reduce optimizer work without leaving holes in the model, while isolated regions with no defensible neighbor retain their original color. The resolved pixels feed optimizer weighting, Palette Proof targets, the 3D height map, and export geometry. A large At-risk/Printable preview highlights neighboring-color takeover in amber, unsupported detail in pink, affected-pixel counts, and colors that disappear entirely; it renders correctly on first open and after reopening. Analysis runs in a cancelable worker, and the saved effective line width also controls height-dither block size.
- **HD-guided Stack Matrix calibration** - Added a third calibration tab for measuring many fixed-depth physical recipes at once. Choose 2–8 profile filaments, recipe depth, board capacity, and opaque backing; Kromacut prints every combination that fits or uses the existing per-channel HD model to retain a deterministic, color-diverse subset. Planning and slicer-safe 3MF construction run in a worker, use the real profile filaments, include orientation markers and embedded settings, and preserve the immutable recipe plan for later sampling.
  After printing, upload a frontlit photo and align draggable numbered marker centers against a projected grid, magnified crosshair, and perspective-corrected preview. The workflow preserves the photo's aspect ratio, supports 90° rotation and precision zoom, prevents invalid crossing or near-singular corner layouts, and requests confirmation for low-confidence or manually adjusted alignment. Optional marker-based lighting correction and a nearest-neighbor LUT preview make the extracted measurements inspectable before saving.
  Compatible completed matrices contribute to a shared empirical LUT and a regularized effective optical model while leaving saved HD measurements and raw samples unchanged. Exact photographed recipes and bounded interpolation can override simulation only for the measured foundation or an optically equivalent substrate with the same top-material interaction; unsupported recipes retain the fitted or original Beer-Lambert prediction. This prevents colors from abruptly adopting a black-backed measurement merely because a run reached the same depth. Dead-on Palette Proof evidence remains higher priority, matrix cells are never treated as artwork targets, and physical filament assignments and export colors remain unchanged. Planned work survives restarts, completed matrices can be reprocessed or deleted, planned and completed records have separate retention limits, and profile import/export preserves validated evidence without allowing a same-ID legacy file to erase newer measurements.
- **Carrier-free Flat Paint** - Flat Paint now offers a face-up, no-clear-layer layout. It keeps each pixel's normal color-stack order, aligns every visible blend at the flat top surface over foundation backing, preserves the slicer's thicker first layer at the base, and leaves the artwork unmirrored. Preview, 3MF export, size estimates, remembered settings, and print instructions all follow the selected face orientation.
- **Palette Proof export, results, and appearance fitting** - Auto-paint now retains an immutable snapshot of the printable physical layers, compressed zones, swap runs, predicted prefix colors, and target mappings used by preview. The Palette Proof workflow can select processed or fitted image targets, fill remaining rows by usage and diversity, and export a manifold multi-material 3MF of reachable candidate stacks with frozen settings and physical filament assignments. Saved proofs remain tied to the active named profile and exact source result; their settings cannot drift after export, they can be downloaded again while compatible, and their evaluations can be reopened or deleted.
  Results accept one closest patch, tied patches, or **None**, plus **Best available**, **Close**, and **Dead on** quality. Draft edits save immediately across restarts, completed evaluations can be reopened, and the history selector groups target sets and continuation rounds inside a bounded scrolling menu. **Continue targets** retains prior winners while testing nearby untried challengers; **New targets** prioritizes colors outside earlier proofs. Exhausted targets are skipped without padding the proof with unrelated colors, and a None result continues exploring until compatible candidates are exhausted.
  Completed responses provide bounded global and local appearance evidence. Best-available and rejected candidates guide ranking locally, Close adds a partial correction, and Dead on supplies the strongest color and physical-suffix anchor. Corrections decay outside the reviewed recipe/color neighborhood, require held-out improvement before a global fit is applied, and never alter HD calibration, physical assignments, or export colors. Profile schema v3 preserves validated raw evidence, discards imported proofs with incompatible reinforcement geometry, and prevents legacy imports without appearance data from overwriting newer evidence.
- **Landing page and `/app` web route** - Added a responsive product landing page at `/`, moved the browser tool to `/app`, preserved `/docs/...` routes and same-origin localStorage, and added a returning-user launch preference with `/?landing=1` preview support. The landing page includes product visuals, desktop releases, documentation, community links, and persistent System, Dark, and Light themes. Route-specific metadata, landing structured data, app `noindex`, a stable PWA identity starting at `/app`, and static `/app` deployment output support search engines and direct refreshes. Route and Playwright coverage protects the landing CTA, direct app loading, and storage continuity.
- **Preserve color separation (Auto-paint)** - Enhanced matching can require every distinct 2D image color to map to its own printable surface color within a saved ΔE limit from 1 to 100 (default 6). Assignment is solved globally, searches without repeated filament appearances first, then admits one additional appearance at a time up to the shared **Total repeat limit**. The UI reports the actual repeats used. If the available filaments, Max Height, limit, and repeat allowance cannot produce enough unique matches, **Require a unique match for every color** either rejects the result with guidance or keeps it with best-supported printable fallbacks. The summary separately reports unique in-limit mappings, reused printable colors, distinct printable-color capacity, final mappings above the limit, and worst mapped ΔE. Fallback results are labeled **Constraint unmet**; rejected or pending results cannot build, export, or generate misleading instructions. Preserve color separation remains mutually exclusive with Height dithering because both change the printable height map.
- **Prediction uncertainty** - Every generated printable color now carries evidence-aware confidence and provenance as exact, interpolated, fitted, or simulated. Confidence includes distance to measured colors and recipes, local residual agreement, leave-one-out Stack Matrix error, and held-out optical-fit error. Optimizer mapping applies a bounded uncertainty cost so a well-supported near match can beat a speculative numerical match without weakening the raw separation limit or overriding Dead-on anchors. Result Confidence reports the mapped provenance mix and evaluates the physical sequence actually selected, including searches that omit unused filaments. Raw measurements, physical assignments, and export colors remain unchanged.
- **Auto-paint optimization progress** - Enhanced matching now reports approximate staged search progress while the worker runs, including visible progress for Exact's primary no-repeat search.
- **Auto-paint regression and performance coverage** - Added deterministic stack goldens, layer-invariant and realized CIEDE2000 quality-budget tests, a schema-v2 frontlit-profile import fixture, and reproducible real-world Exact and Thorough benchmarks across four images with accumulated Palette Proof and Stack Matrix evidence. Benchmarks record timing and memory while verifying score, filament order, layer count, separation results, and final-stack fingerprints remain unchanged.
- **Collapsible control groups** - Every settings card in 2D and 3D mode can now collapse from its header to save sidebar space. The state is remembered, important status and quick actions remain visible while collapsed, and the sidebar fills the available height without exposing the darker splitter background below shorter groups.
- **3D inspection view modes** - The preview toolbar now offers Shaded, Transparent, and Wireframe modes for inspecting surfaces, layers, and mesh edges. Wireframe uses thin, layer-colored feature edges, and the remembered selection never changes print settings or exports.
- **Auto-paint preview color toggle** - Auto-paint previews can switch between the estimated Simulated appearance and the Physical filament colors without rebuilding the model. The remembered choice affects only the screen preview, never STL or 3MF output.
- **2D touch-up tools** - The 2D preview toolbar now includes hard-edged Brush, Eraser, Fill, Text, and color-picker tools using palette-safe colors. Text supports direct typing, movement, resizing, and wrapping; each edit is undoable while image adjustments remain non-destructive.
- **Experimental multi-plate toggle** - Settings includes a persisted, explicitly unfinished Multi-plate mode switch. Enabling it plays a short print-unlock animation, but it does not yet split images or change generated prints.
- **Calibration theory docs** - Added an in-app guide to frontlit Beer-Lambert modeling, hiding distance, the calibration wedge and reference rail, per-channel multi-base measurements, the session JND fit, confidence scoring, Palette Proofs, and Stack Matrix calibration, with diagrams and a direct link from calibration.
- **Reddit community links** - Added r/kromacut links to the app settings and README.
- **HueForge spool CSV/TSV import** - Auto-paint can import HueForge spool-library CSV or TSV files with flexible column order, RFC 4180 quoted fields, embedded commas or newlines, and an optional UTF-8 byte-order mark. Each spool retains its HueForge UUID and imports with its brand, color name, and hex value; repeated UUIDs receive deterministic suffixes so every filament remains independently editable.
- **Filament profile templates** - The Auto-paint profile dropdown has a read-only Templates group with built-in supplier filament sets, starting with Bambu Lab PLA Basic. Templates include names, brands, colors, and estimated HD values; loading one fills the working list, and **Save as new profile** creates an editable copy without allowing template IDs to be overwritten or imported.
- **Supplier palettes** - The palette dropdown has a Supplier Palettes group with real filament color sets, starting with the 30-color Bambu Lab PLA Basic chart. Supplier palettes can drive quantization directly or be cloned for editing.
- **Clone palettes** - A clone action copies any built-in, supplier, or custom palette into an editable custom palette. Custom disabled-color flags and supplier color names are preserved where applicable.
- **Custom palette color names** - Custom palette rows support optional names stored in `.kpal` files and shown in palette tooltips. Older palette files remain compatible.
- **Per-color enable/disable in custom palettes** - Each custom color can be excluded from quantization without being deleted. Disabled colors persist in additive palette-format v2 data, older files load unchanged, older Kromacut versions treat all v2 colors as enabled, and the dropdown shows enabled and total counts.

### Changed

- **App and Auto-paint performance** - Opening 3D no longer synchronously prepares multi-megabyte calibration evidence or stalls while development tools inspect large printable-detail buffers. The first 3D mount and WebGL setup yield to the UI, same-input completed work is reused across tab switches, workers suspend or retry safely, and confirmed builds show preparation before applying their state. Exact and Deep searches use in-place traversal, indexed lookups, sparse feasibility checks, bounded caches and matching workspaces, precomputed calibration records, and capped recipe-neighbor memory. Full-image scans, palette reconciliation, calibration serialization, and worker handoff also allocate less while preserving deterministic scores, layer stacks, previews, and exports.
- **Dependency security updates** - Updated the desktop runtime to Tauri 2.11.1, fixing an origin-confusion issue that could let a crafted remote page invoke local-only IPC commands on Windows, along with patched openssl, rustls-webpki, and rand crates. Development tooling also moved to newer Vite, Rollup, PostCSS, esbuild, Babel, and related releases. The production npm dependency audit is clear; remaining npm audit findings are confined to development tooling.
- **Hiding Distance replaces TD** - Filament opacity is now expressed as frontlit **Hiding Distance (HD)** in millimetres. Stored values use one meaning in profile schema v2: uncalibrated values from older profiles and saved state are converted once on load or import, and the old internal scaling layer is removed. A row action accepts conventional backlit/lithophane TD input and converts it to HD; the estimate wand produces HD directly, per-channel values appear in tooltips, and uncalibrated colors use color-derived channel HDs. This also corrects the recommended-height estimate and keeps next-filament simulation on the same physical scale.
- **Frontlit filament calibration** - Replaced photo sampling with a camera-free wedge workflow. Choose one or more filaments and their backing layers, download STL or multi-material 3MF patches, and record when each printed patch first matches its opaque reference rail. Quick mode stores a single-base HD; Accurate mode combines multiple bases into RGB-channel HDs and can fit a shared session JND. The preview and confidence use the exact layer height, base filaments, and settings frozen into the downloaded wedge, and partial entry saves completed filaments without changing unfinished ones. Editing a calibrated swatch temporarily falls back to a color-estimated HD without deleting the measurement; reverting the color restores it. Legacy photo measurements are removed on load, so older profiles should be recalibrated.
- **Auto-paint enhanced matching** - Optimizer scoring now follows the same layer-snapped, Max Height-compressed printable stack used by preview and export, scores realized print error in CIEDE2000 with a weighted p95 tail term, and uses complete target, tuning, and calibration inputs so repeated runs remain deterministic.
- **Auto-paint optimizer controls** - Replaced the older algorithms with deterministic Fast, Balanced, Thorough, Deep, and Exact base-order effort tiers, selector-based repeat limits, transition-detail endpoints, and explicit stable seeds. Exact shows its estimated base-order count before running, and legacy saved values migrate to the nearest tier.
- **Auto-paint optical model** - Beer-Lambert blending now runs in linear-light sRGB, and calibrated filaments use per-channel HDs—measured in Accurate mode and scalar-anchored in Quick mode—for blend simulation and transition-zone thickness. Recalibrate profiles created with earlier releases before using them for new prints.
- **Auto-paint results display** - Transition Zones now includes a proportional plate-to-top stack bar and more compact height rows, while confidence factors use visible bands and optimizer cache/convergence status is easier to scan.
- **Height dithering kernel** - Height dithering now uses an error-conserving Stucki kernel instead of Floyd-Steinberg, spreading quantization error over a wider area while keeping the existing block-aware dot sizing and edge protection.

### Fixed

- **Saved and reset 3D settings** - Stored Auto-paint settings are applied before the first persistence pass instead of being briefly replaced by defaults during startup or hot reload. Unsaved working filament edits remain authoritative over the last selected named profile, Max Height and calibration layer height are remembered with the other options, and **Reset Print Settings** also restores Smooth Meshing.
- **Crop controls** - Crop mode no longer places its interaction overlay above the preview toolbar or image-size HUD, so Save crop, Cancel crop, and other visible actions remain clickable.
- **Auto-paint layer-height changes** - Changing first-layer or regular layer height while Auto-paint is active no longer crashes while a replacement worker result is pending; stale stack snapshots are ignored until their slice grid matches.
- **Settings documentation link** - Opening Docs from Settings now remains in the documentation when Docs is already active instead of unexpectedly returning to the app.
- **Auto-paint Max Height** - Planning, scoring, preview, and export now use the same layer-aligned stack. Height caps round down to a printable boundary instead of exceeding the requested maximum with one final layer.
- **Auto-paint region priority** - Center and Edge priority use the actual locations of image colors instead of inferring position from brightness or allocating a full-image weight map.
- **Auto-paint determinism and edge cases** - Blank seeds resolve consistently, result caches include all inputs that can affect output, beam-search ties use locale-independent ordering, zero-HD helpers agree on the opaque limit, and exceptionally tall stacks stop at the intended 500-layer slice-data limit.
- **Filament profile validation** - Imported `.kfil` and legacy `.kapp` filaments reject zero or negative hiding distances and ambiguous duplicate filament IDs before invalid values reach the UI. Existing working lists and legacy stored profiles with colliding IDs are repaired without dropping filament rows; ambiguous profile-level appearance evidence is discarded during that repair.
- **Profile and palette persistence** - Failed imports and browser-storage writes no longer report success or replace the in-memory profile, palette, or active selection. Named-profile CRUD and custom-palette operations preserve the current state and show recovery guidance when storage quota or browser privacy restrictions reject a write.
- **Desktop 3MF export reliability** - Model XML streams into the archive in bounded chunks, avoiding desktop WebView `FileReader` `NotReadableError` and `RangeError: Invalid string length` failures on large exports.
- **Smooth meshing 3MF integrity** - Smoothed cap faces are validated in the exporter's exact integer coordinate units and re-triangulated before serialization when necessary, preventing the pinhole open or non-manifold edges reported by slicers on large smooth 3MF exports. STL exports were unaffected.

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
