---
title: Kalibrierungstheorie
slug: calibration-theory
order: 62
description: Optik und Mathematik hinter Deckdistanz-, Palette-Proof- und Stack-Matrix-Kalibrierung.
---

# Kalibrierungstheorie

Kromacut bietet drei sich ergänzende Kalibrierwerkzeuge. **Deckdistanz** misst die physische Deckkraft jedes Filaments. Bei **Palette Proof** bewertest du eine kleine Auswahl gedruckter Kandidaten für Farben, die für einen Auftrag wichtig sind. **Stack Matrix** erfasst anhand eines Fotos die beobachteten Farben vieler bekannter physischer Rezepte. Alle speisen dasselbe Auto-paint-Stapelmodell, beantworten aber unterschiedliche Fragen.

Schrittweise Bedienung, Speicherverhalten und Kompatibilität der Druckeinstellungen erklärt [Kalibrierabläufe](calibration-workflows). Den übrigen Druckarbeitsbereich beschreibt [3D-Modus](3d-mode).

## Warum sich dünne Schichten mischen

Ein Druck wird unter Auflicht betrachtet: Licht tritt an der Oberseite ein, durchläuft das Filament, wird vom Untergrund reflektiert und tritt wieder aus. Eine dünne Schicht verdeckt den Untergrund nur teilweise. Die sichtbare Farbe mischt deshalb die Eigenfarbe des Filaments mit der von unten durchscheinenden Farbe. Auto-paint nutzt dieses Durchscheinen, um mit einem kleinen Filamentset Zwischenfarben zu erzeugen. Deshalb muss die HD genau sein.

![Dünne Filamentschichten über einer schwarzen Grundlage verdecken diese nur teilweise; jede zusätzliche Schicht multipliziert das Durchscheinen, bis der Stapel der deckenden Filamentfarbe entspricht.](06_frontlit_hiding_distance.svg)

Kromacut modelliert das Durchscheinen mit dem Beer-Lambert-Gesetz. Eine Filamentdicke `d` überträgt den Anteil

```
T = 10^(−d / HD)
```

der darunterliegenden Farbe. Jede zusätzliche Schicht multipliziert das Durchscheinen, sodass der Stapel geometrisch gegen Deckkraft strebt. Die Rate ist eine Materialeigenschaft: Dichtes Schwarz deckt in einem Bruchteil eines Millimeters, durchscheinendes Weiß kann die zehnfache Dicke benötigen. Diese Rate wird durch die Deckdistanz beschrieben.

Die auf Spulen-Datenblättern angegebene oder mit hinterleuchteten TD-Testdrucken gemessene Transmission Distance beschreibt Licht, das das Filament einmal _durchläuft_ – wie bei einer Lithophanie. Unter Auflicht durchläuft das Licht die Schicht zweimal und wird über Reflexion betrachtet. Eine herkömmliche TD ist daher ungefähr zehnmal so groß wie die Deckdistanz. Kromacut akzeptiert herkömmliche TD als Eingabe über die Umrechnen-Schaltfläche jeder Filamentzeile, speichert und simuliert aber mit HD.

## Der Keil

Kamerabasierte Farbmessung ist unzuverlässig: Kameras korrigieren automatisch, Bildschirme unterscheiden sich und die Beleuchtung schwankt. Der Keil vermeidet die isolierte Beurteilung einer Farbe. Jede Kachel druckt Felder aus 1 bis N Filamentschichten über einer Grundlage. Daneben liegt eine vollständig deckende **Referenzleiste** desselben Filaments; ein Fuß markiert das Ende mit einer Schicht.

![Der Kalibrierkeil: nummerierte Felder mit steigender Schichtzahl neben einer vollständig deckenden Referenzleiste; angegeben wird das erste Feld, das genauso aussieht wie die Leiste.](07_calibration_wedge.svg)

