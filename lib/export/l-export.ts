/**
 * L'EXPORT D'UN PROJET — ce que la personne emporte, tel quel, pour héberger son app ailleurs. Réservé aux offres payantes
 * (décision du 24/11) ; l'essai et le compte en pause ne l'ont pas (les données personnelles, elles, se téléchargent
 * toujours par « Mes données », `lib/conformite`).
 *   · `lePeutExporter` — l'offre du compte le permet-elle ?
 *   · `lArchive` — le code construit (les fichiers de Claude et le cadre, octet pour octet, rien de réécrit), le SQL de la
 *     base dérivé d'app.json, le socle de vavi qu'elle appelle (le relais sous la RLS), les données, et un LISEZ-MOI qui
 *     dit honnêtement ce qui part et ce qui reste chez vavi ;
 *   · `leZip` — l'archive en zip (deflate, `node:zlib`).
 * Les fichiers déposés (pièces jointes des lignes, coffre) partent aussi, octet pour octet, sous `fichiers/` (Antoine,
 * 27/11 : avant, ils restaient chez vavi) ; au-delà de `OCTETS_DES_FICHIERS_EXPORTES`, ceux qui ne tiennent pas sont
 * comptés et dits dans le LISEZ-MOI, jamais tus.
 *
 * Remplace, pour vavi, `lib/bascule/exporter-l-arbre.ts` de constructor-v13 (le zip de l'arbre seul, jsZip) et l'export
 * Docker Compose de l'ancien générateur (`lib/export/monorepo-generator.ts`), qui réécrivait les fichiers.
 */
import { crc32, deflateRawSync } from 'node:zlib';
import type { EtatDeLAbonnement } from '@/lib/abonnements/les-offres';

export const lePeutExporter = (e: EtatDeLAbonnement): boolean => e.etat === 'actif' || e.etat === 'grace';

export interface CeQuiSExporte {
  readonly nom: string;
  readonly schema: string;
  /** L'arbre construit (`lArbreDUnProjet(...).construit`). */
  readonly code: ReadonlyMap<string, string>;
  /** Le SQL de la base, dans l'ordre où il se pose (`sqlDeLaBase`). */
  readonly base: readonly { readonly nom: string; readonly sql: string }[];
  readonly socle: string;
  /** Les lignes de chaque table ; `null` : je n'ai pas pu les lire (dit dans le LISEZ-MOI, jamais un tableau vide). */
  readonly donnees: Readonly<Record<string, readonly unknown[]>> | null;
  /** Les fichiers déposés, à leur chemin dans le stockage (`pieces/…`, `coffres/…`) ; `null` : je n'ai pas pu les lire. */
  readonly fichiers?: ReadonlyMap<string, Uint8Array> | null;
  /** Les fichiers laissés hors de l'archive faute de place. */
  readonly fichiersLaisses?: number;
  readonly le: string;
}

/** Ce que l'archive emporte de fichiers déposés, au plus (l'archive se fait en mémoire du serveur). */
export const OCTETS_DES_FICHIERS_EXPORTES = 500 * 1024 * 1024;

const net = (n: string) => n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 40) || 'app';

/** PURE — les fichiers de l'archive, chacun à son chemin. */
export function lArchive(x: CeQuiSExporte): Map<string, string | Uint8Array> {
  const f = new Map<string, string | Uint8Array>();
  for (const [chemin, texte] of x.code) f.set(`code/${chemin.replace(/^\/+/, '')}`, texte);
  f.set('base/00-le-socle-de-vavi.sql', x.socle);
  x.base.forEach((g, i) => f.set(`base/${String(i + 1).padStart(2, '0')}-${net(g.nom)}.sql`, `-- ${g.nom}\n${g.sql}\n`));
  if (x.donnees) for (const [table, lignes] of Object.entries(x.donnees)) f.set(`donnees/${net(table)}.json`, `${JSON.stringify(lignes, null, 2)}\n`);
  for (const [chemin, octets] of x.fichiers ?? []) {
    const propre = chemin.split('/').filter((m) => m && m !== '.' && m !== '..').join('/');
    if (propre) f.set(`fichiers/${propre}`, octets);
  }
  f.set('LISEZ-MOI.md', [
    `# ${x.nom}, exporté de vavi le ${x.le.slice(0, 10)}`, '',
    'Ce dossier contient tout ce qu’il faut pour faire tourner cette app chez un autre hébergeur.', '',
    '- `code/` : le code de l’app, tel qu’il est construit sur vavi, sans rien de réécrit. `npm install` puis `npm run build` donnent le site dans `code/dist`.',
    `- \`base/\` : la base, à poser dans l’ordre sur un projet Supabase (éditeur SQL). \`00\` est le socle que l’app appelle ; avant la suite, exécute \`create schema ${x.schema}; grant all on schema ${x.schema} to service_role;\`, puis pose les autres fichiers dans l’ordre.`,
    x.donnees ? '- `donnees/` : les lignes de chaque table, en JSON.' : '- `donnees/` : ABSENT. Les données n’ont pas pu être lues au moment de l’export. Relance l’export.',
    x.fichiers === null ? '- `fichiers/` : ABSENT. Les fichiers déposés n’ont pas pu être lus au moment de l’export. Relance l’export.'
      : x.fichiers && x.fichiers.size > 0 ? `- \`fichiers/\` : les ${x.fichiers.size} fichier(s) déposé(s) (pièces jointes des lignes, coffre), à leur chemin de stockage, celui que la colonne \`fichier\` d’une ligne nomme. Recopie-les dans des seaux privés \`pieces\` et \`coffres\` de ton projet Supabase, au même chemin.${x.fichiersLaisses ? ` ATTENTION : ${x.fichiersLaisses} fichier(s) n’ont pas tenu dans l’archive ; demande-les à info@vavi.dev.` : ''}`
        : '- `fichiers/` : aucun fichier déposé dans ce projet.', '',
    '## Brancher l’app sur sa base', '',
    'Ajoute dans `code/dist/index.html`, au début de `<head>` :', '',
    '```html',
    `<script>window.__SUPABASE_URL__="https://<ton-projet>.supabase.co";window.__SUPABASE_ANON_KEY__="<clé anon>";window.__DATABASE_SCHEMA__="${x.schema}";window.__VAVI_BASENAME__="/";</script>`,
    '```', '',
    '## Ce qui reste chez vavi', '',
    '- Les comptes des utilisateurs : ils devront se réinscrire (les mots de passe ne s’exportent jamais).',
    '- Les paiements Stripe, les formulaires jugés, les courriels et SMS envoyés par la plateforme : ils passent par vavi et ne fonctionnent plus hors de vavi sans un serveur qui les remplace.',
    '- Les secrets (clés API) : jamais dans un export. Repose-les chez le nouvel hébergeur.', '',
  ].join('\n'));
  return f;
}

