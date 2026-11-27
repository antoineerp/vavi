/**
 * LE LIEN DE CONNEXION REÇU PAR COURRIEL pointe vers vavi, plus vers Supabase (Antoine, 27/11 : le courriel arrivait dans
 * les spams ; un courriel de vavi.dev dont le lien part vers supabase.co est un signal de filtre). Le modèle du courriel,
 * collé dans Supabase, envoie sur la page d'où la personne a demandé le lien, l'empreinte du jeton après `#vavi_lien=` :
 *   <a href="{{ .RedirectTo }}#vavi_lien={{ .TokenHash }}">
 * La page la vérifie (`verifyOtp`, type `email`) et ouvre la session. Ce qu'il remplace : `{{ .ConfirmationURL }}`, qui
 * passait par l'adresse de Supabase. Le fragment ne part jamais au serveur ni dans les journaux.
 */
export const MODELE_DU_LIEN = '{{ .RedirectTo }}#vavi_lien={{ .TokenHash }}';

/** PURE — l'empreinte du jeton portée par le fragment d'adresse, ou `null`. */
export function leJetonDuLien(fragment: string): string | null {
  const m = /(?:^#|&)vavi_lien=([A-Za-z0-9_-]{10,200})(?:&|$)/.exec(fragment);
  return m ? m[1]! : null;
}

/** Le courriel à coller dans Supabase (Authentication > Emails > Templates : « Magic Link » et « Confirm signup »). */
export const LE_COURRIEL_DU_LIEN = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0b1220">
  <p style="font-size:20px;font-weight:700;margin:0 0 16px">vavi</p>
  <p style="margin:0 0 16px">Bonjour,<br>Voici votre lien pour entrer dans vavi. Il ne sert qu’une fois et expire dans une heure.</p>
  <p style="margin:0 0 24px"><a href="${MODELE_DU_LIEN}" style="display:inline-block;background:#22d3ee;color:#0b1220;font-weight:700;padding:12px 20px;border-radius:10px;text-decoration:none">Entrer dans vavi</a></p>
  <p style="margin:0 0 24px;color:#5b6475;font-size:14px">Hello, here is your link to sign in to vavi. It works once and expires in one hour. <a href="${MODELE_DU_LIEN}" style="color:#0e7490">Sign in</a></p>
  <p style="margin:0;color:#5b6475;font-size:13px">Vous n’avez rien demandé ? Ignorez ce message, rien ne change. · Didn’t ask for this? Just ignore it.</p>
</div>
`;
