/**
 * LE NAVIGATEUR INTÉGRÉ D'UNE APP (Antoine, 28/11 : des visites de www.vavi.dev venues de Facebook, aucun compte créé).
 * Un lien ouvert dans Facebook, Instagram, Messenger, LinkedIn, TikTok… s'ouvre dans le navigateur intégré de l'app, pas
 * dans celui du téléphone. Google y refuse toute connexion (« Erreur 403 : disallowed_useragent », sa règle pour les vues
 * web intégrées) : « Continuer avec Google » y menait à une impasse. Ce qu'il remplace : un bouton Google montré partout,
 * même là où il ne peut pas aboutir. La page dit où l'on est et propose ce qui marche : ouvrir la page dans le navigateur
 * du téléphone, ou recevoir le lien par e-mail (le lien du courriel marche dans n'importe quel navigateur). PUR.
 */

/** Les marques des navigateurs intégrés dans le User-Agent, et le nom de l'app à dire. */
const LES_APPS: readonly (readonly [RegExp, string])[] = [
  [/FBAN\/Messenger|FB_IAB\/MESSENGER|MessengerForiOS|\bOrca-Android\b/i, 'Messenger'],
  [/Instagram/i, 'Instagram'],
  [/\bFBAN\/|\bFBAV\/|\bFB_IAB\/|\bFBIOS\b|\bFB4A\b/i, 'Facebook'],
  [/\bThreads\b|Barcelona/i, 'Threads'],
  [/LinkedInApp/i, 'LinkedIn'],
  [/musical_ly|BytedanceWebview|\bTikTok\b|\btrill_/i, 'TikTok'],
  [/Snapchat/i, 'Snapchat'],
  [/Pinterest/i, 'Pinterest'],
  [/\bLine\//, 'LINE'],
  [/Twitter for|TwitterAndroid/i, 'X'],
  [/MicroMessenger/i, 'WeChat'],
];

export interface NavigateurIntegre { readonly app: string | null; readonly android: boolean }

/** PURE — le navigateur est-il celui, intégré, d'une app (et laquelle si elle se dit) ? `null` : un vrai navigateur. */
export function leNavigateurIntegre(ua: string): NavigateurIntegre | null {
  const android = /Android/i.test(ua);
  for (const [motif, app] of LES_APPS) if (motif.test(ua)) return { app, android };
  // Une vue web Android sans nom d'app (« ; wv) ») : Google la refuse de la même façon.
  if (android && /;\s*wv\)/.test(ua)) return { app: null, android };
  return null;
}

/**
 * PURE — l'adresse qui rouvre la page dans le navigateur du téléphone, quand le système en offre une : sur Android, un
 * lien `intent:` (le navigateur par défaut prend l'adresse ; s'il n'en a pas, il reste sur celle-ci). Sur iPhone, aucune
 * adresse ne sort du navigateur intégré à coup sûr : `null`, la page dit le geste (menu ⋯ > Ouvrir dans le navigateur).
 */
export function lAdresseDansLeNavigateur(adresse: string, n: NavigateurIntegre): string | null {
  if (!n.android) return null;
  let u: URL;
  try { u = new URL(adresse); } catch { return null; }
  if (u.protocol !== 'https:') return null;
  const repli = encodeURIComponent(u.href);
  return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=https;action=android.intent.action.VIEW;S.browser_fallback_url=${repli};end`;
}
