---
title: Fluxuri de calibrare
slug: calibration-workflows
order: 65
description: Alege un instrument de calibrare, înțelege comenzile sale și află ce măsurători se aplică următoarei imprimări.
---

# Fluxuri de calibrare

Calibrarea ajută Auto-paint să prezică aspectul filamentelor suprapuse. Nu este calibrarea imprimantei: aceste instrumente nu reglează extrudarea, temperaturile, nivelarea patului sau setările duzei. Folosește întâi o configurație de slicer fiabilă, apoi măsoară aceleași materiale și condiții de vizualizare pe care intenționezi să le folosești pentru lucrări.

Deschide **3D → Auto-paint → Calibrează**. Dialogul conține **Distanță de acoperire**, **Palette Proof** și **Stack Matrix**. Măsoară lucruri diferite și pot fi folosite împreună.

![Trei căi de calibrare: o pană măsoară opacitatea filamentului, Palette Proof compară câteva culori ale imaginii, iar o Stack Matrix fotografiată măsoară multe rețete. Toate contribuie la culorile prezise și stiva imprimabilă.](20_calibration_choices.svg)

| Instrument | Când îl folosești | Ce furnizezi | Ce se poate schimba după aceea |
| --------------- | ------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Distanță de acoperire | Opacitatea unui filament este necunoscută sau doar estimată | Prima treaptă a penei care se potrivește cu bara de referință | HD, estimările canalelor, grosimea tranzițiilor, înălțimea totală și planul de schimbări |
| Palette Proof | Câteva culori dintr-o imagine contează cel mai mult | Candidații imprimați cei mai apropiați și calitatea potrivirii | Predicții locale de culoare și preferințe de stivă; posibil ordinea, înălțimile și geometria |
| Stack Matrix | Vrei culori măsurate pentru multe rețete scurte | O fotografie frontal iluminată, aliniată corect | Predicții ale rețetelor măsurate, interpolare locală și o ajustare fizică validată |

Niciun instrument nu mărește rezoluția XY a imprimantei și nu face realizabilă fiecare culoare țintă. Un profil bine calibrat poate avea totuși o gamă cromatică limitată. Pentru modelul de bază, consultă [Teoria calibrării](calibration-theory).

## Pregătește și protejează profilul de filamente

Un rând de filament descrie o rolă reală, nu o culoare dorită a imaginii.

| Comandă | Ce face | Consecință importantă |
| -------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Mostră de culoare / Hex | Stabilește culoarea opacă nominală a filamentului | Schimbarea ei dezactivează calibrarea cu pană măsurată pentru vechea culoare. Schimbă și compatibilitatea cu datele de aspect salvate. |
| Nume | Dă rolei o etichetă lizibilă | Schimbarea etichetei nu îi schimbă optica. Salvează editarea înainte de a urmări probe sau matrice. |
| Câmp HD | Introduce distanța de acoperire frontală în mm, de la 0,01 la 2 | HD mai mare cere în general mai multă grosime pentru acoperirea substratului. Confirmarea unei valori manuale șterge calibrarea cu pană. |
| Convertește din TD | Convertește TD convențional pentru retroiluminare/litofanie în HD folosind aproximativ TD × 0,1 | Introdu TD convențional aici, nu în câmpul HD. Valoarea convertită este o estimare și înlocuiește calibrarea cu pană. |
| Baghetă | Estimează HD din culoarea mostrei | Utilă ca punct de pornire, nu ca măsurătoare. Înlocuiește orice calibrare cu pană existentă. |
| Indicator de calibrare | Afișează Estimare sau eticheta de calitate a unei calibrări măsurate | Treci cursorul pentru a inspecta HD pe canale. Eticheta nu garantează că lucrarea finală va corespunde sursei. |
| Adaugă filament / coș | Adaugă sau elimină o rolă din setul de lucru | Culorile fizice disponibile și compatibilitatea datelor se pot schimba. |

Folosește bara **Profiluri** pentru a păstra un set denumit, nemodificat, înainte de a înregistra date de aspect:

