-- Editorial auction coverage. No public access to source evidence or internal notes.
create table public.editorial_auctions (
 id text primary key,
 title text not null,
 state text not null default 'scheduled' check (state in ('scheduled','live','paused','closed')),
 revision integer not null default 1,
 updated_at timestamptz not null default now(),
 updated_by uuid,
 change_reason text not null default 'Creazione'
);
create table public.editorial_auction_updates (
 id uuid primary key,
 auction_id text not null references public.editorial_auctions(id),
 amount numeric(12,2) not null check (amount > 0 and amount <= 999999999),
 source_kind text not null check (source_kind in ('article','broadcast')),
 source_name text not null check (length(trim(source_name)) between 1 and 120),
 source_url text not null check (source_url ~ '^https?://'),
 source_title text not null check (length(trim(source_title)) between 1 and 500),
 source_published_at timestamptz not null,
 source_timecode text,
 internal_notes text not null default '',
 status text not null default 'draft' check (status in ('draft','published','withdrawn')),
 published_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 updated_by uuid not null,
 revision integer not null default 1,
 change_reason text not null,
 check (status <> 'published' or published_at is not null),
 check (source_kind = 'broadcast' or source_timecode is null)
);
create index editorial_auction_updates_feed_idx on public.editorial_auction_updates(auction_id, published_at desc, id) where status='published';
create table public.editorial_auction_audit (
 id uuid primary key default gen_random_uuid(),
 entity text not null,
 entity_id text not null,
 actor_id uuid,
 recorded_at timestamptz not null default now(),
 before_record jsonb,
 after_record jsonb not null
);
alter table public.editorial_auctions enable row level security;
alter table public.editorial_auction_updates enable row level security;
alter table public.editorial_auction_audit enable row level security;
revoke all on public.editorial_auctions,public.editorial_auction_updates,public.editorial_auction_audit from public,anon,authenticated;
revoke all on public.editorial_auctions,public.editorial_auction_updates,public.editorial_auction_audit from service_role;
grant select,insert,update on public.editorial_auctions,public.editorial_auction_updates to service_role;
grant select,insert on public.editorial_auction_audit to service_role;

create function public.editorial_auction_stamp() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
 if TG_OP = 'UPDATE' then
   if NEW.id is distinct from OLD.id then raise exception 'ID immutabile'; end if;
   NEW.revision := OLD.revision + 1;
   if TG_TABLE_NAME = 'editorial_auction_updates' then
     if NEW.auction_id is distinct from OLD.auction_id then raise exception 'Asta immutabile'; end if;
     NEW.created_at := OLD.created_at;
     -- Corrections retain original publication order; a withdrawn item may be restored.
     NEW.published_at := OLD.published_at;
   end if;
 end if;
 NEW.updated_at := now();
 if TG_TABLE_NAME = 'editorial_auction_updates' then
   if NEW.status = 'published' and NEW.published_at is null then NEW.published_at := now(); end if;
 end if;
 return NEW;
end $$;
create function public.editorial_auction_record_audit() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
 insert into public.editorial_auction_audit(entity,entity_id,actor_id,before_record,after_record)
 values(TG_TABLE_NAME,NEW.id::text,NEW.updated_by,case when TG_OP='UPDATE' then to_jsonb(OLD) else null end,to_jsonb(NEW));
 return NEW;
end $$;
revoke all on function public.editorial_auction_stamp(),public.editorial_auction_record_audit() from public,anon,authenticated;
create trigger editorial_auction_stamp before insert or update on public.editorial_auctions for each row execute function public.editorial_auction_stamp();
create trigger editorial_auction_update_stamp before insert or update on public.editorial_auction_updates for each row execute function public.editorial_auction_stamp();
create trigger editorial_auction_audit after insert or update on public.editorial_auctions for each row execute function public.editorial_auction_record_audit();
create trigger editorial_auction_update_audit after insert or update on public.editorial_auction_updates for each row execute function public.editorial_auction_record_audit();

-- The beta reads this one sanitized snapshot, never the source evidence tables.
create view public.editorial_auction_feed with (security_invoker=true) as
select a.id,a.state,a.updated_at,
 coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'amount',u.amount,'sourceName',u.source_name,'publishedAt',u.published_at,'updatedAt',u.updated_at) order by u.published_at desc,u.id)
 from public.editorial_auction_updates u where u.auction_id=a.id and u.status='published' and u.published_at<=now()),'[]'::jsonb) as updates
from public.editorial_auctions a;
revoke all on public.editorial_auction_feed from public,anon,authenticated;
grant select on public.editorial_auction_feed to service_role;
insert into public.editorial_auctions(id,title) values('logo-storico-catania','Il logo storico del Catania');
