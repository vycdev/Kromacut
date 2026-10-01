---
title: 3D-Modus
slug: 3d-mode
order: 60
description: Physische Abmessungen, manuelle Farbstapel, Netzerzeugung und Vorschausteuerung.
---

# 3D-Modus

Der 3D-Modus macht Bildfarben zu physischen Schichten. Bereite das Bild in 2D vor, wähle Abmessungen und Druckmethode und klicke auf **3D-Modell erstellen**. Das Ändern einer Einstellung erstellt das angezeigte Modell nicht automatisch neu.

Mit **Manuell** bestimmst du Farbreihenfolge und Dicke selbst. **Auto-paint** sagt Mischfarben deiner tatsächlichen Filamente voraus und sucht einen passenden Stapel für das Bild. Keine der Methoden steuert den Drucker: Exportiere das Modell und prüfe es im Slicer.

## 3D-Druckeinstellungen

| Steuerelement | Auswirkung auf das Modell | Was zu prüfen ist |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Pixelgröße (XY)** | Millimeter je Bildpixel in beiden horizontalen Richtungen. | Die Anzeige **Modell** schätzt physische Breite, Höhe und Tiefe vor dem Erstellen. |
| **Schichthöhe** | Der reguläre vertikale Schritt für Höhen und Wechsel. | Mit dem Slicer abgleichen. Kleinere Schichten ermöglichen feinere Höhenabstufungen, keine schmaleren Extrusionslinien. |
| **Höhe der ersten Schicht** | Der erste Schritt über der Druckplatte. | Getrennt abgleichen. Die erste Farbe muss mindestens so dick sein wie der größere Wert aus regulärer und erster Schichthöhe. |
| **Effektive Linienbreite** | Extrusionsbreite für Auto-paints Prüfung druckbarer Details und Höhen-Dithering. | Die geplante Slicer-Linienbreite verwenden, nicht Düsendurchmesser oder Pixelgröße. Ändert das Druckerprofil nicht. |
| **Glatte Vernetzung** | Ersetzt pixelgestufte Grenzen durch geglättete, verbundene Konturen. | Ändert die Exportgeometrie, nicht nur die Beleuchtung. Fügt keine Bilddetails hinzu und bügelt die Oberfläche nicht. |
| **Zurücksetzen** | Stellt 0,1 mm/Pixel, 0,12 mm reguläre Schichthöhe, 0,2 mm erste Schichthöhe und 0,42 mm effektive Linienbreite wieder her und deaktiviert die Glättung. | Setzt auch manuelle Dicken auf Mindestwerte zurück, erhält aber die aktuelle Farbreihenfolge. |

### Pixelgröße ist nicht Düsengröße

Ein 1000 Pixel breites Bild erzeugt bei **0,1 mm/Pixel** ein etwa **100 mm** breites Modell. Bei **0,2 mm/Pixel** wird es etwa **200 mm** breit, mit genau denselben Bildpixeln. Transparente Außenränder zählen nicht zu den Modellgrenzen.

![Dasselbe Bildraster wird bei größerer Pixelgröße physisch größer; eine Bildskalierung verändert dagegen die Pixelanzahl.](10_physical_size.svg)

_Schematische Darstellung. XY-Größe, Bildauflösung und Extrusionsbreite sind getrennte Einstellungen._

