# Changelog

All notable changes to Kromacut are documented in this file.

## v3.2.0 - unreleased

### Fixed

- **Consistent sidebar background** - The 2D and 3D control sidebar now fills its available height when collapsible groups do not occupy the full viewport, preventing the darker splitter background from showing below the controls.

### Added

- **Calibrated optimizer performance fixtures** - Added reproducible real-world eight-filament Exact and Thorough benchmarks with accumulated Palette Proof and Stack Matrix evidence, four different processed images, reference settings, screenshots, and generated 3MF output for measuring optimizer improvements without changing print results.
- **Community showcase** - Added two credited print photos from the Kromacut community to the landing page, with a link back to the original Reddit post.

- **Printable feature-size simulation** - Auto-paint now analyzes the processed image through the selected effective extrusion width before color mapping. Regions too narrow to support a printable path are matched to the nearest printable neighboring color; optional **Omit at-risk colors from matching** substitution happens before swatch extraction to reduce optimizer work without leaving holes in the model, while isolated regions with no defensible neighbor retain their original color. Those exact resolved pixels feed optimizer weighting, Palette Proof targets, the 3D height map, and export geometry. The sidebar keeps only a compact affected-pixel summary, while a large At-risk/Printable popup highlights neighboring-color takeover in amber, unsupported detail in pink, affected pixel counts, and source colors that disappear entirely. The distance transform runs in a cancelable worker so line-width, omission, or pixel-size changes do not freeze the interface, while the existing saved line-width value remains compatible and also controls height-dither block size.
  The popup paints its initial At-risk canvas as soon as the dialog portal mounts, including after reopening, instead of requiring a Printable/At-risk tab switch to trigger the first draw.

