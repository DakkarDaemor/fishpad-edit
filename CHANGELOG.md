# Changelog

Versione `MAJOR.MINOR` (vedi [README](README.md#versioni)): MAJOR sale con nuove funzionalità, MINOR con correzioni.

## 13.4

- Impostazioni → Aspetto: sul telefono la dimensione del testo non si poteva cambiare. Ora si sceglie da un elenco (da 10 a 32 px).

## 13.3

- Quattro temi nuovi in Impostazioni → Tema: **Solarized scuro**, **Monokai Dimmed**, **Abyss** e **Tomorrow Night Blue**, con i colori sia nell'editor sia nell'interfaccia.

## 13.2

- Avviso di nuova versione: in alcuni casi (per esempio dopo aver ricaricato con Ctrl+F5) il pulsante Ricarica non faceva nulla. Ora ricarica sempre l'app con la versione nuova.

## 13.1

- Chat AI: una chiave incollata tra virgolette o con "Bearer " davanti veniva rifiutata (OpenRouter rispondeva "Missing Authentication header"). Ora si usa pulita, e quando il provider rifiuta la chiave il messaggio dice di controllarla in Impostazioni → AI.

## 13.0

- Avviso di nuova versione: quando è uscito un aggiornamento compare "Nuova versione disponibile" con il pulsante Ricarica (o × per farlo più tardi). L'app non si ricarica più da sola, quindi non interrompe quello che stai facendo. Il controllo avviene all'avvio, ogni ora e quando l'app torna in primo piano: sul telefono basta riaprirla dalle app recenti, senza chiuderla del tutto.
- Due temi nuovi in Impostazioni → Tema: **Dracula** (scuro) e **Solarized chiaro**, con i loro colori sia nell'editor sia nell'interfaccia. Chiaro, scuro e di sistema restano come prima.
- **Chiedi all'AI sulla selezione** (`Ctrl+Shift+Alt+I`, anche da Visualizza e dalla palette dei comandi): apre la chat con il cursore già nel campo della domanda.
- Chat: con del testo selezionato compaiono le domande pronte **Spiega**, **Migliora** e **Trova errori**, che si inviano con un tocco.
- Chat: ogni domanda fatta su una selezione mostra il testo selezionato (le prime righe, il resto con "Mostra tutto"), e lo conserva nelle chat salvate anche se il file nel frattempo cambia.

## 12.1

- Smartphone: aprendo un file nuovo (o cambiando tab) mentre la tastiera era aperta, la tastiera restava su ma il testo digitato non arrivava nell'editor. Ora si scrive subito nel file appena aperto.
- Smartphone: l'elenco delle scorciatoie (e le scorciatoie nella palette dei comandi) non allarga più la finestra oltre lo schermo; le combinazioni lunghe vanno a capo.
- JSX e TSX: le abbreviazioni Emmet scrivono i tag vuoti chiusi (`<br />`, `<img … />`) invece di `<br>`, che in JSX è un errore.
- Suggerimenti: quando accanto alla lista non c'è spazio (schermi stretti), la spiegazione della voce evidenziata compare sotto o sopra la lista intera invece di coprire le voci seguenti, che restano visibili e scorribili.

## 12.0

- Pacchetti npm nel playground: in console (JavaScript e TypeScript) e nell'anteprima JSX/TSX si può importare qualunque pacchetto npm, anche con versione o sottopercorso (`import dayjs from 'dayjs'`, `lodash@4/fp`), o un URL completo. I moduli arrivano da esm.sh prima che il codice parta, quindi serve la rete; mentre si scaricano la console mostra quali sono, e se uno non si carica dice quale. Nell'anteprima, con un pacchetto npm anche React arriva da esm.sh, nella stessa versione dell'app, così hook e componenti dei pacchetti funzionano; senza, React resta quello dell'app e funziona offline.
- Controllo dei tipi per TypeScript e TSX: mentre scrivi, gli errori del compilatore sono sottolineati e segnati nel margine, con il messaggio passandoci sopra. Ci sono i tipi del browser e di React, e quelli dei pacchetti npm importati (da esm.sh); un pacchetto senza tipi vale `any`. Il controllo gira a parte e non rallenta l'editor; il compilatore si scarica al primo file TypeScript e poi resta disponibile offline. Gli errori di tipo non impediscono di eseguire il file. Si spegne in Impostazioni → Aspetto → Controllo dei tipi.
- TypeScript e TSX: suggerimenti del compilatore mentre scrivi (dopo `oggi.` compaiono i metodi di `oggi`, anche per i pacchetti npm), con firma e documentazione della voce evidenziata, e il tipo di un nome passandoci sopra col mouse. Si spengono insieme al controllo dei tipi.
- Vista ad albero del JSON: `Ctrl+Enter` in un file JSON apre l'anteprima con l'albero, che si aggiorna mentre scrivi. Ogni nodo mostra quante chiavi o elementi contiene; i primi due livelli sono aperti, e anche i file grandi restano leggeri, perché i nodi si costruiscono quando li apri (negli array lunghi, 500 elementi alla volta). I numeri grandi restano come nel file. Un clic su una chiave (o sull'indice di un elemento) porta alla sua riga nel file; la freccia apre e chiude il nodo. Se il JSON non è valido, l'errore va in console.
- Barra del titolo nell'app installata (desktop, Chrome ed Edge): nascondendo la barra del titolo della finestra (˄ accanto ai pulsanti della finestra), menu e tab ne prendono il posto e lo spazio libero trascina la finestra. Con un solo pannello le tab salgono nella barra; con più pannelli restano sopra ognuno.

## 11.0

- Modifica → Trasforma: ordina le righe (A → Z o Z → A, con i numeri in ordine naturale), invertile, togli le righe duplicate o gli spazi a fine riga, passa a MAIUSCOLO o minuscolo, codifica e decodifica Base64 (UTF-8) e URL. Per il JSON: ordina le chiavi a ogni livello o minifica, senza arrotondare i numeri grandi. Ogni comando agisce sulla selezione (anche su più cursori) o, se non c'è, su tutto il file, e si annulla con `Ctrl+Z`. Si trovano anche nella palette dei comandi.
- Impostazioni → Aspetto → Al salvataggio: togli gli spazi a fine riga e termina il file con un a capo. Sono spenti all'inizio. Nel Markdown gli spazi finali restano, perché due spazi vanno a capo.
- Markdown (anteprima, chat AI e Novità delle versioni): il grassetto che finisce con la punteggiatura ed è seguito subito da una lettera, frequente in titoli ed elenchi come `- **Voce:**testo`, ora appare in grassetto invece di lasciare gli asterischi.

## 10.1

- Tema chiaro: il testo selezionato sulla riga del cursore ora si vede (lo sfondo della riga corrente copriva la selezione).

## 10.0

- Ruota pannello: un pannello e quello che lo precede passano da affiancati a impilati e viceversa, mentre gli altri restano dove sono (con A | B | C, ruotando C si ottiene A | (B sopra C); ruotando di nuovo si torna indietro). Si usa con l'icona ⟳ accanto a quelle di divisione, da Visualizza → Ruota pannello (anche nella palette dei comandi) o col tasto destro su un divisore, che ruota i due pannelli ai suoi lati e può anche renderne uguali le dimensioni. Il primo pannello di una divisione ruota con quello che lo segue.
- Anteprima e console mostrano a quale tab si riferiscono: il nome del file nella loro barra porta alla tab (col suo colore, se ne ha uno), e la tab ha un segno, un occhio se è in anteprima, `>_` se l'output in console viene da lei. Se la tab della console è stata chiusa, il nome resta tratteggiato.
- Chiudendo la tab di un file in anteprima si chiude anche l'anteprima (prima restava aperta).
- Riapri tab chiusa (`Ctrl+Shift+T` nella PWA, `Alt+Shift+T` sempre, o File → Riapri tab chiusa): torna l'ultima tab chiusa, anche con il testo non salvato, nel pannello dov'era. Si ricordano le ultime 20 della sessione. Se nel frattempo il file è stato riaperto, viene solo mostrato.
- Cronologia locale (File → Cronologia locale…, o dal menu della tab): l'app tiene una copia del testo a ogni salvataggio, prima di ogni ricarica dal disco o dall'URL, alla chiusura della tab e ogni 5 minuti se è cambiato (le copie uguali alla precedente si saltano). Scelta una versione, si apre nel confronto con la tab: si prendono i blocchi che servono, o tutto con il nuovo pulsante "Usa tutto l'altro", e `Ctrl+Z` annulla. Le versioni restano nel browser, fino a 30 per file e 400 in tutto, e seguono il file anche se lo riapri in un'altra tab.
- Chat AI salvate: ogni conversazione si salva da sola a ogni risposta e si ritrova in "Chat precedenti", nella barra della chat, con la prima domanda, la data, i file su cui è stata fatta e i modelli usati. Un clic la riprende e la si può continuare; × la elimina. "Nuova chat" non cancella più la conversazione in corso. Sotto ogni risposta compaiono provider, modello e ora. Si tengono le ultime 50 chat, nel browser.
- Confronto: "Usa tutto l'altro" sostituisce il testo della tab con quello a sinistra, per esempio la versione su disco.
- Con molte tab, la barra scorre da sola fino alla tab mostrata (cambiando tab con `Ctrl+Tab`, la palette o il nome in anteprima e console).

## 9.0

- Chat AI (Visualizza → Chat AI, `Ctrl+Alt+I`): un pannello a destra dove fare domande sulla tab attiva. Ogni domanda manda il contenuto della tab in quel momento e, se c'è, la parte selezionata, che diventa l'argomento della domanda. Sopra il campo si vede quale tab sta per essere mandata. Le risposte sono formattate, e ogni blocco di codice ha Copia, Inserisci (al cursore o al posto della selezione, annullabile con `Ctrl+Z`) e Confronta, che apre il confronto con la tab per prendere solo i blocchi che servono. Con l'anteprima aperta, in alto si passa da Anteprima a Chat. Sul telefono la chat copre l'editor, come l'anteprima.
- Provider: OpenRouter, Groq e Google Gemini (con piano gratuito), OpenAI e Anthropic, con la propria chiave. I file troppo lunghi (oltre circa 50.000 token) non vengono mandati interi: basta selezionare la parte che interessa.
- Impostazioni (Visualizza → Impostazioni…, `Ctrl+,`): tema, dimensione del testo e a capo automatico; le scelte del confronto; le chiavi dei provider, con l'elenco dei modelli disponibili da cui scegliere quelli da usare nella chat. Le chiavi restano nel browser, salvate in chiaro, e il codice eseguito in anteprima e in console non può leggerle.
- Il menu Visualizza è più corto: Tema e Dimensione predefinita si trovano ora in Impostazioni → Aspetto. Ingrandisci / Riduci testo e A capo automatico restano dove sono.

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
