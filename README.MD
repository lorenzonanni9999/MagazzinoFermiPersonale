Autenticazione e cookie
---

## 1. Struttura

L’applicazione permette a ciascun utente di:

- registrarsi con email e password;
- effettuare il login;
- vedere e modificare **solo** le proprie task;
- restare “autenticato” dal server durante la navigazione;
- uscire con logout.

Per ottenere questo, l’applicazione combina due idee:

1. **password protette nel database** (non salvate in chiaro);
2. **cookie** inviati dal browser a ogni richiesta.

---

## 2. Concetti essenziali

### Hash
Un *hash* è una trasformazione matematica che, partendo da un testo (es. una password), produce una stringa di caratteri. 
L’hash serve perché la password **non viene salvata in chiaro**.

### Salt
Il *salt* è un valore casuale aggiunto alla password prima di calcolare l’hash. Serve a rendere diversi gli hash anche quando due utenti scelgono la stessa password.

> In questa applicazione la gestione di hash e salt è affidata a `bcrypt`, che si occupa automaticamente dei dettagli.

---

## 3. Cosa viene salvato nel database

Nel database vengono salvati due tipi di dati principali:

- nella collezione `users`: email e **hash della password** (non la password);
- nella collezione `tasks`: le task collegate a un utente tramite `user_id`.

---

## 4. Registrazione (cosa succede quando un utente si registra)

Quando l’utente invia email e password all’endpoint di registrazione:

1. il server controlla che email e password siano presenti;
2. il server verifica che l’email non sia già registrata;
3. il server calcola l’hash della password con `bcrypt`;
4. il server salva nel database:
   - `email`
   - `password` (in realtà: **hash** generato da `bcrypt`)

Il punto cruciale è che **la password in chiaro non viene mai salvata**.

---

## 5. Login (cosa succede quando un utente accede)

Quando l’utente invia email e password all’endpoint di login:

1. il server cerca nel database un utente con quella email;
2. se l’utente non esiste, il login fallisce;
3. se l’utente esiste, il server usa `bcrypt` per verificare la password:
   - non confronta password in chiaro;
   - verifica se la password inserita corrisponde all’hash salvato;
4. se la verifica va a buon fine, l’utente è autenticato e il server prepara dei dati essenziali che identificano l’utente all’interno dell’applicazione:
:

```json
{
  "id": "…",
  "email": "…"
}

```

Queste informazioni non includono la password e servono solo a riconoscere l’utente nelle richieste successive.

---

## 6. Creazione del cookie di autenticazione

Una volta che il login è avvenuto con successo, il server crea un cookie di autenticazione utilizzando i *secure cookie* di Tornado.

Il cookie contiene i dati identificativi dell’utente (id ed email) e viene firmato dal server usando una chiave segreta (`cookie_secret`). La firma garantisce che il contenuto del cookie non possa essere modificato dal browser senza che il server se ne accorga.

Il cookie viene quindi inviato al browser, che lo conserverà e lo invierà automaticamente al server a ogni richiesta successiva.

È importante notare che questo cookie non è una “sessione salvata sul server”: tutta l’informazione necessaria all’autenticazione è contenuta nel cookie stesso.

---

## 7. Secure cookie in Tornado

I *secure cookie* di Tornado sono cookie firmati, non criptati.  
Questo significa che il browser può leggere il contenuto del cookie, ma non può modificarlo in modo valido.

Ogni volta che il browser invia il cookie al server:

- Tornado verifica la firma usando la chiave segreta;
- se la firma è valida, il cookie è considerato autentico;
- se la firma non è valida, il cookie viene ignorato.

In questo modo il server può fidarsi delle informazioni contenute nel cookie senza doverle salvare altrove.

---

## 8. Riconoscimento dell’utente nelle richieste successive

Quando il browser effettua una richiesta a un endpoint protetto (ad esempio per ottenere la lista delle task), il flusso è il seguente:

1. il browser invia la richiesta HTTP;
2. insieme alla richiesta invia anche i cookie;
3. Tornado legge il cookie di autenticazione;
4. se il cookie è valido, l’utente viene ricostruito;
5. se il cookie non esiste o non è valido, l’utente è considerato non autenticato.

Questo controllo avviene a ogni richiesta e permette al server di stabilire se l’utente ha il diritto di accedere a una determinata risorsa.

---

## 9. Accesso alle task e separazione degli utenti

Ogni task nel database è associata a un utente tramite il suo identificativo (`user_id`).

Quando un utente autenticato richiede le proprie task:

- il server recupera l’identità dell’utente dal cookie;
- utilizza l’identificativo dell’utente per filtrare le task;
- restituisce solo le task appartenenti a quell’utente.

In questo modo, anche se più utenti utilizzano la stessa applicazione, ciascuno può vedere e modificare solo i propri dati.

---


## 10. Logout

Il logout consiste nella cancellazione del cookie di autenticazione dal browser.

Quando l’utente effettua il logout:

1. il server elimina il cookie;
2. il browser non invia più il cookie nelle richieste successive;
3. il server non riconosce più l’utente come autenticato.

Di conseguenza, l’accesso agli endpoint protetti viene negato.

---

## Interazione tra server, HTML e JavaScript 

In una applicazione web moderna è fondamentale comprendere **come collaborano tra loro server, pagina HTML e codice JavaScript**.  
Questi tre elementi hanno ruoli diversi e ben separati, ma cooperano continuamente per permettere all’utente di interagire con l’applicazione.

