/**
 * LA RECETTE REJOUÉE PAR VAVI (Antoine, 27/11 : « automatique + bouton ») — les parcours du cahier (`src/recette.json`,
 * `lib/parcours/le-cahier.ts`) joués l'un après l'autre sur le build vert de la version courante, par le même navigateur
 * que `try_journey`, sans aucun modèle. Déclenchée après chaque aperçu vert (en arrière-plan) et par le bouton
 * « Rejouer la recette » de la console. Le passage (et la capture de chaque arrêt) est gardé dans le magasin des builds ;
 * la console le montre, l'état du projet le rend à Claude, qui corrige ce qui casse.
 *
 * Un passage à la fois par projet. Rien ne bloque : un parcours rouge est un fait dit (« livrer et dire »).
 */
import { lArbreLu } from '@/lib/projets/le-gabarit-du-projet';
import { CHEMIN_DU_CAHIER, lireLeCahier, type ParcoursJoue, type PassageDeLaRecette } from '@/lib/parcours/le-cahier';
import { laLigne } from '@/lib/parcours/le-parcours';
import type { Magasin } from '@/lib/publication/le-magasin';
import type { Contexte } from './les-gestes';

const racine = (projet: string): string => `recettes/${projet}`;
export const cleDuPassage = (projet: string): string => `${racine(projet)}/dernier.json`;
export const cleDeLaCapture = (projet: string, empreinte: string, i: number): string => `${racine(projet)}/${empreinte}/${i}.jpg`;

const EN_COURS = new Set<string>();
/** Un passage resté « en cours » plus longtemps (le serveur a redémarré) ne compte plus comme en cours. */
const EN_COURS_AU_PLUS_MS = 15 * 60_000;

async function poser(m: Magasin, p: PassageDeLaRecette, projet: string): Promise<void> {
  await m.poser(cleDuPassage(projet), Buffer.from(JSON.stringify(p)), { type: 'application/json', cache: 'no-store' });
}

/** Le dernier passage de la recette d'un projet ; `null` : jamais joué ; une exception : le magasin n'a pas répondu. */
export async function leDernierPassage(m: Magasin, projet: string): Promise<PassageDeLaRecette | null> {
  const o = await m.lire(cleDuPassage(projet));
  if (o === 'absent') return null;
  const p = JSON.parse(o.octets.toString('utf8')) as PassageDeLaRecette;
  return p.etat === 'en_cours' && Date.now() - Date.parse(p.le) > EN_COURS_AU_PLUS_MS
    ? { ...p, etat: 'injoue', raison: 'the run was interrupted (the server restarted): play it again' } : p;
}

/**
 * Joue la recette du projet et garde son passage. Rend le passage, ou `null` quand il n'y a rien à jouer (pas de cahier,
 * un passage déjà en cours).
 */
export async function jouerLaRecette(c: Contexte, projet: string, declenche: PassageDeLaRecette['declenche']): Promise<PassageDeLaRecette | null> {
  const m = c.magasin;
  if (!m || EN_COURS.has(projet)) return null;
  const f = await c.projets.fichiers(c.compte, projet);
  if (!f.lu) return null;
  const arbre = await lArbreLu(f.valeur, m);
  const cahier = lireLeCahier(f.valeur.get(CHEMIN_DU_CAHIER), arbre.lu ? arbre.manifeste.roles.map((r) => r.nom) : []);
  if (!cahier.lu && cahier.absent) return null;
  const le = new Date().toISOString();
  const empreinte = arbre.lu ? arbre.empreinte : '';
  const injoue = async (raison: string): Promise<PassageDeLaRecette> => {
    const p: PassageDeLaRecette = { etat: 'injoue', empreinte, le, parcours: [], raison, declenche };
    await poser(m, p, projet);
    return p;
  };
  if (!cahier.lu) return injoue(`${CHEMIN_DU_CAHIER} does not hold: ${cahier.erreurs.join(' | ')}`);
  if (!arbre.lu) return injoue(`app.json does not hold: ${arbre.erreurs.join(' | ')}`);
  const b = await c.projets.leBuild(c.compte, projet, arbre.empreinte);
  if (!b.lu || !b.valeur?.vert) return injoue('the current version has no green build: build the preview first');
  if (!c.jouer) return injoue('journeys are not available on this vavi server');
  EN_COURS.add(projet);
  try {
    await poser(m, { etat: 'en_cours', empreinte, le, parcours: [], declenche }, projet);
    const joues: ParcoursJoue[] = [];
    for (const [i, x] of cahier.parcours.entries()) {
      const r = await c.jouer(projet, arbre.empreinte, arbre.manifeste, x.etapes, { copie: x.copie, role: x.role })
        .catch((e: unknown) => ({ raison: String((e as Error)?.message ?? e).slice(0, 300) }));
      if ('raison' in r) { joues.push({ nom: x.nom, role: x.role, ok: false, reussies: 0, total: x.etapes.length, arret: null, capture: null, injoue: r.raison }); continue; }
      const arret = r.arret ? r.etapes.find((e) => e.n === r.arret!.n) ?? null : null;
      let capture: string | null = null;
      if (r.arret?.capture) {
        capture = cleDeLaCapture(projet, arbre.empreinte, i);
        await m.poser(capture, r.arret.capture, { type: 'image/jpeg', cache: 'no-store' }).catch(() => { capture = null; });
      }
      joues.push({ nom: x.nom, role: x.role, ok: r.arret === null, reussies: r.etapes.filter((e) => e.ok).length, total: x.etapes.length,
        arret: arret ? { n: arret.n, etape: arret.etape || laLigne(x.etapes[arret.n - 1]!), pourquoi: arret.fait, adresse: arret.adresse } : null, capture });
    }
    const p: PassageDeLaRecette = { etat: 'joue', empreinte, le, parcours: joues, declenche };
    await poser(m, p, projet);
    console.log(`[recette] ${projet.slice(0, 8)} ${joues.filter((x) => x.ok).length}/${joues.length} parcours (${declenche})`);
    return p;
  } finally {
    EN_COURS.delete(projet);
  }
}