- **HD-guided Stack Matrix calibration** - Added a third calibration tab for LUT-style physical color measurement. Choose 2–8 profile filaments, a fixed recipe depth, a square board capacity from 64 (8 × 8) through 2,025 (45 × 45) cells, and opaque backing; Kromacut uses a consistent gapless grid of 5 mm cells, prints every layer combination that fits, or uses the profile's existing per-channel hiding distances to deterministically retain the most color-diverse recipes when the full combination set is too large. The setup shows its inherited layer heights and a conservative minimum filament-swap estimate while making clear that gamut coverage, rather than tool-change count, drives recipe selection. Planning and 3MF construction run in a background worker with visible planning/export phases so large matrices do not block the interface. The face-up multi-material 3MF contains one assigned part per real filament, a hiding-distance-sized foundation, four orientation/sampling markers, embedded slicer settings, and an immutable `kromacut-stack-matrix.json` plan. After printing, upload or drop a frontlit photo; Kromacut estimates the board, provides draggable numbered marker-center handles with a magnified crosshair, projects the exact cell template over the photo, and renders a perspective-corrected preview with re-detect and reset controls. Corner dragging remains responsive on dense boards by keeping the source photo static, batching projected grid strokes, drawing live handle/grid/loupe movement directly once per display frame without React state updates, and refreshing the expensive rectified preview only after release. Concave, crossing, and near-singular corner moves stop at the nearest valid convex layout, while the projected template is clipped to the board polygon. Optionally correct lighting from the known marker recipes, preview the extracted LUT, and save it into the named filament profile. Every compatible completed matrix now contributes to a shared empirical LUT, so earlier recipes remain available while overlapping exact and interpolated evidence is combined using alignment confidence, recipe coverage, recency, and robust cross-matrix agreement. The same compatible samples jointly derive a regularized effective optical model from the saved filament swatches and per-channel HD values: it can correct each filament's RGB-channel HD and opaque appearance, fit nonlinear transmission for contiguous runs, and model ordered filament-over-substrate interactions. The derived model is accepted only when enough evidence is available and its mean matrix ΔE improves; saved HD measurements and raw matrix samples remain unchanged. Exact photographed recipes override the fitted optical simulation, nearby unprinted recipes interpolate measured Lab colors inside bounded physical-order and predicted-color coverage, and unsupported recipes fall back to the effective model or its original Beer-Lambert priors without extrapolating photo evidence. Auto-paint optimization and the final preview use the same physical and empirical resolvers, while physical filament assignments and export colors remain unchanged, Dead-on Palette Proof evidence remains higher priority, and matrix cells are never treated as requested artwork colors. Planned matrices survive restarts, completed matrices can be reprocessed or deleted, and profile import/export sanitizes and preserves the bounded evidence. Added deterministic planning, photo extraction and alignment, appearance integration, persistence, and 3MF metadata regression coverage.
  The photo workflow also shows a spatial printed-corner key using each matrix's actual marker recipes, making the board's top edge and rotation visible before the numbered handles are aligned. Uploaded photos can be rotated left or right in 90° steps; the rotated pixels and dimensions feed back through marker detection, grid projection, rectification, and sampling. The alignment guidance clarifies that handles belong at colored marker-cell centers, with the projected board boundary half a cell outside them. A full-width, tall alignment workspace fits the whole photo at 100%, then expands it inside a two-axis scrollable viewport for 150–400% precision zoom. Corner validity always follows the absolute cursor position, while a constrained handle catches up to a newly valid position over short capped steps instead of snapping or creating path-dependent invalid regions. The extracted LUT renders as one nearest-neighbor canvas, avoiding dark fractional-pixel seams between sampled cells.
  Stack Matrix planning now bounds the HD-gamut candidate pool at the largest supported 8-filament, 6-layer configuration while remaining deterministic and retaining every pure-filament recipe. Photo extraction samples a projective central inset per cell, and low-confidence or manually adjusted alignments require explicit review confirmation stored with the evidence. Subset matrices remain compatible with their unchanged full owner profile; first-layer values below the regular height are normalized consistently across geometry, metadata, persistence, and slicer settings. The opaque backing defaults to the lightest selected matrix filament and automatically recovers to another selected filament if it is deselected. The 3MF splits touching recipe voxels into closed, manifold material groups, downloads a completed file even if plan persistence fails, and locks record mutation while generation is active. Planned and completed matrices have separate retention limits so a new print cannot evict completed calibration.
  Absolute photographed matrix colors are substrate-aware: Auto-paint applies them only when the generated stack retains the measured recipe over either its original foundation or an optically equivalent backing with the same top-material interaction. Recipe opacity alone no longer authorizes transplanting an absolute matrix color onto a different substrate. This prevents white, yellow, cyan, and other runs from abruptly adopting isolated black-backed calibration colors at the matrix recipe depth, while preserving exact and interpolated measurements across equivalent first-layer segmentation.
