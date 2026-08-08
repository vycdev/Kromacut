---
title: Settings And Controls
slug: settings-and-controls
order: 80
description: Header actions, themes, persistence, palettes, profiles, and workspace controls.
---

# Settings And Controls

This page collects controls that affect the whole app or are easy to miss.

## Header Controls

| Control       | What it does                                                               |
| ------------- | -------------------------------------------------------------------------- |
| Kromacut logo | Returns to the landing page from the web app.                              |
| Settings      | Opens the settings dialog, including theme, resource, and update controls. |

The theme selector offers **System**, **Dark**, and **Light**. **System** follows the operating system or browser color-scheme preference and updates when that preference changes. The theme choice is saved for later sessions.

The settings dialog includes links to the documentation, Discord, Reddit, GitHub, and Patreon, and shows the current Kromacut version.

## Workspace Modes

Use the **2D** and **3D** buttons to switch between image preparation and model generation.

The vertical splitter between the controls panel and preview can be dragged. Make the left panel wider when working with detailed settings, or make the preview wider when inspecting the image or model.

Documentation pages use shareable `/docs/...` links. Opening one of those links takes you directly to the matching guide.

## Saved Print Settings

Kromacut remembers print settings such as **Pixel Size (XY)**, **Layer Height**, **First Layer Height**, and **Smooth Meshing** in the browser.

Use the reset button in **3D Print Settings** if you want to return to defaults.

## Saved Auto-paint State

Auto-paint settings are preserved across sessions, including:

- Filaments.
- Paint mode.
- Enhanced color matching.
- Preserve color separation.
- Repeated swaps.
- Height dithering and line width.
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

Use the **upload icon** in the Auto-paint profile toolbar to import a file. Use the **download icon** to export the current filament set. Exported files default to `.kfil`.

### Supported import formats

| Format                  | Extension      | Notes                                                                          |
| ----------------------- | -------------- | ------------------------------------------------------------------------------ |
| Kromacut profile        | `.kfil`        | Native format. Supports single profiles and arrays of profiles in one file.    |
| Legacy Kromacut profile | `.kapp`        | Older native format, still fully supported on import.                          |
| Raw JSON                | `.json`        | Accepted if the file contains a profile object or an array of profile objects. |
| HueForge spool CSV/TSV  | `.csv`, `.tsv` | See below.                                                                     |

### Duplicate handling

When importing, Kromacut checks each incoming profile against what you already have:

- **Same ID** — overwrites the existing profile with the incoming one.
- **Same filaments, different ID** — skipped as a duplicate.
- **Same name, different content** — imported with a numeric suffix added to the name (e.g. `My Spools (2)`).

A short summary of how many profiles were imported, overwritten, skipped, or renamed is shown after each import.

### Importing from HueForge

HueForge spool library exports (`.csv` or `.tsv`) can be imported directly. Use **Export Spools** in HueForge to save a CSV, then click the upload icon in the Auto-paint filament profile toolbar and select the file. The delimiter (comma or tab) is detected automatically from the header row. Each spool becomes a filament entry named `<Brand>-<Color Name>-<Hex>`, for example `Inland Basic-Light Brown-#BF9C81`. HueForge UUIDs are preserved as filament IDs so re-importing the same library does not create duplicates. HueForge TD values are treated as conventional backlit/lithophane TD inputs and converted to frontlit hiding distances during import.

## Desktop Update Notices

In the desktop app, Kromacut can show an update notice when a newer version is available. The notice lets you open the download page or dismiss the reminder.

Open **Settings** to check for updates manually. The desktop settings also include **Check on startup**, which controls whether Kromacut checks for updates when the app opens. This is enabled by default, and manual checks still work when it is off.

Next: [Troubleshooting](troubleshooting).
