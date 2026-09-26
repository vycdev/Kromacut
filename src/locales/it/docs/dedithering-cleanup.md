---
title: Rimozione dithering e pulizia
slug: dedithering-cleanup
order: 50
description: Pulizia dei vicini per colore esatto e relativi effetti su puntini, bordi, trasparenza e isole stampabili.
---

# Rimozione dithering e pulizia

**Rimuovi dithering** sostituisce pixel poco sostenuti localmente con colori vicini. È un passaggio separato di pulizia, non quantizzazione né simulazione di ciò che l’ugello può stampare.

Usalo su retinature con colori ripetuti o immagini ridotte con puntini isolati. Funziona prima della quantizzazione se tali motivi esistono già, oppure dopo sulle regioni ridotte. Non è un filtro fotografico antirumore: pixel fotografici vicini hanno spesso colori esatti leggermente diversi.

## Come viene scelto un pixel

![Otto pixel vicini votano per colore esatto. Il peso determina quanti devono coincidere per conservare il centro; ogni passaggio usa il risultato precedente.](36_dedither_neighbors.svg)

Ogni pixel controlla gli otto vicini immediati, diagonali comprese. Se abbastanza coincidono in **RGB e alfa esatti**, rimane. Altrimenti adotta il colore diverso più frequente. I pareggi sono casuali, quindi impostazioni uguali possono produrre risultati diversi.

Si usano solo colori vicini esistenti, compresi pixel trasparenti. Non vengono mediati in una nuova sfumatura.

## Peso

**Peso** indica quanti vicini uguali servono per mantenere il pixel. Intervallo **1–9**, predefinito **4**.

| Esempio | Risultato |
| ------------------------------------ | ------------------------------------------------------------ |
| Nessun vicino uguale | Cambia se esiste un altro colore, anche con peso 1. |
| Tre vicini uguali | Rimane a peso 3; può essere sostituito a peso 4. |
| Centro e otto vicini uguali | Rimane anche a peso 9 perché non ci sono vicini diversi. |

Valori bassi tendono a preservare dettagli; alti rendono sostituibili più pixel. Con otto vicini, peso 9 non raggiunge mai la soglia. È un’impostazione aggressiva dei bordi, non un raggio maggiore. I pixel sul bordo hanno meno vicini.

## Passaggi

**Passaggi** ripete la pulizia **1–10** volte, predefinito **1**. Ogni passaggio legge tutto il risultato precedente. Altri passaggi possono togliere puntini ostinati, ma anche spostare bordi, spezzare connessioni o cancellare testo piccolo.

Le frecce individuali ripristinano peso 4 o passaggi 1. Il ripristino del pannello ripristina entrambi. Nessuno recupera l’immagine precedente: usa Annulla.

## Applicare e controllare

1. **Applica** prima le regolazioni attive. La pulizia legge la vista regolata; incorporarle evita che restino attive sul risultato pulito.
2. Parti da un passaggio. Il peso predefinito è 4; prova meno per conservare dettagli fini.
3. **Applica** e controlla contorni, lettere e bordi trasparenti ad alto ingrandimento.
4. Annulla prima di confrontare un’altra impostazione sulla stessa immagine iniziale.

Clic ripetuti continuano a pulire l’immagine già pulita, non confrontano indipendentemente l’originale.

## Effetto sulla stampa

Eliminare pixel isolati di altro colore può togliere piccole isole, ma anche dettagli voluti. L’alfa partecipa al voto, quindi la pulizia può allargare o restringere la sagoma e aprire o chiudere fori.

Lavora in **pixel dell’immagine**, non millimetri. Tre pixel a 0,1 mm/pixel occupano 0,3 mm prima di mesh e slicing. Non c’è un campo per il diametro dell’ugello. Usa i [controlli 3D dei dettagli stampabili](3d-mode) e l’anteprima dello slicer per verificare le forme fisiche.

## Rimozione dithering e dithering dell’altezza

| Strumento | Dove | Cosa cambia |
| ---------------- | ---------------- | -------------------------------------------------------------------------------- |
| Rimuovi dithering | 2D | Regioni di colore esatto e potenzialmente contorno trasparente della sorgente. |
| Dithering dell’altezza | Auto-paint in 3D | Schema di altezze superficiali generato per approssimare i colori. |

Uno non attiva l’altro. Non applicare la pulizia se vuoi preservare pixel art o puntinismo intenzionale.

Successivo: [Modalità 3D](3d-mode).
