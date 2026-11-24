/**
 * Le build de l'app. Deux ajouts à Vite : les faits des pages (`src/lib/faits.ts`), servis à l'app par le module
 * `virtual:faits` et écrits dans le build (`faits.json`) pour la plateforme, une déclaration illisible arrêtant le build ;
 * l'emplacement de chaque texte écrit dans un écran (`src/lib/textes-situes.ts`), que l'aperçu désigne ; et la tête de
 * l'accueil écrite dans `index.html` (titre, description, image de partage de `src/referencement.json`), lue sans JS par
 * les moteurs et les aperçus de lien ; les autres pages la posent en s'ouvrant (`src/lib/referencement.ts`).
 */
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { faitsDeLApp } from './src/lib/faits';
import { poserLesTextesSitues } from './src/lib/textes-situes';

const SRC = fileURLToPath(new URL('./src', import.meta.url));
const PAGES = join(SRC, 'pages');

function pagesDe(dossier: string): string[] {
  if (!existsSync(dossier)) return [];
  return readdirSync(dossier, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? pagesDe(join(dossier, e.name)) : e.name.endsWith('.tsx') ? [join(dossier, e.name)] : []));
}

function lesFaits(): Plugin {
  const ID = 'virtual:faits';
  const RESOLU = `\0${ID}`;
  const lire = () => faitsDeLApp(pagesDe(PAGES).map((f) => ({
    fichier: relative(PAGES, f).split('\\').join('/'), source: readFileSync(f, 'utf8'),
  })));
  return {
    name: 'faits-des-pages',
    resolveId: (id) => (id === ID ? RESOLU : null),
    load(id) {
      if (id !== RESOLU) return null;
      for (const f of pagesDe(PAGES)) this.addWatchFile(f);
      return `export default ${JSON.stringify(lire())};`;
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'faits.json', source: `${JSON.stringify(lire(), null, 2)}\n` });
    },
  };
}

function lesTextesSitues(): Plugin {
  const RACINE = dirname(SRC);
  return {
    name: 'textes-situes',
    enforce: 'pre',
    transform(code, id) {
      if (id.includes('?') || !id.startsWith(SRC) || !id.endsWith('.tsx')) return null;
      const pose = poserLesTextesSitues(code, relative(RACINE, id).split('\\').join('/'));
      return pose === null ? null : { code: pose, map: null };
    },
  };
}

function laTeteDeLAccueil(): Plugin {
  const html = (t: string) => t.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return {
    name: 'tete-de-l-accueil',
    transformIndexHtml(page) {
      const chemin = join(SRC, 'referencement.json');
      const ref = (existsSync(chemin) ? JSON.parse(readFileSync(chemin, 'utf8')) : {}) as { pages?: Record<string, { titre?: string; description?: string }>; image?: string };
      const choisi = ref.pages?.['/'] ?? {};
      let tete = page;
      if (choisi.titre) tete = tete.replace(/<title>[^<]*<\/title>/, `<title>${html(choisi.titre)}</title>`);
      if (choisi.description) tete = tete.replace(/(<meta name="description" content=")[^"]*(")/, `$1${html(choisi.description)}$2`);
      const titre = /<title>([^<]*)<\/title>/.exec(tete)?.[1] ?? '';
      const description = /<meta name="description" content="([^"]*)"/.exec(tete)?.[1] ?? '';
      const og = [`<meta property="og:title" content="${titre}" />`, `<meta property="og:description" content="${description}" />`,
        ...(ref.image ? [`<meta property="og:image" content="${html(ref.image)}" />`] : [])];
      return tete.replace('</head>', `    ${og.join('\n    ')}\n  </head>`);
    },
  };
}

export default defineConfig({
  plugins: [lesTextesSitues(), react(), tailwindcss(), lesFaits(), laTeteDeLAccueil()],
  resolve: { alias: { '@': SRC } },
});
