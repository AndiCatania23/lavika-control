-- Character catalog migration. Character identities survive roster changes.
create table public.comics_characters (
 id text primary key check (id ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
 player_id text unique references public.players(id) on update cascade on delete restrict,
 name text not null check (length(trim(name)) between 1 and 80),
 role text not null default '' check (length(role) <= 100),
 image_url text not null,
 color text not null default '#c92c36' check (color ~ '^#[0-9a-fA-F]{6}$'),
 active boolean not null default true,
 sort_order integer not null default 0,
 revision integer not null default 1,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.comics_characters enable row level security;
revoke all on public.comics_characters from anon, authenticated;
grant select,insert,update on public.comics_characters to service_role;
-- Initial artwork is already bundled. New artwork is uploaded to R2 by Control.
insert into public.comics_characters(id,name,role,color,image_url,sort_order) values
 ('pelligra','Pelligra','Presidente','#c92c36','/immagini/comics/personaggi/pelligra-trasparente-v1.png',0),
 ('grella','Grella','Vice presidente','#1a5a9e','/immagini/comics/personaggi/grella-trasparente-v1.png',1),
 ('varra','Varrà','Direttore sportivo','#1a5a9e','/immagini/comics/personaggi/varra-trasparente-v1.png',2),
 ('longo','Longo','Mister','#c92c36','/immagini/comics/personaggi/longo-trasparente-v1.png',3);
-- Resolve the known coach through his existing canonical slug, never generated ids.
update public.comics_characters set player_id=(select id from public.players where slug='emilio-longo') where id='longo';

create function public.comics_character_revision() returns trigger language plpgsql set search_path=public as $$
begin
 if new.id<>old.id then raise exception 'Character identity is immutable'; end if;
 new.revision:=old.revision+1; new.updated_at:=now(); return new;
end; $$;
revoke all on function public.comics_character_revision() from public;
create trigger comics_character_revision before update on public.comics_characters for each row execute function public.comics_character_revision();

alter table public.comics_episodes add column character_ids text[] not null default '{}'::text[],
 add constraint comics_episode_character_shape check (
 cardinality(character_ids)<=100 and (cardinality(character_ids)=0 or array_ndims(character_ids)=1)
 and array_position(character_ids,null) is null);
-- A normalized FK-backed index, synchronized atomically with the episode save.
-- It rejects unknown/duplicate ids and protects historical character references.
create table public.comics_episode_characters (
 episode_id uuid not null references public.comics_episodes(id) on delete cascade,
 character_id text not null references public.comics_characters(id) on delete restrict,
 primary key(episode_id,character_id)
);
create index comics_episode_characters_character_idx on public.comics_episode_characters(character_id,episode_id);
alter table public.comics_episode_characters enable row level security;
revoke all on public.comics_episode_characters from anon,authenticated;
grant select,insert,delete on public.comics_episode_characters to service_role;
create function public.comics_sync_episode_characters() returns trigger language plpgsql set search_path=public as $$
begin
 delete from public.comics_episode_characters where episode_id=new.id;
 insert into public.comics_episode_characters(episode_id,character_id) select new.id,unnest(new.character_ids);
 return new;
end; $$;
revoke all on function public.comics_sync_episode_characters() from public;
create trigger comics_sync_episode_characters after insert or update of character_ids on public.comics_episodes for each row execute function public.comics_sync_episode_characters();
