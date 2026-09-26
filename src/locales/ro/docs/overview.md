---
title: Prezentare generală
slug: overview
order: 10
description: Ce face Kromacut și cum se leagă fluxurile principale de lucru.
---

# Prezentare generală

Kromacut transformă o imagine plană într-un obiect imprimat 3D din straturi colorate suprapuse. Ideea centrală este simplă: culorile imaginii devin straturi fizice, iar ordinea și înălțimea lor devin planul de imprimare.

Folosește Kromacut pentru o imprimare în stil HueForge, un relief colorat în stil litofanie sau o piesă decorativă stratificată în care schimbările de filament creează imaginea finală.

## Fluxul principal

Majoritatea proiectelor urmează aceiași pași:

1. [Încarcă sau importă o imagine](loading-images).
2. [Redu culorile](reducing-colors) până când previzualizarea are o paletă imprimabilă.
3. [Elimină ditheringul sau curăță](dedithering-cleanup) pixelii izolați dacă imaginea pare zgomotoasă.
4. Treci în [modul 3D](3d-mode) și alege Manual sau Auto-paint.
5. [Generează și exportă](generating-exporting-output) un fișier STL sau 3MF și urmează instrucțiunile de imprimare.

## Două moduri de colorare

Kromacut oferă două fluxuri de imprimare în modul 3D.

| Flux | Când îl folosești | Ce controlezi |
| ---------- | ------------------------------------------------------ | --------------------------------------------------------------------------- |
| Manual | Vrei control direct asupra fiecărei culori din imagine. | Ordinea culorilor, grosimea fiecărei secțiuni de culoare, setările de imprimare și schimbările. |
| Auto-paint | Vrei ca Kromacut să planifice stiva fizică de filamente. | Culorile filamentelor, distanțele de acoperire, înălțimea maximă și opțiunile optimizatorului. |

Modul Manual pornește de la culorile imaginii afișate în panoul **Culorile imaginii**. Auto-paint pornește de la filamentele reale și valorile lor de **distanță de acoperire (HD)**, apoi generează straturi imprimabile pentru imagine.

## Ce vezi în aplicație

Folosește 2D pentru a pregăti imaginea și 3D pentru a planifica straturile fizice. Ghidurile de mai jos urmează această distincție.

## Ghiduri ilustrate

Începe cu sarcina pe care vrei să o realizezi. Fiecare ghid explică comenzile, interacțiunile lor și consecințele asupra imprimării fizice. Diagramele sunt exemple schematice, nu predicții calibrate de culoare. Dă clic pe o ilustrație sau activeaz-o de la tastatură pentru a o deschide la dimensiune completă.

| Sarcină | Ghid |
| ------------------------------------------------------------------ | -------------------------------------------------------------- |
| Stabilește dimensiunile, înălțimile straturilor și ordinea manuală a culorilor | [Modul 3D](3d-mode) |
| Alege filamentele, optimizează amestecurile și inspectează detaliile imprimabile | [Auto-paint](auto-paint) |
| Creează o placă multimaterial plană, cu fața în sus sau în jos | [Flat Paint](flat-paint) |
| Măsoară HD, compară probe Palette Proof sau fotografiază o Stack Matrix | [Fluxuri de calibrare](calibration-workflows) |
| Pregătește silueta și retușează pixelii | [Încărcarea imaginilor](loading-images) |
| Ajustează tonurile și culorile, apoi aplică definitiv rezultatul | [Ajustările imaginii](image-adjustments) |
| Redu culorile și gestionează paletele | [Reducerea culorilor](reducing-colors) |
| Elimină punctele fără a confunda curățarea 2D cu ditheringul de înălțime | [Eliminarea ditheringului și curățarea](dedithering-cleanup) |
| Verifică stiva finală și transfer-o într-un slicer | [Generarea și exportul rezultatului](generating-exporting-output) |

## Organizarea spațiului de lucru

Spațiul de lucru are trei zone principale:

- Antetul conține documentația, comenzile pentru temă și legăturile comunității.
- Panoul din stânga conține comenzile modului curent.
    - În **2D**, afișează ajustările, eliminarea ditheringului, cuantizarea, paletele personalizate și culorile detectate în imagine.
    - În **3D**, afișează setările de imprimare, comenzile Manual și Auto-paint și instrucțiunile de imprimare.
- Previzualizarea principală afișează pânza imaginii 2D sau modelul 3D.

> Sfat: setările 3D nu regenerează automat modelul. După schimbarea setărilor de imprimare, a grosimilor manuale sau a opțiunilor Auto-paint, apasă **Generează modelul 3D**.

## Un prim proiect potrivit

Începe cu o imagine cu contrast ridicat, un subiect clar și puține detalii de fundal. Redu-o la 4–16 culori, apoi folosește modul Manual dacă știi deja ordinea straturilor sau Auto-paint dacă ai distanțe de acoperire calibrate pentru filamente.

---

În continuare: [Ghid rapid](quick-start).
