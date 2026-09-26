---
title: Teoria della calibrazione
slug: calibration-theory
order: 62
description: Ottica e matematica della calibrazione di distanza di copertura, Palette Proof e Stack Matrix.
---

# Teoria della calibrazione

Kromacut offre tre strumenti di calibrazione complementari. **Distanza di copertura** misura l’opacità fisica di ogni filamento. **Palette Proof** chiede di valutare un piccolo gruppo di campioni stampati per i colori importanti in un lavoro. **Stack Matrix** fotografa molte ricette fisiche note e ne registra i colori osservati. Tutti alimentano lo stesso modello di sovrapposizione di Auto-paint, ma rispondono a domande diverse.

Per i controlli passo per passo, il salvataggio e la compatibilità delle impostazioni di stampa, consulta [Flussi di calibrazione](calibration-workflows). Per il resto dell’area di stampa, consulta [Modalità 3D](3d-mode).

## Perché gli strati sottili mescolano i colori

La stampa viene osservata con illuminazione frontale: la luce entra dalla superficie, attraversa il filamento verso il basso, si riflette sul materiale sottostante e torna all’esterno. Uno strato sottile nasconde solo in parte ciò che si trova sotto, quindi il colore percepito combina quello del filamento con quello che traspare dal basso. Auto-paint sfrutta questa trasparenza residua per ottenere colori intermedi da pochi filamenti: ecco perché HD deve essere accurata.

![Gli strati sottili sopra una base nera la nascondono solo in parte; ogni strato aggiunto moltiplica la trasparenza residua finché la pila corrisponde al colore opaco del filamento.](06_frontlit_hiding_distance.svg)

Kromacut modella la trasparenza residua con la legge di Beer-Lambert. Uno spessore `d` di filamento trasmette una frazione

```
T = 10^(−d / HD)
```

del colore sottostante. Ogni strato aggiunto moltiplica la trasparenza residua, quindi l’opacità viene raggiunta geometricamente. La velocità dipende dal materiale: un nero denso copre in una frazione di millimetro, mentre un bianco traslucido può richiedere dieci volte lo spessore. Questa velocità è descritta dalla distanza di copertura.

La Transmission Distance indicata nelle schede delle bobine o misurata con provini TD retroilluminati descrive la luce che attraversa il filamento _una sola volta_, come in una litofania. Nell’osservazione frontale la luce attraversa lo strato due volte e viene valutata in riflessione, quindi la TD convenzionale è circa 10 volte la distanza di copertura. Kromacut accetta la TD convenzionale come dato iniziale, tramite il pulsante di conversione di ogni filamento, ma salva e simula usando HD.

## Il provino a gradini

La misura del colore tramite fotocamera è poco affidabile: le fotocamere correggono automaticamente, gli schermi sono diversi e l’illuminazione cambia. Il provino evita di giudicare un colore isolato. Ogni tessera stampa campioni da 1 a N strati sopra una base, con una **barra di riferimento** dello stesso filamento completamente opaco accanto e una linguetta che indica l’estremità a uno strato.

![Il provino di calibrazione: campioni numerati con un numero crescente di strati accanto alla barra completamente opaca; indica il primo campione identico alla barra.](07_calibration_wedge.svg)

Devi indicare il **primo campione che appare identico alla barra accanto**. La barra mostra il colore opaco del filamento a pochi millimetri di distanza e sotto la stessa luce: il confronto resta valido tra ambienti, schermi e stampe. Nei campioni sottili traspare la base; a un certo punto la differenza scende sotto la soglia visibile e il numero di quel campione costituisce la misura.

## Dalla lettura alla distanza di copertura

Il campione indicato segna lo spessore al quale la trasparenza residua scende sotto una **differenza appena percepibile (JND)**: la minima differenza di colore visibile, circa 2 ΔE00 in condizioni quotidiane.

Kromacut risolve il problema al contrario. Per il colore del filamento sopra quello della base calcola `T*`, la trasparenza residua che porta il colore miscelato esattamente a una JND dal colore opaco. `T*` dipende solo dai due colori e dalla JND, senza costanti di opacità regolate manualmente. La lettura fornisce lo spessore raggiunto in quel punto, `d* = patch × layer height`, e invertendo Beer-Lambert si ottiene:

```
HD = −d* / log10(T*)
```

![Aumentando gli strati, la differenza tra campione e barra diminuisce; il campione indicato fissa il passaggio sotto una JND e l’inversione della legge di trasmissione restituisce la distanza di copertura.](08_opacity_solve.svg)

Il contrasto della base è importante: un filamento nero su una base nera non differisce mai dalla barra di una JND intera, quindi non c’è nulla da misurare. La procedura lo rileva e assegna ai filamenti scuri una base più chiara.

## Dati di Palette Proof

Un Palette Proof confronta prefissi realmente stampati con i colori dell’immagine attuale. Kromacut conserva la ricetta fisica degli strati, la previsione HD originale, il colore obiettivo richiesto e ogni risposta. Un solo foglio può così fornire due tipi di dati senza fingere che ogni scelta sia una misura esatta.

**Migliore disponibile** sostiene la ricetta selezionata e sfavorisce le alternative non scelte vicino a quell’obiettivo, senza imporre che il campione sia uguale al colore obiettivo. **Vicina** aggiunge una correzione cromatica locale parziale. **Perfetta** aggiunge la correzione più forte e mantiene il suffisso opaco esatto provato come riferimento diretto. In caso di parità, tutti i campioni scelti ricevono sostegno. **Nessuno** respinge i candidati plausibili vicino all’obiettivo senza inventare una direzione di correzione.

Questi effetti sono locali sia nello spazio delle ricette fisiche sia in quello dei colori. Nel confronto delle ricette contano soprattutto gli strati recenti e otticamente dominanti; lo stesso filamento in un’altra posizione recente rappresenta una corrispondenza più debole. Il sostegno diminuisce anche quando il colore simulato della pila o l’obiettivo richiesto si allontana dal colore valutato. Ricette simili ripetutamente scartate per obiettivi verdi rafforzano quindi un avvertimento locale per pile verdi vicine, lasciando invariata una ricetta rossa non correlata.

Le correzioni Vicina e Perfetta alimentano gli stessi colori Lab previsti usati dal punteggio dell’ottimizzatore e dall’anteprima finale. Il sostegno e i rifiuti aggiungono una preferenza limitata e consapevole dell’obiettivo: dati ripetuti possono risolvere un quasi pareggio numerico senza prevalere sull’errore cromatico effettivo o sui riferimenti esatti. L’adattamento globale di luminosità e cromaticità resta separato e deve superare la propria verifica su dati esclusi dall’adattamento. I dati locali e i riferimenti Perfetta possono restare utili anche quando il fit globale viene respinto; tutti i parametri derivati vengono ricostruiti deterministicamente dai giudizi originali salvati.

## Calibrazione Stack Matrix

Stack Matrix parte da una misura di tipo LUT, non da un altro calcolo del provino di opacità. Le nuove tavole campionano ricette utili di lunghezze diverse entro un limite fisico di spessore del colore; ogni strato della regione colorata mantiene l’altezza regolare scelta. Un limite di 0,40 mm con strati da 0,04 mm consente fino a 10 strati di colore. La base è un solo strato all’altezza effettiva del primo strato, non una lastra dimensionata in base all’opacità stimata. Con un primo strato da 0,10 mm, l’esempio è alto 0,50 mm e contiene 11 strati di stampa in totale.

Le ricette più corte poggiano su strati aggiuntivi dello stesso filamento di base all’interno della regione colorata: tutti i campioni terminano alla stessa Z senza superare il limite. Nell’applicazione delle misure, la base aggiuntiva viene registrata separatamente dalla ricetta utile. Una base sottile non è necessariamente opaca: usa un filamento opaco e una superficie fotografica sottostante uniforme e piatta. La base stampata deve davvero nascondere il substrato prima di considerare otticamente neutro altro materiale di base. Le tavole precedenti conservano lo spessore originale della base e la mappa delle celle.

