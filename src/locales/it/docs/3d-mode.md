---
title: Modalità 3D
slug: 3d-mode
order: 60
description: Dimensioni fisiche, pile di colori manuali, mesh e controlli dell’anteprima.
---

# Modalità 3D

La modalità 3D trasforma i colori dell’immagine in strati fisici. Prepara l’immagine in 2D, scegli dimensioni e metodo di stampa, quindi fai clic su **Genera modello 3D**. Cambiare un’impostazione non rigenera automaticamente il modello visualizzato.

Usa **Manuale** per scegliere personalmente l’ordine dei colori e gli spessori. Usa **Auto-paint** per prevedere le miscele dei tuoi filamenti reali e trovare una pila adatta all’immagine. Nessun metodo aziona la stampante: esporta il modello e controllalo nello slicer.

## Impostazioni di stampa 3D

| Controllo | Effetto sul modello | Cosa controllare |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Dimensione pixel (XY)** | Millimetri per pixel dell’immagine in entrambe le direzioni orizzontali. | L’indicatore **Modello** stima larghezza, altezza e profondità fisiche prima della generazione. |
| **Altezza dello strato** | Il passo verticale regolare usato per altezze e cambi. | Deve corrispondere allo slicer. Strati più sottili offrono altezze più precise, non linee di estrusione più strette. |
| **Altezza del primo strato** | Il primo passo sopra il piatto. | Va impostata separatamente. Il primo colore deve essere spesso almeno quanto il maggiore tra altezza regolare e altezza del primo strato. |
| **Larghezza effettiva della linea** | Larghezza di estrusione usata dai controlli dei dettagli stampabili e dal dithering dell’altezza di Auto-paint. | Usa la larghezza di linea prevista dallo slicer, non il diametro dell’ugello o la dimensione pixel. Non modifica il profilo della stampante. |
| **Mesh levigata** | Trasforma i bordi a gradini dei pixel in contorni connessi levigati. | Modifica la geometria esportata, non solo l’illuminazione. Non aggiunge dettagli all’immagine e non stira la superficie. |
| **Reimposta** | Ripristina 0,1 mm/pixel, strati regolari da 0,12 mm, primo strato da 0,2 mm, larghezza effettiva della linea da 0,42 mm e levigatura disattivata. | Riporta anche gli spessori manuali al minimo, mantenendo l’ordine attuale dei colori. |

### La dimensione pixel non è la dimensione dell’ugello

Un’immagine larga 1.000 pixel a **0,1 mm/pixel** produce un modello largo circa **100 mm**. A **0,2 mm/pixel**, diventa largo circa **200 mm** mantenendo esattamente gli stessi pixel. I margini esterni trasparenti sono esclusi dai limiti del modello.

![La stessa griglia di immagine diventa fisicamente più grande aumentando la dimensione pixel; ridimensionare l’immagine modifica invece il numero di pixel.](10_physical_size.svg)

_Schema. Dimensioni XY, risoluzione dell’immagine e larghezza di estrusione sono controlli separati._

