---
title: Einstellungen und Steuerung
slug: settings-and-controls
order: 80
description: Kopfzeilenaktionen, Designs, Speicherung, Paletten, Profile und Arbeitsbereichssteuerung.
---

# Einstellungen und Steuerung

Diese Seite sammelt Funktionen, die die gesamte App betreffen oder leicht übersehen werden.

## Steuerelemente der Kopfzeile

| Steuerelement | Funktion |
| ------------- | ------------------------------------------------------------------------------ |
| Kromacut-Logo | Kehrt bei geöffneter Dokumentation zur App zurück; öffnet sonst die Startseite. |
| Einstellungen | Öffnet den Einstellungsdialog mit Sprache, Darstellung, Ressourcen und Update-Funktionen. |

Die Darstellungsauswahl bietet **System**, **Dunkel** und **Hell**. **System** folgt dem Farbschema des Betriebssystems oder Browsers und aktualisiert sich, wenn diese Vorgabe geändert wird. Die Auswahl wird für spätere Sitzungen gespeichert.

Die Auswahl **Sprache** ändert Oberfläche, Dokumentation, Diagramme und öffentliche Seiten. Wähle **Systemsprache**, um einer unterstützten Browser- oder Betriebssystemsprache zu folgen, oder wähle Englisch, Französisch, Deutsch, Italienisch, Rumänisch, Spanisch, Japanisch, vereinfachtes Chinesisch, Hindi, europäisches Portugiesisch, Ukrainisch oder Bengalisch. Die Auswahl wird lokal gespeichert und verändert weder Motiv, Filamentprofile, Druckeinstellungen noch erzeugte Geometrie. Übersetzungen und Schriften sind in der Desktop-App enthalten; kein Online-Übersetzungsdienst erhält deine Arbeit.

Auch öffentliche Seiten bieten eine Sprachauswahl. Übersetzte Dokumentation verwendet teilbare Links mit Sprachpräfix, etwa `/ro/docs/overview`. Seitennamen und Abschnittsanker bleiben über die Sprachen hinweg stabil. Dateiendungen, numerische Modelldaten, selbst eingegebene Namen und Originaltitel von Community-Kunstwerken werden nicht übersetzt.

Der Einstellungsdialog enthält Links zur Dokumentation, zu Discord, Reddit, GitHub und Patreon und zeigt die aktuelle Kromacut-Version.

## Arbeitsbereichsmodi

Mit **2D** und **3D** wechselst du zwischen Bildvorbereitung und Modellerzeugung.

Die vertikale Trennlinie zwischen Steuerbereich und Vorschau lässt sich ziehen. Verbreitere den linken Bereich für detaillierte Einstellungen oder die Vorschau zum Untersuchen von Bild oder Modell.

Dokumentationsseiten verwenden teilbare `/docs/...`-Links. Ein solcher Link öffnet direkt die passende Anleitung.

Klappe auf kleineren Bildschirmen **Inhalt** auf, um eine Anleitung zu wählen, oder **Auf dieser Seite**, um zu einem Abschnitt zu springen. Beide schließen sich nach der Auswahl, damit mehr Platz zum Lesen bleibt. Abbildungen lassen sich durch Anklicken oder durch Fokussieren ihres Links und Drücken von Enter in voller Größe öffnen.

Die meisten Seitenleistenbereiche lassen sich über ihre Überschrift einklappen. Das versteckt die Steuerelemente, nicht deren Wirkung: Aktive Bildanpassungen, Druckeinstellungen und Optimierungsoptionen gelten weiterhin. Zusammenfassungen und Statuspunkte eingeklappter Bereiche helfen, aktive Änderungen zu erkennen. Der aufgeklappte oder eingeklappte Zustand wird gespeichert. Aufklappen setzt einen Bereich nicht zurück.

**Rückgängig / Wiederholen** teilt den Bildbearbeitungsverlauf zwischen 2D und 3D. Es ist kein Rückgängig-Verlauf für Filamentänderungen, Kalibrierung, Schichthöhen oder Optimierungseinstellungen. Verwende dafür, sofern vorhanden, die Rücksetzfunktion des jeweiligen Bereichs und erstelle nach dem Wiederherstellen eines Bildstands das Modell neu.

