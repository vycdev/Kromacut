---
title: Kalibrierabläufe
slug: calibration-workflows
order: 65
description: Kalibrierwerkzeug auswählen, Steuerelemente verstehen und erkennen, welche Messungen für den nächsten Druck gelten.
---

# Kalibrierabläufe

Kalibrierung hilft Auto-paint, das Aussehen gestapelter Filamente vorherzusagen. Es ist keine Druckerkalibrierung: Diese Werkzeuge stimmen weder Extrusion, Temperaturen, Bettnivellierung noch Düseneinstellungen ab. Sorge zuerst für verlässliche Slicer-Einstellungen. Miss anschließend dieselben Materialien unter den Betrachtungsbedingungen, die du für dein Motiv verwenden möchtest.

Öffne **3D → Auto-paint → Kalibrieren**. Der Dialog enthält **Deckdistanz**, **Palette Proof** und **Stack Matrix**. Sie messen unterschiedliche Dinge und lassen sich gemeinsam nutzen.

![Drei Kalibrierwege: Ein Keil misst Filamentdeckkraft, ein Palette Proof vergleicht wenige Motivfarben und eine fotografierte Stack Matrix misst viele Rezepte. Alle beeinflussen vorhergesagte Farben und den druckbaren Stapel.](20_calibration_choices.svg)

| Werkzeug | Geeignet, wenn | Deine Eingabe | Was sich danach ändern kann |
| --------------- | ------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Deckdistanz | Die Deckkraft eines Filaments unbekannt oder nur geschätzt ist | Das erste Keilfeld, das seiner Referenzleiste entspricht | HD, Kanalschätzungen, Übergangsdicke, Gesamthöhe und Wechselplan |
| Palette Proof | Einige Farben eines Motivs besonders wichtig sind | Die ähnlichsten gedruckten Kandidaten und die Übereinstimmungsqualität | Lokale Farbvorhersagen und Stapelpräferenzen; möglicherweise Reihenfolge, Höhen und Geometrie |
| Stack Matrix | Du gemessene Farben vieler kurzer Rezepte möchtest | Ein korrekt ausgerichtetes Foto unter Auflicht | Gemessene Rezeptvorhersagen, lokale Interpolation und eine validierte physische Anpassung |

Keines dieser Werkzeuge erhöht die XY-Auflösung deines Druckers oder macht jede Zielfarbe erreichbar. Auch ein gut kalibriertes Profil kann einen begrenzten Farbumfang haben. Das zugrunde liegende Modell erklärt [Kalibrierungstheorie](calibration-theory).

## Das Filamentprofil vorbereiten und schützen

Eine Filamentzeile beschreibt eine echte Spule, keine gewünschte Bildfarbe.

| Steuerelement | Funktion | Wichtige Folge |
| -------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Farbfeld / Hex | Legt die nominelle deckende Filamentfarbe fest | Eine Änderung deaktiviert eine für die alte Farbe gemessene Keilkalibrierung. Sie verändert auch die Kompatibilität mit gespeicherten Erscheinungsdaten. |
| Name | Gibt der Spule eine lesbare Bezeichnung | Eine Bezeichnungsänderung verändert die Optik nicht. Speichere sie vor dem Erfassen von Proofs oder Matrizen. |
| HD-Feld | Gibt die Deckdistanz unter Auflicht in mm von 0,01 bis 2 an | Größere HD benötigt im Allgemeinen mehr Dicke zum Verdecken des Untergrunds. Ein übernommener manueller Wert löscht die Keilkalibrierung. |
| Aus TD umrechnen | Wandelt herkömmliche TD für Hinterleuchtung/Lithophanien mit ungefähr TD × 0,1 in HD um | Herkömmliche TD hier eingeben, nicht im HD-Feld. Der umgerechnete Wert ist eine Schätzung und ersetzt die Keilkalibrierung. |
| Zauberstab | Schätzt HD aus der Farbfeldfarbe | Nützlich als Ausgangspunkt, keine Messung. Ersetzt jede vorhandene Keilkalibrierung. |
| Kalibrierungsanzeige | Zeigt Schätzung oder die Qualitätsbezeichnung einer gemessenen Kalibrierung | Mit dem Mauszeiger die Kanal-HD-Werte prüfen. Die Bezeichnung garantiert nicht, dass ein fertiger Druck der Quelle entspricht. |
| Filament hinzufügen / Papierkorb | Fügt dem Arbeitsset eine Spule hinzu oder entfernt sie | Verfügbare physische Farben und Datenkompatibilität können sich ändern. |

Halte mit der Werkzeugleiste **Profile** ein benanntes, unverändertes Set bereit, bevor du Erscheinungsdaten erfasst:

