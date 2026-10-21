# Fishpad Edit

Editor di testo nel browser, con syntax highlight e folding del codice. Legge e scrive i file locali direttamente, funziona offline e si installa come app (PWA), anche su telefono e tablet.

Su desktop dà il meglio con Chromium (Chrome, Edge), che permette di salvare direttamente sui file del disco. Dove il browser non lo permette (telefoni e tablet, Safari, Firefox) i file si salvano nella cartella privata dell'app ("File dell'app"), con import ed esportazione verso il dispositivo: vedi [Telefono e tablet](#telefono-e-tablet).

## Funzionalità (MVP)

- **Menu tradizionale** (File, Modifica, Visualizza, Esegui, Aiuto) con le scorciatoie indicate accanto alle voci.
- **Palette dei comandi**: `Ctrl+Shift+P` (o `F1`) cerca tra tutte le voci dei menu, `Ctrl+P` passa a una delle tab aperte. La ricerca è approssimata: bastano alcune lettere nell'ordine giusto.
- **Aiuto** dentro l'app: scorciatoie da tastiera e novità delle versioni, disponibili anche offline.
- **Pannelli divisi**: affianca o impila più pannelli (Visualizza → Dividi a destra / in basso, oppure i pulsanti a destra della barra delle tab). Ogni pannello ha le sue tab. Lo stesso file aperto in due pannelli resta sincronizzato, ma cursore, scroll, blocchi chiusi e cronologia di annulla sono separati: `Ctrl+Z` annulla solo le modifiche fatte in quel pannello. Le tab si trascinano da un pannello all'altro (con `Ctrl` premuto il file si apre anche nel pannello di arrivo, senza toglierlo da quello di partenza), e dal menu col tasto destro su una tab si apre il file in un nuovo pannello a destra o in basso; i divisori si trascinano per ridimensionare (doppio clic per uniformare). L'icona ⟳ (o Visualizza → Ruota pannello, o il tasto destro su un divisore) passa un pannello e il precedente da affiancati a impilati e viceversa, lasciando gli altri dove sono.
- **Tab multiple**: la sessione viene salvata in automatico in IndexedDB. Alla riapertura ritrovi pannelli, contenuto, cursore e blocchi chiusi, anche per le tab non salvate su disco.
- **Tab colorate**: tasto destro su una tab (o Visualizza → Colore tab) per darle un colore. Il colore appartiene al file: se è aperto in più pannelli, tutte le sue tab lo condividono.
- **File locali**: grazie alla File System Access API, `Ctrl+S` scrive sullo stesso file su disco. C'è anche "Salva con nome". Se nel frattempo il file è stato modificato da un altro programma, prima di sovrascriverlo chiede conferma.
- **Modifiche esterne**: tornando all'app, i file cambiati su disco si ricaricano da soli se non hanno modifiche; se ne hanno, l'app chiede cosa fare. File → Ricarica dal disco rilegge il file a mano, e anche questo si annulla con `Ctrl+Z`.
- **File recenti**: tiene gli handle dei file, quindi riaprendo un recente il browser chiede solo il permesso.
- **Esplora file** (`Ctrl+B` per la barra laterale): File → Apri cartella mostra l'albero della cartella. Le sottocartelle si leggono solo quando le apri, l'albero si aggiorna tornando all'app, e il file della tab attiva è evidenziato. Col tasto destro: nuovo file, nuova cartella, rinomina, elimina (definitivo, con conferma), copia percorso relativo, aggiungi ai preferiti. Le tab dei file rinominati seguono il nuovo percorso. Dopo un riavvio il browser chiede di nuovo il permesso (pulsante "Riconnetti").
- **Tab URL**: File → Apri URL esegue una richiesta GET, con header facoltativi, e apre la risposta in una tab. Il linguaggio viene dal `Content-Type`; il JSON è formattato con Prettier, che non arrotonda i numeri grandi. La barra di stato mostra codice HTTP e tempo; `F5` (o un clic lì) ripete la richiesta. Il server deve consentire le richieste dall'app (CORS); da una pagina `https` non si possono chiamare indirizzi `http`, tranne localhost. Salvata su disco, la tab diventa un file normale.
- **Preferiti**: URL e file da riaprire con un clic, nella barra laterale e nel menu Preferiti. Si aggiungono con ☆ (tab attiva), dal menu della tab, dall'esplora file o spuntando "Aggiungi ai preferiti" in Apri URL. Gli header vengono salvati in chiaro nel browser.
- **"Apri con…" dal sistema operativo**: nella PWA installata, tramite `file_handlers` e `launchQueue`. Se l'app è già aperta, il file si apre come nuova tab.
- **Telefono e tablet**: disposizione per schermi stretti, file salvati nella cartella dell'app, barra dei tasti sopra la tastiera, Condividi → Fishpad su Android. Dettagli e limiti nella [sezione dedicata](#telefono-e-tablet).
- **Drag & drop di file** sulla finestra. Su Chromium il file resta collegato a quello su disco.
- **Syntax highlight per circa 140 linguaggi** (`@codemirror/language-data`, caricati solo quando servono). Il linguaggio si riconosce dal nome del file; per il testo incollato in una tab senza nome lo riconosce dal contenuto, con euristiche a punteggio per JavaScript, TypeScript, JSX, TSX, CSS, HTML e JSON. Mentre scrivi può passare a un linguaggio più specifico (per esempio da JS a TSX quando aggiungi i tipi), finché non lo scegli tu a mano.
- **Folding**:
  - dall'albero sintattico per i linguaggi con parser Lezer, comprese le sezioni Markdown sotto i titoli
  - dall'indentazione per testo semplice e linguaggi legacy
  - chiusura per livello, come in VS Code
  - i blocchi chiusi vengono ricordati per ogni tab
