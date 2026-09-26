# Changelog

All notable changes to Kromacut are documented in this file.

## Unreleased

### Added

- **Linux AppImage delta updates** - Release builds embed stable-channel update information and publish a matching `.AppImage.zsync` asset for compatible tools such as AppImageUpdate. Release checks validate the embedded location, target filename/URL, size, checksum, and sidecar structure before publication. Older AppImages without update information require a one-time manual download; the in-app update notification remains download-page based. Other package formats and Linux compatibility targets are unchanged.
- **Twelve-language interface and guides** - Added i18next language selection using the existing shared Select controls in Settings and on public pages for English, French, German, Italian, Romanian, Spanish, Japanese, Simplified Chinese, Hindi, European Portuguese, Ukrainian, and Bengali. Compact public-page selectors match footer-link styling, with the landing selector aligned within the responsive footer navigation. The choice is saved locally, can follow the system language, and updates without resetting artwork, profiles, print settings, or built geometry. App controls, accessibility labels, errors, print instructions, all fifteen guides and their diagrams, landing pages, Privacy, and Terms have localized resources. Language-prefixed public links preserve stable document anchors and provide translated static HTML, metadata, sitemap entries, and language alternatives. Browser install descriptions keep the same installed app identity, and the desktop update feed carries translated release notes while retaining compatibility with older clients. Locally bundled script-appropriate fonts also travel inside full-size translated SVGs. Coverage checks reject missing resources, altered guide structure, stale diagram measurements, and untranslated UI literals; browser, native, and export regressions check language switching, mobile layouts, desktop save dialogs, and unchanged physical output. Unknown diagnostic text is preserved rather than reinterpreted through generic UI templates.
- **Terms and conditions page** - Added `/terms` with landing-footer navigation, reciprocal Privacy links, canonical metadata, a sitemap entry, and readable static HTML. The terms explain AGPL software rights, artwork and export responsibilities, print checks, local backups, Reddit/Discord help, optional Patreon support, and legally bounded warranty wording. Shared legal-page presentation preserves accessible email reveal/copy controls and mobile layouts, with route and browser regression coverage.
- **Privacy and local-data page** - Added `/privacy` and a landing-page footer link to normal builds, including readable static HTML, page metadata, a sitemap entry, and section navigation. The notice explains local storage, hosting and email providers, international processing, six-month manual correspondence reviews, privacy rights, and complaint routes. Click-to-reveal public email replaces its button and hint with the focused address link and Copy action; the literal address stays out of initial HTML and built JavaScript. Mobile, keyboard, clipboard, static-page, and route checks cover the page. Internal legal review notes stay separate from the public notice; email obfuscation is not bot-proof protection.
- **Locally hosted fonts** - Bundled the existing Oxanium, Source Code Pro, and Source Serif 4 fonts with their licenses so the website and desktop app retain their typography without contacting Google Fonts.
- **Sticky mobile launch button** - The landing page keeps an Open Kromacut action at the bottom of phone-sized screens after the header button scrolls away. It hides again at the top and stays off desktop layouts, the editor, and documentation. Safe-area spacing keeps footer links reachable, with browser coverage for scrolling, resizing, keyboard access, themes, and navigation.
- **Custom 404 page** - Broken links now show a responsive, light/dark error page with a custom layered-color 404 illustration and colored two-arm corner accents floating above the lettering, directly over the build plate's corners, a split desktop layout, compact mobile composition, and clear app, homepage, and documentation recovery links. Unknown documentation pages no longer silently show the first guide. GitHub Pages receives the same design in a standalone, search-index-excluded `404.html` that works without JavaScript. Regression coverage checks direct-link status, recovery links, desktop/mobile layouts, decorative-art accessibility, and in-app documentation navigation.
- **Illustrated feature guides** - Expanded the 3D and 2D documentation with control-by-control explanations, physical layer and color examples, calibration workflows, and full-size vector illustrations. The HD guide includes a real eight-filament wedge photograph, its recorded layer settings, and guidance to read physical patches rather than photo colors. The guides distinguish preview-only controls from image and geometry edits, describe settings that interact, and explain what must match the slicer. Mobile navigation collapses to leave room for reading. Documentation checks cover navigation, image assets, and responsive rendering.

