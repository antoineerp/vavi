/**
 * UN SECRET N'ENTRE PAS DANS LE CODE (garde-fou 6 du cahier du 24/11) : clés secrètes de paiement, jetons `service_role`,
 * clés privées, clés d'API de modèles et de fournisseurs, fichiers `.env`. Cherché dans chaque fichier qu'écrit Claude,
 * puis une seconde fois dans le `dist` avant qu'il ne soit servi. La valeur trouvée n'est JAMAIS répétée : on dit la sorte
 * de clé, le fichier et la ligne. PUR.
 *
 * Neuf dans vavi.
 */
interface Motif { readonly sorte: string; readonly motif: RegExp }

const MOTIFS: readonly Motif[] = [
  { sorte: 'Stripe secret key', motif: /\b(?:sk|rk)_(?:live|test)_[0-9A-Za-z]{10,}/ },
  { sorte: 'Stripe webhook secret', motif: /\bwhsec_[0-9A-Za-z]{16,}/ },
  { sorte: 'private key', motif: /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/ },
  { sorte: 'Anthropic API key', motif: /\bsk-ant-[0-9A-Za-z_-]{20,}/ },
  { sorte: 'OpenAI API key', motif: /\bsk-(?:proj-)?[0-9A-Za-z_-]{32,}/ },
  { sorte: 'AWS access key', motif: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { sorte: 'GitHub token', motif: /\b(?:ghp|gho|ghs|ghu|github_pat)_[0-9A-Za-z_]{20,}/ },
  { sorte: 'Slack token', motif: /\bxox[abprs]-[0-9A-Za-z-]{10,}/ },
  { sorte: 'Resend API key', motif: /\bre_[0-9A-Za-z]{8,}_[0-9A-Za-z]{16,}/ },
  { sorte: 'SendGrid API key', motif: /\bSG\.[0-9A-Za-z_-]{16,}\.[0-9A-Za-z_-]{16,}/ },
];

const JWT = /\beyJ[0-9A-Za-z_-]{8,}\.(eyJ[0-9A-Za-z_-]{8,})\.[0-9A-Za-z_-]{8,}/g;

/** Un JWT dont la charge dit `service_role` : la clé qui passe la RLS de toute la base. */
function jetonDeService(texte: string): number | null {
  for (const m of texte.matchAll(JWT)) {
    try {
      const charge = JSON.parse(Buffer.from(m[1]!, 'base64url').toString('utf8')) as { role?: unknown };
      if (charge.role === 'service_role') return m.index ?? 0;
    } catch { /* un faux JWT n'est pas un secret de service */ }
  }
  return null;
}

export interface SecretTrouve { readonly sorte: string; readonly ligne: number }

const ligneDe = (texte: string, index: number): number => texte.slice(0, index).split('\n').length;

/**
 * Un exemple à remplir n'est pas une clé (audit du 25/11) : `sk-ant-xxxxxxxxxxxxxxxxxxxxxxxx`, `sk_test_XXXXXXXXXXXX`, le
 * texte d'aide d'un champ où la personne colle SA clé. Une vraie clé est tirée au hasard : passé son préfixe, elle compte
 * bien plus de 8 signes différents.
 */
const estUnExemple = (cle: string): boolean => new Set(cle.replace(/^[a-z]+[-_](?:[a-z]+[-_])?/i, '').replace(/[-_]/g, '')).size <= 8;

/** Le premier secret d'un texte, sa sorte et sa ligne ; `null` s'il n'y en a pas. */
export function unSecretDans(texte: string): SecretTrouve | null {
  let premier: SecretTrouve & { index: number } | null = null;
  for (const { sorte, motif } of MOTIFS) {
    const tous = new RegExp(motif.source, 'g');
    for (const m of texte.matchAll(tous)) {
      if (sorte !== 'private key' && estUnExemple(m[0])) continue;
      if (!premier || m.index! < premier.index) premier = { sorte, ligne: ligneDe(texte, m.index!), index: m.index! };
      break;
    }
  }
  const service = jetonDeService(texte);
  if (service !== null && (!premier || service < premier.index)) premier = { sorte: 'Supabase service_role key', ligne: ligneDe(texte, service), index: service };
  return premier ? { sorte: premier.sorte, ligne: premier.ligne } : null;
}

/** Un chemin qui ne doit jamais être écrit : un fichier d'environnement. */
export const estUnFichierDEnvironnement = (chemin: string): boolean => /(^|\/)\.env(\.|$)/.test(chemin);
