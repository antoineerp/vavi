/**
 * Les états que toute app sait rendre : attente, panne, adresse inconnue, page en panne, accès refusé.
 * Chacun porte `data-etat`, que la vérification lit ; elle ne reconnaît jamais un écran à sa prose.
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { libellesPour } from '../lib/libelles';
import { langueCourante } from '../lib/langue';

const L = () => libellesPour(langueCourante());

function Cadre({ etat, role, children }: { etat: string; role: 'status' | 'alert'; children: ReactNode }) {
  return (
    <div data-etat={etat} role={role} className="grid min-h-[40vh] place-items-center p-8">
      <div className="max-w-md space-y-3 text-center">{children}</div>
    </div>
  );
}

export function Patience({ quoi }: { quoi?: string }) {
  return <Cadre etat="patience" role="status"><p className="text-sm text-sur-fond-attenue">{quoi ?? L().chargement}…</p></Cadre>;
}

export function Panne({ quoi, detail }: { quoi: string; detail?: string }) {
  return (
    <Cadre etat="panne" role="alert">
      <p className="font-medium">{quoi}</p>
      {detail ? <p className="text-sm text-sur-fond-attenue">{detail}</p> : null}
    </Cadre>
  );
}

function Retour({ reessayer }: { reessayer?: () => void }) {
  return (
    <p className="flex flex-wrap justify-center gap-4 text-sm">
      <Link to="/" className="underline underline-offset-4">{L().revenirALAccueil}</Link>
      {reessayer ? <button type="button" onClick={reessayer} className="underline underline-offset-4">{L().reessayer}</button> : null}
    </p>
  );
}

export function Introuvable() {
  return <Cadre etat="introuvable" role="alert"><p className="font-medium">{L().adresseInconnue}</p><p className="text-sm">{L().verifieLeLien}</p><Retour /></Cadre>;
}

export function PageEnPanne({ reessayer }: { reessayer?: () => void }) {
  return <Cadre etat="page-en-panne" role="alert"><p className="font-medium">{L().pageEnPanne}</p><p className="text-sm">{L().pageEnPanneDetail}</p><Retour reessayer={reessayer} /></Cadre>;
}

export function AccesRefuse() {
  return <Cadre etat="acces-refuse" role="alert"><p className="font-medium">{L().ecranFerme}</p><p className="text-sm">{L().ecranFermeDetail}</p><Retour /></Cadre>;
}

export function RolesIllisibles({ relire }: { relire: () => void }) {
  return <Cadre etat="roles-illisibles" role="alert"><p className="font-medium">{L().rolesIllisibles}</p><button type="button" onClick={relire} className="text-sm underline">{L().reessayer}</button></Cadre>;
}