- **Indentazione per file**: spazi o tab e relativa larghezza vengono rilevati dal contenuto. Si possono cambiare dalla barra di stato, e c'è la conversione dell'intero file tra spazi e tab (annullabile con `Ctrl+Z`).
- **Console JavaScript / TypeScript**: `Ctrl+Enter` esegue il file attivo, o solo la selezione, e mostra l'output in un pannello in basso, con `await` al livello principale, oggetti formattati e la riga degli errori cliccabile. Il codice gira in un Web Worker dentro un iframe `sandbox` con origine opaca: non accede a sessione e file dell'editor, e un loop infinito non blocca l'interfaccia (Stop termina tutto). TypeScript viene eseguito togliendo i tipi con sucrase, senza controllarli. Il modulo si carica solo al primo uso e conserva i numeri di riga.
- **Anteprima HTML / React / Markdown**: per i file HTML, JSX, TSX e Markdown `Ctrl+Enter` apre un pannello a destra che si aggiorna mentre scrivi. Log ed errori della pagina vanno nella console. Nei file JSX/TSX si possono importare `react`, `react-dom` e `react-dom/client`: sono le build di produzione della versione usata dall'app, quindi funzionano offline. L'export default, o una funzione `App`, viene montato in automatico se il codice non chiama `createRoot`. Il Markdown viene mostrato come su GitHub (tabelle, liste di controllo…).
- **File locali nell'anteprima HTML**: per le pagine dentro la cartella aperta nell'esplora file, CSS, script, immagini e font referenziati con percorsi relativi vengono caricati da lì (anche gli `url()` dentro i CSS). Se uno di quei file è aperto nell'editor si usa il testo attuale, anche non salvato, e l'anteprima si aggiorna mentre lo modifichi. I pacchetti npm non vengono caricati.
- **Suggerimenti** mentre scrivi (`Ctrl+Spazio` per richiamarli): tag e attributi HTML, proprietà CSS, parole chiave e snippet JS/TS.
- **Emmet** in HTML, JSX/TSX, CSS, SCSS, LESS e simili: si scrive un'abbreviazione (`ul>li*3`, `m10`) e `Tab` la espande, `Ctrl+E` la forza.
- **Colori CSS**: un quadratino accanto a ogni colore nei fogli di stile e in HTML; cliccandolo si apre il selettore del sistema, e il valore viene riscritto nello stesso formato (hex, `rgb()`, `hsl()`), mantenendo la trasparenza.
- **Controllo JSON**: gli errori di sintassi sono sottolineati e segnati nel margine.
- **Formatta documento** (`Shift+Alt+F`, o Modifica → Formatta documento) con Prettier, per JavaScript, TypeScript, JSX/TSX, JSON, CSS/SCSS/LESS, HTML, Vue, Markdown e YAML. Rispetta l'indentazione del file, si annulla con `Ctrl+Z`, e Prettier si scarica solo al primo uso (poi resta disponibile offline).
- **Trasforma** (Modifica → Trasforma): ordina, inverti o togli i duplicati delle righe, togli gli spazi a fine riga, MAIUSCOLO / minuscolo, codifica e decodifica Base64 e URL, e per il JSON ordina le chiavi o minifica (senza arrotondare i numeri grandi). Agisce sulla selezione o, se non c'è, su tutto il file; si annulla con `Ctrl+Z`.
- **Al salvataggio** (Impostazioni → Aspetto, spenti all'inizio): togli gli spazi a fine riga (non nel Markdown, dove due spazi vanno a capo) e termina il file con un a capo.
- **Confronta** (Modifica → Confronta): la tab contro la versione su disco, un'altra tab, gli appunti o un file, affiancati o in vista unificata, con le differenze evidenziate dentro la riga e le righe uguali piegate. A destra si modifica e le frecce portano i blocchi dall'altro lato; "Ignora formattazione" passa i testi da Prettier per nascondere le differenze di sola formattazione.
- **Cronologia locale** (File → Cronologia locale, o il menu della tab): una copia del testo a ogni salvataggio, prima di ogni ricarica dal disco o dall'URL, alla chiusura della tab e ogni 5 minuti se è cambiato. Si sceglie la versione e si apre nel confronto, dove si prendono i blocchi che servono o "Usa tutto l'altro". Fino a 30 versioni per file e 400 in tutto, nel browser.
- **Riapri tab chiusa** (`Alt+Shift+T`, o File → Riapri tab chiusa): le ultime 20, con il testo non salvato.
- **Chat AI** (`Ctrl+Alt+I`): domande sulla tab attiva (o sulla parte selezionata) in un pannello a destra, con la propria chiave di OpenRouter, Groq, Google Gemini, OpenAI o Anthropic. I blocchi di codice delle risposte si copiano, si inseriscono nel file o si confrontano con la tab. Le chat si salvano da sole e si riprendono da "Chat precedenti" (ultime 50, con provider e modello di ogni risposta). Le chiavi si impostano in **Impostazioni** (`Ctrl+,`), insieme a tema, font e opzioni del confronto; restano nel browser, in chiaro.
- **Cerca e sostituisci** con regex, multi-cursore, selezione rettangolare (Alt+trascina)
- **Tema** chiaro, scuro o di sistema e dimensione del font, in Impostazioni (`Ctrl+,`); a capo automatico (`Alt+Z`) e ingrandisci / riduci testo anche da Visualizza
- **Barra di stato**: riga e colonna, selezione, linguaggio, fine riga LF/CRLF (conservato in salvataggio), codifica UTF-8 o Windows-1252. La codifica viene rilevata in apertura: se il file non è UTF-8 valido viene letto come Windows-1252, e il BOM UTF-8 viene rimosso. Il file si salva nella stessa codifica, e dalla barra di stato si può cambiare quella di salvataggio o riaprire il file con un'altra.

## Telefono e tablet

Sotto i 700 px di larghezza l'interfaccia passa alla disposizione per telefono:

- il menu sta dietro **☰**; i sottomenu si aprono uno alla volta, e "‹" torna indietro
- preferiti ed esplora file stanno in un **cassetto**, aperto dal pulsante in alto a destra; si chiude toccando fuori o aprendo un file
- si vede **un pannello alla volta**: se la sessione (magari ripresa dal desktop) ne ha più di uno, ⇄ passa al successivo; dividere non è disponibile
- l'**anteprima** copre l'editor: "‹ Editor" torna al codice lasciandola aperta, "Anteprima" in alto la riporta davanti; **▶** in alto esegue il file

Sui dispositivi touch, a qualunque larghezza:

- la **pressione prolungata** su tab, file, cartelle e preferiti apre il menu del tasto destro (Safari su iOS non lo genera da solo)
- mentre si scrive compare una **barra dei tasti** sopra la tastiera: Tab (con Emmet), Esc, annulla e ripeti, frecce, parentesi e simboli, Cerca ed Esegui
- l'app resta nella parte visibile sopra la tastiera virtuale (`visualViewport`; su Android anche `interactive-widget=resizes-content`)

**File dell'app.** Nessun browser per telefono dà accesso alle cartelle del dispositivo, quindi lì (e in Safari e Firefox su desktop) l'esplora file mostra una cartella privata dell'app (Origin Private File System):

- `Ctrl+S` o File → Salva su una tab nuova chiede un nome, anche con sottocartelle ("note/oggi.md"); da lì in poi salva sullo stesso file
- File → Importa, o ⇩ nell'esplora file, copia dentro i file del dispositivo; Esporta / condividi ne porta fuori una copia, col foglio Condividi sui dispositivi touch (File, Drive, un'altra app) e con un download altrove
- i file si creano, rinominano ed eliminano come in una cartella del disco, e l'anteprima HTML carica da lì CSS, script e immagini
- dove `createWritable` manca (Safari meno recenti) si scrive da un Web Worker con `createSyncAccessHandle`; dove gli handle non si possono salvare in IndexedDB, sessione e preferiti ricordano il percorso del file

