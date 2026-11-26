/**
 * Une app posée par vavi se construit : le figé dérivé d'app.json, plus ce que Claude écrit (le chrome et une page),
 * passe `tsc` et `vite build` dans l'atelier, et le build rend la page et ses faits. Sans cet essai, le gabarit copié
 * pourrait ne plus construire sans qu'aucun test le voie. Il tourne quand `VAVI_BATIR=oui` (la CI le pose).
 */
import { describe, expect, it } from 'vitest';
import { construireLApp } from '@/lib/atelier/construire';
import { ceQueLAppTire, poserLeFige } from '@/squelette/poser';
import { unManifeste } from '../aides/un-manifeste';

const CHROME = "import type { ChromeProps } from '@/briques/chrome';\nexport default function Chrome({ children }: ChromeProps) {\n  return <><header>Essai</header><main>{children}</main></>;\n}\n";
const ACCUEIL = "import { PUBLIC } from '@/lib/acces';\nexport const acces = PUBLIC;\nexport default function Accueil() {\n  return <section><h1>Bienvenue</h1><p>Une page posée par Claude.</p></section>;\n}\n";

describe.runIf(process.env.VAVI_BATIR === 'oui')('une app posée se construit', () => {
  it('l’arbre que l’app tire passe tsc puis vite build, et le build rend la page et ses faits', async () => {
    const m = unManifeste({ nature: 'site', nom: 'Essai de build' });
    const arbre = poserLeFige(m);
    arbre.set('src/Chrome.tsx', CHROME);
    arbre.set('src/pages/index.tsx', ACCUEIL);
    const c = await construireLApp(ceQueLAppTire(arbre, m));
    if (!c.construite) throw new Error(JSON.stringify(c.ecarts));
    expect(c.dist.get('index.html')!.toString()).toContain('<title>Essai de build</title>');
    expect(c.faits).not.toBeNull();
  }, 600_000);

  // 25/11 : l'IA servie par vavi, et ce que Claude fait lui-même dans la page (un PDF), compilent dans une app posée.
  it('une page qui appelle l’IA et compose un PDF dans la page se construit', async () => {
    const m = unManifeste({ nature: 'site', nom: 'Essai IA', fonctions: { ia: true } });
    const arbre = poserLeFige(m);
    arbre.set('src/Chrome.tsx', CHROME);
    arbre.set('src/pages/index.tsx', [
      "import { jsPDF } from 'jspdf';",
      "import { capacites } from '@/lib/capacites';",
      "import { PUBLIC } from '@/lib/acces';",
      'export const acces = PUBLIC;',
      'export default function Accueil() {',
      "  const resumer = async () => { const r = await capacites.ia.completer({ prompt: 'Résume' }); if (r.forme === 'donnee') new jsPDF().text(r.donnee, 10, 10).save('resume.pdf'); };",
      '  return <section><h1>Bienvenue</h1><button onClick={() => void resumer()}>Résumer</button></section>;',
      '}',
      '',
    ].join('\n'));
    const c = await construireLApp(ceQueLAppTire(arbre, m));
    if (!c.construite) throw new Error(JSON.stringify(c.ecarts));
  }, 600_000);
  // 26/11 : les sections prêtes (galerie, tarifs et avis lus en base, plan, contact, questions) se montent et se construisent.
  it('une page qui monte toutes les sections prêtes se construit', async () => {
    const m = unManifeste({ nature: 'site', nom: 'Essai sections',
      roles: [{ nom: 'gerant', libelle: 'Gérant', obtenu: 'proprietaire' }],
      tables: [
        { nom: 'formule', libelle: 'Formules', appartenance: 'publique', lecture: ['visiteur', 'gerant'], ecriture: ['gerant'],
          champs: [{ nom: 'nom', libelle: 'Nom', type: 'texte', obligatoire: true }, { nom: 'prix', libelle: 'Prix', type: 'montant', obligatoire: true }] },
        { nom: 'temoignage', libelle: 'Avis', appartenance: 'publique', lecture: ['visiteur', 'gerant'], ecriture: ['gerant'],
          champs: [{ nom: 'texte', libelle: 'Texte', type: 'texte_long', obligatoire: true }, { nom: 'signature', libelle: 'Signature', type: 'texte', obligatoire: true }, { nom: 'note', libelle: 'Note', type: 'entier' }] },
      ] });
    const arbre = poserLeFige(m);
    arbre.set('src/Chrome.tsx', CHROME);
    arbre.set('src/pages/index.tsx', [
      "import { PUBLIC } from '@/lib/acces';",
      "import { Avis, Contact, Galerie, Plan, QuestionsFrequentes, Tarifs } from '@/briques/sections';",
      'export const acces = PUBLIC;',
      'export default function Accueil() {',
      '  return (<>',
      '    <h1>Bienvenue</h1>',
      "    <Galerie titre=\"L’atelier\" photos={[{ photo: <img src=\"/a.jpg\" alt=\"a\" />, legende: 'Un' }]} />",
      "    <Tarifs table=\"formule\" titre=\"Tarifs\" formule={(l) => ({ nom: l.nom, prix: l.prix, points: ['Un'] })} />",
      "    <Avis table=\"temoignage\" titre=\"Ils en parlent\" avis={(l) => ({ texte: l.texte, auteur: l.signature, note: l.note })} />",
      "    <Plan adresse=\"1 rue de la Paix, Paris\" horaires={['Lundi : 9 h – 18 h']} />",
      "    <Contact formKey=\"contact\" titre=\"Écrivez-nous\" telephone coordonnees={{ courriel: 'a@b.fr' }} />",
      "    <QuestionsFrequentes titre=\"Questions\" questions={[{ question: 'Où ?', reponse: 'Ici.' }]} />",
      '  </>);',
      '}',
      '',
    ].join('\n'));
    const c = await construireLApp(ceQueLAppTire(arbre, m));
    if (!c.construite) throw new Error(JSON.stringify(c.ecarts));
  }, 600_000);
  // 26/11 : la fiche du compte connecté (`personnes`) se lit par `useMaFiche`, et `<FicheManquante />` se monte.
  it('une page qui lit la fiche du compte se construit', async () => {
    const m = unManifeste({ nature: 'app', nom: 'Essai fiche',
      roles: [{ nom: 'chef', libelle: 'Chef', obtenu: 'proprietaire' }, { nom: 'agent', libelle: 'Agent', obtenu: 'invitation' }],
      tables: [{ nom: 'agents', libelle: 'Agents', appartenance: 'publique', lecture: ['chef', 'agent'], ecriture: ['chef'], personnes: 'agent',
        champs: [{ nom: 'nom', libelle: 'Nom', type: 'texte', obligatoire: true }] }] });
    const arbre = poserLeFige(m);
    arbre.set('src/Chrome.tsx', CHROME);
    arbre.set('src/pages/index.tsx', [
      "import { reserveA } from '@/lib/acces';",
      "import { useMaFiche, FicheManquante } from '@/lib/ma-fiche';",
      "export const acces = reserveA('agent');",
      'export default function Accueil() {',
      "  const f = useMaFiche('agents');",
      "  if (f.forme === 'aucune') return <FicheManquante />;",
      "  return <section><h1>{f.forme === 'fiche' ? f.fiche.nom : '…'}</h1>{f.forme === 'fiche' && f.fiche.compte_id ? <p>relié</p> : null}</section>;",
      '}',
      '',
    ].join('\n'));
    const c = await construireLApp(ceQueLAppTire(arbre, m));
    if (!c.construite) throw new Error(JSON.stringify(c.ecarts));
  }, 600_000);
});
