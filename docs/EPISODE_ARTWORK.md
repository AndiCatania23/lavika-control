# Gestione card Match Reaction

In **Media → Episodi → Match Reaction → Gestisci card** si sceglie la generica oppure un relatore, si carica/seleziona un’immagine e si salva. Rimuovere la card di un relatore lo riporta alla generica. Le modifiche valgono per episodi esistenti e futuri.

Nel dettaglio episodio, **Card specifica di questo episodio** è facoltativa: se presente prevale sul relatore. Rimuovendola si torna alla selezione automatica. Gli upload usano chiavi nuove: annullare una modifica non altera la card già pubblicata.

Il database è la fonte unica:
- `players.match_reaction_card_url`: default del relatore, identificato dalla pipeline tramite `speaker_id`.
- `content_formats.cover_horizontal_url`: generica.
- `content_episodes.thumbnail_override_url`: scelta manuale episodio.
- `content_episodes.thumbnail_url`: valore effettivo materializzato dai trigger. Le importazioni non possono sovrascrivere un override.

App, Control, selettori social e notifiche leggono lo stesso `thumbnail_url`. Le modifiche al relatore o alla generica aggiornano retroattivamente gli episodi automatici. PATCH episodi traduce il campo editoriale `thumbnail_url` in override per Match Reaction; gli altri format mantengono il contratto precedente. Nessuna mappa di nomi nel codice.

Il nuovo endpoint di modifica delle card verifica il token Supabase e l’appartenenza a `dev_admins`. Dopo i salvataggi, Control richiede un refresh app con HMAC temporaneo. Un refresh fallito non annulla il salvataggio; l’interfaccia informa del ritardo di cache.

Migrazione: `supabase/migrations/20261011213324_control_managed_reaction_cards.sql`.
Test transazionale con rollback: `scripts/tests/reaction-artwork.sql` (inserimento, reimportazione, override, relatore sconosciuto, nuove card su interviste passate e generica).