Lo spazio delle ricette possibili cresce esponenzialmente, quindi la pianificazione usa un insieme limitato e deterministico di sequenze pure, transizioni ordinate tra filamenti e ricette esplorative più lunghe alle profondità consentite. Le HD salvate ne prevedono i colori. Le matrici completate compatibili forniscono copertura cromatica misurata e una registrazione delle ricette già stampate. La selezione favorisce lacune cromatiche e nuove coperture di spessore e transizione, con esplorazione mirata alle previsioni poco sostenute o precedentemente errate. Questi punteggi di acquisizione sono euristiche, non intervalli di incertezza calibrati. Alcune ripetizioni di riferimento intenzionali consentono verifiche di coerenza; i piani non stampati e le fotografie incompatibili o non accettate non colmano le lacune.

Il budget dei cambi di materiale include i riferimenti agli angoli e limita l’uso dei materiali strato per strato da parte del pianificatore. Non stima durata o volume di spurgo, e lo slicer può aggiungere cambi. Un limite di spessore maggiore può quindi costare di più anche con poche celle. Le nuove tavole raggruppano ricette simili in regioni dello stesso colore più continue per ridurre la frammentazione dei percorsi; spostare le celle non riduce l’insieme dei materiali necessari in ciascuno strato. Le vecchie tavole mantengono la selezione originale esaustiva a profondità fissa o basata sul gamut HD e possono contribuire con dati compatibili senza essere riscritte.

La matrice si stampa a faccia in su, così base, primo strato e strati della ricetta seguono lo stesso ordine fisico di un normale modello Kromacut. Quattro ricette agli angoli identificano l’orientamento e definiscono la trasformazione prospettica. Dopo la stampa, fotografa la superficie con luce frontale diffusa. Kromacut stima la tavola e permette di trascinare quattro maniglie numerate al centro dei marcatori usando un mirino ingrandito. Una griglia proiettata esatta e un’anteprima rettificata in tempo reale mostrano errori di prospettiva, inclinazione e deformazione prima del campionamento di una zona centrale interna alle coordinate proiettive di ogni cella. Questa zona evita i bordi anche quando la prospettiva rende un lato molto più stretto. Allineamenti poco affidabili o modificati manualmente richiedono una conferma esplicita; affidabilità e revisione vengono salvate con le misure. Il campionamento diretto è l’opzione prudente predefinita. La correzione facoltativa dei marcatori stima un guadagno luminoso per canale dalle quattro ricette note: può ridurre una dominante, ma anche nascondere una differenza reale dipendente dall’illuminazione.

Una matrice completata salva colori sRGB previsti e fotografati accanto alle ricette fisiche immutabili nel profilo di filamenti. Tutte le matrici compatibili salvate riadattano insieme un unico modello fisico effettivo, lasciando invariati colori dei campioni, calibrazione HD e misure originali. Il fit tratta quei valori come priori regolarizzati, poi usa tutti i campioni pesati per stimare HD effettive dei canali RGB, colore opaco effettivo del filamento, esponente di trasmissione non lineare per sequenze contigue dello stesso filamento e interazione ordinata tra filamento visibile e substrato sottostante. Con pochi dati restano i priori originali; il modello adattato viene usato solo con abbastanza campioni e se migliora il ΔE delle matrici escluse dalla stima senza peggiorare la coda degli errori. L’interazione adattata vale fino alla sequenza contigua più spessa di quella coppia di materiali osservata nelle matrici. Lo spessore aggiuntivo non misurato prosegue dal colore sostenuto usando il prior provino/HD appropriato al substrato verso il campione nominale del filamento: non passa tutta la sequenza a un’altra previsione né estrapola l’esponente all’infinito. Lo stesso calcolo dei prefissi alimenta punteggio dei candidati, confronti delle ricette e anteprima, incluse pile compresse e allineate agli strati.

Il fit confronta i colori simulati con gli sRGB fotografati usando una misura robusta dell’errore, mentre la miscelazione fisica avviene comunque in luce lineare. Le differenze nei canali scuri ricevono così abbastanza peso per influenzarlo. Le penalità dei priori sono mediate per famiglia di parametri sui materiali realmente presenti nei campioni di addestramento: aggiungere bobine inutilizzate non indebolisce né disabilita lo stesso fit. È ancora la validazione a stabilire se usarlo. Una migliore corrispondenza su ricette note non dimostra accuratezza per coppie di filamenti mai misurate.

