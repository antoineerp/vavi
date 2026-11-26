/**
 * LES SECTIONS PRÊTES D'UNE PAGE PUBLIQUE — galerie, tarifs, avis, plan, contact, questions. Habillées par la direction
 * de l'app (ses jetons), montées et écrites par Claude, qui reste libre d'écrire les siennes. Chacune tient ce qu'une page
 * réécrite à la main oublie : les tarifs et les avis lus EN BASE (jamais écrits dans la page, rien d'inventé ; sans ligne,
 * la section ne s'affiche pas), le plan chargé chez Google seulement sur le geste du visiteur (aucun traceur posé
 * d'avance), le contact envoyé à la boîte du projet avec sa validation, la galerie qui s'agrandit au clavier.
 *
 * Ce qu'elles remplacent : chaque site réécrivait ces sections à neuf (Antoine, 26/11 : « Claude les assemble et les
 * habille au lieu de tout réécrire »), et les tarifs ou les avis finissaient en dur dans la page.
 */
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Check, Mail, MapPin, Phone, Star, X } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion';
import { buttonVariants } from '../ui/button';
import { cn } from '../ui/cn';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { APP } from '../lib/app';
import { useLecture, type DemandeDeLecture, type Ligne, type NomDeTable } from '../lib/donnees';
import { useEnvoiDuFormulaire } from '../lib/formulaire';
import { langueCourante } from '../lib/langue';
import { libellesPour } from '../lib/libelles';
import { enDevise } from '../lib/panier';
import { Panne, Patience } from './etats';
import type { Geste } from './vitrine';