- **Carrier-free Flat Paint** - Flat Paint now offers a face-up, no-clear-layer layout. It keeps each pixel's normal color-stack order, aligns every visible blend at the flat top surface over foundation backing, preserves the slicer's thicker first layer at the base, and leaves the artwork unmirrored. Preview, 3MF export, size estimates, remembered settings, and print instructions all follow the selected face orientation.
- **Palette Proof export, results, and appearance fitting** - Auto-paint results now retain one immutable, serializable snapshot of the exact printable physical layers, compressed zones, swap runs, base and appearance-adjusted prefix colors, and processed-target mappings used by preview. The calibration dialog includes a Palette Proof tab with selectable target and candidate counts, a separate image-based target-selection step where users can click artwork regions and choose between original processed colors or the exact fitted/achievable colors already used by Auto-paint preview and scoring while automatic usage/diversity selection fills the remaining targets, a deterministic target-row map shared by the proof and Results views, and downloadable 3MF using up to five unique reachable prefixes per target, touching 8 mm patches, 2 mm margins, calibration-matched 1.2 mm rounded outer corners, a 2 mm orientation notch, one continuous reinforced foundation, physical layer/filament assignments, embedded frozen instructions and OPC-declared patch metadata, stale/non-prefix validation, and manifold topology regression coverage. The fitted selector reuses the active appearance model and printable-stack mapping instead of introducing another fitting path. Candidates are sorted by stack height and adjacent cells are unioned per layer to reduce slicer islands and travel. Exported proofs persist in the active named filament profile with their exact process and original Beer-Lambert prefix predictions; once recorded, their target count, candidate count, image selections, and target-color mode are locked so the saved job cannot diverge from its printed 3MF. Any saved proof and its results can be deleted, and proofs can be downloaded again while their exact source Auto-paint result is active. The Results view records one closest patch, multiple tied patches, or no match for every target, saves progress immediately across restarts without restarting Auto-paint for draft edits, stays on the selected saved job while results are entered, and locks or reopens completed evaluations. The proof selector groups matching target lists and target-color mode into numbered sets, labels later rounds as continuations with timestamp and completion state, and infers those groups for existing records without a migration. The automatic next proof consumes completed history for the same target-color mode intersected with the current physical stack so reopening the same image advances to valid untested or least-tested targets instead of silently recreating the baseline sheet. Completed jobs also offer separate **Continue targets** and **New targets** actions: continuation preserves the exact target set and color mode while spending rows on untested stack candidates, while new-target proofs open the image-selection step, inherit the color mode, strongly prefer colors outside the selected proof, and balance repeated coverage by visit count. Profile schema v3 exports/imports this bounded, validated raw appearance evidence without changing v2 hiding-distance semantics. Auto-paint now derives a deterministic, strongly regularized global Lab lightness/chroma rank correction in its worker, fingerprints it into optimizer caches, and gamut-maps it consistently for optimizer scoring and simulated preview colors only when the training partition itself contains at least eight closest choices spanning eight stacks and it improves a whole held-out proof by at least 10 percentage points with at least 70% agreement. `None` results remain useful for coverage and follow-up selection but cannot satisfy the directional fit gate. Result Confidence reports training and held-out evidence separately. Physical filament assignments, HD calibration, and export colors remain unchanged.
  Each selected result also records whether it was merely the **Best available**, **Close**, or **Dead on**. Best-available judgments remain ranking-only evidence, while Close and Dead-on judgments add progressively stronger absolute color anchors to the existing appearance fit; older saved judgments default safely to Best available. Dead-on results additionally retain the selected patch's complete visible filament run plus as much lower optical context as the current hiding-distance model says remains relevant. Auto-paint can therefore reuse a measured suffix over a different buried foundation once that suffix reaches the proof's opacity endpoint, prefers a realizable Dead-on recipe during optimization, maps the target to the first calibrated prefix instead of an earlier simulated color tie, and carries that height into preview and export without requiring the entire old stack to match. Continuations preserve the prior physical winner, choose untested challengers from a moderately broad perceptual neighborhood of up to ΔE00 18, and include no more than one exploratory stack. Tied winners define the shared neighborhood instead of silently discarding all but the first. Exhausted targets are listed and skipped while the remaining targets continue within the same numbered set; continuation stops only when every target is exhausted. Partially exhausted rounds also reduce the candidate matrix rather than padding it with unrelated colors.
  A **None** result no longer treats the rejected simulated incumbent as a previous best: continuation keeps exploring unseen stacks and marks a target exhausted only when no compatible untested prefix remains. Conflicting exact anchors use explicit evidence precedence, confidence, and recency rather than favoring whichever measurement most resembles the old simulator, with direct Palette Proof judgments preferred over photographed matrix colors. Completed-evidence invalidation now includes the physical proof stack consumed by suffix fitting. The image-target step also exposes every available processed or fitted color as a compact, scrollable set of keyboard-operable toggles, so an exact subset can be chosen without pointer input. Imported proofs whose reinforcement clearance cannot fit between neighboring cells are discarded before geometry generation.
  Palette Proof responses now also rebuild deterministic local recipe-and-color neighborhoods. Best-available winners and every tied winner support nearby recipes for the reviewed target, unselected candidates and None answers supply local rejection/uncertainty evidence, Close supplies a partial local Lab correction, and Dead on supplies the strongest correction alongside its exact suffix anchor. Physical-recipe similarity emphasizes recent optically dominant layers, while both recipe and color effects decay outside the reviewed neighborhood. Auto-paint uses the same local corrections for optimizer scoring and final preview, plus bounded target-aware support/rejection preferences, so repeated losses by related recipes can steer nearby colors without leaking into unrelated stacks or overriding measured error and exact anchors. Result Confidence exposes local neighborhood and current-palette coverage even when the global held-out fit remains gated.

