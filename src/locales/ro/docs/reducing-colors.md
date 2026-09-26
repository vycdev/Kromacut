---
title: Reducerea culorilor
slug: reducing-colors
order: 40
description: Înțelege reducerea în două etape, paletele fixe și diferența dintre recolorare și transparență.
---

# Reducerea culorilor

Cuantizarea înlocuiește multe culori sursă cu un set mai mic, simplificând regiunile folosite de fluxurile 3D Manual și Auto-paint. O paletă 2D conține culori țintă ale imaginii, nu un profil de filamente Auto-paint sau predicții măsurate de imprimare.

Decupează și redimensionează întâi. Dacă ai schimbat [ajustările imaginii](image-adjustments), apasă Aplică în acel panou înainte de cuantizare.

## Procesul în două etape

![Intensitatea algoritmului limitează paleta intermediară; Numărul de culori sau o paletă fixă selectată controlează a doua etapă.](34_quantization_pipeline.svg)

**Intensitatea algoritmului** și **Numărul de culori** au roluri diferite. K-means cu intensitatea 128 grupează mai întâi sursa în cel mult 128 de culori. Auto cu Număr de culori 16 unește apoi rezultatul în cel mult 16. Intensitatea nu este un procent, o opacitate sau un număr de filamente.

| Câmp sau acțiune | Semnificație |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Paletă: Auto | Găsește culori dependente de imagine, apoi le limitează numărul. |
| Paletă: încorporată, de furnizor sau personalizată | Mapează imaginea intermediară la culorile activate ale paletei selectate. Nu trebuie să apară fiecare culoare disponibilă. |
| Număr de culori | Limita finală superioară pentru Auto: 2–256, implicit 16. Dezactivat pentru o paletă fixă. |
| Intensitatea algoritmului | Bugetul paletei intermediare: 2–256, implicit 128. O valoare mai mare păstrează de obicei mai multe detalii intermediare, nu neapărat o potrivire finală mai bună. |
| Algoritm | Metoda de reducere din prima etapă. Implicit: K-means. |
| Aplică | Procesează imaginea de bază și creează un pas de anulare. Simpla schimbare a unei setări nu recolorează imaginea. |
| Săgeată de resetare | Restabilește Auto, 16 culori, intensitatea 128 și K-means. Nu restaurează o imagine anterioară. |

Rezultatul poate conține mai puține culori decât s-au cerut. Mărirea țintei după reducere nu poate recupera culorile eliminate: folosește întâi **Anulează** pentru a compara alternative pe aceeași sursă.

Cuantizarea păstrează pixelii complet transparenți, dar face **toți pixelii parțial transparenți complet opaci**. O margine alfa estompată nu reprezintă o margine imprimată parțial.

## Alege un algoritm

Aceste metode grupează culori. Niciuna nu adaugă un model spațial de dithering și nu garantează că un element mic va supraviețui lățimii liniei duzei.

| Algoritm | Ce se schimbă | Comparație utilă |
| ----------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Niciunul (doar postprocesare) | Omite cuantizatorul primei etape; Intensitatea este dezactivată. Reducerea numărului final sau maparea la paleta fixă se execută în continuare. | Mapează direct o imagine curată la o paletă cunoscută. Nu este un comutator universal „lasă imaginea neschimbată”. |
| Posterizare | Împarte canalele RGB în trepte discrete, apoi aplică limita de intensitate. | Grafică intenționat în trepte; nivelurile disponibile ale canalelor se schimbă prin salturi discrete. |
| Median-cut | Împarte distribuția culorilor în grupuri reprezentate de culori medii. | Compară când altă metodă pierde un grup tonal important. |
| K-means | Găsește grupuri de culori ponderate cu numărul de pixeli, pornind de la o inițializare aleatorie. | Un punct de pornire pentru fotografii și imagini mixte. Rulările pe aceeași sursă pot diferi ușor. |
| Wu | Folosește statisticile distribuției culorilor pentru a alege divizări cu variație internă mai mică. | Compară pe degradeuri și fotografii. |
| Octree | Grupează culorile prin subdiviziuni RGB și combină grupurile pentru a se încadra în buget. | Compară pe imagini cu multe regiuni distincte. |

Nu există un algoritm universal optim. Inspectează subiectul, literele mici și accentele importante la dimensiunea fizică dorită.

## Palete fixe și de furnizor

O paletă fixă oferă numai culorile sale selectate. După orice reducere din prima etapă, fiecare pixel netransparent este mapat la cea mai apropiată culoare disponibilă în spațiul de culoare Lab. Este potrivirea culorilor imaginii, nu simularea optică a filamentelor.

