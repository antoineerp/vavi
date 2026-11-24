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
});
