---
title: Modul 3D
slug: 3d-mode
order: 60
description: Dimensiuni fizice, succesiuni manuale de culori, geometrie și comenzi de previzualizare.
---

# Modul 3D

Modul 3D transformă culorile imaginii în straturi fizice. Pregătește imaginea în 2D, alege dimensiunile și metoda de imprimare, apoi apasă **Generează modelul 3D**. Schimbarea unei setări nu regenerează automat modelul afișat.

Folosește **Manual** pentru a alege singur ordinea culorilor și grosimea. Folosește **Auto-paint** pentru a prezice amestecurile filamentelor reale și a găsi o stivă pentru imagine. Niciuna dintre metode nu comandă imprimanta: exportă modelul și verifică-l în slicer.

## Setări de imprimare 3D

| Comandă | Efect asupra modelului | Ce verifici |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Dimensiunea pixelului (XY)** | Milimetri pe pixel al imaginii în ambele direcții orizontale. | Indicatorul **Model** estimează lățimea, înălțimea și adâncimea fizică înainte de generare. |
| **Înălțimea stratului** | Pasul vertical normal folosit pentru înălțimi și schimbări. | Potrivește-l cu slicerul. Straturile mai mici oferă înălțimi mai fine, nu linii de extrudare mai înguste. |
| **Înălțimea primului strat** | Primul pas deasupra plăcii. | Potrivește-l separat. Prima culoare trebuie să aibă cel puțin valoarea mai mare dintre înălțimea normală și cea a primului strat. |
| **Lățimea efectivă a liniei** | Lățimea de extrudare folosită pentru verificările detaliilor imprimabile și ditheringul de înălțime din Auto-paint. | Potrivește-o cu lățimea de linie dorită în slicer, nu cu diametrul duzei sau dimensiunea pixelului. Nu schimbă profilul imprimantei. |
| **Geometrie netezită** | Transformă limitele în trepte de pixeli în contururi conectate netezite. | Schimbă geometria exportată, nu doar iluminarea. Nu adaugă detalii imaginii și nu calcă suprafața. |
| **Resetează** | Restabilește 0,1 mm/pixel, straturi normale de 0,12 mm, primul strat de 0,2 mm, lățimea efectivă a liniei de 0,42 mm și netezirea dezactivată. | Resetează și grosimile manuale la minime, păstrând ordinea curentă a culorilor. |

### Dimensiunea pixelului nu este dimensiunea duzei

O imagine lată de 1000 de pixeli la **0,1 mm/pixel** produce un model lat de aproximativ **100 mm**. La **0,2 mm/pixel**, ajunge la aproximativ **200 mm** cu exact aceiași pixeli. Marginile exterioare transparente sunt excluse din limitele modelului.

![Aceeași grilă de imagine devine fizic mai mare când crește dimensiunea pixelului; redimensionarea imaginii schimbă în schimb numărul de pixeli.](10_physical_size.svg)

_Schemă. Dimensiunea XY, rezoluția imaginii și lățimea de extrudare sunt comenzi separate._

