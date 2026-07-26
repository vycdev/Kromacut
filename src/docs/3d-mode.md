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
- **Export current filaments as .kfil file** shares the current filament setup.
- **Delete selected profile** removes the selected profile.

## Max Height

**Max Height** limits the total printed model height in Auto-paint. Leave it on **Auto** for the physics-derived, layer-aligned height. If a value falls between valid first-layer and layer-height steps, Kromacut uses the next lower printable height so the generated model never exceeds your cap. Set a smaller value when the model is too tall, but watch for compressed transition zones.

## Enhanced Color Matching

Enable **Enhanced color matching** when filament order matters and you want Kromacut to optimize the stack.

Optional controls appear with enhanced matching:

- **Extra repeated swaps** chooses whether a filament may reappear, and lets you allow 2, 4, 6, 8, or 12 extra occurrences. More repeats can create useful blend paths but expand the search space.
- **Preserve color separation** keeps distinct 2D image colors assigned to distinct printable colors when the stack has enough printable colors.
- **Transition detail** chooses the opacity endpoint for each physical color transition: Compact stops at 80% opacity, Detailed at 90%, and Maximum at 95%. Higher settings create taller stacks with more printable intermediate colors.
- **Height dithering** uses printable height dots to smooth tonal transitions.
- **Line width** should roughly match the printer line or nozzle width used for dither dots.
- **Optimizer Settings** let you choose **Algorithm**, **Region priority**, and an optional **Seed**.

Preserve color separation and **Height dithering** are mutually exclusive. Turning one on turns the other off because both modes change how source colors map onto printable layer heights.

Enhanced matching scores the palette that is already visible in 2D mode; it does not reduce that palette again. For detailed work, prepare the image in 2D first (for example, K-means with a weight of 128 and an Auto palette of 64 or 128 colors), then switch to Auto-paint. This keeps the 2D palette decision explicit, but more source colors make every optimizer tier slower.

While Kromacut is optimizing a filament order, the panel shows an approximate completion percentage. Starting a new calculation cancels the older one, so the percentage always belongs to the current settings.

When a filament has been calibrated, Auto-paint uses its measured red, green, and blue hiding distances for both transition colors and transition thickness. Uncalibrated filaments use per-channel values estimated from their color around the scalar HD. Calibration can therefore change the generated stack height and swap plan as well as the preview color, making the print model more faithful to the measured filament.

## Flat Paint

**Flat Paint (flat face-down print)** builds a uniform-thickness slab instead of a stepped relief. Every printed layer has the full model footprint:

- The artwork is placed face down against the build plate, under a **transparent carrier layer** that prints first and becomes the smooth viewing face. Use clear filament for the carrier object.
- Each pixel column's layer order is reversed so the print looks identical to the normal model when viewed from the face side, and the space behind the image is filled with the foundation filament.
- The model is already mirrored for face-down printing — do not mirror it again in the slicer. After printing, flip the piece over to view the image.

Because a single printed layer contains several filaments side by side, Flat Paint requires a multi-material printer (AMS or toolchanger). Export as **3MF**: the model contains one object per filament, plus the carrier object, ready for per-object filament assignment in the slicer.

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
When **Extra repeated swaps** is above Off, Exact still proves the base order but treats
repeated occurrences as a separate refined search. Enhanced matching can omit filaments that do
not improve the printable stack and add the selected number of non-adjacent repeated occurrences
when they improve the blend path.

**Region priority** changes which source colors the optimizer values most: **Center-weighted** gives more importance to colors that occur near the middle of the image, while **Edge-weighted** favors colors nearer its outer edges. It does not crop or change the image itself.

## Transition Zones And Confidence

After Auto-paint computes a result, Kromacut can show:

- **Transition Zones**, with height ranges and compressed-zone badges.
- **Result Confidence**, including Calibration, Coverage, and Compression scores. The appearance row separately reports whether simulated colors are still estimated or use a proof-fitted correction, how many physical stacks were compared, and why a tentative fit was rejected.
- **Optimizer Performance**, including Algorithm, Quality Score, Iterations, Cache hit, and Converged.

Low confidence usually means you should calibrate filaments, add a missing filament color, or loosen a restrictive max height.

## Palette Proof

