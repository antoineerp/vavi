-- LE RÉVEIL DES AGENTS — écrit par scripts/ecrire-la-migration-du-socle.ts depuis lib/agents/le-sql-des-agents.ts.
-- Ne pas modifier à la main : modifier la source, puis relancer le script.
CREATE TABLE IF NOT EXISTS public.vavi_agents_reveils (
  projet UUID NOT NULL REFERENCES public.vavi_projets(id) ON DELETE CASCADE,
  agent TEXT NOT NULL,
  schema_app TEXT NOT NULL,
  reveil JSONB NOT NULL,
  ia_par_jour INTEGER NOT NULL,
  prochain TIMESTAMPTZ,
  PRIMARY KEY (projet, agent)
);
CREATE INDEX IF NOT EXISTS vavi_agents_reveils_par_table ON public.vavi_agents_reveils (schema_app, (reveil ->> 'table'));
ALTER TABLE public.vavi_agents_reveils ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vavi_agents_reveils FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.vavi_agents_reveils TO service_role;

CREATE TABLE IF NOT EXISTS public.vavi_agents_courses (
  id BIGSERIAL PRIMARY KEY,
  projet UUID NOT NULL REFERENCES public.vavi_projets(id) ON DELETE CASCADE,
  agent TEXT NOT NULL,
  declencheur JSONB NOT NULL,
  cree_le TIMESTAMPTZ NOT NULL DEFAULT now(),
  pris_le TIMESTAMPTZ,
  essais INTEGER NOT NULL DEFAULT 0,
  fini_le TIMESTAMPTZ,
  ok BOOLEAN,
  resultat TEXT,
  erreur TEXT,
  journal JSONB,
  ia INTEGER,
  operations INTEGER,
  duree_ms INTEGER
);
CREATE INDEX IF NOT EXISTS vavi_agents_courses_a_faire ON public.vavi_agents_courses (id) WHERE fini_le IS NULL;
CREATE INDEX IF NOT EXISTS vavi_agents_courses_par_agent ON public.vavi_agents_courses (projet, agent, cree_le DESC);
ALTER TABLE public.vavi_agents_courses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vavi_agents_courses FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.vavi_agents_courses TO service_role;
GRANT USAGE ON SEQUENCE public.vavi_agents_courses_id_seq TO service_role;

-- Le prochain réveil après un instant, à l'heure de Paris (le changement d'heure compris) ; null : pas une heure fixe.
CREATE OR REPLACE FUNCTION public.vavi_prochain_reveil(p_reveil JSONB, p_apres TIMESTAMPTZ)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE
  l TIMESTAMP := p_apres AT TIME ZONE 'Europe/Paris';
  h INTEGER := coalesce((p_reveil ->> 'heure')::integer, 0);
  d TIMESTAMP;
BEGIN
  CASE p_reveil ->> 'cadence'
    WHEN 'horaire' THEN d := date_trunc('hour', l) + interval '1 hour';
    WHEN 'quotidien' THEN
      d := date_trunc('day', l) + make_interval(hours => h);
      IF d <= l THEN d := d + interval '1 day'; END IF;
    WHEN 'hebdomadaire' THEN
      d := date_trunc('day', l) + make_interval(days => (coalesce((p_reveil ->> 'jour')::integer, 1) - extract(dow FROM l)::integer + 7) % 7, hours => h);
      IF d <= l THEN d := d + interval '7 days'; END IF;
    ELSE RETURN NULL;
  END CASE;
  RETURN d AT TIME ZONE 'Europe/Paris';
END $$;

-- Les agents de la version publiée qui se réveillent seuls, relus d'app.json ; leurs tables écoutées.
CREATE OR REPLACE FUNCTION public.vavi_poser_les_reveils(p_projet UUID)
RETURNS INTEGER
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  s TEXT := 'app_' || replace(left(p_projet::text, 20), '-', '_');
  m JSONB;
  a JSONB;
  r JSONB;
  t REGCLASS;
  seuls JSONB := '[]'::jsonb;
  n INTEGER := 0;
