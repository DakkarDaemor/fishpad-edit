# Changelog

Versione `MAJOR.MINOR` (vedi [README](README.md#versioni)): MAJOR sale con nuove funzionalità, MINOR con correzioni.

## 8.1

- Confronto: la barra mostra quante righe sono state aggiunte e tolte (+N −M) oltre al numero di differenze.
- Confronto: le scelte (affiancato o unificato, solo modifiche, ignora formattazione) restano per i confronti successivi, anche dopo aver chiuso l'app.
- Confronto unificato: quando cambia solo una parte della riga, la riga compare una volta sola, con il testo tolto barrato accanto a quello nuovo.

## 8.0

- Confronto tra due testi: Modifica → Confronta mette la tab attiva a confronto con la versione su disco (o con la risposta attuale, per le tab URL), con un'altra tab, con gli appunti o con un file. Dal menu col tasto destro di una tab la si confronta con quella attiva. Le differenze sono evidenziate anche dentro la riga, con la colorazione del codice, e le righe uguali restano piegate (togli "Solo modifiche" per vederle tutte).
- Vista affiancata o unificata (sul telefono parte unificata). A destra c'è la tab, modificabile: le frecce, o "Usa l'altro" nella vista unificata, vi portano un blocco dell'altro testo. Alla chiusura le modifiche passano alla tab, e `Ctrl+Z` le annulla. `F7` / `Shift+F7` vanno alla differenza successiva o precedente.
- "Ignora formattazione" passa i due testi da Prettier prima di confrontarli: re-indentazioni, a capo e virgolette non contano più, e restano solo le differenze vere. In questa modalità il confronto è in sola lettura.

## 7.0

- Telefono e tablet: sotto i 700 px di larghezza l'interfaccia passa alla disposizione per telefono. Il menu sta dietro ☰ e i sottomenu si aprono uno alla volta, con "‹" per tornare indietro. Preferiti ed esplora file sono in un cassetto che si apre dal pulsante in alto a destra. Si vede un pannello alla volta (⇄ passa al successivo se la sessione ne ha più di uno), e l'anteprima copre l'editor: "‹ Editor" torna al codice senza chiuderla, "Anteprima" in alto la riporta in primo piano. In alto a destra c'è anche ▶ per eseguire il file.
- File dell'app: dove il browser non dà accesso alle cartelle del disco (telefoni, tablet, Safari, Firefox), l'esplora file mostra una cartella privata dell'app. Lì `Ctrl+S` (o File → Salva) salva davvero, anche in sottocartelle ("note/oggi.md"), e la sessione ricorda a quale file è collegata ogni tab. Con File → Importa, o ⇩ nell'esplora file, si copiano dentro i file del dispositivo; con File → Esporta / condividi, o dal menu di un file, se ne porta fuori una copia: sui dispositivi touch col foglio Condividi del sistema (salva in File o Drive, invia a un'altra app), altrove con un download.
- Condividi → Fishpad (Android, con l'app installata): un file di testo condiviso da un'altra app si apre in una tab, un link si apre come tab URL, e un testo in una nuova tab.
- Al tocco: la pressione prolungata su tab, file, cartelle e preferiti apre il menu che su desktop compare col tasto destro. Mentre si scrive nell'editor compare sopra la tastiera una barra con i tasti che mancano (Tab, che espande anche le abbreviazioni Emmet, Esc, annulla e ripeti, frecce, parentesi e simboli), oltre a Cerca ed Esegui. Mostrare una tab non apre più la tastiera da solo, e bottoni, tab e voci dei menu sono più grandi.
- L'app resta nella parte visibile sopra la tastiera virtuale, anche su iPhone e iPad, e lascia spazio a notch e barre di sistema nell'app installata. Su iPhone e iPad toccare un campo non ingrandisce più la pagina.
- I sottomenu (Apri recente, Folding, Tema, Colore tab) si aprono anche con un clic, non solo passandoci sopra.
- Limiti del dispositivo: alla prima apertura una finestra spiega cosa cambia sul browser in uso (file che restano nell'app, schermata Home su iPhone e iPad, installazione su Android, comandi senza tastiera fisica). Mostra solo gli avvisi non ancora visti, e si riapre da Aiuto → Limiti su questo dispositivo. Su desktop con Chrome o Edge non compare.

## 6.0

- Esplora file: File → Apri cartella mostra la cartella in una barra laterale a sinistra (`Ctrl+B`, o Visualizza → Barra laterale). Un clic apre il file, le cartelle si leggono solo quando le apri, e l'albero si aggiorna tornando all'app. Col tasto destro si creano file e cartelle, si rinomina, si elimina (con conferma: non va nel Cestino) e si copia il percorso relativo. Rinominando un file o una cartella, le tab aperte seguono il nuovo percorso e `Ctrl+S` continua a salvare nel posto giusto.
- La cartella aperta sostituisce la "Cartella dell'anteprima": l'anteprima HTML carica da lì CSS, script e immagini. Chi aveva scelto una cartella dell'anteprima la ritrova aperta nell'esplora file. Dopo un riavvio del browser basta un clic su "Riconnetti" per ridare il permesso.
- Tab collegate a un URL: File → Apri URL (o Preferiti → Apri URL) fa una richiesta GET, con header facoltativi (per esempio `Authorization`), e mostra la risposta in una tab. Il JSON viene formattato senza alterare i numeri grandi. La barra di stato mostra codice HTTP e tempo di risposta; `F5`, o un clic lì, ripete la richiesta. Salvando la tab su disco diventa un file normale.
- Gli errori di rete hanno un messaggio chiaro: server non raggiungibile, richiesta bloccata da CORS, indirizzo `http` chiamato da una pagina `https`.
- Preferiti: URL e file da riaprire con un clic, nella barra laterale e nel menu Preferiti (quindi anche nella palette dei comandi). Si aggiungono con ☆, dal menu della tab o dall'esplora file; col tasto destro si modificano, si riordinano e si rimuovono. Gli header degli URL vengono salvati in chiaro nel browser.

## 5.0

- File modificati da un altro programma: `Ctrl+S` chiede conferma prima di sovrascrivere un file cambiato su disco dopo l'ultima lettura. Tornando all'app, i file aperti che sono cambiati si ricaricano da soli se non hanno modifiche, altrimenti l'app chiede cosa fare.
- File → Ricarica dal disco: rilegge il file, tocca solo le righe cambiate e si annulla con `Ctrl+Z`.
- Codifica Windows-1252: i file che non sono UTF-8 valido (tipici dei vecchi programmi Windows) si aprono con le lettere accentate corrette e si salvano nella stessa codifica. Dalla barra di stato si sceglie con quale codifica salvare o si riapre il file con un'altra. Se il testo contiene caratteri che Windows-1252 non può rappresentare, l'app propone di salvare in UTF-8.
- Palette dei comandi: `Ctrl+Shift+P` (o `F1`) cerca tra tutte le voci dei menu, `Ctrl+P` passa a una tab aperta. La ricerca è approssimata, come in VS Code.
- Aiuto → Scorciatoie da tastiera e Aiuto → Novità delle versioni si aprono in una finestra dentro l'app, anche offline.
- Formatta documento (`Shift+Alt+F`) con Prettier, per JavaScript, TypeScript, JSX/TSX, JSON, CSS, HTML, Vue, Markdown e YAML. Prettier si scarica solo al primo uso.
- Suggerimenti mentre scrivi (tag HTML, proprietà CSS, parole chiave e snippet JS/TS), richiamabili con `Ctrl+Spazio`.
- Emmet in HTML, JSX/TSX e nei fogli di stile: `Tab` espande l'abbreviazione, `Ctrl+E` la forza.
- Colori CSS: un quadratino accanto a ogni colore apre il selettore del sistema e riscrive il valore nello stesso formato.
- I file JSON mostrano gli errori di sintassi mentre scrivi.
- Anteprima Markdown: `Ctrl+Enter` su un file Markdown lo mostra formattato a destra, aggiornato mentre scrivi.
- File locali nell'anteprima HTML: con Esegui → Cartella dell'anteprima la pagina carica CSS, script, immagini e font dalla cartella del sito. I file aperti nell'editor vengono usati con le modifiche non salvate.
- Trascinando una tab in un altro pannello con `Ctrl` premuto, il file si apre anche lì invece di spostarsi. Dal menu col tasto destro su una tab si apre il file in un nuovo pannello a destra o in basso.
- Modifica → Sostituisci (e `Ctrl+H`) mette il cursore nel campo "Sostituisci" invece che in "Cerca". Cerca e Vai alla riga dal menu non perdono più il focus a favore dell'editor.

## 4.0

- Tab colorate: tasto destro su una tab (o Visualizza → Colore tab) per scegliere un colore pastello. La tab aperta sfuma nello sfondo dell'editor e, nel pannello attivo, ha un bordo alto nel suo colore. Il colore è del file, quindi se è aperto in più pannelli tutte le sue tab cambiano insieme, e viene ripristinato alla riapertura.
- L'intestazione dell'anteprima mostra il nome aggiornato del file dopo "Salva con nome".

## 3.1

- `Ctrl+S` con il focus nell'anteprima salvava la pagina web dal browser invece del file: ora le scorciatoie dell'editor (`Ctrl+S`, `Ctrl+O`, `Ctrl+N`, `Ctrl+W`, `Ctrl+Enter`) funzionano anche lì.
- Tema chiaro: tag e attributi di HTML, XML e JSX/TSX (componenti compresi) ora sono colorati.

## 3.0

- Console JavaScript e TypeScript: `Ctrl+Enter` (o menu Esegui) esegue il file attivo, o solo il testo selezionato, e mostra l'output in un pannello in basso. Si ridimensiona trascinando il bordo e si apre e chiude da Visualizza → Console.
- TypeScript viene eseguito togliendo i tipi, senza controllarli (sucrase, caricato solo al primo uso). `interface`, generici, `as` ed `enum` funzionano, e le righe degli errori restano quelle del file.
- `await` funziona al livello principale. Oggetti, array, Map e Set vengono formattati in modo leggibile. Gli errori mostrano la riga, e un clic sulla riga la seleziona nell'editor.
- Il codice gira isolato dall'editor (worker in un iframe sandbox): non vede la sessione né i file, e un loop infinito non blocca l'app. Stop ferma l'esecuzione, compresi timer e promise pendenti.
- Pannello Anteprima a destra per HTML, JSX e TSX: `Ctrl+Enter` lo apre e si aggiorna da solo mentre scrivi. I `console.log` e gli errori della pagina arrivano nella console, con la riga del file.
- React nell'anteprima, già incluso e disponibile anche offline. Si importano `react`, `react-dom` e `react-dom/client`. Il componente esportato come default (o una funzione `App`) viene montato in automatico, a meno che il codice non chiami `createRoot` da solo.

## 2.0

- Pannelli divisi a destra e in basso, con tab proprie per ogni pannello. Lo stesso file in più pannelli resta sincronizzato. Le tab si trascinano tra i pannelli e i divisori si ridimensionano. Il layout viene ripristinato alla riapertura.
- Barra dei menu tradizionale (File, Modifica, Visualizza, Aiuto) al posto della toolbar.
- Nuove voci: Salva tutto, Taglia / Copia / Incolla, Commenta, Vai alla riga, Chiudi pannello.
- Scorciatoie `Ctrl+\` (dividi a destra) e `Alt+Z` (a capo automatico).
- Numero di versione visibile nella barra del titolo e nel menu Aiuto, con link a novità e scorciatoie.

## 1.0

- Prima versione: tab multiple con sessione salvata, apertura e salvataggio di file locali, file recenti, "Apri con…" e drag & drop.
- Syntax highlight per circa 140 linguaggi, riconosciuti dal nome del file o dal contenuto.
- Folding, indentazione per file, cerca e sostituisci.
- Tema chiaro e scuro, PWA offline.
