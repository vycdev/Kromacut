---
title: Schnellstart
slug: quick-start
order: 20
description: Ein praktischer erster Durchlauf vom Bild bis zum Export.
---

# Schnellstart

Diese Anleitung führt durch ein typisches Projekt vom Laden des Bildes bis zum Export.

## Ein Bild laden oder importieren

Verwende die Hochladen-Schaltfläche in der Vorschau-Werkzeugleiste oder ziehe ein Bild in die 2D-Vorschau.

Nach dem Laden kannst du mit dem Mausrad zoomen und durch Ziehen den Ausschnitt verschieben. Bei transparenten Bildern macht die Schachbrett-Schaltfläche durchsichtige Bereiche leichter erkennbar.

## Das Bild anpassen

Nutze in **2D** die **Bildanpassungen**, bevor du Farben reduzierst. Belichtung, Kontrast, Lichter, Tiefen, Weiß, Schwarz, Sättigung, Dynamik, Farbton, Temperatur, Tönung und Klarheit beeinflussen, welche Farben die Palettenwerkzeuge finden.

Klicke im Bereich Bildanpassungen auf **Anwenden**, um die aktuellen Anpassungen fest ins Bild zu übernehmen, bevor du Farben reduzierst, 3D-Geometrie erstellst oder das Bild herunterlädst. Laufende Anpassungen sind zunächst nur eine Vorschau und ändern das Quellbild noch nicht. [Bildanpassungen](image-adjustments) erklärt Vorher-nachher-Beispiele und das Zurücksetzen.

## Bei Bedarf skalieren

Ist das Bild deutlich größer als die Details, die du drucken möchtest, verkleinere es vor der Farbreduktion mit **Bild skalieren** prozentual. Dadurch sinkt die tatsächliche Pixelauflösung. Das spätere 3D-Modell lässt sich oft schneller erstellen und leichter auf die gewünschte physische Größe bringen.

## Farben reduzieren

Im Bereich **Farbquantisierung**:

1. Lass **Palette** auf **Automatisch**, sofern du noch keine bestimmte Palette verwenden möchtest.
2. Beginne mit **Anzahl der Farben: 16**. Ein niedrigerer Wert erzeugt weniger Ausgangsfarbbereiche, ein höherer erhält mehr Details in der Vorschau. Bei Auto-paint ist dies nicht die Anzahl der Spulen oder Wechsel.
3. Lass **Algorithmus** auf dem Standard **K-Means**. Er ist für die meisten Bilder der empfohlene Einstieg.
4. Klicke auf **Anwenden**.

Prüfe das Ergebnis unter **Bildfarben**. Klicke auf ein Farbfeld, um es zu bearbeiten oder aus der Palette zu löschen. Beim Löschen werden Pixel den verbleibenden Farben zugeordnet. Verwende den Radierer oder setze Alpha auf null (vollständig transparent), um Pixel aus der Silhouette zu entfernen.

## Raster glätten oder bereinigen

Hinterlässt die Farbreduktion einzelne Farbpunkte, nutze **Raster glätten** zur Rauschbereinigung. Das ist besonders hilfreich, weil einzelne unerwünschte Pixel im 2D-Bild zu einzelnen Geometrieteilen im 3D-Modell werden können.

Beginne mit den Standardwerten für **Stärke** und **Durchläufe** und klicke auf **Anwenden**. Erhöhe die Anzahl der Durchläufe nur, wenn nach einem Durchlauf noch zu viele vereinzelte Pixel vorhanden sind.

## Den 3D-Modus aktivieren

Klicke auf **3D**. Lege zuerst die grundlegenden Druckeinstellungen fest:

- **Pixelgröße (XY)** bestimmt die physische Breite und Tiefe jedes Bildpixels.
- **Schichthöhe** sollte der geplanten Schichthöhe im Slicer entsprechen.
- **Höhe der ersten Schicht** sollte mit der entsprechenden Slicer-Einstellung übereinstimmen.
- **Glatte Vernetzung** kann zusammenhängende Farbgrenzen für eine glattere Geometrie abrunden.

## Manuell oder Auto-paint wählen

Nutze **Manuell**, wenn du die reduzierten Bildfarben direkt steuern möchtest. Dieser Modus verwendet die Farbfelder unter **Bildfarben**: Ziehe die Farben in die gewünschte Druckreihenfolge und lege mit dem Regler jeder Zeile fest, wie viel Höhe diese Farbe beiträgt. Das ist ein guter Einstieg, wenn die gewünschte Schichtreihenfolge bereits feststeht oder du eine kleine, einfache Palette abstimmst.

Nutze **Auto-paint**, wenn Kromacut den physischen Filamentstapel planen soll. Auto-paint beginnt bei deinen tatsächlichen Filamenten statt bei den reduzierten Bildfarbfeldern. Farbe und **Deckdistanz (HD)** jedes Filaments – die Dicke, bei der es den Untergrund verdeckt – dienen zur Abschätzung des Aussehens übereinanderliegender Schichten.

Für den ersten Auto-paint-Durchlauf:

1. Füge die Filamente hinzu, mit denen du tatsächlich drucken möchtest.
2. Stelle jede Filamentfarbe möglichst genau ein.
3. Gib die **HD** jedes Filaments an. Die Zauberstab-Schätzung reicht zum Experimentieren; auch ein herkömmlicher TD-Wert lässt sich umrechnen (ungefähr das Zehnfache der HD). Kalibrierte Deckdistanzen liefern meist die besten Ergebnisse.
4. Lass **Maximale Höhe** zunächst auf **Automatisch**.
5. Aktiviere **Verbesserte Farbabstimmung**, wenn wichtige Farben im ersten Ergebnis fehlen oder die Optimierung eine bessere Filamentreihenfolge suchen soll.

Prüfe nach der Berechnung des Stapels die Übergangszonen und Angaben zur Ergebniszuverlässigkeit, bevor du exportierst. Eine niedrige Zuverlässigkeit bedeutet meist, dass im Filamentset eine hilfreiche Farbe fehlt, Deckdistanzen kalibriert werden müssen oder die maximale Höhe zu stark begrenzt ist.

## Erstellen und exportieren

Klicke auf **3D-Modell erstellen**. Sobald das Modell erscheint, kannst du mit **Schichtvorschau** prüfen, wie der Druck von unten nach oben aufgebaut wird.

Öffne das Downloadmenü und wähle **STL herunterladen** oder **3MF herunterladen**. Kopiere anschließend die **Druckanweisungen**, damit Startfarbe, Wechselschichten und empfohlene Slicer-Einstellungen bereitliegen.

Weiter: [3D-Modus](3d-mode), [Auto-paint](auto-paint) oder [Ergebnisse erzeugen und exportieren](generating-exporting-output#before-you-export).
