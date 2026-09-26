---
title: Încărcarea imaginilor
slug: loading-images
order: 30
description: Importă, decupează, redimensionează și retușează pixelii imaginii înainte de a deveni regiuni imprimate.
---

# Încărcarea imaginilor

În modul **2D**, pregătești imaginea pe care o va folosi modelul 3D. Modificările de culoare afectează culorile țintă; editările pixelilor afectează formele și detaliile imprimării.

## Alege o sursă

Apasă **Alege fișierul** în bara de instrumente a previzualizării sau trage un fișier imagine în previzualizarea 2D. Se încarcă doar primul fișier dintr-o tragere. Folosește un format de imagine pe care browserul sau componenta web a aplicației desktop îl poate decoda; PNG este util când contează transparența. Developează mai întâi fișierele RAW ale camerei și exportă-le într-un format obișnuit de imagine.

Kromacut pornește cu sigla sa ca exemplu. Încărcarea altei imagini înlocuiește imaginea de lucru curentă. Nu publică imaginea și nu descarcă o sursă dintr-un link web lipit.

## Inspectează fără să schimbi imaginea

| Comandă | Efect |
| ------------------- | ----------------------------------------------------------------------------------------- |
| Rotița mouse-ului | Mărește în jurul indicatorului. Schimbă doar vederea, nu rezoluția imaginii sau dimensiunea imprimării. |
| Tragere cu butonul stâng | Deplasează vederea când nu este activ niciun instrument de retușare. |
| Tragere cu butonul mijlociu | Deplasează vederea chiar și când este activ un instrument de retușare. |
| Comută tabla de șah | Afișează un model în spatele pixelilor transparenți. Modelul nu face parte din imagine sau imprimare. |
| Indicatorul dimensiunii imaginii | Afișează dimensiunile în pixeli. La decupare, arată și dimensiunile propuse ale decupajului. |

Previzualizarea folosește margini clare ale pixelilor, fără netezire. Mărește pentru a găsi pixelii izolați și detaliile înguste.

## Decupare, redimensionare sau schimbarea dimensiunii de imprimare?

![Decuparea elimină o parte din imagine, redimensionarea reduce rezoluția în pixeli, iar Dimensiunea pixelului schimbă scara fizică a fiecărui pixel.](30_crop_resize_scale.svg)

_Dimensiunile schematice ilustrează relația, nu o dimensiune recomandată de imprimare._

### Decupare

Apasă **Decupează**, trage selecția sau mânerele colțurilor și marginilor, apoi alege **Salvează decupajul**. **Anulează decuparea** lasă imaginea neschimbată. Salvarea păstrează dreptunghiul selectat la rezoluția pixelilor imaginii.

Decupează marginile nedorite înainte de reducerea culorilor, ca să nu concureze cu subiectul pentru paletă. Decuparea este dreptunghiulară; pentru un fundal neregulat folosește transparența.

### Redimensionarea imaginii

**Scară** variază de la **1% la 100%**, implicit **50%**. **Curent** și **După redimensionare** arată dimensiunile înainte de confirmare. Apasă **Aplică** pentru micșorare. 100%, sau o valoare care se rotunjește la aceleași dimensiuni, nu face nimic. Săgeata de resetare resetează procentul, nu imaginea.

Redimensionarea folosește netezire, deci poate introduce culori amestecate pe margini și transparență parțială. Redimensionează înainte de cuantizare sau redu din nou culorile după aceea. Aplicările repetate redimensionează imaginea deja redimensionată: două aplicări de 50% păstrează 25% din lățimea și înălțimea originale. Folosește Anulează pentru a recupera detaliile, nu încerca să mărești imaginea aici.

### Dimensiunea fizică în 3D

**Dimensiunea pixelului (XY)** reprezintă milimetri pe pixel al imaginii, nu rezoluția imaginii. O imagine complet opacă, lată de 1000 de pixeli, la 0,1 mm/pixel are lățimea de 100 mm. Redimensionarea la 500 de pixeli cu aceeași setare dă 50 mm. Schimbarea la 0,2 mm/pixel restaurează lățimea de 100 mm, dar nu detaliile eliminate. Marginile exterioare complet transparente nu intră în amprenta modelului.

Reducerea dimensiunilor în pixeli reduce volumul de procesare și geometrie. Schimbarea exclusivă a dimensiunii pixelului nu elimină pixeli. Consultă [Modul 3D](3d-mode) pentru comenzile scării fizice.

## Retușează pixelii

