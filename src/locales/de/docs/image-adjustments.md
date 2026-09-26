---
title: Bildanpassungen
slug: image-adjustments
order: 35
description: Alle Ton- und Farbregler, ihr Einfluss auf Zielfarben und wann die Vorschau ins Bild übernommen werden sollte.
---

# Bildanpassungen

Bildanpassungen verändern das Zielbild vor der Farbreduktion. Sie kalibrieren kein Filament, ändern keine Deckdistanz und garantieren nicht, dass eine angezeigte Farbe physisch druckbar ist.

Bewege einen Regler, um seine Wirkung zu sehen; die Vorschau aktualisiert sich nach dem Beenden der Bedienung. Alle Regler beginnen bei null. Einzelne Rücksetz-Pfeile setzen einen Regler zurück, die Rücksetzfunktion des Bereichs alle Regler.

## Ton- und Farbregler

![Schematische negative, neutrale und positive Beispiele für alle zwölf Bildanpassungen.](32_adjustment_controls.svg)

_Gezeigt werden schematische Wirkungsrichtungen, keine kalibrierten Druckvorhersagen. Die Effekte hängen von der Quelle und anderen aktiven Anpassungen ab._

### Tonwerte

| Regler | Bereich | Negative Werte | Positive Werte | Bedeutung für die Druckvorbereitung |
| ---------- | ------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Belichtung | −3 bis +3 Blendenstufen, Schritt 0,01 | RGB-Werte abdunkeln. | Aufhellen; +1 verdoppelt die Kanalwerte bis zur Begrenzung. | Verschiebt großflächige Zieltonwerte. Diese Anpassung des gerenderten Bildes kann abgeschnittene RAW-Informationen nicht wiederherstellen. |
| Kontrast | −100 % bis +100 % | Tonwerte zu Mittelgrau ziehen. −100 % ergibt vor weiteren Anpassungen Mittelgrau. | Tonwerte von Mittelgrau wegschieben, mit Begrenzung bei Schwarz und Weiß. | Trennt große Bereiche, kann aber feine Schatten- und Lichtabstufungen einebnen. |
| Lichter | −100 % bis +100 % | Helle Bereiche abdunkeln. | Helle Bereiche aufhellen. | Ändert helle Tonwerte, die um Palettenplätze konkurrieren; fehlende Details lassen sich nicht zurückholen. |
| Tiefen | −100 % bis +100 % | Schattenbereiche abdunkeln. | Schattenbereiche aufhellen. | Kann vorhandene dunkle Unterschiede vor der Reduktion sichtbar machen. |
| Weiß | −100 % bis +100 % | Den hellsten Bereich abdunkeln. | Den hellsten Bereich aufhellen. | Trennt oder verbindet nahezu weiße Zielfarben. Keine Weißabgleichseinstellung. |
| Schwarz | −100 % bis +100 % | Den dunkelsten Bereich abdunkeln. | Den dunkelsten Bereich aufhellen. | Ändert nahezu schwarze Zielfarben; reines Schwarz bleibt wegen der Skalierung der Werte schwarz. |

Lichter und Tiefen wirken auf breitere Bereiche als Weiß und Schwarz. Die Bereiche überlappen sich: Ein sehr dunkler Pixel kann sowohl auf Schwarz als auch auf Tiefen reagieren. Die Tonwertbereiche werden nach Belichtung, Kontrast, Temperatur/Tönung und den HSL-Anpassungen ausgewertet; die Regler können sich daher gegenseitig beeinflussen.

### Farbe und lokale Details

| Regler | Bereich | Negative Werte | Positive Werte | Bedeutung für die Druckvorbereitung |
| ----------- | -------------- | -------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Sättigung | −100 % bis +100 % | Intensität verringern; −100 % entsättigt. | Intensität erhöhen. | Ändert Unterschiede zwischen Bildfarben, nicht den physischen Farbumfang der Filamente. |
| Dynamik | −100 % bis +100 % | Die Sättigung vergleichsweise ungesättigter Farben stärker verringern. | Die Sättigung vergleichsweise ungesättigter Farben stärker erhöhen. | Weniger gleichmäßig als Sättigung, berücksichtigt aber keine Hauttöne. Reines Grau bleibt grau. |
| Farbton | −180° bis +180° | Farbtöne in eine Richtung drehen. | In die andere Richtung drehen. | Färbt das gesamte Bild um; zum Ändern einer exakten Farbe ein Farbfeld bearbeiten. |
| Temperatur | −100 bis +100 | Kühler: weniger Rot, mehr Blau. | Wärmer: mehr Rot, weniger Blau. | Eine angenäherte Farbstichkorrektur, **keine Kelvin-Angabe**. |
| Tönung | −100 bis +100 | Grün hinzufügen. | Magenta hinzufügen, Rot/Blau erhöhen und Grün verringern. | Korrigiert oder erzeugt einen Farbstich; kein gemessenes Kameraprofil. |
| Klarheit | −100 bis +100 | Lokalen Kontrast abschwächen. | Lokalen Kontrast und Kanten betonen. | Kann Kantenfarben oder Halos erzeugen, die quantisiert werden müssen. Stellt keine Details wieder her und verbreitert keine dünnen Linien. |

Außer Belichtung und Farbton verwenden die Regler ganzzahlige Schritte. Alpha bleibt unverändert. Bei der Quantisierung ist das Alpha-Verhalten anders: Teiltransparente Pixel werden vollständig undurchsichtig.

## Vorschau und Anwenden

![Eine laufende Vorschau zweigt vom Quellbild ab. Anwenden übernimmt dieses Aussehen und setzt die Regler zurück; Quantisierung, PNG-Export und 3D verwenden danach die übernommenen Pixel.](33_adjustment_bake.svg)

**Anwenden** übernimmt das aktuelle Aussehen fest in das zugrunde liegende Bild, setzt die Regler auf null und erzeugt einen Schritt im Bildverlauf. Dabei werden keine Farben reduziert, kein Modell erstellt und keine Druckeinstellungen verändert.

Die Unterscheidung ist wichtig:

- **Farbquantisierung, Bild skalieren, Bild herunterladen und 3D-Erzeugung verwenden das zugrunde liegende Arbeitsbild**, nicht die noch nicht übernommenen Vorschauanpassungen.
- **Bildfarben** beschreibt die zugrunde liegenden Pixel; die Farbfelder folgen daher nicht den laufenden Anpassungen.
- Retuschierwerkzeuge bearbeiten das zugrunde liegende Bild; aktive Anpassungen wirken anschließend erneut darauf.
- Die Rasterglättung liest das angepasste Bild. Übernimm die Anpassungen vorher, damit sie nicht zusätzlich auf das verarbeitete Ergebnis wirken.

Der verlässliche Ablauf lautet **Anpassungen vorprüfen → Anpassungen anwenden → quantisieren → prüfen/bereinigen → 3D erstellen**. Schneide das Bild nach Möglichkeit vorher zu und skaliere es vorher.

## Zurücksetzen und Rückgängig sind verschieden

Zurücksetzen entfernt eine laufende Anpassung, keine bereits ins Bild übernommene Änderung. Nach Anwenden stehen die Regler erwartungsgemäß auf null, weil ihre vorherige Wirkung jetzt im Bild steckt. Verwende **Rückgängig**, um das frühere Bild wiederherzustellen.

Wiederholtes Anwenden wirkt auf das bereits bearbeitete Bild. Dadurch können sich abgeschnittene Werte und verlorene Tonwertdetails summieren. Mache die Änderung zuerst rückgängig, wenn du Alternativen vergleichen möchtest.

Weiter: [Farben reduzieren](reducing-colors).