**Paletele furnizorilor** sunt seturi de referință neoficiale cu nume de filamente și culori hexazecimale publicate. Nu garantează disponibilitatea actuală a produselor sau precizia culorilor imprimate. De exemplu, culorile de referință Bambu folosesc [tabelul hexazecimal de filamente Bambu Lab](https://store.bblcdn.com/s7/default/1084369ef84345bbaa5d704a492954e0/Bambu_PLA_Basic_Hex_Code.pdf). Kromacut nu este afiliat și nu este susținut de producători.

Paletele încorporate și cele ale furnizorilor sunt doar pentru citire. Clonează una pentru a o personaliza. Folosește separat [calibrarea filamentelor](calibration-theory) pentru comportamentul real al rolelor și straturilor.

## Palete personalizate

| Comandă | Ce faci |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Creează paletă nouă | Denumește-o și adaugă cel puțin o culoare validă activată. Va deveni paleta selectată. |
| Editează paleta selectată | Schimbă o paletă personalizată, nu pixelii imaginii curente. Aplică apoi cuantizarea. |
| Adaugă culoare | Adaugă un selector, un câmp hexazecimal și un nume opțional. Intrările valide folosesc `#RGB` sau `#RRGGBB`; rândurile nevalide sunt omise la Salvare. |
| Nume opțional al culorii | Etichetează o culoare, de exemplu cu numele rolei. Nu schimbă potrivirea. |
| Comutatorul cu ochi | Dezactivează o culoare salvată fără să o șteargă. Trebuie să rămână activată cel puțin o culoare validă. |
| Elimină rândul | Șterge rândul; nu poți elimina ultimul rând. |
| Clonează | Copiază o paletă diferită de Auto într-o paletă personalizată editabilă, păstrând numele și stările dezactivate. |
| Importă | Citește un fișier `.kpal` și raportează intrările importate, suprascrise, duplicate sau redenumite. Selectează prima paletă importată când este cazul. |
| Exportă | Salvează paleta personalizată selectată ca `.kpal`, inclusiv numele și culorile dezactivate. Clonează întâi paletele încorporate pentru a exporta o copie editabilă. |
| Șterge paleta selectată | Elimină paleta salvată și readuce selecția la Auto. Nu șterge pixelii imaginii. |
| Salvează / Anulează | Confirmă sau abandonează ciorna editorului. |

O etichetă precum **Rolele mele (5/8)** în selector înseamnă cinci culori activate din opt intrări salvate. Participă doar culorile activate. Paletele și selecția sunt salvate local; exportă copii de siguranță înainte de ștergerea datelor aplicației/browserului. Sunt separate de [profilurile de filamente](settings-and-controls#filament-profile-files).

## Culorile imaginii

Culorile imaginii descrie imaginea de bază, nu ajustările live neaplicate. Indicatorul său exclude pixelii complet transparenți. Indiciile afișează codul hexazecimal, alfa și numărul de pixeli. Valori alfa diferite pot crea intrări separate cu același RGB. Imaginile foarte colorate au o listă afișată limitată, nu fiecare culoare fotografică.

Apasă o mostră pentru **Editează culoarea**. Folosește selectorul RGBA sau câmpul hexazecimal, apoi Aplică. Codul cu șase cifre schimbă RGB păstrând alfa curent al selectorului; cel cu opt cifre include explicit alfa. Folosește comanda de transparență sau un sufix alfa explicit când contează opacitatea.

![Înlocuirea opacă recolorează fiecare potrivire exactă, alfa zero elimină acei pixeli, iar Șterge remapează culorile în loc să decupeze găuri.](35_swatch_operations.svg)

| Acțiune | Ce se schimbă |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Aplică o culoare opacă | Înlocuiește fiecare potrivire exactă RGB și alfa din întreaga imagine, inclusiv regiunile deconectate. |
| Aplică alfa complet transparent | Elimină pixelii identici din imaginea vizibilă și silueta imprimabilă. Dispar și pixelii identici ai subiectului. |
| Aplică mostrei transparente | Înlocuiește toți pixelii complet transparenți, putând adăuga un fundal sau umple găuri. |
| Șterge | Recuantizează folosind paleta țintă rămasă. **Nu** șterge pixeli. Algoritmul selectat pentru prima etapă rulează în continuare, deci se pot schimba și alte culori. |
| Închide / Escape | Abandonează editarea neconfirmată. |

Alege **Niciunul (doar postprocesare)** înainte de Șterge pentru mapare directă la paleta rămasă. Folosește [Umplere sau Radieră](loading-images#touch-up-pixels) pentru o schimbare locală. Anulează dacă se schimbă mai mult din imagine decât intenționai.

Instrucțiunile de schimbare manuală sunt dezactivate peste 64 de culori netransparente. O paletă mai mică poate simplifica stiva chiar sub această limită, dar mai puține ținte nu înseamnă automat mai puține schimbări de filament în Auto-paint.

În continuare: [Eliminarea ditheringului și curățarea](dedithering-cleanup).
