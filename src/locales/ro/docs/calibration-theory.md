---
title: Teoria calibrării
slug: calibration-theory
order: 62
description: Optica și matematica din spatele calibrării distanței de acoperire, Palette Proof și Stack Matrix.
---

# Teoria calibrării

Kromacut are trei instrumente de calibrare complementare. **Distanță de acoperire** măsoară opacitatea fizică a fiecărui filament. **Palette Proof** îți cere să clasifici un set mic de candidați imprimați pentru culori importante într-un proiect. **Stack Matrix** fotografiază multe rețete fizice cunoscute și înregistrează culorile observate. Toate alimentează același model de stivă Auto-paint, dar răspund la întrebări diferite.

Pentru comenzile pas cu pas, comportamentul salvării și compatibilitatea setărilor de imprimare, consultă [Fluxuri de calibrare](calibration-workflows). Pentru restul spațiului de imprimare, consultă [Modul 3D](3d-mode).

## De ce se amestecă straturile subțiri

O imprimare este privită cu iluminare frontală: lumina intră prin suprafața superioară, coboară prin filament, se reflectă de ce se află dedesubt și iese din nou. Un strat subțire acoperă doar parțial ce este dedesubt, deci culoarea văzută este un amestec al culorii proprii a filamentului și al culorii care transpare de dedesubt. Auto-paint folosește această transparență pentru a construi culori intermediare dintr-un set mic de filamente, motiv pentru care HD trebuie să fie precis.

![Straturile subțiri de filament peste o bază neagră o acoperă doar parțial; fiecare strat adăugat multiplică transparența până când stiva corespunde culorii opace a filamentului.](06_frontlit_hiding_distance.svg)

Kromacut modelează transparența prin legea Beer-Lambert. O grosime `d` de filament transmite

```
T = 10^(−d / HD)
```

din culoarea de dedesubt. Fiecare strat adăugat multiplică transparența, astfel că stiva ajunge la opacitate geometric. Ritmul este o proprietate a materialului: un negru dens acoperă într-o fracțiune de milimetru, iar un alb translucid poate avea nevoie de o adâncime de zece ori mai mare. Acest ritm este distanța de acoperire.

Distanța de transmisie de pe fișele rolelor sau măsurată cu probe TD retroiluminate descrie lumina care trece o singură dată _prin_ filament, ca la litofanii. La iluminare frontală, lumina trece de două ori prin strat și este citită prin reflexie, deci TD convențional este aproximativ 10× distanța de acoperire. Kromacut acceptă TD convențional ca intrare (butonul de conversie de pe fiecare rând de filament), dar stochează și simulează cu HD.

## Pana

Măsurarea culorii cu camera este nesigură: camerele corectează automat, ecranele diferă, iar iluminarea se schimbă. Pana evită evaluarea unei culori izolate. Fiecare piesă imprimă trepte de la 1 la N straturi de filament peste o bază, cu o **bară de referință** alăturată din același filament, complet opacă, și un picior care marchează capătul cu un strat.

![Pana de calibrare: trepte numerotate cu număr crescător de straturi lângă o bară de referință complet opacă; raportezi prima treaptă care arată identic cu bara.](07_calibration_wedge.svg)

Raportezi **prima treaptă care arată identic cu bara de lângă ea**. Bara este culoarea opacă proprie filamentului, la câțiva milimetri distanță, sub aceeași lumină, deci comparația rămâne valabilă între camere, ecrane și imprimări. Treptele subțiri lasă baza să se vadă; la o anumită treaptă diferența scade sub ce poate distinge ochiul, iar numărul acelei trepte este măsurătoarea.

## De la citire la distanța de acoperire

Treapta raportată marchează grosimea la care transparența a scăzut sub o **diferență abia perceptibilă (JND)**: cea mai mică diferență vizibilă de culoare, aproximativ 2 ΔE00 în condiții obișnuite de vizualizare.

Kromacut rezolvă invers problema. Pentru culoarea filamentului peste culoarea bazei, calculează `T*`, transparența care plasează culoarea amestecată exact la un JND de culoarea opacă a filamentului. `T*` depinde doar de cele două culori și de JND, fără o constantă de opacitate reglată manual. Citirea dă grosimea la care imprimarea a atins acel punct, `d* = treaptă × înălțimea stratului`, iar inversarea Beer-Lambert dă:

```
HD = −d* / log10(T*)
```

