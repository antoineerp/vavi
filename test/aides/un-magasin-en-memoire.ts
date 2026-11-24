/** Un magasin d'objets en mémoire, qui garde l'ordre des écritures ; `panne` le fait ne plus répondre. */
import type { Magasin, Objet } from '@/lib/publication/le-magasin';

export function unMagasinEnMemoire(): Magasin & { readonly objets: Map<string, Objet>; readonly ecrits: string[]; panne: boolean } {
  const objets = new Map<string, Objet>();
  const ecrits: string[] = [];
  const m = {
    objets, ecrits, panne: false,
    async poser(cle: string, octets: Buffer, o: { type: string; meta?: Readonly<Record<string, string>> }) {
      if (m.panne) throw new Error('panne'); ecrits.push(cle); objets.set(cle, { octets, type: o.type, meta: o.meta ?? {} });
    },
    async tete(cle: string) { if (m.panne) throw new Error('panne'); const o = objets.get(cle); return o ? { taille: o.octets.length, meta: o.meta } : 'absent' as const; },
    async lire(cle: string) { if (m.panne) throw new Error('panne'); return objets.get(cle) ?? 'absent' as const; },
  };
  return m;
}