Du gibst das **erste Feld an, das genauso aussieht wie die Leiste daneben**. Die Leiste zeigt die deckende Eigenfarbe des Filaments, nur Millimeter entfernt unter demselben Licht. Der Vergleich bleibt dadurch über Räume, Bildschirme und Drucke hinweg brauchbar. Dünne Felder lassen die Grundlage durchscheinen. Ab einem Feld fällt der Unterschied unter die Wahrnehmungsgrenze des Auges; dessen Nummer ist die Messung.

## Von der Ablesung zur Deckdistanz

Das angegebene Feld markiert die Dicke, bei der das Durchscheinen unter einen **gerade wahrnehmbaren Unterschied (JND)** fällt: den kleinsten sichtbaren Farbunterschied, unter alltäglichen Bedingungen ungefähr 2 ΔE00.

Kromacut löst dies rückwärts. Für die Filamentfarbe über der Grundfarbe berechnet es `T*`: den durchscheinenden Anteil, bei dem die Mischfarbe genau einen JND von der deckenden Filamentfarbe entfernt ist. `T*` hängt nur von beiden Farben und dem JND ab, ohne von Hand abgestimmte Deckkraftkonstante. Die Ablesung liefert die Dicke an diesem Punkt, `d* = patch × layer height`; die Umkehrung von Beer-Lambert ergibt:

```
HD = −d* / log10(T*)
```

![Mit zunehmender Schichtzahl sinkt der Farbunterschied zwischen Feld und Leiste. Das abgelesene Feld legt den Übergang über einen JND fest; die Umkehrung des Transmissionsgesetzes liefert die Deckdistanz.](08_opacity_solve.svg)

Dabei zählt der Grundkontrast: Schwarzes Filament über schwarzer Grundlage unterscheidet sich nie um einen vollen JND von seiner Leiste; es gibt also nichts zu messen. Der Assistent erkennt dies und weist dunklen Filamenten eine hellere Grundlage zu.

## Palette-Proof-Daten

Ein Palette Proof vergleicht tatsächlich gedruckte Stapelpräfixe mit Farben des aktuellen Motivs. Kromacut bewahrt das physische Schichtrezept, seine ursprüngliche HD-Vorhersage, die gewünschte Zielfarbe und jede Antwort auf. Dadurch liefert ein Blatt zwei Arten von Daten, ohne jede Auswahl als exakte Messung auszugeben.

**Beste verfügbare** stützt das gewählte Rezept und lehnt die nichtgewählten Alternativen nahe diesem Ziel ab, erzwingt aber keine Gleichheit zwischen Feld und Zielfarbe. **Nah** ergänzt eine teilweise lokale Farbkorrektur. **Exakt** ergänzt die stärkste Korrektur und erhält das exakt geprüfte deckende Suffix als direkten Anker. Bei Gleichstand erhält jedes ausgewählte Feld Unterstützung. **Keine** lehnt plausible Kandidaten nahe dem Ziel ab, ohne eine Korrekturrichtung zu erfinden.

Diese Effekte sind sowohl im physischen Rezeptraum als auch im Farbraum lokal. Beim Rezeptvergleich zählen die zuletzt gedruckten, optisch dominanten Schichten am stärksten; dasselbe Filament an einer anderen Position im jüngeren Stapel ist eine schwächere Übereinstimmung. Die Datenwirkung nimmt außerdem ab, wenn sich die simulierte Stapelfarbe oder die gewünschte Zielfarbe von der bewerteten Farbe entfernt. Mehrere ähnliche Rezepte, die nahe grünen Zielen wiederholt verlieren, verstärken daher eine lokale Warnung für benachbarte grüne Stapel. Ein unzusammenhängendes rotes Rezept bleibt unbeeinflusst.