**Pensulă**, **Radieră**, **Umplere**, **Text** și **Alege culoarea din imagine** folosesc pixeli cu margini dure, fără antialiasing. O culoare personalizată poate totuși adăuga o culoare în paletă; marginile dure împiedică apariția nedorită a culorilor amestecate pe contur.

![Pensula adaugă pixeli de culoare exactă, radiera elimină pixeli prin transparență, umplerea schimbă o regiune conectată, iar textul devine pixeli ai imaginii cu margini dure.](31_pixel_tools.svg)

| Instrument sau câmp | Cum funcționează | Efect asupra imprimării |
| --------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Pensulă | Trage pentru a picta pixeli opaci. Dimensiunea este un diametru de 1–64 pixeli ai imaginii, implicit 4. | Repară contururi, unește regiuni sau îngroașă detalii. Cursorul îi arată amprenta. |
| Radieră | Folosește aceeași comandă de dimensiune, dar scrie pixeli complet transparenți. | Elimină material din formă, putând crea găuri sau separa piese. |
| Umplere | Înlocuiește regiunea apăsată care are exact același RGB și alfa. Conexiunile sunt prin muchii, nu diagonale. | Recolorează o regiune conectată, nu toate aparițiile culorii. Nu există o toleranță fotografică a culorii. |
| Alege culoarea din imagine | Preia un pixel sursă netransparent și trece la Pensulă. | Refolosește o culoare din imaginea de bază, nu un efect de ajustare neaplicat. |
| Culoarea instrumentului | Alege din Culorile imaginii, folosește selectorul sau introdu un cod hexazecimal de șase cifre. Închiderea ferestrei confirmă selecția. | Stabilește culoarea opacă pentru Pensulă, Umplere sau Text. |
| Dimensiunea textului | Mărimea fontului de la 6 la 128 de pixeli ai imaginii, implicit 24. | Textul mai mare produce elemente mai mari la aceeași scară fizică; valoarea nu este în milimetri. |

### Plasează textul

Selectează Text, apasă pe imagine și scrie. Enter adaugă un rând. Trage mânerul de deplasare de deasupra casetei pentru repoziționare sau mânerul din dreapta pentru ajustarea încadrării cuvintelor. Dimensiunea și culoarea actualizează ciorna.

Apasă butonul de confirmare sau **Ctrl+Enter** (**Command+Enter** pe macOS) pentru aplicare. Apăsarea în alt loc al imaginii sau schimbarea instrumentului confirmă de asemenea textul. X sau **Escape** renunță la ciorna deschisă; încă un Escape iese din instrument. Textul aplicat devine pixeli, nu un obiect text editabil.

Fiecare trasare, umplere sau plasare de text care schimbă imaginea este un pas în istoricul imaginii. O linie de 1 pixel la 0,1 mm/pixel are doar 0,1 mm lățime, oricât de mare pare la zoom. Inspectează literele înguste în slicer.

## Elimină un fundal

Nu există selecție automată a subiectului sau comandă AI de eliminare a fundalului. Pentru un fundal uniform, deschide mostra sa din Culorile imaginii, fă-o complet transparentă și aplică. Se elimină fiecare potrivire exactă, inclusiv pixelii similari ai subiectului. Folosește Radiera pentru eliminare locală și tabla de șah pentru inspectarea conturului.

Nu folosi **Șterge** pe mostră în acest scop: remapează culorile, nu face pixelii transparenți. Consultă [Culorile imaginii](reducing-colors#image-colors).

## Anulare, descărcare și golire

**Anulează** și **Refă** parcurg modificările confirmate ale imaginii: încărcare, decupare, redimensionare, integrarea ajustărilor, cuantizare, eliminarea ditheringului, editarea mostrelor și retușuri. Nu reprezintă istoricul fiecărei setări sau mișcări de glisor. O editare nouă șterge calea de refacere. Istoricul aparține sesiunii curente a aplicației, deci salvează imaginea dacă ai nevoie de ea ulterior.

**Descarcă imaginea** salvează imaginea de lucru de bază ca PNG, la rezoluția pixelilor imaginii. Nu include zoomul, tabla de șah, mânerele de decupare sau ciornele de text. Aplică textul și folosește **Aplică ajustările** înainte, pentru a le include. Aplicația desktop folosește un dialog de salvare; în browser, locația urmează setările sale de descărcare.

**Elimină imaginea** golește spațiul de lucru, nu setările. Nu te baza pe ea ca editare reversibilă: nu adaugă imaginea eliminată ca pas nou de anulare. Descarcă întâi o copie dacă trebuie să o păstrezi.

În continuare: [Ajustările imaginii](image-adjustments).
