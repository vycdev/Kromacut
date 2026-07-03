---
title: Overview
slug: overview
order: 10
description: What Kromacut does and how the main workflows fit together.
---

# Overview

Kromacut turns a flat image into a stacked, color-layered 3D print. The central idea is simple: the colors in your image become physical layers, and the order and height of those layers become the print plan.

Use Kromacut when you want a HueForge-style print, a color lithophane-style relief, or a layered display piece where filament swaps create the final image.

## Main Workflow

Most projects follow the same path:

1. [Load or import an image](loading-images).
2. [Reduce colors](reducing-colors) until the preview has a printable palette.
3. [Dedither or clean up](dedithering-cleanup) isolated pixels if the image looks noisy.
4. Switch to [3D mode](3d-mode) and choose Manual or Auto-paint.
5. [Build and export](generating-exporting-output) an STL or 3MF file and follow the print instructions.

## Two Ways To Paint

Kromacut has two printing workflows in 3D mode.

| Workflow   | Use it when                                            | What you control                                                                  |
| ---------- | ------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Manual     | You want direct control over each image color.         | Color order, per-color slice heights, print settings, and swaps.                  |
| Auto-paint | You want Kromacut to plan the physical filament stack. | Filament colors, hiding distance values, max height, and optimizer options. |

Manual mode starts from the image colors shown in the **Image colors** panel. Auto-paint starts from your real filaments and their **hiding distance (HD)** values, then generates printable layers for the image.

## What You See In The App

The workspace has three main areas:

- The header contains docs, theme controls, and community links.
- The left panel contains the current mode controls.
    - In **2D**, it shows adjustments, dedither, quantization, custom palettes, and detected image colors.
    - In **3D**, it shows print settings, Manual controls, Auto-paint controls, and print instructions.
- The main preview shows the 2D image canvas or the 3D model.

> Tip: 3D settings do not automatically rebuild the model. After changing print settings, Manual slice heights, or Auto-paint options, click **Build 3D Model**.

## Good First Project

Start with a high-contrast image that has a clear subject and limited background detail. Reduce it to 4 to 16 colors, then use Manual mode if you already know your layer order or Auto-paint if you have calibrated filament hiding distances.

---

Next: [Quick start](quick-start).