**Condividi → Fishpad** (Android, app installata): `share_target` nel manifest e un gestore nel service worker (`public/share-target-sw.js`). Un file di testo si apre in una tab, un link come tab URL, un testo in una tab nuova.

**Limiti.** Alla prima apertura una finestra mostra quelli che valgono per il browser in uso, solo se non li si è già visti (`src/notices.ts`); si riapre da Aiuto → Limiti su questo dispositivo.

- I file restano dentro l'app: per lavorare su un file del telefono va importato, e per usarlo altrove va esportato. Non si salva sul file originale, e le modifiche fatte da altre app non arrivano.
- Lo spazio dell'app vive nei dati del sito: cancellandoli, o disinstallando la PWA, i file si perdono. L'app chiede al browser di non eliminarli (`navigator.storage.persist()`), ma Safari può cancellare i dati dei siti non usati per qualche settimana se l'app non è aggiunta alla schermata Home. Conviene esportare i file importanti.
- "Apri con…", file recenti e drag & drop dal sistema esistono solo su desktop; Condividi → Fishpad solo su Android.
- Le scorciatoie con `Ctrl` e `Alt` servono solo con una tastiera fisica; senza, si passa dal menu o dalla barra dei tasti.

## Scorciatoie

| Azione | Tasti |
|---|---|
| Palette dei comandi | `Ctrl+Shift+P` / `F1` |
| Vai a una tab aperta | `Ctrl+P` |
| Nuova tab | `Ctrl+N` (nella PWA) / `Alt+N` |
| Apri | `Ctrl+O` |
| Barra laterale (preferiti ed esplora file) | `Ctrl+B` |
| Ripeti la richiesta della tab URL | `F5` |
| Salva / Salva con nome | `Ctrl+S` / `Ctrl+Shift+S` |
| Chiudi tab | `Ctrl+W` (nella PWA) / `Alt+W` |
| Riapri tab chiusa | `Ctrl+Shift+T` (nella PWA) / `Alt+Shift+T` |
| Dividi a destra (stesso file, scroll separato) | `Ctrl+\` |
| A capo automatico | `Alt+Z` |
| Tab successiva / precedente | `Ctrl+Tab` / `Ctrl+Shift+Tab`, `Ctrl+PgGiù` / `Ctrl+PgSu` |
| Cerca / sostituisci | `Ctrl+F` / `Ctrl+H` |
| Vai alla riga | `Ctrl+Alt+G` |
| Formatta documento (Prettier) | `Shift+Alt+F` |
| Differenza successiva / precedente (nel confronto) | `F7` / `Shift+F7` |
| Chat AI | `Ctrl+Alt+I` |
| Impostazioni | `Ctrl+,` |
| Espandi abbreviazione Emmet | `Tab` (o `Ctrl+E`) |
| Mostra i suggerimenti | `Ctrl+Spazio` |
| Esegui file o selezione (JS, TS) / anteprima (HTML, JSX, TSX, Markdown) | `Ctrl+Enter` |
| Seleziona occorrenza successiva | `Ctrl+D` |
| Chiudi / apri blocco | `Ctrl+Shift+[` / `Ctrl+Shift+]` |
| Chiudi tutto / apri tutto | `Ctrl+K Ctrl+0` / `Ctrl+K Ctrl+J` |
| Chiudi livello N | `Ctrl+K Ctrl+1`…`5` |

In una normale tab del browser, `Ctrl+N`, `Ctrl+W` e `Ctrl+Tab` restano a Chrome, per questo ci sono le alternative con `Alt`. Con la PWA installata in una finestra propria dovrebbero arrivare all'app (da verificare per ogni combinazione).

## Sviluppo

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # output in dist/
npm run preview
npm test          # test unitari (vitest)
```

