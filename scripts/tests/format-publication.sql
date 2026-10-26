-- Run against a local/test database after the migration. All fixtures roll back.
BEGIN;
INSERT INTO public.content_formats (id, title, is_published)
VALUES ('test-format-publication', 'Publication fixture', false),
       ('test-format-unrelated', 'Unrelated fixture', true);
INSERT INTO public.content_episodes (id, format_id, hls_url, r2_key, external_id) VALUES
 ('test-pub-hls', 'test-format-publication', 'https://example.test/master.m3u8', null, null),
 ('test-pub-mp4', 'test-format-publication', null, 'fixture/video.mp4', null),
 ('test-pub-youtube', 'test-format-publication', null, null, 'abc123DEF_-'),
 ('test-pub-pending', 'test-format-publication', null, null, null),
 ('test-pub-invalid', 'test-format-publication', ' ', 'fixture/poster.webp', 'invalid'),
 ('test-pub-other', 'test-format-unrelated', 'https://example.test/other.m3u8', null, null);

DO $$
DECLARE result jsonb;
BEGIN
  IF EXISTS (SELECT 1 FROM public.content_episodes WHERE format_id='test-format-publication' AND is_active) THEN
    RAISE EXCEPTION 'Hidden format leaked an episode';
  END IF;
  SELECT public.set_format_publication('test-format-publication', true, false) INTO result;
  IF (result->>'episodes_active')::int <> 3 THEN RAISE EXCEPTION 'Ready archive not published: %', result; END IF;
  IF (result->>'episodes_total')::int <> 5 THEN RAISE EXCEPTION 'Wrong total'; END IF;
  BEGIN
    PERFORM public.set_format_publication('test-format-publication', false, false);
    RAISE EXCEPTION 'Stale state was accepted';
  EXCEPTION WHEN serialization_failure THEN NULL;
  END;
  BEGIN
    PERFORM public.set_format_publication('missing-publication-fixture', true, false);
    RAISE EXCEPTION 'Missing format was accepted';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
  BEGIN
    PERFORM public.set_format_publication('test-format-publication', NULL, true);
    RAISE EXCEPTION 'Null state was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
END $$;

-- A downloader's stale false flag must not prevent future ready publication.
INSERT INTO public.content_episodes (id, format_id, hls_url, is_active)
VALUES ('test-pub-future', 'test-format-publication', 'https://example.test/new.m3u8', false);
UPDATE public.content_episodes SET hls_url='https://example.test/ready.m3u8'
WHERE id='test-pub-pending';
DO $$ BEGIN
  IF (SELECT count(*) FROM public.content_episodes WHERE format_id='test-format-publication' AND is_active) <> 5 THEN
    RAISE EXCEPTION 'Future insert or processing completion not published';
  END IF;
END $$;

-- Manual episode hiding remains supported until the next explicit full publication.
UPDATE public.content_episodes SET is_active=false WHERE id='test-pub-hls';
DO $$ BEGIN
  IF (SELECT is_active FROM public.content_episodes WHERE id='test-pub-hls') THEN RAISE EXCEPTION 'Manual hide ignored'; END IF;
  PERFORM public.set_format_publication('test-format-publication', true, true);
  IF NOT (SELECT is_active FROM public.content_episodes WHERE id='test-pub-hls') THEN RAISE EXCEPTION 'Existing public format archive not activated'; END IF;
  PERFORM public.set_format_publication('test-format-publication', false, true);
END $$;
INSERT INTO public.content_episodes (id, format_id, hls_url, is_active)
VALUES ('test-pub-hidden-future', 'test-format-publication', 'https://example.test/hidden.m3u8', true);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.content_episodes WHERE format_id='test-format-publication' AND is_active) THEN
    RAISE EXCEPTION 'Hide failed for archive or future';
  END IF;
  IF NOT (SELECT is_active FROM public.content_episodes WHERE id='test-pub-other') THEN RAISE EXCEPTION 'Unrelated format changed'; END IF;
  PERFORM public.set_format_publication('test-format-publication', true, false);
  IF (SELECT count(*) FROM public.content_episodes WHERE format_id='test-format-publication' AND is_active) <> 6 THEN
    RAISE EXCEPTION 'Republish lost ready episodes';
  END IF;
  IF has_function_privilege('anon', 'public.set_format_publication(text,boolean,boolean)', 'execute')
    OR has_function_privilege('authenticated', 'public.set_format_publication(text,boolean,boolean)', 'execute') THEN
    RAISE EXCEPTION 'Public role can publish';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.set_format_publication(text,boolean,boolean)', 'execute') THEN
    RAISE EXCEPTION 'Service cannot publish';
  END IF;
END $$;
ROLLBACK;