### Changed

- **Effective line width in print settings** - Moved the existing control into **3D Print Settings**, retaining its saved value and including it in the section reset and modified-state indicator. Removed the separate reset button and helper description.
- **Adaptive Stack Matrix calibration** - New boards use a maximum color-stack thickness instead of a fixed 3–6-layer recipe depth, with up to 64 regular layers. The foundation is only the effective first print layer, without opacity-based thickening; shorter recipes use backing padding inside the color region to preserve a flat photographic surface. The UI shows foundation + color-region height, total height, and print-layer count, with a reminder that thin backing is not guaranteed opaque. Selection uses compatible completed measurements to seek new color, thickness, and filament-transition coverage, while retaining exploratory and reference patches. Similar recipes are grouped to reduce fragmented same-color toolpaths without claiming fewer swaps or a measured time saving. A material-change budget constrains planning without claiming a slicer time guarantee. Existing boards remain readable and re-export with their original foundation, cell positions, and recipes. Regression coverage checks adaptive selection, grouped layout, one-layer foundations, saved-data compatibility, padded recipe predictions, flat manifold exports, and the browser save workflow.

### Fixed

- **Over-aggressive printable-detail cleanup** - Width checks now account for pixel boundaries and preserve connected regions with a wide core, avoiding whole-pixel rounding and diagonal false positives. Auto-paint's At-risk/Result preview distinguishes warnings from actual removals. The renamed **Omit isolated color specks** option only replaces colors used exclusively in tiny compact specks enclosed by one wider color; thin linework, connected detail, and ambiguous regions stay intact. Matching, preview, and export share the same cleanup without editing the 2D source. Regression coverage checks detail conservation, saved line-width settings, and browser behavior. This remains an image-only estimate, not a model of physical material layers or slicer toolpaths.

## v4.0.0 - 2026-09-10

### Upgrade notes

- **Back up important filament profiles before upgrading.** Legacy photo-based opacity-calibration records are no longer used and are removed on load; affected filaments should be recalibrated with the new wedge workflow. This does not refer to the new Stack Matrix photo measurements.
- **Regenerate Auto-paint results before printing.** The updated optical model and layer planning can change predicted colors, stack heights, and swap plans. Check the new instructions against your slicer settings.
- **TD is now frontlit Hiding Distance (HD).** Older uncalibrated values are converted once on load or import. Conventional backlit/lithophane TD remains an accepted input and is converted to HD; do not manually rescale already-migrated profiles.
- **Preview colors remain predictions, not guaranteed print matches.** Calibration evidence and confidence help identify better-supported estimates, but results still depend on the filament, printing conditions, and lighting.

### Added

- **Stack Matrix calibration** - Print many fixed-depth filament recipes on one board, then photograph and align the result to measure their colors. Choose 2–8 filaments, recipe depth, capacity, and backing; Kromacut prints every combination that fits or selects a color-diverse subset using the HD model. The photo tools include orientation markers, rotation, precision alignment, a projected grid, and corrected previews, with explicit review for uncertain alignment and optional reference-marker correction.
  Compatible matrices supply measured colors and bounded estimates for nearby recipes. Broader optical fitting must improve held-out measurements; unsupported combinations retain conservative estimates. Derived fitting leaves saved HD values, raw measurements, and physical export colors unchanged. Same-ID legacy imports cannot erase newer appearance evidence.
  Saved boards remain attached to their owning profile and retain their recipes, regular and first-layer heights, and measurements. New boards follow the current 3D print settings. Plans survive restarts and can be re-downloaded; completed boards can be rephotographed or deleted. Desktop exports use Save As, and cancelled or failed saves do not register a new plan. Calibration 3MFs sanitize invalid characters in filament names.
