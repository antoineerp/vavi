/** L'effacement branché sur le réel : la base de la plateforme (clé de service), le courrier de la plateforme, l'adresse publique. */
import 'server-only';
import { clientDeService } from '@/lib/supabase/service';
import { leCourrierDeLaPlateforme } from '@/lib/formulaires/sur-supabase';
import { adresseDeLaPlateforme } from '@/lib/mcp/l-adresse';
import { schemaDuProjet } from '@/lib/relais/le-schema-d-une-app';
import type { DependancesDeLEffacement } from '@/lib/conformite/l-effacement';
import { effacerLesPiecesOrphelines, GRACE_D_UN_COMPTE_QUI_PART_MIN } from '@/lib/capacites/les-pieces-orphelines';
import { lesOrphelinesReelles } from './les-fichiers-reels';
import { laPersonneDuJeton } from './les-comptes-reels';

export function lEffacementReel(): DependancesDeLEffacement {
  const base = clientDeService();
  const courrier = leCourrierDeLaPlateforme();
  return {
    secret: process.env.VAVI_CLE_DES_JETONS?.trim() || null,
    courrier: courrier ? (m) => courrier({ a: m.a, sujet: m.sujet, texte: m.texte, repondreA: null }) : null,
    adresse: adresseDeLaPlateforme(),
    maintenant: Date.now(),
    laPersonne: (jeton) => laPersonneDuJeton(jeton, null),
    async leProjet(id) {
      const schema = schemaDuProjet(id);
      if (!schema) return { lu: true, valeur: null };
      const p = await base.from('vavi_projets').select('nom').eq('id', id).maybeSingle<{ nom: string }>();
      if (p.error) return { lu: false, pourquoi: p.error.message };
      return { lu: true, valeur: p.data ? { nom: p.data.nom, schema } : null };
    },
    async effacer(schema, compte, projet) {
      const r = await base.rpc('vavi_effacer_un_compte', { p_schema: schema, p_compte: compte });
      if (r.error) return { lu: false, pourquoi: r.error.message };
      // Les pièces jointes de ses lignes effacées : la base ne les cite plus, le stockage les efface.
      const p = await effacerLesPiecesOrphelines(projet, lesOrphelinesReelles(), GRACE_D_UN_COMPTE_QUI_PART_MIN);
      if (!p.lu) console.warn(`[Effacement] ${projet.slice(0, 8)} — pièces jointes non effacées : ${p.pourquoi}`);
      const v = r.data as { effacees?: number; gardees?: number; compte_efface?: boolean };
      return { lu: true, valeur: { effacees: Number(v.effacees ?? 0), gardees: Number(v.gardees ?? 0), compteEfface: Boolean(v.compte_efface) } };
    },
  };
}
