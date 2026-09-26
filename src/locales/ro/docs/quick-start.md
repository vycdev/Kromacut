---
title: Ghid rapid
slug: quick-start
order: 20
description: O primă utilizare practică, de la imagine la export.
---

# Ghid rapid

Acest ghid parcurge un proiect obișnuit, de la încărcarea imaginii până la export.

## Încarcă sau importă o imagine

Folosește butonul de încărcare din bara de instrumente a previzualizării sau trage o imagine în previzualizarea 2D.

După încărcare, folosește rotița mouse-ului pentru zoom și trage previzualizarea pentru deplasare. Dacă imaginea are transparență, butonul cu tablă de șah poate face zonele transparente mai ușor de văzut.

## Ajustează imaginea

În **2D**, folosește **Ajustări** înainte de reducerea culorilor. Expunerea, contrastul, zonele luminoase, umbrele, alburile, negrurile, saturația, vibranța, nuanța, temperatura, tenta și claritatea pot schimba culorile identificate de instrumentele pentru paletă.

Apasă **Aplică** în panoul Ajustări pentru a integra ajustările curente în imagine înainte de reducerea culorilor, generarea geometriei 3D sau descărcare. Ajustările live sunt doar o previzualizare, nu o imagine sursă actualizată. Consultă [Ajustările imaginii](image-adjustments) pentru exemple înainte/după și comportamentul resetării.

## Redimensionează dacă este necesar

Dacă imaginea este mult mai mare decât detaliile pe care vrei să le imprimi, folosește **Redimensionează imaginea** pentru a o micșora procentual înainte de reducerea culorilor. Astfel scad dimensiunile reale în pixeli, ceea ce poate accelera generarea ulterioară a modelului 3D și simplifica stabilirea dimensiunilor fizice.

## Redu culorile

În **Setări de cuantizare**:

1. Lasă **Paletă** pe **Auto**, dacă nu ai deja în vedere o anumită paletă.
2. Începe cu **Număr de culori** la **16**. Micșorează-l pentru mai puține regiuni de culoare sursă sau mărește-l dacă previzualizarea are nevoie de mai multe detalii. În Auto-paint, acest număr nu reprezintă numărul de role sau de schimbări.
3. Lasă **Algoritm** pe opțiunea implicită **K-means**. Este algoritmul recomandat pentru început la majoritatea imaginilor.
4. Apasă **Aplică**.

Folosește panoul **Culorile imaginii** pentru a inspecta rezultatul. Apasă o mostră pentru a o edita sau a o șterge din paletă. Ștergerea remapează pixelii la culorile rămase; folosește Radiera sau setează alfa la zero (complet transparent) pentru a elimina pixeli din siluetă.

## Elimină ditheringul sau curăță

Dacă reducerea culorilor lasă puncte izolate, folosește **Eliminare dithering** ca trecere de curățare a zgomotului. Este deosebit de utilă deoarece pixelii rătăciți individuali din imaginea 2D pot deveni bucăți individuale de geometrie în modelul 3D.

Începe cu valorile implicite pentru **Intensitate** și **Treceri**, apoi apasă **Aplică**. Mărește numărul de treceri doar dacă imaginea are încă prea mulți pixeli izolați după prima trecere.

## Activează modul 3D

Apasă **3D**. Stabilește întâi parametrii de bază ai imprimării:

- **Dimensiunea pixelului (XY)** controlează lățimea și adâncimea fizică a fiecărui pixel al imaginii.
- **Înălțimea stratului** trebuie să coincidă cu înălțimea pe care intenționezi să o folosești în slicer.
- **Înălțimea primului strat** trebuie să coincidă cu setarea primului strat din slicer.
- **Geometrie netezită** poate netezi limitele de culoare conectate pentru o geometrie mai lină.

## Alege Manual sau Auto-paint

Folosește **Manual** când vrei control direct asupra culorilor imaginii reduse. Modul Manual folosește mostrele din **Culorile imaginii**: trage culorile în ordinea de imprimare dorită, apoi folosește glisorul fiecărui rând pentru a stabili contribuția acelei culori la înălțime. Este o primă alegere bună dacă știi deja ordinea straturilor sau lucrezi cu o paletă mică și simplă.

Folosește **Auto-paint** când vrei ca Kromacut să planifice stiva fizică de filamente. Auto-paint pornește de la filamentele tale reale, nu de la mostrele imaginii reduse, apoi folosește culoarea și **Distanța de acoperire (HD)** a fiecărui filament — adâncimea la care acoperă ce se află dedesubt — pentru a estima aspectul straturilor suprapuse.

Pentru prima utilizare Auto-paint:

1. Adaugă filamentele cu care intenționezi efectiv să imprimi.
2. Setează cât mai precis culoarea fiecărui filament.
3. Setează **HD** pentru fiecare filament. Estimarea cu bagheta este potrivită pentru experimente și poți converti o valoare TD convențională (≈10× HD); distanțele de acoperire calibrate dau de obicei cele mai bune rezultate.
4. Lasă inițial **Înălțime maximă** pe **Auto**.
5. Activează **Potrivire îmbunătățită a culorilor** dacă primul rezultat ratează culori importante sau dacă vrei ca optimizatorul să caute o ordine mai bună a filamentelor.

După ce Auto-paint calculează o stivă, verifică zonele de tranziție și detaliile de încredere înainte de export. Încrederea redusă înseamnă de obicei că setului de filamente îi lipsește o culoare utilă, distanțele de acoperire necesită calibrare sau înălțimea maximă este prea restrictivă.

## Generează și exportă

Apasă **Generează modelul 3D**. Când apare modelul, folosește glisorul **Previzualizarea straturilor** pentru a inspecta construirea imprimării de jos în sus.

Deschide meniul de descărcare și alege **Descarcă STL** sau **Descarcă 3MF**. Apoi copiază **Instrucțiunile de imprimare**, ca să ai culoarea de început, straturile de schimbare și setările recomandate pentru slicer.

În continuare: [Modul 3D](3d-mode), [Auto-paint](auto-paint) sau [Generarea și exportul rezultatului](generating-exporting-output#before-you-export).
