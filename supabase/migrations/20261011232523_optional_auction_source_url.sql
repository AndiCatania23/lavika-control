-- A broadcast source may have no public URL. Preserve provided URL checks.
alter table public.editorial_auction_updates drop constraint editorial_auction_updates_source_url_check;
alter table public.editorial_auction_updates add constraint editorial_auction_updates_source_url_check check (source_url = '' or source_url ~ '^https?://');
alter table public.editorial_auction_updates alter column source_url set default '';
