-- Optional private title; preserve existing values and all access restrictions.
alter table public.editorial_auction_updates drop constraint editorial_auction_updates_source_title_check;
alter table public.editorial_auction_updates add constraint editorial_auction_updates_source_title_check check (length(trim(source_title)) <= 500);
alter table public.editorial_auction_updates alter column source_title set default '';
