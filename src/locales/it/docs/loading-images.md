---
title: Caricamento delle immagini
slug: loading-images
order: 30
description: Importa, ritaglia, ridimensiona e ritocca i pixel dell’immagine prima che diventino regioni stampate.
---

# Caricamento delle immagini

In **2D** prepari l’immagine usata dal modello 3D. Le modifiche cromatiche cambiano i colori obiettivo; i ritocchi ai pixel cambiano forme e dettagli stampati.

## Scegliere una sorgente

Fai clic su **Scegli file** nella barra dell’anteprima o trascina un file nella vista 2D. Viene caricato solo il primo file trascinato. Usa un formato decodificabile dal browser o dalla webview desktop; PNG è utile con trasparenza. Sviluppa prima i RAW fotografici ed esporta un formato normale.

Kromacut parte dal proprio logo come esempio. Un’altra immagine sostituisce quella di lavoro. Non viene pubblicata e non viene scaricata da un collegamento web incollato.

## Controllare senza modificare

| Controllo | Effetto |
| ------------------- | ----------------------------------------------------------------------------------------- |
| Rotella | Ingrandisce attorno al puntatore. Cambia solo la vista, non risoluzione o dimensioni di stampa. |
| Trascinamento sinistro | Sposta senza strumento di ritocco attivo. |
| Trascinamento centrale | Sposta anche con strumento attivo. |
| Scacchiera | Mostra un motivo dietro la trasparenza. Non appartiene all’immagine né alla stampa. |
| Indicatore dimensioni | Mostra pixel e, durante ritaglio, dimensioni proposte. |

L’anteprima mantiene i bordi netti dei pixel, senza sfumarli. Ingrandisci per trovare pixel isolati e dettagli stretti.

## Ritagliare, ridimensionare o cambiare dimensione di stampa?

![Ritagliare elimina parte dell’immagine, ridimensionare cambia il numero di pixel e Dimensione pixel cambia la scala fisica.](30_crop_resize_scale.svg)

_Dimensioni schematiche per illustrare la relazione, non consigli di dimensione._

### Ritagliare

Fai clic su **Ritaglia**, trascina selezione o maniglie di angoli e bordi, poi **Salva ritaglio**. **Annulla ritaglio** lascia tutto invariato. Salvare mantiene il rettangolo selezionato alla risoluzione dell’immagine.

Elimina margini inutili prima di ridurre colori, affinché non competano col soggetto. Il ritaglio è rettangolare; usa trasparenza per uno sfondo irregolare.

### Ridimensionare l’immagine

**Scala** va da **1% a 100%**, predefinito **50%**. **Attuale** e **Dopo il ridimensionamento** mostrano le dimensioni prima di confermare. **Applica** riduce. 100%, o valori arrotondati alle stesse dimensioni, non cambiano nulla. La freccia ripristina la percentuale, non l’immagine.

Il ridimensionamento sfuma e può introdurre colori misti sui bordi e trasparenza parziale. Eseguilo prima della quantizzazione o riduci di nuovo dopo. Due applicazioni al 50% lasciano il 25% di larghezza e altezza originali perché ogni volta si lavora sul risultato precedente. Usa Annulla per recuperare dettagli, invece di tentare un ingrandimento qui.

### Dimensioni fisiche in 3D

**Dimensione pixel (XY)** è millimetri per pixel, non risoluzione. Un’immagine opaca larga 1000 pixel a 0,1 mm/pixel misura 100 mm. A 500 pixel con stessa impostazione misura 50 mm. Passare a 0,2 mm/pixel recupera 100 mm, non i dettagli scartati. Margini esterni completamente trasparenti sono esclusi dall’impronta.

Ridurre pixel diminuisce elaborazione e geometria. Cambiare solo Dimensione pixel non ne rimuove. Vedi [Modalità 3D](3d-mode) per la scala fisica.

## Ritoccare i pixel

**Pennello**, **Gomma**, **Riempimento**, **Testo** e **Preleva colore dall’immagine** usano bordi netti senza antialiasing. Un colore personalizzato può aggiungere un colore alla tavolozza; bordi netti evitano miscele indesiderate.

![Pennello aggiunge pixel esatti, Gomma crea trasparenza, Riempimento cambia una regione collegata e Testo diventa pixel netti.](31_pixel_tools.svg)

| Strumento o campo | Funzionamento | Effetto sulla stampa |
| --------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Pennello | Trascina per pixel opachi. Diametro 1–64 pixel, predefinito 4. | Ripara contorni, unisce regioni o ispessisce dettagli. Il cursore mostra l’impronta. |
| Gomma | Stessa dimensione, ma scrive trasparenza completa. | Toglie materiale, potenzialmente creando fori o pezzi separati. |
| Riempimento | Sostituisce la regione cliccata con RGB e alfa esatti. Connessioni per bordi, non diagonali. | Ricolora una regione, non tutte le occorrenze. Nessuna tolleranza fotografica. |
| Preleva colore dall’immagine | Campiona un pixel sorgente non trasparente e passa al Pennello. | Riusa il colore sottostante, non una regolazione non incorporata. |
| Colore strumento | Scegli dai Colori dell’immagine, usa contagocce o sei cifre esadecimali. Chiudere conferma. | Imposta il colore opaco di Pennello, Riempimento o Testo. |
| Dimensione testo | Font da 6 a 128 pixel, predefinito 24. | Testo maggiore lascia dettagli maggiori alla stessa scala; non è in millimetri. |

### Posizionare testo

Seleziona Testo, fai clic e scrivi. Invio aggiunge una riga. Trascina la maniglia superiore per spostare o quella destra per cambiare il ritorno a capo. Dimensione e colore aggiornano la bozza.

Fai clic sulla spunta o **Ctrl+Invio** (**Command+Invio** su macOS) per applicare. Cliccare altrove o cambiare strumento conferma. X o **Esc** scarta una bozza aperta; un altro Esc esce. Il testo applicato diventa pixel, non un oggetto modificabile.

Ogni tratto modificato, riempimento o testo è un passo nello storico. Un tratto di un pixel a 0,1 mm/pixel è largo solo 0,1 mm, anche se ingrandito sembra enorme. Controlla lettere strette nello slicer.

## Rimuovere uno sfondo

Non c’è selezione automatica del soggetto o rimozione AI. Per sfondo uniforme, apri il campione nei Colori dell’immagine, rendilo trasparente e Applica. Rimuove tutte le corrispondenze esatte, anche nel soggetto. Usa Gomma localmente e scacchiera per verificare il contorno.

Non usare **Elimina** sul campione: rimappa anziché rendere trasparente. Vedi [Colori dell’immagine](reducing-colors#image-colors).

## Annullare, scaricare e svuotare

**Annulla** e **Ripeti** percorrono modifiche confermate: caricamento, ritaglio, ridimensionamento, regolazioni incorporate, quantizzazione, pulizia, campioni e ritocchi. Non registrano ogni impostazione o movimento. Una nuova modifica cancella il percorso di ripetizione. Lo storico è della sessione corrente: salva l’immagine per usarla più tardi.

**Scarica immagine** salva la sorgente di lavoro come PNG alla risoluzione dei pixel. Esclude zoom, scacchiera, maniglie e bozze di testo. Conferma testo e **Applica regolazioni** prima. Desktop apre una finestra di salvataggio; browser segue le sue impostazioni.

**Rimuovi immagine** svuota l’area, non le impostazioni. Non considerarla reversibile: non aggiunge l’immagine rimossa come nuovo passo Annulla. Scarica prima una copia se serve conservarla.

Successivo: [Regolazioni dell’immagine](image-adjustments).
