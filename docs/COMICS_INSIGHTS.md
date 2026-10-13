# Aperture schede LAVIKA Comics v1

Stato: codice e test locali. Nessuna migrazione applicata e nessun deploy. Asta/notifiche separate.

## Contratto

Solo utenti autenticati e scheda `/comics/{id}` risolta senza errore, pagina visibile. Non impression Home, accessi alla raccolta, apertura del reader, lettura completata, notifiche, attribution o retention. Gli ospiti sono esclusi e la copertura è dichiarata in UI/report.

Aperture totali = numero di ingressi distinti, non account/giorno. Utenti unici = account distinti, dall’inizio rilevazione; totale/serie/episodio aggregati indipendentemente, non sommando unici. Andamento giornaliero Europe/Rome, ultimi 30 giorni, limitato alla data di attivazione; oggi è parziale, zero solo per giorni osservabili senza eventi.

La data di avvio è `analytics_measurement_versions.installed_at` per la sola versione `comics_openings_v1`, assegnata quando verrà applicata la migrazione. Coordinare tale attivazione con il rilascio del client e dichiarare eventuale ritardo di distribuzione; non retrodatare né importare aperture. Le versioni e definizioni analytics precedenti restano invariate.

## Identità dell’apertura

- `comicsOpening.ts`: stato in memoria e un solo record sessionStorage (percorso corrente e UUID, nessun account). Nuovo ingresso in un dettaglio dopo percorso differente = UUID nuovo. Rotazione al ripristino BFCache (`pageshow.persisted`).
- Reload del documento sulla stessa scheda = UUID recuperato; remount, refresh dei dati, visibility/focus senza navigazione = stesso UUID.
- Avvio diretto/documento nuovo non reload = nuovo UUID, anche con sessionStorage copiato da una nuova scheda.
- Osservatore client isolato nel root layout: nessun fetch, polling, intercettazione dei link, patch history, modifica scroll o AppShell.
- Hook della scheda: solo account risolto e autenticato, documento visibile e pathname corrispondente. Timeout 2,5 s non bloccante. Più richieste della stessa apertura (es. StrictMode) sono idempotenti nel DB.
- Storage bloccato/corrotto o UUID non disponibile: omettere la misura, non rischiare gonfiaggi. Nessuna coda offline.
- Un deep link sullo stesso URL già aperto senza transizione di percorso non crea un nuovo ingresso. Un semplice reload, anche il giorno dopo, conserva l’apertura originale.

## Database e sicurezza

Migrazione locale `20261013192112_comics_insights.sql` sostituisce la bozza mai applicata. Permessi predefiniti revocati anche a service_role e atlas_reader; a service_role soltanto SELECT/INSERT sulla tabella ed EXECUTE sulle due RPC. Oggetti nuovi e data avvio resistono alla riapplicazione della stessa migrazione; non usarla per mascherare uno schema preesistente incompatibile. Una tabella `comics_openings`, PK `(user_id, opening_id)`, indici episodio/tempo e tempo. Episodio e account con FK/cascade. Evento ritirato resta aggregabile; cancellare episodio/account elimina le righe collegate.

API legge l’account dalla sessione server e accetta solo UUID episodio/apertura. Timestamp assegnato dal DB. RPC `record_comics_opening` inserisce solo episodi pubblicati, ON CONFLICT DO NOTHING. `comics_insights` aggrega senza scritture. Entrambi SECURITY INVOKER, accesso service_role; RLS senza accesso anon/authenticated.

Nessun trigger di analytics canoniche, nessuna scrittura `content_events`, `user_sessions` o `analytics_session_days`, nessuna modifica a DAU/WAU/MAU/core/retention. Il registro esistente è letto dalle metriche precedenti filtrando esplicitamente `insights_integrity_v1`.

## Control

Totali dall’avvio, unici per episodio e serie, tabella episodi, andamento giornaliero per serie e totale (30 giorni). Stesse sorgenti e definizioni nel resoconto copiato. Un provider locale alla pagina carica una volta l’endpoint /api/insights/comics con il token della sessione Control esistente. Il loader verifica getUser(token) e dev_admins prima della RPC, anche se invocato direttamente; risposte private/no-store. Nessun aggregato Comics nel rendering server pubblico. Nessuna modifica al login o alla protezione degli altri aggregati preesistenti. Errori o migrazione assente = dati non disponibili, mai zero. Nessun polling del pannello.

## Verifiche eseguite

- App: `node --test web/scripts/comics-openings.test.mjs` (6 casi), più test identità analytics canonica.
- Control: `scripts/comics/insights.test.mjs` applica la migrazione reale a PGlite isolato: retry concorrenti, tre ingressi/account, unici, serie, giorni Roma, zero osservato, bozze escluse, permessi anon/authenticated, cancellazione account, eventi/view canonici invariati.
- Rendering pannello e report: `scripts/insights-tests/ui.test.mjs`.
- Build app e Control, lint mirato, diff whitespace.
- Fixture browser riproducibile con `node web/scripts/comics-browser-fixture.mjs`: genera progetto Next temporaneo con tracker/observer/API reali, account fittizio e DB in memoria, senza env o chiamate produzione. Avviare `npm run dev -- --hostname 127.0.0.1 --port 3236` nel percorso stampato. Verificati via UI refresh/remount, uscita/back, A/B/back/forward e ospiti. Totali osservati: 1 → 1 → 2 → 3 → 4 → 5; passaggio ospite invariato. Nessun dispositivo fisico verificato.

