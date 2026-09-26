---
title: Ergebnisse erzeugen und exportieren
slug: generating-exporting-output
order: 70
description: Modell erstellen, prüfen, Dateien exportieren und Druckanweisungen kopieren.
---

# Ergebnisse erzeugen und exportieren

Der Exportablauf beginnt, sobald das 2D-Bild und die 3D-Einstellungen fertig vorbereitet sind.

![Bild und Einstellungen vorbereiten, einen Modellstand erstellen, prüfen und anschließend den vollständigen Stapel exportieren. Geänderte Einstellungen erfordern eine neue Erstellung; eine begrenzte Vorschau begrenzt den Export nicht.](40_build_export_snapshot.svg)

## Vor dem Export

Prüfe folgende Punkte:

1. Reduziere das Bild im 2D-Modus auf eine praktikable Anzahl von Farben.
2. Lege unter **3D-Druckeinstellungen** die physischen Abmessungen mit **Pixelgröße (XY)** fest. Gleiche **Schichthöhe** und **Höhe der ersten Schicht** mit deinem Slicer ab. Setze **Effektive Linienbreite** auf die geplante Extrusionsbreite für die Prüfung druckbarer Details und das Höhen-Dithering in Auto-paint.
3. Wähle **Manuell** oder **Auto-paint**.
4. Klicke auf **3D-Modell erstellen**.
5. Prüfe das Modell und die **Schichtvorschau**.

Zeigt Kromacut eine **Leistungswarnung**, kann die Erstellung wegen Bildgröße, Pixelanzahl, Schichtanzahl oder ähnlicher Last langsam sein. Du kannst mit **Trotzdem erstellen** fortfahren oder abbrechen und den Auftrag vereinfachen.

## 3D-Modell erstellen

Klicke auf **3D-Modell erstellen**, wenn Vorschau und Exportgeometrie die aktuellen 3D-Einstellungen widerspiegeln sollen.

Während der Erstellung zeigt Kromacut Fortschritte wie das Einlesen von Bildfarbschichten, Zuordnen von Bildfarben oder Erstellen von Farbschichten. Die Exportfunktionen sind wieder sinnvoll nutzbar, sobald die Fortschrittsanzeige verschwindet und das aktualisierte Modell geprüft werden kann.

Ein neu berechneter Auto-paint-Stapel ist nicht dasselbe wie ein neu erstelltes Netz. Der Export verwendet das zuletzt erstellte Modell; die Druckanweisungen bleiben an diesen Modellstand gebunden. Warte nach Bildänderungen, Profilwechseln, gespeicherter Kalibrierung oder geänderten Druckeinstellungen auf die aktuelle Berechnung und erstelle das Modell vor dem Export erneut. Eine ältere Vorschau kann sichtbar bleiben, während neue Einstellungen berechnet oder verworfen werden. Ihre Anzeige beweist nicht, dass die neuen Einstellungen erfolgreich waren.

## STL oder 3MF wählen

Öffne das 3D-Downloadmenü und wähle:

| Format | Geeignet, wenn |
| ------ | ------------------------------------------------------------------------------------------ |
| STL | Du ein breit unterstütztes Modell mit einer einzigen Geometrie möchtest und Filamentwechsel manuell behandelst. |
| 3MF | Du eine farbfähige Ausgabe für Slicer möchtest, die mehrere farbige Objekte erhalten können. |

Der 3MF-Export erhält in Auto-paint möglichst die tatsächlichen Filamentfarben. Prüfe vor dem Drucken trotzdem die Zuweisungen im Slicer.

Eine Auto-paint-Vorschau kann Dutzende Mischfarben aus nur wenigen tatsächlichen Spulen zeigen. Die 3MF-Datei weist den physischen Schichten diese echten Filamente zu, nicht je ein Material pro vorhergesagter Mischung. Deshalb kann die normale Filamentfarbansicht eines Slicers anders aussehen als Kromacuts Ansicht **Simuliert**, ohne dass Materialzuweisungen falsch sind. Vergleiche zur Kontrolle der Zuweisungen mit den **physischen** Farben.

STL enthält keine Filamentfarben oder automatischen Spulenzuweisungen. Verwende den kopierten Wechselplan mit den Farbwechselfunktionen des Slicers. Auch eine 3MF-Datei ist weiterhin ein Modell und kein direkt ausführbarer G-Code: Wähle Drucker, Düse, Filamentprofile, Temperaturen und Geschwindigkeiten selbst und slice das Modell anschließend.

Bei **Flat Paint** bietet das Downloadmenü nur 3MF an: Das Modell enthält je ein Objekt pro tatsächlichem Filament sowie in der Standardanordnung mit Bildseite unten ein transparentes Trägerobjekt. Die optionale Anordnung mit Bildseite oben lässt diesen Träger weg. Eine farblose STL mit nur einer Geometrie wäre bei beiden flachen Platten nutzlos. Flat Paint deaktiviert **Glatte Vernetzung**, da die flache Plattenanordnung keine geglätteten Grenzkonturen verwendet.