Le matrici compatibili restano anche LUT empiriche sparse nello spazio Lab previsto e delle ricette fisiche: una nuova tavola poco popolata non cancella le ricette misurate prima. Kromacut pesa ogni tavola in base all’affidabilità dell’allineamento verificato, alla copertura delle ricette misurate, alla recenza e alla coerenza robusta con ricette misurate da almeno altre due tavole. Con una o due osservazioni di una ricetta la coerenza resta neutra, perché non basta per identificare un’anomalia. Una ricetta esatta a profondità fissa combina direttamente le sue osservazioni Lab fotografate. Una ricetta mancante combina interpolazioni deterministiche a distanza inversa dei valori Lab fotografati vicini, pesando l’ordine fisico verso gli strati superiori otticamente dominanti. L’interpolazione è ammessa solo entro la copertura Lab prevista locale di ciascuna matrice e un vicinato limitato di ricette; altrimenti viene usato il modello fisico adattato congiuntamente. Fuori dai dati di matrice compatibili, il modello torna ai priori Beer-Lambert/HD salvati. Punteggio dell’ottimizzatore e anteprima finale condividono la previsione. I riferimenti Perfetta di Palette Proof hanno ancora precedenza; le celle della matrice sono osservazioni, non colori obiettivo dell’immagine, quindi una matrice ampia non induce l’ottimizzatore a inseguire ogni colore campionato.

## Incertezza della previsione

Entro la copertura cromatica prevista locale della matrice, le correzioni interpolate sfumano gradualmente verso il modello fisico quando il sostegno si esaurisce. Le ricette fotografate esatte mantengono i colori misurati. Il solo materiale superiore uguale non basta a trasferire una misura: deve coincidere l’intera base misurata, oppure la base alternativa deve essere sufficientemente opaca e otticamente equivalente con la stessa interazione immediata col substrato.

Per una ricetta misurata identica, Kromacut può stimare anche il trasferimento a una base profonda diversa se il substrato immediato è dello stesso materiale e i colori finali simulati differiscono di non più di 1 ΔE00. La base iniziale deve soddisfare la soglia minima di opacità secondo il fit attuale oppure il prior HD salvato; la diagnostica indica quale ne sostiene lo spessore. Una stampa esistente può così mantenere il prior che ne giustificava la base anche quando un fit successivo modifica la soglia stimata. La correzione viene trasferita con affidabilità ridotta ed etichettata **interpolata**, perché l’equivalenza della base è dedotta dal modello e non misurata indipendentemente. Questa eccezione non abilita un’interpolazione generale delle ricette su basi diverse.

Aggiungere altro filamento terminale uguale può prolungare la correzione di un prefisso misurato. L’effetto viene attenuato attraverso la sequenza fisica originale e si estingue entro uno spessore aggiuntivo pari al massimo a quello di una ricetta della matrice. Anche questo risultato è interpolato. Non predice prefissi più sottili da una misura successiva; aggiungere un materiale diverso interrompe la continuazione. Misure dirette e giudizi Palette Proof applicabili conservano la precedenza. La diagnostica identifica i campioni d’origine e distingue il trasferimento tra basi dalla continuazione attraverso spessore aggiunto.

Ogni prefisso stampabile riceve un’affidabilità insieme al colore Lab previsto. Quattro fattori restano visibili, anziché trasformarsi in una certezza non spiegata:

- **Distanza dalla misura:** distanza cromatica prevista e distanza della ricetta fisica dalla ricetta misurata compatibile più vicina.
- **Coerenza locale:** i campioni vicini descrivono una correzione coerente dal colore simulato a quello fotografato?
- **Errore di validazione:** la LUT predice ciascuna ricetta senza il proprio campione empirico, usando la stessa selezione dei vicini e attenuazione del sostegno impiegate durante l’uso. È una verifica condizionata con il modello ottico adattato mantenuto fisso, non una stima indipendente dell’accuratezza complessiva. Separatamente, il fit ottico viene ricalcolato e verificato escludendo matrici intere oppure gruppi di interazioni ricetta/substrato quando è disponibile una sola matrice.
- **Metodo di previsione:** un’osservazione fisica esatta parte con più sostegno rispetto a un’interpolazione, una stima adattata o una pura simulazione Beer-Lambert.