- **Frontlit filament calibration** - Replaced the photo-based TD calibration with a camera-free workflow. Pick one or more filaments, choose the base layer each prints over (defaults to your darkest filament; dark filaments can use a lighter base for contrast), then download a calibration wedge (STL for any printer, or a multi-material 3MF for AMS) that prints 1..N filament layers over that base alongside an opaque reference rail, and report the layer count at which each filament/base patch first matches the rail. Quick mode keeps the single-base scalar calibration; Accurate mode repeats the read over multiple bases to fit measured RGB-channel TDs directly, stores the read set (plus optional merge points), and fits a shared session JND when enough multi-base data is present. Kromacut converts those reads into a frontlit Transmission Distance using a perceptual just-noticeable-difference model, with a live predicted-vs-reference preview and confidence rating. Read entry stays tied to the base filaments and print settings of the downloaded wedge, so changing layer height or max layers afterward does not reinterpret the physical print. Results can be entered partially: saving calibrates the filaments you finished and leaves the rest untouched, so a wedge printed for eight filaments can be read a few at a time. Filaments with nothing entered are marked and discarded on save, and one with only some of its Accurate-mode base reads filled in is flagged rather than dropped silently. The 3MF assigns parts to your real profile-filament slots (no invented base filament) and lays each tile out as an independently-arrangeable object. A calibration is tied to the swatch color it was measured for: editing a filament's color deactivates its calibration (the row falls back to a color-estimated hiding distance) and reverting the color reactivates it, so auto-paint never blends with measurements from a different material. The old backlit photo wizard, its image sampler, and stored RGB measurements are removed, and legacy stored RGB calibrations are stripped on load; recalibrate any previously calibrated filaments.
- **Landing page and `/app` web route** - Added a responsive product landing page at `/`, moved the browser tool to `/app`, preserved `/docs/...` routes and same-origin localStorage, and added a returning-user launch preference with `/?landing=1` preview support. The app logo provides a direct route back to the landing page. The landing page includes the core workflow, existing product visuals, desktop releases, documentation, GitHub, Discord, Patreon, and Reddit links, plus persistent System, Dark, and Light theme controls with tailored styling for each theme.
- **Route-aware SEO and deployment output** - Added route helpers, landing structured data, app `noindex` metadata, a stable PWA manifest identity with `/app` as its start URL, and static `dist/app/index.html` output for GitHub Pages refreshes.
- **Route and landing smoke coverage** - Added focused route-selection tests and Playwright coverage for the landing CTA, direct `/app` loading, and same-origin storage persistence.
- **Preserve color separation (Auto-paint)** - Enhanced color matching can require every distinct 2D image color to map to its own printable surface color within a saved, configurable ΔE limit entered from 1 to 100 (default 6), preserving gradients that would otherwise collapse onto a flat surface while letting users trade color accuracy for feasibility. Assignment is solved globally across all image colors rather than greedily consuming the nearest unused prefix. The optimizer searches the selected effort without repeats first, then allows one additional filament occurrence at a time and stops at the first successful complexity tier; the former Extra repeated swaps control is now labeled **Total repeat limit** and described as one shared ceiling on extra filament appearances, while the UI reports the actual repeats used. That ceiling is enforced against actual duplicate occurrences in every optimizer path, so omitting an unused profile filament cannot silently create another repeat. Infeasible candidate stacks use a sparse global matching check instead of performing an unnecessary cubic assignment, and staged Exact progress gives the primary no-repeat search half of the progress range instead of compressing it near zero. If the available filaments, Max Height, unique-match limit, and repeat allowance cannot produce enough acceptably close unique colors, the saved **Require a unique match for every color** preference either rejects the result with actionable guidance (the default) or keeps the result while explicitly assigning remaining colors to best-supported printable fallbacks. The result summary distinguishes unique in-limit assignments, colors that reuse a printable color, distinct printable-color capacity, final mappings above the limit, and worst mapped ΔE, so a capacity-only failure is no longer presented as a threshold failure and an over-limit fallback is explicit. Fallback results remain amber and label Quality Score as **Constraint unmet** rather than exposing the optimizer's large internal hard-constraint penalty. Rejected or pending Auto-paint output disables Build and model export, cannot fall through to manual color heights, and does not generate misleading print instructions; an existing preview can only remain when it belongs to a previous valid build. Preserve color separation remains mutually exclusive with Height dithering because both modes change the same printable height map.
- **Prediction uncertainty** - Every newly generated printable color now carries an evidence-aware confidence and provenance of exact, interpolated, fitted, or simulated. Confidence separately records distance to the nearest measured color and physical recipe, residual agreement among nearby measurements, deterministic leave-one-out Stack Matrix error, and K-fold held-out error for the jointly fitted optical model. Optimizer mapping and scoring apply a bounded ΔE-equivalent uncertainty cost, allowing a slightly less accurate but well-supported color to beat a speculative numerical match without weakening Preserve color separation's raw ΔE limit or overriding Dead-on anchors. Final layer, palette, and target snapshots retain the same diagnostics used during search, and Result Confidence reports average/lowest mapped confidence plus the provenance mix. Raw measurements, physical filament assignments, and export colors remain unchanged.
- **Auto-paint optimization progress** - Enhanced matching now reports approximate search progress while the background optimizer runs.
- **Auto-paint test and benchmark coverage** - Added deterministic stack goldens, layer-invariant regression coverage, realized CIEDE2000 quality-budget tests, and an on-demand benchmark for fixture profiles using the same printable-stack mapper as the optimizer.
- **Filament profile import fixture** - Added a schema-v2 frontlit-calibrated 8-color `.kfil` fixture with import coverage to guard against accidental hiding-distance rescaling.
- **Collapsible control groups** - Every settings card in 2D and 3D mode (Adjustments, Resize Image, Dedither, Quantization Settings, Image colors, 3D Print Settings, Auto-paint, Color Slice Heights, and Print Instructions) can now be collapsed from its header to save sidebar space. Collapsed groups are remembered across sessions, and important indicators stay visible while collapsed: color counts, busy spinners, modified-settings dots, unsaved-profile markers, and quick actions like reset and copy.
- **3D inspection view modes** - The 3D preview toolbar now offers Shaded, Transparent, and Wireframe modes for inspecting surfaces, layers, and mesh edges. Wireframe uses thin, layer-colored feature edges, and the selected view is remembered without changing print settings or STL/3MF export content.
- **Auto-paint preview color toggle** - The 3D preview toolbar now offers a Simulated/Physical color toggle for Auto-paint results, switching between the estimated blended appearance and the real physical filament colors stacked at each layer without a model rebuild. Only shown for Auto-paint models, the selection is remembered, and it never changes STL/3MF export content.
- **2D touch-up tools** - The 2D preview toolbar now includes five hard-edged pixel tools (Brush, Eraser, Fill, Text, and color picker) for direct image editing with palette-safe colors, an on-canvas text box you type into directly with live move, resize, and word wrap, one undo/redo step per edit, and live non-blocking drawing with adjustments staying non-destructive.
- **Calibration theory docs** - New in-app documentation page explaining the science behind filament calibration: the frontlit Beer-Lambert optical model and hiding distance, why the wedge's reference-rail comparison is reliable without a camera, how a single patch read becomes a hiding distance through a just-noticeable-difference solve, per-channel measurement with multiple bases, the session JND fit, and what the confidence score reflects — illustrated with three new diagrams. The Calibrate Filaments dialog links straight to it.
- **Reddit community links** - Added r/kromacut links to the app settings and README.
- **Experimental multi-plate preview** - Added an explicitly unfinished entry point for a future multi-plate workflow. The persisted toggle and coming-soon screen do not yet split an image or change generated prints.