Per mantenere una larghezza di 100 mm con 2.000 pixel, usa **0,05 mm/pixel**. Più pixel possono descrivere bordi più fini, ma la stampante conserva il limite della larghezza di estrusione. Imposta **Larghezza effettiva della linea** nelle **Impostazioni di stampa 3D**, quindi usa l’[anteprima dei dettagli stampabili](auto-paint#printable-detail) di Auto-paint per esaminare questo limite.

Aumentare la dimensione pixel non riduce il numero di pixel né rende intrinsecamente più economica la generazione della mesh. Per una generazione più leggera, ridimensiona o ritaglia in [modalità 2D](loading-images), oppure semplifica la tavolozza.

### Larghezza effettiva della linea

Copia la larghezza di estrusione prevista dallo slicer in **Larghezza effettiva della linea**. Accetta valori da 0,1 a 2 mm. Reimpostare le **Impostazioni di stampa 3D** la riporta a 0,42 mm insieme agli altri valori predefiniti della sezione. Modificare questo campo non cambia il profilo della stampante.

Auto-paint usa questa larghezza per l’anteprima degli avvisi di larghezza, la pulizia facoltativa dei puntini di colore isolati e la dimensione dei blocchi del dithering dell’altezza. I controlli per esaminare gli avvisi o escludere i puntini isolati restano in [Auto-paint](auto-paint#printable-detail). Un avviso non significa che un dettaglio verrà rimosso o non sia stampabile.

### Altezze degli strati e limiti validi

Con un **primo strato da 0,20 mm** e **strati regolari da 0,08 mm**, le sommità degli strati si trovano a 0,20, 0,28, 0,36 e 0,44 mm. Non a 0,08, 0,16, 0,24 e 0,32 mm. Kromacut allinea gli spessori dei colori a questa griglia.

Cambiare **Altezza dello strato** reimposta gli spessori manuali al nuovo passo regolare, poi applica il minimo del primo colore. Cambiare **Altezza del primo strato** reimposta il primo colore al nuovo minimo. Imposta questi valori prima di regolare i cursori e ricontrolla il piano se cambiano.

I campi accettano intervalli ampi: 0,01–10 mm/pixel per la dimensione pixel, 0,01–10 mm per l’altezza dello strato e 0–10 mm per l’altezza del primo strato. Sono limiti di immissione, non impostazioni consigliate per la stampante; il primo colore viene comunque allineato al minimo fisico. Usa valori supportati da ugello, materiale e slicer. Un’altezza più fine modifica le ricette disponibili in Auto-paint; non rende automaticamente compatibile la calibrazione esistente.

## Modalità manuale

**Altezze degli strati colore** elenca i **Colori dell’immagine** non trasparenti. Ogni riga contiene una maniglia di trascinamento, un campione colore, un cursore dello spessore e il valore in millimetri. Questo valore è lo spessore della sequenza di quel colore, non l’altezza assoluta della sua sommità. Una sequenza può occupare più strati dello slicer.

![Tre sequenze manuali formano altezze cumulative; aumentare una sequenza inferiore alza ogni superficie successiva.](11_manual_layers.svg)

_Sezione schematica. Una superficie di un colore successivo contiene sotto di sé le sequenze precedenti._

Per esempio, imposta il nero a **0,20 mm**, il rosso a **0,16 mm** e il bianco a **0,08 mm**, con strati regolari da 0,08 mm. Le regioni nere terminano a 0,20 mm, quelle rosse a 0,36 mm e quelle bianche a 0,44 mm. Il rosso inizia allo strato 2 dello slicer; il bianco allo strato 4. Verifica le istruzioni generate e l’interpretazione dello slicer prima di stampare.

### Riordinare i colori

Trascina le righe dall’alto verso il basso nell’ordine di stampa. La prima riga parte dal piatto. Le righe successive si stampano sopra le precedenti solo dove l’immagine lo richiede, formando un rilievo a gradini. Spostare un colore cambia il materiale sottostante, l’altezza della superficie e la sequenza dei cambi. Una riga spostata al primo posto viene alzata al minimo del primo strato quando necessario.

L’anteprima e l’esportazione manuali usano i colori dell’immagine, non il modello HD di Auto-paint. Uno strato sottile di rosso sul nero può risultare più scuro del campione anche se l’anteprima manuale appare rossa. Scegli materiali e spessori di conseguenza.

### Regolare e reimpostare gli spessori

Trascina un cursore e rilascialo per confermare. Le sequenze successive avanzano per passi pari a **Altezza dello strato**. La prima parte dal proprio minimo e aggiunge passi regolari. Aumentare una sequenza inferiore alza tutte le superfici successive e sposta i loro cambi, non solo le regioni dove il colore inferiore resta visibile.

La reimpostazione di **Altezze degli strati colore** ordina dal più scuro al più chiaro per luminanza e assegna gli spessori minimi. È diversa dalla reimpostazione delle **Impostazioni di stampa 3D**, che modifica anche i parametri fisici di stampa ma conserva l’ordine.

I controlli manuali e le istruzioni di cambio supportano **64 colori**. Riduci le tavolozze più grandi in 2D. I pixel completamente trasparenti non creano materiale, non un fondo bianco. Le isole opache scollegate restano pezzi separati se l’immagine non le collega.

## Mesh levigata

Con la levigatura disattivata, i contorni seguono la griglia quadrata dei pixel. Attivandola, i bordi connessi vengono levigati in una geometria saldata. La differenza viene esportata: non è un filtro dell’anteprima.

Ammorbidisce i contorni del modello nell’anteprima e nelle esportazioni. Media mantiene la levigatura originale. Ricostruisci per applicare.

| Intensità | Utilizzo |
| --- | --- |
| **Nessuna** | Pixel art, bordi esatti della griglia o generazione più rapida. |
| **Minima** | Pulizia leggera degli angoli frastagliati. |
| **Media** | Il risultato familiare della precedente impostazione attiva. |
| **Intensa** | Levigatura più intensa lungo i contorni, con lo stesso limite di spostamento e senza passaggi aggiuntivi. |

Lo spostamento rimane inferiore a mezzo pixel. Ricostruisci il modello e controlla l’anteprima nello slicer. Le impostazioni attiva/disattiva diventano Media/Nessuna.

![Confronto tra contorni diagonali a gradini e levigati sulla stessa griglia sorgente.](12_smooth_boundaries.svg)

_Confronto schematico dei contorni, non una simulazione dello slicer._

Usala per contorni curvi o diagonali che appaiono troppo scalettati. Lasciala disattivata per pixel art intenzionale o bordi esatti sulla griglia. Nessuna delle due scelte ripara dettagli troppo piccoli da stampare o inventa risoluzione assente nella sorgente.

Mesh levigata è inattiva durante [Flat Paint](flat-paint). Attivare Mesh levigata disabilita Flat Paint; Flat Paint usa invece la propria costruzione a lastra sull’intera sagoma.

## Auto-paint

Auto-paint accetta colori reali dei filamenti e **Distanza di copertura (HD)**, prevede le miscele e associa i colori dell’immagine ad altezze stampabili. Leggi [Controlli Auto-paint](auto-paint) per tutti i controlli di filamenti, corrispondenza, dettagli e affidabilità.

## Calibrare la distanza di copertura del filamento

**Calibra**, sotto l’elenco dei filamenti, apre **Distanza di copertura**, **Palette Proof** e **Stack Matrix**. Segui [Flussi di calibrazione](calibration-workflows) per stampare e registrare i risultati, oppure [Teoria della calibrazione](calibration-theory) per il modello ottico.

## Profili filamenti

I profili salvano set di filamenti con nome e dati compatibili. Le modifiche non salvate non vengono scritte automaticamente nel profilo selezionato. Vedi [Filamenti e profili](auto-paint#filament-profiles) e [file dei profili](settings-and-controls#filament-profile-files).

### Modelli

I modelli sono set di riferimento dei fornitori in sola lettura, non misure delle tue bobine. Caricali, regolali, calibrali, quindi usa **Salva come nuovo profilo**. Vedi [Modelli](auto-paint#templates).

## Altezza massima

Il limite accorcia le transizioni di Auto-paint su confini validi degli strati, ma non può rimuovere la base opaca. Leggi [Altezza massima](auto-paint#max-height), compresa l’avvertenza sul supporto trasparente di Flat Paint.

## Dettagli stampabili

Imposta **Larghezza effettiva della linea** nelle **Impostazioni di stampa 3D**, quindi usa **Apri anteprima** in Auto-paint per esaminare le regioni sottili dei colori sorgente. **Escludi puntini di colore isolati** sostituisce facoltativamente i colori usati solo in minuscoli puntini circondati da un altro colore, mantenendo linee sottili e dettagli collegati. Gli avvisi e i conteggi dei pixel effettivamente esclusi sono mostrati separatamente. Vedi [Dettagli stampabili](auto-paint#printable-detail).

## Corrispondenza colori avanzata

Cerca ordini dei materiali con ripetizioni, requisiti di colori distinti o dithering spaziale dell’altezza. Queste opzioni bilanciano copertura cromatica, spessore, cambi e calcolo. Vedi [Corrispondenza colori avanzata](auto-paint#enhanced-color-matching).

## Flat Paint

Crea una lastra multimateriale anziché un rilievo a gradini, con la faccia in giù su un supporto trasparente oppure con la faccia in su senza supporto. Leggi [Flat Paint](flat-paint) prima di esportare, perché direzione di osservazione e assegnazioni degli oggetti sono importanti.

## Impostazioni ottimizzatore

**Algoritmo**, **Priorità delle regioni**, **Dettaglio delle transizioni** e **Seme** regolano la corrispondenza, non la velocità della stampante. Vedi [Impostazioni ottimizzatore](auto-paint#optimizer-settings).

## Zone di transizione e affidabilità

Le zone descrivono sequenze fisiche; l’affidabilità descrive dati disponibili e limiti del modello, non la precisione di stampa misurata. Vedi [Leggere il risultato](auto-paint#transition-zones-and-confidence).

## Palette Proof

Confronta un provino stampato con colori selezionati dell’immagine e registra quali candidati corrispondono. Vedi [Flussi di calibrazione](calibration-workflows#palette-proof-compare-artwork-colors).

## Stack Matrix

Fotografa una tavola di ricette salvata, verifica l’allineamento e salva i colori misurati per pile compatibili. Vedi [Flussi di calibrazione](calibration-workflows#stack-matrix-photograph-known-recipes).

## Controlli dell’anteprima

Trascina con il pulsante principale del mouse per orbitare, usa la rotellina per lo zoom e trascina con il pulsante secondario per spostare la vista. Muovere la camera non cambia mai le dimensioni fisiche.

| Controllo della barra | A cosa serve | Effetto sulla stampa |
| ------------------ | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| **Colori fedeli** | Confrontare i campioni selezionati senza illuminazione di scena o mappatura tonale cinematografica. | Solo anteprima. Dipende comunque dal modello e dallo schermo; non convalida la calibrazione. |
| **Ombreggiato** | Esaminare rilievo e forma illuminati. | Solo anteprima; l’illuminazione cambia il colore apparente. |
| **Trasparente** | Vedere gli strati sovrapposti. | Solo anteprima; non rende trasparente il filamento. |
| **Reticolo** | Esaminare i bordi dei dettagli colorati per strato. | Solo anteprima; non sono percorsi di estrusione. |
| **Colori anteprima** | Alternare miscele simulate da Auto-paint e colori fisici dei filamenti. | Solo anteprima. Le esportazioni mantengono le assegnazioni reali dei materiali. |
| **Cambio camera** | Passare dalla profondità prospettica all’allineamento ortografico senza scorcio. | Solo anteprima. La posizione della camera viene mantenuta. |
| **Annulla / Ripeti** | Percorrere la cronologia condivisa delle modifiche all’immagine. | Non annulla i campi 3D o le modifiche ai filamenti. Rigenera dopo una modifica all’immagine. |
| **Scarica** | Esportare lo STL o il 3MF generato. | Usa l’ultimo modello generato, non le impostazioni della barra laterale non applicate. |

La modalità di visualizzazione e la scelta tra colori simulati e fisici vengono ricordate. **Colori anteprima** appare solo per un modello Auto-paint già generato.

## Anteprima degli strati

Trascina le maniglie inferiore e superiore della barra in basso per isolare un intervallo di altezze. Le posizioni si agganciano alla griglia degli strati. Passa sopra i segmenti dei materiali per informazioni sull’inizio o sui cambi.

![Le maniglie di taglio nascondono strati per esaminarli, ma l’esportazione contiene comunque il modello completo.](19_preview_only.svg)

_Schema. Nascondere uno strato sullo schermo non lo elimina mai dall’esportazione._

Flat Paint ha una traccia semplice perché più materiali possono occupare lo stesso strato stampato. Orbita sotto la disposizione predefinita a faccia in giù per vedere l’immagine.

Un calcolo Auto-paint fallito può lasciare visibile l’ultima generazione riuscita. Non considerarla una prova che le nuove impostazioni abbiano funzionato. Le istruzioni di stampa usano l’istantanea generata, quando esiste. Risolvi l’errore, genera nuovamente, poi esamina ed esporta.

Prosegui con: [Controlli Auto-paint](auto-paint), [Flat Paint](flat-paint) o [Generazione ed esportazione](generating-exporting-output).