I test (`+ nome.test.ts` nell'elenco qui sotto) stanno nella sottocartella `__tests__` della cartella del codice che provano.

Stack: Vite, React, TypeScript, CodeMirror 6 (con `@codemirror/merge` per il confronto), `vite-plugin-pwa`, `idb-keyval`, `sucrase`, Prettier, `marked`, Emmet, `@anthropic-ai/sdk` (solo per il provider Anthropic).

```
src/
  App.tsx              menu, azioni sui file, scorciatoie globali
  workbench/Workbench.ts modello: documenti, pannelli, EditorView, sincronizzazione, sessione
  workbench/layout.ts  albero dei pannelli divisi (+ layout.test.ts)
  components/          MenuBar, SplitView, EditorPane, StatusBar, ConsolePanel, PreviewPanel, CommandPalette, HelpDialog,
                       Sidebar, FileTree (esplora file), BookmarkList (preferiti), UrlDialog (Apri URL), KeyBar (tasti sopra la tastiera), DiffDialog (confronto), ChatPanel, SettingsDialog
  components/touch.ts  schermo stretto e touch: media query, pressione prolungata, viewport sopra la tastiera virtuale
  components/commands.ts voci dei menu come comandi e ricerca approssimata della palette (+ commands.test.ts)
  shortcuts.ts         elenco delle scorciatoie mostrato in Aiuto
  runner/Runner.ts     esecuzione del codice e raccolta dell'output della console
  runner/transpile.ts  linguaggi eseguibili (console o anteprima) e traspilazione TS/JSX (+ transpile.test.ts)
  runner/preview.ts    documenti dell'anteprima HTML, React e Markdown (+ preview.test.ts)
  runner/assets.ts     file locali della pagina in anteprima come URL data: (+ assets.test.ts)
  runner/folderAssets.ts lettura di quei file dalla cartella aperta o dall'editor
  runner/react-vendor.ts React per l'anteprima, con un require minimale
  runner/sandbox.ts    sorgenti di iframe e worker: console, formattazione dei valori, mappatura degli errori
  fs.ts                File System Access API, fallback upload/download, esportazione col foglio Condividi
  workspace.ts         "File dell'app" (OPFS) dove manca l'accesso alle cartelle: salvataggio, import, handle salvabili (+ workspace.test.ts)
  opfsWrite.ts         scrittura via Web Worker (createSyncAccessHandle) dove manca createWritable
  notices.ts           limiti noti del dispositivo, mostrati alla prima apertura (+ notices.test.ts)
  share.ts             Condividi → Fishpad: dati ricevuti dal service worker (+ share.test.ts; il gestore è public/share-target-sw.js)
  explorer.ts          lettura della cartella, crea / rinomina / elimina (+ explorer.test.ts)
  remote.ts            tab URL: richiesta GET, header, messaggi d'errore, linguaggio della risposta (+ remote.test.ts)
  bookmarks.ts         preferiti: lista salvata in IndexedDB (+ bookmarks.test.ts)
  store.ts             IndexedDB: sessione (con migrazione dal formato v1), impostazioni, recenti, cartella, preferiti
  editor/setup.ts      estensioni CodeMirror e compartment (tema, font, linguaggio)
  editor/folding.ts    folding per indentazione, chiusura per livello, (de)serializzazione
  editor/languages.ts  riconoscimento dal nome file e caricamento dei linguaggi
  editor/detect.ts     riconoscimento dal contenuto (+ detect.test.ts)
  editor/indentation.ts rilevamento e conversione tab/spazi
  editor/web.ts        Emmet, colori CSS e controllo JSON, caricati in base al linguaggio
  editor/colors.ts     quadratini e selettore dei colori CSS (calcoli in colorValue.ts)
  editor/format.ts     Prettier, con i plugin caricati solo quando servono
  editor/diffStats.ts  righe aggiunte e tolte nel confronto (+ diffStats.test.ts)
  ai/providers.ts      provider AI: client compatibile OpenAI e Anthropic (SDK caricato al primo uso) (+ providers.test.ts)
  ai/context.ts        prompt di sistema con la tab attiva e la selezione (+ context.test.ts)
  ai/chatHistory.ts    chat salvate in IndexedDB, con provider e modello di ogni risposta (+ chatHistory.test.ts)
  ai/markdown.ts       Markdown delle risposte senza HTML, link pericolosi né immagini esterne (+ markdown.test.ts)
  history.ts           cronologia locale delle versioni in IndexedDB (+ history.test.ts)
  encoding.ts          lettura e scrittura in UTF-8 / Windows-1252 (+ encoding.test.ts)
```

## Versioni

Il numero di versione è `MAJOR.MINOR`, appare nella barra del titolo e sta solo in `package.json` (`"version": "MAJOR.MINOR.0"`, il terzo numero resta 0):

- **MAJOR** sale di 1 per ogni rilascio con nuove funzionalità (e MINOR torna a 0): `2.3` → `3.0`
- **MINOR** sale di 1 per un rilascio con sole correzioni: `2.0` → `2.1`

A ogni cambio di versione va aggiunta una voce in [CHANGELOG.md](CHANGELOG.md).

## Deploy su GitHub Pages

1. Crea il repo e fai push su `main`.
2. In **Settings → Pages → Source** scegli **GitHub Actions**.
3. La workflow `.github/workflows/deploy.yml` fa la build con `BASE_PATH=/<nome-repo>/` e pubblica.

Se usi un dominio custom o un repo `<utente>.github.io`, imposta `BASE_PATH: /` nella workflow.

## Roadmap

**v1**
- Window Controls Overlay (tab nella barra del titolo)
- JSON: vista ad albero
- Playground: `import` da npm (esm.sh), controllo dei tipi

**Dopo**
- Chat AI: risposte in streaming, più tab come contesto
- Modalità Vim
- Snippet
- Minimappa