- **Filament profile templates** - The Auto-paint profile dropdown has a new read-only "Templates" group with built-in supplier filament sets (starting with Bambu Lab PLA Basic), including per-filament names, brand, and color-estimated hiding distances. Loading a template fills the working filament list; tweak it and use "Save as new profile" — pre-filled with a "(copy)" name forked from the active profile — to keep a custom version. Templates cannot be overwritten, renamed, or deleted, imported profile files can never claim a template's id, and the wrapped supplier disclaimer keeps the menu aligned to the selector width.
- **Supplier palettes** - The palette dropdown has a new "Supplier Palettes" group with built-in color sets matching real filament lines, starting with Bambu Lab PLA Basic (30 colors, from Bambu Lab's official hex chart). Supplier palettes work like other built-ins: select one to quantize the image straight to those filament colors, or clone it into a custom palette to tweak it. The wrapped supplier disclaimer keeps the menu aligned to the selector width.
- **Clone palettes** - A clone button in the palette toolbar copies any palette — built-in, supplier, or custom — into a new editable custom palette named "Original (copy)". Cloning a custom palette preserves its disabled-color flags; cloning built-ins normalizes their colors to hex so the clone is fully editable.
- **Custom palette color names** - Every color row in the custom palette editor now has an optional name field (for example "Pumpkin Orange") so colors are easy to recognize at a glance. Names are stored in the palette and its `.kpal` export via an additive `colorNames` field, appear as tooltips on the color chips in the palette dropdown, and are carried over when cloning — cloning a supplier palette brings the real filament names with it. Older palette files load unchanged.
- **Per-color enable/disable in custom palettes** - The custom palette editor now has an eye toggle on every color row that excludes the color from quantization without deleting it (useful when a spool runs out). Disabled colors stay in the palette and its `.kpal` export via a new additive `disabledColors` field (palette format version 2); older palette files still load unchanged, and older Kromacut builds simply treat all colors in a v2 file as enabled. The palette dropdown shows partially disabled palettes as `Name (enabled/total)`.

### Changed

- **App and Auto-paint performance** - Printable-palette projection now uses indexed height lookup, Exact search traverses permutations in place and reuses a small bounded cache of exact evidence-aware stack-prefix predictions, preserve-separation candidates reuse their distance matrix and matching workspace, and no-evidence appearance confidence is resolved once per model. Calibrated local-evidence scoring prepares immutable Lab/chroma records once, uses numeric visit generations and shared recent-recipe sets instead of repeated string, WeakMap, and short-lived array work, safely rejects radius-excluded CIEDE2000 matches before hue math, pre-sorts and ID-indexes exact anchors, and skips fitted-color transforms when measured evidence already decides the result. Saved calibration profiles and completed-evidence fingerprints are reused and prepared while the 2D workspace is idle so opening the 3D tab does not synchronously reprocess multi-megabyte evidence, and worker requests carry cached serialized calibration evidence instead of recursively cloning its object graph on the UI thread. Large printable-detail pixel buffers also stay directly accessible while remaining hidden from generic prop enumeration, preventing React's development instrumentation from recursively inspecting millions of typed-array entries at the optimizer handoff. The first 3D control mount runs as a non-blocking transition and remains mounted across later tab switches instead of restarting Auto-paint; returning to 2D cancels a pending first mount and suspends in-flight printable-detail and optimizer workers without discarding same-input completed results. Cold WebGL scene creation yields until the first 3D frame, saved camera projection is applied once that scene is ready, build effects wait for scene readiness, confirmed builds paint a preparation indicator before applying their complete state snapshot, and rejected or duplicate build requests clear that indicator instead of leaving the workspace stuck. Transient printable-detail worker-start failures retry once, full-image swatch scans share center/edge distance calculations, and large palette-order reconciliation uses indexed color identities instead of quadratic searches. Focused and real calibrated benchmarks record timings and memory alongside checksums, optimizer score/order, layer count, separation results, and final-stack fingerprints so performance work remains gated by identical color and model output; a bounded calibrated CPU profiler emits DevTools-compatible samples, benchmark metadata, and readable caller summaries without depending on Chrome's trace buffer, while comparison and sequential unprofiled-series reports aggregate stable hotspots, median timing, and post-GC retained heap across enriched workloads.
- **Auto-paint optimizer memory** - Exact and Deep searches now retain a bounded cache of scalar sequence scores instead of keeping every candidate's full printable palette, and Stack Matrix recipe-neighbor memoization has a fixed ceiling. Candidate palettes and old empirical lookups can be garbage-collected during long searches without changing deterministic scores, selected recipes, preview colors, or exports.
- **Dependency security updates** - Updated the desktop runtime to Tauri 2.11.1, fixing an origin-confusion issue that could let a crafted remote page invoke local-only IPC commands on Windows, along with patched openssl, rustls-webpki, and rand crates. Development tooling also moved to newer Vite, Rollup, PostCSS, esbuild, Babel, and related releases. The production npm dependency audit is clear; remaining npm audit findings are confined to development tooling.
- **Hiding Distance replaces TD** - Filament opacity is now expressed as a frontlit **Hiding Distance (HD)** in millimetres: the depth at which a filament visually hides what's beneath it, matching how prints are actually viewed. Stored values become single-meaning (profile schema v2): uncalibrated values from older profiles, `.kfil`/`.kapp` files, and saved app state are converted automatically (×0.1, one time) on load or import, and the old internal frontlit scaling layer is removed — this also fixes calibrated filaments being double-scaled in the recommended-height estimate. A convert button on each filament row accepts conventional backlit/lithophane TD values (≈10× the HD) and converts them on entry, the wand estimate now produces HD directly, and per-channel values are visible in tooltips. Uncalibrated filaments now blend with per-channel hiding distances estimated from their color (previously channel-uniform), so uncalibrated previews and stacks are more color-faithful; the next-filament suggestion simulates blends in linear light with the same per-channel hiding distances auto-paint renders with (measured channels when calibrated, color-derived otherwise) and recommends HDs on the stored scale.
- **Auto-paint enhanced matching** - Optimizer scoring now follows the same layer-snapped, Max Height-compressed printable stack used by preview and export, scores realized print error in CIEDE2000 with a weighted p95 tail term, and uses complete target-color/cache inputs so repeated runs are deterministic.
- **Auto-paint optimizer controls** - Replaced the older optimizer choices with deterministic effort tiers (Fast, Balanced, Thorough, Deep, and Exact base order), selector-based repeated swaps, transition-detail endpoints, and explicit stable seed handling. Selecting Exact base order shows the estimated number of base orders it will score before running. Legacy saved values migrate to the nearest current tier.
- **Auto-paint optical model** - Beer-Lambert blending now runs in linear-light sRGB, and calibrated filaments use measured RGB-channel TDs for blend simulation and transition-zone thickness. Recalibrate profiles created with earlier releases before using them for new prints.
- **Height dithering kernel** - Height dithering now uses an error-conserving Stucki kernel instead of Floyd-Steinberg, spreading quantization error over a wider area while keeping the existing block-aware dot sizing and edge protection.

### Fixed

- Saved 3D Auto-paint settings are now applied before the initial persistence pass instead of being briefly replaced by defaults during startup or hot reload. Max Height and the calibration layer height are also remembered with the other Auto-paint options.
- The Palette Proof history selector now stays within a bounded viewport and scrolls internally when many saved target sets and continuation rounds are available.
- Crop mode no longer places its transparent interaction overlay above the preview toolbar or image-size HUD, so Save crop, Cancel crop, and the other visible actions remain clickable while the original and selected crop dimensions stay readable.
- Changing the first-layer or regular layer height while Auto-paint is active no longer crashes the 3D controls while the replacement worker result is pending; stale stack snapshots are ignored until their slice grid matches the current print settings.
- Stack Matrix photo alignment now preserves the image aspect ratio without a hidden letterboxed coordinate offset and makes the marker center unambiguous through draggable handles, an exact crosshair magnifier, a projected template, and a rectified preview.

- **HueForge spool CSV/TSV imports** - BOM-prefixed HueForge spool files now import correctly when a UTF-8 byte-order mark precedes the first header.
- **Settings documentation link** - Opening Docs from Settings now remains in the documentation when Docs is already active instead of unexpectedly returning to the app.
- **Auto-paint Max Height** - Auto-paint now plans, scores, previews, and exports the same layer-aligned stack. Height caps round down to a valid printable layer boundary, so a generated model no longer exceeds the requested maximum by adding a final whole layer.
- **Auto-paint region priority** - Center and Edge priority now use the actual locations of each image color. Center prioritizes colors near the image middle; Edge prioritizes colors near the outer border. The optimizer no longer allocates a full-image weight map or guesses location from color brightness.
- **Auto-paint calibration confidence** - Color edits that deactivate a calibration now re-anchor the filament's estimated hiding distance to the new color without deleting the stored calibration, and result confidence now scores the filament sequence actually printed after variable-length optimization omits unused filaments.
- **Auto-paint edge cases** - Blank seeds now resolve to stable cacheable values, optimizer cache keys include all target clusters, tuning inputs, preserve-separation mode, and active calibration state, beam-search ties use locale-independent ordering, exact base-order search discloses its estimated base-order count before running, zero-HD blend helpers agree on the opaque-filament limit, and exceptionally tall stacks stop at the intended 500-layer slice-data limit.
- **Filament profile validation** - Imported `.kfil`/`.kapp` profile filaments now reject zero or negative hiding distances instead of letting invalid raw HD values reach the UI.
- **Filament profile evidence safety** - Same-ID legacy imports without appearance data can no longer overwrite newer Palette Proof or Stack Matrix evidence, failed imports no longer report success or replace in-memory profiles, filament identity participates in dirty-state checks, and dirty exports use a separate profile without stale calibration evidence.
- **Desktop 3MF export reliability** - 3MF model XML now streams into the archive in bounded chunks, avoiding desktop WebView `FileReader` `NotReadableError` failures and `RangeError: Invalid string length` on large exports.
- **Smooth meshing 3MF integrity** - Smoothed cap faces are now validated in the 3MF exporter's exact integer coordinate units instead of epsilon-compared floats, so faces that would collapse at serialized precision get re-triangulated during meshing rather than silently dropped at export. This removes the pinhole open/non-manifold edges slicers flagged on large smooth-meshed 3MF exports (STL exports were never affected).

## v3.1.0 - 2026-06-18

### Added

- **Orthographic camera toggle** - Added a camera toggle button to the 3D preview toolbar that switches between perspective and orthographic projection. The button shows the current mode and preserves the camera position and depth range when toggling. The selected mode persists across page refreshes.
- **Flat Paint mode (experimental)** - Added a Flat Paint option to Auto-paint that builds a uniform, face-down slab: each pixel column's layer order is reversed so the artwork sits flat against the build plate (pre-mirrored for face-down printing) under a transparent carrier layer, the back is filled with the foundation filament so every layer has the full footprint, and 3MF export merges the parts into one object per physical filament for AMS/toolchanger printers. Includes flat-mode print instructions, a performance warning for tall stacks, mutual exclusion with Smooth Meshing, and regression tests covering the layout, meshing, STL compaction, and 3MF grouping.
- **Desktop update settings** - Added desktop-only settings to manually check for updates and control whether update notices run on startup.
- **HueForge spool CSV/TSV import** - Auto-paint filament profiles can now be imported from a HueForge spool library CSV or TSV export. Each spool is imported as a filament entry with its HueForge UUID preserved as the filament ID, named `<Brand>-<Color Name>-<Hex>` (e.g. `Inland Basic-Light Brown-#bf9c81`). Column order is flexible and quoted fields with embedded commas or newlines are handled per RFC 4180.
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
- **Smooth meshing performance** - Smooth mesh generation now uses one fast welded-grid algorithm with deterministic boundary-chain smoothing in a bounded sub-pixel envelope and boundary-preserving caps validated at slicer precision, avoiding inverted preview faces, open exports, hangs, and browser memory blowups on complex image layers

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
