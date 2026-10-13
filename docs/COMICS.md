# LAVIKA Comics

Control → Editoriale → LAVIKA Comics (`/comics`). Upload the approved card, set series/episode/date and optional title, match reference and caption, then save.

- `draft`: Control only; `beta`: private beta feed; `published`: eligible for the future official Comics reader and also visible in beta. No official app UI is shipped in this change.
- Images live in the existing `lavika-media` R2 bucket: `comics/serie-01/000/<version-uuid>/card.jpg` (or png/webp) and `preview.webp`. Each replacement creates another version; old originals are retained. Draft visibility controls feed discovery, not access to an already-known public CDN URL.
- Original bytes are preserved. Previews resize proportionally to at most 700px width, never crop or stretch. Static JPG/PNG/WebP, at most 4 MB and 25MP. EXIF orientation is accounted for in displayed dimensions.
- A separate asset record is created after upload. Saving the episode references that record. Canceling an upload can leave an unreferenced version; do not delete old media automatically.
- Episode numbers start at 000. Series and number are unique and immutable after first upload in the editor; dates are editorial dates, not verified kickoff dates.
- API `/api/comics` and `/api/comics/upload` validate a Supabase bearer token and membership in `dev_admins` on the server. Clients cannot write directly through the Data API. RLS exposes only published episodes and their currently referenced assets; the beta API uses server credentials after checking its private session and always excludes drafts.
- Edits use a revision check. Concurrent edits return 409. A repeated create uses the same client UUID; conflicting series/episode numbers cannot silently overwrite an existing card.
- Reader refreshes every 60 seconds while visible and on return to the tab. Opening the collection fetches fresh data. No app deploy is needed for each episode.
- Initial archive: ten episodes, 000–009, imported as `beta`. Card 004 references Scafatese on the frame and Picerno inside; preserved as supplied. Cards 000, 001 and 003 are not 4:5; preserved without edits.

## Verification

`node --env-file=.env.local --import tsx --test scripts/comics/comics.test.ts` validates episode zero/date limits, original-byte preservation, proportional previews and rejection of invalid images.

The initial release was tested through browser upload → R2 → draft → beta visibility → draft, stale revision rejection, anonymous RLS isolation, the mobile reader and zoom. Temporary test episodes and R2 objects were removed. SHA-256 checks matched all ten public originals to supplied files.

Importer: `node --env-file=.env.local --import tsx scripts/comics/import-cards.ts <artifact-directory>`. Expects `catalogo-serie-01.json`, original files and the approved black logo. Existing episodes are skipped, never overwritten. This is an explicit one-time operation, not a cron.

## Protagonisti — rilascio 13 ottobre 2026

Il campo `character_ids` collega una card a uno o più personaggi del catalogo dinamico `comics_characters`. Selezione esplicita nell’editor, nessuna classificazione automatica. Il salvataggio resta atomico con il controllo `revision`; la validazione rifiuta ID sconosciuti e duplicati. Le restrizioni RLS esistenti restano applicate.

Migrazione `supabase/migrations/20261013124842_comics_episode_characters.sql` applicata online il 13 ottobre su richiesta esplicita di rilascio, dopo verifica PostgreSQL locale. Le card esistenti ricevono `[]`, senza assegnazioni inventate.

### Catalogo dinamico e anagrafica

Control → Comics → Catalogo protagonisti consente creazione/modifica, ordine, cerchio colorato, caricatura e archiviazione. `player_id` è una FK unica a `players(id)`: ricerca su tutta l’anagrafica, compresi allenatori e giocatori storici; nessuna dipendenza dalla rosa corrente. Il nome breve/ruolo Comics è editoriale e indipendente, la persona canonica è mostrata tramite join aggiornato. L’anagrafica verificata il 13/10 contiene Emilio Longo; Pelligra, Grella e Varrà non hanno record in `players`, né esiste una tabella dirigenza dedicata. Sono quindi voci editoriali del catalogo, collegabili successivamente a una persona censita. Non creiamo falsi giocatori per rappresentare dirigenti.

Le prime quattro illustrazioni sono già negli asset della beta. Le nuove caricature vengono caricate da Control in `comics/personaggi/<id>/<versione>/` su R2: originale conservato e derivata WebP trasparente a 640 px, senza rigenerazione. Upload PNG/WebP statici con trasparenza reale, massimo 4 MB/25 MP. Foto ufficiale e caricatura restano distinte.

