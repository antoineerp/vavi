/**
 * LE PUBLIC D'UNE PAGE ET SES TABLES (Antoine, 26/11, « Refonte qui fait quoi ») — une page déclare qui l'ouvre
 * (`PUBLIC`, `COMPTE`, `reserveA(…)`), chaque table déclare qui la lit et l'écrit (`acces`) : les deux se croisent ici.
 * Une page qui lit une table que son public ne lit pas montre une liste vide à chacun de lui ; une page qui écrit une
 * table où son public n'a aucun geste rend un refus à chaque envoi ; une page réservée à un rôle que l'app n'a pas ne
 * s'ouvre pour personne.
 *
 * Ce qu'il remplace : rien ne croisait les deux déclarations (essai Yokono du 26/11 : la carte, page publique, lisait
 * une table que personne ne lisait ; Claude l'a vu en essayant l'app, après coup). Ce n'est pas un refus (une
 * modification ne se refuse pas, Antoine 25/11) : la liste revient à Claude avec le build vert, chaque écart avec ce qui
 * le lève, et il corrige au tour.
 *
 * Les tables lues sont celles qu'une page ou un fichier qu'elle importe (de Claude) nomme en toutes lettres :
 * `useLecture('t')`, `table="t"` (`<Lignes>`, les sections), `useEcriture('t')`. Un nom calculé n'est jamais jugé. PUR.
 */
import { TOUS, INSCRITS, quiFait } from '@/lib/backend/app/les-acces';
import { rolesQuiGerent, seLitSansCompte, type Manifeste } from '@/lib/backend/app/manifeste';
import { lAdresseDeLaPage } from './les-liens';
import { lesImportsDe } from './poser';

export interface EcartDeDroit { readonly page: string; readonly fait: string; readonly geste: string }

type Public = { readonly nature: 'public' } | { readonly nature: 'compte' } | { readonly nature: 'role'; readonly roles: readonly string[] };

/** L'accès que la page déclare en toutes lettres ; absent : publique (`src/lib/acces.ts`) ; une autre forme : `null`. */
export function lePublicDeLaPage(source: string): Public | null {
  const v = /export\s+const\s+acces\s*(?::[^=]+)?=\s*([^;\n]+)/.exec(source)?.[1]?.trim();
  if (!v || v === 'PUBLIC') return { nature: 'public' };
  if (v === 'COMPTE') return { nature: 'compte' };
  const m = /^reserveA\(([^)]*)\)$/.exec(v);
  const roles = m?.[1]?.split(',').map((r) => /^\s*['"]([a-z][a-z0-9_]*)['"]\s*$/.exec(r)?.[1] ?? null) ?? [];
  return m && roles.length && roles.every((r) => r !== null) ? { nature: 'role', roles: roles as string[] } : null;
}

const LECTURES = [/\buseLecture\s*(?:<[^>]*>)?\(\s*['"]([a-z][a-z0-9_]*)['"]/g, /\btable\s*=\s*\{?\s*['"]([a-z][a-z0-9_]*)['"]/g];
const ECRITURES = [/\buseEcriture\s*(?:<[^>]*>)?\(\s*['"]([a-z][a-z0-9_]*)['"]/g];
const noms = (texte: string, motifs: readonly RegExp[]): string[] => motifs.flatMap((r) => [...texte.matchAll(r)].map((x) => x[1]!));

/** Les fichiers de Claude qu'une page atteint par ses imports, elle comprise. */
function ceQueLaPageAtteint(page: string, siens: ReadonlyMap<string, string>): string[] {
  const vus = new Set([page]);
  const file = [page];
  while (file.length) {
    const c = file.pop()!;
    for (const cible of lesImportsDe(c, siens.get(c) ?? '', (x) => siens.has(x))) if (!vus.has(cible)) { vus.add(cible); file.push(cible); }
  }
  return [...vus];
}

const liste = (xs: readonly string[]) => xs.map((x) => `\`${x}\``).join(', ');

export function lesEcartsDeDroit(m: Pick<Manifeste, 'tables' | 'roles' | 'organisations'>, siens: ReadonlyMap<string, string>): readonly EcartDeDroit[] {
  const roles = m.roles.map((r) => r.nom);
  const gerent = rolesQuiGerent(m);
  const ecarts: EcartDeDroit[] = [];
  for (const [page, source] of siens) {
    if (lAdresseDeLaPage(page) === null) continue;
    const pub = lePublicDeLaPage(source);
    if (!pub) continue; // une forme illisible : le build la refuse déjà
    const inconnus = pub.nature === 'role' ? pub.roles.filter((r) => !roles.includes(r)) : [];
    if (inconnus.length) {
      ecarts.push({ page, fait: `reserved to ${liste(inconnus)}, a role app.json does not declare: nobody opens it`,
        geste: `Reserve it to declared roles (${liste(roles)}), or declare the role in app.json.` });
    }
    const qui = pub.nature === 'public' ? [] : pub.nature === 'compte' ? roles : pub.roles.filter((r) => roles.includes(r));
    const atteint = ceQueLaPageAtteint(page, siens).map((c) => siens.get(c) ?? '').join('\n');
    const lues = new Set(noms(atteint, LECTURES)), ecrites = new Set(noms(atteint, ECRITURES));
    for (const t of m.tables) {
      if (lues.has(t.nom)) {
        if (pub.nature === 'public') {
          if (!seLitSansCompte(m.tables, t)) {
            ecarts.push({ page, fait: `a public page that reads \`${t.nom}\`, which nobody without an account reads: a visitor sees it empty`,
              geste: `Add \`${TOUS}\` to \`acces.lire\` of \`${t.nom}\`${t.parent ? ` and of \`${t.parent}\`` : ''} if everyone may read it, or reserve the page (\`export const acces = COMPTE\` or \`reserveA(…)\`).` });
          }
        } else if (!seLitSansCompte(m.tables, t)) {
          const auteurs = new Set([...quiFait(t, 'creation', gerent)]);
          const sans = qui.filter((r) => !t.lecture.includes(r) && !auteurs.has(r));
          if (sans.length) {
            ecarts.push({ page, fait: `opened by ${liste(sans)}, who do${sans.length > 1 ? '' : 'es'} not read \`${t.nom}\`: they see it empty`,
              geste: `Add ${sans.length === roles.length && roles.length > 1 ? `\`${INSCRITS}\`` : liste(sans)} to \`acces.lire\` of \`${t.nom}\`, or reserve the page to those who read it (${liste(t.lecture.filter((r) => roles.includes(r)))}).` });
          }
        }
      }
      if (ecrites.has(t.nom) && pub.nature !== 'public') {
        const font = new Set(['creation', 'modification', 'suppression'].flatMap((g) => quiFait(t, g as 'creation', gerent)));
        const sans = qui.filter((r) => !font.has(r));
        if (sans.length) {
          ecarts.push({ page, fait: `opened by ${liste(sans)}, who can neither create, change nor delete a row of \`${t.nom}\`: every save is refused`,
            geste: `Add them to \`acces.creer\`, \`acces.modifier\` or \`acces.supprimer\` of \`${t.nom}\`, or reserve the page to those who write it.` });
        }
      }
    }
  }
  return ecarts.sort((a, b) => a.page.localeCompare(b.page));
}