## Experimenteller Mehrplattenmodus

Der Schalter **Mehrplattenmodus** in den Einstellungen gehört zu einem unfertigen Ablauf. Er merkt sich die Auswahl und kann eine Vorschauanimation abspielen, teilt das Bild derzeit aber nicht auf, erstellt keine Kacheln, verteilt keine Objekte auf Druckplatten und verändert keine Exportgeometrie. Lass ihn für normale Drucke ausgeschaltet. Er ist keine Möglichkeit, ein zu großes Modell auf das Druckbett zu bringen.

## Gespeicherte Druckeinstellungen

Kromacut merkt sich im Browser Druckeinstellungen wie **Pixelgröße (XY)**, **Schichthöhe**, **Höhe der ersten Schicht**, **Effektive Linienbreite** und **Glatte Vernetzung**.

Verwende die Rücksetz-Schaltfläche unter **3D-Druckeinstellungen**, um zu den Standardwerten dieses Bereichs zurückzukehren, einschließlich 0,42 mm effektiver Linienbreite.

Gespeicherte Einstellungen gehören lokal zum aktuellen Browser und zur Website beziehungsweise zur Desktop-App. Sie sind weder eine Sicherung des Motivs noch ein vollständig gespeichertes Projekt. Verschiedene Browser und die Desktop-App müssen sie nicht teilen. Exportiere wichtige Paletten und Filamentprofile, bevor du App- oder Browserdaten löschst. Das Laden eines Profils stellt dessen Filamente und Daten wieder her, kein Bild und kein fertig erstelltes Netz.

## Gespeicherter Auto-paint-Zustand

Auto-paint-Einstellungen bleiben sitzungsübergreifend erhalten, darunter:

- Filamente.
- Farbmodus.
- Maximale Höhe und Schichthöhe des Kalibrierkeils.
- Verbesserte Farbabstimmung.
- Farbtrennung erhalten, deren ΔE-Grenze für eindeutige Zuordnung und die Vorgabe, ob jede Farbe eindeutig zugeordnet werden muss.
- Gesamtlimit für Wiederholungen, also die gemeinsam genutzten zusätzlichen Filamentvorkommen im Stapel.
- Übergangsdetail und Höhen-Dithering.
- Effektive Linienbreite, bearbeitet unter **3D-Druckeinstellungen**, für Breitenwarnungen, die Bereinigung isolierter Punkte und Höhen-Dithering sowie die gespeicherte Auswahl **Isolierte Farbpunkte auslassen**. Diese Bereinigungsoption entfernt nicht jede Breitenwarnung und steuert nicht das Höhen-Dithering.
- Flat Paint und dessen Auswahl für Bildseite oben ohne transparente Schicht.
- Optimierungsalgorithmus und Startwert.
- Bereichspriorität.

Profile sind von diesem gespeicherten Zustand getrennt. Verwende Profile für benannte Filamentsets, die geladen, importiert oder exportiert werden können.

## Palettendateien

Eigene Paletten dienen der 2D-Farbreduktion. Palettendateien verwenden `.kpal`.

Palettenformat-Version 2 ergänzt zwei optionale Felder: `disabledColors` für gespeicherte, aber von der Quantisierung ausgeschlossene Farben und `colorNames` für optionale Anzeigenamen je Farbe. Beide bleiben beim Exportieren und erneuten Importieren erhalten. Dateien der Version 1 werden unverändert geladen, wobei alle Farben aktiviert und unbenannt sind. Öffnet eine ältere Kromacut-Version eine v2-Datei, behandelt sie einfach alle Farben als aktiviert.

Nutze eigene Paletten, wenn das reduzierte Bild einem bekannten Filamentset oder einer festen Farbsammlung entsprechen soll.

## Filamentprofildateien

Auto-paint-Filamentprofile sind benannte Filamentsets zum Speichern, Laden, Importieren und Exportieren. Sie verwenden `.kfil` und speichern Filamentfarben, Namen, Deckdistanzen, Kalibrierdaten, gespeicherte Palette-Proof-Aufzeichnungen und Bewertungen sowie, sofern vorhanden, begrenzte Stack-Matrix-Pläne und gemessene Farben. Ältere `.kapp`-Profile lassen sich weiterhin importieren. Frühere Versionen speicherten unkalibrierte Werte auf der herkömmlichen TD-Skala; beim Laden oder Importieren werden sie automatisch umgerechnet (×0,1).