/** Le haut d'une section : surtitre, titre, une phrase. */
function TeteDeSection({ surtitre, titre, chapeau }: { readonly surtitre?: string; readonly titre: string; readonly chapeau?: string }) {
  return (
    <div className="mb-10 max-w-2xl space-y-3">
      {surtitre ? <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent-texte">{surtitre}</p> : null}
      <h2 className="text-balance font-titre text-3xl leading-tight tracking-tight md:text-4xl">{titre}</h2>
      {chapeau ? <p className="text-pretty text-lg text-muted-foreground">{chapeau}</p> : null}
    </div>
  );
}

/** Les lignes d'une table publique ; rien tant qu'elles se lisent, rien du tout sans ligne : une section vide ne s'affiche pas. */
function useLignesMontrees<T extends NomDeTable>(table: T, demande?: DemandeDeLecture<T>): { readonly rendu: ReactNode } | { readonly lignes: readonly Ligne<T>[] } {
  const lecture = useLecture(table, demande);
  const L = libellesPour(langueCourante());
  if (lecture.forme === 'attente') return { rendu: <Patience quoi={L.chargement} /> };
  if (lecture.forme === 'refus') return { rendu: <Panne quoi={L.connexionImpossible} detail={`${lecture.raison} — ${lecture.geste}`} /> };
  return { lignes: lecture.donnee.lignes };
}

export interface PhotoDeGalerie { readonly photo: ReactNode; readonly legende?: string }

/** La galerie : des photos en colonnes de hauteurs libres ; un clic agrandit, Échap ou la croix referme. */
export function Galerie({ surtitre, titre, chapeau, photos }: {
  readonly surtitre?: string; readonly titre: string; readonly chapeau?: string; readonly photos: readonly PhotoDeGalerie[];
}) {
  const L = libellesPour(langueCourante());
  const [ouverte, ouvrir] = useState<number | null>(null);
  const vue = ouverte === null ? null : photos[ouverte];
  return (
    <section data-piece="galerie" className="apparait py-14 md:py-20">
      <TeteDeSection surtitre={surtitre} titre={titre} chapeau={chapeau} />
      <div className="columns-2 gap-3 md:columns-3 md:gap-4 [&>*]:mb-3 md:[&>*]:mb-4">
        {photos.map((p, i) => (
          <figure key={i} className="break-inside-avoid">
            <button type="button" onClick={() => ouvrir(i)} aria-label={`${L.agrandirLaPhoto}${p.legende ? ` : ${p.legende}` : ''}`}
              className="group block w-full overflow-hidden rounded-lg bg-muted [&_img]:w-full [&_img]:transition-transform [&_img]:duration-500 group-hover:[&_img]:scale-[1.03]">{p.photo}</button>
            {p.legende ? <figcaption className="mt-2 text-sm text-muted-foreground">{p.legende}</figcaption> : null}
          </figure>
        ))}
      </div>
      {vue ? (
        <div role="dialog" aria-modal="true" aria-label={vue.legende ?? titre} tabIndex={-1} onKeyDown={(e) => { if (e.key === 'Escape') ouvrir(null); }}
          ref={(n) => n?.focus()} onClick={() => ouvrir(null)} className="fixed inset-0 z-50 grid place-items-center bg-foreground/85 p-4">
          <button type="button" onClick={() => ouvrir(null)} aria-label={L.fermer} className="absolute right-4 top-4 grid size-10 place-items-center rounded-full bg-background text-foreground"><X className="size-5" /></button>
          <figure onClick={(e) => e.stopPropagation()} className="max-h-full max-w-5xl space-y-3 text-background [&_img]:max-h-[82svh] [&_img]:w-auto [&_img]:rounded-lg [&_img]:object-contain">
            {vue.photo}
            {vue.legende ? <figcaption className="text-center">{vue.legende}</figcaption> : null}
          </figure>
        </div>
      ) : null}
    </section>
  );
}

export interface Formule { readonly nom: string; readonly prix: number | null; readonly periode?: string; readonly points?: readonly string[]; readonly geste?: Geste; readonly misEnAvant?: boolean }

/**
 * Les tarifs, LUS EN BASE : `formule` dit, pour chaque ligne de `table`, son nom, son prix (le `montant` de la ligne) et ce
 * qu'elle comprend. Une page n'écrit jamais un prix. `misEnAvant` souligne une formule. Sans ligne, rien ne s'affiche.
 */
export function Tarifs<T extends NomDeTable>({ table, demande, formule, surtitre, titre, chapeau, devise }: {
  readonly table: T; readonly demande?: DemandeDeLecture<T>; readonly formule: (ligne: Ligne<T>) => Formule;
  readonly surtitre?: string; readonly titre: string; readonly chapeau?: string; readonly devise?: string;
}) {
  const lu = useLignesMontrees(table, demande);
  if ('rendu' in lu) return <>{lu.rendu}</>;
  if (lu.lignes.length === 0) return null;
  const langue = langueCourante();
  const monnaie = devise ?? APP.vente?.devise ?? 'EUR';
  return (
    <section data-piece="tarifs" className="apparait py-14 md:py-20">
      <TeteDeSection surtitre={surtitre} titre={titre} chapeau={chapeau} />
      <div className="grid gap-5 md:grid-cols-[repeat(auto-fit,minmax(16rem,1fr))]">
        {lu.lignes.map((l, i) => {
          const f = formule(l);
          return (
            <article key={i} className={cn('flex flex-col gap-6 rounded-xl border p-7', f.misEnAvant ? 'border-primary bg-primary text-primary-foreground shadow-lg' : 'border-border bg-card')}>
              <div className="space-y-2">
                <h3 className="font-titre text-2xl">{f.nom}</h3>
                {f.prix === null ? null : (
                  <p className="text-4xl font-semibold tabular-nums">{enDevise(Math.round(f.prix * 100), monnaie, langue)}{f.periode ? <span className="text-base font-normal opacity-80"> {f.periode}</span> : null}</p>
                )}
              </div>
              {f.points && f.points.length > 0 ? (
                <ul className="space-y-2">{f.points.map((p) => <li key={p} className="flex items-start gap-2"><Check className="mt-1 size-4 shrink-0" />{p}</li>)}</ul>
              ) : null}
              {f.geste ? (
                <Link to={f.geste.vers} className={cn(buttonVariants({ size: 'lg', variant: f.misEnAvant ? 'outline' : 'default' }), 'mt-auto rounded-full', f.misEnAvant && 'border-transparent bg-background text-foreground hover:bg-background/90')}>{f.geste.libelle}</Link>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

export interface UnAvis { readonly texte: string; readonly auteur: string; readonly note?: number | null; readonly detail?: string }

/**
 * Les avis, LUS EN BASE : `avis` dit, pour chaque ligne de `table`, son texte, son auteur, sa note sur cinq. Jamais un avis
 * écrit dans la page, jamais inventé ; sans ligne, rien ne s'affiche.
 */
export function Avis<T extends NomDeTable>({ table, demande, avis, surtitre, titre, chapeau }: {
  readonly table: T; readonly demande?: DemandeDeLecture<T>; readonly avis: (ligne: Ligne<T>) => UnAvis;
  readonly surtitre?: string; readonly titre: string; readonly chapeau?: string;
}) {
  const lu = useLignesMontrees(table, demande);
  const L = libellesPour(langueCourante());
  if ('rendu' in lu) return <>{lu.rendu}</>;
  if (lu.lignes.length === 0) return null;
  return (
    <section data-piece="avis" className="apparait py-14 md:py-20">
      <TeteDeSection surtitre={surtitre} titre={titre} chapeau={chapeau} />
      <div className="columns-1 gap-5 md:columns-2 lg:columns-3 [&>*]:mb-5">
        {lu.lignes.map((l, i) => {
          const a = avis(l);
          const note = typeof a.note === 'number' ? Math.max(0, Math.min(5, Math.round(a.note))) : null;
          return (
            <figure key={i} className="break-inside-avoid space-y-4 rounded-xl bg-secondary p-6">
              {note === null ? null : (
                <div className="flex gap-0.5" role="img" aria-label={L.noteSur.replace('{n}', String(note))}>
                  {[1, 2, 3, 4, 5].map((n) => <Star key={n} aria-hidden className={cn('size-4', n <= note ? 'fill-accent-texte text-accent-texte' : 'text-border')} />)}
                </div>
              )}
              <blockquote className="text-pretty text-lg leading-relaxed">« {a.texte} »</blockquote>
              <figcaption className="text-sm"><span className="font-semibold">{a.auteur}</span>{a.detail ? <span className="text-muted-foreground"> · {a.detail}</span> : null}</figcaption>
            </figure>
          );
        })}
      </div>
    </section>
  );
}

/**
 * Le plan d'une adresse : l'adresse, les horaires, le lien « Ouvrir dans Google Maps » ; le plan lui-même ne se charge
 * chez Google qu'au clic du visiteur, prévenu de ce que Google reçoit (aucun traceur posé d'avance).
 */
export function Plan({ adresse, horaires, titre }: { readonly adresse: string; readonly horaires?: readonly string[]; readonly titre?: string }) {
  const L = libellesPour(langueCourante());
  const [montre, montrer] = useState(false);
  const q = encodeURIComponent(adresse);
  return (
    <section data-piece="plan" className="grid gap-6 py-14 md:grid-cols-[1fr_1.6fr] md:py-20">
      <div className="space-y-5">
        <h2 className="font-titre text-3xl tracking-tight">{titre ?? L.nousTrouver}</h2>
        <p className="flex items-start gap-2 text-lg"><MapPin className="mt-1 size-5 shrink-0 text-accent-texte" />{adresse}</p>
        {horaires && horaires.length > 0 ? (
          <div className="space-y-1"><p className="font-semibold">{L.horaires}</p>{horaires.map((h) => <p key={h} className="text-muted-foreground">{h}</p>)}</div>
        ) : null}
        <a href={`https://www.google.com/maps/search/?api=1&query=${q}`} target="_blank" rel="noopener noreferrer" className="inline-block font-medium underline decoration-primary decoration-2 underline-offset-8">{L.ouvrirDansMaps}</a>
      </div>
      <div className="relative min-h-72 overflow-hidden rounded-xl bg-muted">
        {montre ? (
          <iframe title={adresse} src={`https://www.google.com/maps?q=${q}&output=embed`} loading="lazy" referrerPolicy="no-referrer" className="absolute inset-0 size-full border-0" />
        ) : (
          <div className="absolute inset-0 grid place-items-center p-6 text-center">
            <div className="max-w-sm space-y-4">
              <MapPin className="mx-auto size-10 text-accent-texte" aria-hidden />
              <button type="button" onClick={() => montrer(true)} className={cn(buttonVariants({ size: 'lg' }), 'rounded-full')}>{L.afficherLePlan}</button>
              <p className="text-sm text-muted-foreground">{L.planChezGoogle}</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

type ChampDuContact = 'nom' | 'courriel' | 'telephone' | 'message';
const COURRIEL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const LONGUEUR: Readonly<Record<ChampDuContact, number>> = { nom: 120, courriel: 200, telephone: 30, message: 4000 };

/**
 * Le contact : un formulaire envoyé à la boîte du projet (`formKey`), validé avant l'envoi (nom, courriel et message
 * obligatoires, `telephone` facultatif s'il est demandé), et à côté les coordonnées que la demande donne. « Envoyé » ne
 * se dit que sur la réponse de la plateforme ; un refus montre sa raison et son geste.
 */
export function Contact({ formKey, titre, chapeau, telephone: avecTelephone = false, coordonnees }: {
  readonly formKey: string; readonly titre: string; readonly chapeau?: string; readonly telephone?: boolean;
  readonly coordonnees?: { readonly adresse?: string; readonly telephone?: string; readonly courriel?: string; readonly horaires?: readonly string[] };
}) {
  const L = libellesPour(langueCourante());
  const { etat, envoyer } = useEnvoiDuFormulaire();
  const [erreurs, poserLesErreurs] = useState<Partial<Record<ChampDuContact, string>>>({});
  const champs: readonly ChampDuContact[] = avecTelephone ? ['nom', 'courriel', 'telephone', 'message'] : ['nom', 'courriel', 'message'];
  const libelle: Readonly<Record<ChampDuContact, string>> = { nom: L.nomComplet, courriel: L.courriel, telephone: `${L.telephone} (${L.facultatif})`, message: L.votreMessage };
  const soumettre = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    const form = e.currentTarget;
    const donnees = Object.fromEntries(champs.map((c) => [c, String(new FormData(form).get(c) ?? '').trim()]));
    const vues: Partial<Record<ChampDuContact, string>> = {};
    for (const c of champs) {
      if (c !== 'telephone' && !donnees[c]) vues[c] = L.champObligatoire;
      else if ((donnees[c] ?? '').length > LONGUEUR[c]) vues[c] = `${LONGUEUR[c]} max.`;
    }
    if (!vues.courriel && donnees.courriel && !COURRIEL.test(donnees.courriel)) vues.courriel = L.courrielInvalide;
    poserLesErreurs(vues);
    if (Object.keys(vues).length === 0) void envoyer({ formKey, donnees }).then((r) => { if (r.forme === 'donnee') form.reset(); });
  };
  return (
    <section data-piece="contact" className="grid gap-10 py-14 md:grid-cols-[1fr_1.4fr] md:py-20">
      <div className="space-y-5">
        <h2 className="text-balance font-titre text-3xl tracking-tight md:text-4xl">{titre}</h2>
        {chapeau ? <p className="text-pretty text-lg text-muted-foreground">{chapeau}</p> : null}
        {coordonnees ? (
          <ul className="space-y-3">
            {coordonnees.adresse ? <li className="flex items-start gap-2"><MapPin className="mt-1 size-4 shrink-0 text-accent-texte" />{coordonnees.adresse}</li> : null}
            {coordonnees.telephone ? <li className="flex items-start gap-2"><Phone className="mt-1 size-4 shrink-0 text-accent-texte" /><a href={`tel:${coordonnees.telephone.replace(/\s/g, '')}`} className="underline-offset-4 hover:underline">{coordonnees.telephone}</a></li> : null}
            {coordonnees.courriel ? <li className="flex items-start gap-2"><Mail className="mt-1 size-4 shrink-0 text-accent-texte" /><a href={`mailto:${coordonnees.courriel}`} className="underline-offset-4 hover:underline">{coordonnees.courriel}</a></li> : null}
            {coordonnees.horaires?.map((h) => <li key={h} className="text-muted-foreground">{h}</li>)}
          </ul>
        ) : null}
      </div>
      {etat.forme === 'envoye' ? (
        <p role="status" className="flex items-start gap-2 rounded-xl bg-secondary p-6 text-lg"><Check className="mt-1 size-5 shrink-0 text-accent-texte" />{L.messageEnvoye}</p>
      ) : (
        <form noValidate onSubmit={soumettre} className="space-y-4 rounded-xl border border-border bg-card p-6 md:p-8">
          {champs.map((c) => (
            <div key={c} className="space-y-1.5">
              <Label htmlFor={`contact-${c}`}>{libelle[c]}</Label>
              {c === 'message'
                ? <Textarea id={`contact-${c}`} name={c} rows={5} maxLength={LONGUEUR[c]} aria-invalid={Boolean(erreurs[c])} />
                : <Input id={`contact-${c}`} name={c} type={c === 'courriel' ? 'email' : c === 'telephone' ? 'tel' : 'text'} autoComplete={c === 'nom' ? 'name' : c === 'courriel' ? 'email' : 'tel'} maxLength={LONGUEUR[c]} aria-invalid={Boolean(erreurs[c])} />}
              {erreurs[c] ? <p className="text-sm text-destructive">{erreurs[c]}</p> : null}
            </div>
          ))}
          {etat.forme === 'refus' ? <p role="alert" className="text-sm text-destructive">{etat.raison} — {etat.geste}</p> : null}
          <button type="submit" disabled={etat.forme === 'envoi'} className={cn(buttonVariants({ size: 'lg' }), 'w-full rounded-full')}>{etat.forme === 'envoi' ? L.envoiEnCours : L.envoyer}</button>
        </form>
      )}
    </section>
  );
}

/** Les questions fréquentes : chacune se déplie. Les réponses sont celles que la demande donne, jamais inventées. */
export function QuestionsFrequentes({ surtitre, titre, questions }: {
  readonly surtitre?: string; readonly titre: string; readonly questions: readonly { readonly question: string; readonly reponse: ReactNode }[];
}) {
  return (
    <section data-piece="questions" className="grid gap-8 py-14 md:grid-cols-[1fr_1.6fr] md:py-20">
      <TeteDeSection surtitre={surtitre} titre={titre} />
      <Accordion type="single" collapsible className="border-t border-border">
        {questions.map((q) => (
          <AccordionItem key={q.question} value={q.question}>
            <AccordionTrigger className="text-left text-lg">{q.question}</AccordionTrigger>
            <AccordionContent className="text-pretty text-muted-foreground">{q.reponse}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}
