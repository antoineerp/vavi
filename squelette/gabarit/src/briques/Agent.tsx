/**
 * L'écran d'un agent d'app.json : la personne dit ce qu'il doit chercher, la plateforme le fait tourner (il lit, va
 * chercher, calcule), puis il rend sa conclusion et ce qu'il a fait, étape par étape. Ses propositions sont enregistrées
 * dans leur table, marquées « ia » et à valider : la liste de cette table, montrée à côté, se relit à son retour.
 * Seuls les rôles qui le lancent voient cet écran ; la base vérifie de nouveau leurs droits à chaque lecture.
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

interface Course {
  readonly conclusion: string;
  readonly etapes: readonly { readonly tool: string; readonly args: unknown; readonly ok: boolean }[];
  readonly fil: string;
}

export function Agent({ nom }: { readonly nom: NomDAgent }) {
  const L = libellesPour(langueCourante());
  const { roles } = useSession();
  const [demande, setDemande] = useState('');
  const [etat, setEtat] = useState<{ readonly enCours: boolean; readonly course: Course | null; readonly refus: string | null }>({ enCours: false, course: null, refus: null });
  const agent = APP.agents.find((a) => a.nom === nom);
  if (!agent || !agent.par.some((r) => roles.includes(r))) return null;

  const lancer = async () => {
    setEtat({ enCours: true, course: null, refus: null });
    const r = await appelerLaPlateforme<Course>('agents/<projet>/run', { agent: nom, demande, ...(etat.course ? { fil: etat.course.fil } : {}) });
    if (r.forme === 'refus') { setEtat({ enCours: false, course: null, refus: `${r.raison} ${r.geste}` }); return; }
    setEtat({ enCours: false, course: r.donnee, refus: null });
    void clientDesLectures.invalidateQueries({ queryKey: ['base'] });
  };
  const libelleDe = (table: unknown): string => APP.tables.find((t) => t.nom === table)?.libelle ?? '';
  const dite = (e: Course['etapes'][number]): string => {
    const a = (e.args ?? {}) as { table?: unknown; url?: unknown };
    const fait = e.tool === 'lire' ? L.agentALu.replace('{x}', libelleDe(a.table)) : e.tool === 'lire_une_page' ? L.agentALaPage.replace('{x}', String(a.url ?? ''))
      : e.tool === 'proposer' ? L.agentAProposeDans.replace('{x}', libelleDe(agent.propose)) : e.tool === 'chercher_des_entreprises' ? L.agentACherche : L.agentACalcule;
    return e.ok ? fait : `${fait} (${L.agentRefus})`;
  };
  const proposees = etat.course?.etapes.filter((e) => e.tool === 'proposer' && e.ok).length ?? 0;

  return (
    <section data-agent={nom} className="space-y-3">
      <label className="block space-y-1 text-sm">
        <span>{L.agentDemande}</span>
        <textarea value={demande} onChange={(e) => setDemande(e.target.value)} rows={3} maxLength={4000}
          className="w-full rounded-lg border border-bordure bg-fond p-2" />
      </label>
      <Button type="button" disabled={etat.enCours || !demande.trim()} onClick={() => void lancer()}>{etat.enCours ? L.agentTravaille : L.lancerLAgent}</Button>
      {etat.refus ? <p role="alert" className="text-sm">{etat.refus}</p> : null}
      {etat.course ? (
        <div role="status" className="space-y-2 rounded-lg border border-bordure bg-surface p-3 text-sm">
          <p className="whitespace-pre-line">{etat.course.conclusion}</p>
          {proposees > 0 ? <p className="font-medium">{L.agentAPropose.replace('{n}', String(proposees))}</p> : null}
          <details>
            <summary className="cursor-pointer">{L.ceQueLAgentAFait}</summary>
            <ol className="mt-1 list-decimal space-y-0.5 pl-5">
              {etat.course.etapes.map((e, i) => <li key={i}>{dite(e)}</li>)}
            </ol>
          </details>
        </div>
      ) : null}
    </section>
  );
}