Verwende zum Importieren das **Hochladen-Symbol** in der Auto-paint-Profilwerkzeugleiste. Eine ältere Datei mit derselben ID ohne Erscheinungsdaten wird als separate, umbenannte Kopie importiert, statt neuere Kalibrierdaten zu löschen. Bei einem Speicherfehler bleibt die bestehende Profilliste unverändert und eine Fehlermeldung erscheint. Das **Herunterladen-Symbol** exportiert das aktuelle Filamentset. Exporte verwenden standardmäßig `.kfil`. Hat das geladene Profil ungespeicherte Filamentänderungen, entsteht beim Export ein neues Profil „ungespeicherte Änderungen“ ohne Erscheinungsdaten, die an die alten Filamentidentitäten gebunden sind.

### Unterstützte Importformate

| Format | Endung | Hinweise |
| ----------------------- | -------------- | ------------------------------------------------------------------------------ |
| Kromacut-Profil | `.kfil` | Natives Format. Unterstützt einzelne Profile und Arrays mehrerer Profile in einer Datei. |
| Älteres Kromacut-Profil | `.kapp` | Früheres natives Format, beim Import weiterhin vollständig unterstützt. |
| Rohes JSON | `.json` | Akzeptiert, wenn die Datei ein Profilobjekt oder ein Array von Profilobjekten enthält. |
| HueForge-Spulen-CSV/TSV | `.csv`, `.tsv` | Siehe unten. |

### Umgang mit Duplikaten

Beim Import vergleicht Kromacut jedes eingehende Profil mit den bereits vorhandenen:

- **Gleiche ID:** Überschreibt normalerweise das bestehende Profil. Würden dabei gespeicherte Erscheinungsdaten durch eine Datei ohne nutzbare Daten ersetzt, wird stattdessen eine separate Kopie importiert.
- **Gleicher Inhalt, andere ID:** Wird nur übersprungen, wenn sowohl Filamentdaten als auch Erscheinungsdaten einem vorhandenen Profil entsprechen.
- **Gleicher Name, anderer Inhalt:** Wird mit einer angehängten Zahl importiert, etwa `My Spools (2)`.

Nach jedem Import zeigt eine kurze Zusammenfassung die Anzahl importierter, überschriebener, übersprungener oder umbenannter Profile.

### Aus HueForge importieren

Exporte der HueForge-Spulenbibliothek (`.csv` oder `.tsv`) lassen sich direkt importieren. Speichere in HueForge mit **Export Spools** eine CSV-Datei, klicke danach auf das Hochladen-Symbol der Auto-paint-Filamentprofilwerkzeugleiste und wähle die Datei. Das Trennzeichen, Komma oder Tabulator, wird automatisch an der Kopfzeile erkannt. Jede Spule wird zu einem Filamenteintrag namens `<Brand>-<Color Name>-<Hex>`, beispielsweise `Inland Basic-Light Brown-#BF9C81`. HueForge-UUIDs bleiben als Filament-IDs erhalten, damit ein erneuter Import derselben Bibliothek keine Duplikate erzeugt. HueForge-TD-Werte werden als herkömmliche Eingaben für hinterleuchtete Lithophanien behandelt und beim Import in Deckdistanzen für Auflicht umgerechnet.

## Desktop-Update-Hinweise

In der Desktop-App kann Kromacut auf eine verfügbare neuere Version hinweisen. Über den Hinweis kannst du die Downloadseite öffnen oder die Erinnerung schließen.

Öffne **Einstellungen**, um manuell nach Updates zu suchen. Die Desktop-Einstellungen enthalten auch **Beim Start suchen**. Diese Option steuert die Update-Suche beim Öffnen der App und ist standardmäßig aktiviert. Die manuelle Suche funktioniert auch bei ausgeschalteter Option.

Unter Linux lassen sich AppImages mit eingebetteten Aktualisierungsinformationen durch kompatible Werkzeuge wie AppImageUpdate aktualisieren. Diese verwenden die `.AppImage.zsync`-Datei der Veröffentlichung, um geänderte Teile herunterzuladen. Bei älteren AppImages ohne Aktualisierungsinformationen muss einmalig eine unterstützte Version manuell heruntergeladen werden. Die `.zsync`-Datei ist kein Installationsprogramm, und der Aktualisierungshinweis von Kromacut installiert Updates nicht automatisch.

