-- Press Conference — Campionato 2026/27
-- Keep expired regular-season/playoff sources disabled and create one isolated
-- source for the current Serie C season.

update public.video_sources
set enabled = false,
    updated_at = now()
where format_id = 'press-conference'
  and id <> 'catania-press-conference-2026-2027';

insert into public.video_sources (
  id,
  format_id,
  name,
  platform,
  channel,
  filters,
  processing,
  naming,
  scan_window,
  max_videos_per_run,
  enabled,
  category,
  notifications,
  metadata,
  season,
  match_resolver,
  created_by
)
values (
  'catania-press-conference-2026-2027',
  'press-conference',
  'Catania Press Conference 2026/27',
  'youtube',
  'https://www.youtube.com/@officialcataniafc/streams',
  jsonb_build_object(
    'dateRange', jsonb_build_object('from', '2026-07-01', 'to', '2027-06-30'),
    'titleContains', jsonb_build_array('Conferenza', 'incontra i giornalisti', 'incontra la stampa'),
    'excludeWords', jsonb_build_array(
      'Primavera', 'Under', 'Femminile', 'Women', 'Highlights',
      'Post Gara', 'Post-Gara', 'Post partita', 'Post-partita',
      'Allenamento', 'Training'
    ),
    'minDuration', 180,
    'maxDuration', 7200
  ),
  jsonb_build_object(
    'order', 'uploadDate-asc',
    'resolveMissingUploadDate', true,
    'skipThumbnail', true,
    'transcodeProfile', 'press-conference-max850'
  ),
  jsonb_build_object(
    'seasonLabel', '2026-2027',
    'strategy', 'press-conference-match'
  ),
  14,
  12,
  true,
  'press-conference',
  jsonb_build_object('onNewVideo', true, 'onError', true),
  jsonb_build_object('folder', 'Press Conference'),
  jsonb_build_object(
    'name', '2026/2027',
    'startDate', '2026-07-01',
    'endDate', '2027-06-30'
  ),
  jsonb_build_object(
    'type', 'pre-match-conference',
    'teamAliases', jsonb_build_array('Catania', 'Catania FC', 'Calcio Catania')
  ),
  'codex'
)
on conflict (id) do update
set name = excluded.name,
    platform = excluded.platform,
    channel = excluded.channel,
    filters = excluded.filters,
    processing = excluded.processing,
    naming = excluded.naming,
    scan_window = excluded.scan_window,
    max_videos_per_run = excluded.max_videos_per_run,
    enabled = excluded.enabled,
    category = excluded.category,
    notifications = excluded.notifications,
    metadata = excluded.metadata,
    season = excluded.season,
    match_resolver = excluded.match_resolver,
    updated_at = now();
