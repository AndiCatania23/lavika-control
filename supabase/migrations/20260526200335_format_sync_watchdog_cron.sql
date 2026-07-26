-- Schedule LAVIKA format sync watchdog outside the Mac.
--
-- Prerequisites in Supabase Vault:
--   project_url                  = https://<project-ref>.supabase.co
--   format_sync_watchdog_secret  = same value as Edge Function secret FORMAT_SYNC_WATCHDOG_SECRET
--
-- The Edge Function runs with --no-verify-jwt and validates x-watchdog-secret.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema extensions;

select cron.unschedule('format-sync-watchdog')
where exists (
  select 1
  from cron.job
  where jobname = 'format-sync-watchdog'
);

select cron.schedule(
  'format-sync-watchdog',
  '*/10 * * * *',
  $$
  select
    net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/format-sync-watchdog',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-watchdog-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'format_sync_watchdog_secret')
      ),
      body := jsonb_build_object('source', 'pg_cron', 'time', now()),
      timeout_milliseconds := 15000
    ) as request_id;
  $$
);
