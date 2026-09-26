---
title: Flussi di calibrazione
slug: calibration-workflows
order: 65
description: Scegli uno strumento di calibrazione, impara i controlli e scopri quali misure valgono per la prossima stampa.
---

# Flussi di calibrazione

La calibrazione aiuta Auto-paint a prevedere l’aspetto dei filamenti sovrapposti. Non è una calibrazione della stampante: questi strumenti non regolano estrusione, temperature, livellamento del piano o impostazioni dell’ugello. Parti da una configurazione affidabile dello slicer, poi misura gli stessi materiali e nelle stesse condizioni di osservazione che intendi usare per le tue opere.

Apri **3D → Auto-paint → Calibra**. La finestra contiene **Distanza di copertura**, **Palette Proof** e **Stack Matrix**. Misurano aspetti diversi e possono essere usati insieme.

![Tre percorsi di calibrazione: un cuneo misura l’opacità del filamento, una Palette Proof confronta alcuni colori dell’opera e una Stack Matrix fotografata misura molte ricette. Tutti contribuiscono ai colori previsti e alla pila stampabile.](20_calibration_choices.svg)

| Strumento | Quando usarlo | Cosa fornisci | Cosa può cambiare in seguito |
| --- | --- | --- | --- |
| Distanza di copertura | L’opacità di un filamento è sconosciuta o solo stimata | La prima tacca del cuneo uguale alla sua striscia di riferimento | HD, stime dei canali, spessore delle transizioni, altezza totale e piano dei cambi |
| Palette Proof | Alcuni colori di un’opera sono particolarmente importanti | I candidati stampati più vicini e la qualità della corrispondenza | Previsioni cromatiche locali e preferenze tra pile; potenzialmente ordine, altezze e geometria |
| Stack Matrix | Vuoi colori misurati per molte ricette brevi | Una fotografia con illuminazione frontale correttamente allineata | Previsioni delle ricette misurate, interpolazione locale e adattamento fisico convalidato |

Nessuno di questi strumenti aumenta la risoluzione XY della stampante o rende ottenibile ogni colore obiettivo. Anche un profilo ben calibrato può avere una gamma cromatica limitata. Per il modello sottostante, consulta [Teoria della calibrazione](calibration-theory).

## Prepara e proteggi il profilo filamenti

Una riga di filamento descrive una bobina reale, non un colore desiderato dell’immagine.

| Controllo | Cosa fa | Conseguenza importante |
| --- | --- | --- |
| Campione colore / Hex | Imposta il colore opaco nominale del filamento | Modificarlo disattiva una calibrazione a cuneo misurata per il vecchio colore. Cambia anche la compatibilità con i dati di aspetto salvati. |
| Nome | Assegna alla bobina un’etichetta leggibile | Cambiare l’etichetta non ne modifica le proprietà ottiche. Salva la modifica prima di registrare prove o matrici. |
| Campo HD | Inserisce la distanza di copertura con luce frontale in mm, da 0,01 a 2 | Un HD maggiore richiede generalmente più spessore per nascondere il substrato. Confermare un valore manuale cancella la calibrazione a cuneo. |
| Converti da TD | Converte un TD convenzionale per retroilluminazione/litofanie in HD usando circa TD × 0,1 | Inserisci qui un TD convenzionale, non nel campo HD. Il valore convertito è una stima e sostituisce la calibrazione a cuneo. |
| Bacchetta | Stima l’HD dal colore del campione | Utile come punto di partenza, non è una misura. Sostituisce qualsiasi calibrazione a cuneo esistente. |
| Indicatore di calibrazione | Mostra Stima oppure l’etichetta di qualità di una calibrazione misurata | Passaci sopra per esaminare i valori HD dei canali. L’etichetta non garantisce che un’opera finita corrisponda alla sua origine. |
| Aggiungi filamento / cestino | Aggiunge o rimuove una bobina dall’insieme di lavoro | Possono cambiare i colori fisici disponibili e la compatibilità dei dati. |

Usa la barra **Profili** per conservare un insieme con nome e senza modifiche prima di registrare dati sull’aspetto:

- **Menu a discesa dei profili:** carica un insieme salvato nei filamenti di lavoro. Caricare un altro insieme sostituisce l’elenco di lavoro attuale, quindi salva prima le modifiche che vuoi conservare.
- **Salva profilo selezionato:** sovrascrive il suo elenco di filamenti con i valori di lavoro. Le registrazioni esistenti di prove e matrici vengono conservate, ma quelle incompatibili non si applicano più all’insieme modificato.
- **Salva come nuovo profilo:** crea un insieme separato di filamenti con nome. Copia le righe dei filamenti e le loro misure a cuneo, non la cronologia di prove e matrici del vecchio profilo.
- **Rinomina:** cambia l’etichetta del profilo senza modificarne le misure.
- **Importa:** carica file di filamenti. **Esporta** crea una copia di sicurezza di un profilo con nome e senza modifiche, comprese le valutazioni delle prove e le misure delle matrici, in formato `.kfil`. L’esportazione desktop apre Salva con nome; quella web segue il comportamento di download del browser.
- **Elimina profilo selezionato:** rimuove il profilo salvato e i suoi dati. Esporta prima una copia di sicurezza se potresti averne ancora bisogno.

L’indicatore **modifiche non salvate** significa che l’insieme di lavoro differisce dal profilo selezionato. Salvalo o sovrascrivilo prima di creare una matrice o registrare i risultati di una prova. Esportare con modifiche non salvate crea un profilo di “modifiche non salvate” senza la precedente cronologia dell’aspetto: non è una copia completa di quella cronologia. I modelli sono insiemi iniziali di sola lettura con HD stimato, quindi salva una tua copia prima di calibrare. Consulta [formati dei file dei profili e gestione delle importazioni](settings-and-controls#filament-profile-files).

## Distanza di copertura: leggi un cuneo

### 1. Seleziona filamenti e basi

Seleziona uno o più filamenti, oppure usa **Seleziona tutto / Deseleziona tutto**, poi scegli **Avanti: base**.

- **Rapida** usa una base per filamento. Misura una soglia scalare di opacità e mantiene differenze conservative tra i canali stimate dal campione colore.
- **Accurata** permette di selezionare fino a tre basi per filamento, consigliandone inizialmente due utili quando disponibili. Ogni base produce una lettura separata del cuneo. Questo affina una stima vincolata dei canali; non misura indipendentemente tre canali spettrali.
- I **campioni delle basi** scelgono cosa stampare sotto quel filamento. Usa una base contrastante affinché le tacche sottili possano apparire diverse dalla striscia. Una base e un filamento quasi identici non possono fornire una soglia di opacità utile.

Passare da Rapida ad Accurata o viceversa ripristina la selezione delle basi consigliata dalla modalità. La modalità Accurata è utile quando puoi confrontare lo stesso materiale su più substrati, non semplicemente perché il suo nome promette un risultato universalmente migliore.

### 2. Imposta il cuneo e stampalo

![Un cuneo di calibrazione presenta tacche di spessore crescente accanto a una striscia di riferimento opaca; la prima tacca identica fornisce la misura.](07_calibration_wedge.svg)

| Controllo | Effetto sulla stampa di calibrazione |
| --- | --- |
| Altezza strato (mm) | Imposta lo spessore di ogni strato aggiuntivo delle tacche del cuneo. Il campo accetta 0,04–0,40 mm. Un’altezza minore offre passi di misura più fini, ma non rende affidabile una configurazione non supportata dalla stampante. |
| Strati massimi (lunghezza del cuneo) | Sceglie da 4 a 40 passi. Più passi estendono l’intervallo misurabile per filamenti traslucidi e producono un cuneo più lungo e più alto. |
| STL (qualsiasi stampante) | Scarica una tessera senza colori. Stampane una copia per ogni coppia filamento/base selezionata e usa il cambio manuale indicato. |
| 3MF (multimateriale) | Include tutte le letture selezionate con le relative assegnazioni reali di filamento/base in un unico file. Verifica l’associazione dei materiali nello slicer. |
| Scarica | Esporta il piano attuale del cuneo. Il passaggio dei risultati usa l’altezza di strato e le basi di quel piano, non una modifica successiva non correlata. |

Usa esattamente l’**altezza degli strati regolari**, l’**altezza del primo strato** e il **cambio dopo lo strato / Z** visualizzati. L’altezza del primo strato proviene dalle impostazioni di stampa; il controllo Altezza strato del cuneo è separato da quello del modello 3D normale. Non ridimensionare il modello in Z. **Avanti: inserisci risultati** apre il passaggio di lettura; scaricare non invia nulla alla stampante.

Su desktop, entrambi i formati del cuneo aprono **Salva con nome**; nel browser usano il normale comportamento di download. Attendi il completamento dell’esportazione prima di modificare le impostazioni o inserire risultati. Annullare Salva con nome o un’esportazione non riuscita lascia invariato il precedente piano del cuneo scaricato correttamente; se il salvataggio non riesce, compare un errore per consentirti di riprovare.

### 3. Confronta e salva

Osserva il cuneo stampato con la faccia rivolta verso l’alto sotto l’illuminazione frontale prevista. La linguetta indica l’estremità con un solo strato. Confronta ogni tacca con la striscia di riferimento accanto, non con una fotografia sul telefono o un campione sullo schermo.

- **Corrispondenza:** inserisci il numero della prima tacca che appare identica alla striscia. È il numero di strati di filamento aggiunti nella tacca, non il numero assoluto dello strato della stampante.
- **Fusione (facoltativa):** inserisci l’ultima tacca che appariva ancora diversa da quella precedente. Questo verifica la curva adattata; non è una seconda misura di opacità obbligatoria. Un valore di fusione successivo a Corrispondenza genera un avviso.
- **Campioni previsti / HD / affidabilità / diagnostica:** mostrano il risultato dedotto dalle tue letture. Sono informazioni di riscontro, non misure aggiuntive da fornire.
- **Salva calibrazione:** applica le misure complete e utilizzabili dei filamenti. Un filamento vuoto è **Non inserito** e resta invariato. Un filamento Accurata compilato parzialmente è **Non verrà salvato** finché ogni base scelta non ha un valore di Corrispondenza. Puoi salvare gli altri filamenti completi senza terminare tutta la scheda.

Se anche l’ultima tacca differisce dalla striscia, non dichiararla corrispondente solo per finire: crea un cuneo più lungo. Se la prima tacca corrisponde già, un’altezza di strato minore e stampabile o una base più contrastante possono rendere la misura più informativa. Le letture agli estremi dell’intervallo disponibile hanno un’affidabilità minore.

Ricalibrare un filamento sostituisce il suo precedente risultato a cuneo. Per combinare più basi, leggile insieme in un’unica sessione Accurata. In seguito salva/sovrascrivi il profilo con nome ed esporta una copia di sicurezza. L’HD misurato cambia sia il colore previsto sia la quantità di materiale che Auto-paint considera necessaria; rigenera e controlla le nuove altezze e istruzioni di cambio.

**Indietro** consente di rivedere i passaggi della procedura guidata. Chiudere la finestra azzera le selezioni e le letture del cuneo non salvate, quindi salva i risultati utilizzabili prima di uscire. Se diverse letture multibase complete avviano un adattamento della sessione, attendine il completamento prima di salvare; il calcolo in corso non è un’altra misura da inserire.

### Esempio stampato: otto filamenti

![Otto cunei HD stampati con tacche a gradini accanto a strisce di riferimento opache, nell’ordine bianco, nero, rosa, giallo, arancione, viola, ciano e verde da sinistra a destra.](hd-wedges-eight-colors-2026-09-13.jpg)

Questa stampa di calibrazione reale è stata completata il 13 settembre 2026. I cunei bianco e colorati usano un supporto nero; quello nero usa un supporto bianco. Il profilo associato **8 Colors 0.2mm** registra **strati del cuneo da 0,04 mm** e un **primo strato da 0,10 mm**. Il nome di un profilo non sostituisce le sue impostazioni di stampa registrate.

Usa la foto per riconoscere la disposizione di tacche e striscia e la progressione verso l’opacità, non per copiare i numeri di Corrispondenza o campionare colori calibrati. Esposizione della fotocamera, bilanciamento del bianco, illuminazione e schermo possono cambiare la corrispondenza apparente. Leggi la tua stampa fisica accanto alla sua striscia sotto un’illuminazione frontale uniforme.

## Palette Proof: confronta i colori dell’opera

Una prova stampa diversi candidati dalla pila Auto-paint attuale. Un **prefisso** comprende la base e tutti gli strati soprastanti fino a un’altezza di arresto scelta. Le prove confrontano altezze di arresto stampabili, non miscele arbitrarie e indipendenti delle bobine.

### Scegli obiettivi e candidati

Lascia prima che Auto-paint termini il calcolo di un risultato con almeno due prefissi stampabili idonei. Non occorre generare prima la mesh 3D dell’opera. Salva il suo profilo filamenti con nome, poi apri **Palette Proof**.

| Controllo | Significato |
| --- | --- |
| Obiettivi | Numero di colori dell’opera da confrontare, fino a 10 o al numero disponibile. Il valore predefinito è 8 quando ci sono abbastanza colori. |
| Candidati | Alternative richieste per obiettivo, normalmente 2–5, limitate dai prefissi utili disponibili. Più candidati rendono il campione di prova più largo. |
| Scegli dall’immagine | Apre una vista separata per la selezione degli obiettivi. Fai clic sulle regioni importanti dell’immagine o sui relativi interruttori colore. |
| Immagine originale | Usa come obiettivi i colori dell’immagine elaborata prima dell’adattamento dell’aspetto, non quelli della fotografia caricata intatta. |
| Adattati / ottenibili | Usa gli esatti colori previsti impiegati dal risultato Auto-paint attuale. Serve a verificare se la stampa corrisponde all’anteprima; la parola ottenibili non certifica l’accuratezza fisica. |
| Totale obiettivi della prova | Imposta lo stesso numero di obiettivi durante la scelta dall’immagine. |
| Cancella selezioni | Rimuove le priorità manuali e restituisce gli spazi disponibili alla selezione intelligente. |
| Usa obiettivi intelligenti / Usa scelti + intelligenti | Torna alla prova con le tue priorità, riempiendo automaticamente gli spazi rimanenti. |

I colori selezionati restano luminosi ovunque compaiano nell’immagine; le regioni non selezionate vengono attenuate. Scegliere un obiettivo non ricolora l’origine né la forza nella gamma cromatica della stampante. Ridurre il numero di obiettivi può eliminare le priorità oltre quel numero.

### Stampa e identifica il campione di prova

![Ogni obiettivo ha tacche candidate che si fermano ad altezze diverse sopra una base continua comune.](09_palette_proof.svg)

Le viste **Mappa della prova** e **Risultati** usano un obiettivo per riga, con i candidati A–E da sinistra a destra. I numeri identificano la riga dell’obiettivo. **F** indica il riferimento della base comune, non un sesto colore candidato o un altro filamento. Confrontalo con il margine esposto della base.

**Scarica 3MF** esporta il campione e, per un profilo con nome e senza modifiche, ne salva l’identità e la mappa delle ricette. Dopo il salvataggio, la selezione e il numero degli obiettivi vengono bloccati affinché i risultati non possano riferirsi silenziosamente a una stampa diversa. Mantienilo con la faccia rivolta verso l’alto in scala 100%, usa le altezze incorporate degli strati regolari e del primo strato, verifica le assegnazioni dei filamenti e orientalo usando l’angolo mancante in alto a sinistra. Il campione predefinito da 8 obiettivi × 5 candidati misura 44 × 68 mm. Ha tacche adiacenti da 8 mm sopra una base continua, quindi i confini possono essere meno evidenti rispetto alla griglia sullo schermo.

### Registra ciò che vedi realmente

Apri **Risultati**, confronta i candidati stampati con l’obiettivo visualizzato in condizioni di osservazione uniformi e seleziona la tacca più vicina. Se più tacche sono equivalenti, selezionale insieme. Poi descrivi la corrispondenza:

| Risposta | Cosa comunica a Kromacut |
| --- | --- |
| Migliore disponibile | È l’opzione meno sbagliata. Favoriscila rispetto alle alternative senza affermare che sia uguale all’obiettivo. |
| Vicina | Il colore scelto è quasi giusto. Aggiunge una correzione locale flessibile oltre alla preferenza. |
| Perfetta | La ricetta scelta corrisponde accuratamente a questo obiettivo. Conserva l’ancoraggio locale più forte, con gli strati inferiori necessari per riprodurne il colore visibile. |
| Nessuno | Ogni candidato è chiaramente inadeguato. Scarta localmente queste scelte senza inventare un colore corretto o selezionare un vincitore. |

![Dopo il confronto di una prova, un vincitore selezionato porta ad alternative vicine nel turno successivo. Nessuno porta all’esplorazione senza un ancoraggio al migliore precedente. Nuovi obiettivi prova un altro insieme di colori dell’opera.](21_proof_rounds.svg)

Le risposte vengono conservate mentre le inserisci. **Completa i risultati** diventa disponibile quando hai risposto a ogni riga, comprese le risposte Nessuno. **Modifica risultati** riapre una prova completata per correggerla. Il menu delle prove salvate raggruppa gli insiemi di obiettivi corrispondenti e i loro turni successivi.

- **Continua con gli obiettivi:** stampa un altro turno per gli stessi obiettivi usando la pila attuale compatibile. Mantiene i migliori precedenti selezionati, prova alternative vicine non ancora testate e può includere una pila esplorativa. Una risposta Nessuno non ha un ancoraggio al migliore precedente, quindi il turno successivo esplora alternative.
- **Nuovi obiettivi:** apre la selezione dall’immagine per un altro insieme di obiettivi. La selezione intelligente favorisce i colori esterni alla prova completata, poi quelli meno testati.
- **Meno candidati / obiettivi esauriti:** la ricerca non riempie la tavola con ripetizioni non pertinenti solo per raggiungere le dimensioni richieste. Leggi l’avviso; meno scelte utili non significa che la calibrazione sia andata persa.
- **Elimina prova:** dopo la conferma, rimuove quel campione salvato e tutte le sue valutazioni dai dati sull’aspetto.

I risultati salvati restano leggibili senza l’immagine originale. Per scaricare di nuovo una prova salvata serve l’esatta istantanea Auto-paint d’origine; continuare con gli obiettivi richiede un’opera/processo attuale compatibile. Conserva il 3MF originale se potresti volerlo ristampare in seguito.

Le valutazioni delle prove possono modificare i colori previsti vicini, l’ordine di preferenza delle pile e infine le altezze stampate. Non cambiano il materiale effettivamente assegnato agli strati esportati né sovrascrivono la calibrazione HD della bobina. Un solo risultato non dimostra che l’intera tavolozza sia accurata. L’adattamento più ampio è soggetto a requisiti sui dati e a verifiche con dati tenuti da parte; le valutazioni locali possono essere utili anche quando quell’adattamento non è attivo.

## Stack Matrix: fotografa ricette note

### Pianifica la tavola

Salva prima un profilo con nome e senza modifiche. Imposta l’**Altezza strato** e l’**Altezza primo strato** previste nelle impostazioni di stampa 3D prima di selezionare **Nuova matrice**. Il campo dell’altezza di strato del cuneo Distanza di copertura non controlla le matrici.

| Controllo | Effetto sulla tavola |
| --- | --- |
| Campioni dei filamenti | Seleziona 2–8 filamenti nell’ordine del profilo. Solo questi materiali forniscono gli strati delle ricette. |
| Spessore colore massimo (mm) | Limita la regione colore sopra la base di un solo strato. Viene arrotondato per difetto a strati di stampa regolari interi, da 1 a 64 strati. A 0,04 mm, un limite di 0,40 mm consente ricette fino a 10 strati. |
| Celle massime | Limita il numero di ricette: 64, 144, 256, 400, 625, 1.024, 1.296, 1.600 o 2.025. Una tavola più grande campiona più ricette ma usa più area del piano e tempo di stampa. |
| Budget dei cambi di materiale previsti | Limita la stima dei cambi di materiale del pianificatore, compresi i riferimenti agli angoli. Scegli 40–640 cambi o Nessun limite di pianificazione. Non è una stima della durata né una garanzia sul numero finale di cambi dello slicer. |
| Filamento di supporto | Sceglie un filamento selezionato per la base di un solo strato e il riempimento sotto le ricette più corte. Per impostazione predefinita è il filamento selezionato più chiaro. Un primo strato sottile non è necessariamente opaco. |
| Altezza strato / Altezza primo strato | Conferma in sola lettura delle impostazioni 3D attuali per una nuova tavola. |
| Riepilogo ricette / dimensioni / altezza / cambi | Mostra ingombro, altezza della base + regione colore, altezza totale e numero di strati di stampa prima del download. La tavola salvata riporta le sue altezze fissate, le celle selezionate, i cambi previsti, i riferimenti e le tavole precedenti considerate. |
| Crea e scarica 3MF | Pianifica le ricette, esporta la tavola, poi registra il piano salvato nel profilo. |

Le nuove tavole usano la **copertura adattiva**: una ricerca limitata e ripetibile campiona ricette nell’intervallo di spessore consentito. Favorisce le lacune nei colori già misurati, le profondità e le transizioni tra filamenti non testate e le ricette esplorative dove le previsioni hanno scarso supporto o in precedenza differivano dalle misure. Una novità prevista non promette che il colore stampato sarà nuovo. Alcune celle di riferimento si ripetono intenzionalmente per consentire il confronto tra fotografie successive.

Solo le tavole completate con dati di profilo/materiale, supporto, altezze di stampa compatibili e allineamento fotografico accettato guidano la tavola successiva. Scaricare un piano non stampato non rende misurati i suoi colori. Conserva le tavole completate: scegliendo **Nuova matrice**, le misure idonee vengono considerate automaticamente. Cambiare il supporto o le impostazioni di stampa può avviare un contesto di copertura separato.

Le nuove tavole hanno una **base di un solo strato**, regolata dall’**Altezza primo strato**, senza una lastra aggiuntiva basata sull’opacità. Per esempio, **primo strato da 0,10 mm + regione colore da 0,40 mm = altezza totale di 0,50 mm**. Con **strati regolari da 0,04 mm**, sono **11 strati di stampa**: uno di base e dieci nella regione colore. Il riepilogo dell’altezza mostra questa suddivisione prima del download e usa la base effettivamente memorizzata quando visualizzi una tavola precedente.

Tutte le tacche terminano comunque su un’unica superficie superiore piana. Una ricetta più corta poggia su strati aggiuntivi dello stesso filamento di supporto, sotto gli strati colore, **all’interno del limite di spessore colore**. Questo riempimento non aumenta l’altezza totale mostrata. La registrazione salvata conserva sia la ricetta utile sia il suo riempimento di supporto.

Un primo strato sottile non è automaticamente opaco. Scegli un filamento di supporto opaco e fotografa la tavola su una superficie di appoggio uniforme e piana; luce o colore visibili da sotto possono influenzare i colori misurati. Il supporto aggiuntivo può essere trattato come otticamente neutro solo quando nasconde davvero ciò che si trova sotto.

Le misure su una base ancora traslucida conservano lo spessore fisico del loro supporto. Possono supportare una pila fisica corrispondente, ma non vengono usate come misure intercambiabili su spessori di supporto diversi né per adattare il modello globale con supporto opaco. Il riempimento può rendere opache alcune tacche anche quando il solo primo strato non lo è.

Le nuove tavole raggruppano ricette simili per rendere più continue le regioni dello stesso colore e ridurre la frammentazione dei percorsi dell’utensile. Il raggruppamento non riduce di per sé il numero di filamenti usati in ciascuno strato di stampa, quindi non promette meno cambi di materiale o un risparmio di tempo specifico. Le tavole già salvate mantengono le posizioni originali delle celle affinché le loro fotografie continuino a corrispondere.

Il limite di spessore non obbliga ogni ricetta a usare tutto quello spessore colore. I limiti di celle e cambi di materiale possono produrre meno celle del richiesto, e un budget di cambi ristretto può lasciare inutilizzati alcuni filamenti selezionati; il piano salvato avvisa quando accade. Se anche le tacche di riferimento superano il budget di cambi, aumentalo oppure riduci il limite di spessore o la selezione dei filamenti. Tavole più spesse e spurghi CFS/AMS possono restare lenti anche con poche celle: esamina la stima finale dello slicer prima di stampare.

Il riepilogo salvato conta le ricette selezionate che non sono state misurate in tavole precedenti compatibili. Se il conteggio è zero, il piano ripete soltanto misure esistenti; puoi evitare di stamparlo e provare limiti o materiali diversi. Questo non dimostra che ogni colore ottenibile sia stato misurato, perché la ricerca è limitata.

Le celle hanno dimensioni fisse di 5 mm e non hanno spazi tra loro, con un bordo aggiuntivo per i marcatori; per esempio, una griglia dati di 32 × 32 occupa una tavola di 170 × 170 mm. Le tavole salvate precedenti mantengono la profondità fissa delle ricette e le etichette **tutte le combinazioni** o **Gamma selezionata tramite HD**; scaricarle di nuovo non le converte al formato adattivo.

Su desktop, annullare Salva con nome non crea un nuovo piano salvato. Nel browser, il piano viene registrato quando inizia il download. Controlla eventuali messaggi di errore di archiviazione e conserva il 3MF. Una tavola salvata fissa le proprie altezze di strato, il supporto e la mappa delle ricette: modificare successivamente le impostazioni non la riprogetta e **Scarica 3MF** su quella registrazione esporta di nuovo la tavola originale.

Stampa con la faccia rivolta verso l’alto in scala 100%, con le esatte altezze di strato e assegnazioni dei filamenti. Un primo strato inferiore all’altezza degli strati regolari viene normalizzato all’altezza regolare. La base resta un solo strato a quell’altezza effettiva del primo strato; non viene ispessita per raggiungere un obiettivo di opacità. Le tavole salvate precedenti mantengono la base originale, compresi eventuali strati di base aggiuntivi. Questo è un oggetto fisico di calibrazione, quindi modificarne la scala Z o l’associazione dei materiali invalida ciò che le celle dovrebbero misurare.

### Carica e allinea una foto

Seleziona la tavola stampata nel menu delle matrici salvate, poi **Scegli foto** oppure trascina un’immagine sull’area della foto. Fotografa sotto una luce frontale diffusa, senza forti riflessi. Il file deve essere decodificabile dall’app; un file RAW della fotocamera non sostituisce l’esportazione di un’immagine normalmente visualizzabile.

![Le quattro maniglie vanno posizionate al centro delle celle marcatore colorate fuori dalla griglia delle ricette. Il confine della tavola si estende di mezza cella oltre i centri; un riquadro ingrandito distingue il centro del marcatore dall’angolo della tavola.](22_matrix_alignment.svg)

| Controllo | Cosa cambia |
| --- | --- |
| Legenda degli angoli stampati | Mostra l’orientamento richiesto: 1 in alto a sinistra, 2 in alto a destra, 3 in basso a destra, 4 in basso a sinistra. Segui i colori dei campioni di questa registrazione, che variano in base ai filamenti scelti. |
| Ruota a sinistra / destra | Ruota la foto caricata di 90° e ripete il rilevamento. Non cambia la mappa fisica delle ricette salvata. |
| Riduci − / percentuale / Ingrandisci + | Cambia l’ingrandimento di ispezione dal 100% al 400%. Al 100%, l’intera foto rientra nell’area di lavoro; non è una vista con un pixel dello schermo per ogni pixel della fotocamera. Fai clic sulla percentuale per ripristinare e scorri per raggiungere le aree ingrandite. |
| Quattro maniglie numerate | Trascinale al centro delle celle marcatore colorate, diagonalmente all’esterno della griglia dati fitta. Il mirino della lente indica il centro campionato. |
| Mostra griglia del modello | Mostra i confini proiettati delle celle per confrontarli con la stampa. È una sovrapposizione di verifica, non una correzione cromatica. |
| Rileva di nuovo | Stima nuovamente l’allineamento dalla foto attuale. |
| Ripristina | Ripristina la stima iniziale per la foto attuale, annullando le regolazioni manuali delle maniglie. Non elimina una calibrazione salvata. |
| Ho verificato ogni linea della griglia e centro dei marcatori | Obbligatorio dopo una regolazione manuale o un rilevamento a bassa affidabilità. Conferma solo dopo aver controllato l’intera griglia e tutti e quattro i centri. |

Non posizionare le maniglie sulle ultime celle ricetta né sugli angoli fisici esterni. Il contorno blu della tavola dovrebbe estendersi di mezza cella oltre ogni centro del marcatore. Controlla l’**Anteprima con prospettiva corretta**: le celle devono apparire quadrate e corrispondere alla disposizione stampata. L’app campiona i centri interni per evitare i confini delle celle, ma una griglia spostata assegna comunque colori sbagliati alle ricette.

### Decidi come campionare, poi salva

La **Correzione dei marcatori di riferimento** è disattivata per impostazione predefinita. Disattivata conserva i colori campionati dalla fotografia, inclusa la dominante cromatica della fotocamera. Attivata applica guadagni per canale stimati confrontando i quattro marcatori fotografati con i colori previsti delle loro ricette. Può ridurre una dominante generale o un errore di luminosità, ma non misura indipendentemente l’illuminazione della stanza e non corregge ombre o riflessi. Anche previsioni errate dei marcatori possono alterare il risultato. Un’anteprima più luminosa non dimostra una misura più accurata.

L’**Anteprima della LUT estratta** mostra i colori che saranno memorizzati, un campione per ricetta. Passa sopra una cella per vedere i valori RGB campionati. Confrontali con la tavola fisica e le condizioni di osservazione previste, non con l’aspettativa che ogni cella debba essere vivace.

**Salva calibrazione** diventa disponibile quando i campioni e la verifica dell’allineamento sono pronti. In una registrazione completata, il pulsante diventa **Sostituisci calibrazione** e sostituisce le misure fotografate di quella registrazione; scarica/esporta prima una copia di sicurezza se vuoi conservare entrambe le versioni. Il profilo salvato contiene colori e dati delle ricette, oltre ai metadati della foto, non la foto originale. Conserva separatamente la foto sorgente se potresti aver bisogno di ricampionarla in seguito.

**Nuova matrice** avvia un’altra tavola; **Torna alle matrici salvate** torna alle registrazioni esistenti. **Elimina Stack Matrix** rimuove la tavola selezionata e i suoi dati. Le tavole completate compatibili possono contribuire insieme, quindi non devi eliminare una tavola precedente solo perché ne hai misurata una nuova.

## Quali dati si applicano alla prossima stampa?

![Una ricetta di tre strati misurata a 0,08 mm non è la stessa ricetta fisica di tre strati a 0,04 mm. L’HD esistente può ancora fornire una stima basata sullo spessore, ma lo stesso numero di strati non rende trasferibili i colori della matrice.](23_calibration_scope.svg)

| Dati | Compatibilità da verificare |
| --- | --- |
| HD del cuneo | Appartiene al colore del filamento misurato. L’HD è un modello di spessore, non una tabella relativa a un solo numero di strati; nuove impostazioni di stampa meritano comunque una verifica fisica. |
| Preferenze di Palette Proof e adattamento più ampio | Richiedono le stesse identità dei filamenti nello stesso ordine, colori, dati HD/di calibrazione, altezza degli strati regolari, altezza del primo strato e impostazione dell’opacità di transizione. |
| Ancoraggi delle prove con corrispondenza Perfetta | Richiedono filamenti/profilo e altezze di strato corrispondenti. Possono restare idonei quando cambia il dettaglio delle transizioni, purché il suffisso fisico richiesto sia realizzabile. |
| Stack Matrix | Richiede un allineamento completato e accettato, dati di filamenti/profilo compatibili e la stessa altezza degli strati regolari. L’uso di ricette esatte dipende inoltre dal supporto misurato o da un’equivalenza ottica supportata. |

Passare da 0,08 a 0,04 mm non reinterpreta una ricetta fotografata di tre strati come sei strati. Quella matrice è esterna al nuovo contesto di altezza degli strati regolari. Il profilo selezionato può ancora fornire stime HD del cuneo, ma il **Modello di aspetto** può correttamente indicare **Solo stima** e zero ricette LUT della matrice.

Un’altezza diversa del primo strato non disattiva automaticamente ogni matrice. Le matrici conservano la base originale e il riutilizzo dipende dal fatto che il supporto generato soddisfi le condizioni misurate o quelle equivalenti supportate. Non presumere che lo stesso filamento superiore, o lo stesso spessore totale, basti. Consulta [incertezza della previsione](calibration-theory#prediction-uncertainty) per le regole limitate di trasferimento tra supporti e continuazione dello stesso filamento.

## Interpreta l’affidabilità senza sopravvalutare l’accuratezza

L’indicatore del filamento, l’**Affidabilità del risultato** e **Modello di aspetto / Affidabilità della previsione** descrivono aspetti diversi:

- L’**affidabilità del filamento** riguarda quanto bene una misura a cuneo è vincolata. Letture agli estremi dell’intervallo, discordanza o invecchiamento la riducono. Stima significa che non esiste una misura a cuneo attiva.
- L’**Affidabilità del risultato** combina Calibrazione, Copertura e Compressione. Un valore complessivo elevato può coesistere con colori delle ricette interamente simulati.
- Il **Modello di aspetto** identifica i dati empirici disponibili e lo stato dell’adattamento. I conteggi delle pile confrontate, degli ancoraggi, degli intorni locali e delle ricette LUT della matrice indicano cosa ha effettivamente contribuito all’esecuzione.
- L’**Affidabilità della previsione** descrive il supporto per i colori associati a questa immagine, comprese previsioni misurate, interpolate, adattate o simulate. Una ricetta misurata resta un’osservazione della fotocamera o di una persona in condizioni particolari, non una garanzia di laboratorio.

Usa **Migliore disponibile**, non Perfetta, quando scegli la tacca meno inadeguata della prova. Non continuare a regolare una fotografia della matrice finché l’anteprima non diventa attraente. Il passo successivo utile è una piccola prova fisica che verifichi i colori e le impostazioni di stampa che hai effettivamente cambiato.
