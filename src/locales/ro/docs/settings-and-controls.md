---
title: Setări și comenzi
slug: settings-and-controls
order: 80
description: Acțiuni din antet, teme, persistență, palete, profiluri și comenzi ale spațiului de lucru.
---

# Setări și comenzi

Această pagină reunește comenzile care afectează întreaga aplicație sau sunt ușor de trecut cu vederea.

## Comenzile din antet

| Comandă | Ce face |
| ------------- | ------------------------------------------------------------------------------ |
| Sigla Kromacut | Revine la aplicație când documentația este deschisă; altfel deschide pagina principală. |
| Setări | Deschide dialogul de setări, inclusiv comenzile pentru limbă, temă, resurse și actualizări. |

Selectorul de temă oferă **Sistem**, **Întunecată** și **Luminoasă**. **Sistem** urmează preferința de schemă cromatică a sistemului de operare sau browserului și se actualizează când aceasta se schimbă. Alegerea temei se salvează pentru sesiunile viitoare.

Selectorul **Limbă** schimbă interfața, documentația, diagramele și paginile publice. Alege **Limba sistemului** pentru a urma o limbă acceptată a browserului sau sistemului de operare ori selectează engleză, franceză, germană, italiană, română, spaniolă, japoneză, chineză simplificată, hindi, portugheză europeană, ucraineană sau bengaleză. Alegerea se salvează local și nu schimbă imaginea, profilurile de filamente, setările de imprimare sau geometria generată. Resursele de traducere și fonturile sunt incluse în aplicația desktop; niciun serviciu online de traducere nu primește lucrările tale.

Paginile publice oferă și ele un selector de limbă. Documentația tradusă folosește linkuri partajabile cu prefix de limbă, precum `/ro/docs/overview`. Numele paginilor și ancorele secțiunilor rămân stabile între limbi. Extensiile fișierelor, datele numerice ale modelului, numele introduse de utilizator și titlurile originale ale lucrărilor comunității nu sunt traduse.

Dialogul de setări include legături către documentație, Discord, Reddit, GitHub și Patreon și afișează versiunea curentă Kromacut. **Confidențialitate și date locale** și **Termeni și condiții** sunt disponibile tot aici și se deschid în browser în limba selectată.

## Modurile spațiului de lucru

Folosește butoanele **2D** și **3D** pentru a comuta între pregătirea imaginii și generarea modelului.

Separatorul vertical dintre panoul de comenzi și previzualizare poate fi tras. Lărgește panoul din stânga când lucrezi cu setări detaliate sau previzualizarea când inspectezi imaginea ori modelul.

Paginile documentației folosesc linkuri partajabile `/docs/...`. Deschiderea unui astfel de link te duce direct la ghidul corespunzător.

Pe ecrane mici, extinde **Cuprins** pentru a alege un ghid sau **Pe această pagină** pentru a sări la o secțiune. Ambele se închid după selecție, lăsând spațiu de citit. Ilustrațiile pot fi deschise la dimensiune completă prin clic sau prin focalizarea linkului lor și apăsarea tastei Enter.

Majoritatea secțiunilor laterale pot fi restrânse apăsând titlul. Restrângerea ascunde comenzile, nu efectele lor: ajustările active, setările de imprimare și opțiunile optimizatorului se aplică în continuare. Rezumatele restrânse și punctele de stare te ajută să observi modificările active. Starea deschis/închis a secțiunilor este memorată. Extinderea unei secțiuni nu o resetează.

**Anulează / Refă** folosește același istoric al editării imaginii în 2D și 3D. Nu este un istoric de anulare pentru editările filamentelor, calibrare, înălțimi de strat sau setările optimizatorului. Folosește resetarea proprie fiecărui panou, unde există, și regenerează după restaurarea unei stări a imaginii.

## Modul experimental multiplacă

Comutatorul **Mod multiplacă** din Setări este un flux neterminat. Memorează preferința și poate reda o animație de previzualizare, dar momentan nu împarte imaginea, nu creează dale, nu distribuie obiecte pe plăci și nu schimbă geometria exportată. Lasă-l dezactivat pentru imprimarea obișnuită. Nu îl folosi pentru a încadra un model prea mare pe patul imprimantei.

## Setările de imprimare salvate

Kromacut memorează în browser setări precum **Dimensiunea pixelului (XY)**, **Înălțimea stratului**, **Înălțimea primului strat**, **Lățimea efectivă a liniei** și **Geometrie netezită**.

Folosește butonul de resetare din **Setări de imprimare 3D** pentru a reveni la valorile implicite ale secțiunii, inclusiv 0,42 mm pentru lățimea efectivă a liniei.

Setările memorate sunt locale browserului/site-ului sau aplicației desktop curente. Nu sunt o copie de siguranță a imaginii ori un proiect complet salvat, iar browserele separate și aplicația desktop nu trebuie să le partajeze. Exportă paletele și profilurile importante înainte de a șterge datele aplicației/browserului. Încărcarea unui profil restaurează filamentele și datele sale, nu o imagine sau o geometrie deja generată.

