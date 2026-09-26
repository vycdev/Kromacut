---
title: Häufige Fragen
slug: faq
order: 100
description: Kurze Antworten auf häufige Fragen zu Kromacut.
---

# Häufige Fragen

## Was ist die Deckdistanz?

Die Deckdistanz, kurz **HD** (Hiding Distance), ist der Deckkraftparameter in Millimetern für die Betrachtung unter Auflicht. Auto-paint schätzt damit das Aussehen gestapelter Filamentschichten. Bei einer Dicke von einer HD lässt das Grundmodell noch 10 % des Einflusses der darunterliegenden Farbe übrig. Ab wann du keinen Unterschied mehr erkennst, hängt zusätzlich vom Filament, der Grundfarbe und den Betrachtungsbedingungen ab.

Eine geringere HD bedeutet ein deckenderes Filament, das mit weniger Schichten abdeckt. Eine höhere HD bedeutet ein durchscheinenderes Filament, das mehr Dicke benötigt.

HD ersetzt die in früheren Versionen angezeigte Transmission Distance (TD). Einen herkömmlichen TD-Wert für hinterleuchtete Lithophanien kannst du über die Umrechnen-Schaltfläche einer Filamentzeile eingeben. Kromacut multipliziert ihn mit 0,1, um eine anfängliche HD-Schätzung zu erhalten. Diese Umrechnung ist keine neue physische Messung. Siehe [Kalibrierabläufe](calibration-workflows).

## Sollte ich Manuell oder Auto-paint verwenden?

Nutze **Manuell**, wenn du Farbreihenfolge und Schichthöhen direkt gestalterisch steuern möchtest.

Nutze **Auto-paint**, wenn dir tatsächliche Filamentfarben und Deckdistanzen vorliegen und Kromacut den Stapel automatisch planen soll.

## Muss ich Filamente kalibrieren?

Du kannst mit geschätzten Deckdistanzen beginnen. Veröffentlichte Transmission-Distance-Werte genau deines Filaments können ebenfalls einen Ausgangspunkt liefern. Gib sie über die Umrechnen-Schaltfläche ein, nicht direkt ins HD-Feld.

Eine Kalibrierung verbessert Auto-paint-Ergebnisse meist, insbesondere wenn keine veröffentlichten Werte vorliegen oder das Ergebnis weiterhin falsch aussieht. Sie ist besonders hilfreich, wenn:

- Ein Filament durchscheinend ist.
- Zwei Filamente ähnlich aussehen.
- Du projektübergreifend wiederholbare Ergebnisse möchtest.

## Was unterscheidet Palettenfarben von Filamentfarben?

Palettenfarben sind die Bildfarben im 2D-Modus und im manuellen Modus.

Filamentfarben stehen für die physischen Materialien von Auto-paint. Auto-paint kann aus dem physischen Filamentstapel virtuelle Schichtfarben berechnen. Der exportierte Druckplan basiert aber weiterhin auf echten Filamenten.

## Warum braucht die 3D-Vorschau eine Erstellen-Schaltfläche?

Die 3D-Erzeugung kann aufwendig sein. Kromacut wartet auf **3D-Modell erstellen**, damit das Ändern einer Einstellung nicht immer wieder rechenintensive Arbeit startet und abbricht.

## Kann ich ohne 3D-Modus exportieren?

Im 2D-Modus kannst du das aktuelle Quellbild einschließlich übernommener Änderungen herunterladen. Übernimm laufende Bildanpassungen vorher mit **Anwenden**. Zum Erstellen und Exportieren von STL- oder 3MF-Modellen dient der 3D-Modus.

## Ändert die Schichtvorschau den Export?

Nein. Der Bereich **Schichtvorschau** beeinflusst nur, was in der Vorschau sichtbar ist. STL- und 3MF-Exporte enthalten das vollständig erzeugte Modell.

## Welche Datei sollte ich drucken?

Wähle **STL herunterladen** für breite Slicer-Kompatibilität und manuelle Filamentwechsel.

Wähle **3MF herunterladen**, wenn dein Slicer farbfähige 3MF-Dateien unterstützt und du die farbigen Schichtobjekte erhalten möchtest.

## Warum sind Höhen Näherungswerte?

Schichtnummern hängen vom Verhalten des Slicers ab, insbesondere von der Höhe der ersten Schicht. Verwende die Angaben unter **Druckanweisungen** und bestätige anschließend die endgültigen Wechselschichten in der Slicer-Vorschau.

## Kann ich meine Einstellungen teilen?

Ja. Exportiere eigene 2D-Paletten als `.kpal` und Auto-paint-Filamentprofile als `.kfil`. Ältere Filamentprofile im Format `.kapp` lassen sich weiterhin importieren.

## Ersetzt eine kleinere Pixelgröße eine kleinere Düse?

Nein. Die Pixelgröße bestimmt die physische Größe der Bildpixel. Dadurch kann ein Strich schmaler werden als die Extrusionsbahn, die deine Düse erzeugen kann. Stelle **Effektive Linienbreite** unter **3D-Druckeinstellungen** ein, nutze die Vorschau druckbarer Details in Auto-paint und prüfe das geslicte Ergebnis. Siehe [3D-Modus](3d-mode).

## Gilt meine Kalibrierung auch bei einer anderen Schichthöhe?

Gehe nicht automatisch davon aus. HD-Messungen und Erscheinungsdaten haben unterschiedliche Aufgaben. Proof- und Matrix-Daten werden auf die Einstellungen und Filamente geprüft, mit denen sie erfasst wurden. Prüfe nach einem Wechsel der Schichthöhe die aktiven Daten und drucke eine kleine Validierungsprobe. Siehe [Kalibrierabläufe](calibration-workflows).

## Warum gibt es mehr Vorschaufarben als Spulen?

Dünne Schichten lassen darunterliegendes Filament auf die sichtbare Farbe einwirken. Unterschiedliche Dicken derselben Spulenreihenfolge erzeugen unterschiedliche vorhergesagte Mischfarben. Auto-paint wählt aus diesen erreichbaren Stapelpräfixen, während die exportierten Teile weiterhin die tatsächlichen Filamente verwenden. Siehe [Auto-paint](auto-paint).