- **Profilauswahl:** Lädt ein gespeichertes Set in die Arbeitsfilamente. Ein anderes Set ersetzt die aktuelle Arbeitsliste; speichere gewünschte Änderungen deshalb vorher.
- **Ausgewähltes Profil speichern:** Überschreibt dessen Filamentliste mit den Arbeitswerten. Vorhandene Proof- und Matrixaufzeichnungen bleiben erhalten, inkompatible Aufzeichnungen gelten aber nicht mehr für das geänderte Set.
- **Als neues Profil speichern:** Erstellt ein separates benanntes Filamentset. Kopiert werden die Filamentzeilen und deren Keilmessungen, nicht der Proof- und Matrixverlauf des alten Profils.
- **Umbenennen:** Ändert die Profilbezeichnung, nicht dessen Messungen.
- **Importieren:** Lädt Filamentdateien. **Exportieren** sichert ein unverändertes benanntes Profil einschließlich Proof-Bewertungen und Matrixmessungen als `.kfil`. Desktop öffnet Speichern unter; im Web gilt das Downloadverhalten des Browsers.
- **Ausgewähltes Profil löschen:** Entfernt das gespeicherte Profil und seine Daten. Exportiere vorher eine Sicherung, wenn du es später benötigen könntest.

**Ungespeicherte Änderungen** zeigt an, dass das Arbeitsset vom ausgewählten Profil abweicht. Speichere oder überschreibe es, bevor du eine Matrix erstellst oder Proof-Ergebnisse erfasst. Ein Export bei ungespeicherten Änderungen erzeugt ein Profil „ungespeicherte Änderungen“ ohne den alten Erscheinungsverlauf; er ist keine vollständige Sicherung dieses Verlaufs. Vorlagen sind schreibgeschützte Ausgangssets mit geschätzter HD. Speichere daher vor dem Kalibrieren eine eigene Kopie. Siehe [Profildateiformate und Importverhalten](settings-and-controls#filament-profile-files).

## Deckdistanz: Einen Keil ablesen

### 1. Filamente und Grundlagen wählen

Wähle eines oder mehrere Filamente oder verwende **Alle auswählen / Auswahl aufheben** und danach **Weiter: Basis**.

- **Schnell** verwendet eine Grundlage je Filament. Gemessen wird eine skalare Deckkraftschwelle; vorsichtige, aus der Farbfeldfarbe geschätzte Kanalunterschiede bleiben erhalten.
- **Genau** erlaubt bis zu drei Grundlagen je Filament und empfiehlt zunächst zwei nützliche Grundlagen, sofern verfügbar. Jede ergibt eine separate Keilablesung. Dies verfeinert eine eingeschränkte Kanalschätzung, misst aber nicht unabhängig drei Spektralkanäle.
- **Grundfarbenfelder** bestimmen, was unter dem Filament gedruckt wird. Verwende eine kontrastierende Grundlage, damit dünne Felder sichtbar von der Leiste abweichen können. Nahezu gleiche Grund- und Filamentfarbe ergeben keine nützliche Deckkraftschwelle.

Der Wechsel zwischen Schnell und Genau setzt die Grundlagenauswahl auf die Empfehlungen des Modus zurück. Der genaue Modus ist hilfreich, wenn du dasselbe Material über mehreren Untergründen vergleichen kannst, nicht einfach deshalb, weil sein Name ein allgemein besseres Ergebnis verspricht.

### 2. Den Keil einstellen und drucken

![Ein Kalibrierkeil hat zunehmend dicke Felder neben einer deckenden Referenzleiste; das erste identische Feld liefert die Messung.](07_calibration_wedge.svg)

| Steuerelement | Auswirkung auf den Kalibrierdruck |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schichthöhe (mm) | Bestimmt die Dicke jeder zusätzlichen Keilfeldschicht. Erlaubt sind 0,04–0,40 mm. Kleinere Höhen liefern feinere Messschritte, machen aber keine ungeeignete Druckerkonfiguration verlässlich. |
| Maximale Schichten (Keillänge) | Wählt 4–40 Stufen. Mehr Stufen erweitern den Messbereich für durchscheinendes Filament und erzeugen einen längeren, höheren Keil. |
| STL (jeder Drucker) | Lädt eine ungefärbte Kachel herunter. Drucke je ausgewähltem Filament-/Grundlagenpaar eine Kopie und verwende den angegebenen manuellen Wechsel. |
| 3MF (Mehrmaterial) | Enthält alle ausgewählten Ablesungen mit ihren tatsächlichen Filament-/Grundlagenzuweisungen in einer Datei. Prüfe die Materialzuordnung des Slicers. |
| Herunterladen | Exportiert den aktuellen Keilplan. Der Ergebnisschritt verwendet die Schichthöhe und Grundlagenauswahl dieses Plans, keine unverbundene spätere Änderung. |

Verwende die angezeigte **reguläre Schichthöhe**, **Höhe der ersten Schicht** und **Wechsel nach Schicht / Z** genau. Die erste Schichthöhe kommt aus den Druckeinstellungen; die eigene Schichthöhensteuerung des Keils ist von der regulären 3D-Modelleinstellung getrennt. Skaliere das Modell nicht in Z. **Weiter: Ergebnisse eingeben** öffnet den Ableseschritt; der Download sendet nichts an den Drucker.

Auf dem Desktop öffnen beide Keilformate **Speichern unter**; im Browser verwenden sie das normale Downloadverhalten. Warte mit Einstellungsänderungen oder Ergebniseingaben, bis der Export abgeschlossen ist. Ein abgebrochener Speicherdialog oder fehlgeschlagener Export lässt den zuletzt erfolgreich heruntergeladenen Keilplan unverändert. Bei einem Speicherfehler erscheint eine Fehlermeldung, damit du es erneut versuchen kannst.

### 3. Vergleichen und speichern

Betrachte den gedruckten Keil mit der Oberfläche nach oben unter dem vorgesehenen Auflicht. Die Lasche markiert das Ende mit einer Schicht. Vergleiche jedes Feld mit der Referenzleiste daneben, nicht mit einem Handyfoto oder Bildschirmfarbfeld.

- **Übereinstimmung:** Gib die Nummer des ersten Feldes ein, das genauso aussieht wie die Leiste. Das ist die Zahl zusätzlicher Filamentschichten des Feldes, nicht die absolute Schichtnummer des Druckers.
- **Verschmelzung (optional):** Gib das letzte Feld an, das noch anders aussah als das vorherige. Das prüft die angepasste Kurve und ist keine zweite erforderliche Deckkraftmessung. Ein Wert nach der Übereinstimmung erzeugt eine Warnung.
- **Vorhergesagte Farbfelder / HD / Zuverlässigkeit / Diagnose:** Zeigen das aus deinen Ablesungen abgeleitete Ergebnis. Es sind Rückmeldungen, keine zusätzlich einzugebenden Messungen.
- **Kalibrierung speichern:** Übernimmt vollständige, nutzbare Filamentmessungen. Ein leeres Filament ist **Nicht eingegeben** und bleibt unverändert. Bei einem teilweise ausgefüllten Filament im genauen Modus steht **Wird nicht gespeichert**, bis jede gewählte Grundlage einen Übereinstimmungswert hat. Andere vollständige Filamente lassen sich speichern, ohne das ganze Blatt fertigzustellen.

Weicht selbst das letzte Feld von der Leiste ab, gib es nicht nur zum Abschließen als passend an: Drucke einen längeren Keil. Passt bereits das erste Feld, kann eine feinere druckbare Schichthöhe oder eine kontrastreichere Grundlage die Messung aussagekräftiger machen. Ablesungen an den Grenzen des verfügbaren Bereichs haben eine geringere Zuverlässigkeit.

Eine erneute Filamentkalibrierung ersetzt das frühere Keilergebnis. Um mehrere Grundlagen zu kombinieren, lies sie gemeinsam in einer Sitzung des genauen Modus ab. Speichere oder überschreibe anschließend das benannte Profil und exportiere eine Sicherung. Gemessene HD verändert sowohl die vorhergesagte Farbe als auch die von Auto-paint für nötig gehaltene Materialmenge. Erstelle das Modell neu und prüfe neue Höhen und Wechselanweisungen.

Mit **Zurück** kannst du vorherige Assistentenschritte erneut aufrufen. Das Schließen des Dialogs setzt ungespeicherte Keilauswahlen und Ablesungen zurück; speichere nutzbare Ergebnisse vor dem Verlassen. Lösen mehrere vollständige Mehrgrundlagen-Ablesungen eine Sitzungsanpassung aus, warte vor dem Speichern auf deren Abschluss. Die laufende Berechnung ist keine weitere einzugebende Messung.

### Gedrucktes Beispiel: Acht Filamente

![Acht gedruckte HD-Keile mit abgestuften Feldern neben deckenden Referenzleisten; von links nach rechts Weiß, Schwarz, Rosa, Gelb, Orange, Violett, Cyan und Grün.](hd-wedges-eight-colors-2026-09-13.jpg)

Dieser tatsächliche Kalibrierdruck wurde am 13. September 2026 abgeschlossen. Der weiße und die bunten Keile verwenden Schwarz als Untergrund, der schwarze Keil Weiß. Das zugehörige Profil **8 Colors 0.2mm** verzeichnet **0,04-mm-Keilschichten** und eine **erste Schicht von 0,10 mm**. Der Profilname ersetzt nicht die aufgezeichneten Druckeinstellungen.

Nutze das Foto zum Erkennen des Aufbaus aus Feldern und Leiste sowie des Verlaufs zur Deckkraft, nicht zum Kopieren von Feldnummern oder zum Abtasten kalibrierter Farben. Kamerabelichtung, Weißabgleich, Licht und Bildschirm können die scheinbare Übereinstimmung verändern. Lies deinen eigenen physischen Druck neben seiner Leiste unter gleichbleibendem Auflicht ab.

## Palette Proof: Motivfarben vergleichen

Ein Proof druckt mehrere Kandidaten aus dem aktuellen Auto-paint-Stapel. Ein **Präfix** umfasst die Grundlage und jede Schicht darüber bis zu einer gewählten Stopphöhe. Proofs vergleichen druckbare Stopphöhen, keine beliebigen unabhängigen Spulenmischungen.

### Ziele und Kandidaten wählen

Lass Auto-paint zuerst ein Ergebnis mit mindestens zwei geeigneten druckbaren Präfixen fertig berechnen. Das 3D-Netz des Motivs muss noch nicht erstellt werden. Speichere sein benanntes Filamentprofil und öffne danach **Palette Proof**.

| Steuerelement | Bedeutung |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ziele | Anzahl zu vergleichender Motivfarben, bis zu 10 oder der verfügbaren Anzahl. Bei genügend Farben ist der Standard 8. |
| Kandidaten | Gewünschte Alternativen je Ziel, normalerweise 2–5, begrenzt durch verfügbare nützliche Präfixe. Mehr Kandidaten verbreitern die Probe. |
| Aus Bild auswählen | Öffnet eine separate Zielauswahl. Klicke auf wichtige Bildbereiche oder ihre Farbschalter. |
| Originalbild | Zielt auf verarbeitete Bildfarben vor der Erscheinungsanpassung, nicht auf das unveränderte hochgeladene Foto. |
| Angepasst / erreichbar | Zielt auf die exakten vorhergesagten Farben des aktuellen Auto-paint-Ergebnisses. Damit prüfst du, ob der Druck der Vorschau entspricht; „erreichbar“ bestätigt keine physische Genauigkeit. |
| Gesamte Probeziele | Legt bei der Bildauswahl dieselbe Zielanzahl fest. |
| Auswahl löschen | Entfernt manuelle Prioritäten und gibt offene Plätze an die intelligente Auswahl zurück. |
| Intelligente Ziele verwenden / Gewählte + intelligente verwenden | Kehrt mit deinen Prioritäten zum Proof zurück und füllt verbleibende Plätze automatisch. |

Ausgewählte Farben bleiben überall im Bild hell, nichtgewählte Bereiche werden abgedunkelt. Das Wählen eines Ziels färbt weder die Quelle um noch zwingt es diese Farbe in den Farbumfang des Druckers. Eine kleinere Zielanzahl kann Prioritäten oberhalb dieser Anzahl entfernen.

### Die Probe drucken und identifizieren

![Jedes Ziel hat Kandidatenfelder, die auf unterschiedlichen Höhen über einer gemeinsamen durchgehenden Grundlage enden.](09_palette_proof.svg)

Die Ansichten **Probenübersicht** und **Ergebnisse** verwenden eine Zielzeile pro Farbe mit Kandidaten A–E von links nach rechts. Zahlen kennzeichnen die Zielzeile. **F** bezeichnet die gemeinsame Grundlagenreferenz, keine sechste Kandidatenfarbe und kein weiteres Filament. Vergleiche sie mit dem freiliegenden Grundlagenrand.

**3MF herunterladen** exportiert die Probe und speichert bei einem unveränderten benannten Profil ihre Identität und Rezeptzuordnung. Danach sind Zielauswahl und Anzahlen gesperrt, damit Ergebnisse nicht unbemerkt auf einen anderen Druck verweisen. Behalte Bildseite oben und 100 % Maßstab bei, verwende die eingebetteten regulären und ersten Schichthöhen, prüfe Filamentzuweisungen und orientiere die Probe anhand der fehlenden oberen linken Ecke. Die Standardprobe mit 8 Zielen × 5 Kandidaten misst 44 × 68 mm. Sie hat aneinanderliegende 8-mm-Felder auf einer durchgehenden Grundlage; Grenzen können deshalb weniger deutlich sein als im Bildschirmraster.

### Erfassen, was du tatsächlich siehst

Öffne **Ergebnisse**, vergleiche die gedruckten Kandidaten unter gleichbleibenden Betrachtungsbedingungen mit dem angezeigten Ziel und wähle das ähnlichste Feld. Wähle bei Gleichstand mehrere. Beschreibe anschließend die Übereinstimmung:

| Antwort | Aussage an Kromacut |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Beste verfügbare | Dies ist die am wenigsten falsche Option. Gegenüber Alternativen stützen, ohne Gleichheit mit dem Ziel zu behaupten. |
| Nah | Die gewählte Farbe ist fast richtig. Zusätzlich zur Präferenz eine weiche lokale Korrektur ergänzen. |
| Exakt | Das gewählte Rezept entspricht diesem Ziel genau. Den stärksten lokalen Anker mit den zur Reproduktion nötigen unteren Schichten erhalten. |
| Keine | Jeder Kandidat ist deutlich schlecht. Diese Optionen lokal ablehnen, ohne eine richtige Farbe zu erfinden oder einen Gewinner auszuwählen. |

![Nach dem Proof-Vergleich führt ein gewählter Gewinner zu benachbarten Herausforderern in der nächsten Runde. Keine führt zu Erkundung ohne bisherigen Bestanker. Neue Ziele prüft ein anderes Set von Motivfarben.](21_proof_rounds.svg)

Antworten werden bei der Eingabe gespeichert. **Ergebnisse vervollständigen** wird verfügbar, sobald jede Zeile beantwortet ist, einschließlich Keine-Antworten. **Ergebnisse bearbeiten** öffnet einen abgeschlossenen Proof für Korrekturen. Die Auswahl gespeicherter Proofs gruppiert gleiche Zielsets und ihre Fortsetzungsrunden.

- **Ziele fortsetzen:** Druckt mit dem aktuellen kompatiblen Stapel eine weitere Runde für dieselben Ziele. Gewählte bisherige Bestwerte bleiben erhalten, benachbarte ungetestete Herausforderer werden geprüft, und ein Erkundungsstapel kann hinzukommen. Eine Keine-Antwort hat keinen bisherigen Bestanker; die nächste Runde erkundet deshalb Alternativen.
- **Neue Ziele:** Öffnet die Bildauswahl für ein anderes Zielset. Die intelligente Auswahl bevorzugt Farben außerhalb des abgeschlossenen Proofs, danach seltener geprüfte Farben.
- **Weniger Kandidaten / ausgeschöpfte Ziele:** Die Suche füllt die Tafel nicht bloß zum Erreichen der gewünschten Größe mit unpassenden Wiederholungen. Lies die Warnung; weniger nützliche Optionen bedeuten nicht, dass Kalibrierung verloren ging.
- **Proof löschen:** Entfernt nach Bestätigung diese gespeicherte Probe und alle ihre Bewertungen aus den Erscheinungsdaten.

Gespeicherte Ergebnisse bleiben ohne Originalbild lesbar. Ein erneuter Download eines gespeicherten Proofs benötigt dessen exakten Auto-paint-Ausgangsstand. Das Fortsetzen von Zielen benötigt ein kompatibles aktuelles Motiv und Verfahren. Behalte die ursprüngliche 3MF-Datei, wenn du später erneut drucken möchtest.

Proof-Bewertungen können benachbarte Farbvorhersagen, Stapelrangfolgen und schließlich Druckhöhen verändern. Sie ändern weder das tatsächliche Material exportierter Schichten noch überschreiben sie die HD-Kalibrierung der Spule. Ein einzelnes Ergebnis belegt keine global genaue Palette. Die allgemeinere Anpassung hat Daten- und Validierungsschranken mit zurückgehaltenen Messungen; lokale Bewertungen können auch nützlich sein, wenn diese Anpassung nicht aktiv ist.

## Stack Matrix: Bekannte Rezepte fotografieren

### Die Tafel planen

Speichere zuerst ein unverändertes benanntes Profil. Stelle vor **Neue Matrix** die gewünschte **Schichthöhe** und **Höhe der ersten Schicht** in den 3D-Druckeinstellungen ein. Das Schichthöhenfeld des Deckdistanzkeils steuert Matrizen nicht.

| Steuerelement | Auswirkung auf die Tafel |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Filamentfarbfelder | Wähle 2–8 Filamente in Profilreihenfolge. Nur diese Materialien liefern Rezeptschichten. |
| Maximale Farbdicke (mm) | Begrenzt den Farbbereich über der einschichtigen Grundlage. Wird auf ganze reguläre Druckschichten abgerundet, von 1 bis 64 Schichten. Bei 0,04 mm erlaubt eine Grenze von 0,40 mm Rezepte bis 10 Schichten. |
| Maximale Zellen | Begrenzt die Rezeptanzahl: 64, 144, 256, 400, 625, 1024, 1296, 1600 oder 2025. Eine größere Tafel beprobt mehr Rezepte, benötigt aber mehr Druckbettfläche und Druckzeit. |
| Geplantes Materialwechselbudget | Begrenzt die Materialwechselschätzung des Planers einschließlich Eckreferenzen. Wähle 40–640 Wechsel oder Keine Planergrenze. Keine Zeitschätzung und keine Garantie für die endgültige Wechselanzahl des Slicers. |
| Grundfilament | Wählt ein ausgewähltes Filament für die einschichtige Grundlage und die Unterfütterung kürzerer Rezepte. Standardmäßig das hellste ausgewählte Filament. Eine dünne erste Schicht ist nicht garantiert deckend. |
| Schichthöhe / Höhe der ersten Schicht | Schreibgeschützte Bestätigung der aktuellen 3D-Einstellungen für eine neue Tafel. |
| Rezept-/Größen-/Höhen-/Wechselzusammenfassung | Zeigt vor dem Download Grundfläche, Grundlagen- plus Farbbereichshöhe, Gesamthöhe und Druckschichtzahl. Eine gespeicherte Tafel zeigt ihre festgehaltenen Höhen, gewählten Zellen, geplanten Wechsel, Referenzen und berücksichtigten früheren Tafeln. |
| Erstellen und 3MF herunterladen | Plant Rezepte, exportiert die Tafel und erfasst danach den gespeicherten Plan im Profil. |

Neue Tafeln verwenden **adaptive Abdeckung**: Eine begrenzte, wiederholbare Suche beprobt Rezepte über den erlaubten Dickenbereich. Bevorzugt werden Lücken in zuvor gemessenen Farben, ungeprüfte Tiefen und Filamentübergänge sowie Erkundungsrezepte, deren Vorhersagen schwach gestützt sind oder zuvor Messungen widersprachen. Vorhergesagte Neuartigkeit verspricht keine tatsächlich neue Druckfarbe. Einige Referenzzellen werden absichtlich wiederholt, damit aufeinanderfolgende Fotos verglichen werden können.

Nur abgeschlossene Tafeln mit kompatiblen Profil-/Materialdaten, Untergrund, Druckhöhen und bestätigter Fotoausrichtung leiten die nächste Tafel an. Der Download eines ungedruckten Plans macht dessen Farben nicht zu Messungen. Behalte abgeschlossene Tafeln: **Neue Matrix** berücksichtigt geeignete Messungen automatisch. Eine Änderung von Untergrund oder Druckeinstellungen kann einen getrennten Abdeckungskontext beginnen.

Neue Tafeln haben eine **einschichtige Grundlage**, bestimmt durch **Höhe der ersten Schicht**, ohne zusätzliche deckkraftbasierte Platte. Beispielsweise ergibt **0,10 mm erste Schicht + 0,40 mm Farbbereich = 0,50 mm Gesamthöhe**. Bei **0,04 mm regulärer Schichthöhe** sind das **11 Druckschichten**: eine Grundlagenschicht und zehn Farbbereichsschichten. Die Höhenzusammenfassung zeigt diese Aufteilung vor dem Download und verwendet beim Betrachten älterer Tafeln deren tatsächlich gespeicherte Grundlage.

Alle Felder enden weiterhin an einer flachen Oberseite. Ein kürzeres Rezept liegt unter seinen Farbschichten auf zusätzlichen Schichten desselben Grundfilaments **innerhalb der Farbdickengrenze**. Diese Unterfütterung erhöht die angezeigte Gesamthöhe nicht. Die gespeicherte Aufzeichnung erhält sowohl das eigentliche Rezept als auch seine Unterfütterung.

Eine dünne erste Schicht ist nicht automatisch deckend. Wähle ein deckendes Grundfilament und fotografiere die Tafel auf einem einheitlichen, flachen Untergrund. Von unten durchscheinendes Licht oder Farbe kann Messfarben beeinflussen. Zusätzliche Unterfütterung darf erst als optisch neutral behandelt werden, wenn sie den Untergrund tatsächlich verdeckt.

Messungen über einer noch durchscheinenden Grundlage behalten ihre physische Untergrunddicke. Sie können einen passenden physischen Stapel stützen, werden aber weder als austauschbare Messungen über anderen Grundlagendicken noch zur Anpassung des globalen Modells für deckende Grundlagen verwendet. Unterfütterung kann einige Felder deckend machen, auch wenn die bloße erste Schicht es noch nicht ist.

Neue Tafeln gruppieren ähnliche Rezepte, um gleichfarbige Bereiche zusammenhängender und Werkzeugbahnen weniger fragmentiert zu machen. Gruppierung allein verringert nicht, wie viele Filamente je Druckschicht verwendet werden. Sie verspricht deshalb weder weniger Materialwechsel noch eine bestimmte Zeitersparnis. Vorhandene gespeicherte Tafeln behalten ihre ursprünglichen Zellpositionen, damit Fotos weiterhin passen.

Die Dickengrenze zwingt nicht jedes Rezept, so viel Farbmaterial zu verwenden. Zell- und Materialwechselbudgets können weniger Zellen als angefordert erzeugen. Ein enges Wechselbudget kann einige ausgewählte Filamente ungenutzt lassen; der gespeicherte Plan warnt dann. Überschreiten bereits die Referenzfelder das Wechselbudget, erhöhe dieses oder verringere Dickengrenze beziehungsweise Filamentauswahl. Tiefere Tafeln und CFS-/AMS-Spülungen können selbst bei wenigen Zellen langsam bleiben: Prüfe die endgültige Slicer-Schätzung vor dem Druck.

Die gespeicherte Zusammenfassung zählt ausgewählte Rezepte, die in kompatiblen früheren Tafeln noch nicht gemessen wurden. Ist diese Zahl null, wiederholt der Plan nur vorhandene Messungen. Du kannst auf den Druck verzichten und andere Grenzen oder Materialien ausprobieren. Das beweist nicht, dass jede erreichbare Farbe gemessen wurde, denn die Suche ist begrenzt.

Zellen sind fest 5 mm groß und lückenlos, ergänzt um einen Markierungsrand. Beispielsweise belegt ein 32 × 32 großes Datenraster eine Tafel von 170 × 170 mm. Ältere gespeicherte Tafeln behalten ihre feste Rezepttiefe und Bezeichnungen **Alle Kombinationen** oder **HD-ausgewählter Farbumfang**. Ein erneuter Download wandelt sie nicht ins adaptive Format um.

Auf dem Desktop erzeugt ein Abbruch von Speichern unter keinen neuen gespeicherten Plan. Im Browser wird der Plan beim Start des Downloads aufgezeichnet. Achte auf Speicherfehlermeldungen und behalte die 3MF-Datei. Eine gespeicherte Tafel friert Schichthöhen, Untergrund und Rezeptzuordnung ein. Spätere Einstellungsänderungen gestalten sie nicht um, und **3MF herunterladen** an dieser Aufzeichnung exportiert erneut die ursprüngliche Tafel.

Drucke mit Bildseite oben, 100 % Maßstab und den exakten Schichthöhen sowie Filamentzuweisungen. Eine erste Schicht unterhalb der regulären Schichthöhe wird auf diese angehoben. Die Grundlage bleibt eine Schicht in dieser effektiven ersten Schichthöhe; sie wird nicht zum Erreichen eines Deckkraftziels verdickt. Ältere Tafeln behalten ihre ursprüngliche Grundlage einschließlich eventueller Zusatzschichten. Dies ist ein physischer Kalibrierkörper. Veränderte Z-Skalierung oder Materialzuordnung macht ungültig, was die Zellen messen sollen.

### Ein Foto laden und ausrichten

Wähle die gedruckte Tafel in der Auswahl gespeicherter Matrizen und anschließend **Foto auswählen**, oder ziehe ein Bild in den Fotobereich. Fotografiere unter diffusem Auflicht ohne starke Spiegelungen. Die App muss die Datei decodieren können; eine Kamera-RAW-Datei ersetzt keinen normal darstellbaren Bildexport.

![Die vier Griffe gehören auf die Mittelpunkte der farbigen Markerzellen außerhalb des Rezeptrasters. Die Tafelgrenze liegt eine halbe Zelle außerhalb dieser Mittelpunkte; ein vergrößerter Ausschnitt unterscheidet Markermitte und Tafelecke.](22_matrix_alignment.svg)

| Steuerelement | Was es ändert |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gedruckte Eckkennzeichnung | Zeigt die nötige Orientierung: 1 oben links, 2 oben rechts, 3 unten rechts, 4 unten links. Folge den Farbfeldern dieser Aufzeichnung; sie hängen von den gewählten Filamenten ab. |
| Nach links / rechts drehen | Dreht das hochgeladene Foto um 90° und führt die Erkennung erneut aus. Ändert die gespeicherte physische Rezeptzuordnung nicht. |
| Zoom − / Prozentsatz / Zoom + | Ändert die Vergrößerung von 100 % bis 400 %. Bei 100 % passt das gesamte Foto in den Arbeitsbereich; das ist keine 1:1-Zuordnung von Bildschirm- zu Kamerapixeln. Klicke zum Zurücksetzen auf den Prozentsatz und scrolle zu vergrößerten Bereichen. |
| Vier nummerierte Griffe | Auf die Mittelpunkte der farbigen Markerzellen diagonal außerhalb des dichten Datenrasters ziehen. Das Lupenfadenkreuz kennzeichnet den abgetasteten Mittelpunkt. |
| Vorlagengitter anzeigen | Zeigt projizierte Zellgrenzen zum Vergleich mit dem Druck. Eine Prüfüberlagerung, keine Farbkorrektur. |
| Erneut erkennen | Schätzt die Ausrichtung anhand des aktuellen Fotos neu. |
| Zurücksetzen | Stellt die anfängliche Schätzung des aktuellen Fotos wieder her und nimmt manuelle Griffänderungen zurück. Löscht keine gespeicherte Kalibrierung. |
| Ich habe jede Gitterlinie und jedes Markierungszentrum geprüft | Nach manueller Änderung oder unsicherer Erkennung erforderlich. Erst nach Prüfung des vollständigen Rasters und aller vier Mittelpunkte bestätigen. |

Setze Griffe nicht auf die letzten Rezeptzellen oder die physischen Außenecken. Die blaue Tafellinie sollte eine halbe Zelle über jede Markermitte hinausreichen. Prüfe die **perspektivisch korrigierte Vorschau**: Zellen sollten quadratisch aussehen und zum gedruckten Aufbau passen. Die App tastet nach innen versetzte Mittelpunkte ab, um Zellgrenzen zu vermeiden. Ein verschobenes Raster weist Rezepten trotzdem falsche Farben zu.

### Abtastung wählen und speichern

**Referenzmarkierungskorrektur** ist standardmäßig aus. Aus behält die abgetasteten Fotofarben einschließlich des Kamerafarbstichs. Ein wendet Kanalverstärkungen an, die aus dem Vergleich der vier fotografierten Marker mit ihren vorhergesagten Rezeptfarben geschätzt werden. Das kann einen allgemeinen Farbstich oder eine Helligkeitsverschiebung verringern, misst aber weder unabhängig die Raumbeleuchtung noch repariert es Schatten oder Spiegelungen. Falsche Markervorhersagen können das Ergebnis ebenfalls verzerren. Eine hellere Vorschau beweist keine genauere Messung.

Die **Vorschau der extrahierten LUT** zeigt die zu speichernden Farben, ein Farbfeld je Rezept. Fahre über eine Zelle, um ihre abgetasteten RGB-Werte zu sehen. Vergleiche dies mit der physischen Tafel und den gewünschten Betrachtungsbedingungen, nicht mit der Erwartung, jede Zelle müsse leuchtend sein.

**Kalibrierung speichern** wird verfügbar, sobald Proben und Ausrichtungsprüfung bereit sind. Bei einer abgeschlossenen Aufzeichnung heißt die Schaltfläche **Kalibrierung ersetzen** und ersetzt deren fotografierte Messungen. Lade oder exportiere vorher eine Sicherung, wenn du beide Versionen behalten möchtest. Das gespeicherte Profil enthält Farben und Rezeptdaten sowie Fotometadaten, nicht das Originalfoto selbst. Bewahre das Quellfoto separat auf, falls du es später erneut abtasten möchtest.

**Neue Matrix** beginnt eine weitere Tafel; **Zurück zu gespeicherten Matrizen** kehrt zu vorhandenen Aufzeichnungen zurück. **Stack Matrix löschen** entfernt die gewählte Tafel und ihre Daten. Abgeschlossene kompatible Tafeln können gemeinsam beitragen. Du musst eine ältere Tafel daher nicht löschen, nur weil eine neue gemessen wurde.

## Welche Daten gelten für meinen nächsten Druck?

![Ein dreischichtiges Rezept mit 0,08 mm ist physisch nicht dasselbe wie drei Schichten mit 0,04 mm. Vorhandene HD kann weiterhin eine dickenbasierte Schätzung liefern; gleiche Schichtzahlen machen Matrixfarben aber nicht übertragbar.](23_calibration_scope.svg)

| Daten | Zu prüfende Kompatibilität |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keil-HD | Gehört zur gemessenen Filamentfarbe. HD ist ein Dickenmodell, keine Tabelle einer bestimmten Schichtzahl; neue Druckeinstellungen verdienen trotzdem eine physische Prüfung. |
| Palette-Proof-Präferenzen und allgemeinere Anpassung | Benötigen dieselben geordneten Filamentidentitäten, Farben, HD-/Kalibrierdaten, reguläre Schichthöhe, erste Schichthöhe und Übergangsdeckkraft-Einstellung. |
| Exakt-Anker aus Proofs | Benötigen passende Filament-/Profildaten und Schichthöhen. Können bei geändertem Übergangsdetail geeignet bleiben, sofern das erforderliche physische Suffix realisierbar ist. |
| Stack Matrix | Benötigt eine abgeschlossene, bestätigte Ausrichtung, kompatible Filament-/Profildaten und dieselbe reguläre Schichthöhe. Die exakte Rezeptnutzung hängt zusätzlich vom gemessenen Untergrund oder gestützter optischer Gleichwertigkeit ab. |

Der Wechsel von 0,08 auf 0,04 mm interpretiert ein fotografiertes Dreischichtrezept nicht als sechs Schichten neu. Diese Matrix liegt außerhalb des neuen regulären Schichthöhenkontexts. Das gewählte Profil kann weiterhin Keil-HD-Schätzungen liefern, aber **Erscheinungsmodell** kann korrekt **Nur geschätzt** und null Matrix-LUT-Rezepte anzeigen.

Eine andere erste Schichthöhe deaktiviert nicht automatisch jede Matrix. Matrizen bewahren ihre ursprüngliche Grundlage. Die Wiederverwendung hängt davon ab, ob der erzeugte Untergrund die gemessenen oder gestützt gleichwertigen Bedingungen erfüllt. Gehe nicht davon aus, dass dasselbe oberste Filament oder dieselbe Gesamtdicke reicht. [Vorhersageunsicherheit](calibration-theory#prediction-uncertainty) erklärt die begrenzten Regeln für Untergrundübertragung und Fortsetzung mit demselben Filament.

## Zuverlässigkeit lesen, ohne Genauigkeit zu übertreiben

Filamentanzeige, **Ergebniszuverlässigkeit** und **Erscheinungsmodell / Vorhersagezuverlässigkeit** beschreiben unterschiedliche Dinge:

- **Filamentzuverlässigkeit** betrifft die Eingrenzung einer Keilmessung. Randablesungen, Widersprüche oder Alterung verringern sie. Schätzung bedeutet, dass keine aktive Keilmessung vorliegt.
- **Ergebniszuverlässigkeit** kombiniert Kalibrierung, Abdeckung und Stauchung. Ein hoher Gesamtwert kann zugleich mit vollständig simulierten Rezeptfarben auftreten.
- **Erscheinungsmodell** benennt verfügbare empirische Daten und Anpassungsstatus. Anzahlen verglichener Stapel, Anker, lokaler Nachbarschaften und Matrix-LUT-Rezepte zeigen, was tatsächlich in den Durchlauf eingeflossen ist.
- **Vorhersagezuverlässigkeit** beschreibt die Stützung der diesem Bild zugeordneten Farben, einschließlich gemessener, interpolierter, angepasster oder simulierter Vorhersagen. Ein gemessenes Rezept ist weiterhin eine Kamera- oder menschliche Beobachtung unter bestimmten Bedingungen, keine Laborgarantie.

Verwende **Beste verfügbare** statt Exakt, wenn du das am wenigsten schlechte Proof-Feld wählst. Bearbeite ein Matrixfoto nicht so lange, bis die Vorschau attraktiv aussieht. Der nützliche nächste Schritt ist ein kleiner physischer Test, der genau die tatsächlich geänderten Farben und Druckeinstellungen prüft.
