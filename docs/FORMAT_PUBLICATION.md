# Pubblicazione format

In Contenuti → Format → dettaglio, **Visibilità su Lavika** espone Pubblica format / Nascondi format. Nell’elenco appare il badge Pubblico / Nascosto.

- Pubblica aggiorna `content_formats.is_published` e attiva tutte le puntate pronte nella stessa transazione, incluse quelle precedentemente nascoste singolarmente.
- Nascondi disattiva tutte le puntate e il format. Non modifica `video_sources`, job, file o badge di accesso.
- Pronto significa HLS disponibile, oggetto R2 MP4/HLS oppure identificativo YouTube riproducibile. Le righe senza asset restano inattive.
- Il trigger sulle scritture degli asset applica lo stato corrente del format anche alle puntate future e ai completamenti di elaborazione. Una modifica del solo `is_active` continua a consentire il controllo del singolo episodio. Un successivo ingest dell’asset segue nuovamente la visibilità del format.
- La route PATCH richiede un amministratore verificato, usa una RPC riservata al service role e rifiuta uno stato iniziale obsoleto con 409. Aggiorna la cache app e distingue un salvataggio riuscito da un ritardo di invalidazione.
- Le vecchie puntate vengono aggiornate, non inserite nuovamente: la pubblicazione dell’archivio non invia notifiche retroattive attraverso il webhook di inserimento.

## Rilascio

Applicare `supabase/migrations/20261026092630_control_format_publication.sql` prima di distribuire Control. L’installazione non cambia la visibilità di nessun format esistente. Poi distribuire tramite GitHub (`git push`), mai Vercel CLI.

L’app ufficiale deve includere il supporto già presente in `origin/master`: filtro `content_formats.is_published`, ingest basato sulla pubblicazione e `/api/internal/revalidate-content`. Control usa i helper esistenti `requireMediaAdmin.ts` e `revalidateAppContent.ts`; includerli nel rilascio se non ancora versionati. `LAVIKA_APP_URL` identifica l’app da invalidare (default: app ufficiale).

## Verifica

`scripts/tests/format-publication.sql` verifica archivio, puntate future, completamento asset, nascondi/ripubblica, stato obsoleto, input errati, isolamento tra format e privilegi. Eseguire su database locale/test con la migrazione applicata; fixture in transazione con rollback.

Verifica locale del 26 ottobre 2026:

- SQL eseguito su PostgreSQL locale PGlite: tutti i casi passano, con il trigger preesistente dei format nascosti presente.
- Browser mobile 390×844 → route Next reale → RPC PostgreSQL locale: pubblica/nascondi, episodi successivi, badge elenco e avviso cache verificati. Nessun errore JavaScript o overflow orizzontale. Auth e trasporto Supabase sostituiti da fixture locali; nessuna scrittura in produzione.
- Endpoint: richieste senza sessione 401, non amministratore 403, input errato 400, stato obsoleto 409.
- ESLint e TypeScript sui file della funzionalità e le loro dipendenze: passano.
- `npm run build`: compilazione Turbopack riuscita; controllo TypeScript globale bloccato dall’errore preesistente `worktrees/series01-push/scripts/daemons/night-smm-brief.ts:524` (`LLMFlatOutput | null`). Il typecheck completo segnala anche altri errori preesistenti nella worktree annidata e nei test social.

## Rilascio del 26 ottobre 2026

- Integrazione isolata sull’ultimo `origin/master` (`642f29a`), mantenendo tutte le configurazioni Source più recenti.
- Il vecchio selettore in Identità è sostituito dal riquadro dedicato. La vecchia API rifiuta modifiche di pubblicazione e invita a ricaricare, evitando aggiornamenti parziali da schermate obsolete.
- Per format già pubblici con puntate inattive, **Pubblica puntate disponibili** attiva l’archivio pronto senza un passaggio intermedio a Nascosto.
- `npm run build` completo ed ESLint passano nella worktree di rilascio. Ripetuti con successo i test browser → API → PostgreSQL locale sulla versione integrata.
- Migrazione applicata a Lavika Sport. Test SQL eseguiti anche sul database remoto in una transazione con rollback: tutti passati, nessuna fixture persistente. Le impronte degli stati di tutti i format ed episodi sono identiche prima e dopo la migrazione.
- La pubblicazione dell’opzione non attiva le puntate esistenti di Corner: resta una scelta esplicita da Control.

