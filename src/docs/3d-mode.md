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

Auto-paint uses real filament colors and **Hiding Distance (HD)** values — the depth of material, in millimetres, at which a filament visually hides what's beneath it. Add each filament you plan to use, then set:

- Filament name.
- Filament color.
- HD value.

Use the wand button to auto-estimate the hiding distance from color, calibrate to measure it from a printed wedge, or use the convert button to enter a conventional Transmission Distance (the lithophane/backlit TD from a spool sheet or TD test print) — a conventional TD is roughly 10× the hiding distance, and Kromacut converts it for you.

## Calibrating Filament Hiding Distance

Calibration is camera-free: you print a small wedge and read back one or more opacity numbers. Click **Calibrate Filaments** below the filament list to open the dialog. It has four steps:

1. **Select** the filaments you want to calibrate.
2. **Base layers** - choose **Quick** for one base read, or **Accurate** for two or three base reads per filament. Kromacut auto-picks useful bases from your real profile filaments, and you can override them with the base swatches.
3. **Print** the calibration wedge. Set your layer height and the wedge length (max layers), then download an **STL** (any printer) or a multi-material **3MF** (colors and bases baked in, for AMS/multi-material). For STL, use the shown layer height and first-layer height, print one copy for each filament/base read, load the listed base filament, then swap after the shown layer/Z height to the filament being calibrated. Each print has patches from 1 layer up, with an opaque reference rail running along the edge beside the patches. A foot marks the 1-layer end.
4. **Enter Results** by reporting, for each filament/base row, the **first patch that looks identical to the reference rail** beside it. Kromacut uses one read for quick scalar calibration, or combines multi-base reads to measure per-channel hiding distances and, when the session has enough data, fit the shared JND. The optional merge field records where adjacent steps stop looking different; it is stored as model-checking evidence and does not block saving.

You do not have to finish every filament in one sitting. Saving calibrates the filaments you completed and leaves the rest exactly as they were, so you can print a wedge for eight filaments, read three of them today, and save. Filaments you have not read are marked **Not entered** and are discarded on save; a filament in **Accurate** mode still needs all of its base reads before it can be saved, and one with only some of them filled in is marked **Won't save** so it is not dropped silently. The Save button shows how many filaments will be written when any are being skipped.

Because the reference rail is the filament's own fully-opaque color, you are only judging whether a patch matches the rail right next to it — a comparison that stays reliable across lighting and screens. The measured hiding distance is a material property, so it transfers to your real prints regardless of which base you calibrated against.

Each filament stores a single calibration. Calibrating a filament again **replaces** its previous value rather than averaging into it, and only the reads you enter in the current run are saved — so to combine several bases into one measurement, select them together in a single **Accurate** run instead of calibrating the same filament twice. Calibrating a different filament only updates that filament and leaves your other calibrations untouched.

For the optics behind the wedge — why one read is enough and what the math does with it — see [Calibration theory](calibration-theory).

## Filament Profiles

Auto-paint profiles store reusable filament sets.

- **Save changes to current profile** updates the selected profile.
- **Save as new profile** creates a new profile name.
- **Rename selected profile** changes the selected profile name without changing its filaments.
- **Import profile from file** loads a `.kfil`, legacy `.kapp`, or `.json` profile.
- **Export current filaments as .kfil file** shares the current filament setup. If the loaded profile has unsaved filament edits, Kromacut exports those edits as a clearly named new profile without the old profile's incompatible appearance evidence.
- **Delete selected profile** removes the selected profile.

### Templates

The profile dropdown also lists built-in **Templates** — filament sets matching real supplier lines, such as Bambu Lab PLA Basic, with colors, names, brands, and color-estimated hiding distances pre-filled. Loading a template copies its filaments into the working set. Templates are read-only: adjust the filaments (remove colors you do not own, calibrate their hiding distances), then use **Save as new profile** to keep your version.

