---
title: Generazione ed esportazione
slug: generating-exporting-output
order: 70
description: Genera il modello, controllalo, esporta i file e copia le istruzioni di stampa.
---

# Generazione ed esportazione

L’esportazione inizia quando immagine 2D e controlli 3D sono pronti.

![Prepara immagine e impostazioni, genera un’istantanea, controllala ed esporta tutta la pila. Nuove impostazioni richiedono generazione; limitare l’anteprima non limita l’export.](40_build_export_snapshot.svg)

## Prima di esportare

Verifica questi punti:

1. In 2D, riduci a un numero pratico di colori.
2. Nelle **Impostazioni stampa 3D**, scegli dimensioni con **Dimensione pixel (XY)**. Allinea **Altezza strato** e **Altezza primo strato** allo slicer e **Larghezza linea effettiva** all’estrusione prevista per controlli di dettaglio e dithering dell’altezza.
3. Scegli **Manuale** o **Auto-paint**.
4. Fai clic su **Genera modello 3D**.
5. Esamina modello e **Anteprima strati**.

Un **Avviso prestazioni** indica possibile lentezza per dimensioni, pixel, strati o carichi simili. Puoi **Generare comunque** o annullare e semplificare.

## Generare il modello 3D

Fai clic su **Genera modello 3D** quando vuoi che vista e geometria esportata riflettano le impostazioni correnti.

Durante la generazione compaiono progressi come lettura degli strati di colore, mappatura e costruzione. L’export torna utile quando la sovrapposizione scompare e il modello aggiornato è pronto.

Calcolare una nuova pila Auto-paint non equivale a generare una nuova mesh. L’export usa l’ultimo modello generato e le istruzioni restano collegate a esso. Dopo modifiche a immagine, profilo, calibrazione o stampa, attendi il calcolo e rigenera prima di esportare. Una vecchia vista può rimanere durante calcolo o rifiuto delle nuove impostazioni; non ne prova il successo.

## Scegliere STL o 3MF

Apri il menu di download 3D e scegli:

| Formato | Quando usarlo |
| ------ | ------------------------------------------------------------------------------------------ |
| STL | Vuoi geometria unica ampiamente supportata e gestirai manualmente i cambi. |
| 3MF | Vuoi colori per slicer che preservano oggetti colorati multipli. |

Il 3MF preserva quando possibile i colori fisici Auto-paint. Verifica comunque le assegnazioni prima di stampare.

L’anteprima può mostrare decine di miscele con poche bobine. Il 3MF assegna i filamenti reali agli strati, non un materiale per miscela. La vista colori dello slicer può quindi differire da **Simulati** senza essere errata. Confronta con **Fisici** quando controlli le assegnazioni.

STL non contiene colori né assegnazioni automatiche. Usa il piano copiato con i controlli cambio colore dello slicer. 3MF è comunque un modello, non G-code eseguibile: scegli stampante, ugello, profili, temperature e velocità, poi esegui slicing.

Per **Flat Paint** è disponibile solo 3MF: un oggetto per filamento e, a faccia in giù predefinita, un supporto trasparente. L’opzione a faccia in su lo omette. STL senza colore e a geometria unica sarebbe inutile per entrambe le lastre. Entrambi gli orientamenti supportano tutte le intensità di **Mesh levigata**. Ricrea il modello dopo aver cambiato l’intensità per applicarla all’anteprima e alla geometria esportata.

## Istruzioni di stampa

Il pannello fornisce:

- Pareti, riempimento, altezza strato e primo strato consigliati.
- **Inizia con il colore**.
- **Piano cambi colore** con numeri di strato e altezze approssimative.
- **Copia** per tutto il piano in testo semplice.

Usa il piano accanto all’anteprima dello slicer. I numeri dipendono da **Altezza strato** e **Altezza primo strato**: mantieni coerenza.

![Primo strato di 0,10 mm seguito da 0,04 mm. Un cambio prima dello strato 4 è al confine di 0,18 mm, mentre lo strato nuovo termina a 0,22 mm.](41_swap_layers.svg)

**Cambio allo strato N** significa che il filamento nuovo stampa N. Con primo 0,10 mm e normali 0,04 mm, gli strati 1, 2 e 3 finiscono a 0,10, 0,14 e 0,18 mm. Cambia dopo il 3, prima di estrudere il 4. Il nuovo strato termina a 0,22 mm.

L’altezza approssimativa richiede attenzione: Manuale mostra Z superiore del nuovo strato, Auto-paint il confine del cambio. Usa numero e transizione reale nello slicing, non solo un valore Z simile. Gli slicer possono etichettare diversamente strato selezionato e punto d’inserimento.

Flat Paint non ha piano manuale. Il pannello riassume il flusso multimateriale: assegna oggetti ai filamenti, usa trasparente e capovolgi la stampa predefinita, oppure stampa a faccia in su senza supporto. Nessuna disposizione va specchiata nello slicer.

## Impostazioni consigliate dello slicer

Kromacut consiglia:

- Pareti: `1`
- Riempimento: `100%`
- Altezza strato: valore delle **Istruzioni di stampa**
- Primo strato: valore delle **Istruzioni di stampa**

Esamina sempre l’anteprima. Le altezze sono approssimative e i cambi possono essere mostrati diversamente in base al primo strato.

Mantieni **scala Z al 100%** e altezza costante corrispondente. Cambiare Z o attivare altezze variabili sposta transizioni e invalida il piano. Imposta un’altra altezza in Kromacut e rigenera se necessaria. Anche XY cambia dettaglio rispetto all’ugello: imposta la dimensione voluta in Kromacut affinché il controllo di larghezza la consideri.

Verifica piccole isole, testo, ritagli trasparenti scollegati, fondazioni e spurgo/adescamento nello slicer. Levigare contorni non rende stampabile qualsiasi tratto. L’app non calibra flusso, retrazione, temperatura né meccanica.

## Salvare e annullare

Desktop apre **Salva con nome**; browser usa le impostazioni di download, che decidono se chiedere posizione. Annullare non invia nulla alla stampante. Geometria e compressione possono richiedere tempo: attendi il salvataggio prima di chiudere.

## Suggerimenti di esportazione

- Rigenera dopo modifiche alle impostazioni 3D.
- Non basarti solo sull’intervallo visibile; viene esportato tutto.
- Se la mesh è pesante, ritaglia o riduci risoluzione in 2D e togli regioni superflue. Aumentare **Dimensione pixel (XY)** ingrandisce gli stessi pixel; non riduce quantità o complessità.
- Se troppe tinte disattivano le istruzioni, torna a [Riduzione dei colori](reducing-colors#image-colors).

Successivo: [Impostazioni e controlli](settings-and-controls).
