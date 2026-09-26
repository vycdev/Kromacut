---
title: Bilder laden
slug: loading-images
order: 30
description: Bildpixel importieren, zuschneiden, skalieren und retuschieren, bevor sie zu Druckbereichen werden.
---

# Bilder laden

Im **2D**-Modus bereitest du das Bild vor, das das 3D-Modell verwenden soll. Farbänderungen beeinflussen die Zielfarben; Pixelbearbeitungen beeinflussen Formen und Details des Drucks.

## Eine Quelle wählen

Klicke in der Vorschau-Werkzeugleiste auf **Datei auswählen** oder ziehe eine Bilddatei in die 2D-Vorschau. Bei mehreren abgelegten Dateien wird nur die erste geladen. Verwende ein Bildformat, das dein Browser oder die Desktop-Webview decodieren kann. PNG eignet sich, wenn Transparenz wichtig ist. Entwickle Kamera-RAW-Dateien zunächst und exportiere sie in ein übliches Bildformat.

Kromacut startet mit seinem Logo als Beispiel. Das Laden eines anderen Bildes ersetzt das aktuelle Arbeitsbild. Dabei wird das Bild weder veröffentlicht noch eine Quelle aus einem eingefügten Weblink heruntergeladen.

## Betrachten, ohne das Bild zu verändern

| Steuerung | Wirkung |
| ------------------- | ----------------------------------------------------------------------------------------- |
| Mausrad | Zoomt um den Mauszeiger. Das verändert nur die Ansicht, nicht die Bildauflösung oder Druckgröße. |
| Ziehen mit linker Maustaste | Verschiebt den Ausschnitt, wenn kein Retuschierwerkzeug aktiv ist. |
| Ziehen mit mittlerer Maustaste | Verschiebt den Ausschnitt auch bei aktivem Retuschierwerkzeug. |
| Schachbrett umschalten | Zeigt ein Muster hinter transparenten Pixeln. Es gehört nicht zum Bild oder Druck. |
| Bildgrößenanzeige | Zeigt die Pixelabmessungen. Beim Zuschneiden zeigt sie zusätzlich die vorgesehenen Zuschnittabmessungen. |

Die Vorschau stellt Pixelkanten scharf dar, statt sie zu glätten. Vergrößere das Bild, um einzelne Pixel und schmale Details zu finden.

## Zuschneiden, skalieren oder Druckgröße ändern?

![Zuschneiden entfernt einen Teil des Bildes, Skalieren verringert die Pixelauflösung, und Pixelgröße ändert den physischen Maßstab jedes Pixels.](30_crop_resize_scale.svg)

_Die schematischen Abmessungen zeigen den Zusammenhang, keine empfohlene Druckgröße._

### Zuschneiden

Klicke auf **Zuschneiden**, ziehe die Auswahl oder ihre Eck- und Kantengriffe und wähle **Zuschnitt speichern**. **Zuschnitt abbrechen** lässt das Bild unverändert. Beim Speichern bleibt das ausgewählte Rechteck in Bildpixelauflösung erhalten.

Schneide unerwünschte Ränder vor der Farbreduktion weg, damit sie nicht mit dem Motiv um Palettenfarben konkurrieren. Der Zuschnitt ist rechteckig; verwende Transparenz für einen unregelmäßigen Hintergrund.

### Bild skalieren

**Maßstab** reicht von **1 % bis 100 %**, Standard **50 %**. **Aktuell** und **Nach der Skalierung** zeigen die Abmessungen vor dem Übernehmen. Klicke zum Verkleinern auf **Anwenden**. 100 % oder ein Wert, der auf dieselben Abmessungen gerundet wird, bewirkt nichts. Der Rücksetz-Pfeil setzt den Prozentsatz zurück, nicht das Bild.

Die Skalierung glättet das Bild und kann daher gemischte Kantenfarben und Teiltransparenz erzeugen. Skaliere vor der Quantisierung oder reduziere die Farben anschließend erneut. Wiederholtes Anwenden skaliert das bereits skalierte Bild: Zweimal 50 % ergibt 25 % der ursprünglichen Breite und Höhe. Verwende Rückgängig, um Details wiederherzustellen, statt hier eine Vergrößerung zu versuchen.

### Physische Größe in 3D

**Pixelgröße (XY)** bezeichnet Millimeter pro Bildpixel, nicht die Bildauflösung. Ein vollständig undurchsichtiges, 1000 Pixel breites Bild ist bei 0,1 mm/Pixel 100 mm breit. Nach Verkleinerung auf 500 Pixel sind es bei derselben Einstellung 50 mm. Mit 0,2 mm/Pixel wird die Breite wieder 100 mm, verlorene Details kehren aber nicht zurück. Vollständig transparente Außenränder zählen nicht zur Modellgrundfläche.

Weniger Pixel verringern Verarbeitungs- und Geometrieaufwand. Eine Änderung der Pixelgröße allein entfernt keine Pixel. Der [3D-Modus](3d-mode) erklärt die Steuerung des physischen Maßstabs.

## Pixel retuschieren

**Pinsel**, **Radierer**, **Füllen**, **Text** und **Farbe aus Bild aufnehmen** verwenden scharf begrenzte Pixel ohne Kantenglättung. Eine eigene Farbe kann trotzdem eine Palettenfarbe hinzufügen; harte Kanten verhindern unbeabsichtigte Mischfarben an den Rändern.