- **Palette Proofs** - Export a job-specific 3MF of reachable candidate stacks for selected image colors. Record the closest patch, ties, or **None**, with **Best available**, **Close**, or **Dead on** match quality. Draft results persist across restarts. **Continue targets** tests nearby untried challengers; **New targets** explores other colors, without padding exhausted rows with unrelated candidates. Proofs retain their original settings and can be reopened, re-downloaded while compatible, or deleted. Judgments provide bounded appearance corrections without changing HD calibration or physical filament assignments; broader fits require held-out improvement.
- **Preserve color separation** - Enhanced matching can assign distinct image colors to distinct printable colors within a hard predicted ΔE limit. Strict mode rejects incomplete results; otherwise unmatched colors merge into valid surviving matches. Results distinguish **Exact optimum**, **Best found**, and **Partial palette**, report preserved colors and repeats, and block printing when no valid mapping exists. The search removes unnecessary filament repetitions. This option and Height dithering are mutually exclusive.
- **Prediction confidence** - Printable colors report whether they come from exact recipe measurements, interpolation, fitting, or simulation. Matching considers evidence strength alongside predicted color error without weakening the separation limit or overriding Dead-on anchors.
- **Printable feature-size preview** - Inspect detail at the selected effective extrusion width. The At-risk/Printable preview shows narrow regions and likely neighboring-color takeover. Optional **Omit at-risk colors from matching** applies that substitution throughout matching, preview, and export; isolated regions without a defensible replacement retain their original color. The same line-width setting controls height-dither block size. This is a printability estimate, not a substitute for checking the slicer.
- **2D touch-up tools** - Added palette-safe Brush, Eraser, Fill, Text, and color picking. Text can be moved, resized, and wrapped; edits support undo while image adjustments remain non-destructive.
- **3D inspection and color modes** - Added Color accurate, Shaded, Transparent, and Wireframe views, plus a Simulated/Physical filament-color toggle. Color accurate displays the selected swatches without lighting or tone-mapping changes; it does not guarantee a physical color match. These remembered display options never change exported geometry or materials.
- **Carrier-free Flat Paint** - The experimental Flat Paint workflow now supports face-up prints without a clear carrier layer. Normal color-stack order is retained over backing, with visible blends aligned at the flat top surface and no artwork mirroring. Preview, exports, and instructions follow the selected orientation.
- **Landing page and web routing** - Added a responsive landing page at `/` and moved the browser tool to `/app`, preserving same-origin saved data and `/docs/...` links. Includes returning-user launch preferences, themes, desktop downloads, search metadata, and direct-route support. Settings provides a direct link to documentation.
- **Community showcase** - Six responsive project cards combine sixteen preview, slicer, and finished-print images: King of Hearts, Hobbits and Dragons, HOPE, Titan, Batmanga, and Naruto. Captions distinguish predictions from physical results and include creator credits, available source links, and full-size views.
- **Collapsible controls** - Settings groups in 2D and 3D can collapse while retaining important status and quick actions. Their state is remembered.
- **Filament templates and palette tools** - Added unofficial Bambu Lab PLA Basic supplier palettes and read-only filament templates with estimated HD values. Templates can be saved as editable profiles. Built-in, supplier, and custom palettes can be cloned; custom colors support names and persistent enable/disable flags. Older palette files remain compatible, and migration to the expanded built-in catalog retains custom palette and profile selections.
- **HueForge spool import** - Import CSV or TSV spool libraries with flexible columns, quoted fields, multiline values, and a UTF-8 BOM. Names, brands, colors, and spool UUIDs are retained, with duplicate UUIDs made independently editable.
- **Calibration documentation and community links** - Added an illustrated guide to HD, wedge calibration, Palette Proofs, and Stack Matrices, plus Reddit links in Settings and the README.
- **Experimental multi-plate switch** - Added a remembered preview toggle and animation. It is explicitly unfinished and does **not** split images or change generated prints.
- **Developer diagnostics and validation** - Optional desktop recording captures Auto-paint settings, evidence, progress, and final stacks without the source image or changes to optimizer selection. It is off by default. Offline tools create frozen diagnostic print bundles, replay predictions against preserved recipes, and evaluate withheld recipes, filament pairs, and boards. Reports distinguish model estimates from photographed evidence and disclose shared-photo limitations; these tools do not modify saved calibration.
- **Regression and performance coverage** - Added deterministic stack fixtures, printable-layer and export checks, prediction-consistency and held-out-validation tests, reproducible optimizer benchmarks, and browser coverage for calibration, persistence, exports, and the landing page. Color-quality tests assess predicted colors at printable layer heights, not independently measured print accuracy.

