/**
 * Le bouton d'un agent d'app.json dont le réveil est `bouton` : la personne dit ce qu'elle veut (facultatif), la plateforme
 * fait tourner son code (`src/agents/<nom>.ts`) avec ses droits à elle, puis rend ce qu'il conclut et son journal. Seuls
 * les rôles de `reveil.par` voient ce bouton ; la base vérifie de nouveau leurs droits à chaque lecture et écriture.
 */
import { useState } from 'react';
import type { NomDAgent } from '../donnees/types';
import { APP } from '../lib/app';
import { clientDesLectures } from '../lib/donnees';
import { langueCourante } from '../lib/langue';
import { libellesPour } from '../lib/libelles';
import { appelerLaPlateforme } from '../lib/plateforme';
import { useSession } from '../lib/session';
import { Button } from '../ui/button';

interface Course { readonly resultat: string | null; readonly journal: readonly string[] }

export function Agent({ nom }: { readonly nom: NomDAgent }) {
  const L = libellesPour(langueCourante());
  const { roles } = useSession();
  const [demande, setDemande] = useState('');
  const [etat, setEtat] = useState<{ readonly enCours: boolean; readonly course: Course | null; readonly refus: string | null }>({ enCours: false, course: null, refus: null });
  const agent = APP.agents.find((a) => a.nom === nom);
  if (!agent || agent.reveil.type !== 'bouton' || !agent.reveil.par.some((r) => roles.includes(r))) return null;

  const lancer = async () => {
    setEtat({ enCours: true, course: null, refus: null });
    const r = await appelerLaPlateforme<Course>('agents/<projet>/run', { agent: nom, entree: demande });
    if (r.forme === 'refus') { setEtat({ enCours: false, course: null, refus: `${r.raison} ${r.geste}` }); return; }
    setEtat({ enCours: false, course: r.donnee, refus: null });
    void clientDesLectures.invalidateQueries({ queryKey: ['base'] });
  };

  return (
    <section data-agent={nom} className="space-y-3">
      <label className="block space-y-1 text-sm">
        <span>{L.agentDemande}</span>
        <textarea value={demande} onChange={(e) => setDemande(e.target.value)} rows={3} maxLength={4000}
          className="w-full rounded-lg border border-bordure bg-fond p-2" />
      </label>
      <Button type="button" disabled={etat.enCours} onClick={() => void lancer()}>{etat.enCours ? L.agentTravaille : L.lancerLAgent}</Button>
      {etat.refus ? <p role="alert" className="text-sm">{etat.refus}</p> : null}
      {etat.course ? (
        <div role="status" className="space-y-2 rounded-lg border border-bordure bg-surface p-3 text-sm">
          {etat.course.resultat ? <p className="whitespace-pre-line">{etat.course.resultat}</p> : null}
          {etat.course.journal.length ? (
            <details>
              <summary className="cursor-pointer">{L.ceQueLAgentAFait}</summary>
              <ol className="mt-1 list-decimal space-y-0.5 pl-5">{etat.course.journal.map((e, i) => <li key={i}>{e}</li>)}</ol>
            </details>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
