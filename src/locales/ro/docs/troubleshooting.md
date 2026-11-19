---
title: Depanare
slug: troubleshooting
order: 90
description: Probleme frecvente și ce să încerci mai întâi.
---

# Depanare

Începe aici când un rezultat arată greșit sau o comandă este dezactivată.

## Auto-paint este lent pentru o fotografie mică

O fotografie mică necuantizată poate conține mii de culori distincte, evaluate pentru multe stive candidate. Redu culorile în **2D → Setări de cuantizare → Aplică** (începe cu 16–32), dezactivează repetările sau alege **Rapid / Compactă**. De la 1.024 de culori țintă, potrivirea avansată afișează îndrumări și așteaptă **Pornește Auto-paint**. Folosește **Anulează Auto-paint** pentru a opri căutarea; repornește-o sau schimbă setările. Procentul nu estimează timpul rămas. Vezi [Auto-paint](auto-paint).

## O Imagine Este Prea Mare Pentru A Fi Deschisă

Micșorează fișierul într-un editor de imagini înainte de a-l importa din nou. Eroarea arată dimensiunile imaginii și o dimensiune prudentă recomandată pentru dispozitivul tău. Imaginea curentă și istoricul Undo sunt păstrate. O imagine lungă și îngustă poate fi acceptată dacă browserul îi suportă dimensiunile; contează și numărul total de pixeli. Vezi [Încărcarea imaginilor](loading-images).

## Un link afișează „Pagina nu a fost găsită”

Adresa poate conține o greșeală sau poate indica o pagină care nu mai există. Folosește **Deschide Kromacut** pentru a ajunge la instrument, **Mergi la pagina principală** pentru pagina de prezentare sau **Răsfoiește documentația** pentru a găsi ghidul actual. O adresă necunoscută de documentație nu este înlocuită automat cu alt ghid.

## Generarea modelului 3D nu actualizează previzualizarea

Setările 3D nu se aplică până când nu apeși **Generează modelul 3D**. Modifică setările dorite, apoi generează din nou.

## Instrucțiunile de schimbare sunt dezactivate

În modul Manual, imaginile cu peste 64 de culori dezactivează instrucțiunile de schimbare. Revino la **2D**, folosește **Setări de cuantizare** și redu imaginea la cel mult 64 de culori. Flat Paint nu are intenționat o secvență de schimbări manuale, deoarece fiecare strat imprimat poate conține mai multe filamente.

## Modelul este prea înalt

Încearcă în această ordine:

1. În Auto-paint, micșorează **Înălțimea maximă** și urmărește zonele de tranziție comprimate.
2. În modul Manual, verifică numărul culorilor imaginii. Multe culori creează multe secțiuni suprapuse, astfel că modelul devine în mod natural mai înalt.
3. Redu culorile în **2D** dacă nu ai nevoie de fiecare culoare ca strat imprimat separat.
4. În modul Manual, micșorează grosimea uneia sau mai multor secțiuni de culoare.
5. Confirmă că **Înălțimea stratului** și **Înălțimea primului strat** coincid cu setările reale din slicer.

## Modelul este prea mare pe X sau Y

Micșorează **Dimensiunea pixelului (XY)** pentru a micșora modelul. Decupează întâi imaginea dacă are margini sau fundal nefolosit.

## Imaginea are puncte sau insule minuscule

Folosește **Eliminare dithering** după reducerea culorilor. Dacă imaginea are încă prea mulți pixeli izolați, încearcă mai puține culori sau alt algoritm de cuantizare.

## Auto-paint pare inexact

Cauze frecvente:

- Distanțele de acoperire ale filamentelor sunt estimări, nu valori calibrate.
- Setul de filamente nu acoperă bine culorile imaginii.
- **Înălțimea maximă** comprimă prea mult zonele de tranziție.
- Optimizatorul are nevoie de **Potrivire îmbunătățită a culorilor** activată.
- Subiectul important se află în centru sau la margini, dar **Prioritatea regiunii** este **Uniformă**.

Calibrează filamentele și verifică **Încrederea rezultatului** pentru indicii.

Verifică separat rândul **Model de aspect**. Un scor general ridicat nu garantează precizia fizică. **Doar estimare** sau zero rețete active din matrice înseamnă că rezultatul curent nu are măsurători de matrice aplicabile. Salvarea unui profil calibrat nu face datele sale compatibile cu orice înălțime de strat sau set modificat de filamente. Consultă [Fluxuri de calibrare](calibration-workflows).

## Un comutator l-a dezactivat pe altul

**Păstrează separarea culorilor** și **Dithering de înălțime** se exclud în continuare, deoarece atribuie diferit culorile sursă înălțimilor imprimabile. **Geometrie netezită** și **Flat Paint** pot fi folosite împreună; reconstruiește după schimbarea oricărei setări. Consultă [Flat Paint](flat-paint) și [Auto-paint](auto-paint).

