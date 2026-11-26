/** INCIDENT 25/11 (doc « Les règles réelles ») : le guide demandait des liens vers des pages qui existent, rien ne le
 * vérifiait. Le lien mort est trouvé à son fichier et sa ligne ; une adresse de page, du cadre, de public/ ou une ancre
 * écrite passe. */
import { describe, expect, it } from 'vitest';
import { lAdresseDeLaPage, lesLiensMorts } from '@/squelette/les-liens';

describe('les adresses des pages', () => {
  it('se dérivent comme le routeur les dérive', () => {
    expect(lAdresseDeLaPage('src/pages/index.tsx')).toBe('/');
    expect(lAdresseDeLaPage('src/pages/tarifs.tsx')).toBe('/tarifs');
    expect(lAdresseDeLaPage('src/pages/blog/index.tsx')).toBe('/blog');
    expect(lAdresseDeLaPage('src/pages/blog/$id.tsx')).toBe('/blog/:id');
    expect(lAdresseDeLaPage('src/pages/404.tsx')).toBeNull();
    expect(lAdresseDeLaPage('src/Chrome.tsx')).toBeNull();
  });
});

describe('les liens morts', () => {
  const fichiers = new Map([
    ['src/pages/index.tsx', '<section id="contact" />\n<a href="/tarifs">x</a>\n<Link to="/equipe">y</Link>\n<a href="#contact">c</a>\n<a href="#avis">d</a>'],
    ['src/pages/tarifs.tsx', '<a href="/blog/42">b</a> <a href="/mentions-legales">m</a> <a href="/cv.pdf">cv</a> <a href="https://ailleurs.fr/x">e</a>'],
    ['src/pages/blog/$id.tsx', "navigate('/'); navigate('/inconnue'); <a href={`/blog/${id}`}>z</a> <a href=\"/#contact\">c</a> <a href=\"mailto:a@b.c\">m</a>"],
    ['public/cv.pdf', ''],
  ]);
  it('sont trouvés à leur fichier et leur ligne, et seulement eux', () => {
    expect(lesLiensMorts(fichiers)).toEqual([
      { fichier: 'src/pages/index.tsx', ligne: 3, lien: '/equipe' },
      { fichier: 'src/pages/index.tsx', ligne: 5, lien: '#avis' },
      { fichier: 'src/pages/blog/$id.tsx', ligne: 1, lien: '/inconnue' },
    ]);
  });
});

describe('les adresses du cadre', () => {
  it('sont celles que le gabarit sert (porte, compte, pièces)', async () => {
    const { readdirSync, readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { ADRESSES_DU_CADRE } = await import('@/squelette/les-liens');
    const g = join(__dirname, '../../squelette/gabarit/src');
    const session = readFileSync(join(g, 'lib/session.tsx'), 'utf8');
    const attendues = [/PORTE = '([^']+)'/.exec(session)![1], /MON_COMPTE = '([^']+)'/.exec(session)![1],
      ...readdirSync(join(g, 'briques/pieces')).map((f) => `/${f.replace(/\.tsx$/, '')}`)];
    expect([...ADRESSES_DU_CADRE].sort()).toEqual(attendues.sort());
  });
});