![Pe măsură ce straturile se adună, diferența de culoare dintre treaptă și bară scade; treapta raportată fixează traversarea unui JND, iar inversarea legii transmisiei dă distanța de acoperire.](08_opacity_solve.svg)

Contrastul bazei contează: un filament negru peste o bază neagră nu diferă niciodată de bara sa cu un JND întreg, deci nu există nimic de măsurat. Asistentul detectează acest lucru și atribuie filamentelor întunecate o bază mai luminoasă.

## Datele Palette Proof

O probă Palette Proof compară prefixe imprimate reale cu culori ale imaginii curente. Kromacut păstrează rețeta fizică de straturi, predicția HD originală, culoarea țintă cerută și fiecare răspuns. Astfel, o singură foaie oferă două tipuri de date fără a pretinde că fiecare alegere este o măsurătoare exactă.

**Cea mai bună disponibilă** susține rețeta selectată și respinge alternativele neselectate din apropierea țintei, dar nu impune egalitatea dintre mostră și culoarea țintă. **Apropiată** adaugă o corecție locală parțială de culoare. **Exactă** adaugă cea mai puternică corecție și păstrează sufixul opac exact testat ca ancoră directă. Fiecare mostră selectată la egalitate primește susținere. **Niciuna** respinge candidații plauzibili din apropierea țintei fără a inventa o direcție de corecție.

Aceste efecte sunt locale atât în spațiul rețetelor fizice, cât și în spațiul culorilor. Straturile recente, dominante optic, contează cel mai mult când Kromacut compară rețete; mutarea aceluiași filament în altă poziție a stivei recente este o potrivire mai slabă. Datele își pierd influența și când culoarea simulată a stivei sau ținta cerută se îndepărtează de culoarea evaluată. Mai multe rețete similare care pierd repetat în apropierea țintelor verzi întăresc deci un avertisment local pentru stivele verzi apropiate, în timp ce o rețetă roșie fără legătură rămâne neatinsă.

Corecțiile Apropiată și Exactă alimentează aceleași culori Lab prezise folosite la scorul optimizatorului și în previzualizarea finală. Datele de susținere și respingere adaugă o preferință limitată, dependentă de țintă, astfel încât datele repetate să poată departaja o egalitate numerică strânsă fără a domina eroarea reală de culoare sau ancorele exacte. Ajustarea globală mai largă a luminozității/cromei rămâne separată și trebuie în continuare să treacă validarea pe date rezervate. Datele locale și ancorele Exactă pot rămâne utile când ajustarea globală este blocată, iar toți parametrii derivați sunt reconstruiți determinist din evaluările brute salvate.

## Calibrarea Stack Matrix

Stack Matrix pornește ca o măsurare de tip LUT, nu ca o altă rezolvare a penei de opacitate. Plăcile noi eșantionează rețete utile de lungimi diferite până la o limită fizică de grosime a culorii, iar fiecare strat din regiunea colorată păstrează înălțimea normală selectată. O limită de 0,40 mm la 0,04 mm permite până la 10 straturi de culoare. Fundația este un singur strat la înălțimea efectivă a primului strat, nu o placă dimensionată după opacitatea estimată. Cu primul strat de 0,10 mm, exemplul are 0,50 mm înălțime și 11 straturi de imprimare în total.

Rețetele mai scurte se sprijină pe straturi suplimentare din același filament de suport în regiunea colorată, astfel încât toate fețele mostrelor se termină la același Z, fără depășirea limitei. Suportul suplimentar este înregistrat separat de rețeta utilă la aplicarea măsurătorilor. O fundație subțire nu este garantat opacă: folosește filament opac și o suprafață de fundal fotografic plană și consecventă. Suportul imprimat trebuie să acopere cu adevărat substratul înainte ca suportul adăugat să poată fi tratat drept neutru optic. Plăcile salvate mai vechi își păstrează grosimile originale ale fundației și harta celulelor.

Spațiul rețetelor posibile crește exponențial, așa că planificarea folosește un set determinist limitat de secvențe pure, tranziții ordonate de filamente și rețete exploratorii mai lungi la adâncimile permise. Valorile HD salvate le prezic culorile. Matricele compatibile finalizate oferă acoperire cu culori măsurate și o evidență a rețetelor imprimate anterior. Selecția favorizează golurile de culoare și acoperirea unor grosimi/tranziții noi, cu explorare dedicată ghidată de susținere slabă sau erori anterioare de predicție. Aceste scoruri de achiziție sunt euristici, nu intervale calibrate de incertitudine. Câteva repetări intenționate de referință ajută verificarea consecvenței; planurile neimprimate și fotografiile incompatibile sau neacceptate nu închid golurile de acoperire.

