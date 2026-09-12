# Insights Integrity v1 — contratto di misurazione

Versione introdotta il 13 settembre 2026. La certificazione è un passaggio distinto dall'installazione: timestamp in `analytics_measurement_versions.certified_at`, valorizzato solo dopo verifiche SQL, replay 493/493 e deploy app/control riusciti. Nessun evento storico viene cancellato.

## Sessioni

Identità invariata: `(user_id, session_key)`; la chiave vive nella sessionStorage della scheda/WebView. Non viene introdotto un timeout di inattività. Intervallo = `last_seen_at - first_seen_at`, tempo trascorso tra osservazioni, NON minuti effettivamente attivi. Campione Insights: sessioni iniziate nelle ultime 720 ore, quindi rolling e non cumulativo; può diminuire.

Causa delle durate negative: `first_seen_at` assegnato da `now()` nel DB dopo il timestamp applicativo inviato come `last_seen_at`. Il BEFORE trigger rende il primo intervallo almeno zero e mantiene monotono l'ultimo timestamp. Un CHECK impedisce durate negative anche senza normalizzazione. I record storici negativi vengono portati a zero, conservando timestamp precedente e data di riparazione in metadata. Le durate zero entrano nella mediana: cambiamento intenzionale del campione precedentemente filtrato.

`analytics_session_days` conserva i giorni Roma effettivamente osservati da ogni heartbeat registrato. Backfill limitato agli endpoint first/last esistenti: non si inventano giorni intermedi. Prima dell'installazione i ritorni App sono minimi osservabili, non una storia completa. Nessuna inferenza di presenza da refresh token, subscription push o solo esistenza del profilo.

## Video start

Evento `view_start`: HLS quando la promessa `video.play()` riesce; YouTube quando viene inviato il comando di avvio al player. Non equivale a secondi guardati, completamento o playback YouTube confermato. Questo trigger business preesistente resta invariato.

Un solo start canonico per `(attore, episodio, playback_session_key)`:

- attore = device_id se presente; altrimenti user_id; senza entrambi ogni evento resta distinto;
- episodio = episode_id, altrimenti content_id; chiave mancante non consente dedup affidabile;
- stessa playback key riusata da pause/resume e doppio tap non produce altri start;
- chiave nuova all'apertura di una nuova riproduzione produce uno start, anche per stesso utente/video;
- guest→registered sullo stesso device conserva l'identità dello start;
- la riga più antica per occurred_at/id è canonica; le altre restano raw con analytics_duplicate_of;
- indice UNIQUE parziale rende atomica l'idempotenza anche con richieste concorrenti;
- le API rispondono successo al conflitto di questa specifica chiave; non eliminano metadata in fallback.

`v_insights_events` è la sorgente canonica di tutti i lettori Insights di content_events. Eventi storici privi di playback key restano separati e non sono certificabili per dedup; nel controllo pre-migrazione tutti i 1.923 view_start avevano la chiave e nessuno aveva insieme content_id ed episode_id.

## Core actions e identità

Core = Pill aperta, Partita aperta, primo pronostico inviato per account/partita, Video start canonico. I pronostici su partite diverse contano separatamente; l'editing dello stesso pronostico non è un nuovo primo invio.

Da questa versione, aperture Pill/Partita deduplicate per account/contenuto/sessione/giorno Roma (prima la chiave durava tutta la scheda). Una scheda aperta per giorni non deve sopprimere D1/D7. Il client non conserva più un marker senza account; l'unicità DB include user_id. Nessun backfill di aperture non registrate. Gli ID auth/profile non cambiano. Il device analytics resta distinto dalla chiave usata dalle push; reinstallazione/device diversi non vengono uniti per deduzione.

## Retention: definizioni distinte

D0 = data iscrizione in Europe/Rome. Coorti storiche: created_at >= 2026-08-22T20:41:06Z. I denominatori includono tutti gli iscritti maturi, anche senza attività D0. Un giorno N matura solo quando la data corrente Roma è maggiore di D0+N.

| Metrica | Numeratore | Denominatore |
|---|---|---|
| D7 App Return exact | almeno un evento canonico oppure giorno di sessione osservato in D0+7 | iscritti con D7 concluso |
| D7 Core Action exact | almeno una core action in D0+7 | stesso denominatore |
| Returned D1–D7 App / W1 Return | almeno una presenza App nei giorni 1–7 inclusi | stesso denominatore |
| Returned D1–D7 Core | almeno una core action nei giorni 1–7 inclusi | stesso denominatore |
| Core D1/D7/D30 nelle coorti | core action nella data D0+N | iscritti con DN concluso |
| Retention per funzione D1/D7 exact | stessa funzione in D0 e D0+N | attivati sulla funzione in D0 con DN concluso |

