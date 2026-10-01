---
title: Settings And Controls
slug: settings-and-controls
order: 80
description: Header actions, themes, persistence, palettes, profiles, and workspace controls.
---

# Settings And Controls

This page collects controls that affect the whole app or are easy to miss.

## Header Controls

| Control       | What it does                                                                   |
| ------------- | ------------------------------------------------------------------------------ |
| Kromacut logo | Returns to the app while documentation is open; otherwise opens the home page. |
| Settings      | Opens the settings dialog, including language, theme, resource, and update controls. |

The theme selector offers **System**, **Dark**, and **Light**. **System** follows the operating system or browser color-scheme preference and updates when that preference changes. The theme choice is saved for later sessions.

The **Language** selector changes the interface, documentation, diagrams, and public pages. Choose **System language** to follow a supported browser or operating-system language, or select English, French, German, Italian, Romanian, Spanish, Japanese, Simplified Chinese, Hindi, European Portuguese, Ukrainian, or Bengali. Your choice is saved locally and does not change your artwork, filament profiles, print settings, or generated geometry. Translation resources and fonts are bundled with the desktop app; no online translation service receives your work.

Public pages also offer a language selector. Translated documentation uses shareable language-prefixed links, such as `/ro/docs/overview`. Page names and section anchors remain stable across languages. File extensions, numeric model data, user-entered names, and original community artwork titles are not translated.

The settings dialog includes links to the documentation, Discord, Reddit, GitHub, and Patreon, and shows the current Kromacut version. **Privacy & local data** and **Terms & conditions** are also available here and open in your browser in the selected language.

## Workspace Modes

Use the **2D** and **3D** buttons to switch between image preparation and model generation.

The vertical splitter between the controls panel and preview can be dragged. Make the left panel wider when working with detailed settings, or make the preview wider when inspecting the image or model.

Documentation pages use shareable `/docs/...` links. Opening one of those links takes you directly to the matching guide.

On smaller screens, expand **Contents** to choose a guide or **On This Page** to jump to a section. Both close after selection to leave room for reading. Illustrations can be opened at full size by clicking them or focusing their link and pressing Enter.

Most sidebar sections can be collapsed by their headings. Collapsing hides controls, not their effects: active adjustments, print settings and optimizer options still apply. Collapsed summaries and status dots help you spot active changes. Section open/closed state is remembered. Expanding a section does not reset it.

**Undo / Redo** shares the image-editing history between 2D and 3D. It is not an undo stack for filament edits, calibration, layer heights or optimizer settings. Use each panel's own reset control where available, and rebuild after restoring an image state.

## Experimental Multi-plate Mode

The **Multi-plate mode** switch in Settings is an unfinished workflow. It remembers the preference and can play a preview animation, but currently does not split the image, create tiles, distribute objects across plates, or change exported geometry. Leave it off for normal printing. Do not use it as a way to fit an oversized model on your bed.

## Saved Print Settings

Kromacut remembers print settings such as **Pixel Size (XY)**, **Layer Height**, **First Layer Height**, **Effective line width**, and **Smooth Meshing** in the browser.

Use the reset button in **3D Print Settings** if you want to return to the section's defaults, including 0.42 mm for effective line width.

Remembered settings are local to the current browser/site or desktop app. They are not a backup of the artwork or a complete saved project, and separate browsers or the desktop app need not share them. Export important palettes and filament profiles before clearing app/browser data. Loading a profile restores its filaments and evidence, not an image or a ready-built mesh.

## Saved Auto-paint State

Auto-paint settings are preserved across sessions, including:

- Filaments.
- Paint mode.
- Max Height and the calibration wedge's layer height.
- Enhanced color matching.
- Preserve color separation, its unique-match ΔE limit, and whether every color requires a unique match.
- Total repeat limit (shared extra filament appearances across the stack).
- Transition detail and height dithering.
- Effective line width (edited in **3D Print Settings**) for width warnings, isolated-speck cleanup, and height dithering, plus the saved **Omit isolated color specks** preference. The cleanup preference does not remove every width warning or control height dithering.
- Flat Paint and its face-up, no-clear-layer preference.
- Optimizer algorithm and seed.
- Region priority.

Profiles are separate from this remembered state. Use profiles when you want named filament sets that can be loaded, imported, or exported.

## Palette Files

Custom palettes are for 2D color reduction. Palette files use `.kpal`.

Palette format version 2 adds two optional fields: `disabledColors` (colors kept in the palette but excluded from quantization) and `colorNames` (optional per-color display names). Both round-trip through export and import. Version 1 files load unchanged with every color enabled and unnamed, and a v2 file opened by an older Kromacut simply treats all colors as enabled.

Use custom palettes when you want the reduced image to match a known filament set or a fixed color collection.

## Filament Profile Files

Auto-paint filament profiles are named sets of filaments that can be saved, loaded, imported, and exported. They use `.kfil` and store filament colors, names, hiding distance values, calibration data, saved Palette Proof records and judgments, and bounded Stack Matrix plans and measured colors when available. Older `.kapp` profile files can still be imported. Profiles saved by older versions stored uncalibrated values on the conventional TD scale; they are converted automatically (×0.1) when loaded or imported.