Bugetul schimbărilor de material include referințele din colțuri și limitează utilizarea materialelor de către planificator, strat cu strat. Nu este o estimare a timpului de imprimare sau a volumului purjat, iar slicerul poate adăuga schimbări. O limită de grosime mai mare poate deci costa mai mult chiar dacă numărul de celule selectate rămâne mic. Plăcile noi grupează rețete similare în regiuni de aceeași culoare mai continue pentru a reduce fragmentarea traseelor; rearanjarea celulelor nu reduce setul de materiale necesare pe fiecare strat. Plăcile mai vechi păstrează selecția lor originală exhaustivă la adâncime fixă sau bazată pe gama HD și pot furniza în continuare date compatibile fără a fi rescrise.

Matricea se imprimă cu fața în sus, astfel încât fundația, grosimea primului strat și straturile următoare ale rețetei să aibă aceeași ordine fizică ca un model Kromacut normal. Patru rețete din colțuri identifică orientarea și definesc transformarea de perspectivă. După imprimare, fotografiază fața sub lumină frontală difuză. Kromacut estimează placa, apoi îți permite să tragi patru repere numerotate ale centrelor marcajelor, cu o reticulă mărită. O grilă exactă de celule proiectată și o previzualizare rectificată live fac vizibile erorile de perspectivă, înclinare și deformare înainte ca Kromacut să eșantioneze o zonă centrală retrasă în coordonatele proiective proprii fiecărei celule. Această margine interioară pe celulă rămâne departe de borduri chiar când perspectiva face o latură a plăcii mult mai îngustă. Alinierea cu încredere redusă sau ajustată manual necesită confirmare explicită a verificării; încrederea și starea verificării sunt salvate cu măsurătorile. Eșantionarea brută este opțiunea implicită conservatoare. Corecția opțională cu marcaje de referință estimează un câștig de iluminare pe canal din cele patru rețete cunoscute, putând reduce o dominantă de culoare, dar și ascunde o diferență reală dependentă de lumină.

O matrice finalizată stochează culorile sRGB prezise și fotografiate alături de rețetele fizice imuabile în profilul denumit de filamente. Toate matricele compatibile stocate ajustează împreună un singur model fizic efectiv, lăsând neatinse culorile mostrelor salvate, calibrarea HD și măsurătorile brute. Ajustarea tratează valorile salvate ca valori anterioare regularizate, apoi folosește fiecare mostră ponderată pentru a estima HD efectiv pe canale RGB, culoarea opacă efectivă a filamentului, un exponent neliniar de transmisie pentru secvențe contigue ale aceluiași filament și o interacțiune ordonată între filamentul vizibil și substratul de dedesubt. Datele rare păstrează valorile anterioare originale, iar modelul ajustat este folosit doar dacă există suficiente mostre și îmbunătățește ΔE pe date de matrice rezervate validării fără a agrava erorile extreme. O interacțiune de substrat ajustată este folosită până la cea mai groasă secvență contiguă a perechii de materiale observată în matrice. Grosimea suplimentară nemăsurată continuă de la acea culoare susținută de date spre mostra nominală a filamentului, folosind valoarea anterioară pană/HD potrivită substratului; nu comută întreaga secvență la altă predicție și nu extrapolează exponentul ajustat la nesfârșit. Același calcul al prefixelor de secvență alimentează scorurile candidaților, comparațiile rețetelor și previzualizarea, inclusiv stivele comprimate și aliniate la straturi.

Ajustarea compară culorile simulate cu valorile sRGB fotografiate folosind o măsură robustă a erorii, în timp ce amestecul fizic se realizează tot în lumină liniară. Astfel, diferențele din canalele întunecate au suficientă pondere pentru a influența ajustarea. Penalizările valorilor anterioare sunt mediate pe familii de parametri, pentru materialele efectiv reprezentate în mostrele de antrenare; adăugarea de role nefolosite nu slăbește și nu dezactivează aceeași ajustare. Validarea stabilește în continuare dacă modelul ajustat este folosit. Acordul mai bun pe rețete familiare nu dovedește precizia pentru perechi de filamente nemăsurate anterior.

