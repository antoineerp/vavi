/**
 * « Essayer en tant que » : à un compte qui porte plusieurs rôles (le propriétaire les porte tous), le choix d'en garder
 * un seul pour voir l'app comme ce rôle la voit, et le bandeau qui le rappelle sur chaque page. La base ne fait que
 * retirer des rôles (`lib/supabase.ts`) : rien ne s'ouvre ainsi qui ne l'était déjà.
 */
import { useEffect } from 'react';
import { APP } from '../lib/app';
import { unAutreRoleQuiOuvre, type Acces } from '../lib/acces';
import { useLecture } from '../lib/donnees';
import { langueCourante } from '../lib/langue';
import { libellesPour } from '../lib/libelles';
import { useSession } from '../lib/session';
import { essayerEnTantQue, roleEssaye } from '../lib/supabase';
import { Button } from '../ui/button';
import { AccesRefuse, Patience } from './etats';

const libelleDuRole = (nom: string): string => APP.roles.find((r) => r.nom === nom)?.libelle ?? nom;

/** Le choix du rôle essayé, dans « Mon compte ». Ne rend rien à un compte d'un seul rôle. */
export function EssaiDeRole() {
  const L = libellesPour(langueCourante());
  const { compte } = useSession();
  const miens = useLecture('membres', { egal: { compte_id: compte?.id ?? '' } });
  const roles = miens.forme === 'donnee' ? [...new Set(miens.donnee.lignes.map((m) => m.role))].sort() : [];
  if (!compte || roles.length < 2) return null;
  const essaye = roleEssaye();
  return (
    <section data-cadre="essai-de-role" className="space-y-3">
      <h2 className="text-xl font-semibold">{L.essayerEnTantQue}</h2>
      <div className="flex flex-wrap gap-2">
        {roles.map((r) => (
          <Button key={r} type="button" variant={essaye === r ? 'default' : 'outline'} aria-pressed={essaye === r} onClick={() => essayerEnTantQue(r)}>
            {libelleDuRole(r)}
          </Button>
        ))}
        <Button type="button" variant={essaye === null ? 'default' : 'outline'} aria-pressed={essaye === null} onClick={() => essayerEnTantQue(null)}>
          {L.tousMesRoles}
        </Button>
      </div>
    </section>
  );
}

/**
 * Le bandeau du rôle sous lequel l'onglet voit l'app, en haut de chaque page, monté par le cadre : le rôle, et un geste
 * vers chacun des autres que le compte porte. Un compte de plusieurs rôles entre sous un seul (`roleParDefaut`).
 */
export function BandeauDEssai() {
  const L = libellesPour(langueCourante());
  const { compte } = useSession();
  const miens = useLecture('membres', { egal: { compte_id: compte?.id ?? '' } });
  const essaye = roleEssaye();
  if (!essaye || !compte) return null;
  const autres = miens.forme === 'donnee' ? [...new Set(miens.donnee.lignes.map((m) => m.role))].filter((r) => r !== essaye).sort() : [];
  return (
    <div role="status" data-cadre="essai-en-cours" className="flex flex-wrap items-center justify-center gap-3 border-b border-bordure bg-surface px-4 py-2 text-sm">
      <span>{L.vousEssayez.replace('{role}', `« ${libelleDuRole(essaye)} »`)}</span>
      {autres.length > 0 ? <span className="text-muted-foreground">{L.essayerEnTantQue} :</span> : null}
      {autres.map((r) => (
        <button key={r} type="button" onClick={() => essayerEnTantQue(r)} className="font-medium underline underline-offset-4">{libelleDuRole(r)}</button>
      ))}
      <button type="button" onClick={() => essayerEnTantQue(null)} className="font-medium underline underline-offset-4">{L.revenirATousMesRoles}</button>
    </div>
  );
}

/**
 * Un écran fermé au rôle sous lequel l'onglet voit l'app, qu'un autre rôle du compte ouvre (le propriétaire les porte
 * tous) : l'onglet passe sous ce rôle et l'écran s'ouvre. Sinon, l'écran reste fermé, dit.
 * Ce qu'il remplace (interdit 9) : « Cet écran ne vous est pas ouvert » au concepteur, qui porte pourtant le rôle.
 */
export function EcranDUnAutreRole({ acces }: { readonly acces: Acces }) {
  const { compte } = useSession();
  const miens = useLecture('membres', { egal: { compte_id: compte?.id ?? '' } });
  const essaye = roleEssaye();
  const autre = miens.forme === 'donnee' ? unAutreRoleQuiOuvre(acces, miens.donnee.lignes.map((m) => m.role), essaye) : null;
  useEffect(() => { if (essaye && autre) essayerEnTantQue(autre); }, [essaye, autre]);
  if (essaye && miens.forme === 'attente') return <Patience />;
  return essaye && autre ? <Patience /> : <AccesRefuse />;
}