L’ottimizzatore aggiunge al massimo cinque punti equivalenti a ΔE per una corrispondenza completamente incerta. Basta perché una quasi corrispondenza sostenuta da misure superi un grigio speculativo apparentemente perfetto, ma il limite impedisce all’affidabilità di prevalere su grandi errori cromatici visibili. I riferimenti Perfetta mantengono la precedenza esplicita e Mantieni separazione colori continua a giudicare la fattibilità con ΔE00 grezzo, non con il costo corretto per il rischio. Palette dell’ottimizzatore, strati dell’anteprima finale e associazioni salvate mantengono lo stesso oggetto di affidabilità, evitando che ricerca e visualizzazione adottino silenziosamente ipotesi diverse sui dati.

La calibrazione fotografica dipende inevitabilmente da fotocamera, esposizione, riflessi, bilanciamento del bianco e luce di osservazione. Il provino senza fotocamera resta il metodo preferito per misurare HD. Usa Stack Matrix per un’ampia raccolta empirica di colori di ricette in condizioni controllate; usa Palette Proof quando contano soprattutto pochi colori di una singola immagine.

## Distanze di copertura per canale

I filamenti non assorbono rosso, verde e blu allo stesso modo: un arancione trasmette il rosso ma blocca il blu. Una HD scalare è quindi un’approssimazione. Kromacut miscela con tre distanze di copertura, una per canale:

- **Lettura su una base (modalità Rapida):** il confronto di opacità misura HD scalare. Le differenze tra canali RGB restano una stima prudente dal campione del filamento, vincolata affinché il canale più luminoso corrisponda alla misura.
- **Letture su altre basi (modalità Accurata):** ogni base mette alla prova diversamente la curva stimata dei canali. Kromacut modifica un’intensità limitata di selettività dei canali e il valore scalare solo quanto richiesto dagli intervalli discreti dei campioni. Non sostiene che due soglie visive misurino indipendentemente tre HD spettrali.

La curva raffinata viene usata direttamente per le basi realmente confrontate nel provino. Su una base non provata Kromacut conserva la stima Rapida anziché estrapolare una forte variazione di tonalità. Puoi aggiungere altre basi quando comodo, ma tre o quattro non sono obbligatorie. HD dei canali completamente indipendenti, trasmissione non lineare e interazioni specifiche del substrato sono riservate ai dati Stack Matrix con verifiche su dati esclusi e sullo spessore supportato.

La lettura facoltativa di fusione registra l’ultimo gradino adiacente ancora distinguibile. Valida la curva adattata senza aggiungere un altro parametro libero: una grande discrepanza riduce l’affidabilità e compare nella diagnostica.

## Il fit JND della sessione

La JND predefinita di 2 ΔE00 è una costante della visione umana, ma osservatore e illuminazione possono discostarsene leggermente. Quando una sessione contiene abbastanza letture multi-base indipendentemente informative, Kromacut può adattare una JND condivisa tra 1 e 3. Il fit viene mantenuto solo se chiaramente identificabile e migliore del valore predefinito; spesso le letture discrete sono ambigue rispetto a HD scalare, e in quel caso la sessione conserva correttamente la costante.

## Affidabilità

Ogni calibrazione ha un punteggio che descrive quanto bene è stata determinata la misura:

- Una lettura a un’estremità del provino, campione 1 o ultimo campione, riduce l’affidabilità: la vera soglia di opacità potrebbe essere fuori dall’intervallo stampato. Stampa un provino più lungo o con strati più sottili e ricalibra.
- Letture su più basi che non concordano neppure col fit migliore riducono l’affidabilità; la discrepanza viene annotata nella calibrazione.
- L’affidabilità diminuisce dopo sei mesi, mentre i filamenti invecchiano e le bobine cambiano.

I filamenti non calibrati ricevono un punteggio inferiore basato sulla plausibilità della HD stimata.

## Cosa cambia dopo la calibrazione

Le distanze di copertura per canale alimentano sia i **colori** previsti da Auto-paint per ogni pila sia lo **spessore** delle zone di transizione. La calibrazione può cambiare altezze generate e piano dei cambi, non solo l’anteprima.

La calibrazione appartiene al materiale misurato: è legata al colore del campione usato, modificare il colore del filamento la disattiva e ricalibrare sostituisce la misura precedente anziché farne una media.