/** Le zip des fichiers (méthode deflate), sans dépendance. */
export function leZip(fichiers: ReadonlyMap<string, string | Uint8Array>): Uint8Array {
  const locaux: Buffer[] = []; const centraux: Buffer[] = [];
  let decalage = 0;
  for (const [chemin, contenu] of fichiers) {
    const nom = Buffer.from(chemin, 'utf8'); const brut = typeof contenu === 'string' ? Buffer.from(contenu, 'utf8') : Buffer.from(contenu); const serre = deflateRawSync(brut);
    const crc = crc32(brut);
    const entete = Buffer.alloc(30); entete.writeUInt32LE(0x04034b50, 0); entete.writeUInt16LE(20, 4); entete.writeUInt16LE(0x0800, 6); entete.writeUInt16LE(8, 8);
    entete.writeUInt32LE(0, 10); entete.writeUInt32LE(crc, 14); entete.writeUInt32LE(serre.length, 18); entete.writeUInt32LE(brut.length, 22); entete.writeUInt16LE(nom.length, 26); entete.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(8, 10);
    central.writeUInt32LE(0, 12); central.writeUInt32LE(crc, 16); central.writeUInt32LE(serre.length, 20); central.writeUInt32LE(brut.length, 24); central.writeUInt16LE(nom.length, 28);
    central.writeUInt32LE(decalage, 42);
    locaux.push(entete, nom, serre); centraux.push(central, nom);
    decalage += 30 + nom.length + serre.length;
  }
  const taille = centraux.reduce((n, b) => n + b.length, 0);
  const fin = Buffer.alloc(22); fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(fichiers.size, 8); fin.writeUInt16LE(fichiers.size, 10); fin.writeUInt32LE(taille, 12); fin.writeUInt32LE(decalage, 16);
  return new Uint8Array(Buffer.concat([...locaux, ...centraux, fin]));
}

/** Les données de chaque table du schéma, lues par la plateforme (`vavi_exporter_les_donnees`). */
export const CHEMIN_DE_LA_MIGRATION_DE_L_EXPORT = 'supabase/migrations/20261124239000_l_export.sql';
export const SQL_DE_L_EXPORT = String.raw`
CREATE OR REPLACE FUNCTION public.vavi_exporter_les_donnees(p_schema TEXT)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_table TEXT;
  v_lignes JSONB;
  v JSONB := '{}'::jsonb;
BEGIN
  IF p_schema IS NULL OR p_schema !~ '^app_[a-z0-9_]{1,59}$' THEN RAISE EXCEPTION 'export : schéma refusé' USING ERRCODE = '22023'; END IF;
  FOR v_table IN SELECT t.table_name::text FROM information_schema.tables t WHERE t.table_schema = p_schema AND t.table_type = 'BASE TABLE' ORDER BY 1 LOOP
    EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) FROM (SELECT * FROM %I.%I LIMIT 100000) x', p_schema, v_table) INTO v_lignes;
    v := v || jsonb_build_object(v_table, v_lignes);
  END LOOP;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.vavi_exporter_les_donnees(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vavi_exporter_les_donnees(TEXT) TO service_role;
NOTIFY pgrst, 'reload schema';
`;

/** PURE — le texte de la migration. */
export function laMigrationDeLExport(): string {
  return ['-- L\'EXPORT — écrite par scripts/ecrire-la-migration-du-socle.ts depuis lib/export/l-export.ts.',
    '-- Ne pas modifier à la main : modifier la source, puis relancer le script.', SQL_DE_L_EXPORT.trim(), ''].join('\n');
}
