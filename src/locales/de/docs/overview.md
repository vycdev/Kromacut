---
title: Überblick
slug: overview
order: 10
description: Was Kromacut leistet und wie die wichtigsten Abläufe zusammenhängen.
---

# Überblick

Kromacut verwandelt ein flaches Bild in einen gestapelten, mehrfarbigen 3D-Druck. Das Grundprinzip ist einfach: Die Farben des Bildes werden zu physischen Schichten. Ihre Reihenfolge und Höhe bestimmen den Druckplan.

Nutze Kromacut für Drucke im Stil von HueForge, farbige lithophanieähnliche Reliefs oder geschichtete Ausstellungsstücke, bei denen Filamentwechsel das fertige Bild erzeugen.

## Wichtigster Arbeitsablauf

Die meisten Projekte folgen demselben Ablauf:

1. [Ein Bild laden oder importieren](loading-images).
2. [Farben reduzieren](reducing-colors), bis die Vorschau eine druckbare Palette hat.
3. [Raster glätten oder bereinigen](dedithering-cleanup), wenn einzelne Pixel das Bild unruhig wirken lassen.
4. Zum [3D-Modus](3d-mode) wechseln und Manuell oder Auto-paint wählen.
5. [Eine STL- oder 3MF-Datei erstellen und exportieren](generating-exporting-output) und die Druckanweisungen befolgen.

## Zwei Möglichkeiten der Farbzuweisung

Im 3D-Modus bietet Kromacut zwei Druckabläufe.

| Arbeitsablauf | Geeignet, wenn | Was du steuerst |
| ---------- | ------------------------------------------------------ | --------------------------------------------------------------------------- |
| Manuell | Du jede Bildfarbe direkt steuern möchtest. | Farbreihenfolge, Höhen je Farbe, Druckeinstellungen und Wechsel. |
| Auto-paint | Kromacut den physischen Filamentstapel planen soll. | Filamentfarben, Deckdistanzen, maximale Höhe und Optimierungsoptionen. |

Der manuelle Modus geht von den Farben im Bereich **Bildfarben** aus. Auto-paint geht von deinen tatsächlichen Filamenten und ihren **Deckdistanzen (HD)** aus und erzeugt daraus druckbare Schichten für das Bild.

## Was die App zeigt

Bereite das Motiv in 2D vor und plane die physischen Schichten in 3D. Die folgenden Anleitungen orientieren sich an dieser Unterscheidung.

## Bebilderte Anleitungen

Beginne mit der gewünschten Aufgabe. Jede Anleitung erklärt die Steuerelemente, ihr Zusammenspiel und die Folgen für den physischen Druck. Diagramme sind schematische Beispiele, keine kalibrierten Farbvorhersagen. Klicke auf eine Abbildung oder aktiviere sie per Tastatur, um sie in voller Größe zu öffnen.

| Aufgabe | Anleitung |
| ------------------------------------------------------------------ | -------------------------------------------------------------- |
| Abmessungen, Schichthöhen und manuelle Farbreihenfolge festlegen | [3D-Modus](3d-mode) |
| Filamente wählen, Mischfarben optimieren und druckbare Details prüfen | [Auto-paint](auto-paint) |
| Eine flache Mehrmaterialplatte mit Bildseite oben oder unten erstellen | [Flat Paint](flat-paint) |
| HD messen, Palette Proofs vergleichen oder eine Stack Matrix fotografieren | [Kalibrierabläufe](calibration-workflows) |
| Die Silhouette vorbereiten und Pixel retuschieren | [Bilder laden](loading-images) |
| Tonwerte und Farben abstimmen und das Ergebnis übernehmen | [Bildanpassungen](image-adjustments) |
| Farben reduzieren und Paletten verwalten | [Farben reduzieren](reducing-colors) |
| Farbpunkte entfernen, ohne 2D-Bereinigung mit Höhen-Dithering zu verwechseln | [Rasterglättung und Bereinigung](dedithering-cleanup) |
| Den fertigen Stapel prüfen und an einen Slicer übergeben | [Ergebnisse erzeugen und exportieren](generating-exporting-output) |

## Aufbau des Arbeitsbereichs

Der Arbeitsbereich besteht aus drei Hauptbereichen:

- Die Kopfzeile enthält Dokumentation, Darstellungseinstellungen und Community-Links.
- Links befinden sich die Steuerelemente des aktuellen Modus.
    - In **2D** sind das Bildanpassungen, Rasterglättung, Farbquantisierung, eigene Paletten und erkannte Bildfarben.
    - In **3D** sind das Druckeinstellungen, manuelle Steuerung, Auto-paint-Steuerung und Druckanweisungen.
- Die Hauptvorschau zeigt die 2D-Bildfläche oder das 3D-Modell.

> Tipp: Änderungen an 3D-Einstellungen erstellen das Modell nicht automatisch neu. Klicke nach Änderungen an Druckeinstellungen, manuellen Farbhöhen oder Auto-paint-Optionen auf **3D-Modell erstellen**.

## Ein gutes erstes Projekt

Beginne mit einem kontrastreichen Bild, einem klar erkennbaren Motiv und wenigen Hintergrunddetails. Reduziere es auf 4 bis 16 Farben. Nutze anschließend den manuellen Modus, wenn du die Schichtreihenfolge bereits kennst, oder Auto-paint, wenn die Deckdistanzen deiner Filamente kalibriert sind.

---

Weiter: [Schnellstart](quick-start).
