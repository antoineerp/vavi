/**
 * LES FORMES RÉPARÉES (Antoine, 26/11, revue complète : « ce sont des erreurs récurrentes ») — ce que Claude écrit
 * spontanément pour app.json et que la grammaire refusait, alors que le sens ne fait aucun doute : il est relu dans les
 * mots de vavi, et chaque relecture est dite. Ce qui reste ambigu (une couleur, un rôle nommé `visiteur`) est toujours
 * refusé, avec ce qui le lève.
 *
 * Ce qu'il remplace : un refus par forme (rôles en chaînes, `email` pour type, une police hors liste, un nom avec des
 * majuscules ou des accents, `langues: "fr"`…), chacun coûtant un aller-retour à Claude et un « Erreur » à la personne.
 * Règle de vavi : réparer plutôt que refuser (Antoine, 25/11). PURE.
 */
import { NOMS_DES_POLICES } from '../fige/polices';

interface Brut { [cle: string]: unknown }
const objet = (x: unknown): x is Brut => Boolean(x) && typeof x === 'object' && !Array.isArray(x);

/** Un nom écrit en mots (« Demandes de devis ») en identifiant (`demandes_de_devis`) ; `null` : rien à en tirer. */
export function enIdentifiant(x: string): string | null {
  const s = x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^[0-9_]+/, '').slice(0, 41);
  return s || null;
}

const TYPES: Readonly<Record<string, string>> = {
  text: 'texte', string: 'texte', email: 'texte', courriel: 'texte', mail: 'texte', telephone: 'texte', tel: 'texte', phone: 'texte', url: 'texte', lien: 'texte',
  textarea: 'texte_long', long_text: 'texte_long', longtext: 'texte_long', paragraphe: 'texte_long', message: 'texte_long',
  number: 'nombre', float: 'nombre', decimal: 'nombre', integer: 'entier', int: 'entier',
  money: 'montant', price: 'montant', prix: 'montant', currency: 'montant',
  boolean: 'booleen', bool: 'booleen', checkbox: 'booleen', oui_non: 'booleen',
  datetime: 'date_heure', timestamp: 'date_heure', date_time: 'date_heure',
  select: 'choix', enum: 'choix', liste: 'choix', file: 'fichier', photo: 'image', picture: 'image', relation: 'reference', ref: 'reference',
};
const SERIFS = new Set(['Fraunces', 'Playfair Display', 'Newsreader', 'Lora', 'EB Garamond', 'Cormorant']);

