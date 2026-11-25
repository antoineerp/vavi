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
});