Korrekturen aus Nah und Exakt fließen in dieselben vorhergesagten Lab-Farben ein, die Optimierungsbewertung und endgültige Vorschau verwenden. Unterstützungs- und Ablehnungsdaten ergänzen eine begrenzte, zielabhängige Optimierungspräferenz. Wiederholte Daten können dadurch einen knappen numerischen Gleichstand entscheiden, ohne den tatsächlichen Farbfehler oder exakte Anker zu überstimmen. Die allgemeinere globale Helligkeits-/Chroma-Anpassung bleibt getrennt und muss weiterhin ihre Validierung mit zurückgehaltenen Daten bestehen. Lokale Daten und Exakt-Anker können nützlich bleiben, wenn diese globale Anpassung gesperrt ist. Alle abgeleiteten Parameter werden deterministisch aus den gespeicherten Rohbewertungen neu aufgebaut.

## Stack-Matrix-Kalibrierung

Die Stack Matrix beginnt als LUT-artige Messung, nicht als weitere Lösung eines Deckkraftkeils. Neue Tafeln beproben nützliche Rezepte unterschiedlicher Länge bis zu einer physischen Farbdickengrenze. Jede Schicht im Farbbereich behält dabei die gewählte reguläre Schichthöhe. Eine Grenze von 0,40 mm bei 0,04 mm erlaubt bis zu 10 Farbschichten. Die Grundlage besteht aus einer einzigen Schicht in effektiver erster Schichthöhe, nicht aus einer nach geschätzter Deckkraft bemessenen Platte. Bei einer ersten Schicht von 0,10 mm ist dieses Beispiel insgesamt 0,50 mm hoch und hat 11 Druckschichten.

Kürzere Rezepte liegen auf zusätzlichen Schichten desselben Grundfilaments innerhalb des Farbbereichs, sodass alle Probenflächen auf demselben Z enden, ohne die Grenze zu überschreiten. Beim Anwenden der Messungen wird diese zusätzliche Unterfütterung getrennt vom eigentlichen Rezept erfasst. Eine dünne Grundlage ist nicht garantiert deckend: Verwende deckendes Filament und einen einheitlichen, flachen Untergrund zum Fotografieren. Der gedruckte Untergrund muss das Trägermaterial tatsächlich verdecken, bevor zusätzliche Unterfütterung als optisch neutral behandelt werden kann. Ältere gespeicherte Tafeln behalten ihre ursprünglichen Grundlagendicken und Zellzuordnungen.

Der mögliche Rezeptraum wächst exponentiell. Die Planung verwendet deshalb einen begrenzten deterministischen Vorrat aus reinen Materialabschnitten, geordneten Filamentübergängen und längeren Erkundungsrezepten über die erlaubten Tiefen. Gespeicherte HD-Werte sagen deren Farben voraus. Kompatible abgeschlossene Matrizen liefern gemessene Farbabdeckung und eine Aufzeichnung bereits gedruckter Rezepte. Die Auswahl bevorzugt Farblücken und neue Dicken-/Übergangsabdeckung und enthält gezielte Erkundung auf Grundlage schwacher Datenstützung oder früherer Vorhersagefehler. Diese Auswahlwerte sind Heuristiken, keine kalibrierten Unsicherheitsintervalle. Einige absichtlich wiederholte Referenzen unterstützen Konsistenzprüfungen. Ungedruckte Pläne sowie inkompatible oder nicht bestätigte Fotos schließen keine Abdeckungslücken.

Das Materialwechselbudget umfasst die Eckreferenzen und begrenzt die schichtweise Materialnutzung des Planers. Es ist keine Schätzung von Druckzeit oder Spülvolumen; der Slicer kann zusätzliche Wechsel erzeugen. Eine größere Dickengrenze kann daher selbst bei kleiner Zellanzahl mehr Aufwand verursachen. Neue Tafeln gruppieren ähnliche Rezepte zu zusammenhängenderen gleichfarbigen Bereichen, um fragmentierte Werkzeugbahnen zu verringern. Das Umordnen der Zellen reduziert nicht die Anzahl der auf jeder Schicht benötigten Materialien. Ältere Tafeln behalten ihre ursprüngliche vollständige Auswahl mit fester Tiefe oder ihre HD-Farbraumauswahl und können ohne Umschreiben weiterhin kompatible Daten beitragen.

