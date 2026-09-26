---
title: Risoluzione dei problemi
slug: troubleshooting
order: 90
description: Problemi comuni e prime soluzioni da provare.
---

# Risoluzione dei problemi

Parti da qui se un risultato è errato o un controllo disattivato.

## Un collegamento mostra pagina non trovata

L’indirizzo può contenere un errore o riferirsi a pagina rimossa. Usa **Apri Kromacut**, **Vai alla pagina iniziale** o **Esplora documentazione** per raggiungere strumento, home o guida corrente. Un indirizzo sconosciuto non viene sostituito automaticamente con un’altra guida.

## Genera modello 3D non aggiorna la vista

Le impostazioni vengono applicate solo facendo clic su **Genera modello 3D**. Modificale e genera di nuovo.

## Istruzioni cambi disattivate

In Manuale, oltre 64 colori disattivano le istruzioni. Torna a **2D**, usa **Impostazioni di quantizzazione** e riduci a 64 o meno. Flat Paint non ha cambi manuali perché uno strato può contenere diversi filamenti.

## Il modello è troppo alto

Prova nell’ordine:

1. In Auto-paint riduci **Altezza massima**, osservando compressione delle transizioni.
2. In Manuale verifica i colori. Molti colori creano molti spessori sovrapposti e quindi altezza.
3. Riduci in **2D** se non serve ogni colore come strato distinto.
4. In Manuale riduci uno o più spessori.
5. Conferma che **Altezza strato** e **Altezza primo strato** coincidano con lo slicer.

## Il modello è troppo grande in X o Y

Riduci **Dimensione pixel (XY)**. Ritaglia prima bordi o sfondo inutilizzati.

## L’immagine ha puntini o isole minuscole

Usa **Rimuovi dithering** dopo la riduzione. Se restano troppi pixel isolati, prova meno colori o un altro algoritmo.

## Auto-paint sembra inaccurato

Cause comuni:

- HD stimate invece che calibrate.
- Filamenti che non coprono bene i colori.
- **Altezza massima** comprime troppo.
- Serve **Corrispondenza colori avanzata**.
- Il soggetto importante è al centro o ai bordi, ma **Priorità regione** è **Uniforme**.

Calibra e controlla **Affidabilità del risultato** per indizi.

Verifica separatamente **Modello di aspetto**. Un punteggio alto non garantisce accuratezza fisica. **Solo stime** o zero ricette Matrix attive significa assenza di misure applicabili. Salvare un profilo calibrato non rende evidenze valide con qualsiasi altezza o set modificato. Vedi [Flussi di calibrazione](calibration-workflows).

## Un interruttore ne ha spento un altro

Due coppie sono esclusive: **Mesh levigata** e **Flat Paint**, e **Mantieni separazione colori** e **Dithering dell’altezza**. La prima sceglie geometrie diverse, la seconda assegnazioni diverse alle altezze. Vedi [Flat Paint](flat-paint) e [Auto-paint](auto-paint).

## La separazione colori non trova risultati

Il **Limite corrispondenza unica** è un limite rigido di errore previsto. Con **Richiedi una corrispondenza unica per ogni colore**, un solo colore mancante fa fallire. Considera meno colori, altro filamento utile, più altezza o ripetizioni, oppure limite più permissivo. Disattiva la rigidità solo se accetti fusione e perdita di distinzioni. Una vecchia anteprima può restare dopo il rifiuto: non è successo delle impostazioni rifiutate.

## Le regolazioni scompaiono in 3D o nel download

Fai **Applica** in Regolazioni per incorporare l’aspetto prima di quantizzare, generare o scaricare. Anteprima e sorgente sono separate. Vedi [Regolazioni dell’immagine](image-adjustments).

## Eliminare un campione non ha rimosso i pixel

**Elimina** rimuove un’opzione e rimappa sui colori rimasti. Non è una gomma. Usa Gomma o alfa zero per ritagliare. La quantizzazione può rendere opachi pixel semitrasparenti: ricontrolla la sagoma.

## Raccogliere una traccia diagnostica Auto-paint

Per indagare nella versione desktop, attiva **Registra diagnostica Auto-paint** in **Impostazioni**, avvia un nuovo calcolo e usa **Apri cartella** per il `.jsonl`. Attiva prima dell’avvio. Generare una mesh da risultato già calcolato non registra quel calcolo. Vedi [Diagnostica Auto-paint desktop](settings-and-controls#desktop-auto-paint-diagnostics) prima di condividere.

## La generazione 3D è lenta

Immagini grandi, tanti colori, strati e levigatura aumentano i tempi. Prova:

- Ritagliare l’immagine.
- Ridurre colori.
- Disattivare **Mesh levigata**.
- Ridurre risoluzione con **Ridimensiona immagine**. Abbassare solo Dimensione pixel rimpicciolisce la stessa mesh, non la semplifica.
- Semplificare Auto-paint.

## Il file esportato ha colori inattesi

Con 3MF verifica materiali o filamenti nello slicer. Kromacut conserva le informazioni quando possibile, ma gli slicer possono mappare estrusori diversamente.

STL non contiene assegnazioni cromatiche. Usa le **Istruzioni di stampa** per i cambi.

La vista Simulati mostra miscele stimate; gli slicer mostrano normalmente colori fisici. Passa a **Fisici** per confrontare e verifica bobine reali. Nessuna vista prova il colore finale.

## Ritaglio o modifiche eccessive

Usa **Annulla**. Ripeti è disponibile se annulli troppo.

Successivo: [Domande frequenti](faq).
