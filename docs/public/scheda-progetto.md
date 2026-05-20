# Scheda Del Progetto

## Titolo

**Antica Fiamma**

Ambiente digitale di lettura dantesca a partire dal singolo verso.

## Autrice

Ruoci Song

## Siti

- [anticafiamma.it](https://anticafiamma.it)
- [ddpcommentary.com](https://ddpcommentary.com)

## Descrizione Sintetica

Antica Fiamma è un prototipo funzionante di interfaccia di ricerca per la lettura della *Commedia* e della sua tradizione esegetica.

Il progetto organizza testo dantesco, commenti, percorsi lessicali, confronti tra commentatori, rinvii intertestuali e strutture di autorità a partire dal singolo verso. Il Dartmouth Dante Project è usato come fonte per i materiali di commento; Antica Fiamma non si presenta come archivio sostitutivo, ma come livello di interfaccia e lettura costruito intorno a una fonte dichiarata.

## Problema Di Ricerca

Molti strumenti permettono di cercare nei commenti. È meno immediato leggere la tradizione esegetica partendo da una singola linea poetica e mantenendo insieme:

- testo della *Commedia*
- commenti
- cronologia
- confronto tra letture
- parole dantesche ricorrenti
- echi interni al poema
- autori, opere e personaggi citati nella tradizione

Antica Fiamma prova a trattare il verso come tavolo locale di lettura.

## Componenti Attuali

- ingresso per cantica, canto e verso
- Line Snapshot per orientarsi nella densità e nella pressione esegetica locale
- schede di commento con ordinamento, fonti, date e testo espanso
- confronto tra commenti
- livello lessicale per parole dantesche selezionabili
- campi interpretativi locali
- echi cross-canto
- livello di autorità per autori, opere e personaggi
- stanze di ricerca pubbliche, a partire dal motivo del fuoco

## Stato Dei Dati

Il progetto usa il Dartmouth Dante Project come fonte dei commenti.

L'autrice ha contattato il team del Dartmouth Dante Project per una richiesta di riuso formale. In attesa di una risposta più definitiva, il progetto è presentato con cautela come prototipo di ricerca e non come rilascio definitivo dei dati.

La repository pubblica non distribuisce i payload pesanti dei dati runtime. Documenta invece l'interfaccia pubblica, alcune scelte tecniche, la struttura del progetto, il deployment e i confini dei dati.

Una versione pubblica ridotta può essere ottenuta rimuovendo i commenti moderni e mantenendo, dove disponibili, i livelli di commento di pubblico dominio insieme all'interfaccia di lettura.

## Stato Tecnico

Il progetto è attualmente un prototipo pubblico funzionante:

- front-end statico HTML/CSS/JavaScript
- deployment tramite Cloudflare Pages
- domini registrati e pagati dall'autrice
- Cloudflare Pages mantenuto nell'account dell'autrice sul piano gratuito attuale
- dati runtime separati dalla repository pubblica
- script Python per la generazione di strutture front-end e pagine di autorità
- repository GitHub pubblica con documentazione di progetto
- smoke test per alcuni percorsi dell'interfaccia

Lo sviluppo è autonomo e assistito da strumenti di AI coding, con controllo di versione, revisione manuale e documentazione progressiva.

## Stato Di Consolidamento

Il progetto è attualmente mantenuto dall'autrice come prototipo pubblico autonomo.

La documentazione pubblica rende espliciti:

- il rapporto con il Dartmouth Dante Project
- le scelte tecnologiche e implementative
- la separazione tra interfaccia pubblica e dati runtime
- la sostenibilità dell'attuale modello di manutenzione
- lo stato dei diritti e dei permessi
- la possibilità di discutere il prototipo in un contesto DH mantenendo distinti consulenza metodologica, hosting infrastrutturale e responsabilità istituzionale

## Documenti Collegati

- [project-dossier.md](./project-dossier.md)
- [technical-overview.md](./technical-overview.md)
- [rights-and-permissions.md](./rights-and-permissions.md)
- [sustainability-and-maintenance.md](./sustainability-and-maintenance.md)
- [demo-paths.md](./demo-paths.md)
