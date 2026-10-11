begin;
alter table public.players add column if not exists match_reaction_card_url text;
alter table public.content_episodes add column if not exists thumbnail_override_url text;
comment on column public.players.match_reaction_card_url is 'Control-managed default artwork for this speaker’s Match Reaction episodes.';
comment on column public.content_episodes.thumbnail_override_url is 'Explicit episode artwork override; NULL uses speaker then format defaults.';

update public.players set match_reaction_card_url = 'https://lavikasport.app/immagini/match-reaction/match_reaction_roberto_insigne.jpg' where id='official-catania-roberto-insigne';
update public.players set match_reaction_card_url = 'https://lavikasport.app/immagini/match-reaction/match_reaction_massimo_coda.jpg' where id='official-catania-massimo-coda';
update public.players set match_reaction_card_url = 'https://lavikasport.app/immagini/match-reaction/match_reaction_emilio_longo.jpg' where id='coach-2dd21e4c-1096-44c2-9abf-b7c99df0e17a';

-- Preserve any distinct editorial thumbnail. The known Longo/Coda artwork was
-- previously copied across episodes and is now represented by the speaker default.
update public.content_episodes set thumbnail_override_url = thumbnail_url
where format_id='match-reaction' and thumbnail_url is not null
and thumbnail_url not like '%/formats/match-reaction/cover-horizontal.webp%'
and not (coalesce(speaker_id,'')='coach-2dd21e4c-1096-44c2-9abf-b7c99df0e17a' and thumbnail_url like '%/match-reaction-catania-crotone-mister-longo-CV9LRYUGZk0.webp%')
and not (coalesce(speaker_id,'')='official-catania-massimo-coda' and thumbnail_url like '%/match-reaction-catania-crotone-2026-2027-Nenbeof3TXw.webp%');

update public.content_formats set cover_horizontal_url='https://lavikasport.app/immagini/match-reaction/match_reaction_generica.jpg',updated_at=now() where id='match-reaction';

create or replace function public.resolve_episode_reaction_artwork() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.format_id='match-reaction' then
    new.thumbnail_url := coalesce(nullif(btrim(new.thumbnail_override_url), ''),
      (select nullif(btrim(p.match_reaction_card_url), '') from public.players p where p.id=new.speaker_id),
      (select f.cover_horizontal_url from public.content_formats f where f.id=new.format_id));
  end if;
  return new;
end;
$$;
create trigger resolve_episode_reaction_artwork before insert or update of format_id,speaker_id,thumbnail_url,thumbnail_override_url
on public.content_episodes for each row execute function public.resolve_episode_reaction_artwork();

create or replace function public.refresh_speaker_reaction_artwork() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  update public.content_episodes set thumbnail_url=null, updated_at=now()
  where format_id='match-reaction' and speaker_id=new.id and thumbnail_override_url is null;
  return new;
end;
$$;
create trigger refresh_speaker_reaction_artwork after update of match_reaction_card_url on public.players
for each row when (old.match_reaction_card_url is distinct from new.match_reaction_card_url)
execute function public.refresh_speaker_reaction_artwork();

create or replace function public.refresh_format_reaction_artwork() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  update public.content_episodes set thumbnail_url=null, updated_at=now()
  where format_id='match-reaction' and thumbnail_override_url is null;
  return new;
end;
$$;
create trigger refresh_format_reaction_artwork after update of cover_horizontal_url on public.content_formats
for each row when (new.id='match-reaction' and old.cover_horizontal_url is distinct from new.cover_horizontal_url)
execute function public.refresh_format_reaction_artwork();

revoke execute on function public.resolve_episode_reaction_artwork() from public,anon,authenticated;
revoke execute on function public.refresh_speaker_reaction_artwork() from public,anon,authenticated;
revoke execute on function public.refresh_format_reaction_artwork() from public,anon,authenticated;

update public.content_episodes set thumbnail_url=null,updated_at=now() where format_id='match-reaction';
commit;
