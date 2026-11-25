/** La page des crédits photo, servie par le cadre : l'auteur et la banque de chaque photo de l'app. */
import { IMAGES, type ImageDeLApp } from '../../images';
import { langueCourante } from '../../lib/langue';
import { libellesPour } from '../../lib/libelles';

export default function CreditsPhotos() {
  const L = libellesPour(langueCourante());
  // Une image jointe par la personne (son logo), ou fournie à la place de celle de la banque, n’a rien à créditer.
  const images = Object.values(IMAGES as Readonly<Record<string, ImageDeLApp>>).filter((i) => i.banque && !i.fournie);
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="font-titre text-3xl">{L.creditsPhotos}</h1>
      <ul className="mt-6 space-y-2 text-muted-foreground">
        {images.map((i) => (
          <li key={i.sources[0]?.[1]}>
            {i.profil ? <a href={i.profil} className="underline underline-offset-4">{i.auteur}</a> : i.auteur}{' · '}
            {i.lienBanque ? <a href={i.lienBanque} className="underline underline-offset-4">{i.banque}</a> : i.banque}
          </li>
        ))}
      </ul>
    </div>
  );
}
