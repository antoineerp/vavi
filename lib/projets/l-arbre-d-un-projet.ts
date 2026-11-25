/**
 * L'ARBRE D'UN PROJET — ce que Claude a écrit (gardé par `lib/projets`) plus ce que la plateforme en dérive.
 *
 * Le stockage ne garde que app.json et les fichiers de Claude. Les fichiers figés (gabarit, types des tables, jetons de
 * la peau) sont posés à chaque lecture depuis app.json : jamais stockés, ils ne peuvent pas dériver de leur source, et
 * une app reçoit le squelette du jour à son prochain build. L'arbre construit est ce que l'app TIRE (`ceQueLAppTire`) ;
 * son empreinte désigne le build, et c'est elle que `publish` compare. PUR à la lecture du gabarit près.
 */
import { lireLeManifeste, type Manifeste } from '@/lib/backend/app/manifeste';
import { ceQueLAppTire, poserLeFige } from '@/squelette/poser';
import { estFige, POSES_PAR_UN_OUTIL } from '@/squelette/registre';
import { empreinteDeLArbre } from '@/lib/projets/les-empreintes';
import { CHEMIN_DES_PAQUETS, lePackageJsonAvec, lesPaquetsAjoutes } from '@/lib/paquets/les-paquets';

export type ArbreDUnProjet =
  | { readonly lu: true; readonly manifeste: Manifeste; readonly fige: ReadonlyMap<string, string>; readonly construit: ReadonlyMap<string, string>; readonly empreinte: string }
  | { readonly lu: false; readonly erreurs: readonly string[] };

/** Lit app.json tel qu'il est stocké : il est entré par `configure_backend`, donc valide ; sinon on le dit. */
export function leManifesteStocke(texte: string | undefined): { readonly lu: true; readonly manifeste: Manifeste } | { readonly lu: false; readonly erreurs: readonly string[] } {
  if (texte === undefined) return { lu: false, erreurs: ['the project has no app.json'] };
  let json: unknown;
  try { json = JSON.parse(texte); } catch { return { lu: false, erreurs: ['app.json is not valid JSON'] }; }
  const r = lireLeManifeste(json);
  return r.ok ? { lu: true, manifeste: r.manifeste } : { lu: false, erreurs: r.erreurs };
}

export function lArbreDUnProjet(stockes: ReadonlyMap<string, string>): ArbreDUnProjet {
  const m = leManifesteStocke(stockes.get('app.json'));
  if (!m.lu) return m;
  const fige = poserLeFige(m.manifeste);
  // Les fichiers de Claude, puis le figé par-dessus : un chemin du cadre est toujours celui que la plateforme pose.
  const complet = new Map([...stockes].filter(([c]) => !estFige(c)));
  for (const [c, t] of fige) complet.set(c, t);
  // Ce que la plateforme pose pour la personne (son référencement, ses photos : « Gérer le contenu ») prend la place du
  // fichier vide du gabarit ; Claude ne l'écrit jamais (`estFige` le lui refuse).
  for (const c of POSES_PAR_UN_OUTIL) { const t = stockes.get(c); if (t !== undefined) complet.set(c, t); }
  // Les paquets que Claude a ajoutés (`add_packages`, vérifiés au registre) s'ajoutent au package.json du gabarit.
  const pj = complet.get('package.json');
  if (pj !== undefined) complet.set('package.json', lePackageJsonAvec(pj, lesPaquetsAjoutes(stockes.get(CHEMIN_DES_PAQUETS))));
  const construit = ceQueLAppTire(complet, m.manifeste);
  return { lu: true, manifeste: m.manifeste, fige, construit, empreinte: empreinteDeLArbre(construit) };
}

/** Ce qu'il faut écrire et retirer pour que l'arbre stocké redevienne `cible` (rollback, abandon). PURE. */
export function lEcartVers(actuel: ReadonlyMap<string, string>, cible: ReadonlyMap<string, string>): { readonly ecrits: Map<string, string>; readonly supprimes: string[] } {
  const ecrits = new Map([...cible].filter(([c, t]) => actuel.get(c) !== t));
  const supprimes = [...actuel.keys()].filter((c) => !cible.has(c));
  return { ecrits, supprimes };
}