“Exact” richiede attività in quella data, ma NON vieta attività negli altri giorni. D1–D7 è una finestra cumulativa ancorata all'iscrizione, non le ultime 168 ore. La retention per funzione cambia intenzionalmente: prima misurava ritorno a QUALSIASI core action tra gli attivati sulla funzione; ora misura ritorno alla STESSA funzione. Il totale attivati resta invariato.

Sorgenti: `v_insights_retention_users_v1` diagnostica individuale, `v_insights_retention_summary_v1` aggregato; `v_insights_complete_activation_by_feature` ritorno stessa funzione. Il KPI hero ora include tutte le coorti mature dal cutoff, eliminando il precedente limite alle ultime 12 settimane (nessuna differenza nello snapshot attuale). UI e copia report nominano ambito e finestra. Gli errori di lettura del nuovo pannello non diventano zero.

## Baseline nuova, storico preservato

`v_insights_baseline_v1` è vuota di campione fino alla certificazione T0. Le sezioni storiche conservano il cutoff precedente e non vanno confrontate come se avessero lo stesso denominatore.

- Acquisition: nuovi account con created_at >= T0.
- Activation D0 Core: almeno una core action tra signup e fine D0; denominatore nuovi account con D0 concluso. Non è completion del profilo.
- W1 Return App: returned D1–D7 per nuovi account da T0, esclusi quelli con D7 incompleto.
- WAU/MAU: account registrati distinti (inclusi quelli preesistenti), attività da T0 nelle ultime 168/720 ore. Finestre dichiarate parziali finché non trascorrono 720 ore.
- Next Matchday Retention, proposta non implementata: partita Catania effettivamente giocata come evento base; account registrati attivi nella sua data Roma; ritorno nella data della successiva partita Catania effettivamente giocata. Escludere rinvii/cancellazioni, congelare le date reali e non la giornata nominale, maturare dopo fine data della partita successiva. Più partite nella stessa data richiedono una sola finestra giornaliera, non denominatori duplicati. Variante D+1 separata, mai mescolata al ritorno alla prossima partita.
- Feature engagement: utenti distinti e azioni canoniche per feature/finestra, frequenza = azioni/utenti; il pannello storico resta disponibile. Per il nuovo monitoraggio filtrare eventi >= T0 e dichiarare finestre parziali. Nessuna percentuale next-matchday fittizia.

La baseline non rende retroattivamente completi gli heartbeat o le aperture mai raccolti. Certificazione riguarda i vincoli e le definizioni osservabili della v1, non prova che ogni utilizzo fisico produca un evento (rete/offline e best-effort restano limiti).

## Test e riproducibilità

`npm run test:insights` esegue la migrazione reale in PostgreSQL PGlite isolato, senza credenziali/rete verso Supabase. Fixture: A D1/D7; B solo D3; C mai tornato; sessione-only D7; core-only D7; guest promosso; mezzanotte Roma; DST; stesso-feature; durata negativa insert/update/CHECK; unique Video; storico dei giorni persistente; baseline.

Replay opzionale sui dati privati dell'audit, NON presenti nel repository:

```sh
node scripts/insights-tests/reconcile-audit.mjs AUDIT_DIR OUTPUT_DIR
python3 OUTPUT_DIR/replay.py
```

Importa lo stesso snapshot anonimizzato del 12 settembre 2026 21:50:23.546192 UTC in PostgreSQL; congela now() solo nel DB di test; applica migrazione; legge le view reali. Python ricostruisce indipendentemente il raw canonico, clamp delle durate e nuova semantica feature. Mantiene gli stessi 493 confronti e i 12 campioni manuali. Le nuove metriche App sono controlli aggiuntivi, non sostituzioni dei 493.

Verifica manuale: interrogare v_insights_retention_users_v1 per un user_id e confrontare signup_day+7 con content_events canonici/core e analytics_session_days. I report condivisi devono usare ID pseudonimizzati.

## Distribuzione

Ordine: test → migrazione Supabase → controlli DB → deploy app e control tramite git push → verifica build/UI → timestamp certificazione. Mai cancellare raw o rollbackare il tracking giornaliero per annullare una label. Se la distribuzione fallisce, certified_at rimane NULL.