Matricele compatibile rămân și LUT-uri empirice dispersate în spațiul Lab prezis și al rețetelor fizice, astfel încât o placă nouă rar eșantionată nu șterge rețete măsurate pe una anterioară. Kromacut ponderează fiecare placă după încrederea alinierii verificate, acoperirea rețetelor măsurate, recență și acordul robust cu rețete măsurate de cel puțin alte două plăci. Cu doar una sau două observații ale unei rețete, acordul rămâne neutru, neexistând suficiente date pentru a identifica o valoare aberantă. O rețetă exactă de straturi la adâncime fixă combină direct observațiile sale Lab fotografiate. O rețetă lipsă combină interpolări deterministe ponderate cu inversul distanței ale valorilor Lab fotografiate apropiate, cu ordinea fizică a straturilor ponderată în favoarea straturilor superioare dominante optic. Interpolarea este permisă doar în acoperirea locală Lab prezisă a fiecărei matrice și într-o vecinătate limitată de rețete; altfel se folosește modelul fizic ajustat comun. În afara datelor compatibile de matrice, acel model revine la valorile anterioare Beer-Lambert/HD salvate. Scorul optimizatorului și previzualizarea finală împart aceeași predicție. Ancorele Palette Proof Exactă au în continuare prioritate față de datele matricelor, iar celulele matricei sunt observații, nu ținte dorite ale imaginii; imprimarea unei matrice ample nu obligă optimizatorul să urmărească fiecare culoare eșantionată.

## Incertitudinea predicției

În interiorul acoperirii locale de culori prezise a matricei, corecțiile interpolate se estompează treptat înapoi spre modelul fizic când susținerea lor se epuizează. Rețetele fotografiate exact își păstrează culorile măsurate. Același material superior nu este suficient pentru transferul unei măsurători de matrice: întreaga fundație măsurată trebuie să coincidă sau suportul alternativ trebuie să fie suficient de opac și echivalent optic, cu aceeași interacțiune a substratului imediat.

Pentru o rețetă măsurată identică, Kromacut poate estima și transferul către un suport mai adânc diferit când substratul imediat este același material, iar culorile finale simulate diferă cu cel mult 1 ΔE00. Fundația inițială trebuie să îndeplinească pragul de opacitate fie din ajustarea curentă, fie din valoarea anterioară HD salvată; diagnosticele înregistrează care dintre ele a susținut grosimea. Astfel, o imprimare existentă poate păstra valoarea anterioară care i-a justificat baza când o ajustare ulterioară schimbă pragul estimat. Corecția măsurată se transferă cu încredere redusă și este etichetată **interpolată**, deoarece echivalența suportului este dedusă din model, nu măsurată independent. Excepția nu permite interpolarea generală a rețetelor pe alt suport.

Adăugarea unei cantități suplimentare din același filament terminal poate continua corecția unui prefix măsurat. Influența sa este atenuată prin secvența fizică originală și dispare pe cel mult grosimea unei rețete de matrice de material suplimentar. Este etichetată tot interpolată. Nu prezice prefixe mai subțiri dintr-o măsurătoare ulterioară, iar adăugarea altui material încheie continuarea. Măsurătorile directe și evaluările Palette Proof aplicabile își păstrează prioritatea. Înregistrările de diagnostic identifică mostrele sursă și dacă datele au fost transferate între suporturi sau continuate prin grosime adăugată.

Fiecare prefix imprimabil primește un nivel de încredere alături de culoarea sa Lab prezisă. Încrederea păstrează vizibile patru intrări, în loc să le comprime într-o certitudine neexplicată:

- **Distanța față de măsurătoare:** distanța culorii prezise și a rețetei fizice față de cea mai apropiată rețetă măsurată compatibilă.
- **Acord local:** dacă mostrele apropiate descriu o corecție consecventă de la culoarea simulată la cea fotografiată.
- **Eroare de validare:** LUT-ul prezice fiecare rețetă fără propria mostră empirică, folosind aceeași selecție a vecinilor și estompare a susținerii ca la rulare. Este o verificare condiționată, cu modelul optic ajustat menținut fix, nu o estimare independentă a preciziei de la un capăt la altul. Separat, ajustarea optică este recalculată și testată folosind matrice întregi rezervate validării sau interacțiuni rețetă/substrat grupate când este disponibilă o singură matrice.
- **Metoda de predicție:** o observație fizică exactă pornește cu mai multă susținere decât interpolarea, o estimare ajustată sau simularea Beer-Lambert pură.

