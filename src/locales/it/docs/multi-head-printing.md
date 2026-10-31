---
title: Stampa multitesta
slug: multi-head-printing
order: 65
description: Pianificare assegnazioni dei filamenti, ricariche delle teste ed esportazioni 3MF per la stampa multitesta.
---

# Stampa multitesta

La modalità multitesta riorganizza la pila stampabile scelta da [Auto-paint](auto-paint). Ogni regione dell’immagine può usare un filamento diverso sullo stesso strato. Più teste mantengono disponibili i filamenti tra le ricariche manuali; l’analisi cerca corrispondenze cromatiche previste migliori e pianifica le ricariche necessarie. Le pause possono diminuire, ma non è garantito.

## Prerequisiti

- Usa **Auto-paint** con almeno un filamento nell’elenco, poi attiva la **Modalità multi-testa**.
- Scegli **2–8 teste** e una **Profondità di ricerca**, poi **Crea modello 3D**. Servono almeno due filamenti disponibili per formare una finestra utile.

La modalità multitesta e **Flat Paint** si escludono a vicenda. Calibra i filamenti che possiedi davvero; vedi [Teoria della calibrazione](calibration-theory). Modalità, numero di teste e profondità di ricerca vengono ricordati tra le sessioni. Ricrea il modello dopo aver modificato i dati.

## Sequenze e finestre

Una **sequenza** è un blocco contiguo di strati che usano un solo filamento nella pila Auto-paint. Il suo spessore deriva dal risultato stampabile di Auto-paint, compresi calibrazione e vincoli di altezza, non soltanto dalla luminosità dell’immagine originale.

Una **finestra** comprende N sequenze consecutive. N è limitato dal numero di teste scelto, dai filamenti disponibili e dalle sequenze sopra la prima, che mantiene sempre il suo filamento; le teste non necessarie restano contrassegnate come **VUOTA** nel programma delle teste. L’analisi seleziona finestre utili senza sovrapposizioni; non raggruppa automaticamente tutte le sequenze. Le sequenze esterne alle finestre selezionate mantengono il filamento previsto e sono incluse nel programma delle teste.

![Sequenze di colore raggruppate in finestre di esempio; le rimanenti mantengono il filamento previsto.](01_window_run_diagram.svg)

## Scelta dei filamenti per finestra

Con K filamenti distinti in una finestra e N posizioni di sequenza, esistono **K^N** ordini possibili, comprese le ripetizioni. L’analisi confronta le miscele previste usando la differenza cromatica **ΔE** e assegna un ordine a ogni regione cromatica dell’immagine. Una posizione di sequenza non è una testa fisica fissa: il programma associa alle teste i filamenti necessari.

![Cambiare l’ordine degli stessi filamenti cambia la miscela prevista; i colori sono schematici.](03_beer_lambert_blending.svg)

![I 27 ordini per tre filamenti e tre posizioni, con una tabella che mostra la crescita di K^N.](05_combo_search_space.svg)

La **Profondità di ricerca** controlla la soglia di selezione delle finestre, quante se ne possono selezionare e quanti ordini vengono provati:

- **Veloce** usa meno iterazioni di selezione delle finestre e un budget di combinazioni ridotto.
- **Bilanciato** è il compromesso predefinito tra impegno e copertura.
- **Accurato** consente più finestre e un budget maggiore; può comunque campionare spazi di ricerca grandi.

Entro il budget di ogni profondità vengono provate tutte le combinazioni. Gli spazi più grandi usano un campione limitato e deterministico insieme all’ordine attuale. Dati identici producono risultati ripetibili. Ogni profondità considera gli stessi colori dell’immagine; una ricerca più profonda non garantisce una stampa fisica migliore.

## Programma delle teste ed esportazione

Dopo una creazione riuscita, l’anteprima mostra il colore simulato assegnato a ogni regione. **Colori fisici** mostra invece il filamento reale. Apri le **Istruzioni di stampa** e segui il **Programma delle teste**:

- Prima di stampare, carica ciascun filamento elencato nella sua testa numerata. Lascia inutilizzate le teste contrassegnate come **VUOTA**.
- A ogni punto di controllo indicato per strato, ricarica soltanto le teste contrassegnate. I carichi invariati vengono mantenuti; non ogni confine di finestra richiede una pausa.
- Esporta in **3MF** per conservare la geometria assegnata, i colori fisici dei filamenti e le assegnazioni alle teste. Il file registra il numero di teste scelto come numero di estrusori e aggiunge marcatori di pausa **M600** ai punti di cambio del programma. STL non conserva queste assegnazioni.

![Tre teste mantengono i filamenti invariati tra le fasi; solo i carichi modificati richiedono ricariche manuali.](02_nozzle_swap_schedule.svg)

Usa una stampante multitesta compatibile. Prima di stampare, verifica nel programma di slicing le assegnazioni delle teste, le altezze del primo strato e degli strati regolari e la gestione delle pause. Un punto di controllo può richiedere la ricarica di più teste.

## Ripiego e ricreazione

Se l’analisi fallisce, non trova una disposizione utilizzabile che migliori la pila normale o prevede un miglioramento troppo piccolo per giustificare i cambi di testa, viene creato un modello normale a testa singola con un avviso, il colore iniziale e le istruzioni di cambio originali. Prova filamenti diversi, un altro numero di teste o una diversa profondità, poi ricrea il modello.

L’analisi viene eseguita in background. Uscire dal pannello 3D o cambiare immagine annulla l’analisi in corso; ricrea il modello per la nuova immagine. Istruzioni ed esportazioni descrivono il modello creato: ricrealo per applicare le impostazioni modificate.

Segue: [Generazione ed esportazione](generating-exporting-output).