Templates are unofficial reference filament sets: colors come from [Bambu Lab's official filament hex chart](https://store.bblcdn.com/s7/default/1084369ef84345bbaa5d704a492954e0/Bambu_PLA_Basic_Hex_Code.pdf) and are the manufacturer's advertised values — actual color varies with batch, layer height, and lighting. Hiding distances in templates are estimated from color, not measured; calibrate any filament you care about before printing. Kromacut is not affiliated with, endorsed by, or sponsored by Bambu Lab or any other filament manufacturer — supplier and product names are used only to identify the referenced products.

## Max Height

**Max Height** limits the total printed model height in Auto-paint. Leave it on **Auto** for the physics-derived, layer-aligned height. If a value falls between valid first-layer and layer-height steps, Kromacut uses the next lower printable height so the generated model never exceeds your cap. Set a smaller value when the model is too tall, but watch for compressed transition zones.

## Printable Detail

Set **Effective line width** to the extrusion width you expect to use in the slicer. Before Auto-paint maps image colors, Kromacut finds color regions that cannot contain a path that wide and predicts which printable neighboring color would claim each vulnerable location. When omission is enabled, the same resolved pixels are used for optimizer scoring and for the built height map, so the diagnostic and model describe the same geometry.

Use **Open preview** to inspect the affected locations at a useful size. **At risk** marks pixels expected to be claimed by a neighboring color in amber and isolated pixels with no printable neighbor in pink. **Printable** shows the image that Auto-paint actually receives. The compact sidebar summary reports the affected fraction without occupying space with a small embedded image.

Enable **Omit at-risk colors from matching** to replace vulnerable source pixels with their predicted printable neighboring colors before swatch extraction and color prediction. Colors that exist only in unprintable details therefore do not consume optimizer work, while the generated model remains fully filled instead of developing holes. If an isolated region has no defensible printable neighbor, Kromacut keeps its original color. This is a conservative feature-size estimate rather than a replacement for checking the generated model in your slicer, because unusual path-generation settings can still produce a different result.

## Enhanced Color Matching

Enable **Enhanced color matching** when filament order matters and you want Kromacut to optimize the stack.

Optional controls appear with enhanced matching:

- **Total repeat limit** sets one shared ceiling across the whole stack: Off, or up to 2, 4, 6, 8, or 12 extra filament appearances. Two repeats can mean two filaments appearing once more each, or one filament appearing twice more. Repeats can create useful blend paths but expand the search space.
- **Preserve color separation** tries to give every distinct 2D image color its own printable surface color within the selected **Maximum color error**. The numeric field accepts ΔE00 1 to 100 and defaults to 6; raising it makes preserving every color more feasible, but permits less accurate matches. Kromacut solves these assignments globally so one dominant region cannot take the only good match from another color. It first searches at the selected optimizer effort without repeating a filament, then permits one additional filament occurrence at a time and stops at the first successful complexity level. **Fail build if any color is missed** is enabled by default and rejects a result that cannot satisfy every color. Turn it off to keep the result: colors that meet the threshold remain separately assigned, while only missed colors fall back to their nearest printable match and may merge.
- **Transition detail** chooses the opacity endpoint for each physical color transition: Compact stops at 80% opacity, Detailed at 90%, and Maximum at 95%. Higher settings create taller stacks with more printable intermediate colors.
- **Height dithering** uses printable height dots to smooth tonal transitions. Its dot blocks use the same Effective line width as the printable-detail simulation.
- **Optimizer Settings** let you choose **Algorithm**, **Region priority**, and an optional **Seed**.

Preserve color separation and **Height dithering** are mutually exclusive. Turning one on turns the other off because both modes change how source colors map onto printable layer heights.

Enhanced matching scores the palette that is already visible in 2D mode; it does not reduce that palette again. For detailed work, prepare the image in 2D first (for example, K-means with a weight of 128 and an Auto palette of 64 or 128 colors), then switch to Auto-paint. This keeps the 2D palette decision explicit, but more source colors make every optimizer tier slower.

While Kromacut is optimizing a filament order, the panel shows an approximate completion percentage. Starting a new calculation cancels the older one, so the percentage always belongs to the current settings.

The total repeat limit is a ceiling, not a target. With Preserve color separation enabled, the completed result reports whether any repeated appearances were actually needed and how many colors met the threshold. To resolve a strict separation failure, raise Maximum color error if less accurate matches are acceptable, increase Max Height or the repeat limit, add a suitable filament, reduce the processed 2D palette, or turn off **Fail build if any color is missed** to permit explicit nearest-color fallbacks. A rejected Auto-paint calculation cannot be built or exported and never falls back to the unrelated manual color-height stack; the preview may continue showing the previous valid build.

When a filament has been calibrated, Auto-paint uses its measured red, green, and blue hiding distances for both transition colors and transition thickness. Uncalibrated filaments use per-channel values estimated from their color around the scalar HD. Calibration can therefore change the generated stack height and swap plan as well as the preview color, making the print model more faithful to the measured filament.

## Flat Paint

**Flat Paint** builds a uniform-thickness slab instead of a stepped relief. Every printed layer has the full model footprint. Its default layout is face-down:

- The artwork is placed face down against the build plate, under a **transparent carrier layer** that prints first and becomes the smooth viewing face. Use clear filament for the carrier object.
- Each pixel column's layer order is reversed so the print looks identical to the normal model when viewed from the face side, and the space behind the image is filled with the foundation filament.
- The model is already mirrored for face-down printing — do not mirror it again in the slicer. After printing, flip the piece over to view the image.

Because a single printed layer contains several filaments side by side, Flat Paint requires a multi-material printer (AMS or toolchanger). Export as **3MF**: the model contains one object per filament, plus the carrier object, ready for per-object filament assignment in the slicer.

Enable **Face-up, no clear layer** under Flat Paint when you do not want a transparent carrier. This layout keeps each pixel's normal bottom-to-top color order, fills beneath shorter stacks with the foundation filament, and aligns their visible colors at the flat top surface. Print it face-up as shown and do not mirror it. The image surface is exposed, and the 3MF contains only the physical filament objects—there is no clear-carrier object to assign.

Flat Paint works in both standard and enhanced color matching modes. Expect heavier geometry and slower slicing than a normal build — flat models are best for bookmarks, coasters, and other pieces that benefit from a smooth, glass-flat face.

Flat Paint and **Smooth Meshing** are mutually exclusive. Turning one on turns the other off because Flat Paint already uses a full-footprint slab layout instead of smoothed boundary contours.

## Optimizer Settings

| Setting         | Meaning                                                            |
| --------------- | ------------------------------------------------------------------ |
| Algorithm       | Fast, Balanced, Thorough, Deep, or Exact base order.               |
| Region priority | Uniform, Center-weighted, or Edge-weighted matching.               |
| Seed (optional) | Overrides the automatic stable seed for an intentional comparison. |

Start with **Balanced**. It uses a full deterministic beam search and is the best
general-purpose choice. **Fast** uses a narrower beam for a quicker preview.
**Thorough** adds deeper multi-start refinement, while **Deep** widens the beam and
spends substantially more time exploring alternatives. Each higher tier keeps the
best result from the tier below for the same seed.

**Exact base order** checks every possible no-repeat filament order. It checks 109,600
orders at eight filaments and 986,409 at nine, so larger profiles can take a long time.
The search stays in the background worker and you can start another search to cancel it.
When **Total repeat limit** is above Off, Exact still proves the base order but treats
repeated occurrences as a separate refined search. Enhanced matching can omit filaments that do
not improve the printable stack and add the selected number of non-adjacent repeated occurrences
when they improve the blend path.

**Region priority** changes which source colors the optimizer values most: **Center-weighted** gives more importance to colors that occur near the middle of the image, while **Edge-weighted** favors colors nearer its outer edges. It does not crop or change the image itself.

## Transition Zones And Confidence

After Auto-paint computes a result, Kromacut can show:

- **Transition Zones**, with height ranges and compressed-zone badges.
- **Result Confidence**, including Calibration, Coverage, and Compression scores. The appearance row separately reports whether simulated colors are still estimated or use a proof-fitted correction, how many physical stacks were compared, why a tentative fit was rejected, and the average and lowest confidence of the colors actually mapped into the image. It also counts whether those predictions are exact measurements, interpolations, fitted estimates, or pure simulation.
- **Optimizer Performance**, including Algorithm, Quality Score, Iterations, Cache hit, and Converged. Quality Score is shown only for a valid objective; when Preserve color separation keeps a fallback result that misses its threshold, this field reports **Constraint unmet** instead of displaying the optimizer's large internal hard-constraint penalty as a meaningful quality value.

Prediction confidence is distinct from raw color error. Kromacut lowers it as a recipe moves away from physical measurements, nearby measured corrections disagree, or held-out predictions miss their photographed colors. Exact measurements start strongest, followed by local interpolation, fitted models, and unsupported simulation. Enhanced matching adds a bounded uncertainty cost, so a slightly less accurate but well-supported printable color can beat a speculative match. Preserve color separation still enforces its selected Maximum color error using raw ΔE00; uncertainty cannot make an out-of-limit color valid.

Low confidence usually means you should calibrate filaments, add a missing filament color, or loosen a restrictive max height.

## Palette Proof

After Auto-paint produces at least two printable stack prefixes, open **Calibrate Filaments** and select the **Palette Proof** tab. Choose how many image **Targets** and physical stack **Candidates** to compare. Select **Choose from image** to open a separate target-selection step, then choose **Original image** to target processed image colors or **Fitted / achievable** to target the exact fitted colors already used by the current Auto-paint preview and scoring. Fitted mode reuses the active appearance model and printable-stack mapping; it does not run another fitting algorithm. Click regions that matter most for the current artwork, such as skin tones, or use the keyboard-accessible color toggles below the image to choose the same targets without a pointer. A selected color stays bright everywhere it appears while other colors are dimmed, making its affected regions easy to verify. Kromacut keeps selected colors in the proof and automatically fills the remaining target slots with useful high-coverage and color-diverse choices. Leave every color unselected for fully automatic selection. Each target row shows the selected original or fitted target color followed by candidates `A` through `E`. A dashed `F` cell points to the shared foundation margin instead of creating a duplicate first-layer patch.

![The Palette Proof target row and candidate matrix, plus a cross-section of candidates stopping at different reachable stack prefixes over one continuous foundation.](09_palette_proof.svg)

Choose **Download 3MF** to generate the coupon. The default 8-target, 5-candidate layout is 44 x 68 mm; reducing either count makes a smaller proof. Each target occupies one row and its A-E candidates run left to right, matching the Proof map and Results views. It uses touching 8 mm patches, 2 mm margins, 1.2 mm rounded outer corners, and a 2 mm missing top-left corner for orientation. The first physical layer is one continuous foundation. Kromacut orders each row from the lowest to highest candidate prefix and unions adjacent cells on every physical layer, reducing separate slicer regions and travel moves. Candidate regions continue only to their selected prefixes. The connected layers strengthen the coupon without adding backing layers that would change the colors being judged, although boundaries between adjacent patches may be less distinct.

The 3MF contains one part per physical layer with the final Auto-paint filament assignments. It also embeds `palette-proof.json` and `palette-proof-instructions.txt` under its `Metadata` folder so the printed coupon stays tied to the exact stack snapshot and patch IDs that generated it. Once the 3MF is saved and the proof is recorded, its target count, candidate count, and selected image colors are locked to keep the printed file and recorded results in sync. A saved proof can be downloaded again while its exact source Auto-paint result is active. Keep the model face-up at 100% scale, use the layer heights shown in the instructions, confirm filament assignments in the slicer, and compare the printed candidates under your normal viewing light.

Saving the 3MF also records the proof in the active named filament profile. Open the **Results** view after printing and, for each target row, select the visibly closest patch, select multiple patches when they are tied, or choose **None** only when every candidate is clearly a poor match. For a selected patch, classify the result as **Best available** when it is only the least-wrong option, **Close** when the color is nearly right, or **Dead on** when it accurately matches the target. Best available supports the winner and rejects its alternatives near that recipe and target without claiming an absolute color; Close and Dead on additionally apply progressively stronger local color corrections. Every selected patch in a tie receives support. None locally rejects plausible candidates without inventing a correction. A Dead-on result also preserves the selected physical recipe as an exact local anchor: Kromacut keeps its complete visible filament run and extends downward only until the existing hiding-distance model says the omitted substrate is sufficiently hidden. This lets, for example, a measured three-purple-layer result transfer over a different foundation when those purple layers make the deeper stack optically irrelevant; if they remain translucent, the necessary lower context stays part of the anchor. Progress is saved immediately, survives app restarts, and can be completed and reopened for correction. The proof selector groups records that contain the same target colors into numbered target sets and labels later rounds as continuations, including existing records created before grouping was added. When the same image and compatible print settings are active, the automatic **Next proof** uses all completed history to prioritize untested and least-tested targets instead of returning to the first target set. After completion, choose **Continue targets** to refine around the prior physical winners. A continuation retains a human-selected previous best, tests perceptually nearby untried challengers within ΔE00 18, and keeps one unseen exploratory stack whenever candidates remain. Tied winners share the neighborhood. A **None** result deliberately creates no previous-best anchor, so its next round explores unseen candidates instead of treating the rejected simulator choice as accepted. Targets are listed as exhausted only after every compatible prefix has been tested. If fewer useful candidates remain than requested, the app reduces the candidate matrix and explains why. **New targets** opens the image target-selection step for a new set; selected colors are prioritized, while open slots prefer colors outside the completed proof and otherwise use the least-tested prior targets. The trash button deletes either an incomplete or completed proof together with all of its results, removing that evidence from appearance calibration. Saved proofs remain available from the profile even when the original image is no longer loaded.

These judgments are stored as camera-free appearance evidence with the exact proof, physical prefixes, original simulated colors, process settings, and display-color contract that produced them. Compare every proof used by one profile under the same frontlit viewing and display conditions.

Auto-paint derives a small global lightness/chroma ranking correction from completed proofs in its worker, while also rebuilding local recipe-and-color neighborhoods from every response. Local effects decay when the recent physical layers, simulated color, or reviewed target differ, so repeated losses by related green recipes can warn the optimizer about nearby green stacks without changing unrelated recipes. Prioritizing a color focuses which evidence the proof gathers; it does not create an independent global correction for only that color. The fitter keeps whole proof artifacts separate for training and validation and only applies the global correction after the training partition contains at least eight closest-choice observations spanning eight distinct stacks, the held-out partition contains at least two observations, held-out agreement reaches 70%, and the correction improves that held-out proof by at least 10 percentage points. Local evidence and Dead-on suffix anchors can remain active even when the broader global fit is gated; **Result Confidence** reports local neighborhoods, exact anchors, and training and held-out evidence separately. A **None** answer contributes local rejection, physical coverage, and follow-up priority but never satisfies a global training gate or invents a correction direction; use **Continue targets** when you want another candidate round for that unresolved color.

When appearance evidence changes, Auto-paint reruns filament-order optimization and simulated preview mapping. Close and Dead-on evidence correct nearby predicted colors in both paths; Best-available winners, losers, ties, and None answers supply bounded target-aware preferences. A Dead-on anchor gives realizable matching suffixes a strong optimizer preference and maps its target to the first calibrated prefix rather than an earlier uncalibrated color tie, so evidence can intentionally change the chosen height, swap plan, and exported geometry. It never changes hiding-distance calibration or physical filament colors. Raw judgments remain the persisted source of truth; global parameters, local neighborhoods, and transferable suffixes are regenerated deterministically so a future model can reuse the same physical evidence.

## Stack Matrix

Open **Calibrate Filaments** and select **Stack Matrix** to measure many fixed-depth recipes at once. You need a saved, unchanged filament profile because the printed cells and photographed results belong to those exact filament IDs, colors, and HD values.

1. Choose 2–8 filaments in profile order, the number of recipe layers, a square capacity from 64 (8 × 8) through 2,025 (45 × 45) cells, and the filament used for the opaque backing. The backing defaults to the lightest selected filament and automatically moves to another selected filament if it is deselected. Every matrix uses gapless 5 mm cells for a consistent, compact layout.
2. Select **Create and download 3MF**. If every recipe fits, the board contains all `filaments^layers` combinations. Otherwise Kromacut uses the existing per-channel HD model on a deterministic, bounded pool spanning the recipe space, always keeps the pure-filament recipes, and selects the remaining cells to cover the predicted Lab gamut. This keeps even the 8-filament, 6-layer maximum practical without changing the HD simulation used for each evaluated recipe. The summary shows the cell count, physical size, layer heights, and a conservative minimum filament-swap count. Gamut coverage is prioritized over swap reduction, and the slicer's material ordering may add changes at layer boundaries.
3. Keep the board face-up and at 100% scale. Confirm the embedded filament assignments, regular layer height, and first-layer height in the slicer. A first-layer value below the regular layer height is normalized to the regular height everywhere in the board geometry, metadata, and slicer settings. The 3MF uses closed grouped objects assigned to the selected real filament materials, a foundation thick enough for the backing filament's HD, and four corner marker recipes. Its `Metadata/kromacut-stack-matrix.json` file freezes the cell-to-recipe map.
4. After printing, reopen the saved matrix and upload a frontlit photo. Use the spatial **Printed corner key** to rotate the print until its four marker colors match the top-left, top-right, bottom-left, and bottom-right swatches shown in the app. If the uploaded photo is sideways or upside down, use the left/right rotation controls; each 90° turn reruns marker detection on the rotated image. Kromacut estimates the board automatically and places numbered handles at the centers of the four colored marker cells. Each marker sits diagonally outside the dense recipe grid in the added one-cell border; do not select the last recipe cell or the physical outside corner of the board. The projected blue outline should extend half a cell beyond every handle. Drag any handle that needs correction; use the 100–400% zoom controls and scrollable photo viewport for precise placement while the magnified crosshair shows the exact sampled point. Use the projected template grid to match the printed cell boundaries and check the perspective-corrected preview before saving. **Detect again** reruns the estimate, while **Reset** restores the estimate from the current photo. If detection confidence is low or you adjust a handle, explicitly confirm that you verified every marker center and grid line before Save becomes available. Leave **Reference marker correction** off to retain raw camera color, or enable it to reduce a lighting cast from the four known marker recipes.

The planned record is saved when the 3MF is generated, so you can close Kromacut while the print runs and resume later. Kromacut retains planned and completed records in separate bounded groups, so creating a new plan does not evict completed calibration. A completed record can be photographed again to replace its measurements, downloaded again, or deleted. Every stored completed matrix compatible with the current profile and layer height supplies empirical LUT evidence and exact matrix anchors. A matrix made from a selected subset of the profile remains compatible with its unchanged full owner profile. Compatible samples also jointly refine effective RGB-channel HD, opaque filament appearance, nonlinear transmission through repeated layers, and ordered filament-over-substrate behavior. The existing filament colors and HD measurements are conservative priors and are never overwritten; Kromacut applies the derived physical fit only when there is enough evidence and it improves the matrix prediction.

Compatible Stack Matrices form a combined empirical color LUT shared by Auto-paint optimization and the final preview. Earlier boards keep contributing recipes that a newer board did not print. Overlapping measurements are blended using each board's alignment confidence, recipe coverage, recency, and agreement with recipes measured by other boards. When a generated prefix ends in a fixed-depth recipe that was photographed, the combined measured Lab color replaces the simulated result exactly. For an unprinted recipe, Kromacut combines nearby measured recipes with similar physical layer order while the simulated color remains inside each contributing matrix's local measured coverage. Prefixes outside measured LUT territory use the jointly fitted physical model; unsupported filaments, incompatible layer heights, sparse evidence, or a fit that does not improve accuracy retain the original Beer-Lambert/HD behavior instead of extrapolating photo data. Auto-paint search and final preview use the same resolver, while model layers and exported materials retain the real filament colors. A Dead-on Palette Proof anchor remains higher-priority human evidence. Matrix cells are physical observations rather than requested artwork colors, so the optimizer uses their empirical predictions without preferring a cell merely because it was printed.

For best results, use diffuse front lighting, avoid specular glare, fill most of the photo with the board, keep automatic camera filters consistent, and do not mix matrices photographed under very different light. See [Calibration theory](calibration-theory#stack-matrix-calibration) for the optical limitations.

## Preview Controls

The toolbar in the top-right corner of the 3D preview contains controls for the active view:

- **Preview view** — choose **Shaded**, **Transparent**, or **Wireframe** to inspect the generated model's surfaces, layers, and edges. Wireframe uses thin, layer-colored feature edges. The selection is remembered and changes only the on-screen preview; it never changes print settings or STL/3MF exports.
- **Preview colors** (Auto-paint only) — toggle between the estimated blended appearance (what the print should look like after color transmission) and the real physical filament color stacked at each layer. Useful for checking which filament goes where before printing. Only shown when the built model is an Auto-paint result; the selection is remembered and never changes STL/3MF exports.
- **Camera toggle** — switches between perspective and orthographic projection. Perspective gives a natural depth effect; orthographic removes foreshortening and is useful for checking layer alignment. The button icon reflects the current mode, and the camera position is preserved when toggling.
- **Undo / Redo** — steps through changes to the 3D settings.
- **Download** — exports the current model as a .stl or a .3mf.

## Layer Preview

After building, the bottom **Layer Preview** bar lets you show only a height range of the model. Drag the lower and upper handles to inspect how the print builds.

Hover over color segments to see the start layer or swap layer. The preview range is only for inspection; exports still include the complete model.

In Flat Paint mode the bar shows a plain track because printed layers contain several filaments at once — there is no single swap sequence. Orbit underneath the model to inspect the artwork face.

Next: [Calibration theory](calibration-theory).