## Separarea culorilor nu găsește un rezultat

**Limita potrivirii unice** este o limită strictă a erorii de culoare prezise. Cu **Cere o potrivire unică pentru fiecare culoare** activat, o singură culoare fără potrivire respinge rezultatul. Poți reduce paleta 2D, adăuga un filament util, permite mai multă înălțime de tranziție sau repetări ori relaxa limita. Dezactivează potrivirea strictă numai dacă accepți renunțarea la culori distincte și unirea regiunilor lor. După respingere, pe ecran poate rămâne o previzualizare generată anterior; nu este o generare reușită cu setările respinse.

## Ajustările dispar în 3D sau în fișierul descărcat

Apasă **Aplică** în Ajustări pentru a integra aspectul live în imaginea sursă înainte de cuantizare, generare sau descărcare. Previzualizarea ajustărilor și sursa sunt separate. Consultă [Ajustările imaginii](image-adjustments).

## Ștergerea unei mostre nu i-a eliminat pixelii

**Șterge** elimină o opțiune din paletă și remapează imaginea la culorile rămase. Nu este o radieră. Folosește instrumentul Radieră sau setează transparența acelei mostre la zero pentru un decupaj. Cuantizarea poate face opaci pixelii parțial transparenți, așa că inspectează din nou silueta după aceea.

## Colectează o înregistrare de diagnostic Auto-paint

Pentru un rezultat care necesită investigații mai amănunțite în aplicația desktop, activează **Înregistrează diagnostice Auto-paint** în **Setări**, rulează un calcul Auto-paint nou și folosește **Deschide dosarul** pentru a găsi înregistrarea `.jsonl` rezultată. Activează înregistrarea înainte să înceapă calculul. Generarea geometriei dintr-un rezultat deja calculat nu înregistrează acel calcul anterior. Consultă [Diagnostice Auto-paint pe desktop](settings-and-controls#desktop-auto-paint-diagnostics) înainte de a partaja o înregistrare.

## Generarea 3D este lentă

Imaginile mari, multe culori, multe straturi și geometria netezită măresc timpul de generare. Încearcă:

- Decuparea imaginii.
- Reducerea numărului de culori.
- Dezactivarea **Geometriei netezite**.
- Reducerea rezoluției cu **Redimensionează imaginea**. Simpla micșorare a dimensiunii pixelului face aceeași geometrie mai mică, nu mai simplă.
- Simplificarea opțiunilor Auto-paint.

## Fișierul exportat se deschide cu culori neașteptate

Pentru 3MF, verifică atribuirile materialelor sau filamentelor în slicer. Kromacut păstrează informațiile de culoare când este posibil, dar slicerele pot mapa diferit culorile la extrudoare.

Pentru STL, fișierul nu conține atribuiri de culori ale filamentelor. Folosește **Instrucțiunile de imprimare** pentru schimbările de filament.

Vederea Simulate din Auto-paint arată amestecuri estimate; slicerele afișează de obicei culorile fizice ale filamentelor. Comută Kromacut pe **Fizice** pentru verificarea atribuirilor, apoi inspectează maparea reală a rolelor. Niciuna dintre vederi nu dovedește culoarea imprimată finală.

## Slicerul nu se deschide

**Deschide în slicer** este disponibil doar în aplicația desktop. În browser, folosește **Descarcă 3MF** și deschide fișierul în slicer.

Dacă Kromacut raportează că nu a putut deschide fișierul 3MF, folosește **Descarcă 3MF** pentru a salva fișierul și deschide-l din slicer. Dacă fișierul se deschide într-un vizualizator 3D sau în altă aplicație, alegerea salvată este probabil **Implicit în sistem**: folosește **Alege slicerul** din meniul de descărcare sau **Schimbă** din **Setări** pentru a selecta chiar slicerul tău. Dacă un slicer salvat a fost mutat sau dezinstalat, Kromacut îți cere să alegi din nou. Consultă [Salvare și anulare](generating-exporting-output#saving-and-cancelling).

## Modul cu mai multe capete a generat un model cu un singur cap

Un mesaj care spune că s-a generat un model normal cu un singur cap înseamnă că analiza pentru mai multe capete nu s-a încheiat sau nu a găsit o configurație care să îmbunătățească suficient stiva normală. Modelul, instrucțiunile de imprimare și exportul folosesc atunci culoarea de început și planul de schimbări obișnuite, nu un program al capetelor. Încearcă alte filamente, alt număr de capete sau altă profunzime a căutării, apoi apasă din nou **Generează modelul 3D**. Dacă analiza nu s-a încheiat, încearcă mai întâi cu mai puține capete. Consultă [Imprimare cu mai multe capete](multi-head-printing#fallback-and-rebuilding).

## Decuparea sau editările imaginii au mers prea departe

Folosește **Anulează**. Refacerea este disponibilă dacă anulezi prea mult.

În continuare: [Întrebări frecvente](faq).
