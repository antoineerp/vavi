/**
 * Le fichier 3D d'une ligne (un champ `fichier`), dessiné en relief dans la page : la plateforme lit la pièce sous la
 * sécurité des lignes et la rend en STL, qu'elle soit un STL, un OBJ, un 3MF ou un STEP ; la personne la tourne au
 * doigt ou à la souris. Ses couleurs sont celles de la peau. Un fichier qui ne se dessine pas le dit, jamais une boîte.
 *
 * Ce qu'elle remplace (interdit 9) : la visionneuse que chaque app écrivait elle-même, qui ne lisait que le STL du
 * navigateur et, sans lui, dessinait une boîte aux dimensions mesurées à la place de la pièce.
 */
import { useEffect, useRef, useState } from 'react';
import type { PieceDe, TableAvecPiece } from '../lib/donnees';
import { recevoirDeLaPlateforme } from '../lib/plateforme';
import { libellesPour } from '../lib/libelles';
import { langueCourante } from '../lib/langue';
import { Panne, Patience } from './etats';

/** La couleur d'un jeton de la peau, en rouge-vert-bleu, quelle que soit la façon dont elle s'écrit. */
function couleurDuJeton(jeton: string, sinon: string): string {
  const toile = document.createElement('canvas');
  toile.width = 1; toile.height = 1;
  const c = toile.getContext('2d');
  const valeur = getComputedStyle(document.documentElement).getPropertyValue(jeton).trim();
  if (!c || !valeur) return sinon;
  c.fillStyle = sinon; c.fillStyle = valeur; c.fillRect(0, 0, 1, 1);
  const [r, g, b] = c.getImageData(0, 0, 1, 1).data;
  return `rgb(${r}, ${g}, ${b})`;
}

export function Piece3D<T extends TableAvecPiece>({ table, id, colonne, piece, alt, className }: {
  readonly table: T; readonly id: string; readonly colonne: PieceDe<T>;
  /** La valeur de la colonne, lue avec la ligne : sans pièce jointe, rien ne se dessine. */
  readonly piece: { readonly chemin: string } | null;
  /** Ce que la vue montre, lu à voix haute : le nom de la pièce, par exemple. */
  readonly alt: string;
  readonly className?: string;
}) {
  const L = libellesPour(langueCourante());
  const lieu = useRef<HTMLDivElement>(null);
  const [etat, setEtat] = useState<'attente' | 'vue' | 'illisible'>('attente');

  useEffect(() => {
    const el = lieu.current;
    if (!piece || !el) return;
    let vivant = true;
    let defaire = (): void => {};
    setEtat('attente');
    void (async () => {
      const r = await recevoirDeLaPlateforme('pieces/<projet>', { geste: 'apercu', table, id, colonne });
      if (!vivant) return;
      if (r.forme !== 'donnee') { setEtat('illisible'); return; }
      const [THREE, { STLLoader }, { OrbitControls }] = await Promise.all([
        import('three'), import('three/examples/jsm/loaders/STLLoader.js'), import('three/examples/jsm/controls/OrbitControls.js')]);
      if (!vivant) return;
      let rendu: InstanceType<typeof THREE.WebGLRenderer>;
      try { rendu = new THREE.WebGLRenderer({ antialias: true, alpha: true }); } catch { setEtat('illisible'); return; }
      const forme = new STLLoader().parse(await r.donnee.fichier.arrayBuffer());
      forme.computeVertexNormals();
      forme.center();
      forme.computeBoundingSphere();
      const rayon = forme.boundingSphere?.radius || 1;
      const scene = new THREE.Scene();
      const matiere = new THREE.MeshStandardMaterial({ color: couleurDuJeton('--accent', '#888888'), roughness: 0.55, metalness: 0.1 });
      const maille = new THREE.Mesh(forme, matiere);
      maille.rotation.x = -Math.PI / 2;
      scene.add(maille);
      scene.add(new THREE.HemisphereLight(0xffffff, couleurDuJeton('--surface', '#dddddd'), 1.4));
      const lampe = new THREE.DirectionalLight(0xffffff, 1.6);
      lampe.position.set(rayon * 2, rayon * 3, rayon * 2);
      scene.add(lampe);
      const camera = new THREE.PerspectiveCamera(35, 1, rayon / 100, rayon * 100);
      camera.position.set(rayon * 2.2, rayon * 1.6, rayon * 2.2);
      rendu.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      el.appendChild(rendu.domElement);
      const commande = new OrbitControls(camera, rendu.domElement);
      commande.enableDamping = true;
      const cadrer = (): void => {
        const l = el.clientWidth || 1, h = el.clientHeight || 1;
        rendu.setSize(l, h, false);
        rendu.domElement.style.width = '100%'; rendu.domElement.style.height = '100%';
        camera.aspect = l / h; camera.updateProjectionMatrix();
      };
      const suivi = new ResizeObserver(cadrer);
      suivi.observe(el);
      cadrer();
      rendu.setAnimationLoop(() => { commande.update(); rendu.render(scene, camera); });
      setEtat('vue');
      defaire = () => {
        rendu.setAnimationLoop(null); suivi.disconnect(); commande.dispose();
        forme.dispose(); matiere.dispose(); rendu.dispose(); rendu.domElement.remove();
      };
    })().catch(() => { if (vivant) setEtat('illisible'); });
    return () => { vivant = false; defaire(); };
  }, [table, id, colonne, piece?.chemin]);

  if (!piece) return null;
  return (
    <figure data-piece-3d className={`relative overflow-hidden rounded-lg border border-bordure bg-surface ${className ?? 'aspect-[4/3] w-full'}`}>
      <div ref={lieu} role="img" aria-label={alt} className="absolute inset-0 touch-none" />
      {etat === 'attente' ? <div className="absolute inset-0"><Patience /></div> : null}
      {etat === 'illisible' ? <div className="absolute inset-0"><Panne quoi={L.reliefIndisponible} /></div> : null}
      {etat === 'vue' ? <figcaption className="pointer-events-none absolute bottom-2 left-3 text-xs text-sur-fond-attenue">{L.reliefTourner}</figcaption> : null}
    </figure>
  );
}