`comics_episode_characters` è l’indice relazionale con FK, aggiornato dal trigger nella stessa transazione dell’episodio: rifiuta riferimenti inesistenti/duplicati, conserva lo storico e impedisce cancellazioni accidentali. Non c’è un elenco di nomi nel codice né un limite di quattro protagonisti. Archiviazione: escluso dalle nuove selezioni, ma ancora consultabile se ha card visibili. Anon/authenticated non accedono al catalogo; gli endpoint verificano l’admin/sessione beta. Durante lo sviluppo nessuna scrittura live; al rilascio viene inizializzato il catalogo.

Verifiche locali: build Control webpack e beta Turbopack, lint dei file coinvolti, test schema/media, PostgreSQL locale (FK, quinto personaggio, rinomina canonica, archiviazione, RLS, revisioni e rollback), browser Chromium/WebKit/desktop con trasporto simulato (nuovo personaggio → ricerca persona → caricatura → selezione multipla → filtro). Le fixture browser non caricano media o contenuti reali.

## Raccolte editoriali — preparazione locale 13 ottobre 2026

Control ora propone `Serie 01` e `I soliti noti` nel campo Raccolta. L’identità archivio `series=1` resta associata a Serie 01; `series=2` identifica il filone nominato I soliti noti (non va mostrato come “Serie 02”). Nessuna card esistente viene riassegnata. L’editor calcola il prossimo numero nella sola raccolta scelta, partendo da 000, prima dell’upload. Identità e numero restano immutabili dopo l’upload come in precedenza. Le cartelle R2 mantengono le chiavi versionate esistenti; non servono migrazioni né nuovi permessi.

Il registro `src/lib/comics/series.ts` è allineato a `web/src/features/comics/series.ts` della beta. Nuove identità numerate già presenti nei dati vengono raggruppate automaticamente; nuovi nomi editoriali vanno aggiunti al registro in entrambi i repo. Non è stato introdotto un gestore generico di creazione serie.

Nella beta compaiono solo raccolte con card `beta` o `published`, mai le bozze. La prima card visibile di I soliti noti farà comparire lo scaffale e il suo archivio senza un nuovo deploy. Se tutte tornano in bozza, lo scaffale scompare al successivo aggiornamento. Novità ordinate per data editoriale, numeri ordinati dentro ogni serie; il lettore precedente/successivo resta nella stessa raccolta. UI: ultime tre uscite, protagonisti, uno scaffale per serie, “Te la ricordi?” con recupero di card precedenti. Nessun contenuto fittizio nell’app.

Verifiche: `node --import tsx --test scripts/comics/series.test.ts`, lint mirato, build Control webpack e beta Turbopack. Browser con archivio reale in sola lettura e secondo scaffale su proxy locale con fixture esplicita, senza scritture su DB/R2. Verificati archivio della serie, ritorno, card da riscoprire e lettore isolato per serie. Nessuna pubblicazione effettuata.

## Rilascio ufficiale — 13 ottobre 2026
La sezione Comics è disponibile in /comics e nel carosello della Home ufficiale. Lo stato Pubblicata alimenta /api/comics, mentre Solo beta resta riservato alla beta e Bozza a Control. Le serie vuote restano nascoste. Le dieci card approvate della Serie 01 vengono promosse a Pubblicata durante il rilascio. Le immagini originali restano inalterate.

## Notifiche — attivate il 13 ottobre 2026
La migrazione `20261013181134_comics_publication_push.sql` collega la prima pubblicazione di ogni card alla coda push esistente (`new_comic`, audience `all_active`). Testi approvati per Serie 01 e I soliti noti, numero della card con almeno tre cifre, tap su `/comics/{id}`. Tutte le altre serie hanno un testo Comics generico. Nessuna chiamata push dal browser o dalla richiesta di salvataggio: pubblicazione e accodamento avvengono nella stessa transazione.

Il flag interno `push_on_publish_consumed` e un indice univoco impediscono duplicati dopo modifiche, retry, ritiro e ripubblicazione. Le card già pubblicate all'attivazione vengono marcate senza invio retroattivo. Ritirare una card cancella soltanto un job ancora queued; una notifica già presa in carico/inviata non è revocabile. Il worker esistente gestisce dispositivi attivi iOS, Android e Web; nessun test invia push reali. I marker sono lato server e non entrano nel payload modificabile dell'editor.

Attivazione verificata in produzione: trigger abilitato, 10 card storiche protette, zero job retroattivi. Test payload in sola lettura conferma i due testi approvati.
