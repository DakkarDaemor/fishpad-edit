# Changelog

Versione `MAJOR.MINOR` (vedi [README](README.md#versioni)): MAJOR sale con nuove funzionalità, MINOR con correzioni.

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
