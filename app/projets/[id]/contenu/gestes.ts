'use server';
/**
 * Les gestes de « Gérer le contenu » : l'apparence et le référencement, changés par la personne (`lib/contenus/le-contenu.ts`),
 * puis l'aperçu rebâti sans modèle, comme pour un texte réécrit. Le résultat revient à la page par son adresse.
 */
import { redirect } from 'next/navigation';
import { laConsole } from '@/app/_partage/la-console';
import { construireLApercu as batir, estUnRefus } from '@/lib/mcp/les-gestes';
import { leContexteReel } from '@/lib/mcp/le-contexte-reel';
import { changerLApparence, changerLeReferencement, changerUneImage, COULEURS, RAYONS, type Apparence, type Changement } from '@/lib/contenus/le-contenu';
import { banqueDeLaPlateforme } from '@/lib/images/la-banque';

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HEX = /^#[0-9a-fA-F]{6}$/;

async function lesDependances(id: string) {
  const c = await laConsole(`/projets/${id}/contenu`);
  return { compte: c.compte, projets: c.projets, construire: async (projet: string) => {
    const ctx = await leContexteReel(c.compte);
    const b = await batir(ctx.outils, { project: projet });
    if (estUnRefus(b)) return { vert: false as const, detail: b.code };
    const designe = await c.projets.publierLApercu(c.compte, projet, String(b.fingerprint));
    return designe.lu ? { vert: true as const } : { vert: false as const, detail: designe.pourquoi };
  } };
}

const retour = (id: string, r: Changement, quoi: string, ecran = 'contenu'): never => redirect(`/projets/${id}/${ecran}?${new URLSearchParams(r.change
  ? { fait: quoi, apercu: r.apercu } : { erreur: r.pourquoi, ...(r.detail ? { detail: r.detail.slice(0, 300) } : {}) })}`);

export async function enregistrerLApparence(id: string, f: FormData) {
  if (!ID.test(id)) redirect('/projets');
  const couleurs = Object.fromEntries(COULEURS.map((k) => [k, String(f.get(k) ?? '')])) as Apparence['couleurs'];
  const rayon = String(f.get('rayon') ?? '') as Apparence['rayon'];
  if (COULEURS.some((k) => !HEX.test(couleurs[k])) || !RAYONS.includes(rayon)) retour(id, { change: false, pourquoi: 'mal_forme', detail: 'couleur ou arrondi' }, 'apparence');
  const r = await changerLApparence(await lesDependances(id), id, { couleurs, rayon, polices: { titres: String(f.get('titres') ?? ''), texte: String(f.get('texte') ?? '') } });
  if (r.change) console.log(`[contenu] ${id.slice(0, 8)} apparence (version ${r.version}, aperçu ${r.apercu})`);
  retour(id, r, 'apparence');
}

export async function enregistrerLeReferencement(id: string, f: FormData) {
  if (!ID.test(id)) redirect('/projets');
  const pages: Record<string, { titre: string; description: string }> = {};
  for (const adresse of f.getAll('adresse').map(String).slice(0, 200)) {
    pages[adresse] = { titre: String(f.get(`titre:${adresse}`) ?? ''), description: String(f.get(`description:${adresse}`) ?? '') };
  }
  const r = await changerLeReferencement(await lesDependances(id), id, pages);
  if (r.change) console.log(`[contenu] ${id.slice(0, 8)} référencement (version ${r.version}, aperçu ${r.apercu})`);
  retour(id, r, 'referencement');
}

const NOM_DE_PHOTO = /^[A-Za-z0-9_-]{1,60}$/;
const SUJET = (f: FormData) => String(f.get('sujet') ?? '').trim().slice(0, 120);

/** « Remplacer… » : les photos de la banque pour ce que la personne décrit, montrées sur la page à choisir. */
export async function chercherDesPhotos(id: string, nom: string, f: FormData) {
  if (!ID.test(id) || !NOM_DE_PHOTO.test(nom)) redirect('/projets');
  const sujet = SUJET(f);
  redirect(`/projets/${id}/gerer?${new URLSearchParams(sujet ? { photo: nom, sujet } : { erreur: 'mal_forme', detail: 'dites ce que la photo doit montrer' })}#photo-${nom}`);
}

/** La photo choisie remplace celle posée sous ce nom ; l'aperçu est rebâti. Elle est relue dans la banque, jamais prise de l'adresse. */
export async function choisirUnePhoto(id: string, nom: string, f: FormData) {
  if (!ID.test(id) || !NOM_DE_PHOTO.test(nom)) redirect('/projets');
  const banque = banqueDeLaPlateforme();
  const sujet = SUJET(f), source = String(f.get('source') ?? '');
  const trouvee = banque && sujet ? (await banque.chercher(sujet, 8, new Set()).catch(() => [])).find((x) => x.source === source) : undefined;
  if (!banque || !trouvee) retour(id, { change: false, pourquoi: 'mal_forme', detail: 'cette photo n’est plus proposée : relancez la recherche' }, 'photo', 'gerer');
  const r = await changerUneImage(await lesDependances(id), id, nom, trouvee!, String(f.get('alt') ?? ''));
  if (r.change) { await banque!.signaler(trouvee!); console.log(`[contenu] ${id.slice(0, 8)} photo ${nom} (version ${r.version}, aperçu ${r.apercu})`); }
  retour(id, r, 'photo', 'gerer');
}