Die Matrix wird mit Bildseite oben gedruckt. Grundlage, erste Schichthöhe und nachfolgende Rezeptschichten verwenden damit dieselbe physische Reihenfolge wie ein normales Kromacut-Modell. Vier Eckrezepte kennzeichnen die Orientierung und definieren die Perspektivtransformation. Fotografiere die Oberfläche nach dem Druck unter diffusem Auflicht. Kromacut schätzt die Tafelposition; anschließend kannst du vier nummerierte Marker-Mittelpunktsgriffe mit vergrößertem Fadenkreuz verschieben. Ein exakt projiziertes Zellraster und eine laufende entzerrte Vorschau machen Perspektiv-, Neigungs- und Scherfehler sichtbar, bevor Kromacut je Zelle einen mittigen Innenbereich in deren eigenen projektiven Koordinaten beprobt. Dieser zellbezogene Innenabstand hält auch bei stark perspektivisch verkleinerter Tafelseite Abstand zu den Grenzen. Eine unsichere oder manuell veränderte Ausrichtung erfordert eine ausdrückliche Prüfbestätigung. Zuverlässigkeit und Prüfstatus werden mit den Messungen gespeichert. Rohe Farbabtastung ist der vorsichtige Standard. Die optionale Referenzmarker-Korrektur schätzt aus den vier bekannten Markerrezepten eine Beleuchtungsverstärkung je Kanal. Sie kann einen Farbstich reduzieren, aber auch einen echten beleuchtungsabhängigen Unterschied verbergen.

Eine abgeschlossene Matrix speichert vorhergesagte und fotografierte sRGB-Farben neben unveränderlichen physischen Rezepten im benannten Filamentprofil. Alle gespeicherten kompatiblen Matrizen passen gemeinsam ein effektives physisches Modell neu an. Gespeicherte Farbfeldfarben, HD-Kalibrierung und rohe Matrixmessungen bleiben unverändert. Die Anpassung behandelt diese gespeicherten Werte als regularisierte Vorannahmen und schätzt aus jeder gewichteten Matrixprobe effektive RGB-Kanal-HD, effektive deckende Filamentfarbe, einen nichtlinearen Transmissionsexponenten für zusammenhängende Abschnitte desselben Filaments und eine geordnete Wechselwirkung zwischen sichtbarem Filament und Untergrund. Bei wenigen Daten bleiben die ursprünglichen Vorannahmen maßgeblich. Ein angepasstes Modell wird nur verwendet, wenn genügend Proben vorliegen und es den ΔE-Fehler zurückgehaltener Matrixdaten verbessert, ohne die schlechtesten Fehler zu verschlimmern. Eine angepasste Untergrundwechselwirkung wird bis zum dicksten zusammenhängenden Abschnitt dieses Materialpaares verwendet, der von den Matrizen beobachtet wurde. Zusätzliche ungemessene Dicke setzt von dieser gestützten Farbe aus mit der untergrundgeeigneten Keil-/HD-Vorannahme in Richtung der nominellen Filamentfarbe fort. Sie schaltet nicht den gesamten Abschnitt auf eine andere Vorhersage um und extrapoliert den angepassten Exponenten nicht unbegrenzt. Dieselbe Berechnung von Abschnittspräfixen speist Kandidatenbewertung, Rezeptvergleiche und Vorschau, auch bei gestauchten und am Schichtraster eingerasteten Stapeln.

