-- Run against a database with the migration applied. All mutations roll back.
begin;
create temp table reaction_artwork_test (like public.content_episodes including defaults) on commit drop;
create trigger resolve_test before insert or update on reaction_artwork_test for each row execute function public.resolve_episode_reaction_artwork();
insert into reaction_artwork_test select * from public.content_episodes where id='match-reaction-altamura-catania-roberto-insigne-kA9ifMfzhbw';
do $$
declare actual text; expected text;
begin
  select match_reaction_card_url into expected from public.players where id='official-catania-roberto-insigne';
  select thumbnail_url into actual from reaction_artwork_test;
  if actual is distinct from expected then raise exception 'New interview must use speaker card'; end if;
  update reaction_artwork_test set thumbnail_override_url='https://example.com/manual.jpg';
  update reaction_artwork_test set thumbnail_url='https://example.com/import.jpg';
  select thumbnail_url into actual from reaction_artwork_test;
  if actual is distinct from 'https://example.com/manual.jpg' then raise exception 'Re-import overwrote manual card'; end if;
  update reaction_artwork_test set thumbnail_override_url=null,speaker_id=null;
  select cover_horizontal_url into expected from public.content_formats where id='match-reaction';
  select thumbnail_url into actual from reaction_artwork_test;
  if actual is distinct from expected then raise exception 'Unknown speaker must use generic'; end if;
  update reaction_artwork_test set speaker_id='sofa-865789';
  select thumbnail_url into actual from reaction_artwork_test;
  if actual is distinct from expected then raise exception 'Speaker without card must use generic'; end if;

  -- Existing interviews refresh when a new speaker card is configured.
  update public.players set match_reaction_card_url='https://example.com/new-speaker.jpg' where id='sofa-865789';
  if not exists (select 1 from public.content_episodes where speaker_id='sofa-865789' and format_id='match-reaction' and thumbnail_url='https://example.com/new-speaker.jpg') then raise exception 'Past interviews not refreshed'; end if;

  update public.content_episodes set thumbnail_override_url='https://example.com/override.jpg' where id='match-reaction-altamura-catania-roberto-insigne-kA9ifMfzhbw';
  update public.players set match_reaction_card_url='https://example.com/replacement.jpg' where id='official-catania-roberto-insigne';
  if not exists (select 1 from public.content_episodes where id='match-reaction-catania-cosenza-roberto-insigne-hzy9OxTATsg' and thumbnail_url='https://example.com/replacement.jpg') then raise exception 'Speaker replacement did not propagate'; end if;
  select thumbnail_url into actual from public.content_episodes where id='match-reaction-altamura-catania-roberto-insigne-kA9ifMfzhbw';
  if actual is distinct from 'https://example.com/override.jpg' then raise exception 'Speaker replacement overwrote manual episode'; end if;
  update public.content_episodes set thumbnail_override_url=null where id='match-reaction-altamura-catania-roberto-insigne-kA9ifMfzhbw';
  select thumbnail_url into actual from public.content_episodes where id='match-reaction-altamura-catania-roberto-insigne-kA9ifMfzhbw';
  if actual is distinct from 'https://example.com/replacement.jpg' then raise exception 'Removing override did not restore automatic card'; end if;
  update public.players set match_reaction_card_url=null where id='official-catania-roberto-insigne';
  update public.content_formats set cover_horizontal_url='https://example.com/generic.jpg' where id='match-reaction';
  select thumbnail_url into actual from public.content_episodes where id='match-reaction-altamura-catania-roberto-insigne-kA9ifMfzhbw';
  if actual is distinct from 'https://example.com/generic.jpg' then raise exception 'Generic change did not propagate'; end if;
end;
$$;
select 'PASS: insert, re-import, manual override, unknown speaker, past interviews, generic propagation' as result;
rollback;
