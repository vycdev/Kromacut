---
title: Generarea și exportul rezultatului
slug: generating-exporting-output
order: 70
description: Generează modelul, inspectează-l, exportă fișiere și copiază instrucțiunile de imprimare.
---

# Generarea și exportul rezultatului

Fluxul de export începe după ce imaginea 2D și comenzile 3D sunt pregătite.

![Pregătește imaginea și setările, generează un model fixat, inspectează-l, apoi exportă stiva completă. Schimbarea unei setări necesită o nouă generare; limitarea previzualizării nu limitează exportul.](40_build_export_snapshot.svg)

## Înainte de export

Verifică următoarele:

1. În modul 2D, redu imaginea la un număr practic de culori.
2. În **Setări de imprimare 3D**, alege dimensiunile fizice cu **Dimensiunea pixelului (XY)**. Potrivește **Înălțimea stratului** și **Înălțimea primului strat** cu slicerul, iar **Lățimea efectivă a liniei** cu lățimea de extrudare planificată pentru verificările detaliilor imprimabile și ditheringul de înălțime din Auto-paint.
3. Alege **Manual** sau **Auto-paint**.
4. Apasă **Generează modelul 3D**.
5. Inspectează modelul și **Previzualizarea straturilor**.

Dacă Kromacut afișează un **Avertisment de performanță**, generarea poate fi lentă din cauza dimensiunii imaginii, numărului de pixeli, numărului de straturi sau a unui volum de lucru similar. Poți continua cu **Generează oricum** sau poți anula și simplifica proiectul.

## Generarea modelului 3D

Apasă **Generează modelul 3D** ori de câte ori vrei ca previzualizarea și geometria exportată să reflecte setările 3D curente.

În timpul generării, Kromacut afișează progresul: citirea straturilor de culoare ale imaginii, maparea culorilor imaginii sau construirea straturilor colorate. Comenzile de export redevin utilizabile după dispariția suprapunerii de progres și când modelul actualizat este gata de inspecție.

Calcularea unei stive noi în Auto-paint nu este același lucru cu generarea unei geometrii noi. Exportul folosește ultimul model generat, iar Instrucțiunile de imprimare rămân legate de acea generare. După editarea imaginii, schimbarea unui profil, salvarea calibrării sau modificarea setărilor de imprimare, așteaptă calculul curent și generează din nou înainte de export. O previzualizare anterioară poate rămâne vizibilă cât timp noile setări sunt calculate sau respinse; prezența ei nu dovedește că noile setări au reușit.

## Alege STL sau 3MF

Deschide meniul de descărcare 3D și alege:

| Format | Când îl folosești |
| ------ | ------------------------------------------------------------------------------------------ |
| STL | Vrei un model cu geometrie unică, acceptat pe scară largă, și vei gestiona manual schimbările de filament. |
| 3MF | Vrei un rezultat cu informații de culoare pentru slicere care pot păstra mai multe obiecte colorate. |

Exportul 3MF păstrează, când este posibil, culorile filamentelor fizice din Auto-paint. Verifică totuși atribuirile din slicer înainte de imprimare.

O previzualizare Auto-paint poate arăta zeci de culori amestecate produse din doar câteva role reale. 3MF atribuie aceste filamente reale straturilor fizice, nu câte un material pentru fiecare amestec prezis. Vederea obișnuită a culorilor filamentelor din slicer poate deci arăta diferit de vederea **Simulate** din Kromacut, fără ca atribuirile materialelor să fie greșite. Compară cu culorile **Fizice** când verifici atribuirile.

STL nu conține culori de filament sau atribuiri automate de role. Folosește planul de schimbări copiat cu comenzile de schimbare a culorii din slicer. Un 3MF este tot un model, nu G-code gata de rulare: alege imprimanta, duza, profilurile de filament, temperaturile și vitezele proprii, apoi feliază-l.

Pentru modelele **Flat Paint**, meniul de descărcare oferă doar 3MF: modelul conține câte un obiect pentru fiecare filament fizic și, în aranjamentul implicit cu fața în jos, un obiect de suport transparent. Aranjamentul opțional cu fața în sus omite suportul. Un STL necolorat cu geometrie unică al oricăreia dintre aceste plăci ar fi inutil. Ambele orientări acceptă toate intensitățile pentru **Geometrie netezită**. Reconstruiește modelul după schimbarea intensității pentru a o aplica previzualizării și geometriei exportate.