Die Anpassung vergleicht simulierte Farben mit fotografierten sRGB-Werten anhand eines robusten Fehlermaßes, während die physische Mischung weiterhin in linearem Licht erfolgt. Dadurch erhalten Unterschiede in dunklen Kanälen genügend Gewicht, um die Anpassung zu beeinflussen. Die Strafen für Abweichungen von Vorannahmen werden je Parameterfamilie über die tatsächlich in Trainingsproben vertretenen Materialien gemittelt. Zusätzliche ungenutzte Spulen schwächen oder deaktivieren dieselbe Anpassung daher nicht. Die Validierung entscheidet weiterhin, ob das angepasste Modell verwendet wird. Bessere Übereinstimmung bei bekannten Rezepten belegt keine Genauigkeit für zuvor ungemessene Filamentpaare.

Die kompatiblen Matrizen bleiben außerdem verstreute empirische LUTs im vorhergesagten Lab- und physischen Rezeptraum. Eine neuere dünn beprobte Tafel löscht deshalb keine Rezepte einer älteren. Kromacut gewichtet jede Tafel nach geprüfter Ausrichtungszuverlässigkeit, gemessener Rezeptabdeckung, Aktualität und robuster Übereinstimmung mit Rezepten, die mindestens zwei andere Tafeln ebenfalls gemessen haben. Bei nur einer oder zwei Beobachtungen eines Rezepts bleibt die Übereinstimmung neutral, da die Daten zum Erkennen eines Ausreißers nicht ausreichen. Ein exaktes Schichtrezept fester Tiefe kombiniert seine fotografierten Lab-Beobachtungen direkt. Ein fehlendes Rezept kombiniert deterministische inverse Distanzinterpolationen benachbarter fotografierter Lab-Werte; die physische Schichtreihenfolge wird zugunsten der optisch dominanten oberen Schichten gewichtet. Interpolation ist nur innerhalb der lokalen vorhergesagten Lab-Abdeckung jeder Matrix und einer begrenzten Rezeptnachbarschaft erlaubt; andernfalls wird das gemeinsam angepasste physische Modell verwendet. Außerhalb kompatibler Matrixdaten fällt dieses Modell auf die gespeicherten Beer-Lambert-/HD-Vorannahmen zurück. Optimierungsbewertung und endgültige Vorschau verwenden dieselbe Vorhersage. Exakt-Anker aus Palette Proof haben weiterhin Vorrang vor Matrixdaten. Matrixzellen sind Beobachtungen, keine gewünschten Bildziele; eine breite Matrix zu drucken lässt die Optimierung daher nicht jeder beprobten Farbe hinterherlaufen.

## Vorhersageunsicherheit

Innerhalb der lokalen vorhergesagten Farbabdeckung einer Matrix gehen interpolierte Korrekturen mit abnehmender Datenstützung fließend zum physischen Modell zurück. Exakt fotografierte Rezepte behalten ihre gemessenen Farben. Dasselbe obere Material allein reicht zur Übertragung einer Matrixmessung nicht aus: Die vollständige gemessene Grundlage muss übereinstimmen, oder der alternative Untergrund muss hinreichend deckend und optisch gleichwertig sein sowie dieselbe unmittelbare Untergrundwechselwirkung haben.

Bei einem identisch gemessenen Rezept kann Kromacut auch eine Übertragung auf einen anderen tieferen Untergrund abschätzen, wenn der unmittelbare Untergrund dasselbe Material ist und sich die simulierten Endfarben um höchstens 1 ΔE00 unterscheiden. Die Startgrundlage muss die Deckkraft-Mindestdicke entweder aus der aktuellen Anpassung oder aus der gespeicherten HD-Vorannahme erfüllen; die Diagnose hält fest, welche davon die Dicke stützte. Ein vorhandener Druck kann dadurch die Vorannahme behalten, die seine Grundlage rechtfertigte, wenn eine spätere Anpassung die geschätzte Mindestdicke verändert. Die gemessene Korrektur wird mit verringerter Zuverlässigkeit übertragen und als **interpoliert** gekennzeichnet, da die Gleichwertigkeit des Untergrunds aus dem Modell abgeleitet und nicht unabhängig gemessen wird. Diese Ausnahme erlaubt keine allgemeine Rezeptinterpolation auf einem anderen Untergrund.