BEGIN
  SELECT contenu::jsonb INTO m FROM public.vavi_fichiers WHERE projet = p_projet AND chemin = 'app.json';
  IF jsonb_typeof(m -> 'agents') = 'array' THEN
    SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO seuls FROM jsonb_array_elements(m -> 'agents') x
      WHERE x -> 'reveil' ->> 'type' IN ('horaire', 'evenement') AND x ->> 'nom' ~ '^[a-z][a-z0-9_]{0,62}$';
  END IF;
  DELETE FROM public.vavi_agents_reveils v WHERE v.projet = p_projet
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(seuls) x WHERE x ->> 'nom' = v.agent);
  FOR a IN SELECT x FROM jsonb_array_elements(seuls) x LOOP
    r := a -> 'reveil';
    IF r ->> 'type' = 'evenement' THEN
      CONTINUE WHEN coalesce(r ->> 'table', '') !~ '^[a-z][a-z0-9_]{0,62}$';
      t := to_regclass(format('%I.%I', s, r ->> 'table'));
      CONTINUE WHEN t IS NULL;
      IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid = t AND tgname = 'vavi_reveil') THEN
        EXECUTE format('CREATE TRIGGER vavi_reveil AFTER INSERT ON %I.%I FOR EACH ROW EXECUTE FUNCTION public.vavi_reveil_sur_ligne()', s, r ->> 'table');
      END IF;
    END IF;
    INSERT INTO public.vavi_agents_reveils AS v (projet, agent, schema_app, reveil, ia_par_jour, prochain)
    VALUES (p_projet, a ->> 'nom', s, r, least(greatest(coalesce((a ->> 'ia_par_jour')::integer, 30), 0), 500), public.vavi_prochain_reveil(r, now()))
    ON CONFLICT (projet, agent) DO UPDATE SET schema_app = EXCLUDED.schema_app, ia_par_jour = EXCLUDED.ia_par_jour, reveil = EXCLUDED.reveil,
      prochain = CASE WHEN v.reveil = EXCLUDED.reveil AND v.prochain IS NOT NULL THEN v.prochain ELSE EXCLUDED.prochain END;
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.vavi_poser_les_reveils(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vavi_poser_les_reveils(UUID) TO service_role;

-- À la publication de l'aperçu. Jamais bloquante : un échec est dit, la publication passe.
CREATE OR REPLACE FUNCTION public.vavi_reveils_a_la_publication()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  BEGIN
    PERFORM public.vavi_poser_les_reveils(NEW.id);
  EXCEPTION WHEN others THEN
    RAISE WARNING 'vavi : les réveils des agents de % ne sont pas posés : %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.vavi_reveils_a_la_publication() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS vavi_reveils ON public.vavi_projets;
CREATE TRIGGER vavi_reveils AFTER UPDATE OF apercu_empreinte ON public.vavi_projets
  FOR EACH ROW WHEN (NEW.apercu_empreinte IS DISTINCT FROM OLD.apercu_empreinte) EXECUTE FUNCTION public.vavi_reveils_a_la_publication();

-- Une ligne créée réveille les agents inscrits sur sa table ; jamais celle qu'un agent crée. Jamais bloquante.
CREATE OR REPLACE FUNCTION public.vavi_reveil_sur_ligne()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF coalesce(current_setting('vavi.par_un_agent', true), '') = 'oui' THEN RETURN NULL; END IF;
  BEGIN
    INSERT INTO public.vavi_agents_courses (projet, agent, declencheur)
    SELECT r.projet, r.agent, jsonb_build_object('type', 'evenement', 'table', TG_TABLE_NAME, 'ligne', to_jsonb(NEW))
    FROM public.vavi_agents_reveils r
    WHERE r.schema_app = TG_TABLE_SCHEMA AND r.reveil ->> 'type' = 'evenement' AND r.reveil ->> 'table' = TG_TABLE_NAME
      AND (SELECT count(*) FROM public.vavi_agents_courses c WHERE c.projet = r.projet AND c.agent = r.agent AND c.fini_le IS NULL) < 100;
  EXCEPTION WHEN others THEN
    RAISE WARNING 'vavi : la ligne de %.% n''a réveillé aucun agent : %', TG_TABLE_SCHEMA, TG_TABLE_NAME, SQLERRM;
  END;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.vavi_reveil_sur_ligne() FROM PUBLIC, anon, authenticated;

-- Le relais COMME un compte, pour un agent : ce qu'il crée ne réveille aucun agent.
CREATE OR REPLACE FUNCTION public.vavi_agent_pour(p_compte UUID, p_fonction TEXT, p_arguments JSONB DEFAULT '{}'::jsonb)
RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  PERFORM set_config('vavi.par_un_agent', 'oui', true);
  RETURN public.voie_neuve_pour(p_compte, p_fonction, p_arguments);
END $$;
REVOKE ALL ON FUNCTION public.vavi_agent_pour(UUID, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vavi_agent_pour(UUID, TEXT, JSONB) TO service_role;

-- Chaque minute : les heures dues deviennent des courses (une seule en attente par agent) ; vavi n'est appelé que s'il
-- y a à faire. Rend vrai s'il y a à faire.
CREATE OR REPLACE FUNCTION public.vavi_le_tic(p_adresse TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  a_faire BOOLEAN;
BEGIN
  WITH dus AS (
    UPDATE public.vavi_agents_reveils v SET prochain = public.vavi_prochain_reveil(v.reveil, now())
    FROM (SELECT projet, agent, prochain FROM public.vavi_agents_reveils
          WHERE reveil ->> 'type' = 'horaire' AND prochain <= now() FOR UPDATE SKIP LOCKED) d
    WHERE v.projet = d.projet AND v.agent = d.agent
    RETURNING v.projet, v.agent, d.prochain AS du
  )
  INSERT INTO public.vavi_agents_courses (projet, agent, declencheur)
  SELECT dus.projet, dus.agent, jsonb_build_object('type', 'horaire', 'a', dus.du) FROM dus
  WHERE NOT EXISTS (SELECT 1 FROM public.vavi_agents_courses c WHERE c.projet = dus.projet AND c.agent = dus.agent AND c.fini_le IS NULL);
  DELETE FROM public.vavi_agents_courses WHERE fini_le < now() - interval '30 days';
  SELECT EXISTS (SELECT 1 FROM public.vavi_agents_courses WHERE fini_le IS NULL
    AND (pris_le IS NULL OR pris_le < now() - interval '5 minutes')) INTO a_faire;
  IF a_faire AND p_adresse IS NOT NULL AND EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = 'net') THEN
    EXECUTE 'SELECT net.http_post(url := $1, body := ''{}''::jsonb, timeout_milliseconds := 290000)' USING p_adresse;
  END IF;
  RETURN a_faire;
END $$;
REVOKE ALL ON FUNCTION public.vavi_le_tic(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vavi_le_tic(TEXT) TO service_role;

-- Une course à faire, prise pour un serveur seul ; null : rien à faire. Une course prise deux fois sans fin est dite arrêtée.
CREATE OR REPLACE FUNCTION public.vavi_prendre_une_course()
RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  c public.vavi_agents_courses;
  r public.vavi_agents_reveils;
BEGIN
  UPDATE public.vavi_agents_courses SET fini_le = now(), ok = false,
    erreur = 'the run was stopped before its end, twice (the vavi server restarted)'
  WHERE fini_le IS NULL AND essais >= 2 AND pris_le < now() - interval '5 minutes';
  LOOP
    UPDATE public.vavi_agents_courses SET pris_le = now(), essais = essais + 1
    WHERE id = (SELECT id FROM public.vavi_agents_courses
                WHERE fini_le IS NULL AND essais < 2 AND (pris_le IS NULL OR pris_le < now() - interval '5 minutes')
                ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED)
    RETURNING * INTO c;
    IF c.id IS NULL THEN RETURN NULL; END IF;
    SELECT * INTO r FROM public.vavi_agents_reveils WHERE projet = c.projet AND agent = c.agent;
    IF r.projet IS NOT NULL THEN
      RETURN jsonb_build_object('id', c.id, 'projet', c.projet, 'agent', c.agent, 'declencheur', c.declencheur, 'ia_par_jour', r.ia_par_jour, 'reveil', r.reveil);
    END IF;
    UPDATE public.vavi_agents_courses SET fini_le = now(), ok = false, erreur = 'the published version no longer declares this agent' WHERE id = c.id;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.vavi_prendre_une_course() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vavi_prendre_une_course() TO service_role;

CREATE OR REPLACE FUNCTION public.vavi_finir_une_course(p_id BIGINT, p_issue JSONB)
RETURNS BOOLEAN
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
  WITH f AS (
    UPDATE public.vavi_agents_courses SET fini_le = now(), ok = coalesce((p_issue ->> 'ok')::boolean, false),
      resultat = left(p_issue ->> 'resultat', 4000), erreur = left(p_issue ->> 'erreur', 2000), journal = p_issue -> 'journal',
      ia = (p_issue ->> 'ia')::integer, operations = (p_issue ->> 'operations')::integer, duree_ms = (p_issue ->> 'duree_ms')::integer
    WHERE id = p_id AND fini_le IS NULL RETURNING 1)
  SELECT EXISTS (SELECT 1 FROM f);
$$;
REVOKE ALL ON FUNCTION public.vavi_finir_une_course(BIGINT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vavi_finir_une_course(BIGINT, JSONB) TO service_role;

-- Les projets déjà publiés : leurs agents inscrits dès maintenant.
DO $deja$
DECLARE p UUID;
BEGIN
  FOR p IN SELECT id FROM public.vavi_projets WHERE apercu_empreinte IS NOT NULL LOOP
    BEGIN
      PERFORM public.vavi_poser_les_reveils(p);
    EXCEPTION WHEN others THEN
      RAISE WARNING 'vavi : les réveils des agents de % ne sont pas posés : %', p, SQLERRM;
    END;
  END LOOP;
END $deja$;

-- Le tic de chaque minute, là où la base les sait (Supabase : pg_cron et pg_net).
DO $tic$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_available_extensions WHERE name = 'pg_cron')
     AND EXISTS (SELECT 1 FROM pg_catalog.pg_available_extensions WHERE name = 'pg_net') THEN
    CREATE EXTENSION IF NOT EXISTS pg_net;
    CREATE EXTENSION IF NOT EXISTS pg_cron;
    PERFORM cron.schedule('vavi-reveil-des-agents', '* * * * *', $$SELECT public.vavi_le_tic('https://www.vavi.dev/api/agents/tic')$$);
  ELSE
    RAISE WARNING 'vavi : pg_cron ou pg_net absent, les agents ne se réveillent pas seuls';
  END IF;
END $tic$;
NOTIFY pgrst, 'reload schema';