Use the **upload icon** in the Auto-paint profile toolbar to import a file. An older same-ID file without appearance data is imported as a separate renamed copy instead of erasing newer calibration evidence, and a storage failure leaves the existing profile list unchanged with an error message. Use the **download icon** to export the current filament set. Exported files default to `.kfil`. When the loaded profile has unsaved filament edits, the export is a new “unsaved edits” profile without appearance evidence tied to the old filament identities.

### Supported import formats

| Format                  | Extension      | Notes                                                                          |
| ----------------------- | -------------- | ------------------------------------------------------------------------------ |
| Kromacut profile        | `.kfil`        | Native format. Supports single profiles and arrays of profiles in one file.    |
| Legacy Kromacut profile | `.kapp`        | Older native format, still fully supported on import.                          |
| Raw JSON                | `.json`        | Accepted if the file contains a profile object or an array of profile objects. |
| HueForge spool CSV/TSV  | `.csv`, `.tsv` | See below.                                                                     |

### Duplicate handling

When importing, Kromacut checks each incoming profile against what you already have:

- **Same ID:** normally overwrites the existing profile. If that would replace saved appearance evidence with a file containing no usable evidence, it imports a separate copy instead.
- **Same content, different ID:** skipped only when both the filament data and appearance evidence match an existing profile.
- **Same name, different content:** imported with a numeric suffix added to the name (e.g. `My Spools (2)`).

A short summary of how many profiles were imported, overwritten, skipped, or renamed is shown after each import.

### Importing from HueForge

HueForge spool library exports (`.csv` or `.tsv`) can be imported directly. Use **Export Spools** in HueForge to save a CSV, then click the upload icon in the Auto-paint filament profile toolbar and select the file. The delimiter (comma or tab) is detected automatically from the header row. Each spool becomes a filament entry named `<Brand>-<Color Name>-<Hex>`, for example `Inland Basic-Light Brown-#BF9C81`. HueForge UUIDs are preserved as filament IDs so re-importing the same library does not create duplicates. HueForge TD values are treated as conventional backlit/lithophane TD inputs and converted to frontlit hiding distances during import.

## Desktop Update Notices

In the desktop app, Kromacut can show an update notice when a newer version is available. The notice lets you open the download page or dismiss the reminder.

Open **Settings** to check for updates manually. The desktop settings also include **Check on startup**, which controls whether Kromacut checks for updates when the app opens. This is enabled by default, and manual checks still work when it is off.

On Linux, AppImages with embedded update information can be updated with compatible tools such as AppImageUpdate. These tools use the release's `.AppImage.zsync` file to download changed parts. Older AppImages without update information need a one-time manual download of a supporting release. The `.zsync` file is not an installer, and Kromacut's update notice does not install updates automatically.

## Desktop Auto-paint Diagnostics

The desktop app can record structured information about new Auto-paint calculations. Open **Settings** and enable **Record Auto-paint diagnostics** before starting a calculation. The setting does not restart or record a result that was already computed.

Each calculation creates a separate `.jsonl` file in Kromacut's Auto-paint diagnostics folder. Use **Open folder** beside the setting to find the files. Every line is a complete JSON event, so progress, errors, and cancellations remain readable even when a calculation does not finish.

A completed trace includes basic runtime information, the active filament and calibration snapshot, build and optimizer settings, bounded progress samples, appearance-fit status, progressive repeat-tier decisions, final physical layers, every final printable color candidate, target-to-candidate Delta E comparisons, prediction confidence, and the measurements that contributed to interpolated or locally fitted colors. It records processed palette colors and weights, not the uploaded source image. Calibration and profile data can still be sensitive, so review a trace before sharing it publicly.

Recording is intended for investigations and may create large files. Leave it disabled for ordinary printing when you do not need a trace.

## Opening files from your desktop

Desktop installations associate `.kfil` and legacy `.kapp` files with filament profiles, and `.kpal` files with palettes. Double-click a file to import and select it in Kromacut. If the app is already running, the file opens in its existing window. Normal validation, migration, duplicate handling, and calibration-preservation rules apply.

Files opened from your desktop wait while a palette editor, calibration dialog, or profile Rename or Save New form is open. Finish or cancel that session to continue the queued imports; typed names and the profile being edited stay unchanged until then.

Imports also wait while you edit a filament name or HD field, or while its color picker or **Convert from TD** popover is open. Leave the field or close the picker or popover to resume the queued imports; unsaved filament changes still require your choice before another profile replaces them.

Before replacing unsaved filament edits, Kromacut offers **Keep edits** or **Open profile**. Keep your edits to save them first; opening the profile discards those edits. Files opened this way must be smaller than 32 MiB. Generic JSON, images, and models retain their usual import workflows.

On Linux, portable AppImages require desktop integration for file associations. If your system has not selected Kromacut as the default, use **Open with** in your file manager.

Next: [Troubleshooting](troubleshooting).
