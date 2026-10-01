---
title: Flat Paint
slug: flat-paint
order: 64
description: Rilievo a gradini, supporti trasparenti a faccia in giù e lastre esposte a faccia in su.
---

# Flat Paint

**Flat Paint** è una disposizione Auto-paint disponibile con corrispondenza standard o avanzata. Crea una lastra a spessore costante anziché un rilievo a gradini. Ogni strato copre l’intera impronta, eventualmente con materiali affiancati.

Usa un sistema multimateriale come AMS, CFS o cambio utensile con slicer adatto. Un cambio manuale a una certa altezza non può fornire diversi materiali affiancati nello stesso strato.

![Sezioni di rilievo normale, Flat Paint a faccia in giù con supporto trasparente e a faccia in su senza supporto.](17_flat_paint_orientation.svg)

_Sezioni concettuali. I colori identificano i materiali; le etichette indicano la faccia da osservare._

## Predefinito: faccia in giù con supporto trasparente

Attiva **Flat Paint** e lascia **Faccia in su, senza strato trasparente** disattivato.

1. Il supporto trasparente stampa per primo e forma la faccia liscia contro il piano. Assegna il suo oggetto al filamento trasparente.
2. Le colonne invertono l’ordine normale per essere viste da sotto. La fondazione riempie dietro le colonne corte.
3. Esporta **3MF** e conserva l’orientamento. L’immagine è già specchiata; non specchiarla di nuovo nello slicer.
4. Dopo la stampa, capovolgi per guardare attraverso il supporto.

Il testo può sembrare invertito dal retro nello slicer. Controlla invece la faccia prevista. Ruota sotto l’anteprima Kromacut per esaminarla.

Il supporto è geometria extra che richiede vero filamento trasparente. La trasparenza sullo schermo non misura limpidezza del filamento o finitura del piano. Controlla lo spessore completo in **Modello** e nello slicer, non solo **Altezza massima**.

## Faccia in su, senza strato trasparente

Attiva per rimuovere il supporto:

- Ogni colonna mantiene l’ordine normale dal basso verso l’alto.
- La fondazione riempie sotto colonne corte, allineando colori visibili su un piano superiore.
- Nessun oggetto di supporto né necessità di filamento trasparente.
- Stampa a faccia in su come esportato, senza specchiare, e osserva il lato esposto senza capovolgere.

Le geometrie sono diverse. **Genera modello 3D** di nuovo dopo il cambio. Capovolgere una vecchia esportazione non la converte.

## Confrontare i flussi

| Flusso | Faccia osservata | Geometria | Assegnazione nello slicer |
| ------------------- | ---------------------------- | --------------------------------------------------- | ---------------------------------- |
| Auto-paint normale | Superficie a gradini | Colonne corte terminano prima. | Sequenze fisiche per altezza. |
| Flat Paint predefinito | Fondo attraverso supporto | Colonne specchiate e invertite, fondazione dietro. | Oggetti per filamento più supporto. |
| Flat Paint a faccia in su | Superficie piana esposta | Ordine normale, fondazione sotto colonne corte. | Oggetti per filamento; niente supporto. |

**Mesh levigata** funziona con entrambi gli orientamenti di Flat Paint. Scegli un’intensità e ricrea il modello. La levigatura ammorbidisce la sagoma esterna e i confini condivisi tra colori, mantenendo la lastra piatta, le altezze dei livelli e le pile di materiali. Piccole giunzioni condivise chiudono i contatti diagonali senza sovrapposizioni. Le istruzioni di stampa e il 3MF registrano l’intensità usata.

## Esportare e verificare

È disponibile solo **3MF**. STL senza colore perderebbe la disposizione utile lasciando una lastra. Gli oggetti si raggruppano per filamento reale, non per ogni miscela prevista.

1. Allinea altezza normale e primo strato a Kromacut.
2. Mantieni scala e orientamento esportati. Non aggiungere specchiature.
3. Assegna ogni oggetto, incluso trasparente per il supporto predefinito.
4. Esamina singoli strati per regioni affiancate e lastra completa.
5. Conferma il verso del testo dalla faccia prevista e verifica cambi e durata.

Le **Istruzioni di stampa** sostituiscono i cambi manuali con indicazioni multimateriale specifiche. **Anteprima strati** ha una traccia uniforme perché uno strato può contenere più materiali. I limiti agiscono solo sull’ispezione, mai sull’export completo.

## Compromessi di costo e dettaglio

Una faccia piana non implica stampa più semplice. Riempire l’impronta a ogni strato aggiunge materiale e geometria. Strati sottili, pile alte e **Dithering dell’altezza** possono creare molte piccole regioni, più spostamenti e rallentare generazione, export o slicing.

Kromacut avvisa prima dei lavori grandi. **Genera comunque** accetta il carico, non certifica l’idoneità della stampante. Prova un pezzo piccolo se materiale o finitura non sono verificati. Flat Paint preserva la disposizione ottica prevista, ma dipende da materiali calibrati e processo corrispondente.

Successivo: [Generazione ed esportazione](generating-exporting-output).
