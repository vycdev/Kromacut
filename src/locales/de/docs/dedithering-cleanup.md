---
title: Rasterglättung und Bereinigung
slug: dedithering-cleanup
order: 50
description: Nachbarschaftsbereinigung nach exakter Farbe und ihre Auswirkungen auf Punkte, Kanten, Transparenz und druckbare Inseln.
---

# Rasterglättung und Bereinigung

**Raster glätten** ersetzt Pixel, deren Farbe in der unmittelbaren Umgebung nicht ausreichend vertreten ist, durch Nachbarfarben. Es ist ein eigener Schritt zur Bildbereinigung, kein Quantisierungsalgorithmus und keine Simulation dessen, was deine Düse drucken kann.

Nutze die Funktion bei Dither-Mustern aus wiederkehrenden Farben oder bei einem reduzierten Bild mit einzelnen Farbpunkten. Sie kann vor der Quantisierung helfen, wenn die Quelle bereits solche Muster enthält, oder danach bei reduzierten Farbbereichen. Sie ist kein Filter für fotografisches Bildrauschen: Benachbarte Fotopixel haben oft geringfügig unterschiedliche exakte Farben.

## Wie ein Pixel ausgewählt wird

![Die acht umgebenden Pixel stimmen nach exakter Farbe ab. Die Stärke legt fest, wie viele übereinstimmende Nachbarn den mittleren Pixel erhalten; weitere Durchläufe verwenden das vorherige Ergebnis.](36_dedither_neighbors.svg)

Jeder Pixel prüft seine acht unmittelbaren Nachbarn einschließlich der Diagonalen. Stimmen genügend Nachbarn in **RGB und Alpha exakt** überein, bleibt er erhalten. Andernfalls übernimmt er die häufigste abweichende Nachbarfarbe. Bei Gleichstand wird zufällig gewählt. Identische Einstellungen müssen daher nicht zu identischen Ergebnissen führen.

Es werden nur vorhandene Nachbarfarben einschließlich transparenter Pixel verwendet. Daraus wird kein neuer Farbton gemittelt.

## Stärke

**Stärke** ist die Zahl übereinstimmender Nachbarn, die zum Erhalt des ursprünglichen Pixels nötig ist. Bereich **1 bis 9**, Standard **4**.

| Beispiel | Ergebnis |
| ------------------------------------ | ------------------------------------------------------------ |
| Keine übereinstimmenden Nachbarn | Ändert sich auch bei Stärke 1, wenn eine andere Nachbarfarbe vorhanden ist. |
| Drei übereinstimmende Nachbarn | Bleibt bei Stärke 3 erhalten; kann bei Stärke 4 ersetzt werden. |
| Mitte und alle acht Nachbarn stimmen überein | Bleibt auch bei Stärke 9 erhalten, da keine andere Nachbarfarbe vorhanden ist. |

Niedrigere Werte erhalten eher Details; höhere Werte geben mehr Pixel zur Ersetzung frei. Bei nur acht Nachbarn kann Stärke 9 die Erhaltungsschwelle nie erreichen. Dies ist eine aggressive Grenzeinstellung, kein größerer Radius. Pixel am Bildrand haben außerdem weniger verfügbare Nachbarn.

## Durchläufe

**Durchläufe** wiederholt die Bereinigung **1 bis 10** Mal, standardmäßig **1** Mal. Jeder Durchlauf liest das vollständige vorherige Ergebnis. Zusätzliche Durchläufe können hartnäckige Punkte entfernen, aber auch Kanten verschieben, schmale Verbindungen trennen oder kleine Schrift entfernen.

Die einzelnen Rücksetz-Pfeile stellen Stärke 4 beziehungsweise 1 Durchlauf wieder her. Das Zurücksetzen des Bereichs setzt beide Werte zurück. Keine dieser Aktionen stellt das vorherige Bild wieder her; dafür dient Rückgängig.

## Anwenden und prüfen

1. Klicke zuerst bei aktiven Bildanpassungen auf **Anwenden**. Die Rasterglättung liest die angepasste Ansicht. Durch vorheriges Übernehmen vermeidest du, dass dieselben laufenden Anpassungen zusätzlich auf das bereinigte Ergebnis wirken.
2. Beginne mit einem Durchlauf. Die Stärke ist standardmäßig 4; probiere niedrigere Werte, wenn feine Details wichtig sind.
3. Klicke auf **Anwenden** und prüfe anschließend Konturen, Schrift und transparente Kanten bei hoher Vergrößerung.
4. Mache die Änderung rückgängig, bevor du eine andere Einstellung am gleichen Ausgangsbild vergleichst.

Wiederholtes Klicken auf Anwenden bereinigt das bereits bereinigte Bild weiter. Es sind keine unabhängigen Vergleiche mit dem Original.

## Auswirkungen auf den Druck

Das Entfernen vereinzelter andersfarbiger Pixel kann winzige Farbinseln beseitigen, aber auch gewünschte Details entfernen. Alpha nimmt an der Abstimmung teil. Die Rasterglättung kann deshalb die Silhouette vergrößern oder verkleinern und Löcher öffnen oder schließen.

Sie arbeitet in **Bildpixeln**, nicht in Millimetern. Ein drei Pixel breites Detail bei 0,1 mm/Pixel misst 0,3 mm, bevor spätere Entscheidungen bei Vernetzung oder Slicing hinzukommen. Die Rasterglättung kennt keinen Düsendurchmesser. Prüfe physische Details mit den [Steuerelementen für druckbare Details in 3D](3d-mode) und der Slicer-Vorschau.

## Rasterglättung und Höhen-Dithering

| Werkzeug | Bereich | Was sich ändert |
| ---------------- | ---------------- | -------------------------------------------------------------------------------- |
| Raster glätten | 2D | Bereiche exakter Farben und möglicherweise die transparente Kontur des Quellbilds. |
| Höhen-Dithering | Auto-paint in 3D | Das erzeugte Oberflächenhöhenmuster zur Annäherung an Zielfarben. |

Die Verwendung des einen aktiviert das andere nicht. Wende die Rasterglättung nicht an, wenn absichtliche Pixelkunst oder Punktmuster erhalten bleiben sollen.

Weiter: [3D-Modus](3d-mode).