After Auto-paint produces at least two printable stack prefixes, open **Calibrate Filaments** and select the **Palette Proof** tab. Choose how many image **Targets** and physical stack **Candidates** to compare. Select **Choose from image** to open a separate target-selection step, then choose **Original image** to target processed image colors or **Fitted / achievable** to target the exact fitted colors already used by the current Auto-paint preview and scoring. Fitted mode reuses the active appearance model and printable-stack mapping; it does not run another fitting algorithm. Click regions that matter most for the current artwork, such as skin tones. A selected color stays bright everywhere it appears while other colors are dimmed, making its affected regions easy to verify. Kromacut keeps selected colors in the proof and automatically fills the remaining target slots with useful high-coverage and color-diverse choices. Leave every color unselected for fully automatic selection. Each target row shows the selected original or fitted target color followed by candidates `A` through `E`. A dashed `F` cell points to the shared foundation margin instead of creating a duplicate first-layer patch.

![The Palette Proof target row and candidate matrix, plus a cross-section of candidates stopping at different reachable stack prefixes over one continuous foundation.](09_palette_proof.svg)

Choose **Download 3MF** to generate the coupon. The default 8-target, 5-candidate layout is 44 x 68 mm; reducing either count makes a smaller proof. Each target occupies one row and its A-E candidates run left to right, matching the Proof map and Results views. It uses touching 8 mm patches, 2 mm margins, 1.2 mm rounded outer corners, and a 2 mm missing top-left corner for orientation. The first physical layer is one continuous foundation. Kromacut orders each row from the lowest to highest candidate prefix and unions adjacent cells on every physical layer, reducing separate slicer regions and travel moves. Candidate regions continue only to their selected prefixes. The connected layers strengthen the coupon without adding backing layers that would change the colors being judged, although boundaries between adjacent patches may be less distinct.

The 3MF contains one part per physical layer with the final Auto-paint filament assignments. It also embeds `palette-proof.json` and `palette-proof-instructions.txt` under its `Metadata` folder so the printed coupon stays tied to the exact stack snapshot and patch IDs that generated it. Once the 3MF is saved and the proof is recorded, its target count, candidate count, and selected image colors are locked to keep the printed file and recorded results in sync. A saved proof can be downloaded again while its exact source Auto-paint result is active. Keep the model face-up at 100% scale, use the layer heights shown in the instructions, confirm filament assignments in the slicer, and compare the printed candidates under your normal viewing light.

Saving the 3MF also records the proof in the active named filament profile. Open the **Results** view after printing and, for each target row, select the visibly closest patch even when it is imperfect, select multiple patches when they are tied, or choose **None** only when every candidate is clearly a poor match. Progress is saved immediately, survives app restarts, and can be completed and reopened for correction. The proof selector groups records that contain the same target colors into numbered target sets and labels later rounds as continuations, including existing records created before grouping was added. When the same image and compatible print settings are active, the automatic **Next proof** uses all completed history to prioritize untested and least-tested targets instead of returning to the first target set. After completion, choose **Continue targets** to refine around the prior physical winners. A continuation retains the previous best, tests perceptually nearby untried challengers, and uses at most one exploratory stack per target. Tied winners share the neighborhood. Targets with no nearby challenger left are listed and skipped while the remaining targets continue under the original numbered set; continuation stops only after every target is exhausted. If fewer useful candidates remain than requested, the app also reduces the candidate matrix and explains why instead of filling it with unrelated colors. **New targets** opens the image target-selection step for a new set; selected colors are prioritized, while open slots prefer colors outside the completed proof and otherwise use the least-tested prior targets. The trash button deletes either an incomplete or completed proof together with all of its results, removing that evidence from appearance calibration. Saved proofs remain available from the profile even when the original image is no longer loaded.

These judgments are stored as camera-free appearance evidence with the exact proof, physical prefixes, original simulated colors, process settings, and display-color contract that produced them. Compare every proof used by one profile under the same frontlit viewing and display conditions.

Auto-paint derives a small global lightness/chroma ranking correction from completed proofs in its worker. Prioritizing a color focuses which evidence the proof gathers; it does not create an independent correction for only that color. The fitter keeps whole proof artifacts separate for training and validation and only applies the correction after the training partition contains at least eight closest-choice observations spanning eight distinct stacks, the held-out partition contains at least two observations, held-out agreement reaches 70%, and the correction improves that held-out proof by at least 10 percentage points. **Result Confidence** reports the training and held-out counts separately. If those gates fail, the preview keeps using the original optical estimate and explains why. A **None** answer contributes physical coverage and follow-up priority but never satisfies a training gate or invents a correction direction; use **Continue targets** when you want another candidate round for that unresolved color.

When a fit is accepted, Auto-paint reruns with the fitted ranking model, including filament-order optimization and simulated preview mapping. This does not alter hiding-distance calibration, physical filament colors, swap instructions, or exported geometry. Raw judgments remain the persisted source of truth; fitted parameters are regenerated deterministically so a future model can reuse the same physical evidence.

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
