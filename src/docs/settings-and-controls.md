---
title: Settings And Controls
slug: settings-and-controls
order: 80
description: Header actions, themes, persistence, palettes, profiles, and workspace controls.
---

# Settings And Controls

This page collects controls that affect the whole app or are easy to miss.

## Header Controls

| Control      | What it does                                              |
| ------------ | --------------------------------------------------------- |
| Load TD Test | Loads the bundled TD test image into the current project. |
| Docs         | Opens this documentation page.                            |
| Discord      | Opens the community link.                                 |
| GitHub       | Opens the project page.                                   |
| Support me   | Opens the support link.                                   |
| Settings     | Opens the settings dialog, including theme and desktop update controls. |

The theme selector offers **System**, **Dark**, and **Light**. **System** follows the operating system or browser color-scheme preference and updates when that preference changes. The theme choice is saved for later sessions.

The settings dialog also shows the current Kromacut version.

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
- Repeated swaps.
- Height dithering and line width.
- Flat Paint.
- Optimizer algorithm and seed.
- Region priority.

Profiles are separate from this remembered state. Use profiles when you want named filament sets that can be loaded, imported, or exported.

## Palette Files

Custom palettes are for 2D color reduction. Palette files use `.kpal`.

Use custom palettes when you want the reduced image to match a known filament set or a fixed color collection.

## Filament Profile Files

Auto-paint filament profiles use `.kfil`. Older `.kapp` profile files can still be imported. Profile files contain filament colors, names, TD values, and calibration data when available.

Use profile import and export to move calibrated filaments between browsers or share them with another Kromacut user.

## Desktop Update Notices

In the desktop app, Kromacut can show an update notice when a newer version is available. The notice lets you open the download page or dismiss the reminder.

Open **Settings** to check for updates manually. The desktop settings also include **Check on startup**, which controls whether Kromacut checks for updates when the app opens. This is enabled by default, and manual checks still work when it is off.

Next: [Troubleshooting](troubleshooting).
