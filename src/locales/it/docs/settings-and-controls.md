---
title: Impostazioni e controlli
slug: settings-and-controls
order: 80
description: Azioni dell’intestazione, temi, salvataggio, tavolozze, profili e controlli dell’area di lavoro.
---

# Impostazioni e controlli

Questa pagina raccoglie controlli globali o facili da trascurare.

## Controlli dell’intestazione

| Controllo | Funzione |
| ------------- | ------------------------------------------------------------------------------ |
| Logo Kromacut | Torna all’app con documentazione aperta; altrimenti apre la home. |
| Impostazioni | Apre il dialogo con lingua, tema, risorse e aggiornamenti. |

Il tema offre **Sistema**, **Scuro** e **Chiaro**. Sistema segue le preferenze cromatiche del sistema operativo o browser e ne segue i cambi. La scelta viene salvata.

**Lingua** cambia interfaccia, documentazione, diagrammi e pagine pubbliche. Scegli **Lingua di sistema** per seguire una lingua supportata o seleziona inglese, francese, tedesco, italiano, romeno, spagnolo, giapponese, cinese semplificato, hindi, portoghese europeo, ucraino o bengalese. La scelta è locale e non cambia immagini, profili, stampa o geometria. Traduzioni e font sono inclusi nell’app desktop; nessun servizio online riceve il lavoro.

Anche le pagine pubbliche hanno il selettore. La documentazione tradotta usa collegamenti condivisibili con prefisso, come `/ro/docs/overview`. Nomi di pagina e ancore restano stabili tra lingue. Estensioni, numeri del modello, nomi inseriti dall’utente e titoli originali delle opere comunitarie non vengono tradotti.

Le impostazioni includono documentazione, Discord, Reddit, GitHub, Patreon e versione corrente. Anche **Privacy e dati locali** e **Termini e condizioni** sono disponibili qui e si aprono nel browser nella lingua selezionata.

## Modalità dell’area di lavoro

Usa **2D** e **3D** per passare da preparazione a generazione.

Il separatore verticale è trascinabile. Allarga il pannello sinistro per dettagli o l’anteprima per l’ispezione.

La documentazione usa collegamenti condivisibili `/docs/...`, che aprono direttamente la guida corrispondente.

Su schermi piccoli espandi **Contenuti** per scegliere guida o **In questa pagina** per una sezione. Entrambi si chiudono dopo la scelta per lasciare spazio. Apri illustrazioni intere con clic o mettendo a fuoco il collegamento e premendo Invio.

Molte sezioni laterali si comprimono dal titolo. Nascondere controlli non disattiva effetti: regolazioni, stampa e ottimizzatore restano attivi. Riepiloghi e indicatori aiutano a vedere cambiamenti. Lo stato aperto/chiuso è ricordato. Espandere non ripristina.

**Annulla / Ripeti** condivide lo storico immagine tra 2D e 3D. Non registra filamenti, calibrazione, altezze o ottimizzatore. Usa ripristini dei pannelli quando disponibili e rigenera dopo aver restaurato un’immagine.

## Modalità multipiatto sperimentale

**Modalità multipiatto** è incompleta. Ricorda la preferenza e può mostrare un’animazione, ma non divide immagini, crea tasselli, distribuisce oggetti o cambia export. Lasciala spenta per uso normale. Non serve a far entrare un modello troppo grande sul piano.

## Impostazioni di stampa salvate

Kromacut ricorda nel browser **Dimensione pixel (XY)**, **Altezza strato**, **Altezza primo strato**, **Larghezza linea effettiva** e **Mesh levigata**.

Usa ripristino nelle **Impostazioni stampa 3D** per i valori predefiniti, inclusi 0,42 mm di larghezza effettiva.

Le impostazioni sono locali al browser/sito o all’app. Non sono backup dell’immagine o progetto completo e ambienti diversi non necessariamente le condividono. Esporta tavolozze e profili importanti prima di cancellare dati. Un profilo ripristina filamenti ed evidenze, non immagine o mesh pronta.

## Stato Auto-paint salvato

Tra le impostazioni conservate:

- Filamenti.
- Modalità di pittura.
- Altezza massima e altezza strato del cuneo.
- Corrispondenza colori avanzata.
- Separazione colori, limite ΔE unico e requisito di unicità per tutti.
- Limite totale di ripetizioni condiviso per apparizioni extra.
- Dettaglio transizioni e dithering dell’altezza.
- Larghezza effettiva dalle **Impostazioni stampa 3D**, per avvisi, pulizia e dithering, più **Escludi puntini di colore isolati**. La pulizia non rimuove tutti gli avvisi né controlla dithering.
- Flat Paint e preferenza a faccia in su senza trasparente.
- Algoritmo e seme dell’ottimizzatore.
- Priorità regione.

I profili sono separati dallo stato ricordato. Usali per insiemi nominati da caricare, importare o esportare.

## File di tavolozza

Le tavolozze personalizzate servono per riduzione 2D e usano `.kpal`.

La versione 2 aggiunge `disabledColors`, colori conservati ma esclusi dalla quantizzazione, e `colorNames`, nomi facoltativi. Entrambi passano da export a import. I v1 si caricano invariati con tutto abilitato e senza nome; un v2 aperto in una vecchia versione considera tutti abilitati.

Usale per adattare l’immagine a filamenti noti o a un insieme fisso.

## File di profili filamenti

I profili Auto-paint sono insiemi nominati salvabili, caricabili, importabili ed esportabili. Usano `.kfil` e conservano colori, nomi, HD, calibrazione, Palette Proof e giudizi, nonché piani limitati Stack Matrix e misure se disponibili. I vecchi `.kapp` restano importabili. I profili antichi salvavano valori non calibrati in scala TD: vengono convertiti automaticamente (×0,1) al caricamento/importazione.