Pentru a păstra lățimea de 100 mm cu 2000 de pixeli, folosește **0,05 mm/pixel**. Mai mulți pixeli pot descrie margini mai fine, dar imprimanta are în continuare o limită de lățime a extrudării. Setează **Lățimea efectivă a liniei** în **Setări de imprimare 3D**, apoi folosește [previzualizarea detaliilor imprimabile](auto-paint#printable-detail) din Auto-paint pentru a inspecta această limitare.

Mărirea dimensiunii pixelului nu reduce numărul de pixeli și nu face geometria în mod inerent mai ușor de generat. Pentru o generare mai ușoară, redimensionează sau decupează în [modul 2D](loading-images) ori simplifică paleta.

### Lățimea efectivă a liniei

Copiază lățimea de extrudare dorită din slicer în **Lățimea efectivă a liniei**. Acceptă 0,1–2 mm. Resetarea **Setărilor de imprimare 3D** o readuce la 0,42 mm, împreună cu celelalte valori implicite ale secțiunii. Editarea acestui câmp nu schimbă profilul imprimantei.

Auto-paint folosește lățimea pentru previzualizarea avertismentelor, curățarea opțională a punctelor de culoare izolate și dimensiunea blocurilor de dithering de înălțime. Comenzile de inspectare a avertismentelor sau de omitere a punctelor izolate rămân în [Auto-paint](auto-paint#printable-detail). Avertismentele nu înseamnă că un element va fi eliminat sau că nu poate fi imprimat.

### Înălțimile straturilor și limitele valide

Cu **primul strat de 0,20 mm** și **straturi normale de 0,08 mm**, suprafețele straturilor se află la 0,20, 0,28, 0,36 și 0,44 mm. Nu la 0,08, 0,16, 0,24 și 0,32 mm. Kromacut reconciliază grosimile culorilor cu această grilă.

Schimbarea **Înălțimii stratului** resetează grosimile manuale la noul pas normal, apoi aplică minimul primei culori. Schimbarea **Înălțimii primului strat** resetează prima culoare la noul minim. Stabilește-le înainte de reglarea glisoarelor și verifică din nou planul dacă se schimbă.

Câmpurile acceptă intervale largi ale aplicației: 0,01–10 mm/pixel pentru Dimensiunea pixelului, 0,01–10 mm pentru Înălțimea stratului și 0–10 mm pentru Înălțimea primului strat. Acestea sunt limite de intrare, nu setări recomandate de imprimare; prima culoare este în continuare reconciliată cu minimul său fizic. Folosește valori acceptate de duză, material și slicer. O înălțime mai fină schimbă rețetele disponibile în Auto-paint; nu face automat compatibilă calibrarea existentă.

## Modul Manual

**Înălțimile secțiunilor de culoare** listează **Culorile imaginii** netransparente. Fiecare rând are un mâner de tragere, o mostră de culoare, un glisor de grosime și o valoare în milimetri. Valoarea reprezintă grosimea secvenței de culoare, nu înălțimea sa superioară absolută. O secvență poate acoperi mai multe straturi de slicer.

![Trei secvențe manuale formează înălțimi cumulative; mărirea unei secvențe inferioare ridică fiecare suprafață ulterioară.](11_manual_layers.svg)

_Secțiune schematică. Suprafața unei culori ulterioare conține dedesubt secvențele anterioare._

De exemplu, setează negrul la **0,20 mm**, roșul la **0,16 mm** și albul la **0,08 mm**, cu straturi normale de 0,08 mm. Regiunile negre se opresc la 0,20 mm, cele roșii la 0,36 mm, iar cele albe la 0,44 mm. Roșul începe la stratul 2 al slicerului; albul la stratul 4. Confirmă instrucțiunile generate și interpretarea slicerului înainte de imprimare.

### Reordonează culorile

Trage rândurile de sus în jos în ordinea imprimării. Rândul de sus începe pe placă. Rândurile ulterioare se imprimă peste cele anterioare doar unde imaginea are nevoie de ele, formând relief în trepte. Mutarea unei culori îi schimbă materialul de dedesubt, înălțimea suprafeței și secvența de schimbări. Un rând mutat primul este ridicat la minimul primului strat, dacă este necesar.

Previzualizarea și exportul Manual folosesc culorile imaginii, nu modelul HD Auto-paint. Un strat subțire de roșu peste negru se poate imprima mai întunecat decât mostra, chiar dacă previzualizarea manuală pare roșie. Alege materialele și grosimile în consecință.

### Ajustează și resetează grosimile

Trage un glisor și eliberează-l pentru confirmare. Secvențele ulterioare avansează în pași de **Înălțimea stratului**. Prima începe de la minim și adaugă pași normali. Mărirea unei secvențe inferioare ridică toate suprafețele ulterioare și mută schimbările lor, nu doar regiunile unde culoarea inferioară rămâne vizibilă.

Resetarea **Înălțimilor secțiunilor de culoare** sortează de la întunecat la luminos după luminanță și atribuie grosimi minime. Diferă de resetarea **Setărilor de imprimare 3D**, care schimbă și parametrii fizici, dar păstrează ordinea.

Comenzile Manual și instrucțiunile de schimbare acceptă **64 de culori**. Redu paletele mai mari în 2D. Pixelii complet transparenți nu creează material, nici suport alb. Insulele opace deconectate rămân piese separate dacă imaginea nu le conectează.

## Geometrie netezită

Cu netezirea oprită, contururile urmează grila pătrată de pixeli. Cu ea pornită, limitele conectate sunt netezite într-o geometrie sudată. Diferența se exportă, nu este un filtru de previzualizare.

Netezește contururile modelului în previzualizare și exporturi. Medie păstrează netezirea originală. Reconstruiește pentru aplicare.

| Intensitate | Utilizare |
| --- | --- |
| **Fără** | Pixel art, margini exacte pe grilă sau generarea cea mai rapidă. |
| **Minimă** | Netezire ușoară a colțurilor zimțate. |
| **Medie** | Rezultatul familiar al setării activate anterior. |
| **Intensă** | Netezire mai puternică de-a lungul contururilor, inclusiv a treptelor rămase, cu aceeași limită de deplasare ca Medie. |

Deplasarea rămâne sub jumătate de pixel. Reconstruiește modelul și verifică previzualizarea în slicer. Setările vechi activat/dezactivat devin Medie/Fără.

![Contururi diagonale în trepte de pixeli și netezite, comparate pe aceeași grilă sursă.](12_smooth_boundaries.svg)

_Comparație schematică de contururi, nu simulare de slicer._

Folosește-o pentru contururi curbe sau diagonale care par prea treptate. Las-o oprită pentru pixel art intenționat sau margini exacte de grilă. Niciuna dintre opțiuni nu repară detalii prea mici pentru imprimare și nu inventează rezoluție sursă lipsă.

Geometria netezită este inactivă în [Flat Paint](flat-paint). Activarea ei dezactivează Flat Paint; Flat Paint folosește în schimb construcția sa de placă cu amprentă completă.

## Auto-paint

Auto-paint primește culori reale de filament și **Distanța de acoperire (HD)**, prezice amestecuri și mapează culorile imaginii la înălțimi imprimabile. Citește [Comenzi Auto-paint](auto-paint) pentru toate comenzile de filament, potrivire, detaliu și încredere.

## Calibrarea distanței de acoperire a filamentului

**Calibrează**, sub lista de filamente, deschide **Distanță de acoperire**, **Palette Proof** și **Stack Matrix**. Urmează [Fluxuri de calibrare](calibration-workflows) pentru imprimarea și înregistrarea rezultatelor sau [Teoria calibrării](calibration-theory) pentru modelul optic.

## Profiluri de filamente

Profilurile stochează seturi denumite de filamente și date compatibile. Editările nesalvate nu sunt scrise automat în profilul selectat. Consultă [Filamente și profiluri](auto-paint#filament-profiles) și [fișiere de profil](settings-and-controls#filament-profile-files).

### Șabloane

Șabloanele sunt seturi de referință ale furnizorilor, doar pentru citire, nu măsurători ale rolelor tale. Încarcă, ajustează, calibrează, apoi **Salvează ca profil nou**. Consultă [Șabloane](auto-paint#templates).

## Înălțimea maximă

Limita scurtează tranzițiile Auto-paint pe limite valide de strat, dar nu poate elimina fundația opacă. Citește [Înălțimea maximă](auto-paint#max-height), inclusiv observația despre suportul Flat Paint.

## Detalii imprimabile

Setează **Lățimea efectivă a liniei** în **Setări de imprimare 3D**, apoi folosește **Deschide previzualizarea** în Auto-paint pentru a inspecta regiunile înguste de culoare sursă. **Omite punctele de culoare izolate** înlocuiește opțional culorile folosite doar în puncte minuscule închise, păstrând liniile subțiri și detaliile conectate. Avertismentele și numărul efectiv de pixeli omiși sunt afișate separat. Consultă [Detalii imprimabile](auto-paint#printable-detail).

## Potrivire îmbunătățită a culorilor

Caută ordini de material cu repetări, cerințe de culori distincte sau dithering spațial de înălțime. Acestea implică compromisuri între acoperirea culorilor, grosime, schimbări și calcul. Consultă [Potrivire îmbunătățită a culorilor](auto-paint#enhanced-color-matching).

## Flat Paint

Creează o placă multimaterial în locul reliefului în trepte, fie cu fața în jos și suport transparent, fie cu fața în sus fără suport. Citește [Flat Paint](flat-paint) înainte de export, deoarece direcția de vizualizare și atribuirea obiectelor contează.

## Setările optimizatorului

**Algoritm**, **Prioritatea regiunii**, **Detalierea tranzițiilor** și **Sămânța aleatorie** reglează potrivirea, nu viteza imprimantei. Consultă [Setările optimizatorului](auto-paint#optimizer-settings).

## Zonele de tranziție și încrederea

Zonele descriu secvențe fizice; încrederea descrie datele și limitele modelării, nu precizia măsurată a imprimării. Consultă [Interpretarea rezultatului](auto-paint#transition-zones-and-confidence).

## Palette Proof

Compară o probă imprimată cu culori selectate ale imaginii și înregistrează candidații care se potrivesc. Consultă [Fluxuri de calibrare](calibration-workflows#palette-proof-compare-artwork-colors).

## Stack Matrix

Fotografiază o placă de rețete salvată, verifică alinierea și salvează culorile măsurate pentru stive compatibile. Consultă [Fluxuri de calibrare](calibration-workflows#stack-matrix-photograph-known-recipes).

## Comenzi de previzualizare

Trage cu butonul principal al mouse-ului pentru orbitare, folosește rotița pentru zoom și trage cu butonul secundar pentru deplasare. Mișcarea camerei nu schimbă niciodată dimensiunile fizice.

| Comandă din bară | Utilizare | Efect asupra imprimării |
| ------------------ | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| **Culori exacte** | Compară mostrele selectate fără iluminarea scenei sau mapare tonală cinematografică. | Doar previzualizare. Depinde în continuare de model și ecran; nu validează calibrarea. |
| **Umbrire** | Inspectează relieful și forma iluminate. | Doar previzualizare; iluminarea schimbă culoarea aparentă. |
| **Transparent** | Vezi straturile suprapuse. | Doar previzualizare; nu face filamentul transparent. |
| **Schelet** | Inspectează muchiile elementelor colorate pe straturi. | Doar previzualizare; nu sunt trasee de extrudare. |
| **Culori de previzualizare** | Comută între amestecurile simulate Auto-paint și culorile fizice ale filamentelor. | Doar previzualizare. Exporturile păstrează atribuirile reale de material. |
| **Comutator cameră** | Adâncime în perspectivă sau aliniere ortografică fără scurtare perspectivă. | Doar previzualizare. Poziția camerei se păstrează. |
| **Anulează / Refă** | Parcurge istoricul comun al editării imaginii. | Nu este un istoric de anulare pentru câmpuri 3D sau editări de filament. Regenerează după schimbarea imaginii. |
| **Descarcă** | Exportă STL sau 3MF generat. | Folosește ultimul model generat, nu setări laterale neaplicate. |

Modul de vizualizare și alegerile simulate/fizice sunt memorate. **Culori de previzualizare** apare doar pentru un model Auto-paint generat.

## Previzualizarea straturilor

Trage mânerele inferior și superior ale barei de jos pentru a izola un interval de înălțime. Pozițiile se aliniază la grila straturilor. Treci cursorul peste segmentele de material pentru informații despre început sau schimbare.

![Mânerele limitelor ascund straturi pentru inspecție, dar exportul conține în continuare modelul complet.](19_preview_only.svg)

_Schemă. Ascunderea unui strat pe ecran nu îl șterge niciodată din export._

Flat Paint are o bară simplă, deoarece mai multe materiale pot ocupa un strat imprimat. Rotește camera sub aranjamentul implicit cu fața în jos pentru a-i vedea imaginea.

Un calcul Auto-paint eșuat poate lăsa vizibil ultimul model generat cu succes. Nu îl considera dovada că noile setări au funcționat. Instrucțiunile de imprimare folosesc modelul fixat la generare când există. Rezolvă eroarea, generează din nou, apoi inspectează și exportă.

În continuare: [Comenzi Auto-paint](auto-paint), [Flat Paint](flat-paint) sau [Generarea și exportul rezultatului](generating-exporting-output).