## Instrucțiuni de imprimare

Panoul **Instrucțiuni de imprimare** oferă:

- Recomandări pentru numărul de pereți, umplere, înălțimea stratului și a primului strat.
- **Începe cu culoarea**.
- **Plan de schimbare a culorilor**, cu numere de strat și înălțimi aproximative.
- Un buton **Copiază** pentru întregul plan în text simplu.

Folosește planul copiat lângă previzualizarea slicerului. Numerele straturilor depind de **Înălțimea stratului** și **Înălțimea primului strat**, așa că păstrează aceste valori consecvente.

![Un prim strat de 0,10 mm urmat de straturi de 0,04 mm. O schimbare înainte de stratul 4 se află la limita de material de 0,18 mm, iar stratul nou se termină la 0,22 mm.](41_swap_layers.svg)

**Schimbă la stratul N** înseamnă că noul filament imprimă stratul N. De exemplu, cu primul strat de 0,10 mm și straturi normale de 0,04 mm, straturile 1, 2 și 3 se termină la 0,10, 0,14 și 0,18 mm. Pentru a începe filamentul următor la stratul 4, schimbă-l după stratul 3, înainte de extrudarea stratului 4. Stratul nou se termină la 0,22 mm.

Înălțimea aproximativă din plan necesită atenție: modul Manual afișează Z-ul superior al stratului nou, iar Auto-paint afișează limita schimbării materialului. Folosește numărul stratului și inspectează tranziția reală a materialelor din feliere, nu doar un număr Z care pare să coincidă. Slicerele pot eticheta diferit stratul selectat și punctul de inserare.

În modul Flat Paint nu există plan de schimbări manuale. Panoul rezumă în schimb fluxul multimaterial selectat: atribuie fiecărui obiect 3MF filamentul său, apoi fie folosește filament transparent și întoarce imprimarea implicită cu fața în jos, fie imprimă aranjamentul fără suport cu fața în sus. Niciun aranjament nu trebuie oglindit în slicer.

## Configurația recomandată pentru slicer

Kromacut recomandă:

- Număr de pereți: `1`
- Umplere: `100%`
- Înălțimea stratului: valoarea afișată în **Instrucțiuni de imprimare**
- Înălțimea primului strat: valoarea afișată în **Instrucțiuni de imprimare**

Inspectează întotdeauna previzualizarea slicerului înainte de imprimare. Înălțimile sunt aproximative, iar slicerele pot afișa diferit schimbările de strat în funcție de setările primului strat.

Păstrează exportul la **scară Z de 100%** și folosește o înălțime constantă a stratului, identică modelului. Schimbarea scării Z sau activarea înălțimii variabile a straturilor deplasează tranzițiile fizice și invalidează planul copiat. Dacă ai nevoie de altă înălțime de strat, seteaz-o în Kromacut și regenerează. Schimbarea scării XY modifică și detaliile imprimabile față de duză; setează dimensiunea dorită în Kromacut pentru ca verificarea lățimii liniei să folosească acea dimensiune.

Verifică în slicer insulele mici, textul, decupajele transparente deconectate, fundațiile și aranjamentul de purjare/amorsare. Netezirea contururilor nu poate face imprimabilă orice linie îngustă. Aplicația nu calibrează debitul, retragerea, temperatura sau configurația mecanică a imprimantei.

## Salvare și anulare

Exporturile din aplicația desktop deschid un dialog **Salvează ca**. În browser folosesc setările sale de descărcare, deci afișarea unei solicitări de locație depinde de browser. Anularea unui dialog de fișier nu trimite nimic imprimantei. În timpul exportului, scrierea geometriei și comprimarea arhivei pot dura; așteaptă finalizarea salvării înainte de a închide aplicația.

## Sfaturi pentru export

- Generează modelul după schimbarea setărilor 3D.
- Nu te baza doar pe intervalul vizibil din previzualizarea straturilor; exportul include modelul complet.
- Dacă geometria este prea complexă pentru generare sau feliere, decupează sau micșorează rezoluția sursei în 2D și redu regiunile de culoare inutile. Mărirea **Dimensiunii pixelului (XY)** mărește aceiași pixeli; nu le reduce numărul și nu simplifică geometria.
- Dacă instrucțiunile de schimbare sunt dezactivate din cauza prea multor culori, revino la [Reducerea culorilor](reducing-colors#image-colors).

În continuare: [Setări și comenzi](settings-and-controls).
