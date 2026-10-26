-- A single transaction controls the format and its ready archive. The existing
-- ingest reads is_published for future episodes; the triggers enforce it.
-- No format is published or hidden by installing this function.
CREATE OR REPLACE FUNCTION public.set_format_publication(
  p_format_id text, p_is_published boolean, p_expected_published boolean
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_before boolean;
  v_changed integer;
  v_active integer;
  v_total integer;
BEGIN
  IF p_is_published IS NULL OR p_expected_published IS NULL THEN
    RAISE EXCEPTION 'Publication state is required' USING ERRCODE = '22023';
  END IF;

  -- Serialize with ingest, including episodes inserted while a format is being
  -- hidden. Acquire this before the format row to keep a consistent lock order.
  LOCK TABLE public.content_episodes IN SHARE ROW EXCLUSIVE MODE;
  SELECT is_published INTO v_before FROM public.content_formats
    WHERE id = p_format_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Format not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_before IS DISTINCT FROM p_expected_published THEN
    RAISE EXCEPTION 'Format visibility changed; reload before retrying' USING ERRCODE = '40001';
  END IF;

  UPDATE public.content_formats SET is_published = p_is_published, updated_at = now()
    WHERE id = p_format_id;

  -- An imported placeholder without a playable asset must stay hidden.
  UPDATE public.content_episodes SET
    is_active = p_is_published AND (
      nullif(btrim(hls_url), '') IS NOT NULL
      OR r2_key ~* '\.(m3u8|mp4)$'
      OR external_id ~ '^[A-Za-z0-9_-]{11}$'
    ) IS TRUE,
    updated_at = now()
  WHERE format_id = p_format_id AND is_active IS DISTINCT FROM (
    p_is_published AND (
      nullif(btrim(hls_url), '') IS NOT NULL
      OR r2_key ~* '\.(m3u8|mp4)$'
      OR external_id ~ '^[A-Za-z0-9_-]{11}$'
    ) IS TRUE
  );
  GET DIAGNOSTICS v_changed = ROW_COUNT;
  SELECT count(*), count(*) FILTER (WHERE is_active) INTO v_total, v_active
    FROM public.content_episodes WHERE format_id = p_format_id;
  RETURN jsonb_build_object('id', p_format_id, 'is_published', p_is_published,
    'previous_is_published', v_before, 'episodes_changed', v_changed,
    'episodes_total', v_total, 'episodes_active', v_active);
END;
$$;
REVOKE ALL ON FUNCTION public.set_format_publication(text, boolean, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_format_publication(text, boolean, boolean) TO service_role;

-- Re-read publication at asset ingestion time, rather than trusting the state
-- cached by the downloader before the transaction. Do not fire for a manual
-- episode-only is_active change: editors can still hide individual episodes.
CREATE OR REPLACE FUNCTION public.publish_ready_format_episode()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  NEW.is_active := (
    EXISTS (SELECT 1 FROM public.content_formats WHERE id = NEW.format_id AND is_published)
    AND (nullif(btrim(NEW.hls_url), '') IS NOT NULL
      OR NEW.r2_key ~* '\.(m3u8|mp4)$'
      OR NEW.external_id ~ '^[A-Za-z0-9_-]{11}$')
  ) IS TRUE;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.publish_ready_format_episode() FROM PUBLIC, anon, authenticated;
-- Alphabetical order: after the draft guard and before broadcast match linking.
DROP TRIGGER IF EXISTS keep_format_episode_publication ON public.content_episodes;
CREATE TRIGGER keep_format_episode_publication
  BEFORE INSERT OR UPDATE OF format_id, hls_url, r2_key, external_id ON public.content_episodes
  FOR EACH ROW EXECUTE FUNCTION public.publish_ready_format_episode();
