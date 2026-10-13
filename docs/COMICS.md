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