export function lesFormesReparees(json: unknown): { readonly valeur: unknown; readonly repare: readonly string[] } {
  if (!objet(json)) return { valeur: json, repare: [] };
  const repare: string[] = [];
  const dire = (m: string) => { repare.push(m); };
  const j: Brut = { ...json };

  if (typeof j.langues === 'string') { dire(`\`langues\` lu comme { principale: "${j.langues}" }`); j.langues = { principale: j.langues, autres: [] }; }

  // Les rôles : un nom seul devient un rôle ; l'app a toujours le rôle de son propriétaire.
  if (Array.isArray(j.roles)) {
    j.roles = j.roles.map((r) => {
      if (typeof r !== 'string') return r;
      const nom = enIdentifiant(r) ?? 'role';
      const obtenu = /^(proprietaire|owner|admin|gerant|administrateur)$/.test(nom) ? 'proprietaire' : 'invitation';
      dire(`le rôle « ${r} » lu comme { nom: "${nom}", obtenu: "${obtenu}" }`);
      return { nom, libelle: r, obtenu };
    });
  }
  const roles = Array.isArray(j.roles) ? j.roles.filter(objet) : [];
  // Seulement quand l'app a des rôles, ou qu'une table nomme le propriétaire ou reçoit ce qu'un visiteur envoie (il le
  // reçoit) : un site sans compte reste sans compte.
  const mots = (x: unknown): string[] => (Array.isArray(x) ? x : typeof x === 'string' ? [x] : []).map((v) => String(v).toLowerCase());
  const leVeulent = (Array.isArray(j.tables) ? j.tables : []).some((t) => objet(t) && objet(t.acces) && Object.entries(t.acces).some(([g, v]) =>
    mots(v).some((m) => /^(proprietaire|owner|admin|gerant|administrateur)$/.test(m) || (/^(creer|insert|create)$/.test(g) && /^(tous|public|anyone|everyone|all|visiteur|anon)$/.test(m)))));
  if ((roles.length > 0 || leVeulent) && !roles.some((r) => r.obtenu === 'proprietaire')) {
    dire('l’app a toujours le rôle de son propriétaire : `proprietaire` ajouté aux `roles`');
    j.roles = [{ nom: 'proprietaire', libelle: 'Propriétaire', obtenu: 'proprietaire' }, ...(Array.isArray(j.roles) ? j.roles : [])];
  }

  // Les polices hors de la liste : la plus proche de sa famille.
  if (objet(j.direction) && objet(j.direction.polices)) {
    const p: Brut = { ...j.direction.polices };
    for (const cle of ['titres', 'texte'] as const) {
      const v = p[cle];
      if (typeof v !== 'string' || (NOMS_DES_POLICES as readonly string[]).includes(v)) continue;
      const exacte = NOMS_DES_POLICES.find((n) => n.toLowerCase() === v.trim().toLowerCase());
      const remplace = exacte ?? (/serif|garamond|playfair|merriweather|georgia|times|baskerville|libre|crimson|cormorant|spectral|bodoni/i.test(v) && !/sans/i.test(v) ? 'Fraunces' : cle === 'titres' && SERIFS.has(String(p.texte)) ? 'Fraunces' : 'Inter');
      dire(`la police « ${v} » n’est pas livrée par vavi : ${remplace} à la place`);
      p[cle] = remplace;
    }
    j.direction = { ...j.direction, polices: p };
  }

  // Les demandes écrites comme une phrase seule.
  if (Array.isArray(j.demandes) && j.demandes.some((d) => typeof d === 'string')) {
    dire('`demandes` : une phrase seule ne nomme pas ce qui la tient : retirée');
    j.demandes = j.demandes.filter((d) => typeof d !== 'string');
  }

  // Les tables et leurs champs : noms en identifiants, libellé manquant, type écrit autrement, choix sans valeurs.
  if (Array.isArray(j.tables)) {
    const renommees = new Map<string, string>();
    for (const t of j.tables) {
      if (!objet(t) || typeof t.nom !== 'string' || /^[a-z][a-z0-9_]{0,40}$/.test(t.nom)) continue;
      const nom = enIdentifiant(t.nom);
      if (nom) renommees.set(t.nom, nom);
    }
    j.tables = j.tables.map((t) => {
      if (!objet(t)) return t;
      const x: Brut = { ...t };
      if (typeof x.nom === 'string' && renommees.has(x.nom)) {
        dire(`la table « ${x.nom} » nommée \`${renommees.get(x.nom)}\``);
        if (typeof x.libelle !== 'string') x.libelle = x.nom;
        x.nom = renommees.get(x.nom);
      }
      if (typeof x.parent === 'string' && renommees.has(x.parent)) x.parent = renommees.get(x.parent);
      if (typeof x.libelle !== 'string' && typeof x.nom === 'string') x.libelle = x.nom;
      if (Array.isArray(x.champs)) {
        x.champs = x.champs.map((c) => {
          if (!objet(c)) return c;
          const y: Brut = { ...c };
          if (typeof y.nom === 'string' && !/^[a-z][a-z0-9_]{0,40}$/.test(y.nom)) {
            const nom = enIdentifiant(y.nom);
            if (nom) { dire(`le champ « ${y.nom} » de ${String(x.nom)} nommé \`${nom}\``); if (typeof y.libelle !== 'string') y.libelle = y.nom; y.nom = nom; }
          }
          const ici = `${String(x.nom)}.${String(y.nom)}`;
          if (typeof y.libelle !== 'string' && typeof y.nom === 'string') { y.libelle = y.nom; dire(`${ici} : sans libellé, son nom sert de libellé`); }
          if (typeof y.type === 'string' && TYPES[y.type.toLowerCase()]) {
            const type = TYPES[y.type.toLowerCase()]!;
            dire(`${ici} : le type « ${y.type} » lu comme \`${type}\``);
            y.type = type;
          }
          if (typeof y.table === 'string' && renommees.has(y.table)) y.table = renommees.get(y.table);
          if (y.type === 'choix' && (!Array.isArray(y.valeurs) || y.valeurs.length === 0)) {
            dire(`${ici} : un choix sans valeurs devient un \`texte\``);
            y.type = 'texte';
            delete y.valeurs;
          }
          if (typeof y.obligatoire !== 'boolean') y.obligatoire = false;
          return y;
        });
      }
      return x;
    });
    if (Array.isArray(j.ecrans) && renommees.size) {
      j.ecrans = j.ecrans.map((e) => (objet(e) && Array.isArray(e.montre) ? { ...e, montre: e.montre.map((m) => (typeof m === 'string' ? renommees.get(m) ?? m : m)) } : e));
    }
  }
  return repare.length ? { valeur: j, repare } : { valeur: json, repare: [] };
}
