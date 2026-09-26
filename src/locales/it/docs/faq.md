---
title: Domande frequenti
slug: faq
order: 100
description: Risposte brevi alle domande comuni su Kromacut.
---

# Domande frequenti

## Cos’è la distanza di copertura?

La distanza di copertura, **HD**, è il parametro di opacità in luce frontale, in mm, usato da Auto-paint per stimare gli strati sovrapposti. A spessore uguale a HD, il modello base conserva il 10% dell’influenza sottostante. Il punto in cui la differenza diventa invisibile dipende anche da filamento, base e condizioni di osservazione.

HD bassa indica maggiore opacità e copertura con meno strati. HD alta indica più traslucenza e necessità di spessore.

HD sostituisce la distanza di trasmissione (TD) delle versioni precedenti. Puoi inserire TD convenzionale retroilluminata/da litofania dal pulsante di conversione della riga. Kromacut moltiplica per 0,1 come stima iniziale; non è una nuova misura fisica. Vedi [Flussi di calibrazione](calibration-workflows).

## Meglio Manuale o Auto-paint?

Usa **Manuale** per controllo artistico diretto su ordine e altezze.

Usa **Auto-paint** se hai colori reali e HD e vuoi pianificazione automatica.

## Devo calibrare i filamenti?

Puoi partire da HD stimate. Anche TD pubblicate per il filamento esatto sono utili: inseriscile nella conversione, non direttamente in HD.

La calibrazione migliora in genere Auto-paint, soprattutto senza valori pubblicati o con risultati ancora errati. È particolarmente utile quando:

- Il filamento è traslucido.
- Due filamenti si somigliano.
- Vuoi risultati ripetibili tra progetti.

## Qual è la differenza tra colori di tavolozza e filamento?

I colori della tavolozza sono quelli dell’immagine usati in 2D e Manuale.

I colori dei filamenti sono materiali fisici usati da Auto-paint. Può generare colori virtuali dalla pila, ma il piano esportato si basa comunque su filamenti reali.

## Perché l’anteprima 3D richiede un pulsante di generazione?

La generazione può essere onerosa. Kromacut aspetta **Genera modello 3D** per evitare avvii e annullamenti ripetuti di lavoro pesante quando cambi impostazioni.

## Posso esportare senza modalità 3D?

Usa 2D per scaricare l’immagine sorgente corrente, comprese modifiche applicate. Incorpora regolazioni live con **Applica** prima del download. Usa 3D per generare ed esportare STL o 3MF.

## L’anteprima strati cambia l’esportazione?

No. L’intervallo **Anteprima strati** cambia solo la visibilità. STL e 3MF contengono il modello completo.

## Quale file stampare?

Scegli **Scarica STL** per ampia compatibilità e cambi manuali.

Scegli **Scarica 3MF** se lo slicer supporta colori 3MF e vuoi preservare oggetti stratificati colorati.

## Perché le altezze sono approssimative?

I numeri dipendono dallo slicer, soprattutto dal primo strato. Usa le **Istruzioni di stampa** e conferma i cambi finali nell’anteprima dello slicer.

## Posso condividere le impostazioni?

Sì. Esporta tavolozze 2D in `.kpal` e profili Auto-paint in `.kfil`. I vecchi `.kapp` restano importabili.

## Pixel più piccoli sostituiscono un ugello più piccolo?

No. Dimensione pixel determina la dimensione fisica. Può creare tratti più stretti dell’estrusione. Imposta **Larghezza linea effettiva** nelle **Impostazioni stampa 3D**, usa il controllo dei dettagli e verifica lo slicing. Vedi [Modalità 3D](3d-mode).

## La calibrazione vale con un’altra altezza strato?

Non presumerlo. HD ed evidenze di aspetto hanno ruoli diversi. Proof e Matrix vengono verificate rispetto a impostazioni e filamenti originali. Dopo un cambio, controlla evidenze attive e stampa una piccola validazione. Vedi [Flussi di calibrazione](calibration-workflows).

## Perché ci sono più colori in anteprima che bobine?

Strati sottili lasciano influire il filamento inferiore. Spessori diversi dello stesso ordine di bobine producono miscele previste diverse. Auto-paint sceglie tra quei prefissi raggiungibili, mentre le parti esportate usano filamenti reali. Vedi [Auto-paint](auto-paint).