L’utente vede solo il risultato finale nel browser, ma dietro ogni azione (clic, inserimento di testo, caricamento di dati) avviene una sequenza precisa di scambi tra browser e server.

---

## 1. Il ruolo del server Tornado

Il server Tornado ha due compiti principali:

1. fornire al browser i file necessari per costruire l’interfaccia (HTML, CSS, JavaScript);
2. rispondere alle richieste dei dati (login, task, aggiornamenti) tramite API.

Il server **non disegna la pagina** e **non reagisce direttamente ai click** dell’utente.  
Il suo compito è ricevere richieste HTTP e rispondere in modo appropriato.

---

## 2. Perché utilzzare StaticFileHandler e RedirectHandler

All’avvio dell’applicazione, Tornado viene configurato con alcune regole fondamentali:

(r"/static/(.*)", tornado.web.StaticFileHandler, {"path": "static"}),
(r"/", tornado.web.RedirectHandler, {"url": "/static/login.html"}),


Queste due righe servono a separare in modo chiaro **contenuti statici** e **logica applicativa**.

### StaticFileHandler

`StaticFileHandler` dice a Tornado:

> “Quando il browser chiede un file che inizia con `/static/`, non eseguire codice Python: limitàti a restituire il file dal filesystem.”

Questo approccio è utile perché:
- i file HTML, CSS e JavaScript non cambiano a ogni richiesta;
- non richiedono accesso al database;
- possono essere serviti in modo veloce e semplice.

In pratica, Tornado si comporta come un normale web server quando serve questi file.

---

### RedirectHandler

Il `RedirectHandler` serve a gestire l’accesso all’indirizzo principale del sito (`/`).

Quando un utente visita l’applicazione senza specificare una pagina:



http://localhost:8888/


il server non restituisce direttamente una pagina, ma **reindirizza** il browser verso:



/static/login.html


Questo è utile perché:
- l’indirizzo principale resta semplice;
- la pagina iniziale può essere cambiata facilmente;
- il flusso dell’applicazione è più chiaro e controllato.

---

## 3. Caricamento della pagina di login

Il caricamento della pagina di login avviene in più passaggi:

1. il browser richiede `/`;
2. Tornado risponde con un redirect verso `/static/login.html`;
3. il browser richiede il file HTML;
4. Tornado restituisce il file dalla cartella `static`;
5. il browser interpreta l’HTML e costruisce la pagina.

A questo punto **il server ha terminato il suo compito** per quanto riguarda la pagina.  
Da qui in poi, l’interazione è gestita dal browser.

---

## 4. Il ruolo dell’HTML

Il file HTML definisce:

- la struttura della pagina;
- i campi di input;
- i pulsanti;
- i collegamenti ai file CSS e JavaScript.

Un elemento importante è il pulsante di login, che contiene un riferimento a una funzione JavaScript.  
Questo significa che **l’HTML non esegue logica**, ma si limita a indicare cosa deve accadere quando l’utente compie un’azione.

---

## 5.JavaScript

JavaScript è il collegamento tra interfaccia e server.

Quando l’utente preme il pulsante di login:

1. il browser esegue una funzione JavaScript;
2. la funzione legge email e password dai campi HTML;
3. prepara una richiesta HTTP;
4. invia la richiesta al server senza ricaricare la pagina.

Questo tipo di comunicazione è chiamato *richiesta asincrona* (o AJAX).  
Il browser continua a mostrare la pagina mentre la richiesta viene elaborata.

---

## 6. Comunicazione con il server durante il login

La richiesta di login inviata da JavaScript contiene:

- un indirizzo (`/api/login`);
- un metodo HTTP (`POST`);
- i dati dell’utente in formato JSON.

Il server riceve la richiesta, verifica le credenziali e risponde con un messaggio che indica se il login è riuscito o meno.

Se il login ha successo, il server crea un cookie di autenticazione e lo invia al browser insieme alla risposta.

---

## 7. Cosa succede nel browser dopo il login

Il browser riceve la risposta del server e:

- salva automaticamente il cookie;
- permette a JavaScript di leggere il messaggio di risposta;
- se il login è corretto, viene effettuato un reindirizzamento alla pagina delle task.

---

## 8. Caricamento della pagina delle task

La pagina `tasks.html` viene caricata come file statico, esattamente come la pagina di login.

Una volta caricata:

- JavaScript viene eseguito automaticamente;
- viene inviata una richiesta al server per ottenere le task dell’utente.

Questa richiesta include automaticamente il cookie di autenticazione.

---

## 9. Recupero e visualizzazione delle task

Quando il server riceve la richiesta delle task:

1. legge il cookie;
2. riconosce l’utente;
3. recupera dal database solo le task associate a quell’utente;
4. restituisce i dati in formato JSON.

JavaScript riceve questi dati e costruisce dinamicamente la lista delle task all’interno della pagina HTML.

La pagina HTML iniziale funge quindi da contenitore, mentre il contenuto reale viene generato da JavaScript.

---

## 10. Aggiunta di una nuova task

Quando l’utente aggiunge una nuova task:

1. il browser esegue una funzione JavaScript;
2. la funzione legge il testo inserito;
3. invia una richiesta al server;
4. il browser allega automaticamente il cookie;
5. il server associa la task all’utente autenticato;
6. il server salva la task nel database;
7. il server risponde con una conferma.

Subito dopo, JavaScript richiede di nuovo l’elenco delle task per aggiornare la pagina.

---
Questa architettura separa chiaramente le responsabilità:

- il server gestisce dati e sicurezza;
- HTML definisce la struttura;
- JavaScript gestisce il comportamento e le interazioni.

---