Zusätzliche Dicke desselben abschließenden Filaments kann die Korrektur eines gemessenen Präfixes fortsetzen. Ihr Einfluss wird durch den ursprünglichen physischen Abschnitt abgeschwächt und klingt spätestens nach einer zusätzlichen Dicke von einem Matrixrezept aus. Auch dies wird als interpoliert gekennzeichnet. Daraus werden keine dünneren Präfixe aus einer späteren Messung vorhergesagt; ein anderes zusätzliches Material beendet die Fortsetzung. Direkte Messungen und anwendbare Palette-Proof-Bewertungen behalten Vorrang. Diagnoseaufzeichnungen nennen die Quellproben und ob Daten auf einen anderen Untergrund übertragen oder durch zusätzliche Dicke fortgeführt wurden.

Jedes druckbare Präfix erhält zusammen mit seiner vorhergesagten Lab-Farbe eine Zuverlässigkeitsangabe. Diese hält vier Eingänge sichtbar, statt sie zu unerklärter Gewissheit zusammenzufassen:

- **Messungsabstand:** Abstand der vorhergesagten Farbe und des physischen Rezepts zum nächsten kompatiblen gemessenen Rezept.
- **Lokale Übereinstimmung:** Ob benachbarte Proben eine konsistente Korrektur von simulierter zu fotografierter Farbe beschreiben.
- **Validierungsfehler:** Die LUT sagt jedes Rezept ohne dessen eigene empirische Probe voraus und verwendet dabei dieselbe Nachbarauswahl und abnehmende Datenstützung wie zur Laufzeit. Dies ist eine bedingte Prüfung bei festgehaltenem angepasstem optischem Modell, keine unabhängige Genauigkeitsschätzung des gesamten Ablaufs. Getrennt davon wird die optische Anpassung neu geschätzt und an vollständig zurückgehaltenen Matrizen oder, bei nur einer Matrix, an gruppierten Rezept-/Untergrundwechselwirkungen geprüft.
- **Vorhersagemethode:** Eine exakte physische Beobachtung beginnt mit stärkerer Stützung als Interpolation, angepasste Schätzung oder reine Beer-Lambert-Simulation.

Die Optimierung addiert bei einer völlig unsicheren Zuordnung höchstens fünf ΔE-äquivalente Punkte. Das reicht, damit eine empirisch gestützte annähernde Zuordnung ein spekulativ perfekt wirkendes Grau schlagen kann. Der Wert bleibt aber begrenzt, damit Datenzuverlässigkeit keinen großen sichtbaren Farbfehler überstimmen kann. Exakt-Anker behalten ihren ausdrücklichen Vorrang, und Farbtrennung erhalten bewertet die Machbarkeit weiterhin anhand des unveränderten ΔE00 statt risikobereinigter Kosten. Optimierungspaletten, endgültige Vorschauschichten und gespeicherte Zielzuordnungen behalten dasselbe Zuverlässigkeitsobjekt. Suche und Darstellung können dadurch nicht unbemerkt unterschiedliche Datenannahmen verwenden.

Fotokalibrierung reagiert grundsätzlich empfindlich auf Kamera, Belichtung, Spiegelungen, Weißabgleich und Betrachtungslicht. Der kamerafreie Keil bleibt die bevorzugte Methode zur Messung der Material-HD. Nutze eine Stack Matrix für breit angelegte empirische Rezeptfarben unter kontrollierten Bedingungen und Palette Proof, wenn wenige Farben eines Bildes besonders wichtig sind.

## Deckdistanzen je Farbkanal

Filamente absorbieren Rot, Grün und Blau nicht gleich stark. Ein oranges Filament lässt beispielsweise Rot durch, blockiert aber Blau. Eine einzige skalare HD ist daher eine Näherung. Kromacut mischt mit drei kanalspezifischen Deckdistanzen:

