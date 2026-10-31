---
title: Mehrkopfdruck
slug: multi-head-printing
order: 65
description: Filamentzuweisungen, Druckkopfwechsel und 3MF-Exporte für den Mehrkopfdruck planen.
---

# Mehrkopfdruck

Der Mehrkopfmodus ordnet den von [Auto-paint](auto-paint) gewählten druckbaren Aufbau neu. Jeder Bildbereich kann in derselben Schicht ein anderes Filament verwenden. Mehrere Druckköpfe halten Filamente zwischen manuellen Nachladevorgängen bereit. Die Analyse sucht bessere vorhergesagte Farbtreffer und plant nötige Wechsel. Weniger Pausen sind möglich, aber nicht garantiert.

## Voraussetzungen

- Verwende **Auto-paint** mit mindestens einem Filament in der Liste und aktiviere den **Mehrkopfmodus**.
- Wähle **2–8 Druckköpfe** und eine **Suchtiefe**, dann **3D-Modell erstellen**. Für ein sinnvolles Fenster benötigt die Analyse mindestens zwei verfügbare Filamente.

Mehrkopfmodus und **Flat Paint** schließen sich aus. Kalibriere die tatsächlich vorhandenen Filamente; siehe [Kalibrierungstheorie](calibration-theory). Modus, Druckkopfzahl und Suchtiefe bleiben zwischen Sitzungen gespeichert. Erstelle das Modell nach geänderten Eingaben erneut.

## Abschnitte und Fenster

Ein **Abschnitt** ist ein zusammenhängender Block aus Schichten mit demselben Filament im Auto-paint-Aufbau. Seine Dicke stammt aus dem druckbaren Auto-paint-Ergebnis einschließlich Kalibrierung und Höhenbeschränkungen, nicht allein aus der Bildhelligkeit.

Ein **Fenster** umfasst N aufeinanderfolgende Abschnitte. N wird durch die gewählte Druckkopfzahl, die verfügbaren Filamente und die Abschnitte oberhalb des ersten Abschnitts begrenzt, der sein Filament immer behält; nicht benötigte Köpfe bleiben im Druckkopfplan als **LEER** markiert. Die Analyse wählt nützliche, nicht überlappende Fenster aus; sie gruppiert nicht automatisch alle Abschnitte. Abschnitte außerhalb gewählter Fenster behalten ihr geplantes Filament und werden im Druckkopfplan berücksichtigt.

![Farbabschnitte in beispielhaften Fenstern; übrige Abschnitte behalten ihr geplantes Filament.](01_window_run_diagram.svg)

## Filamente je Fenster wählen

Bei K verschiedenen Filamenten in einem Fenster und N Abschnittspositionen gibt es **K^N** mögliche Reihenfolgen einschließlich Wiederholungen. Die Analyse vergleicht vorhergesagte Mischfarben anhand der Farbdifferenz **ΔE** und weist jedem Bildfarbbereich eine Reihenfolge zu. Eine Abschnittsposition ist kein fester physischer Druckkopf: Der Plan ordnet die benötigten Filamente den Köpfen zu.

![Eine andere Reihenfolge derselben Filamente verändert die vorhergesagte Mischung; die Farben sind schematisch.](03_beer_lambert_blending.svg)

![Die 27 Reihenfolgen für drei Filamente und drei Positionen mit einer Tabelle zum Wachstum von K^N.](05_combo_search_space.svg)

Die **Suchtiefe** bestimmt die Auswahlhürde für Fenster, deren mögliche Anzahl und die Zahl geprüfter Reihenfolgen:

- **Schnell** verwendet weniger Fensterauswahl-Durchläufe und ein kleineres Kombinationsbudget.
- **Ausgewogen** ist der voreingestellte Kompromiss zwischen Aufwand und Abdeckung.
- **Gründlich** erlaubt mehr Fenster und ein größeres Kombinationsbudget; große Suchräume können weiterhin stichprobenartig untersucht werden.

Innerhalb des Budgets jeder Suchtiefe werden alle Kombinationen geprüft. Größere Räume verwenden eine begrenzte deterministische Stichprobe sowie die aktuelle Reihenfolge. Gleiche Eingaben liefern reproduzierbare Ergebnisse. Jede Suchtiefe berücksichtigt dieselben Bildfarben; eine tiefere Suche garantiert keinen besseren realen Druck.

## Druckkopfplan und Export

Nach erfolgreicher Erstellung zeigt die Vorschau die zugewiesene simulierte Farbe jedes Bereichs. **Physische Farben** zeigt stattdessen das tatsächliche Filament. Öffne die **Druckanweisungen** und befolge den **Druckkopfplan**:

- Lade vor dem Druck jedes aufgeführte Filament in seinen nummerierten Druckkopf. Als **LEER** markierte Köpfe bleiben unbenutzt.
- Lade an jedem aufgeführten Schichtkontrollpunkt nur die markierten Köpfe neu. Unveränderte Belegungen bleiben erhalten; nicht jede Fenstergrenze braucht eine Pause.
- Exportiere als **3MF**, um zugewiesene Geometrie, physische Filamentfarben und Druckkopfzuweisungen zu erhalten. Die Datei speichert die gewählte Druckkopfzahl als Extruderzahl und fügt **M600**-Pausenmarkierungen an den Wechselpunkten des Plans ein. STL erhält diese Zuweisungen nicht.

![Drei Köpfe behalten unveränderte Filamente zwischen Phasen; nur geänderte Belegungen erfordern manuelles Nachladen.](02_nozzle_swap_schedule.svg)

Verwende einen kompatiblen Mehrkopfdrucker. Prüfe vor dem Druck die Kopfzuordnung, erste und reguläre Schichthöhen sowie die Pausenbehandlung im Slicer. Ein Kontrollpunkt kann das Nachladen mehrerer Köpfe erfordern.

## Rückfall und Neuerstellung

Schlägt die Analyse fehl, findet sie keine nutzbare Verbesserung des normalen Aufbaus oder ist die vorhergesagte Verbesserung zu gering, um die Kopfwechsel zu rechtfertigen, entsteht ein normales Einkopfmodell mit Hinweis sowie ursprünglicher Startfarbe und Wechselanweisungen. Probiere andere Filamente, eine andere Druckkopfzahl oder Suchtiefe und erstelle das Modell erneut.

Die Analyse läuft im Hintergrund. Beim Verlassen des 3D-Panels oder Bildwechsel wird eine laufende Analyse abgebrochen; erstelle das Modell für das neue Bild erneut. Anweisungen und Exporte beschreiben das erstellte Modell. Geänderte Einstellungen erfordern eine Neuerstellung.

Weiter: [Ausgabe erzeugen und exportieren](generating-exporting-output).
