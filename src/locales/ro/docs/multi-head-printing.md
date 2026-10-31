---
title: Imprimare cu mai multe capete
slug: multi-head-printing
order: 65
description: Planifică atribuirile de filamente, reîncărcările capetelor și exporturile 3MF pentru imprimarea cu mai multe capete.
---

# Imprimare cu mai multe capete

Modul cu mai multe capete reorganizează stiva imprimabilă aleasă de [Auto-paint](auto-paint). Fiecare regiune a imaginii poate folosi un filament diferit pe același strat. Mai multe capete păstrează filamentele disponibile între reîncărcările manuale; analiza caută potriviri cromatice estimate mai bune și planifică reîncărcările necesare. Pot rezulta mai puține pauze, dar acest lucru nu este garantat.

## Cerințe

- Folosește **Auto-paint** cu cel puțin un filament în listă, apoi activează opțiunea **Mod cu mai multe capete**.
- Alege **2–8 capete** și setează **Profunzimea căutării**, apoi **Construiește modelul 3D**. Analiza are nevoie de cel puțin două filamente disponibile pentru a forma o fereastră utilă.

Modul cu mai multe capete și **Flat Paint** se exclud reciproc. Calibrează filamentele pe care le ai efectiv; consultă [Teoria calibrării](calibration-theory). Modul, numărul de capete și profunzimea căutării sunt memorate între sesiuni. Reconstruiește după modificarea datelor de intrare.

## Secvențe și ferestre

O **secvență** este un bloc continuu de straturi care folosesc un singur filament în stiva Auto-paint. Grosimea sa provine din rezultatul imprimabil Auto-paint, inclusiv calibrarea și limitele de înălțime, nu doar din luminozitatea imaginii sursă.

O **fereastră** cuprinde N secvențe consecutive. N este limitat de numărul de capete ales, de filamentele disponibile și de secvențele de deasupra primei secvențe, care își păstrează mereu filamentul; capetele care nu sunt necesare rămân marcate **GOL** în programul capetelor. Analiza selectează ferestre utile, fără suprapuneri; nu grupează automat toate secvențele. Secvențele din afara ferestrelor selectate își păstrează filamentul planificat și sunt incluse în programul capetelor.

![Secvențe de culoare grupate în ferestre exemplificative; secvențele rămase își păstrează filamentul planificat.](01_window_run_diagram.svg)

## Alegerea filamentelor pentru fiecare fereastră

Cu K filamente distincte într-o fereastră și N poziții de secvență, există **K^N** ordini posibile, inclusiv repetări. Analiza compară amestecurile estimate folosind diferența de culoare **ΔE** și atribuie o ordine fiecărei regiuni de culoare din imagine. O poziție de secvență nu este un cap fizic fix: programul asociază filamentele necesare cu capetele.

![Schimbarea ordinii acelorași filamente modifică amestecul estimat; culorile sunt schematice.](03_beer_lambert_blending.svg)

![Cele 27 de ordini pentru trei filamente și trei poziții, cu un tabel care arată creșterea K^N.](05_combo_search_space.svg)

**Profunzimea căutării** controlează pragul de selectare a ferestrelor, câte pot fi selectate și câte ordini sunt testate:

- **Rapid** folosește mai puține iterații de selectare a ferestrelor și un buget mai mic de combinații.
- **Echilibrat** este compromisul implicit între efort și acoperire.
- **Amănunțit** permite mai multe ferestre și un buget mai mare; poate folosi în continuare eșantionarea pentru spații mari de căutare.

În limita bugetului fiecărei profunzimi sunt testate toate combinațiile. Spațiile mai mari folosesc un eșantion limitat, determinist, împreună cu ordinea curentă. Aceleași intrări dau rezultate repetabile. Fiecare profunzime ia în calcul aceleași culori ale imaginii; o căutare mai profundă nu garantează o imprimare fizică mai bună. Pentru gruparea culorilor țintă, vezi [Gruparea culorilor](#color-grouping).

## Gruparea culorilor

Înaintea căutării, Kromacut grupează paleta în culori țintă pe care va încerca să le reproducă. Setarea **Gruparea culorilor** stabilește cum:

- **După strat (actual)** — culorile asociate aceluiași strat de imprimare în rezultatul Auto-paint sunt reunite într-o singură țintă. Nuanțe diferite pot astfel împărți aceeași țintă. Există cel mult un grup țintă pentru fiecare strat ocupat.
- **După culoare (nuanță)** — nuanțele distincte pot rămâne ținte separate pe straturile lor originale de imprimare. Paletele mari sunt reduse în limita unui buget de grupuri, păstrând cel puțin un grup pe strat ocupat; culorile de pe straturi diferite nu sunt niciodată unite.

Gruparea după culoare nu garantează o eroare de culoare mai mică sau mai multe culori imprimate. Rezultatele depind de imagine, calibrarea filamentelor, numărul de capete și ferestrele selectate. Căutarea minimizează diferența de culoare CIE76; un scor de căutare mai mic poate avea totuși o eroare CIEDE2000 mai mare. Construirea poate dura mai mult. Culorile pe care le poți imprima rămân limitate de filamente și de stivele lor fizice.

Gruparea culorilor se salvează imediat ce o modifici, înainte de construire. Reconstruiește cu fiecare opțiune și compară previzualizările imaginii tale.

## Programul capetelor și exportul

După o construire reușită, previzualizarea arată culoarea simulată atribuită fiecărei regiuni. **Culori fizice** arată filamentul real. Deschide **Instrucțiunile de imprimare** și urmează **Programul capetelor**:

- Înainte de imprimare, încarcă fiecare filament indicat în capul numerotat corespunzător. Lasă capetele marcate **GOL** neutilizate.
- La fiecare punct de control indicat pentru un strat, reîncarcă doar capetele marcate. Încărcările neschimbate sunt păstrate; nu fiecare limită de fereastră necesită pauză.
- Exportă **3MF** pentru a păstra geometria repartizată, culorile fizice ale filamentelor și atribuirile capetelor. Fișierul înregistrează numărul de capete ales ca număr de extrudoare și adaugă marcaje de pauză **M600** la punctele de schimbare din program. STL nu păstrează aceste atribuiri.

![Trei capete păstrează filamentele neschimbate între faze; doar încărcările modificate necesită reîncărcare manuală.](02_nozzle_swap_schedule.svg)

Folosește o imprimantă compatibilă cu mai multe capete. Verifică în slicer asocierea capetelor, înălțimea primului strat și a straturilor normale, precum și gestionarea pauzelor înainte de imprimare. Un punct de control poate necesita reîncărcarea mai multor capete.

## Revenire și reconstruire

Dacă analiza eșuează, nu găsește o configurație utilizabilă care îmbunătățește stiva normală sau estimează o îmbunătățire prea mică pentru a justifica schimbările de capete, se construiește un model normal cu un singur cap, cu un mesaj și culoarea de pornire și instrucțiunile de schimbare originale. Încearcă alte filamente, alt număr de capete sau altă profunzime, apoi reconstruiește.

Analiza rulează în fundal. Ieșirea din panoul 3D sau schimbarea imaginii anulează analiza în curs; reconstruiește pentru noua imagine. Instrucțiunile și exporturile descriu modelul construit, așa că reconstruiește pentru a aplica setările modificate.

În continuare: [Generarea și exportul rezultatului](generating-exporting-output).