Um mit 2000 Bildpixeln eine Breite von 100 mm beizubehalten, verwende **0,05 mm/Pixel**. Mehr Pixel können feinere Kanten beschreiben, der Drucker hat aber weiterhin eine Grenze durch die Extrusionsbreite. Stelle **Effektive Linienbreite** unter **3D-Druckeinstellungen** ein und untersuche diese Begrenzung mit Auto-paints [Vorschau druckbarer Details](auto-paint#printable-detail).

Eine größere Pixelgröße reduziert nicht die Pixelanzahl und macht die Netzerzeugung nicht grundsätzlich günstiger. Für weniger Aufwand skaliere oder beschneide das Bild im [2D-Modus](loading-images) oder vereinfache seine Palette.

### Effektive Linienbreite

Übertrage die geplante Extrusionsbreite des Slicers in **Effektive Linienbreite**. Erlaubt sind 0,1 bis 2 mm. Beim Zurücksetzen der **3D-Druckeinstellungen** wird sie zusammen mit den übrigen Standardwerten auf 0,42 mm gesetzt. Dieses Feld verändert das Druckerprofil nicht.

Auto-paint verwendet die Breite für die Vorschau der Breitenwarnungen, die optionale Bereinigung isolierter Farbpunkte und die Blockgröße des Höhen-Ditherings. Die Funktionen zur Warnungsprüfung oder zum Auslassen isolierter Punkte bleiben in [Auto-paint](auto-paint#printable-detail). Eine Warnung bedeutet nicht, dass ein Detail entfernt wird oder nicht druckbar ist.

### Schichthöhen und gültige Grenzen

Bei einer **ersten Schicht von 0,20 mm** und **regulären Schichten von 0,08 mm** liegen die Schichtoberseiten bei 0,20, 0,28, 0,36 und 0,44 mm. Sie liegen nicht bei 0,08, 0,16, 0,24 und 0,32 mm. Kromacut gleicht die Farbdicken an dieses Raster an.

Eine Änderung der **Schichthöhe** setzt manuelle Dicken auf den neuen regulären Schritt zurück und wendet dann den Mindestwert der ersten Farbe an. Eine Änderung der **Höhe der ersten Schicht** setzt die erste Farbe auf ihren neuen Mindestwert. Lege diese Werte vor der Feinabstimmung der Regler fest und prüfe den Plan bei späteren Änderungen erneut.

Die Felder erlauben breite Anwendungsbereiche: 0,01–10 mm/Pixel für die Pixelgröße, 0,01–10 mm für die Schichthöhe und 0–10 mm für die Höhe der ersten Schicht. Das sind Eingabegrenzen, keine Druckempfehlungen. Die erste Farbe wird weiterhin an ihren physischen Mindestwert angepasst. Nutze Werte, die Düse, Material und Slicer unterstützen. Eine feinere Schichthöhe verändert die verfügbaren Auto-paint-Rezepte, macht eine vorhandene Kalibrierung aber nicht automatisch kompatibel.

## Manueller Modus

**Farbschichthöhen** listet die nichttransparenten **Bildfarben** auf. Jede Zeile hat einen Ziehgriff, ein Farbfeld, einen Dickenregler und eine Millimeteranzeige. Der Wert ist die Dicke des Farbabschnitts, nicht dessen absolute Oberhöhe. Ein Abschnitt kann mehrere Slicer-Schichten umfassen.

![Drei manuelle Farbabschnitte ergeben aufsummierte Höhen; ein dickerer unterer Abschnitt hebt jede spätere Oberfläche an.](11_manual_layers.svg)

_Schematischer Querschnitt. Unter einer späteren Farboberfläche liegen die früheren Abschnitte._

Setze beispielsweise Schwarz auf **0,20 mm**, Rot auf **0,16 mm** und Weiß auf **0,08 mm**, bei regulären Schichten von 0,08 mm. Schwarze Bereiche enden bei 0,20 mm, rote bei 0,36 mm und weiße bei 0,44 mm. Rot beginnt auf Slicer-Schicht 2, Weiß auf Schicht 4. Prüfe vor dem Druck die erzeugten Anweisungen und ihre Interpretation im Slicer.

### Farben umordnen

Ziehe die Zeilen von oben nach unten in Druckreihenfolge. Die oberste Zeile beginnt auf der Druckplatte. Spätere Zeilen werden nur dort auf frühere gedruckt, wo das Bild sie benötigt; so entsteht das Stufenrelief. Eine verschobene Farbe erhält einen anderen Materialuntergrund, eine andere Oberflächenhöhe und eine andere Wechselfolge. Eine an die erste Stelle verschobene Zeile wird bei Bedarf auf das Minimum der ersten Schicht angehoben.

Manuelle Vorschau und Export verwenden Bildfarben, nicht das HD-Modell von Auto-paint. Dünnes Rot über Schwarz kann dunkler gedruckt werden als sein Farbfeld, auch wenn die manuelle Vorschau rot aussieht. Wähle Materialien und Dicken entsprechend.

### Dicken anpassen und zurücksetzen

Ziehe einen Regler und lasse ihn zum Übernehmen los. Spätere Abschnitte werden in Schritten der **Schichthöhe** verändert. Der erste beginnt bei seinem Mindestwert und addiert reguläre Schritte. Ein dickerer unterer Abschnitt hebt alle späteren Oberflächen an und verschiebt ihre Wechsel, nicht nur Bereiche, in denen die untere Farbe sichtbar bleibt.

Das Zurücksetzen von **Farbschichthöhen** sortiert nach Helligkeit von dunkel nach hell und weist Mindestdicken zu. Das unterscheidet sich vom Zurücksetzen der **3D-Druckeinstellungen**, das auch physische Druckparameter ändert, aber die Reihenfolge erhält.

Manuelle Steuerung und Wechselanweisungen unterstützen **64 Farben**. Reduziere größere Paletten in 2D. Vollständig transparente Pixel erzeugen kein Material, auch keinen weißen Untergrund. Unverbundene undurchsichtige Inseln bleiben separate Teile, sofern das Bild sie nicht verbindet.

## Glatte Vernetzung

Ohne Glättung folgen die Konturen dem quadratischen Pixelraster. Mit Glättung werden verbundene Grenzen zu geglätteter, verschweißter Geometrie. Dieser Unterschied wird exportiert; es ist kein Vorschaufilter.

Glättet Modellkonturen in Vorschau und Exporten. Mittel entspricht der bisherigen Glättung. Zum Anwenden neu erstellen.

| Stärke | Verwendung |
| --- | --- |
| **Keine** | Pixel-Art, exakte Rasterkanten oder schnellste Erstellung. |
| **Minimal** | Leichte Glättung gezackter Ecken. |
| **Mittel** | Das vertraute Ergebnis der bisherigen aktivierten Einstellung. |
| **Stark** | Stärkere Glättung entlang der Konturen bei gleicher Bewegungsgrenze und ohne zusätzliche Durchläufe. |

Die Bewegung bleibt unter einem halben Pixel. Modell neu erstellen und Slicer-Vorschau prüfen. Bisherige Ein/Aus-Einstellungen werden zu Mittel/Keine.

![Pixelgestufte und geglättete diagonale Konturen im Vergleich über demselben Quellraster.](12_smooth_boundaries.svg)

_Schematischer Konturvergleich, keine Slicer-Simulation._

Nutze die Funktion für gekrümmte oder diagonale Konturen, die zu treppenförmig wirken. Lass sie bei absichtlicher Pixelkunst oder exakten Rasterkanten ausgeschaltet. Keine der beiden Optionen repariert unbedruckbar kleine Details oder erfindet fehlende Quellauflösung.

Während [Flat Paint](flat-paint) ist die glatte Vernetzung inaktiv. Ihr Aktivieren deaktiviert Flat Paint; Flat Paint verwendet stattdessen seine Plattenkonstruktion über der gesamten Grundfläche.

## Auto-paint

Auto-paint nimmt echte Filamentfarben und **Deckdistanzen (HD)** entgegen, sagt Mischfarben voraus und ordnet Bildfarben druckbaren Höhen zu. [Auto-paint-Steuerung](auto-paint) erklärt sämtliche Einstellungen für Filamente, Abstimmung, Details und Zuverlässigkeit.

## Filament-Deckdistanz kalibrieren

**Kalibrieren** unter der Filamentliste öffnet **Deckdistanz**, **Palette Proof** und **Stack Matrix**. Die [Kalibrierabläufe](calibration-workflows) erklären Druck und Ergebniserfassung, die [Kalibrierungstheorie](calibration-theory) das optische Modell.

## Filamentprofile

Profile speichern benannte Filamentsets und kompatible Daten. Ungespeicherte Änderungen werden nicht automatisch ins ausgewählte Profil zurückgeschrieben. Siehe [Filamente und Profile](auto-paint#filament-profiles) und [Profildateien](settings-and-controls#filament-profile-files).

### Vorlagen

Vorlagen sind schreibgeschützte Hersteller-Referenzsets, keine Messungen deiner Spulen. Lade eine Vorlage, passe sie an, kalibriere und wähle **Als neues Profil speichern**. Siehe [Vorlagen](auto-paint#templates).

## Maximale Höhe

Die Grenze verkürzt Auto-paint-Übergänge entlang gültiger Schichtgrenzen, kann aber die deckende Grundlage nicht entfernen. Lies [Maximale Höhe](auto-paint#max-height), einschließlich des Hinweises zum Flat-Paint-Träger.

## Druckbare Details

Stelle **Effektive Linienbreite** unter **3D-Druckeinstellungen** ein und nutze anschließend **Vorschau öffnen** in Auto-paint, um schmale Quellfarbbereiche zu prüfen. **Isolierte Farbpunkte auslassen** ersetzt optional Farben, die nur in winzigen eingeschlossenen Punkten vorkommen, erhält dabei aber dünne Linien und verbundene Details. Warnungen und tatsächlich ausgelassene Pixel werden getrennt gezählt. Siehe [Druckbare Details](auto-paint#printable-detail).

## Verbesserte Farbabstimmung

Suche Materialreihenfolgen mit Wiederholungen, Anforderungen an eigenständige Farben oder räumlichem Höhen-Dithering. Dabei stehen Farbabdeckung, Dicke, Wechsel und Rechenaufwand im Wettbewerb. Siehe [Verbesserte Farbabstimmung](auto-paint#enhanced-color-matching).

## Flat Paint

Erzeuge eine Mehrmaterialplatte statt eines Stufenreliefs, entweder mit Bildseite unten und transparentem Träger oder trägerlos mit Bildseite oben. Lies vor dem Export [Flat Paint](flat-paint), da Betrachtungsrichtung und Objektzuweisungen wichtig sind.

## Optimierungseinstellungen

**Algorithmus**, **Bereichspriorität**, **Übergangsdetail** und **Startwert** steuern die Farbabstimmung, nicht die Druckgeschwindigkeit. Siehe [Optimierungseinstellungen](auto-paint#optimizer-settings).

## Übergangszonen und Zuverlässigkeit

Zonen beschreiben physische Abschnitte. Zuverlässigkeit beschreibt Datenlage und Modellgrenzen, nicht gemessene Druckgenauigkeit. Siehe [Das Ergebnis lesen](auto-paint#transition-zones-and-confidence).

## Palette Proof

Vergleiche eine gedruckte Probe mit ausgewählten Bildfarben und erfasse, welche Kandidaten passen. Siehe [Kalibrierabläufe](calibration-workflows#palette-proof-compare-artwork-colors).

## Stack Matrix

Fotografiere eine gespeicherte Rezepttafel, prüfe ihre Ausrichtung und speichere gemessene Farben für kompatible Stapel. Siehe [Kalibrierabläufe](calibration-workflows#stack-matrix-photograph-known-recipes).

## Vorschausteuerung

Ziehe mit der primären Maustaste zum Drehen, nutze das Mausrad zum Zoomen und ziehe mit der sekundären Taste zum Verschieben. Kamerabewegungen verändern niemals physische Abmessungen.

| Werkzeugleistenfunktion | Verwendung | Auswirkung auf den Druck |
| ------------------ | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| **Farbtreu** | Ausgewählte Farbfelder ohne Szenenbeleuchtung oder filmische Tonwertabbildung vergleichen. | Nur Vorschau. Hängt weiterhin von Modell und Bildschirm ab; keine Kalibrierungsbestätigung. |
| **Schattiert** | Beleuchtetes Relief und Form prüfen. | Nur Vorschau; Beleuchtung verändert den Farbeindruck. |
| **Transparent** | Überlappende Schichten sehen. | Nur Vorschau; macht kein Filament transparent. |
| **Drahtmodell** | Nach Schichten gefärbte Detailkanten prüfen. | Nur Vorschau, keine Extrusionsbahnen. |
| **Vorschaufarben** | Zwischen simulierten Auto-paint-Mischungen und physischen Filamentfarben wechseln. | Nur Vorschau. Exporte behalten echte Materialzuweisungen. |
| **Kamera umschalten** | Perspektivische Tiefe oder orthografische Ausrichtung ohne perspektivische Verkürzung. | Nur Vorschau. Die Kameraposition bleibt erhalten. |
| **Rückgängig / Wiederholen** | Den gemeinsamen Bildbearbeitungsverlauf durchlaufen. | Kein Rückgängig-Verlauf für 3D-Felder oder Filamentänderungen. Nach Bildänderungen neu erstellen. |
| **Herunterladen** | Die erstellte STL oder 3MF exportieren. | Verwendet das zuletzt erstellte Modell, nicht noch nicht übernommene Seitenleisteneinstellungen. |

Ansichtsmodus und Auswahl simuliert/physisch werden gespeichert. **Vorschaufarben** erscheint nur für ein erstelltes Auto-paint-Modell.

## Schichtvorschau

Ziehe die unteren und oberen Griffe der unteren Leiste, um einen Höhenbereich einzeln zu betrachten. Positionen rasten am Schichtraster ein. Fahre über Materialsegmente, um Start- oder Wechselinformationen zu sehen.

![Begrenzungsgriffe blenden Schichten zur Prüfung aus; der Export enthält weiterhin das vollständige Modell.](19_preview_only.svg)

_Schematische Darstellung. Das Ausblenden einer Schicht am Bildschirm löscht sie niemals aus dem Export._

Flat Paint hat eine einfarbige Reglerbahn, weil mehrere Materialien in derselben Druckschicht liegen können. Drehe die Standardanordnung mit Bildseite unten von unten in die Ansicht, um ihr Motiv zu sehen.

Eine fehlgeschlagene Auto-paint-Berechnung kann das vorherige erfolgreich erstellte Modell sichtbar lassen. Betrachte es nicht als Beleg, dass die neuen Einstellungen funktioniert haben. Falls ein erstellter Modellstand existiert, verwenden die Druckanweisungen diesen. Behebe den Fehler, erstelle das Modell erneut, prüfe es und exportiere anschließend.

Weiter: [Auto-paint-Steuerung](auto-paint), [Flat Paint](flat-paint) oder [Ergebnisse erzeugen und exportieren](generating-exporting-output).
