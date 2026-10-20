-- Series 01 already uses the all_active first-publication trigger.
-- Update future notification copy only; historical cards must not be re-sent.
create or replace function public.comics_push_payload(p_series integer,p_number integer,p_id uuid) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_object(
  'title',case
   when p_series=1 then 'Serie 01 · Il dopo partita è qui'
   when p_series=2 then 'I soliti noti sono tornati.'
   else 'LAVIKA COMICS' end,
  'body',case
   when p_series=1 then 'La partita finisce. La vignetta comincia. Scopri l’episodio #'
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