Usa l’**icona di caricamento** nella barra profili. Un vecchio file con stesso ID senza aspetto viene importato come copia rinominata, senza cancellare evidenze più recenti; un errore di memoria mantiene la lista e mostra un messaggio. L’**icona di download** esporta l’insieme corrente in `.kfil` predefinito. Se ci sono modifiche non salvate, crea un nuovo profilo «modifiche non salvate» senza evidenze legate alle vecchie identità.

### Formati d’importazione supportati

| Formato | Estensione | Note |
| ----------------------- | -------------- | ------------------------------------------------------------------------------ |
| Profilo Kromacut | `.kfil` | Nativo. Supporta profilo singolo o array di profili in un file. |
| Profilo Kromacut precedente | `.kapp` | Vecchio formato, ancora interamente supportato in import. |
| JSON grezzo | `.json` | Accettato se contiene un oggetto profilo o array di oggetti. |
| CSV/TSV bobine HueForge | `.csv`, `.tsv` | Vedi sotto. |

### Gestione duplicati

Durante l’importazione ogni profilo viene confrontato con quelli esistenti:

- **Stesso ID:** normalmente sovrascrive. Se sostituirebbe evidenze con un file privo di dati utili, importa una copia separata.
- **Stesso contenuto, ID diverso:** saltato solo se filamenti ed evidenze coincidono.
- **Stesso nome, contenuto diverso:** importa con suffisso numerico, per esempio `Le mie bobine (2)`.

Alla fine appare un riepilogo di importati, sovrascritti, saltati e rinominati.

### Importazione da HueForge

Le librerie bobine `.csv` o `.tsv` si importano direttamente. Usa **Export Spools** in HueForge, poi l’icona di caricamento Auto-paint. Il separatore, virgola o tabulazione, è rilevato dall’intestazione. Ogni bobina diventa `<Brand>-<Color Name>-<Hex>`, per esempio `Inland Basic-Light Brown-#BF9C81`. Gli UUID sono mantenuti come ID per evitare duplicati reimportando. TD HueForge viene trattata come convenzionale retroilluminata/da litofania e convertita in HD frontale.

## Avvisi di aggiornamento desktop

L’app desktop può avvisare di una nuova versione e permette di aprire la pagina di download o chiudere il promemoria.

Apri **Impostazioni** per verifiche manuali. **Controlla all’avvio** decide se controllare aprendo l’app, attivo per impostazione predefinita. La verifica manuale funziona anche se spento.

Su Linux, le AppImage con informazioni di aggiornamento incorporate possono essere aggiornate con strumenti compatibili come AppImageUpdate. Questi strumenti usano il file `.AppImage.zsync` della versione per scaricare le parti modificate. Le vecchie AppImage prive di queste informazioni richiedono un primo download manuale di una versione compatibile. Il file `.zsync` non è un programma di installazione e l’avviso di aggiornamento di Kromacut non installa automaticamente gli aggiornamenti.

## Diagnostica Auto-paint desktop

L’app può registrare dati strutturati sui nuovi calcoli. Attiva **Registra diagnostica Auto-paint** nelle **Impostazioni** prima di iniziare. Non riavvia né registra un risultato già calcolato.

Ogni calcolo crea un `.jsonl` nella cartella diagnostica. Usa **Apri cartella** accanto all’opzione. Ogni riga è un evento JSON completo, quindi progressi, errori e annullamenti restano leggibili anche senza completamento.

Una traccia completa include dati di esecuzione, istantanea di filamenti e calibrazione, impostazioni, campioni limitati di progresso, stato dell’adattamento, decisioni progressive sui livelli di ripetizione, strati finali, tutti i candidati stampabili finali, Delta E tra obiettivi e candidati, affidabilità e misure che contribuiscono a colori interpolati o corretti localmente. Registra colori elaborati e pesi, non l’immagine caricata. Dati di profilo e calibrazione possono essere sensibili: controlla prima di condividere pubblicamente.

La registrazione è per indagini e può produrre file grandi. Lasciala spenta per stampa normale senza necessità diagnostiche.

## Aprire file dal desktop

Le installazioni desktop associano i file `.kfil` e i precedenti `.kapp` ai profili dei filamenti, e i file `.kpal` alle tavolozze. Fai doppio clic su un file per importarlo e selezionarlo in Kromacut. Se l’app è già aperta, viene usata la finestra esistente. Si applicano le normali regole di convalida, migrazione, gestione dei duplicati e conservazione della calibrazione.

I file aperti dal desktop restano in attesa mentre è aperto l’editor delle tavolozze, la finestra di calibrazione o il modulo per rinominare o salvare un nuovo profilo. Completa o annulla la sessione per proseguire con le importazioni in attesa; i nomi digitati e il profilo in modifica restano invariati fino ad allora.

Le importazioni attendono anche mentre modifichi il nome o il campo HD di un filamento, oppure mentre il suo selettore di colore o il pannello **Converti da TD** è aperto. Esci dal campo o chiudi il selettore o il pannello per riprendere le importazioni in attesa; le modifiche ai filamenti non salvate richiedono comunque la tua scelta prima che un altro profilo le sostituisca.

Prima di sostituire modifiche ai filamenti non salvate, Kromacut offre **Mantieni le modifiche** o **Apri profilo**. Mantieni le modifiche per salvarle prima; aprire il profilo le scarta. I file aperti in questo modo devono essere inferiori a 32 MiB. File JSON generici, immagini e modelli mantengono i consueti flussi di importazione.

Su Linux, le AppImage portabili richiedono l’integrazione desktop per le associazioni dei file. Se Kromacut non è l’app predefinita, usa **Apri con** nel gestore dei file.

Successivo: [Risoluzione dei problemi](troubleshooting).