- **Lista de profiluri:** încarcă un set salvat în filamentele de lucru. Încărcarea altui set înlocuiește lista curentă, deci salvează mai întâi editările pe care vrei să le păstrezi.
- **Salvează profilul selectat:** suprascrie lista sa de filamente cu valorile de lucru. Înregistrările existente ale probelor și matricelor sunt păstrate, dar cele incompatibile nu se mai aplică setului schimbat.
- **Salvează ca profil nou:** creează un set separat de filamente, cu nume. Copiază rândurile și măsurătorile lor cu pană, nu istoricul probelor și matricelor din vechiul profil.
- **Redenumește:** schimbă eticheta profilului fără a-i schimba măsurătorile.
- **Importă:** încarcă fișiere de filamente. **Exportă** face o copie de siguranță a unui profil denumit fără modificări nesalvate, inclusiv evaluările probelor și măsurătorile matricelor, ca `.kfil`. Desktop deschide Salvează ca; exportul web urmează comportamentul de descărcare al browserului.
- **Șterge profilul selectat:** elimină profilul salvat și datele sale. Exportă întâi o copie de siguranță dacă ai putea avea nevoie de el din nou.

Indicatorul **modificări nesalvate** înseamnă că setul de lucru diferă de profilul selectat. Salvează-l sau suprascrie-l înainte de crearea unei matrice ori înregistrarea rezultatelor probelor. Exportarea cu modificări nesalvate creează un profil de „editări nesalvate” fără vechiul istoric de aspect; nu este o copie completă a acelui istoric. Șabloanele sunt seturi inițiale doar pentru citire, cu HD estimat, deci salvează o copie proprie înainte de calibrare. Consultă [formatele de profil și gestionarea importului](settings-and-controls#filament-profile-files).

## Distanța de acoperire: citește o pană

### 1. Selectează filamentele și bazele

Selectează unul sau mai multe filamente ori folosește **Selectează tot / Deselectează tot**, apoi alege **Următorul: Bază**.

- **Rapid** folosește o bază pentru fiecare filament. Măsoară un prag scalar de opacitate și păstrează diferențe conservatoare între canale, estimate din mostră.
- **Precis** permite selectarea a până la trei baze pentru fiecare filament, recomandând inițial două baze utile când există. Fiecare bază produce o citire separată a penei. Rafinarea privește o estimare constrânsă a canalelor; nu măsoară independent trei canale spectrale.
- **Mostrele de bază** aleg ce se imprimă sub acel filament. Folosește o bază contrastantă, ca treptele subțiri să difere vizibil de bară. O bază și un filament aproape identice nu oferă un prag de opacitate util.

Comutarea Rapid/Precis resetează selecția bazelor la recomandările modului. Modul Precis este util când poți compara același material peste mai multe substraturi, nu doar pentru că numele său promite un rezultat universal mai bun.

### 2. Configurează pana și imprim-o

![O pană de calibrare are trepte tot mai groase lângă o bară de referință opacă; prima treaptă identică furnizează măsurătoarea.](07_calibration_wedge.svg)

| Comandă | Efect asupra imprimării de calibrare |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Înălțimea stratului (mm) | Stabilește grosimea fiecărui strat suplimentar al treptelor penei. Câmpul acceptă 0,04–0,40 mm. O înălțime mai fină oferă pași de măsurare mai fini, dar nu face fiabilă o configurație de imprimantă neacceptată. |
| Straturi maxime (lungimea penei) | Alege 4–40 de trepte. Mai multe trepte extind intervalul măsurabil pentru filament translucid și fac pana mai lungă și mai înaltă. |
| STL (orice imprimantă) | Descarcă o piesă necolorată. Imprimă o copie pentru fiecare pereche filament/bază selectată și folosește schimbarea manuală indicată. |
| 3MF (multimaterial) | Include toate citirile selectate, cu atribuirile lor reale de filament/bază, într-un singur fișier. Verifică maparea materialelor în slicer. |
| Descarcă | Exportă planul curent al penei. Etapa rezultatelor folosește înălțimea stratului și bazele acelui plan, nu o editare ulterioară fără legătură. |

Folosește exact **înălțimea normală a stratului**, **înălțimea primului strat** și **schimbarea după strat / Z** afișate. Înălțimea primului strat provine din setările de imprimare; comanda proprie de înălțime a stratului penei este separată de setarea modelului 3D normal. Nu scala modelul pe Z. **Următorul: Introdu rezultatele** deschide etapa de citire; descărcarea nu trimite nimic imprimantei.

Pe desktop, ambele formate ale penei deschid **Salvează ca**; în browser folosesc descărcarea obișnuită. Așteaptă finalizarea exportului înainte de a schimba setări sau a introduce rezultate. Anularea Salvează ca sau un export eșuat lasă neschimbat ultimul plan de pană descărcat cu succes; dacă salvarea eșuează, apare o eroare pentru a putea reîncerca.

### 3. Compară și salvează

Privește pana imprimată cu fața în sus, sub iluminarea frontală dorită. Clapeta marchează capătul cu un strat. Compară fiecare treaptă cu bara de referință alăturată, nu cu o fotografie de telefon sau o mostră pe ecran.

- **Potrivire:** introdu numărul primei trepte care arată identic cu bara. Este numărul straturilor de filament adăugate ale treptei, nu numărul absolut al stratului imprimantei.
- **Contopire (opțional):** introdu ultima treaptă care încă părea diferită de cea anterioară. Verifică forma curbei ajustate; nu este o a doua măsurătoare obligatorie de opacitate. O valoare de contopire după Potrivire primește un avertisment.
- **Mostre prezise / HD / încredere / diagnostice:** arată rezultatul dedus din citirile tale. Sunt feedback, nu măsurători suplimentare pe care trebuie să le furnizezi.
- **Salvează calibrarea:** aplică măsurători complete și utilizabile ale filamentelor. Un filament gol este **Neintrodus** și rămâne neschimbat. Un filament Precis completat parțial este **Nu se va salva** până când fiecare bază aleasă are o valoare Potrivire. Poți salva alte filamente complete fără să termini întreaga foaie.

Dacă și ultima treaptă diferă de bară, nu o declara potrivită doar ca să termini: creează o pană mai lungă. Dacă prima treaptă se potrivește deja, o înălțime de strat mai fină și imprimabilă sau o bază mai contrastantă poate face măsurătoarea mai informativă. Citirile de la capetele intervalului disponibil au încredere mai mică.

Recalibrarea unui filament înlocuiește rezultatul său anterior cu pană. Pentru a combina mai multe baze, citește-le împreună într-o singură sesiune Precis. Salvează/suprascrie apoi profilul denumit și exportă o copie de siguranță. HD măsurat schimbă atât culoarea prezisă, cât și cantitatea de material considerată necesară de Auto-paint; regenerează și verifică noile înălțimi și instrucțiuni de schimbare.

**Înapoi** permite revenirea la pașii asistentului. Închiderea dialogului resetează selecțiile și citirile nesalvate ale penei, deci salvează rezultatele utilizabile înainte de ieșire. Dacă mai multe citiri complete pe baze multiple declanșează ajustarea sesiunii, așteaptă finalizarea înainte de salvare; calculul în așteptare nu este încă o măsurătoare pe care trebuie să o introduci.

### Exemplu imprimat: opt filamente

![Opt pene HD imprimate, cu trepte lângă bare de referință opace, în ordinea alb, negru, roz, galben, portocaliu, violet, cyan și verde de la stânga la dreapta.](hd-wedges-eight-colors-2026-09-13.jpg)

Această imprimare reală de calibrare a fost finalizată la 13 septembrie 2026. Penele albe și colorate folosesc suport negru; pana neagră folosește suport alb. Profilul însoțitor **8 Colors 0.2mm** înregistrează **straturi de pană de 0,04 mm** și **primul strat de 0,10 mm**. Numele profilului nu înlocuiește setările de imprimare înregistrate.

Folosește fotografia pentru a recunoaște aranjamentul treaptă-bară și progresia către opacitate, nu pentru a copia numerele Potrivire sau a eșantiona culori calibrate. Expunerea camerei, balansul de alb, iluminarea și ecranul pot schimba potrivirea aparentă. Citește propria imprimare fizică lângă bara sa, sub iluminare frontală consecventă.

## Palette Proof: compară culorile imaginii

O probă imprimă mai mulți candidați din stiva Auto-paint curentă. Un **prefix** înseamnă fundația și fiecare strat de deasupra ei până la o înălțime de oprire aleasă. Probele compară înălțimi de oprire imprimabile, nu amestecuri arbitrare independente ale rolelor.

### Alege țintele și candidații

Lasă întâi Auto-paint să termine un rezultat cu cel puțin două prefixe imprimabile eligibile. Nu trebuie să generezi mai întâi geometria 3D a lucrării. Salvează profilul denumit de filamente, apoi deschide **Palette Proof**.

| Comandă | Semnificație |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ținte | Numărul de culori ale lucrării de comparat, până la 10 sau numărul disponibil. Implicit 8 când există suficiente culori. |
| Candidați | Alternativele cerute pentru fiecare țintă, în mod normal 2–5, limitate de prefixele utile disponibile. Mai mulți candidați lățesc proba. |
| Alege din imagine | Deschide o vedere separată de selectare a țintelor. Apasă regiuni importante ale imaginii sau comutatoarele culorilor lor. |
| Imagine originală | Vizează culorile imaginii procesate înainte de ajustarea aspectului, nu fotografia încărcată neatinsă. |
| Ajustat / realizabil | Vizează culorile prezise exacte folosite de rezultatul Auto-paint curent. Folosește pentru a verifica dacă imprimarea corespunde previzualizării; cuvântul realizabil nu certifică precizia fizică. |
| Total ținte ale probei | Stabilește același număr de ținte în timpul alegerii din imagine. |
| Golește selecțiile | Elimină prioritățile manuale și lasă locurile libere selecției inteligente. |
| Folosește ținte inteligente / Folosește alese + inteligente | Revine la probă cu prioritățile tale, completând automat locurile rămase. |

Culorile selectate rămân luminoase oriunde apar în imagine; regiunile neselectate se estompează. Alegerea unei ținte nu recolorează sursa și nu o forțează în gama imprimantei. Reducerea numărului de ținte poate elimina prioritățile care depășesc acel număr.

### Imprimă și identifică proba

![Fiecare țintă are mostre candidate care se opresc la înălțimi diferite deasupra unei fundații continue comune.](09_palette_proof.svg)

Vederile **Harta probei** și **Rezultate** folosesc câte o țintă pe rând, cu candidații A–E de la stânga la dreapta. Numerele identifică rândul țintei. **F** înseamnă referința fundației comune, nu o a șasea culoare candidată sau alt filament. Compar-o cu marginea expusă a fundației.

**Descarcă 3MF** exportă proba și, pentru un profil denumit fără modificări nesalvate, salvează identitatea și harta rețetelor. După salvare, selecția țintelor și numerele sunt blocate, astfel încât rezultatele să nu poată ajunge tacit să se refere la altă imprimare. Păstrează fața în sus la scară 100%, folosește înălțimile încorporate ale stratului normal și primului strat, verifică atribuirile filamentelor și orienteaz-o după colțul stânga-sus lipsă. Proba implicită cu 8 ținte × 5 candidați măsoară 44 × 68 mm. Are mostre alăturate de 8 mm peste o fundație continuă, deci limitele pot fi mai puțin evidente decât în grila de pe ecran.

### Înregistrează ce vezi cu adevărat

Deschide **Rezultate**, compară candidații imprimați cu ținta afișată în condiții consecvente și selectează mostra cea mai apropiată. Selectează mai multe dacă sunt la egalitate. Apoi descrie potrivirea:

| Răspuns | Ce îi spune lui Kromacut |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Cea mai bună disponibilă | Este opțiunea cea mai puțin greșită. Susține-o față de alternative, fără a afirma că este egală cu ținta. |
| Apropiată | Culoarea aleasă este aproape corectă. Adaugă o corecție locală ușoară, alături de preferință. |
| Exactă | Rețeta aleasă corespunde precis țintei. Păstrează cea mai puternică ancoră locală, cu straturile inferioare necesare reproducerii culorii vizibile. |
| Niciuna | Fiecare candidat este clar slab. Respinge local alegerile fără a inventa o culoare corectă sau a selecta un câștigător. |

![După compararea unei probe, un câștigător selectat conduce la concurenți apropiați în runda următoare. Niciuna conduce la explorare fără ancoră anterioară optimă. Ținte noi testează alt set de culori ale imaginii.](21_proof_rounds.svg)

Răspunsurile se păstrează pe măsură ce le introduci. **Finalizează rezultatele** devine disponibil când fiecare rând are răspuns, inclusiv Niciuna. **Editează rezultatele** redeschide o probă finalizată pentru corecții. Lista probelor salvate grupează seturile de ținte identice și rundele lor de continuare.

- **Continuă țintele:** imprimă încă o rundă pentru aceleași ținte folosind stiva compatibilă curentă. Păstrează rezultatele optime anterioare selectate, testează concurenți apropiați neîncercați și poate include o stivă exploratorie. Un răspuns Niciuna nu are o ancoră anterioară optimă, deci runda următoare explorează alternative.
- **Ținte noi:** deschide selecția din imagine pentru alt set de ținte. Selecția inteligentă favorizează culori din afara probei finalizate, apoi culori mai puțin testate.
- **Mai puțini candidați / ținte epuizate:** căutarea nu umple placa cu repetări fără legătură doar pentru a atinge dimensiunea cerută. Citește avertismentul; mai puține alegeri utile nu înseamnă că s-a pierdut calibrarea.
- **Șterge proba:** după confirmare, elimină proba salvată și toate evaluările ei din datele de aspect.

Rezultatele salvate rămân lizibile fără imaginea originală. Redescărcarea unei probe salvate necesită instantaneul Auto-paint sursă exact; continuarea țintelor necesită o lucrare/un proces curent compatibil. Păstrează 3MF-ul original dacă ai putea dori să îl reimprimi ulterior.

Evaluările probelor pot modifica culorile prezise apropiate, clasamentele stivelor și, în final, înălțimile imprimate. Nu schimbă materialul real atribuit straturilor exportate și nu suprascriu calibrarea HD a rolei. Un singur rezultat nu stabilește o paletă precisă global. Ajustarea mai largă are condiții de date și validare pe observații rezervate; evaluările locale pot fi utile chiar când această ajustare nu este activă.

## Stack Matrix: fotografiază rețete cunoscute

### Planifică placa

Salvează întâi un profil denumit nemodificat. Setează **Înălțimea stratului** și **Înălțimea primului strat** dorite în setările de imprimare 3D înainte de a selecta **Matrice nouă**. Câmpul de înălțime al penei Distanță de acoperire nu controlează matricele.

| Comandă | Efect asupra plăcii |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mostre de filament | Selectează 2–8 filamente în ordinea profilului. Doar aceste materiale furnizează straturile rețetelor. |
| Grosime maximă a culorii (mm) | Limitează regiunea colorată deasupra fundației cu un strat. Se rotunjește în jos la straturi normale întregi, între 1 și 64. La 0,04 mm, o limită de 0,40 mm permite rețete de până la 10 straturi. |
| Număr maxim de celule | Limitează numărul rețetelor: 64, 144, 256, 400, 625, 1024, 1296, 1600 sau 2025. O placă mai mare eșantionează mai multe rețete, dar ocupă mai mult pat și timp de imprimare. |
| Buget planificat de schimbări de material | Limitează estimarea planificatorului pentru schimbări, inclusiv referințele din colțuri. Alege 40–640 de schimbări sau Fără limită de planificator. Nu este o estimare de durată sau o garanție a numărului final de schimbări din slicer. |
| Filament de suport | Alege un filament selectat pentru fundația cu un strat și completarea de sub rețetele mai scurte. Implicit este cel mai luminos filament selectat. Un prim strat subțire nu este garantat opac. |
| Înălțimea stratului / Înălțimea primului strat | Confirmare doar pentru citire a setărilor 3D curente pentru o placă nouă. |
| Rezumat rețete / dimensiuni / înălțime / schimbări | Arată amprenta, înălțimea fundației + regiunii colorate, înălțimea totală și numărul straturilor înainte de descărcare. Placa salvată raportează înălțimile fixate, celulele selectate, schimbările planificate, referințele și plăcile anterioare luate în calcul. |
| Creează și descarcă 3MF | Planifică rețetele, exportă placa, apoi înregistrează planul salvat în profil. |

Plăcile noi folosesc **acoperire adaptivă**: o căutare limitată și repetabilă eșantionează rețete în intervalul permis de grosime. Favorizează golurile din culorile măsurate anterior, adâncimi și tranziții de filament netestate și rețete exploratorii ale căror predicții au susținere slabă sau au diferit anterior de măsurători. Noutatea prezisă nu promite că și culoarea imprimată va fi nouă. Câteva celule de referință se repetă intenționat pentru compararea fotografiilor succesive.

Doar plăcile finalizate cu date compatibile de profil/material, suport, înălțimi de imprimare și aliniere foto acceptată ghidează placa următoare. Descărcarea unui plan neimprimat nu îi transformă culorile în măsurători. Păstrează plăcile finalizate: alegerea **Matrice nouă** ia automat în calcul măsurătorile eligibile. Schimbarea suportului sau a setărilor de imprimare poate începe un context separat de acoperire.

Plăcile noi au o **fundație cu un strat**, determinată de **Înălțimea primului strat**, fără o placă suplimentară bazată pe opacitate. De exemplu, **primul strat de 0,10 mm + regiune colorată de 0,40 mm = înălțime totală de 0,50 mm**. La **straturi normale de 0,04 mm**, sunt **11 straturi de imprimare**: unul de fundație și zece ale regiunii colorate. Rezumatul înălțimii arată această defalcare înainte de descărcare și folosește fundația reală stocată la vizualizarea unei plăci mai vechi.

Toate mostrele se termină tot la o singură suprafață plană. O rețetă mai scurtă se sprijină pe straturi suplimentare din același filament de suport, sub straturile colorate, **în interiorul limitei grosimii de culoare**. Completarea nu adaugă la înălțimea totală afișată. Înregistrarea salvată păstrează atât rețeta utilă, cât și completarea suportului.

Un prim strat subțire nu este automat opac. Alege filament opac de suport și fotografiază placa pe o suprafață de fundal plană și consecventă; lumina sau culoarea care transpare de dedesubt poate afecta culorile măsurate. Suportul suplimentar poate fi tratat drept neutru optic doar când acoperă cu adevărat ce se află dedesubt.

Măsurătorile peste o bază încă translucidă păstrează grosimea fizică a suportului. Pot susține o stivă fizică identică, dar nu sunt folosite ca măsurători interschimbabile peste grosimi diferite de suport sau la ajustarea modelului global de suport opac. Completarea poate face unele mostre opace chiar dacă primul strat singur nu este.

Plăcile noi grupează rețetele similare pentru a face regiunile de aceeași culoare mai continue și a reduce traseele fragmentate. Gruparea nu reduce în sine numărul filamentelor folosite pe fiecare strat, deci nu promite mai puține schimbări sau o anumită economie de timp. Plăcile deja salvate păstrează pozițiile originale ale celulelor, astfel încât fotografiile lor să corespundă în continuare.

Limita grosimii nu obligă fiecare rețetă să folosească atâta material colorat. Bugetele de celule și schimbări pot produce mai puține celule decât s-au cerut, iar un buget strict de schimbări poate lăsa unele filamente selectate nefolosite; planul salvat avertizează când se întâmplă. Dacă și mostrele de referință depășesc bugetul, mărește-l sau redu limita grosimii ori selecția filamentelor. Plăcile mai adânci și purjările CFS/AMS pot rămâne lente chiar cu puține celule: inspectează estimarea finală a slicerului înainte de imprimare.

Rezumatul salvat numără rețetele selectate care nu au fost măsurate în plăci anterioare compatibile. Dacă numărul este zero, planul doar repetă măsurători existente; poți omite imprimarea și încerca alte limite sau materiale. Nu dovedește că fiecare culoare realizabilă a fost măsurată, deoarece căutarea este limitată.

Celulele au dimensiune fixă de 5 mm și nu au spații între ele, plus o margine cu marcaje; de exemplu, o grilă de date 32 × 32 ocupă o placă de 170 × 170 mm. Plăcile salvate mai vechi își păstrează adâncimea fixă a rețetelor și etichetele **toate combinațiile** sau **gamă selectată după HD**; redescărcarea nu le convertește în format adaptiv.

Pe desktop, anularea Salvează ca nu creează un plan salvat nou. În browser, planul este înregistrat la pornirea descărcării. Verifică mesajele de eroare de stocare și păstrează fișierul 3MF. O placă salvată fixează înălțimile straturilor, suportul și harta rețetelor: modificările ulterioare de setări nu o reproiectează, iar **Descarcă 3MF** din acea înregistrare exportă din nou placa originală.

Imprimă cu fața în sus, la scară 100%, cu înălțimile și atribuirile de filamente exacte. Un prim strat mai mic decât înălțimea normală este normalizat la cea normală. Fundația rămâne un singur strat la acea înălțime efectivă a primului strat; nu este îngroșată pentru a atinge o țintă de opacitate. Plăcile salvate mai vechi își păstrează fundația originală, inclusiv eventualele straturi suplimentare. Este un obiect fizic de calibrare, deci schimbarea scării Z sau a mapării materialelor invalidează ceea ce ar trebui să măsoare celulele.

### Încarcă și aliniază o fotografie

Selectează placa imprimată din lista matricelor salvate, apoi **Alege fotografia** sau trage o imagine în zona fotografiei. Fotografiază sub lumină frontală difuză, fără reflexii puternice. Fișierul trebuie să poată fi decodat de aplicație; un RAW de cameră nu înlocuiește un export de imagine vizibil în mod obișnuit.

![Cele patru repere se plasează în centrele celulelor colorate de marcaj, în afara grilei de rețete. Limita plăcii se extinde cu jumătate de celulă dincolo de centre; un detaliu mărit deosebește centrul marcajului de colțul plăcii.](22_matrix_alignment.svg)

| Comandă | Ce schimbă |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Legenda colțurilor imprimate | Arată orientarea cerută: 1 stânga-sus, 2 dreapta-sus, 3 dreapta-jos, 4 stânga-jos. Urmează culorile mostrelor acestei înregistrări, care variază cu filamentele alese. |
| Rotește la stânga / dreapta | Rotește fotografia încărcată cu 90° și reia detecția. Nu schimbă harta fizică salvată a rețetelor. |
| Zoom − / procent / Zoom + | Schimbă mărirea de inspecție de la 100% la 400%. La 100%, întreaga fotografie încape în spațiul de lucru; nu este o vedere de un pixel de ecran pentru fiecare pixel al camerei. Apasă procentul pentru resetare și derulează pentru a ajunge la zonele mărite. |
| Patru repere numerotate | Trage-le în centrele celulelor colorate de marcaj, aflate diagonal în afara grilei dense de date. Reticula lupei marchează centrul eșantionat. |
| Afișează grila șablonului | Arată limitele proiectate ale celulelor pentru a le compara cu imprimarea. Este o suprapunere de verificare, nu o corecție de culoare. |
| Detectează din nou | Reestimează alinierea din fotografia curentă. |
| Resetează | Restabilește estimarea inițială pentru fotografia curentă, anulând ajustările manuale ale reperelor. Nu șterge calibrarea salvată. |
| Am verificat fiecare linie de grilă și centru de marcaj | Obligatoriu după ajustare manuală sau detecție cu încredere redusă. Confirmă doar după verificarea întregii grile și a tuturor celor patru centre. |

Nu plasa reperele pe ultimele celule de rețetă sau în colțurile fizice exterioare. Conturul albastru al plăcii trebuie să se extindă cu jumătate de celulă dincolo de fiecare centru de marcaj. Verifică **Previzualizarea cu perspectivă corectată**: celulele trebuie să pară pătrate și să corespundă aranjamentului imprimat. Aplicația eșantionează centre retrase de la margine pentru a evita limitele celulelor, dar o grilă deplasată atribuie în continuare culori greșite rețetelor.

### Decide cum eșantionezi, apoi salvează

**Corecție cu marcaje de referință** este dezactivată implicit. Oprit păstrează culorile eșantionate din fotografie, inclusiv dominanta camerei. Pornit aplică amplificări pe canale estimate prin compararea celor patru marcaje fotografiate cu culorile prezise ale rețetelor lor. Poate reduce o dominantă generală sau o abatere de luminozitate, dar nu măsoară independent iluminarea încăperii și nu repară umbrele sau reflexiile. Predicțiile incorecte ale marcajelor pot și ele devia rezultatul. O previzualizare mai luminoasă nu dovedește o măsurătoare mai precisă.

**Previzualizarea LUT extras** arată culorile care vor fi stocate, câte o mostră pentru fiecare rețetă. Treci cursorul peste o celulă pentru valorile RGB eșantionate. Compară cu placa fizică și condițiile de vizualizare dorite, nu cu așteptarea ca fiecare celulă să fie vie.

**Salvează calibrarea** devine disponibil când mostrele și verificarea alinierii sunt pregătite. Pentru o înregistrare finalizată, butonul este **Înlocuiește calibrarea** și înlocuiește măsurătorile fotografiate ale acelei înregistrări; descarcă/exportă mai întâi o copie de siguranță dacă vrei să păstrezi ambele versiuni. Profilul salvat conține culori, rețete și metadate foto, nu fotografia originală. Păstrează separat fotografia sursă dacă ai putea avea nevoie să o reeșantionezi.

**Matrice nouă** începe altă placă; **Înapoi la matricele salvate** revine la înregistrările existente. **Șterge Stack Matrix** elimină placa selectată și datele sale. Plăcile compatibile finalizate pot contribui împreună, deci nu trebuie să ștergi una veche doar fiindcă ai măsurat una nouă.

## Ce date se aplică următoarei imprimări?

![O rețetă de trei straturi măsurată la 0,08 mm nu este aceeași rețetă fizică precum trei straturi la 0,04 mm. HD existent poate oferi în continuare o estimare bazată pe grosime, dar același număr de straturi nu face transferabile culorile matricei.](23_calibration_scope.svg)

| Date | Compatibilitate de verificat |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HD din pană | Aparține culorii măsurate a filamentului. HD este un model de grosime, nu o căutare a unui număr de straturi; setările noi merită totuși o verificare fizică. |
| Preferințe Palette Proof și ajustarea mai largă | Necesită aceleași identități ordonate de filamente, culori, date HD/calibrare, înălțime normală, înălțime a primului strat și setare de opacitate a tranziției. |
| Ancore Exactă ale probelor | Necesită filamentul/profilul și înălțimile straturilor corespunzătoare. Pot rămâne eligibile când se schimbă detalierea tranzițiilor, dacă sufixul fizic necesar este realizabil. |
| Stack Matrix | Necesită o aliniere finalizată și acceptată, date compatibile de filament/profil și aceeași înălțime normală a stratului. Utilizarea exactă a rețetei depinde suplimentar de suportul măsurat sau de echivalența optică susținută. |

Schimbarea de la 0,08 la 0,04 mm nu reinterpretează o rețetă fotografiată de trei straturi ca șase straturi. Matricea se află în afara noului context al înălțimii normale. Profilul selectat poate oferi în continuare estimări HD din pană, dar **Modelul de aspect** poate raporta corect **Doar estimare** și zero rețete LUT din matrice.

O altă înălțime a primului strat nu dezactivează automat fiecare matrice. Matricele păstrează fundația originală, iar reutilizarea depinde de îndeplinirea condițiilor măsurate sau echivalente susținute de către suportul generat. Nu presupune că același filament superior sau aceeași grosime totală este suficientă. Consultă [incertitudinea predicției](calibration-theory#prediction-uncertainty) pentru regulile limitate de transfer între suporturi și continuare cu același filament.

## Interpretează încrederea fără a exagera precizia

Indicatorul filamentului, **Încrederea rezultatului** și **Modelul de aspect / Încrederea predicției** descriu lucruri diferite:

- **Încrederea filamentului** privește cât de bine a fost constrânsă măsurătoarea cu pană. Citirile de la marginea intervalului, dezacordul sau vechimea o reduc. Estimare înseamnă că nu există o măsurătoare activă cu pană.
- **Încrederea rezultatului** combină Calibrare, Acoperire și Comprimare. Un scor general mare poate coexista cu rețete ale căror culori sunt simulate integral.
- **Modelul de aspect** identifică datele empirice disponibile și starea ajustării. Numerele stivelor comparate, ancorelor, vecinătăților locale și rețetelor LUT din matrice arată ce a informat efectiv calculul.
- **Încrederea predicției** descrie susținerea culorilor mapate în această imagine, incluzând predicții măsurate, interpolate, ajustate sau simulate. O rețetă măsurată rămâne o observație de cameră sau umană în anumite condiții, nu o garanție de laborator.

Folosește **Cea mai bună disponibilă**, nu Exactă, când alegi mostra cea mai puțin slabă. Nu continua să ajustezi fotografia matricei până când previzualizarea pare atrăgătoare. Următorul pas util este un mic test fizic care verifică exact culorile și setările de imprimare schimbate.