## Auto-paint-Diagnose auf dem Desktop

Die Desktop-App kann strukturierte Informationen über neue Auto-paint-Berechnungen aufzeichnen. Öffne **Einstellungen** und aktiviere vor einer Berechnung **Auto-paint-Diagnosedaten aufzeichnen**. Diese Einstellung startet eine bereits abgeschlossene Berechnung nicht neu und zeichnet deren Ergebnis nicht nachträglich auf.

Jede Berechnung erstellt eine eigene `.jsonl`-Datei in Kromacuts Auto-paint-Diagnoseordner. Mit **Ordner öffnen** neben der Einstellung findest du die Dateien. Jede Zeile ist ein vollständiges JSON-Ereignis, sodass Fortschritte, Fehler und Abbrüche auch lesbar bleiben, wenn eine Berechnung nicht fertig wird.

Eine vollständige Aufzeichnung enthält grundlegende Laufzeitinformationen, den aktiven Filament- und Kalibrierstand, Modell- und Optimierungseinstellungen, eine begrenzte Auswahl an Fortschrittsdaten, den Status der Erscheinungsanpassung, Entscheidungen zu aufeinanderfolgenden Wiederholungsstufen, endgültige physische Schichten, jeden endgültigen druckbaren Farbkandidaten, Delta-E-Vergleiche zwischen Zielen und Kandidaten, Vorhersagezuverlässigkeit und die Messungen, die zu interpolierten oder lokal angepassten Farben beigetragen haben. Sie zeichnet verarbeitete Palettenfarben und Gewichte auf, nicht das hochgeladene Quellbild. Kalibrier- und Profildaten können dennoch sensibel sein; prüfe eine Aufzeichnung, bevor du sie öffentlich teilst.

Die Aufzeichnung dient Untersuchungen und kann große Dateien erzeugen. Lass sie für normales Drucken deaktiviert, wenn du keine Aufzeichnung benötigst.

## Dateien vom Desktop öffnen

Desktop-Installationen verknüpfen `.kfil`-Dateien und ältere `.kapp`-Dateien mit Filamentprofilen sowie `.kpal`-Dateien mit Paletten. Doppelklicken Sie auf eine Datei, um sie in Kromacut zu importieren und auszuwählen. Läuft die App bereits, wird das vorhandene Fenster verwendet. Die üblichen Regeln für Validierung, Migration, Duplikate und den Erhalt von Kalibrierungen gelten weiterhin.

Vom Desktop geöffnete Dateien warten, solange der Paletteneditor, der Kalibrierungsdialog oder ein Formular zum Umbenennen oder Speichern eines neuen Profils geöffnet ist. Schließe die Bearbeitung ab oder brich sie ab, um die wartenden Importe fortzusetzen; eingegebene Namen und das bearbeitete Profil bleiben bis dahin unverändert.

Importe warten auch, während du den Namen oder das HD-Feld eines Filaments bearbeitest oder dessen Farbauswahl oder das Popover **Aus TD umrechnen** geöffnet ist. Verlasse das Feld oder schließe die Farbauswahl beziehungsweise das Popover, um die wartenden Importe fortzusetzen; bevor ein anderes Profil ungespeicherte Filamentänderungen ersetzt, musst du weiterhin entscheiden, ob du sie behalten möchtest.

Vor dem Ersetzen ungespeicherter Filamentänderungen bietet Kromacut **Änderungen behalten** oder **Profil öffnen** an. Behalten Sie die Änderungen, um sie zuerst zu speichern; beim Öffnen des Profils werden sie verworfen. So geöffnete Dateien müssen kleiner als 32 MiB sein. Allgemeine JSON-Dateien, Bilder und Modelle behalten ihre üblichen Importabläufe.

Unter Linux benötigen portable AppImages eine Desktop-Integration für Dateiverknüpfungen. Ist Kromacut nicht als Standard ausgewählt, verwenden Sie **Öffnen mit** im Dateimanager.

Weiter: [Fehlerbehebung](troubleshooting).
