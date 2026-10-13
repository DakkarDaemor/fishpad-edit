# Fishpad Edit

Editor di testo per desktop nel browser, con syntax highlight e folding del codice. Legge e scrive i file locali direttamente, funziona offline e si installa come app (PWA).

È pensato per Chromium (Chrome, Edge). Su Firefox e Safari funziona in modalità ridotta: i file si aprono con un upload e si salvano con un download.

## Funzionalità (MVP)

- **Menu tradizionale** (File, Modifica, Visualizza, Aiuto) con le scorciatoie indicate accanto alle voci.
- **Pannelli divisi**: affianca o impila più pannelli (Visualizza → Dividi a destra / in basso, oppure i pulsanti a destra della barra delle tab). Ogni pannello ha le sue tab. Lo stesso file aperto in due pannelli resta sincronizzato, ma cursore, scroll, blocchi chiusi e cronologia di annulla sono separati: `Ctrl+Z` annulla solo le modifiche fatte in quel pannello. Le tab si trascinano da un pannello all'altro; i divisori si trascinano per ridimensionare (doppio clic per uniformare).
- **Tab multiple**: la sessione viene salvata in automatico in IndexedDB. Alla riapertura ritrovi pannelli, contenuto, cursore e blocchi chiusi, anche per le tab non salvate su disco.
- **Tab colorate**: tasto destro su una tab (o Visualizza → Colore tab) per darle un colore. Il colore appartiene al file: se è aperto in più pannelli, tutte le sue tab lo condividono.
- **File locali**: grazie alla File System Access API, `Ctrl+S` scrive sullo stesso file su disco. C'è anche "Salva con nome".
- **File recenti**: tiene gli handle dei file, quindi riaprendo un recente il browser chiede solo il permesso.
- **"Apri con…" dal sistema operativo**: nella PWA installata, tramite `file_handlers` e `launchQueue`. Se l'app è già aperta, il file si apre come nuova tab.
- **Drag & drop di file** sulla finestra. Su Chromium il file resta collegato a quello su disco.
- **Syntax highlight per circa 140 linguaggi** (`@codemirror/language-data`, caricati solo quando servono). Il linguaggio si riconosce dal nome del file; per il testo incollato in una tab senza nome lo riconosce dal contenuto, con euristiche a punteggio per JavaScript, TypeScript, JSX, TSX, CSS, HTML e JSON. Mentre scrivi può passare a un linguaggio più specifico (per esempio da JS a TSX quando aggiungi i tipi), finché non lo scegli tu a mano.
- **Folding**:
  - dall'albero sintattico per i linguaggi con parser Lezer, comprese le sezioni Markdown sotto i titoli
  - dall'indentazione per testo semplice e linguaggi legacy
  - chiusura per livello, come in VS Code
  - i blocchi chiusi vengono ricordati per ogni tab
- **Indentazione per file**: spazi o tab e relativa larghezza vengono rilevati dal contenuto. Si possono cambiare dalla barra di stato, e c'è la conversione dell'intero file tra spazi e tab (annullabile con `Ctrl+Z`).
- **Console JavaScript / TypeScript**: `Ctrl+Enter` esegue il file attivo, o solo la selezione, e mostra l'output in un pannello in basso, con `await` al livello principale, oggetti formattati e la riga degli errori cliccabile. Il codice gira in un Web Worker dentro un iframe `sandbox` con origine opaca: non accede a sessione e file dell'editor, e un loop infinito non blocca l'interfaccia (Stop termina tutto). TypeScript viene eseguito togliendo i tipi con sucrase, senza controllarli. Il modulo si carica solo al primo uso e conserva i numeri di riga.
- **Anteprima HTML / React**: per i file HTML, JSX e TSX `Ctrl+Enter` apre un pannello a destra che si aggiorna mentre scrivi. Log ed errori della pagina vanno nella console. Nei file JSX/TSX si possono importare `react`, `react-dom` e `react-dom/client`: sono le build di produzione della versione usata dall'app, quindi funzionano offline. L'export default, o una funzione `App`, viene montato in automatico se il codice non chiama `createRoot`. Per ora i file locali referenziati dall'HTML (CSS, JS) e i pacchetti npm non vengono caricati.
- **Cerca e sostituisci** con regex, multi-cursore, selezione rettangolare (Alt+trascina)
- **Tema** chiaro, scuro o di sistema; dimensione del font; a capo automatico
- **Barra di stato**: riga e colonna, selezione, linguaggio, fine riga LF/CRLF (conservato in salvataggio), encoding UTF-8 (il BOM viene rimosso in apertura)

## Scorciatoie

| Azione | Tasti |
|---|---|
| Nuova tab | `Ctrl+N` (nella PWA) / `Alt+N` |
| Apri | `Ctrl+O` |
| Salva / Salva con nome | `Ctrl+S` / `Ctrl+Shift+S` |
| Chiudi tab | `Ctrl+W` (nella PWA) / `Alt+W` |
| Dividi a destra | `Ctrl+\` |
| A capo automatico | `Alt+Z` |
| Tab successiva / precedente | `Ctrl+Tab` / `Ctrl+Shift+Tab`, `Ctrl+PgGiù` / `Ctrl+PgSu` |
| Cerca / sostituisci | `Ctrl+F` / `Ctrl+H` |
| Vai alla riga | `Ctrl+Alt+G` |
| Esegui file o selezione (JS, TS) / anteprima (HTML, JSX, TSX) | `Ctrl+Enter` |
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

Stack: Vite, React, TypeScript, CodeMirror 6, `vite-plugin-pwa`, `idb-keyval`, `sucrase`.

```
src/
  App.tsx              menu, azioni sui file, scorciatoie globali
  workbench/Workbench.ts modello: documenti, pannelli, EditorView, sincronizzazione, sessione
  workbench/layout.ts  albero dei pannelli divisi (+ layout.test.ts)
  components/          MenuBar, SplitView, EditorPane, StatusBar, ConsolePanel, PreviewPanel
  runner/Runner.ts     esecuzione del codice e raccolta dell'output della console
  runner/transpile.ts  linguaggi eseguibili (console o anteprima) e traspilazione TS/JSX (+ transpile.test.ts)
  runner/preview.ts    documenti dell'anteprima HTML e React (+ preview.test.ts)
  runner/react-vendor.ts React per l'anteprima, con un require minimale
  runner/sandbox.ts    sorgenti di iframe e worker: console, formattazione dei valori, mappatura degli errori
  fs.ts                File System Access API e fallback upload/download
  store.ts             IndexedDB: sessione (con migrazione dal formato v1), impostazioni, recenti
  editor/setup.ts      estensioni CodeMirror e compartment (tema, font, linguaggio)
  editor/folding.ts    folding per indentazione, chiusura per livello, (de)serializzazione
  editor/languages.ts  riconoscimento dal nome file e caricamento dei linguaggi
  editor/detect.ts     riconoscimento dal contenuto (+ detect.test.ts)
  editor/indentation.ts rilevamento e conversione tab/spazi
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
- Command palette
- Window Controls Overlay (tab nella barra del titolo)
- Apri cartella (albero laterale semplice)
- Avviso "file modificato da fuori" (`lastModified` al focus)
- Prettier caricato solo quando serve
- Anteprima Markdown
- Strumenti JSON
- Diff tra tab (`@codemirror/merge`)
- Trasformazioni testo (ordina, rimuovi duplicati, Base64/URL, …)
- Playground: `import` da npm (esm.sh), file locali collegati all'anteprima HTML, controllo dei tipi

**Dopo**
- Azioni AI con la propria chiave API
- Modalità Vim
- Snippet
- Minimappa