Optimizatorul adaugă cel mult cinci puncte echivalente ΔE pentru o potrivire complet incertă. Este suficient ca o potrivire apropiată susținută empiric să învingă un gri speculativ care pare perfect, dar rămâne limitat, astfel încât încrederea datelor să nu domine o eroare vizibilă majoră de culoare. Ancorele Exactă își păstrează prioritatea explicită, iar Păstrează separarea culorilor evaluează în continuare fezabilitatea după ΔE00 brut, nu după costul ajustat la risc. Paletele optimizatorului, straturile previzualizării finale și mapările țintă salvate păstrează același obiect de încredere, împiedicând căutarea și randarea să folosească tacit ipoteze diferite despre date.

Calibrarea fotografică este inerent sensibilă la cameră, expunere, reflexii, balansul de alb și lumina de vizualizare. Pana fără cameră rămâne metoda preferată de măsurare a HD a materialului. Folosește Stack Matrix când vrei culori empirice pentru multe rețete într-o configurație controlată și Palette Proof când contează mai ales câteva culori dintr-o imagine.

## Distanțe de acoperire pe canale

Filamentele nu absorb egal roșul, verdele și albastrul (un filament portocaliu lasă roșul să treacă, dar blochează albastrul), deci un singur HD scalar este o aproximație. Kromacut amestecă folosind trei distanțe de acoperire, una pe canal:

- **O citire pe o bază (mod Rapid):** comparația de opacitate măsoară HD scalar. Diferențele canalelor RGB rămân o estimare conservatoare din culoarea mostrei filamentului, ancorată astfel încât canalul cel mai luminos să coincidă cu măsurătoarea.
- **Citiri pe baze suplimentare (mod Precis):** fiecare bază solicită diferit curba estimată a canalelor. Kromacut ajustează o singură intensitate limitată de selectivitate a canalelor și valoarea scalară doar atât cât cer intervalele cuantizate ale treptelor. Nu pretinde că două praguri vizuale au măsurat independent trei valori HD spectrale.

Curba rafinată este folosită direct pentru materialele de bază care au fost efectiv comparate în pană. Pe o bază netestată, Kromacut păstrează estimarea Rapid în loc să extrapoleze o deplasare puternică de nuanță. Poți adăuga mai multe baze când îți este comod, dar nu sunt necesare trei sau patru. HD-uri de canal complet independente, transmisia neliniară și interacțiunile specifice substratului sunt rezervate datelor Stack Matrix, cu verificări pe date rezervate și asupra grosimilor susținute.

Citirea opțională a contopirii înregistrează ultima treaptă vecină a penei care încă părea diferită. Validează curba ajustată, nu adaugă încă un parametru liber: o nepotrivire mare scade încrederea și apare în diagnostice.

## Ajustarea JND a sesiunii

JND implicit de 2 ΔE00 este o constantă a vederii umane, dar un anumit observator și o anumită lumină se pot abate ușor. Când o sesiune are suficiente citiri pe baze multiple, independent informative, Kromacut poate ajusta un singur JND comun între 1 și 3. Ajustarea este păstrată doar dacă este clar identificabilă și depășește valoarea implicită; citirile cuantizate ale penei sunt adesea ambigue față de HD scalar, caz în care sesiunea păstrează corect constanta.

## Încredere

Fiecare calibrare are un scor de încredere pentru cât de bine a fost determinată măsurătoarea:

- O citire la oricare capăt al penei (treapta 1 sau ultima treaptă) reduce încrederea: punctul real de opacitate poate fi în afara intervalului imprimat. Imprimă o pană mai lungă sau cu înălțime de strat mai fină și recalibrează.
- Citirile pe baze multiple care nu concordă nici la cea mai bună ajustare reduc încrederea, iar dezacordul este notat în calibrare.
- Încrederea scade după șase luni, pe măsură ce filamentele îmbătrânesc și rolele se schimbă.

Filamentele necalibrate primesc un scor mai mic, bazat pe plauzibilitatea HD-ului estimat.

## Ce se schimbă după calibrare

Distanțele de acoperire pe canale alimentează atât **culorile** pe care Auto-paint le prezice pentru fiecare stivă, cât și **grosimea** zonelor de tranziție. Calibrarea poate schimba înălțimile stivelor generate și planul de schimbări, nu doar previzualizarea.

O calibrare aparține materialului măsurat: este legată de culoarea mostrei pentru care s-a calibrat, editarea culorii filamentului o dezactivează, iar recalibrarea înlocuiește măsurătoarea anterioară, nu face o medie cu ea.
