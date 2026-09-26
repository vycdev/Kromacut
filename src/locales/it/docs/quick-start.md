---
title: Guida rapida
slug: quick-start
order: 20
description: Un primo percorso pratico dall’immagine all’esportazione.
---

# Guida rapida

Questa guida segue un progetto tipico dal caricamento all’esportazione.

## Caricare o importare un’immagine

Usa il pulsante di caricamento nella barra dell’anteprima o trascina un’immagine nella vista 2D.

Dopo il caricamento, usa la rotella per ingrandire e trascina per spostare la vista. Il pulsante della scacchiera rende più riconoscibili le aree trasparenti.

## Regolare l’immagine

In **2D**, usa **Regolazioni** prima di ridurre i colori. Esposizione, contrasto, luci, ombre, bianchi, neri, saturazione, vividezza, tonalità, temperatura, tinta e chiarezza possono cambiare i colori trovati dagli strumenti della tavolozza.

Fai clic su **Applica** nel pannello Regolazioni per incorporare l’aspetto corrente prima di ridurre colori, generare geometria o scaricare. Le regolazioni live sono solo un’anteprima, non una sorgente aggiornata. Vedi [Regolazioni dell’immagine](image-adjustments) per esempi prima/dopo e ripristino.

## Ridimensionare se necessario

Se l’immagine è molto più grande del dettaglio da stampare, usa **Ridimensiona immagine** per ridurla in percentuale prima dei colori. Si riducono le dimensioni reali in pixel, velocizzando potenzialmente la generazione e facilitando il dimensionamento fisico.

## Ridurre i colori

In **Impostazioni di quantizzazione**:

1. Lascia **Tavolozza** su **Automatico**, salvo che tu abbia una tavolozza specifica.
2. Parti da **Numero di colori** a **16**. Riducilo per meno regioni sorgente o aumentalo se manca dettaglio. In Auto-paint non è il numero di bobine o cambi.
3. Lascia **Algoritmo** sul predefinito **K-means**, consigliato come punto di partenza per molte immagini.
4. Fai clic su **Applica**.

Esamina **Colori dell’immagine**. Fai clic su un campione per modificarlo o eliminarlo. Eliminare riassegna i pixel ai colori rimasti; usa Gomma o alfa zero, completamente trasparente, per rimuovere pixel dalla sagoma.

## Rimuovere dithering o pulire

Se rimangono puntini isolati, usa **Rimuovi dithering** come passaggio di pulizia. È utile perché singoli pixel dispersi possono diventare singoli pezzetti di geometria 3D.

Parti dai valori predefiniti di **Peso** e **Passaggi**, poi **Applica**. Aumenta i passaggi solo se dopo uno restano troppi pixel isolati.

## Attivare la modalità 3D

Fai clic su **3D**. Imposta prima i parametri essenziali:

- **Dimensione pixel (XY)** controlla larghezza e profondità fisiche di ogni pixel.
- **Altezza strato** deve corrispondere allo slicer.
- **Altezza primo strato** deve corrispondere alla relativa impostazione dello slicer.
- **Mesh levigata** può ammorbidire confini collegati tra colori.

## Scegliere Manuale o Auto-paint

Usa **Manuale** per controllare direttamente i colori ridotti. Usa i campioni di **Colori dell’immagine**: trascinali nell’ordine di stampa e regola con ogni cursore lo spessore del colore. È una buona prima scelta se conosci l’ordine o usi una tavolozza piccola e semplice.

Usa **Auto-paint** per pianificare la pila fisica. Parte dai filamenti reali anziché dai campioni ridotti e usa colore e **Distanza di copertura (HD)** di ciascuno — la profondità alla quale nasconde ciò che sta sotto — per stimare l’aspetto sovrapposto.

Per una prima prova:

1. Aggiungi i filamenti che userai davvero.
2. Imposta ogni colore il più accuratamente possibile.
3. Imposta **HD**. La bacchetta va bene per sperimentare e puoi convertire una TD convenzionale (≈10 volte HD); valori calibrati danno in genere i risultati migliori.
4. Lascia inizialmente **Altezza massima** su **Automatico**.
5. Attiva **Corrispondenza colori avanzata** se mancano colori importanti o vuoi cercare un ordine migliore.

Dopo il calcolo, verifica transizioni e affidabilità prima di esportare. Una bassa affidabilità indica spesso un colore utile mancante, HD da calibrare o altezza massima troppo restrittiva.

## Generare ed esportare

Fai clic su **Genera modello 3D**. Quando appare, usa **Anteprima strati** per vedere la costruzione dal basso verso l’alto.

Apri il menu di download e scegli **Scarica STL** o **Scarica 3MF**. Copia le **Istruzioni di stampa** per conservare colore iniziale, strati di cambio e impostazioni consigliate.

Successivo: [Modalità 3D](3d-mode), [Auto-paint](auto-paint) o [Generazione ed esportazione](generating-exporting-output#before-you-export).