## Starea Auto-paint salvată

Setările Auto-paint sunt păstrate între sesiuni, inclusiv:

- Filamentele.
- Modul de colorare.
- Înălțimea maximă și înălțimea stratului penei de calibrare.
- Potrivirea îmbunătățită a culorilor.
- Păstrarea separării culorilor, limita sa ΔE pentru potrivire unică și dacă fiecare culoare necesită o potrivire unică.
- Limita totală de repetări (apariții suplimentare ale filamentelor, împărțite în întreaga stivă).
- Detalierea tranzițiilor și ditheringul de înălțime.
- Lățimea efectivă a liniei (editată în **Setări de imprimare 3D**) pentru avertismente de lățime, curățarea punctelor izolate și dithering de înălțime, plus preferința salvată **Omite punctele de culoare izolate**. Preferința de curățare nu elimină toate avertismentele de lățime și nu controlează ditheringul de înălțime.
- Flat Paint și preferința sa pentru fața în sus, fără strat transparent.
- Algoritmul optimizatorului și sămânța aleatorie.
- Prioritatea regiunii.

Profilurile sunt separate de această stare memorată. Folosește profiluri când vrei seturi denumite de filamente care pot fi încărcate, importate sau exportate.

## Fișiere de paletă

Paletele personalizate sunt pentru reducerea culorilor în 2D. Fișierele de paletă folosesc `.kpal`.

Versiunea 2 a formatului de paletă adaugă două câmpuri opționale: `disabledColors` (culori păstrate în paletă, dar excluse de la cuantizare) și `colorNames` (nume opționale afișate pentru fiecare culoare). Ambele sunt păstrate la export și import. Fișierele versiunii 1 se încarcă neschimbate, cu toate culorile activate și fără nume, iar un fișier v2 deschis într-un Kromacut mai vechi tratează pur și simplu toate culorile ca activate.

Folosește palete personalizate când vrei ca imaginea redusă să corespundă unui set cunoscut de filamente sau unei colecții fixe de culori.

## Fișiere de profil de filamente

Profilurile de filamente Auto-paint sunt seturi denumite de filamente care pot fi salvate, încărcate, importate și exportate. Folosesc `.kfil` și stochează culorile, numele, distanțele de acoperire, datele de calibrare, înregistrările și evaluările Palette Proof salvate și, când sunt disponibile, planurile limitate Stack Matrix și culorile măsurate. Fișierele mai vechi `.kapp` pot fi importate în continuare. Profilurile salvate de versiuni vechi stocau valorile necalibrate pe scara TD convențională; acestea sunt convertite automat (×0,1) la încărcare sau import.

Folosește **pictograma de încărcare** din bara profilului Auto-paint pentru a importa un fișier. Un fișier mai vechi cu același ID, fără date de aspect, este importat ca o copie separată redenumită în loc să șteargă date de calibrare mai noi, iar o eroare de stocare lasă lista existentă de profiluri neschimbată și afișează un mesaj de eroare. Folosește **pictograma de descărcare** pentru a exporta setul curent de filamente. Fișierele exportate au implicit extensia `.kfil`. Când profilul încărcat are editări de filament nesalvate, exportul este un profil nou de „editări nesalvate”, fără date de aspect legate de identitățile vechi ale filamentelor.

### Formate de import acceptate

| Format | Extensie | Observații |
| ----------------------- | -------------- | ------------------------------------------------------------------------------ |
| Profil Kromacut | `.kfil` | Format nativ. Acceptă profiluri individuale și liste de profiluri într-un singur fișier. |
| Profil Kromacut vechi | `.kapp` | Format nativ mai vechi, încă acceptat integral la import. |
| JSON brut | `.json` | Acceptat dacă fișierul conține un obiect de profil sau o listă de obiecte de profil. |
| CSV/TSV de role HueForge | `.csv`, `.tsv` | Vezi mai jos. |

### Gestionarea duplicatelor

La import, Kromacut verifică fiecare profil primit față de cele existente:

- **Același ID:** în mod normal suprascrie profilul existent. Dacă ar înlocui date de aspect salvate cu un fișier fără date utilizabile, importă în schimb o copie separată.
- **Același conținut, ID diferit:** este omis doar dacă atât datele filamentelor, cât și datele de aspect coincid cu un profil existent.
- **Același nume, conținut diferit:** este importat cu un sufix numeric adăugat numelui (de exemplu `My Spools (2)`).

După fiecare import apare un scurt rezumat al numărului de profiluri importate, suprascrise, omise sau redenumite.

### Importul din HueForge