## Limiti residui

Best effort: chiusura improvvisa, offline, storage non disponibile o dati account non risolti possono sottocontare. Nessuna ricostruzione. Navigation Timing distingue reload e ingresso: WebView che elimina e ricrea il documento senza identificarlo come reload può apparire come nuovo ingresso. Test nativi iOS/Android fisici da completare prima di certificare ogni comportamento del contenitore.

Produzione subordinata a nuova approvazione dell’utente. Applicare esclusivamente questa migrazione, non quella dell’asta presente separatamente. Non eseguire db push indiscriminato.

## Verifica finale e rilascio (autorizzazione ancora necessaria)

Basi pubbliche verificate con git ls-remote: app 2270cc6408f7941edd5f00242a7d2fe3c145fbb3; Control 13ef7a880e6dd5b1e74ad7e28e28ee51d011544e. Supabase verificato in sola lettura: schema Comics compatibile, tabella/RPC aperture assenti. Nessuna dipendenza Home Beta; AppShell e middleware invariati.

Test: 8 app/identità/kill switch; SQL su schema isolato con privilegi predefiniti equivalenti al live, riapplicazione e data immutata, dedup/unici/serie/giorni e isolamento; loader/endpoint con token mancante, invalido, non-admin, errore autorizzazione e admin valido; 5 regressioni Insights. Build produzione e typecheck app/Control, lint mirato. Aggregazione GROUPING SETS: benchmark locale PGlite 100.000 aperture, 100 episodi, 1.000 account simulati, 148 ms per report (non SLA Supabase).

Flag: test HTTP sulla build reale `next start`, variabile COMICS_ANALYTICS_ENABLED=false impostata DOPO la build, restituisce 204 anche con payload non JSON e cookie fittizio, senza lookup sessione/RPC. Senza cookie il middleware esistente risponde 401. Il flag è runtime server, non NEXT_PUBLIC e non dipende dal bundle mobile. Sulla produzione remota NON ancora verificabile: endpoint nuovo non distribuito e nessuna configurazione remota modificata. Per disattivare su Vercel occorre impostare false nell’ambiente Production e rilasciare nuovamente via GitHub: non è un interruttore istantaneo sui deployment esistenti.

Ordine operativo dopo autorizzazione:
1. Verificare che master remoti non siano avanzati; integrare solo i commit Comics selezionati e ripetere check se cambia la base. Escludere ogni file dell’asta, relativo hunk changelog e supabase/.temp. Non usare git add . o db push indiscriminato.
2. Test mobili in ambiente isolato; se non disponibile, documentare esplicitamente rischio residuo prima dell’autorizzazione al rilascio.
3. Applicare soltanto 20261013192112_comics_insights.sql in transazione con lock_timeout 5s e registrare la migrazione nel sistema previsto. Verificare grant/RLS/PK/FK e data avvio. Nessun backfill. L’inserimento baseline mantiene la data originaria su riapplicazione.
4. Pubblicare app via git push; controllare stato variabile Production (false ferma gli eventi, assente/true li abilita), endpoint e prima apertura autenticata idempotente. Registrare intervallo fra migrazione e disponibilità client.
5. Pubblicare Control via git push; verificare 403 senza token/non-admin e risposta aggregata admin, pannello e report. Nessun nuovo timer. Una lettura report per ingresso Insights; due controlli auth/admin prima dell’aggregazione.
6. Verificare sul deployment finale la procedura flag in una finestra concordata; non dichiararla già collaudata sul dominio pubblico. Annotare eventuali intervalli senza misurazione, senza ricostruirli.

Rollback: disabilitare con flag false e nuovo rilascio GitHub, oppure revert del solo commit app. Revert separato commit Control se necessario. Conservare tabella/RPC e dati, compatibili coi client precedenti; nessun DROP o cancellazione baseline automatica. Qualsiasi rollback SQL distruttivo richiede autorizzazione distinta. La rimozione della migrazione dal repository NON annulla il database.

Mobile essenziale (iPhone e Android, account di prova, dati isolati): A=1; refresh/remount/background e blocco schermo invariati; Home→A=2; A→B→indietro A→avanti B aggiunge tre aperture, unici sempre uno per episodio. Guest: zero. Offline: navigazione senza attese/errori, evento eventualmente perso. Provare ripristino dopo eliminazione del processo WebView da sistema: classificazione reload e persistenza sessionStorage non garantite; può risultare nuovo ingresso. Nessun meccanismo aggiuntivo per riconoscere tali casi. Registrare device/OS/orari; non assimilare force-quit dell’app a normale background.

File rilascio Control: migrazione Comics, docs/COMICS_INSIGHTS.md, scripts/comics/{insights,authorization}.test.mjs, scripts/insights-tests/ui.test.mjs, src/lib/insights/{comics,comicsQueries}.ts, src/app/api/insights/comics/route.ts, pagina Insights e componenti ComicsInsightsPanel/ComicsInsightsContext/ComicsInsightsLive/CopyInsightsReport. App: root layout, ComicDetail, comicsOpening, ComicsOpeningObserver, useComicsTracking, API content-events/comics, due script Comics, comics-openings test aggiornato, solo hunk Comics changelog.
