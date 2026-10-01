---
title: Flat Paint
slug: flat-paint
order: 64
description: Stufenrelief, transparente Träger mit Bildseite unten und offene Platten mit Bildseite oben.
---

# Flat Paint

**Flat Paint** ist eine Auto-paint-Anordnung für die normale und die verbesserte Farbabstimmung. Statt eines Stufenreliefs entsteht eine Platte gleichmäßiger Dicke. Jede gedruckte Schicht bedeckt die Grundfläche des Modells; dabei können verschiedene Materialien nebeneinander in derselben Schicht liegen.

Verwende einen Mehrmaterialablauf wie AMS, CFS oder einen Werkzeugwechsler mit passender Slicer-Unterstützung. Ein manueller Filamentwechsel auf einer bestimmten Höhe kann nicht mehrere Materialien nebeneinander in dieser Schicht bereitstellen.

![Querschnitte vergleichen normales Relief, Flat Paint mit Bildseite unten und transparentem Träger sowie Flat Paint mit Bildseite oben ohne Träger.](17_flat_paint_orientation.svg)

_Schematische Querschnitte. Farben kennzeichnen Materialien, Beschriftungen die Betrachtungsseite._

Der Erstellungsfortschritt z?hlt Netzteile, nicht Druckschichten: Mehrere farbige Teile k?nnen dieselbe Schicht belegen. Die Modellanzeige zeigt die Anzahl physischer Schichten einschlie?lich des transparenten Tr?gers, falls verwendet. Die Schichtvorschau schneidet die Platte in einzelnen Druckschichten; beide Regler schneiden auch zusammengefasste Unterbau- und Farbbereiche. Der Export enth?lt immer das vollst?ndige Modell. Build 3D Model erstellt das Modell auch bei unver?nderten Einstellungen neu und stellt den vollst?ndigen Schichtbereich sowie die urspr?ngliche Kameraansicht wieder her.

Wenn die Erstellung fehlschlägt, entfernt Kromacut das unvollständige Modell und zeigt den Fehler in der Vorschau an. Klicke zum erneuten Versuch auf 3D-Modell erstellen. Nach erfolgreicher Erstellung werden Modellabmessungen und Schichtvorschau wieder angezeigt.

## Standard: Bildseite unten mit transparentem Träger

Aktiviere **Flat Paint** und lass **Bildseite oben, ohne transparente Schicht** ausgeschaltet.

1. Der transparente Träger wird zuerst gedruckt und bildet die glatte, an der Druckplatte liegende Betrachtungsseite. Weise seinem Objekt transparentes Filament zu.
2. Die Motivspalten kehren ihre normale Materialreihenfolge für die Betrachtung von unten um. Grundmaterial füllt den Raum hinter kürzeren Spalten.
3. Exportiere **3MF** und behalte die Ausrichtung bei. Das Motiv ist bereits gespiegelt; spiegele es im Slicer nicht erneut.
4. Drehe das fertige Teil um, um durch den Träger auf das Bild zu sehen.

Von hinten kann Schrift im Slicer spiegelverkehrt erscheinen. Prüfe stattdessen die vorgesehene Betrachtungsseite. Drehe die Kromacut-Vorschau nach unten, um diese Seite zu untersuchen.

Der Träger ist zusätzliche Geometrie und benötigt echtes transparentes Filament. Transparenz am Bildschirm misst weder die Klarheit des Filaments noch die Oberfläche der Druckplatte. Prüfe die Gesamtdicke in der Anzeige **Modell** und im Slicer, nicht nur unter **Maximale Höhe** in Auto-paint.

## Bildseite oben, ohne transparente Schicht

Aktiviere diese Option, um den transparenten Träger zu entfernen:

- Jede Spalte behält ihre normale Materialreihenfolge von unten nach oben.
- Grundmaterial füllt unter kürzeren Spalten auf und richtet die sichtbaren Farben an einer flachen Oberseite aus.
- Es gibt kein Trägerobjekt, und transparentes Filament ist nicht erforderlich.
- Drucke mit Bildseite oben wie exportiert, ohne Spiegelung. Betrachte die freiliegende Oberseite, ohne das Teil umzudrehen.