![Der Pinsel fügt Pixel mit exakter Farbe hinzu, der Radierer entfernt Pixel durch Transparenz, Füllen ändert einen zusammenhängenden Bereich und Text wird zu scharf begrenzten Bildpixeln.](31_pixel_tools.svg)

| Werkzeug oder Feld | Funktionsweise | Auswirkung auf den Druck |
| --------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Pinsel | Durch Ziehen undurchsichtige Pixel malen. Größe ist ein Durchmesser von 1 bis 64 Bildpixeln, Standard 4. | Repariert Konturen, verbindet Bereiche oder verbreitert Details. Der Cursor zeigt die Werkzeugfläche. |
| Radierer | Verwendet dieselbe Größensteuerung, schreibt aber vollständig transparente Pixel. | Entfernt Material aus der Form und kann Löcher erzeugen oder Teile voneinander trennen. |
| Füllen | Ersetzt den angeklickten Bereich mit exakt übereinstimmendem RGB und Alpha. Verbindungen zählen über Kanten, nicht diagonal. | Färbt einen zusammenhängenden Bereich um, nicht jedes Vorkommen der Farbe. Es gibt keine fotografische Farbtoleranz. |
| Farbe aus Bild aufnehmen | Nimmt einen nichttransparenten Quellpixel auf und wechselt zum Pinsel. | Verwendet eine Farbe des zugrunde liegenden Bildes, keinen noch nicht übernommenen Anpassungseffekt. |
| Werkzeugfarbe | Aus Bildfarben wählen, Farbwähler verwenden oder einen sechsstelligen Hex-Wert eingeben. Das Schließen des Popovers übernimmt die Auswahl. | Legt die undurchsichtige Farbe für Pinsel, Füllen oder Text fest. |
| Textgröße | Schriftgröße von 6 bis 128 Bildpixeln, Standard 24. | Größerer Text erzeugt bei gleichem physischem Maßstab größere Details; dies ist keine Millimeterangabe. |

### Text platzieren

Wähle Text, klicke ins Bild und schreibe. Enter fügt eine Zeile ein. Ziehe den Verschiebegriff über dem Textfeld zum Umpositionieren oder den Griff am rechten Rand zum Anpassen des Zeilenumbruchs. Größe und Farbe aktualisieren den Entwurf.

Klicke zum Übernehmen auf den Haken oder drücke **Strg+Enter** (**Command+Enter** unter macOS). Auch das Klicken an eine andere Bildstelle oder ein Werkzeugwechsel übernimmt den Text. X oder **Escape** verwirft einen offenen Entwurf; ein weiteres Escape verlässt das Werkzeug. Übernommener Text wird zu Pixeln, nicht zu einem bearbeitbaren Textobjekt.

Jeder verändernde Pinselstrich, jede Füllung und jede Textplatzierung ist ein Schritt im Bildverlauf. Ein ein Pixel breiter Strich bei 0,1 mm/Pixel ist nur 0,1 mm breit, unabhängig davon, wie groß er beim Hineinzoomen wirkt. Prüfe schmale Schrift im Slicer.

## Einen Hintergrund entfernen

Es gibt keine automatische Motivauswahl oder KI-Hintergrundentfernung. Öffne bei einem einfarbigen Hintergrund dessen Farbfeld unter Bildfarben, mache es vollständig transparent und klicke auf Anwenden. Das entfernt jede exakte Übereinstimmung, einschließlich gleichfarbiger Motivpixel. Verwende den Radierer für lokale Entfernungen und das Schachbrett zur Konturprüfung.

Verwende dafür nicht **Löschen** am Farbfeld: Es ordnet Farben neu zu, statt Pixel transparent zu machen. Siehe [Bildfarben](reducing-colors#image-colors).

## Rückgängig, Herunterladen und Leeren

**Rückgängig** und **Wiederholen** durchlaufen übernommene Bildänderungen wie Laden, Zuschneiden, Skalieren, übernommene Anpassungen, Quantisierung, Rasterglättung, Farbfeldbearbeitungen und Retuschen. Sie sind kein Verlauf aller Einstellungen oder Reglerbewegungen. Eine neue Bildbearbeitung löscht den Wiederholen-Zweig. Der Verlauf gehört zur aktuellen App-Sitzung; speichere das Bild, wenn du es später brauchst.

**Bild herunterladen** speichert das zugrunde liegende Arbeitsbild als PNG in Bildpixelauflösung. Zoom, Schachbrett, Zuschnittgriffe und Textentwürfe werden nicht gespeichert. Übernimm Text und **Bildanpassungen** zuerst, damit sie enthalten sind. Die Desktop-App verwendet einen Speicherdialog; im Browser richtet sich der Speicherort nach dessen Download-Einstellungen.

**Bild entfernen** leert den Arbeitsbereich, nicht die Einstellungen. Verlasse dich nicht darauf, diese Aktion rückgängig machen zu können: Das entfernte Bild wird nicht als neuer Rückgängig-Schritt hinzugefügt. Lade vorher eine Kopie herunter, wenn du es erhalten möchtest.

Weiter: [Bildanpassungen](image-adjustments).