- **Eine Grundfarbenablesung (Schnellmodus):** Der Deckkraftvergleich misst skalare HD. RGB-Kanalunterschiede bleiben eine vorsichtige Schätzung aus der Filamentfarbe, so verankert, dass der hellste Kanal der Messung entspricht.
- **Zusätzliche Grundfarbenablesungen (Genauer Modus):** Jede Grundlage beansprucht die geschätzte Kanalkurve anders. Kromacut passt eine begrenzte Stärke der Kanalselektivität und den Skalar nur so weit an, wie die quantisierten Feldintervalle es erfordern. Es behauptet nicht, dass zwei visuelle Schwellen unabhängig drei spektrale HD-Werte gemessen hätten.

Die verfeinerte Kurve wird direkt für Grundmaterialien verwendet, die tatsächlich im Keil verglichen wurden. Bei einer ungeprüften Grundlage behält Kromacut die Schnellschätzung bei, statt eine starke Farbtonverschiebung zu extrapolieren. Du kannst bei Gelegenheit weitere Grundlagen hinzufügen; drei oder vier sind aber nicht erforderlich. Vollständig unabhängige Kanal-HD, nichtlineare Transmission und untergrundspezifische Wechselwirkungen bleiben Stack-Matrix-Daten mit Prüfung zurückgehaltener Daten und der gestützten Dicke vorbehalten.

Die optionale Verschmelzungsablesung erfasst die letzte benachbarte Keilstufe, die noch unterschiedlich aussah. Sie validiert die angepasste Kurve, statt einen weiteren freien Parameter hinzuzufügen. Eine große Abweichung verringert die Zuverlässigkeit und wird in der Diagnose angezeigt.

## Die JND-Anpassung der Sitzung

Der Standard-JND von 2 ΔE00 ist eine Konstante des menschlichen Sehens; einzelne Betrachter und Beleuchtung können etwas davon abweichen. Hat eine Sitzung genügend unabhängig aussagekräftige Mehrgrundlagen-Ablesungen, kann Kromacut einen gemeinsamen JND zwischen 1 und 3 anpassen. Die Anpassung bleibt nur erhalten, wenn sie eindeutig bestimmbar ist und den Standard übertrifft. Quantisierte Keilablesungen sind gegenüber skalarer HD oft mehrdeutig; in diesem Fall behält die Sitzung zu Recht die Konstante bei.

## Zuverlässigkeit

Jede Kalibrierung hat einen Zuverlässigkeitswert dafür, wie genau die Messung eingegrenzt wurde:

- Eine Ablesung an einem Keilende, Feld 1 oder dem letzten Feld, verringert die Zuverlässigkeit: Der tatsächliche Deckkraftpunkt kann außerhalb des gedruckten Bereichs liegen. Drucke einen längeren Keil oder verwende eine feinere Schichthöhe und kalibriere erneut.
- Mehrgrundlagen-Ablesungen, die selbst bei bester Anpassung widersprechen, verringern die Zuverlässigkeit. Der Widerspruch wird an der Kalibrierung vermerkt.
- Nach sechs Monaten nimmt die Zuverlässigkeit ab, da Filamente altern und Spulen wechseln.

Unkalibrierte Filamente erhalten einen niedrigeren Wert anhand der Plausibilität ihrer geschätzten HD.

## Was sich nach der Kalibrierung ändert

Kanalspezifische Deckdistanzen beeinflussen sowohl die von Auto-paint vorhergesagten **Farben** jedes Stapels als auch die **Dicke** seiner Übergangszonen. Kalibrierung kann deshalb erzeugte Stapelhöhen und den Wechselplan ändern, nicht nur die Vorschau.

Eine Kalibrierung gehört zum gemessenen Material: Sie ist an die beim Kalibrieren verwendete Farbfeldfarbe gebunden. Das Ändern der Filamentfarbe deaktiviert sie, und eine neue Kalibrierung ersetzt die vorherige Messung, statt mit ihr gemittelt zu werden.