## Druckanweisungen

Der Bereich **Druckanweisungen** enthält:

- Empfohlene Wandschleifen, Füllung, Schichthöhe und Höhe der ersten Schicht.
- **Mit Farbe beginnen**.
- Einen **Farbwechselplan** mit Schichtnummern und ungefähren Höhen.
- Eine Schaltfläche **Kopieren** für den vollständigen Plan als Klartext.

Nutze den kopierten Plan neben der Slicer-Vorschau. Die Schichtnummern hängen von **Schichthöhe** und **Höhe der ersten Schicht** ab; halte diese Werte daher konsistent.

![Eine erste Schicht von 0,10 mm, gefolgt von 0,04-mm-Schichten. Ein Wechsel vor Schicht 4 liegt an einer Materialgrenze von 0,18 mm, während die neue Schicht bei 0,22 mm endet.](41_swap_layers.svg)

**Wechsel bei Schicht N** bedeutet, dass das neue Filament Schicht N druckt. Bei einer ersten Schicht von 0,10 mm und regulären Schichten von 0,04 mm enden die Schichten 1, 2 und 3 beispielsweise bei 0,10, 0,14 und 0,18 mm. Soll das nächste Filament mit Schicht 4 beginnen, wechsle es nach Schicht 3 und vor der Extrusion von Schicht 4. Diese neue Schicht endet bei 0,22 mm.

Die ungefähre Höhenangabe im Plan erfordert Aufmerksamkeit: Der manuelle Ablauf zeigt die obere Z-Höhe der neuen Schicht, Auto-paint dagegen die Materialwechselgrenze. Verwende die Schichtnummer und prüfe den tatsächlichen geslicten Materialübergang, nicht nur eine scheinbar passende Z-Zahl. Slicer können die ausgewählte Schicht und den Einfügepunkt unterschiedlich beschriften.

Im Flat-Paint-Modus gibt es keinen manuellen Wechselplan. Der Bereich fasst stattdessen den gewählten Mehrmaterialablauf zusammen: Weise jedes 3MF-Objekt seinem Filament zu. Nutze dann entweder transparentes Filament und drehe den standardmäßigen Druck mit Bildseite unten um, oder drucke die trägerlose Anordnung mit Bildseite oben. Keine der beiden Anordnungen darf im Slicer gespiegelt werden.

## Empfohlene Slicer-Einstellungen

Kromacut empfiehlt:

- Wandschleifen: `1`
- Füllung: `100%`
- Schichthöhe: der unter **Druckanweisungen** angegebene Wert
- Höhe der ersten Schicht: der unter **Druckanweisungen** angegebene Wert

Prüfe vor dem Drucken immer die Slicer-Vorschau. Höhen sind Näherungswerte, und Slicer können Schichtwechsel je nach Einstellung der ersten Schicht unterschiedlich darstellen.

Lass den Export bei **100 % Z-Skalierung** und verwende eine konstante Schichthöhe passend zum Modell. Eine veränderte Z-Skalierung oder variable Schichthöhen verschieben die physischen Übergänge und machen den kopierten Plan ungültig. Benötigst du eine andere Schichthöhe, stelle sie in Kromacut ein und erstelle das Modell neu. Auch eine XY-Skalierung verändert druckbare Details im Verhältnis zur Düse. Stelle die gewünschte Größe in Kromacut ein, damit die Linienbreitenprüfung diese Größe verwendet.

Prüfe kleine Inseln, Schrift, getrennte transparente Aussparungen, Grundschichten sowie Spül- und Priming-Anordnung im Slicer. Geglättete Konturen machen nicht jeden schmalen Strich druckbar. Die App kalibriert weder Fluss, Rückzug, Temperatur noch den mechanischen Aufbau deines Druckers.

## Speichern und Abbrechen

Die Desktop-App öffnet für Dateiexporte einen Dialog **Speichern unter**. Im Browser gelten dessen Download-Einstellungen; ob nach einem Speicherort gefragt wird, hängt also vom Browser ab. Das Abbrechen eines Dateidialogs sendet nichts an den Drucker. Während des Exports können das Schreiben der Geometrie und die Archivkomprimierung Zeit beanspruchen. Warte vor dem Schließen der App, bis das Speichern abgeschlossen ist.

## Exporttipps

- Erstelle das Modell nach geänderten 3D-Einstellungen neu.
- Verlasse dich nicht allein auf die Begrenzung der sichtbaren Schichtvorschau; der Export enthält das vollständige Modell.
- Ist das Netz zum Erstellen oder Slicen zu aufwendig, schneide die Quelle in 2D zu oder verringere ihre Auflösung und reduziere unnötige Farbbereiche. Eine größere **Pixelgröße (XY)** vergrößert dieselben Pixel; sie verringert weder deren Anzahl noch vereinfacht sie das Netz.
- Sind Wechselanweisungen wegen zu vieler Farben deaktiviert, gehe zurück zu [Farben reduzieren](reducing-colors#image-colors).

Weiter: [Einstellungen und Steuerung](settings-and-controls).