### Changed

- **Frontlit wedge calibration and HD** - Replaced the legacy photo-based opacity workflow with camera-free printed wedges and adjacent opaque reference rails. Quick reads measure scalar HD; additional bases refine a constrained channel estimate. Partial sessions save only completed filaments, and editing a calibrated swatch temporarily disables its calibration without deleting it. STL and multi-material 3MF exports retain the settings used to print the wedge. HD storage semantics were introduced in profile schema v2 and are retained in v3, which also preserves validated appearance evidence.
- **Auto-paint optical model** - Blending now uses linear-light sRGB and substrate-aware HD estimates. Wedge refinements remain local to tested bases; compatible Stack Matrix evidence can support richer fits within measured thickness ranges. Interpolation and measured-prefix corrections fade outside their support, with conservative estimates used beyond it.
- **Auto-paint matching and search** - Scoring, preview, and export now share the final layer-snapped, height-limited stack. Only results matching the current layer settings are used for slicing. Matching evaluates predicted CIEDE2000 color error at printable heights, considers poorly matched colors and prediction confidence, and reuses the selected layers in the preview. New Fast, Balanced, Thorough, Deep, and Exact effort tiers replace older algorithm choices, with repeat limits, transition detail, stable seeds, deterministic beam-search tie-breaking, and search progress. Saved algorithm selections migrate to the nearest tier.
- **Performance** - Reduced startup, 3D-tab, calibration, and optimizer overhead through worker offload, deferred preparation, bounded caches, and lower-allocation processing. Completed work is reused when inputs are unchanged, while deterministic stack and export results are preserved.
- **Results display** - Transition Zones includes a proportional stack bar and compact height rows. Calibration confidence and optimizer status are easier to scan.
- **Height dithering** - Replaced Floyd-Steinberg with an error-conserving Stucki kernel while retaining block sizing and edge protection.
- **Dependency security updates** - Updated Tauri to 2.11.1 to address a Windows IPC origin-confusion issue, alongside Rust dependency and development-tooling updates. The production npm audit is clear; remaining npm findings are confined to development tooling.

### Fixed

- **Desktop file exports** - Filament-profile `.kfil` and Hiding Distance calibration STL/3MF exports use Save As, handle cancellation without reporting success, and surface write errors. Wedge exports show a busy state and retain the previous downloaded plan if saving is cancelled or fails; regression coverage checks both formats and browser downloads. Large 3MF exports stream XML in bounded chunks to avoid desktop WebView read and string-size failures.
- **Profile and palette persistence** - Failed storage writes no longer report success or replace working state. Imports validate hiding distances and duplicate filament IDs; legacy stored ID collisions are repaired without dropping filament rows, while ambiguous appearance evidence is discarded.
- **Remembered print settings** - Saved Auto-paint settings load before persistence can replace them with defaults. Unsaved filament edits remain authoritative, Max Height and wedge layer height are remembered, and Reset Print Settings also resets Smooth Meshing.
- **Max Height and foundation opacity** - Height caps round down to printable boundaries; compression and trimming preserve the foundation's opacity minimum, and impossible foundations are rejected.
- **Auto-paint edge cases** - Center and Edge priority use actual image regions. Blank seeds, cache inputs, zero-HD limits, and the 500-layer ceiling behave consistently.
- **Crop controls** - Crop overlays no longer block Save, Cancel, or the image-size controls.
- **Smooth 3MF integrity** - Validate and, where needed, retriangulate smoothed faces at export precision to prevent pinhole open or non-manifold edges in large exports. STL exports were unaffected.

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