Diese Anordnungen haben unterschiedliche Geometrie. Klicke nach dem Umschalten erneut auf **3D-Modell erstellen**. Das Umdrehen eines alten Exports wandelt ihn nicht in die andere Anordnung um.

## Vergleich der Abläufe

| Arbeitsablauf | Betrachtungsseite | Geometrie | Zuweisung im Slicer |
| ------------------- | ---------------------------- | --------------------------------------------------- | ---------------------------------- |
| Normales Auto-paint | Gestufte Oberseite | Kürzere Spalten enden früher. | Physische Materialabschnitte nach Höhe. |
| Flat Paint, Standard | Unterseite durch transparenten Träger | Gespiegelte, umgekehrte Spalten mit Grundmaterial dahinter. | Objekte je Filament und zusätzlicher Träger. |
| Flat Paint, Bildseite oben | Freiliegende flache Oberseite | Normale Reihenfolge mit Grundmaterial unter kürzeren Spalten. | Objekte je Filament, kein Träger. |

**Glatte Vernetzung** funktioniert mit beiden Flat-Paint-Ausrichtungen. Wähle eine Stärke und baue das Modell neu. Die Glättung mildert Außenkontur und gemeinsame Farbgrenzen, während Platte, Schichthöhen und Materialstapel erhalten bleiben. Kleine gemeinsame Verbindungen schließen diagonale Eckkontakte ohne Überlappung. Druckanweisungen und 3MF halten die verwendete Stärke fest.

## Exportieren und prüfen

Es wird nur **3MF** angeboten. Eine farblose STL-Datei würde die entscheidende Materialaufteilung verlieren und nur eine Platte übriglassen. Objekte werden nach tatsächlichem Filament gruppiert, nicht nach jeder vorhergesagten Mischfarbe.

1. Gleiche reguläre Schichthöhe und Höhe der ersten Schicht mit Kromacut ab.
2. Behalte Maßstab und exportierte Ausrichtung bei. Füge keine weitere Spiegelung hinzu.
3. Weise jedes Objekt korrekt zu, einschließlich transparentem Filament für den Standardträger.
4. Prüfe einzelne Slicer-Schichten auf nebeneinanderliegende Bereiche und eine vollständige Platte.
5. Kontrolliere die Schriftrichtung von der vorgesehenen Betrachtungsseite und prüfe anschließend Wechsel und Druckzeit.

Die **Druckanweisungen** ersetzen die manuelle Wechselliste durch anordnungsspezifische Mehrmaterialhinweise. Die **Schichtvorschau** hat eine einfarbige Reglerbahn, weil jede Schicht mehrere Materialien enthalten kann. Ihre Grenzen dienen weiterhin nur der Betrachtung und ändern niemals den vollständigen Export.

## Aufwand und Detailtreue

Eine flache Oberfläche bedeutet nicht unbedingt einen einfacheren Druck. Das Auffüllen der gesamten Grundfläche in jeder Schicht benötigt gegenüber einem Relief mehr Material und aufwendigere Geometrie. Dünne Schichten, hohe Stapel und **Höhen-Dithering** können viele kleine Bereiche, mehr Leerfahrten und eine langsamere Modellerstellung, einen langsameren Export oder längeres Slicing verursachen.

Kromacut warnt vor großen Flat-Paint-Aufträgen vor dem Erstellen. **Trotzdem erstellen** akzeptiert diesen Aufwand, bestätigt aber nicht die Eignung des Druckers. Teste ein kleines Stück, wenn Material oder Oberflächenqualität noch ungeprüft sind. Flat Paint erhält die beabsichtigte optische Spaltenanordnung, ist aber weiterhin auf kalibrierte Materialien und einen dazu passenden Druckprozess angewiesen.

Weiter: [Ergebnisse erzeugen und exportieren](generating-exporting-output).