Exporturile bibliotecii de role HueForge (`.csv` sau `.tsv`) pot fi importate direct. Folosește **Export Spools** în HueForge pentru a salva un CSV, apoi apasă pictograma de încărcare din bara profilului de filamente Auto-paint și selectează fișierul. Separatorul (virgulă sau tabulator) este detectat automat din rândul de antet. Fiecare rolă devine o intrare de filament denumită `<Brand>-<Color Name>-<Hex>`, de exemplu `Inland Basic-Light Brown-#BF9C81`. UUID-urile HueForge sunt păstrate ca ID-uri de filament, astfel că reimportarea aceleiași biblioteci nu creează duplicate. Valorile TD HueForge sunt tratate ca intrări TD convenționale pentru retroiluminare/litofanie și convertite în distanțe de acoperire la iluminare frontală în timpul importului.

## Notificări de actualizare pe desktop

În aplicația desktop, Kromacut poate afișa o notificare când este disponibilă o versiune mai nouă. Notificarea permite deschiderea paginii de descărcare sau închiderea mementoului.

Deschide **Setări** pentru a verifica manual actualizările. Setările desktop includ și **Verifică la pornire**, care controlează dacă Kromacut caută actualizări la deschiderea aplicației. Este activată implicit, iar verificările manuale funcționează și când este dezactivată.

Pe Linux, fișierele AppImage cu informații de actualizare încorporate pot fi actualizate cu instrumente compatibile precum AppImageUpdate. Acestea folosesc fișierul `.AppImage.zsync` al versiunii pentru a descărca părțile modificate. Fișierele AppImage mai vechi, fără informații de actualizare, necesită o primă descărcare manuală a unei versiuni compatibile. Fișierul `.zsync` nu este un program de instalare, iar notificarea Kromacut nu instalează automat actualizările.

## Diagnostice Auto-paint pe desktop

Aplicația desktop poate înregistra informații structurate despre calcule Auto-paint noi. Deschide **Setări** și activează **Înregistrează diagnostice Auto-paint** înainte de a porni un calcul. Setarea nu repornește și nu înregistrează un rezultat deja calculat.

Fiecare calcul creează un fișier `.jsonl` separat în dosarul de diagnostice Auto-paint al Kromacut. Folosește **Deschide dosarul** de lângă setare pentru a găsi fișierele. Fiecare rând este un eveniment JSON complet, astfel că progresul, erorile și anulările rămân lizibile chiar dacă un calcul nu se încheie.

O înregistrare completă include informații de bază despre rulare, instantaneul filamentelor și calibrării active, setările de generare și optimizare, mostre limitate de progres, starea ajustării aspectului, deciziile progresive privind nivelurile de repetare, straturile fizice finale, fiecare candidat final de culoare imprimabilă, comparațiile Delta E dintre ținte și candidați, încrederea predicției și măsurătorile care au contribuit la culorile interpolate sau ajustate local. Înregistrează culorile și ponderile paletei procesate, nu imaginea sursă încărcată. Datele de calibrare și profil pot fi totuși sensibile, deci verifică înregistrarea înainte de a o partaja public.

Înregistrarea este destinată investigațiilor și poate crea fișiere mari. Las-o dezactivată pentru imprimarea obișnuită când nu ai nevoie de o înregistrare.

## Deschiderea fișierelor de pe desktop

Instalările desktop asociază fișierele `.kfil` și vechile `.kapp` cu profilurile de filamente, iar fișierele `.kpal` cu paletele. Fă dublu clic pe un fișier pentru a-l importa și selecta în Kromacut. Dacă aplicația rulează deja, fișierul este deschis în fereastra existentă. Se aplică regulile obișnuite de validare, migrare, gestionare a duplicatelor și păstrare a calibrării.

Fișierele deschise de pe desktop așteaptă cât timp editorul de palete, dialogul de calibrare sau formularul de redenumire ori salvare a unui profil nou este deschis. Finalizează sau anulează sesiunea pentru a continua importurile din coadă; numele introduse și profilul editat rămân neschimbate până atunci.

Importurile așteaptă și cât timp editezi numele sau câmpul HD al unui filament ori cât timp selectorul său de culoare sau panoul **Convertește din TD** este deschis. Părăsește câmpul sau închide selectorul ori panoul pentru a relua importurile din coadă; modificările nesalvate ale filamentelor necesită în continuare alegerea ta înainte ca alt profil să le înlocuiască.

Înainte de a înlocui modificările nesalvate ale filamentelor, Kromacut oferă **Păstrează modificările** sau **Deschide profilul**. Păstrează modificările pentru a le salva mai întâi; deschiderea profilului renunță la ele. Fișierele deschise astfel trebuie să fie mai mici de 32 MiB. Fișierele JSON generice, imaginile și modelele păstrează fluxurile obișnuite de import.

Pe Linux, fișierele AppImage portabile necesită integrare cu desktopul pentru asocierea fișierelor. Dacă sistemul nu a selectat Kromacut ca aplicație implicită, folosește **Deschide cu** în managerul de fișiere.

În continuare: [Depanare](troubleshooting).
