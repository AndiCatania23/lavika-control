-- Publish and enqueue atomically. Existing cards are historical: no backfill push.
alter table public.comics_episodes add column push_on_publish_consumed boolean not null default false;
update public.comics_episodes set push_on_publish_consumed=true where status='published';

create unique index comics_one_publication_push on public.notification_jobs(episode_id) where topic='new_comic';

create function public.comics_push_payload(p_series integer,p_number integer,p_id uuid) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_object(
  'title',case when p_series=2 then 'I soliti noti sono tornati.' else 'LAVIKA COMICS' end,
  'body',case
   when p_series=1 then 'Il fischio finale è solo l’inizio. Scopri l’episodio #'
   when p_series=2 then 'Nuovo episodio #'
   else 'È uscita una nuova card. Scopri l’episodio #' end
   || lpad(p_number::text,greatest(3,length(p_number::text)),'0')
   || case when p_series=2 then ' di LAVIKA COMICS. Stavolta che avranno combinato?' else '.' end,
  'url','/comics/'||p_id::text,
  'icon','/icons/web/pwa-192x192.png'
 );
$$;
revoke all on function public.comics_push_payload(integer,integer,uuid) from public,anon,authenticated;
grant execute on function public.comics_push_payload(integer,integer,uuid) to service_role;

create function public.comics_enqueue_publication_push() returns trigger
language plpgsql set search_path='' as $$
begin
 -- The editorial API never writes this flag; also prevent accidental resets.
 if TG_OP='UPDATE' then
  new.push_on_publish_consumed:=old.push_on_publish_consumed;
 else
  new.push_on_publish_consumed:=false;
 end if;
 if new.status='published' and not new.push_on_publish_consumed then
  insert into public.notification_jobs(topic,channel,episode_id,payload,audience_filter,status,scheduled_at)
  values('new_comic','push',new.id::text,public.comics_push_payload(new.series,new.episode_number,new.id),
   '{"type":"all_active"}'::jsonb,'queued',now())
  on conflict (episode_id) where topic='new_comic' do nothing;
  new.push_on_publish_consumed:=true;
 elsif new.status<>'published' and TG_OP='UPDATE' then
  -- Retracting an episode cancels a notification that has not been claimed yet.
  update public.notification_jobs set status='canceled',updated_at=now()
   where topic='new_comic' and episode_id=new.id::text and status='queued';
 end if;
 return new;
end;
$$;
revoke all on function public.comics_enqueue_publication_push() from public,anon,authenticated;
create trigger comics_publication_push before insert or update on public.comics_episodes
 for each row execute function public.comics_enqueue_publication_push();
