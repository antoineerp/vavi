/**
 * LA PAGE D'ACCUEIL PUBLIQUE de vavi (vavi.dev) : la maquette du 24/11, corrigée le 25/11. Elle ne promet rien que vavi
 * ne fasse déjà : les agents et le domaine à soi sont marqués « bientôt ». Le tableau des prix d'autres outils est retiré,
 * faute d'avoir été relevé. Elle dit que l'offre gratuite de Claude permet un connecteur. Le bouton « Ajouter vavi à
 * Claude » ouvre le connecteur déjà rempli, et une animation dessinée montre les trois étapes. Les trous `__…__` sont
 * remplis par `laPageDAccueil`.
 */
import { adresseDeLaPlateforme, adresseMcp, lienDInstallation } from '@/lib/mcp/l-adresse';
import { EN, NEUTRES } from './en-anglais';
import { lesPrixDeLAccueil } from './les-prix';
import { GRILLE_DU_CODE, type Grille, type Reduction } from '@/lib/abonnements/les-offres';

const GABARIT = String.raw`<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>vavi : votre site, construit avec Claude</title>
<meta name="description" content="Construisez votre site avec Claude, dans votre abonnement Claude. vavi apporte moins de jetons dépensés, des designs plus riches, un vrai backend et une console pour piloter votre site.">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="canonical" href="__CONSOLE__/__LANGUE__">
<link rel="alternate" hreflang="fr" href="__CONSOLE__/fr">
<link rel="alternate" hreflang="en" href="__CONSOLE__/en">
<link rel="alternate" hreflang="x-default" href="__CONSOLE__/">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800&family=Geist+Mono:wght@400;500&family=IBM+Plex+Sans+Condensed:wght@500;600&display=swap">
<style>
/* Mise en page : une planche technique (grille de points, traits nets d'épaisseur constante, annotations en chasse fixe), comme le plan d'un système. */
:root{
  --papier:#fbfcfe; --carreau:#e3eaf5; --marge:#e7a1a1;
  --encre:#1c2944; --encre-douce:#4b5874; --surligneur:#ffe36e; --surligne-fond:#fff1a8;
  --vert:#1d8657; --vert-fond:#e2f4ea; --carte:#ffffff; --trait:#c9d3e4;
  --f-titre:"Geist", "Segoe UI", system-ui, sans-serif;
  --f-texte:"Geist", "Segoe UI", system-ui, sans-serif;
  --f-main:"IBM Plex Sans Condensed", "Arial Narrow", system-ui, sans-serif;
  --f-mono:"Geist Mono", ui-monospace, Menlo, Consolas, monospace;
  --ombre:rgba(28,41,68,.45); --cyan:#0e7490; --cyan-fond:#e0f2f7;
}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){
  --papier:#131926; --carreau:#1f283a; --marge:#7a3b3f;
  --encre:#e9eef7; --encre-douce:#aab5c9; --surligneur:#d8b93a; --surligne-fond:#4a4220;
  --vert:#45c48a; --vert-fond:#16392a; --carte:#1a2232; --trait:#334059; --ombre:rgba(0,0,0,.7); --cyan:#5fd3ea; --cyan-fond:#123540; color-scheme:dark}}
:root[data-theme="dark"]{
  --papier:#131926; --carreau:#1f283a; --marge:#7a3b3f;
  --encre:#e9eef7; --encre-douce:#aab5c9; --surligneur:#d8b93a; --surligne-fond:#4a4220;
  --vert:#45c48a; --vert-fond:#16392a; --carte:#1a2232; --trait:#334059; --ombre:rgba(0,0,0,.7); --cyan:#5fd3ea; --cyan-fond:#123540; color-scheme:dark}

*{box-sizing:border-box}
body{margin:0;background-color:var(--papier);color:var(--encre);font-family:var(--f-texte);font-size:17px;line-height:1.6;
  background-image:radial-gradient(var(--carreau) 1.2px,transparent 1.3px);
  background-size:22px 22px;background-position:-11px -11px}
.enveloppe{max-width:1120px;margin:0 auto;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
h1,h2,h3{font-family:var(--f-titre);line-height:1.06;text-wrap:balance;margin:0;letter-spacing:-.035em}
h1{font-size:clamp(2.3rem,5.4vw,3.7rem);font-weight:800}
h2{font-size:clamp(1.9rem,4vw,2.8rem);font-weight:800}
h3{font-size:1.3rem;font-weight:600}
p{margin:0}
a{color:inherit}
:focus-visible{outline:3px solid var(--vert);outline-offset:3px;border-radius:6px}
.main{font-family:var(--f-main);font-weight:600;letter-spacing:-.01em}
.titre-section>.main,.groupe-etapes{font-family:var(--f-mono)!important;font-weight:500;font-size:.82rem!important;text-transform:uppercase;letter-spacing:.14em;color:var(--cyan)!important}
.titre-section>.main::before,.groupe-etapes::before{content:"// ";opacity:.6}
.surligne{background:linear-gradient(transparent 80%,var(--surligneur) 80%,var(--surligneur) 92%,transparent 92%);padding:0 .04em}
.croquis{width:100%;height:auto;display:block;max-width:100%}
.croquis *{vector-effect:non-scaling-stroke}
.croquis text{font-family:var(--f-main);font-weight:500;fill:var(--encre);stroke:none}

/* Bandeau maquette */
.maquette{background:var(--surligneur);color:#1c2944;font-size:.9rem;text-align:center;padding-block:6px}

/* En-tête */
.entete{position:sticky;top:env(safe-area-inset-top,0px);z-index:5;background:var(--papier);border-bottom:1px solid var(--trait)}
body::before{content:"";position:fixed;inset:0 0 auto;height:env(safe-area-inset-top,0px);z-index:10;background:var(--papier)}
.entete .enveloppe{display:flex;align-items:center;gap:24px;padding-block:12px}
.logo{display:flex;align-items:center;gap:8px;text-decoration:none;font-family:var(--f-titre);font-weight:800;font-size:1.6rem}
.logo svg{width:34px;height:34px}
.nav{display:flex;gap:22px;margin-left:auto;font-size:.98rem}
.nav a{text-decoration:none}
.nav a:hover{text-decoration:underline var(--vert);text-underline-offset:5px}
.bouton{display:inline-flex;align-items:center;gap:8px;font-family:var(--f-texte);font-weight:700;font-size:1rem;text-decoration:none;
  padding:12px 20px;border:1px solid var(--trait);border-radius:14px;background:var(--carte);color:var(--encre);
  box-shadow:0 1px 0 var(--trait),0 22px 44px -28px var(--ombre);transition:transform .12s, box-shadow .12s;cursor:pointer}
.bouton:hover{transform:translate(-1px,-1px);box-shadow:0 1px 0 var(--trait),0 22px 44px -28px var(--ombre)}
.bouton:active{transform:translate(2px,2px);box-shadow:0 1px 0 var(--trait),0 22px 44px -28px var(--ombre)}
.bouton.plein{background:var(--vert);color:#fff;border-color:var(--vert)}
.bouton.vedette{position:relative;overflow:hidden;isolation:isolate;font-size:1.15rem;padding:16px 28px;border-radius:16px}
.bouton.vedette svg{width:20px;height:20px;flex:none}
.adresse-haut{margin-top:14px;display:flex;flex-direction:column;gap:6px}
.adresse-haut>span{font-size:.92rem;color:var(--encre-douce)}
@media (prefers-reduced-motion:no-preference){
  .bouton.vedette{animation:appel 2.6s ease-out infinite}
  .bouton.vedette::after{content:"";position:absolute;inset:0;z-index:-1;background:linear-gradient(105deg,transparent 35%,rgba(255,255,255,.38) 50%,transparent 65%);transform:translateX(-120%);animation:reflet 3.2s ease-in-out infinite}
  .bouton.vedette:hover{animation-play-state:paused}
  @keyframes appel{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--vert) 55%,transparent),0 22px 44px -28px var(--ombre)}70%,100%{box-shadow:0 0 0 16px color-mix(in srgb,var(--vert) 0%,transparent),0 22px 44px -28px var(--ombre)}}
  @keyframes reflet{0%,45%{transform:translateX(-120%)}75%,100%{transform:translateX(120%)}}
}
.entete .bouton{padding:8px 14px;font-size:.95rem}
.entete .langue{font-family:var(--f-mono);font-size:.85rem;color:var(--encre-douce);text-decoration:none;white-space:nowrap}
.entete .langue:hover{color:var(--encre);text-decoration:underline}
@media (max-width:820px){.nav{display:none}.entete .bouton{margin-left:auto}.entete .langue{margin-left:auto}.entete .langue + .bouton{margin-left:0}}

/* Ouverture */
.ouverture{padding-block:56px 40px}
.ouverture .enveloppe{display:grid;grid-template-columns:1.05fr 1fr;gap:40px;align-items:center}
.ouverture .texte{display:grid;gap:22px;min-width:0}
.ouverture .chapeau{font-size:1.2rem;max-width:34em;color:var(--encre-douce)}
.ouverture .chapeau strong{color:var(--encre)}
.gestes{display:flex;flex-wrap:wrap;gap:14px;align-items:center}
.note{font-family:var(--f-mono);font-size:.95rem;font-weight:500;letter-spacing:.02em;color:var(--vert);display:inline-block}
@media (max-width:860px){.ouverture .enveloppe{grid-template-columns:1fr}}

.faits{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:10px 28px}
.faits li{display:grid;gap:0;min-width:0}
.faits b{font-family:var(--f-titre);font-weight:800;font-size:2rem;line-height:1.1;color:var(--vert);font-variant-numeric:tabular-nums}
.faits span{font-size:.9rem;color:var(--encre-douce);max-width:12em;line-height:1.3}

/* Comparaison */
.tableau{overflow-x:auto;border:1px solid var(--trait);border-radius:12px;background:var(--carte)}
.tableau table{border-collapse:collapse;width:100%;min-width:720px;font-size:.97rem}
.tableau th,.tableau td{padding:14px 16px;text-align:left;vertical-align:top;border-bottom:1.5px dashed var(--trait)}
.tableau thead th{font-size:.8rem;text-transform:uppercase;letter-spacing:.07em;color:var(--encre-douce);border-bottom:1px solid var(--trait)}
.tableau tbody tr:last-child td,.tableau tbody tr:last-child th{border-bottom:0}
.tableau tbody th{font-family:var(--f-titre);font-weight:600;font-size:1.1rem;white-space:nowrap}
.tableau tr.nous{background:var(--vert-fond)}
.tableau tr.nous th{color:var(--vert)}
.compteur{display:inline-block;font-family:var(--f-main);font-weight:700;font-size:1.6rem;line-height:1.1}
.compteur.oui{color:var(--marge)}
.compteur.non{color:var(--vert)}
.source{margin-top:12px;font-size:.85rem;color:var(--encre-douce)}
.duel{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:34px}
.duel>div{display:grid;gap:10px;align-content:start;padding:22px;border:1px solid var(--trait);border-radius:12px;background:var(--carte)}
.duel svg{width:100%;height:auto;max-width:360px}
@media (max-width:820px){.duel{grid-template-columns:1fr}}

@media (max-width:640px){
  .tableau{border:0;background:none;overflow:visible}
  .tableau table{min-width:0}
  .tableau thead{display:none}
  .tableau tbody,.tableau tr,.tableau th,.tableau td{display:block}
  .tableau tr{background:var(--carte);border:1px solid var(--trait);border-radius:12px;margin-bottom:12px;padding:8px 0}
  .tableau tbody th{border:0;padding-bottom:4px}
  .tableau td{display:flex;justify-content:space-between;gap:16px;padding:8px 16px;text-align:right}
  .tableau td::before{content:attr(data-label);text-align:left;font-size:.85rem;color:var(--encre-douce);flex:0 0 42%}
  .tableau tbody tr td:last-child{border-bottom:0}
}

/* Économie */
.econome{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px 34px}
.econome li{display:grid;grid-template-columns:52px 1fr;gap:14px;align-items:start}
.econome svg{width:52px;height:52px}
.econome b{display:block;font-size:1.08rem}
.econome span{color:var(--encre-douce)}
@media (max-width:820px){.econome{grid-template-columns:1fr}}

.pastilles{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:8px}
.pastilles li{font-family:var(--f-main);font-weight:700;font-size:1.25rem;line-height:1.2;padding:2px 12px;border:1px solid var(--trait);border-radius:14px;background:var(--carte)}
.pastilles li:first-child{background:var(--vert);color:#fff}
.pastilles li:nth-child(odd){}
.pastilles li:nth-child(even){background:var(--surligne-fond)}

.sous{margin:4px 0 0;padding:0;list-style:none;counter-reset:sous;display:grid;gap:8px}
.sous li{counter-increment:sous;display:grid;grid-template-columns:28px 1fr;gap:10px;align-items:start}
.sous li::before{content:counter(sous,lower-alpha);font-family:var(--f-main);font-weight:700;font-size:1.3rem;line-height:1;width:26px;height:26px;display:grid;place-items:center;border:1.6px solid var(--encre);border-radius:50%;background:var(--surligne-fond)}
.sous kbd,.kit kbd,.etape-d kbd{font-family:var(--f-texte);font-size:.92em;font-weight:700;border:1.5px solid var(--encre);border-radius:7px;padding:0 7px;background:var(--papier);white-space:nowrap}
.attention{border:2px dashed var(--marge);border-radius:10px;padding:10px 14px;font-size:.95rem}
.attention b{color:var(--encre)}
.bloque{margin-top:28px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}
.bloque div{padding:18px 20px;border:2px dashed var(--encre);border-radius:12px;background:var(--papier);display:grid;gap:6px;align-content:start}
.bloque b{font-size:1.02rem}
.bloque p{color:var(--encre-douce);font-size:.96rem}
@media (max-width:900px){.bloque{grid-template-columns:1fr}}

/* Agents */
.agents{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(0,1fr);gap:20px}
.agent{display:grid;gap:10px;align-content:start;padding:22px;background:var(--carte);border:1px solid var(--trait);border-radius:14px}
.agent .pour-qui{font-size:.8rem;text-transform:uppercase;letter-spacing:.08em;font-weight:700;color:var(--vert)}
.agent ul{margin:0;padding-left:1.1em;display:grid;gap:6px;color:var(--encre-douce)}
.agents-haut{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,.9fr);gap:36px;align-items:center;margin-bottom:30px}
.principes{list-style:none;margin:24px 0 0;padding:0;display:flex;flex-wrap:wrap;gap:10px 26px}
.principes li{display:flex;gap:8px;align-items:center;font-weight:700}
.principes li::before{content:"✓";color:var(--vert);font-family:var(--f-main);font-size:1.5rem;line-height:1}
@media (max-width:900px){.agents,.agents-haut{grid-template-columns:1fr}}

/* Sections */
section{padding-block:64px}
.titre-section{display:grid;gap:12px;margin-bottom:36px;max-width:44em}
/* Ce que Claude ne fait pas seul : quatre cartes, puis le design en une ligne */
.essais{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;counter-reset:essai}
.essais li{counter-increment:essai;background:var(--carte);border:1px solid var(--trait);border-radius:14px;padding:20px;display:grid;gap:8px;align-content:start}
.essais li::before{content:"0" counter(essai);font-family:var(--f-mono);font-size:.8rem;color:var(--cyan);letter-spacing:.1em}
.essais b{font-family:var(--f-titre);font-size:1.1rem}
.essais span{color:var(--encre-douce);font-size:.95rem}
@media (max-width:980px){.essais{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:760px){.essais{grid-template-columns:1fr}}
.ligne-design{margin-top:22px;color:var(--encre-douce);font-size:1.05rem}
.ligne-design b{color:var(--encre)}
/* Ouverture sur une colonne, avec la capture réelle de Claude ; ce qui tourne ; l'abonnement */
.ouverture.une-colonne .enveloppe{grid-template-columns:1fr;gap:36px}
.ouverture.une-colonne .texte{max-width:46em}
.ouverture.cote-a-cote .enveloppe{grid-template-columns:minmax(0,.92fr) minmax(0,1.3fr);gap:40px;align-items:center}
.ouverture.cote-a-cote h1{font-size:clamp(2.1rem,3.3vw,3.2rem)}
@media (max-width:980px){.ouverture.cote-a-cote .enveloppe{grid-template-columns:1fr}}
.ecran-claude,.capture-console{margin:0;display:grid;gap:10px;min-width:0}
.ecran-claude img,.capture-console img{width:100%;height:auto;display:block;border:1px solid var(--trait);border-radius:14px;box-shadow:0 1px 0 var(--trait),0 30px 60px -34px var(--ombre);background:var(--carte)}
.ecran-claude figcaption,.capture-console figcaption{font-family:var(--f-mono);font-size:.8rem;color:var(--encre-douce)}
.tourne{display:grid;grid-template-columns:minmax(0,.85fr) minmax(0,1.15fr);gap:36px;align-items:start}
.ce-qui-tourne{list-style:none;margin:0;padding:0;display:grid;gap:18px}
.ce-qui-tourne li{display:grid;gap:3px;padding-left:18px;border-left:2px solid var(--vert)}
.ce-qui-tourne b{font-family:var(--f-titre);font-size:1.08rem}
.ce-qui-tourne span{color:var(--encre-douce);font-size:.97rem}
.surete{list-style:none;margin:32px 0 0;padding:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.surete li{background:var(--carte);border:1px solid var(--trait);border-radius:12px;padding:14px 16px;font-size:.95rem;font-weight:600}
.surete li::before{content:"✓ ";color:var(--vert)}
.deux-blocs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}
.bloc-abo{background:var(--carte);border:1px solid var(--trait);border-radius:14px;padding:24px;display:grid;gap:10px;align-content:start}
.bloc-abo p{color:var(--encre-douce)}
@media (max-width:860px){.tourne,.surete,.deux-blocs{grid-template-columns:1fr}}
/* Les quatre apports et les captures réelles */
.quatre{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}
.apport-q{background:var(--carte);border:1px solid var(--trait);border-radius:14px;padding:20px;display:grid;gap:8px;align-content:start;box-shadow:0 1px 0 var(--trait),0 22px 44px -28px var(--ombre)}
.apport-q .main{font-size:2.4rem;line-height:1;color:var(--vert)}
.apport-q p{color:var(--encre-douce);font-size:.98rem}
.apport-q a{font-weight:700;font-size:.95rem}
.captures{display:grid;grid-template-columns:1.25fr 1fr;gap:24px;margin-top:36px;align-items:start}
.captures figure{margin:0;display:grid;gap:8px;min-width:0}
.captures img{width:100%;height:auto;display:block;border:1px solid var(--trait);border-radius:10px;background:var(--carte);box-shadow:0 1px 0 var(--trait),0 22px 44px -28px var(--ombre)}
.captures figcaption{font-size:1.3rem;color:var(--encre-douce)}
@media (max-width:980px){.quatre{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:760px){.quatre,.captures{grid-template-columns:1fr}}
.titre-section .main{font-size:1.5rem;color:var(--encre-douce)}
.titre-section p{color:var(--encre-douce);font-size:1.1rem}

/* Le problème : page de cahier à marge */
.feuille{background:var(--carte);border:1px solid var(--trait);border-radius:14px;position:relative;padding:32px 28px 32px 64px;box-shadow:0 1px 0 var(--trait),0 22px 44px -28px var(--ombre)}
.feuille::before{display:none;content:"";position:absolute;top:0;bottom:0;left:40px;width:2px;background:var(--marge)}
.feuille .colonnes{display:grid;grid-template-columns:1fr 1fr;gap:32px}
.feuille ul{margin:10px 0 0;padding-left:1.1em}
.feuille li{margin-block:4px}
.barre{text-decoration:line-through;text-decoration-color:var(--marge);text-decoration-thickness:2px}
@media (max-width:760px){.feuille{padding:24px 18px 24px 40px}.feuille::before{left:22px}.feuille .colonnes{grid-template-columns:1fr}}

/* Les étapes */
.etapes{display:grid;gap:28px;counter-reset:etape}
.etape{display:grid;grid-template-columns:96px minmax(0,1fr) minmax(0,.9fr);gap:28px;align-items:center;padding:26px;background:var(--carte);border:1px solid var(--trait);border-radius:14px}
.etape:nth-child(even){border-radius:14px}
.numero{font-family:var(--f-main);font-weight:700;font-size:4.2rem;line-height:1;width:84px;height:84px;display:grid;place-items:center;position:relative}
.numero svg{position:absolute;inset:0;width:100%;height:100%}
.etape .corps{display:grid;gap:10px;min-width:0}
.etape .qui{font-size:.82rem;text-transform:uppercase;letter-spacing:.08em;font-weight:700;color:var(--encre-douce)}
.etape .qui b{color:var(--vert)}
.etape .astuce{font-family:var(--f-main);font-size:1.3rem;color:var(--encre-douce);line-height:1.25}
.chemin{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:.95rem}
.chemin span{border:1.5px solid var(--encre);border-radius:8px;padding:2px 9px;background:var(--papier)}
.chemin i{font-style:normal;color:var(--encre-douce)}
.copie{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
/* Comment ça marche : le kit de départ, puis les étapes à déplier */
.demarrer{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);gap:28px;align-items:center;background:var(--carte);border:1px solid var(--trait);border-radius:14px;padding:26px;box-shadow:0 1px 0 var(--trait),0 22px 44px -28px var(--ombre);margin-bottom:34px}
.kit{display:grid;gap:12px;justify-items:start;min-width:0}
.kit p{color:var(--encre-douce)}
.kit .chemin{font-size:.97rem;line-height:1.9}
.kit .chemin{line-height:1.8}
.copie.grande code{font-size:1.15rem;padding:10px 16px;word-break:break-all}
.copie.grande button{padding:10px 16px;font-size:1rem}
.liste-etapes{display:grid;gap:10px}
.groupe-etapes{font-size:1.45rem;color:var(--encre-douce);margin:14px 0 2px}
.etape-d{background:var(--carte);border:1px solid var(--trait);border-radius:14px}
details.etape-d>summary{list-style:none;cursor:pointer;font-weight:400;font-size:1rem;display:grid;grid-template-columns:48px minmax(0,1fr) auto 28px;gap:14px;align-items:center;padding:14px 18px}
.etape-d summary::-webkit-details-marker{display:none}
details.etape-d>summary::after,details.etape-d[open]>summary::after{content:none}
.etape-d .num{font-size:2.3rem;line-height:1;color:var(--vert);text-align:center}
.etape-d .resume{display:grid;gap:2px;min-width:0}
.etape-d .resume b{font-family:var(--f-titre);font-size:1.15rem;font-weight:600}
.etape-d .resume span{color:var(--encre-douce);font-size:.96rem}
.etape-d .duree{font-family:var(--f-main);font-size:1.2rem;color:var(--encre-douce);white-space:nowrap}
.etape-d .plus{width:26px;height:26px;border:1px solid var(--trait);border-radius:50%;position:relative}
.etape-d .plus::before,.etape-d .plus::after{content:"";position:absolute;left:50%;top:50%;width:12px;height:2px;background:var(--encre);transform:translate(-50%,-50%)}
.etape-d .plus::after{transform:translate(-50%,-50%) rotate(90deg);transition:transform .2s}
.etape-d[open] .plus::after{transform:translate(-50%,-50%) rotate(0)}
.etape-d[open]{box-shadow:0 1px 0 var(--trait),0 22px 44px -28px var(--ombre)}
.etape-d .detail{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,.85fr);gap:28px;align-items:center;padding:4px 24px 24px 80px}
.etape-d .corps{display:grid;gap:10px;min-width:0}
.etape-d .astuce{font-family:var(--f-main);font-size:1.3rem;color:var(--encre-douce);line-height:1.25}
.etape-d summary:hover .resume b{text-decoration:underline;text-decoration-thickness:2px;text-underline-offset:4px}
.bloque-d{margin-top:22px}
details.bloque-d>summary{display:inline-flex;gap:10px;align-items:center;font-family:var(--f-main);font-weight:700;font-size:1.5rem;color:var(--marge);width:max-content}
@media (prefers-reduced-motion:reduce){.etape-d .plus::after{transition:none}}
@media (max-width:860px){.demarrer{grid-template-columns:1fr}.etape-d .detail{grid-template-columns:1fr;padding:4px 18px 20px}}
@media (max-width:560px){details.etape-d>summary{grid-template-columns:36px minmax(0,1fr) 26px;gap:10px;padding:12px 14px}.etape-d .duree{display:none}.etape-d .num{font-size:1.9rem}}
.copie code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:1.05rem;background:var(--surligne-fond);padding:6px 12px;border-radius:8px;border:1.5px dashed var(--encre)}
.copie button{font:inherit;font-size:.9rem;padding:6px 12px;border:1.5px solid var(--encre);border-radius:8px;background:var(--carte);color:var(--encre);cursor:pointer}
.exemple{border-left:3px solid var(--surligneur);padding:6px 12px;font-style:italic;background:var(--papier)}
@media (max-width:860px){.etape{grid-template-columns:1fr;gap:16px;padding:20px}.numero{width:64px;height:64px;font-size:3.2rem}.etape .dessin{order:3}}

/* Ce que vavi apporte */
.apports{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:22px}
.apport{display:grid;gap:8px;align-content:start;padding:20px;border:2px dashed var(--trait);border-radius:12px;background:var(--papier)}
.apport svg{width:72px;height:72px}
.apport p{color:var(--encre-douce);font-size:.98rem}
@media (max-width:960px){.apports{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:520px){.apports{grid-template-columns:1fr}}

/* Garde-fous */
.garde{display:grid;grid-template-columns:.8fr 1.2fr;gap:40px;align-items:center}
.liste-cochee{list-style:none;margin:0;padding:0;display:grid;gap:18px}
.liste-cochee li{display:grid;grid-template-columns:36px 1fr;gap:14px;align-items:start}
.liste-cochee svg{width:34px;height:34px}
.liste-cochee b{display:block;font-size:1.08rem}
.liste-cochee span{color:var(--encre-douce)}
@media (max-width:860px){.garde{grid-template-columns:1fr}}

/* Pourquoi vavi */
.pourquoi{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:22px}
.raison{padding:22px;background:var(--carte);border:1px solid var(--trait);border-radius:14px;display:grid;gap:8px;align-content:start}
.raison .main{font-size:1.35rem;color:var(--vert);line-height:1.1}
.raison p{color:var(--encre-douce)}
@media (max-width:900px){.pourquoi{grid-template-columns:1fr}}

/* Le coût */
.addition{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:40px;align-items:center;margin-bottom:44px}
.ticket{background:var(--carte);border:1px solid var(--trait);padding:24px 26px;border-radius:4px;font-variant-numeric:tabular-nums;box-shadow:0 1px 0 var(--trait),0 22px 44px -28px var(--ombre)}
.ticket .ligne{display:flex;justify-content:space-between;gap:12px;padding-block:8px;border-bottom:1.5px dashed var(--trait)}
.ticket .ligne:last-child{border-bottom:0;font-weight:700;font-size:1.1rem;padding-top:14px}
.ticket .zero{color:var(--vert);font-weight:700}
@media (max-width:860px){.addition{grid-template-columns:1fr}}
.offres{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px}
.offre{display:flex;flex-direction:column;gap:12px;padding:24px 20px;background:var(--carte);border:1px solid var(--trait);border-radius:14px;position:relative}
.offre .bouton{margin-top:auto;align-self:flex-start}
.offre.vedette{box-shadow:0 1px 0 var(--trait),0 22px 44px -28px var(--ombre)}
.offre .etiquette{position:absolute;top:-16px;right:14px;background:var(--surligneur);color:#1c2944;font-family:var(--f-main);font-weight:700;font-size:1.2rem;padding:0 10px;border:1.5px solid var(--encre);border-radius:8px;}
.prix{font-family:var(--f-titre);font-weight:800;font-size:2.6rem;line-height:1;font-variant-numeric:tabular-nums}
.prix s{display:block;width:max-content;margin-bottom:6px;font-size:.5em;font-weight:600;color:var(--encre-douce);text-decoration-thickness:2px}
.prix .promo-prix{color:var(--vert);white-space:nowrap}
.promo{display:inline-block;align-self:flex-start;margin:-4px 0 0;padding:3px 10px;border-radius:999px;background:var(--vert-fond);color:var(--vert);font-weight:700;font-size:.9rem}
.bandeau-promo{margin:0 0 30px;padding:14px 18px;border-radius:14px;border:1px solid var(--vert);background:var(--vert-fond);color:var(--encre)}
.bandeau-promo b{color:var(--vert)}
.prix small{white-space:nowrap;font-family:var(--f-texte);font-size:1rem;font-weight:400;color:var(--encre-douce)}
.offre ul{margin:0;padding-left:1.1em;display:grid;gap:4px;font-size:.96rem}
.offre .pour{color:var(--encre-douce);font-size:.96rem}
.en-plus{margin-top:22px;text-align:center;font-size:1.05rem}
@media (max-width:1000px){.offres{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:540px){.offres{grid-template-columns:1fr}}

/* Questions */
.questions{display:grid;gap:12px;max-width:820px}
details{background:var(--carte);border:1px solid var(--trait);border-radius:10px;padding:14px 18px}
summary{cursor:pointer;font-weight:700;font-size:1.08rem;list-style:none;display:flex;justify-content:space-between;gap:12px}
summary::-webkit-details-marker{display:none}
summary::after{content:"+";font-family:var(--f-main);font-size:1.8rem;line-height:.8}
details[open] summary::after{content:"–"}
details p{margin-top:10px;color:var(--encre-douce)}

/* Fin */
.fin{text-align:center}
.fin .enveloppe{display:grid;justify-items:center;gap:22px}
.fin svg{max-width:420px}
.pied{border-top:1px solid var(--trait);padding-block:28px;font-size:.92rem;color:var(--encre-douce);background:var(--papier)}
.pied .enveloppe{display:flex;flex-wrap:wrap;gap:18px 28px;justify-content:space-between}
.pied nav{display:flex;flex-wrap:wrap;gap:18px}

@media (prefers-reduced-motion:no-preference){
  .trace{stroke-dasharray:1200;stroke-dashoffset:0;animation:trace 2.4s ease-out both}
  @keyframes trace{from{stroke-dashoffset:1200}to{stroke-dashoffset:0}}
}
/* L'animation des trois étapes : cinq scènes de 5 s, en boucle ; immobile (le connecteur rempli) si l'on réduit les animations. */
.film{margin:0 0 36px;display:grid;gap:10px;max-width:760px}
.film svg{width:100%;height:auto}
.legende{display:flex;gap:10px 22px;flex-wrap:wrap;font-family:var(--f-main);font-weight:700;font-size:1.45rem;color:var(--encre-douce)}
.legende span{border-bottom:3px solid transparent}
.film .v1{opacity:0;animation:v1 25s infinite both}
.film .v2{opacity:0;animation:v2 25s infinite both}
.film .v3{opacity:0;animation:v3 25s infinite both}
.film .v4{opacity:0;animation:v4 25s infinite both}
.film .v5{animation:v5 25s infinite ease-in-out both}
.film .v6{opacity:0;animation:v6 25s infinite both}
.film .v7{opacity:0;animation:v7 25s infinite both}
.film .v8{opacity:0;animation:v8 25s infinite both}
.film .v9{opacity:0;animation:v9 25s infinite both}
.film .v10{opacity:0;animation:v10 25s infinite both}
.film .v11{animation:v11 25s infinite both}
.film .v12{opacity:0;animation:v12 25s infinite both}
.film .v13{opacity:0;animation:v13 25s infinite both}
.film .v14{opacity:0;animation:v14 25s infinite both}
.film .v15{animation:v15 25s infinite ease-in-out both}
.film .v16{opacity:0;animation:v16 25s infinite both}
.film .v17{opacity:0;animation:v17 25s infinite both}
.film .v18{opacity:0;animation:v18 25s infinite both}
.film .v19{opacity:0;animation:v19 25s infinite both}
.film .v20{animation:v20 25s infinite both}
.film .v21{opacity:0;animation:v21 25s infinite both}
.film .v22{animation:v22 25s infinite ease-in-out both}
.film .v23{opacity:0;animation:v23 25s infinite both}
.film .v24{animation:v24 25s infinite both}
.film .v25{opacity:0;animation:v25 25s infinite both}
.film .v26{animation:v26 25s infinite ease-in-out both}
.film .v27{opacity:0;animation:v27 25s infinite both}
.film .v28{opacity:0;animation:v28 25s infinite both}
.film .v29{opacity:0;animation:v29 25s infinite both}
.film .v30{opacity:0;animation:v30 25s infinite both}
.legende .l1{animation:l1 25s infinite both}
.legende .l2{animation:l2 25s infinite both}
.legende .l3{animation:l3 25s infinite both}
@keyframes v1{0%,6.70%{opacity:0}7.00%,20.00%{opacity:1}20.30%,100%{opacity:0}}
@keyframes v2{0%,13.70%{opacity:0}14.00%,20.00%{opacity:1}20.30%,100%{opacity:0}}
@keyframes v3{0%,5.70%{opacity:0}6.00%,9.00%{opacity:1}9.30%,100%{opacity:0}}
@keyframes v4{0%,13.70%{opacity:0}14.00%,17.00%{opacity:1}17.30%,100%{opacity:0}}
@keyframes v5{0%{transform:translate(420px,220px)}0.00%{transform:translate(420px,220px)}5.00%{transform:translate(44px,326px)}8.00%{transform:translate(44px,326px)}13.00%{transform:translate(104px,226px)}100%{transform:translate(104px,226px)}}
@keyframes v6{0.00%,20.00%{opacity:1}20.30%,100%{opacity:0}}
@keyframes v7{0%,24.20%{opacity:0}24.50%,40.00%{opacity:1}40.30%,100%{opacity:0}}
@keyframes v8{0%,24.70%{opacity:0}25.00%,40.00%{opacity:1}40.30%,100%{opacity:0}}
@keyframes v9{0%,29.70%{opacity:0}30.00%,40.00%{opacity:1}40.30%,100%{opacity:0}}
@keyframes v10{0%,34.70%{opacity:0}35.00%,40.00%{opacity:1}40.30%,100%{opacity:0}}
@keyframes v11{0%,29.30%{fill:var(--carte)}29.50%,32.50%{fill:var(--surligne-fond)}32.80%,100%{fill:var(--carte)}}
@keyframes v12{0%,23.70%{opacity:0}24.00%,27.00%{opacity:1}27.30%,100%{opacity:0}}
@keyframes v13{0%,29.20%{opacity:0}29.50%,32.50%{opacity:1}32.80%,100%{opacity:0}}
@keyframes v14{0%,34.70%{opacity:0}35.00%,38.00%{opacity:1}38.30%,100%{opacity:0}}
@keyframes v15{0%{transform:translate(330px,280px)}20.00%{transform:translate(330px,280px)}23.50%{transform:translate(94px,184px)}25.00%{transform:translate(94px,184px)}29.00%{transform:translate(549px,121px)}30.50%{transform:translate(549px,121px)}34.50%{transform:translate(474px,170px)}100%{transform:translate(474px,170px)}}
@keyframes v16{0%,19.70%{opacity:0}20.00%,40.00%{opacity:1}40.30%,100%{opacity:0}}
@keyframes v17{0%,42.70%{opacity:0}43.00%,60.00%{opacity:1}60.30%,100%{opacity:0}}
@keyframes v18{0%,46.70%{opacity:0}47.00%,60.00%{opacity:1}60.30%,100%{opacity:0}}
@keyframes v19{0%,46.70%{opacity:0}47.00%,60.00%{opacity:1}60.30%,100%{opacity:0}}
@keyframes v20{0%,53.80%{fill:var(--vert)}54.00%,57.00%{fill:var(--encre)}57.30%,100%{fill:var(--vert)}}
@keyframes v21{0%,53.70%{opacity:0}54.00%,57.00%{opacity:1}57.30%,100%{opacity:0}}
@keyframes v22{0%{transform:translate(560px,330px)}40.00%{transform:translate(560px,330px)}45.00%{transform:translate(300px,226px)}48.00%{transform:translate(300px,226px)}53.00%{transform:translate(452px,292px)}100%{transform:translate(452px,292px)}}
@keyframes v23{0%,39.70%{opacity:0}40.00%,60.00%{opacity:1}60.30%,100%{opacity:0}}
@keyframes v24{0%,72.80%{fill:var(--vert)}73.00%,76.00%{fill:var(--encre)}76.30%,100%{fill:var(--vert)}}
@keyframes v25{0%,72.70%{opacity:0}73.00%,76.00%{opacity:1}76.30%,100%{opacity:0}}
@keyframes v26{0%{transform:translate(560px,330px)}60.00%{transform:translate(560px,330px)}66.00%{transform:translate(560px,330px)}72.00%{transform:translate(400px,286px)}100%{transform:translate(400px,286px)}}
@keyframes v27{0%,59.70%{opacity:0}60.00%,80.00%{opacity:1}80.30%,100%{opacity:0}}
@keyframes v28{0%,82.70%{opacity:0}83.00%,100.00%{opacity:1}}
@keyframes v29{0%,89.70%{opacity:0}90.00%,100.00%{opacity:1}}
@keyframes v30{0%,79.70%{opacity:0}80.00%,100.00%{opacity:1}}
@keyframes l1{0.00%,59.90%{color:var(--encre);border-color:var(--surligneur)}60.00%,100%{color:var(--encre-douce);border-color:transparent}}
@keyframes l2{0%,59.90%{color:var(--encre-douce);border-color:transparent}60.00%,79.90%{color:var(--encre);border-color:var(--surligneur)}80.00%,100%{color:var(--encre-douce);border-color:transparent}}
@keyframes l3{0%,79.90%{color:var(--encre-douce);border-color:transparent}80.00%,99.90%{color:var(--encre);border-color:var(--surligneur)}}
@media (prefers-reduced-motion:reduce){
  .film *{animation:none!important}
  .film .fixe,.film .fixe *{opacity:1}
  .film .fixe .curseur{transform:translate(452px,292px)}
  .film .fixe g:has(> circle[r="14"]){opacity:0}
}
</style>
</head>
<body>
<!-- Les motifs des schémas -->
<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <defs>
    <pattern id="hachures" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(40)">
      <line x1="0" y1="0" x2="0" y2="7" stroke="var(--encre)" stroke-width="1.2" opacity=".35"/>
    </pattern>
  </defs>
</svg>


<header class="entete">
  <div class="enveloppe">
    <a class="logo" href="#haut" aria-label="vavi, accueil">
      <svg viewBox="0 0 40 40" fill="none" stroke="var(--encre)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="6" y="12" width="20" height="18" rx="5" fill="var(--surligneur)"/><path d="M12 12V5M20 12V5M26 21h8"/>
      </svg>
      vavi
    </a>
    <nav class="nav" aria-label="Sections">
      <a href="#fiable">Pourquoi vavi</a>
      <a href="#tourne">Ce que fait vavi</a>
      <a href="#etapes">Comment ça marche</a>
      <a href="#prix">Prix</a>
      <a href="#questions">Questions</a>
    </nav>
    __AUTRE_LANGUE__
    <a class="bouton" href="__CONSOLE__/projets">Ma console</a>
  </div>
</header>

<main id="haut">

<!-- ═════════ OUVERTURE ═════════ -->
<div class="ouverture cote-a-cote">
  <div class="enveloppe">
    <div class="texte">
      <span class="note">votre abonnement Claude suffit : aucun crédit d'IA à acheter</span>
      <h1>Claude écrit votre site. <span class="surligne">vavi le fait tourner.</span> Vous le pilotez.</h1>
      <p class="chapeau">Vous décrivez votre site à Claude, dans l'abonnement que vous avez déjà. vavi lui donne <strong>une vraie base de données, des comptes clients, les paiements et l'hébergement en Europe</strong>, et vous donne une console pour tout piloter.</p>
      <div class="gestes">
        <a class="bouton plein vedette" href="__LIEN_D_INSTALLATION__" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>Ajouter vavi à Claude</a>
        <a class="bouton" href="#etapes">Comment ça marche</a>
      </div>
      <div class="adresse-haut">
        <span>Le lien de vavi, à coller dans Claude si le bouton ne s'ouvre pas :</span>
        <div class="copie"><code id="adresse-mcp-haut">__ADRESSE_MCP__</code><button type="button" data-copier="adresse-mcp-haut">Copier</button></div>
      </div>
      <p style="color:var(--encre-douce);font-size:.95rem">Essai gratuit, sans carte bancaire. Vous ne payez vavi que pour publier.</p>
    </div>
    <figure class="ecran-claude">
      <img src="__IMAGES__/claude-et-planning.png" alt="Claude.ai : la conversation à gauche, l'app de planning de chantiers dans le panneau vavi à droite, avec le bouton Publier" width="1607" height="852">
      <figcaption>Capture réelle : vous parlez à Claude à gauche, votre site se construit à droite.</figcaption>
    </figure>
  </div>
</div>

<!-- ═════════ CE QUE CLAUDE NE FAIT PAS SEUL ═════════ -->
<section id="fiable" aria-labelledby="t-fiable">
  <div class="enveloppe">
    <div class="titre-section">
      <span class="main">Pourquoi vavi</span>
      <h2 id="t-fiable">Ce que Claude ne fait pas seul</h2>
      <p>Les règles ne sont pas des consignes qu'il pourrait oublier : ce sont les outils de vavi qui les tiennent.</p>
    </div>
    <ol class="essais">
      <li><b>Il ne peut pas tricher pour faire passer une erreur</b><span>Pas d'erreur masquée, pas de fichier du cadre réécrit, pas de paquet douteux. Après trois essais ratés, il s'arrête et propose de revenir en arrière, au lieu d'user votre abonnement en boucle.</span></li>
      <li><b>Il essaie votre site avant de vous le montrer</b><span>Dans un vrai navigateur : il clique, remplit, crée un compte et un panier sur une copie de votre base, regarde l'accueil sur ordinateur et sur téléphone. Il ne dit « ça marche » qu'après.</span></li>
      <li><b>La sécurité vient de la structure</b><span>Claude dit qui a le droit de faire quoi. vavi écrit la base et ses règles d'accès : un client ne voit jamais les données d'un autre, et aucune clé secrète n'arrive dans le code.</span></li>
      <li><b>Vous n'avez pas à tout réexpliquer</b><span>vavi garde vos choix, la structure du projet et chaque version. Une nouvelle conversation reprend là où la précédente s'est arrêtée.</span></li>
    </ol>
    <p class="ligne-design"><b>Et un design qui évite les clichés des sites générés par IA</b> : une direction artistique écrite pour votre sujet, avec des photos de votre métier.</p>
  </div>
</section>

<!-- ═════════ CE QUI TOURNE ═════════ -->
<section id="tourne" aria-labelledby="t-tourne">
  <div class="enveloppe">
    <div class="titre-section">
      <span class="main">Après la conversation</span>
      <h2 id="t-tourne">Claude écrit le code. vavi fait tourner tout le reste.</h2>
      <p>Une conversation se ferme, votre site doit continuer de marcher. C'est le travail de vavi, et vous le pilotez depuis votre console.</p>
    </div>
    <div class="tourne">
      <ul class="ce-qui-tourne">
        <li><b>Une base de données à vous</b><span>Vos produits, réservations ou dossiers, rangés dans leurs tables. Vous les modifiez, importez et exportez depuis la console.</span></li>
        <li><b>Des comptes pour vos clients</b><span>Inscription, connexion, rôles. Chaque client ne voit que ce qui le concerne : vavi pose lui-même les règles d'accès.</span></li>
        <li><b>Les paiements sur votre compte</b><span>vavi ouvre votre compte Stripe depuis la console. TVA par article, factures numérotées, stock.</span></li>
        <li><b>Vos messages, sans spam</b><span>Chaque formulaire est filtré, puis arrive dans votre boîte de réception et par courriel.</span></li>
        <li><b>Vos visites, sans cookie</b><span>Combien de visiteurs, et d'où ils viennent, assistants IA compris. Aucun bandeau de cookies à afficher.</span></li>
        <li><b>Trouvé par Google et par les assistants IA</b><span>Pages lisibles sans JavaScript, plan du site, llms.txt. Vous choisissez quels robots d'IA peuvent lire votre site.</span></li>
        <li><b>Vos versions et le bouton Publier</b><span>Chaque changement est gardé. Vous publiez quand ça vous plaît, et vous revenez en arrière d'un clic.</span></li>
      </ul>
      <figure class="capture-console">
        <img src="__IMAGES__/console-vue-d-ensemble.png" alt="La console vavi : vue d'ensemble d'un projet, son état, ses visites, ses messages et le travail en cours avec Claude" width="1896" height="822" loading="lazy">
        <figcaption>Capture réelle de la console vavi.</figcaption>
      </figure>
    </div>
    <ul class="surete" aria-label="Ce qui protège votre site">
      <li>Une version qui ne se construit pas ne part jamais en ligne.</li>
      <li>Vous seul publiez : Claude ne peut rien mettre en ligne.</li>
      <li>Aucune clé secrète dans le code ni chez vos visiteurs.</li>
    </ul>
  </div>
</section>

<!-- ═════════ LES ÉTAPES ═════════ -->
<section id="etapes" aria-labelledby="t-etapes">
  <div class="enveloppe">
    <div class="titre-section">
      <span class="main">Comment ça marche</span>
      <h2 id="t-etapes">Deux minutes pour brancher vavi, puis vous parlez à Claude</h2>
      <p>Cliquez sur une étape pour voir le détail.</p>
    </div>

    <div class="demarrer">
      <div class="kit">
        <span class="main" style="font-size:1.5rem;color:var(--vert)">Tout ce qu'il vous faut</span>
        <a class="bouton plein" href="__LIEN_D_INSTALLATION__" target="_blank" rel="noopener">Ajouter vavi à Claude</a>
        <p>Le bouton ouvre Claude.ai avec vavi déjà rempli. Un compte Claude suffit : l'offre gratuite permet un connecteur personnalisé.</p>
        <p class="chemin"><b>Le bouton ne s'ouvre pas ?</b> Dans Claude.ai : icône de votre compte → <kbd>Réglages</kbd> → <kbd>Plug-ins</kbd> (ou <kbd>Connecteurs</kbd>) → <kbd>Ajouter</kbd> → <kbd>Ajouter un connecteur personnalisé</kbd>. Nom : <b>vavi</b>. Adresse :</p>
        <div class="copie grande"><code id="adresse-mcp">__ADRESSE_MCP__</code><button type="button" data-copier="adresse-mcp">Copier</button></div>
      </div>
      <figure class="film" aria-label="Animation : les trois étapes pour brancher vavi dans Claude">
  <svg class="croquis" viewBox="0 0 640 360" fill="none" stroke="var(--encre)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="1, dans Claude.ai : l'icône de votre compte, Réglages, Plug-ins, Ajouter, Ajouter un connecteur personnalisé, puis le nom vavi et son adresse ; 2, vous vous connectez et autorisez Claude ; 3, vous décrivez votre projet et l'aperçu apparaît">
    <g>
      <rect x="10" y="10" width="620" height="340" rx="18" fill="var(--papier)"/>
      <path d="M10 46h620"/><circle cx="34" cy="28" r="6"/><circle cx="54" cy="28" r="6"/><circle cx="74" cy="28" r="6"/>
      <rect x="110" y="18" width="300" height="20" rx="10" fill="var(--carte)"/>
    </g>
    <g class="scene v6">
      <text x="124" y="34" font-size="12.6">claude.ai</text>
      <g>
        <path d="M150 46v304"/>
        <path d="M30 80h96M30 104h80M30 128h90"/>
        <circle cx="40" cy="322" r="15" fill="var(--surligneur)"/>
        <path d="M220 90h300M220 112h240M220 134h270"/>
        <rect x="220" y="270" width="380" height="50" rx="14" fill="var(--carte)"/>
      </g>
      <text x="35" y="328" font-size="13.4" font-weight="700">A</text>
      <text x="62" y="300" font-size="16" style="fill:var(--vert)" transform="rotate(-5 62 300)">votre compte</text>
      <g class="v1">
        <g><rect x="30" y="196" width="190" height="100" rx="12" fill="var(--carte)"/></g>
        <rect class="v2" x="38" y="206" width="174" height="30" rx="8" fill="var(--surligne-fond)" stroke="none"/>
        <text x="50" y="227" font-size="15.1" font-weight="700">Réglages</text>
        <text x="50" y="256" font-size="14.3" style="fill:var(--encre-douce)">Langue</text>
        <text x="50" y="284" font-size="14.3" style="fill:var(--encre-douce)">Se déconnecter</text>
      </g>
      <g class="v3"><circle cx="40" cy="322" r="14" stroke="var(--vert)"/></g>
      <g class="v4"><circle cx="100" cy="222" r="14" stroke="var(--vert)"/></g>
      <g class="curseur v5"><path d="M0 0l12 30 6-12 14 12 5-5-13-13 13-5z" fill="var(--carte)"/></g>
    </g>
    <g class="scene v16">
      <text x="124" y="34" font-size="12.6">claude.ai · réglages</text>
      <g><path d="M190 60v280"/></g>
      <text x="30" y="86" font-size="20.2" font-weight="700">Réglages</text>
      <rect class="v7" x="24" y="164" width="150" height="30" rx="8" fill="var(--surligne-fond)" stroke="none"/>
      <text x="34" y="124" font-size="15.1" style="fill:var(--encre-douce)">Général</text>
      <text x="34" y="154" font-size="15.1" style="fill:var(--encre-douce)">Compte</text>
      <text x="34" y="185" font-size="15.1" font-weight="700">Plug-ins</text>
      <text x="34" y="216" font-size="15.1" style="fill:var(--encre-douce)">Confidentialité</text>
      <g class="v8">
        <text x="214" y="124" font-size="18.5" font-weight="700">Plug-ins</text>
        <path d="M214 160h200M214 182h150"/>
        <g><rect class="v11" x="490" y="100" width="110" height="34" rx="9" fill="var(--carte)"/></g>
        <text x="512" y="123" font-size="15.1">Ajouter ▾</text>
      </g>
      <g class="v9">
        <g><rect x="300" y="144" width="300" height="76" rx="12" fill="var(--carte)"/></g>
        <rect class="v10" x="308" y="150" width="284" height="30" rx="8" fill="var(--surligne-fond)" stroke="none"/>
        <text x="318" y="171" font-size="14.3" font-weight="700">Ajouter un connecteur personnalisé</text>
        <text x="318" y="205" font-size="14.3" style="fill:var(--encre-douce)">Importer un plug-in</text>
        <text x="420" y="250" font-size="16" style="fill:var(--marge)" transform="rotate(-4 420 250)">pas celui-là ↑</text>
      </g>
      <g class="v12"><circle cx="90" cy="180" r="14" stroke="var(--vert)"/></g>
      <g class="v13"><circle cx="545" cy="117" r="14" stroke="var(--vert)"/></g>
      <g class="v14"><circle cx="470" cy="166" r="14" stroke="var(--vert)"/></g>
      <g class="curseur v15"><path d="M0 0l12 30 6-12 14 12 5-5-13-13 13-5z" fill="var(--carte)"/></g>
    </g>
    <g class="scene fixe v23">
      <text x="124" y="34" font-size="12.6">claude.ai · nouveau connecteur</text>
      <g>
        <rect x="150" y="70" width="340" height="250" rx="16" fill="var(--carte)"/>
        <rect x="176" y="136" width="288" height="36" rx="9" fill="var(--surligne-fond)"/>
        <rect x="176" y="206" width="288" height="36" rx="9" fill="var(--surligne-fond)"/>
        <rect class="v20" x="356" y="262" width="108" height="38" rx="10" fill="var(--vert)"/>
      </g>
      <text x="176" y="106" font-size="20.2" font-weight="700">Nouveau connecteur</text>
      <text x="178" y="130" font-size="12.6" style="fill:var(--encre-douce)">Nom</text>
      <text class="v17" x="190" y="161" font-size="16">vavi</text>
      <text x="178" y="200" font-size="12.6" style="fill:var(--encre-douce)">Adresse</text>
      <text class="v18" x="190" y="231" font-size="14.3">vavi.dev/api/mcp</text>
      <text x="380" y="288" font-size="16.8" style="fill:#fff">Ajouter</text>
      <g class="v19">
        <text x="500" y="214" font-size="16.8" style="fill:var(--vert)" transform="rotate(-6 500 214)">collez</text>
        <text x="500" y="238" font-size="16.8" style="fill:var(--vert)" transform="rotate(-6 500 238)">l'adresse</text>
      </g>
      <g class="v21"><circle cx="452" cy="292" r="14" stroke="var(--vert)"/></g>
      <g class="curseur v22"><path d="M0 0l12 30 6-12 14 12 5-5-13-13 13-5z" fill="var(--carte)"/></g>
    </g>
    <g class="scene v27">
      <text x="124" y="34" font-size="12.6">vavi · autoriser Claude</text>
      <g>
        <rect x="170" y="66" width="300" height="262" rx="16" fill="var(--carte)"/>
        <circle cx="268" cy="114" r="24" fill="var(--surligneur)"/>
        <path d="M300 114h36M330 106l8 8-8 8"/>
        <circle cx="372" cy="114" r="24" fill="var(--carte)"/><path d="M362 110c5-9 15-9 20 0M360 120c7 7 17 7 24 0"/>
        <rect x="196" y="186" width="248" height="36" rx="9" fill="var(--surligne-fond)"/>
        <rect class="v24" x="226" y="250" width="188" height="44" rx="11" fill="var(--vert)"/>
      </g>
      <text x="252" y="120" font-size="14.3" font-weight="700">vavi</text>
      <text x="216" y="172" font-size="16">Claude demande l'accès</text>
      <text x="208" y="211" font-size="15.1">vous@exemple.fr</text>
      <text x="276" y="280" font-size="20.2" style="fill:#fff">Autoriser</text>
      <text x="486" y="210" font-size="16.8" style="fill:var(--vert)" transform="rotate(5 486 210)">sans mot</text>
      <text x="486" y="232" font-size="16.8" style="fill:var(--vert)" transform="rotate(5 486 232)">de passe</text>
      <g class="v25"><circle cx="400" cy="286" r="14" stroke="var(--vert)"/></g>
      <g class="curseur v26"><path d="M0 0l12 30 6-12 14 12 5-5-13-13 13-5z" fill="var(--carte)"/></g>
    </g>
    <g class="scene v30">
      <text x="124" y="34" font-size="12.6">claude.ai · nouvelle conversation</text>
      <g class="v28">
        <g><rect x="250" y="66" width="360" height="74" rx="14" fill="var(--surligne-fond)"/></g>
        <text x="266" y="96" font-size="16">Avec vavi, fais le site</text>
        <text x="266" y="122" font-size="16">de ma boulangerie…</text>
      </g>
      <g class="v29">
        <g>
          <rect x="40" y="160" width="400" height="170" rx="14" fill="var(--carte)"/>
          <path d="M40 188h400M62 216h150M62 236h110"/>
          <rect x="62" y="262" width="100" height="32" rx="9" fill="var(--vert)"/>
          <path d="M300 300c-6-34 22-52 56-52s62 18 56 52z" fill="url(#hachures)"/>
        </g>
        <text x="56" y="181" font-size="13.4" font-weight="700">Aperçu · Le Fournil</text>
        <text x="78" y="284" font-size="14.3" style="fill:#fff">Commander</text>
        <text x="462" y="250" font-size="20.2" style="fill:var(--vert)" transform="rotate(-6 462 250)">votre aperçu !</text>
      </g>
    </g>
  </svg>
  <figcaption class="legende"><span class="l1">1. Ajouter vavi</span><span class="l2">2. Autoriser Claude</span><span class="l3">3. Décrire votre projet</span></figcaption>
</figure>
    </div>

    <div class="liste-etapes">
      <p class="groupe-etapes main">Une seule fois, deux minutes</p>
      <details class="etape-d" name="etapes" open>
        <summary><span class="num main">1</span><span class="resume"><b>Ajoutez vavi à Claude, d'un bouton</b><span>Un bouton, puis Ajouter.</span></span><span class="duree">1 min · une fois</span><span class="plus" aria-hidden="true"></span></summary>
        <div class="detail">
<div class="corps">
          <ol class="sous">
            <li><span>Le bouton ouvre Claude.ai avec le nom et l'adresse de vavi déjà remplis. Connectez-vous à Claude si on vous le demande.</span></li>
            <li><span>Vérifiez que le nom est <b>vavi</b>, puis cliquez sur <kbd>Ajouter</kbd>.</span></li>
          </ol>
          <p class="astuce">Le bouton ne s'ouvre pas ? Suivez le chemin de l'encadré au-dessus, avec l'adresse à copier.</p>
        </div>
          <svg class="croquis dessin" viewBox="0 0 320 200" fill="none" stroke="var(--encre)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <g>
            <rect x="14" y="14" width="292" height="172" rx="14" fill="var(--papier)"/>
            <rect x="34" y="66" width="252" height="30" rx="8" fill="var(--carte)"/>
            <rect x="34" y="104" width="252" height="30" rx="8" fill="var(--carte)"/>
            <rect x="186" y="144" width="100" height="32" rx="9" fill="var(--vert)"/>
          </g>
          <text x="34" y="50" font-size="16" font-weight="700">Nouveau connecteur</text>
          <text x="46" y="87" font-size="13.4">vavi</text>
          <text x="46" y="125" font-size="13.4">vavi.dev/api/mcp</text>
          <text x="206" y="166" font-size="15.1" style="fill:#fff">Ajouter</text>
          <text x="36" y="166" font-size="15.1" style="fill:var(--vert)" transform="rotate(-6 36 166)">déjà rempli ↑</text>
        </svg>
        </div>
      </details>
      <details class="etape-d" name="etapes">
        <summary><span class="num main">2</span><span class="resume"><b>Connectez-vous et autorisez Claude</b><span>Un lien reçu par courriel, puis Autoriser.</span></span><span class="duree">1 min · une fois</span><span class="plus" aria-hidden="true"></span></summary>
        <div class="detail">
<div class="corps">
          <ol class="sous">
            <li><span>À côté de vavi, cliquez sur <kbd>Se connecter</kbd>. Une page vavi s'ouvre.</span></li>
            <li><span>Tapez votre adresse e-mail. Ouvrez le courriel de vavi et cliquez sur le lien : votre compte vavi est créé, sans mot de passe.</span></li>
            <li><span>Cliquez sur <kbd>Autoriser</kbd>. Vous revenez dans Claude.ai, et vavi apparaît comme connecté.</span></li>
          </ol>
          <p>Claude peut alors travailler sur vos projets vavi, et seulement eux.</p>
          <p class="astuce">Vous pouvez retirer cet accès à tout moment depuis votre console vavi.</p>
        </div>
          <svg class="croquis dessin" viewBox="0 0 320 200" fill="none" stroke="var(--encre)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <g>
            <rect x="46" y="12" width="228" height="176" rx="14" fill="var(--papier)"/>
            <circle cx="110" cy="56" r="20" fill="var(--surligneur)"/>
            <path d="M138 56h30M162 48l8 8-8 8"/>
            <circle cx="206" cy="56" r="20" fill="var(--carte)"/><path d="M198 52c4-8 12-8 16 0M196 62c6 6 14 6 20 0"/>
            <rect x="80" y="124" width="160" height="38" rx="10" fill="var(--vert)"/>
            <path d="M224 170l10 24 5-10 11 9 4-5-10-9 10-4z" fill="var(--carte)"/>
          </g>
          <text x="96" y="62" font-size="13.4" font-weight="700">vavi</text>
          <text x="78" y="104" font-size="14.3">Claude demande l'accès</text>
          <text x="122" y="150" font-size="18.5" style="fill:#fff">Autoriser</text>
        </svg>
        </div>
      </details>
      <p class="groupe-etapes main">Ensuite, vous parlez à Claude</p>
      <details class="etape-d" name="etapes">
        <summary><span class="num main">3</span><span class="resume"><b>Décrivez votre projet, avec vos mots</b><span>Avec vos mots, dans une conversation.</span></span><span class="duree">à chaque projet</span><span class="plus" aria-hidden="true"></span></summary>
        <div class="detail">
<div class="corps">
          <p class="attention"><b>Avant d'écrire :</b> dans une nouvelle conversation, ouvrez le menu des outils, sous la zone où vous tapez, et activez <b>vavi</b>. Sans ça, Claude ne voit pas vavi.</p>
          <p>Collez ce premier message, puis complétez-le avec vos mots :</p>
          <div class="copie"><code id="premier-message">__PREMIER_MESSAGE__…</code><button type="button" data-copier="premier-message" data-texte="__PREMIER_MESSAGE__">Copier</button></div>
          <p>Dites ensuite ce que vous voulez. Claude vous pose les questions qui manquent, puis écrit les pages, la base de données et les paiements dans votre projet vavi.</p>
          <p class="exemple">« Fais le site de ma boulangerie. Je veux que les clients puissent commander un gâteau et venir le chercher le samedi. »</p>
          <p class="astuce">Joignez un logo, des photos, une carte des prix : Claude s'en sert.</p>
          <p><b>Pour ne plus avoir à écrire « Avec vavi »</b>, collez une fois cette phrase dans Claude.ai : icône de votre compte, <kbd>Réglages</kbd>, puis le champ <kbd>Préférences personnelles</kbd>. Claude la lit dans chaque conversation.</p>
          <div class="copie"><code id="preference">__PREFERENCE__</code><button type="button" data-copier="preference">Copier</button></div>
        </div>
          <svg class="croquis dessin" viewBox="0 0 320 200" fill="none" stroke="var(--encre)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <g>
            <rect x="120" y="14" width="180" height="52" rx="12" fill="var(--surligne-fond)"/>
            <rect x="20" y="82" width="200" height="56" rx="12" fill="var(--carte)"/>
            <path d="M36 104h150M36 120h110"/>
            <rect x="200" y="140" width="96" height="50" rx="6" fill="var(--carte)"/>
            <path d="M200 156h96M214 172h50"/>
            <path d="M262 120l26-26 8 8-26 26-12 4z" fill="var(--surligneur)"/>
          </g>
          <text x="132" y="38" font-size="14.3">Je veux un site pour</text>
          <text x="132" y="57" font-size="14.3">ma boulangerie…</text>
          <text x="36" y="160" font-size="14.3" style="fill:var(--encre-douce)">Qui prépare les commandes ?</text>
          <text x="214" y="152" font-size="10.9">accueil.tsx</text>
        </svg>
        </div>
      </details>
      <details class="etape-d" name="etapes">
        <summary><span class="num main">4</span><span class="resume"><b>Regardez l'aperçu, demandez des changements</b><span>Il s'affiche à côté de la conversation. Demandez les changements.</span></span><span class="duree">autant que vous voulez</span><span class="plus" aria-hidden="true"></span></summary>
        <div class="detail">
<div class="corps">
          <p>L'aperçu s'ouvre dans Claude, à côté de la conversation, et Claude vous donne aussi son lien privé. Regardez-le sur votre ordinateur et sur votre téléphone. Quelque chose ne va pas ? Dites-le à Claude, en une phrase : il lit ce qui existe avant de le modifier.</p>
          <p class="exemple">« Mets les gâteaux du week-end en premier, et le bouton Commander en plus grand. »</p>
        </div>
          <svg class="croquis dessin" viewBox="0 0 320 200" fill="none" stroke="var(--encre)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <g>
            <rect x="14" y="20" width="210" height="140" rx="10" fill="var(--carte)"/>
            <path d="M14 42h210M2 172h234l-12-12H14z"/>
            <path d="M32 64h90M32 80h70"/><rect x="32" y="96" width="54" height="18" rx="6" fill="var(--vert)"/>
            <path d="M120 140c-4-24 14-36 38-36s44 12 40 36z" fill="url(#hachures)"/>
            <rect x="236" y="40" width="72" height="140" rx="14" fill="var(--carte)"/>
            <path d="M250 70h44M250 84h30"/><rect x="250" y="98" width="34" height="14" rx="5" fill="var(--vert)"/>
            <path d="M250 150c-2-14 8-22 22-22s24 8 22 22z" fill="url(#hachures)"/>
            <path d="M264 56h16"/>
          </g>
          <text x="30" y="36" font-size="10.9">aperçu privé</text>
          <text x="40" y="196" font-size="16" style="fill:var(--vert)">pareil sur téléphone →</text>
        </svg>
        </div>
      </details>
      <p class="groupe-etapes main">Puis, dans votre console vavi</p>
      <details class="etape-d" name="etapes">
        <summary><span class="num main">5</span><span class="resume"><b>Ouvrez votre compte de paiement</b><span>Seulement si votre site vend.</span></span><span class="duree">une fois</span><span class="plus" aria-hidden="true"></span></summary>
        <div class="detail">
<div class="corps">
          <p>Votre site vend ou prend des acomptes ? Cliquez sur <b>Ouvrir mon compte Stripe</b>. vavi crée le compte et vous emmène sur le formulaire sécurisé de Stripe : pièce d'identité, RIB, numéro d'entreprise. Vous ne le faites qu'une fois, et l'argent des ventes arrive sur votre compte.</p>
          <p class="astuce">Un site vitrine sans paiement saute cette étape.</p>
        </div>
          <svg class="croquis dessin" viewBox="0 0 320 200" fill="none" stroke="var(--encre)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <g>
            <rect x="14" y="20" width="150" height="160" rx="12" fill="var(--papier)"/>
            <rect x="30" y="120" width="118" height="36" rx="10" fill="var(--vert)"/>
            <path d="M30 56h90M30 74h70"/>
            <path class="trace" d="M170 138c30 0 40-40 62-46"/><path d="M222 82l12 10-14 6"/>
            <rect x="196" y="22" width="110" height="160" rx="12" fill="var(--carte)"/>
            <rect x="212" y="98" width="78" height="22" rx="5" fill="var(--surligne-fond)"/>
            <rect x="212" y="130" width="78" height="22" rx="5"/>
            <path d="M226 60l6 6 12-14" stroke="var(--vert)" stroke-width="2"/>
          </g>
          <text x="30" y="44" font-size="14.3" font-weight="700">Paiements</text>
          <text x="38" y="144" font-size="13.4" style="fill:#fff">Ouvrir mon compte</text>
          <text x="252" y="66" font-size="12.6">Stripe</text>
          <text x="216" y="114" font-size="11.8">pièce d'identité</text>
          <text x="216" y="146" font-size="11.8">RIB</text>
        </svg>
        </div>
      </details>
      <details class="etape-d" name="etapes">
        <summary><span class="num main">6</span><span class="resume"><b>Publiez, d'un bouton</b><span>Un clic dans la console.</span></span><span class="duree">quand ça vous plaît</span><span class="plus" aria-hidden="true"></span></summary>
        <div class="detail">
<div class="corps">
          <p>Quand l'aperçu vous plaît, ouvrez votre console vavi et cliquez sur <b>Publier</b>. Votre site est en ligne, avec son adresse sécurisée. C'est toujours vous qui publiez : Claude ne met rien en ligne à votre place.</p>
          <p class="astuce">vavi ne publie qu'une version qui se construit sans erreur.</p>
        </div>
          <svg class="croquis dessin" viewBox="0 0 320 200" fill="none" stroke="var(--encre)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <g>
            <rect x="14" y="14" width="292" height="172" rx="14" fill="var(--papier)"/>
            <path d="M14 46h292"/>
            <rect x="34" y="66" width="130" height="90" rx="8" fill="var(--carte)"/>
            <path d="M46 84h80M46 98h60"/>
            <path d="M48 130l10 10 20-22" stroke="var(--vert)" stroke-width="2"/>
            <rect x="186" y="92" width="102" height="44" rx="12" fill="var(--vert)"/>
            <path d="M270 140l9 22 5-9 10 8 4-5-9-8 9-4z" fill="var(--carte)"/>
            <path d="M296 84l10-8M298 100h12"/>
          </g>
          <text x="30" y="36" font-size="14.3" font-weight="700">Console vavi · Boulangerie</text>
          <text x="84" y="146" font-size="12.6" style="fill:var(--vert)">prêt</text>
          <text x="206" y="121" font-size="19.3" font-weight="700" style="fill:#fff">Publier</text>
        </svg>
        </div>
      </details>
      <details class="etape-d" name="etapes">
        <summary><span class="num main">7</span><span class="resume"><b>Gérez votre activité</b><span>Commandes, clients, visites, textes et couleurs.</span></span><span class="duree">au quotidien</span><span class="plus" aria-hidden="true"></span></summary>
        <div class="detail">
<div class="corps">
          <p>Dans la console, vous retrouvez vos commandes, vos clients, vos factures, vos visites et toutes les données de votre site. Vous changez vous-même les couleurs, les polices et le référencement de vos pages. Une modification ne vous plaît pas ? Revenez à la version d'avant en un clic.</p>
          <p class="astuce">Pour faire évoluer le site, revenez simplement parler à Claude.</p>
        </div>
          <svg class="croquis dessin" viewBox="0 0 320 200" fill="none" stroke="var(--encre)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <g>
            <rect x="14" y="14" width="292" height="172" rx="14" fill="var(--papier)"/>
            <path d="M92 14v172"/>
            <rect x="22" y="40" width="62" height="22" rx="6" fill="var(--surligne-fond)"/>
            <path d="M28 82h46M28 104h40M28 126h50"/>
            <rect x="110" y="34" width="180" height="34" rx="8" fill="var(--carte)"/>
            <rect x="110" y="78" width="180" height="34" rx="8" fill="var(--carte)"/>
            <rect x="110" y="122" width="180" height="34" rx="8" fill="var(--carte)"/>
            <rect x="240" y="42" width="40" height="18" rx="9" fill="var(--vert-fond)"/>
            <rect x="240" y="86" width="40" height="18" rx="9" fill="var(--surligne-fond)"/>
          </g>
          <text x="26" y="56" font-size="12.6" font-weight="700">Commandes</text>
          <text x="28" y="78" font-size="11.8">Clients</text>
          <text x="28" y="100" font-size="11.8">Factures</text>
          <text x="28" y="122" font-size="11.8">Données</text>
          <text x="120" y="57" font-size="13.4">Fraisier · samedi</text>
          <text x="120" y="101" font-size="13.4">Tarte citron · samedi</text>
          <text x="120" y="145" font-size="13.4">Facture n° 2026-014</text>
          <text x="246" y="56" font-size="10.9">payée</text>
          <text x="244" y="100" font-size="10.9">à faire</text>
        </svg>
        </div>
      </details>
    </div>

    <details class="bloque-d">
      <summary>Vous êtes bloqué ?</summary>
<div class="bloque" aria-label="Si vous êtes bloqué">
      <div><span class="main" style="font-size:1.3rem;color:var(--marge)">Bloqué ?</span><b>Claude ne me laisse pas ajouter vavi</b><p>Sur l'offre gratuite de Claude, un seul connecteur personnalisé est permis : retirez d'abord l'autre, ou passez à une offre payante. Le bouton ne s'ouvre pas ? La <a href="__CONSOLE__/commencer">page Commencer</a> donne l'adresse à copier.</p></div>
      <div><span class="main" style="font-size:1.3rem;color:var(--marge)">Bloqué ?</span><b>Je n'ai pas reçu le courriel de connexion</b><p>Regardez dans les indésirables. Le lien reste valable quelques minutes : au besoin, cliquez de nouveau sur Se connecter.</p></div>
      <div><span class="main" style="font-size:1.3rem;color:var(--marge)">Bloqué ?</span><b>Claude ne parle pas de vavi</b><p>vavi n'est pas activé dans cette conversation. Ouvrez le menu des outils sous la zone de texte et cochez vavi.</p></div>
    </div>
    </details>
  </div>
</section>

<!-- ═════════ VOTRE ABONNEMENT CLAUDE ═════════ -->
<section id="abonnement" aria-labelledby="t-abonnement">
  <div class="enveloppe">
    <div class="titre-section">
      <span class="main">Votre abonnement Claude</span>
      <h2 id="t-abonnement">Votre abonnement Claude suffit</h2>
      <p>Ailleurs, chaque demande à l'IA consomme des crédits. Avec vavi, l'IA qui construit, c'est Claude, déjà payé par votre abonnement Claude.</p>
    </div>
    <div class="deux-blocs">
      <div class="bloc-abo">
        <h3>Aucun crédit qui fond</h3>
        <p>vavi ne vous vend ni messages ni crédits. Son prix est fixe par mois, que vous corrigiez trois fois ou trente.</p>
      </div>
      <div class="bloc-abo">
        <h3>Claude travaille moins</h3>
        <p>Claude n'écrit ni la base, ni les comptes, ni les paiements, ni la configuration : vavi les fournit. Il modifie des passages ciblés. Et les textes, photos, couleurs ou produits se changent dans la console, sans passer par Claude.</p>
      </div>
    </div>
  </div>
</section>

<!-- ═════════ LE COÛT ═════════ -->
<section id="prix" aria-labelledby="t-prix">
  <div class="enveloppe">
    <div class="titre-section">
      <span class="main">Le coût, sans surprise</span>
      <h2 id="t-prix">Combien ça coûte vraiment</h2>
      <p>Deux choses à payer, pas plus : votre abonnement Claude, que vous avez peut-être déjà, et vavi. Avec vavi, vous payez ce qui tourne après la génération : l'hébergement, la base, les paiements, le référencement. Pas le code.</p>
    </div>

    <div class="addition">
      <div class="ticket" aria-label="Exemple de facture mensuelle pour une boutique">
        <p class="main" style="font-size:1.4rem;margin-bottom:6px">Exemple : une boutique, un mois</p>
        <div class="ligne"><span>Abonnement vavi Boutique</span><span>__PRIX_BOUTIQUE_SEUL__</span></div>
        <div class="ligne"><span>Messages à Claude, corrections, essais</span><span class="zero">0 € chez vavi</span></div>
        <div class="ligne"><span>Hébergement, base, aperçu, publication</span><span class="zero">inclus</span></div>
        <div class="ligne"><span>Votre nom de domaine branché (bientôt)</span><span class="zero">inclus</span></div>
        <div class="ligne"><span>Total vavi</span><span>__PRIX_BOUTIQUE_SEUL__ / mois</span></div>
      </div>
      <div style="display:grid;gap:14px">
        <h3>Ce qui ne passe pas par vavi</h3>
        <p>Votre <b>abonnement Claude</b> se paie chez Anthropic, comme aujourd'hui. Les <b>frais de paiement Stripe</b> sont prélevés par Stripe sur chaque vente. L'achat d'un <b>nom de domaine</b> se fait chez le registraire de votre choix.</p>
        <p class="main" style="font-size:1.45rem;color:var(--vert)">Pas de crédit qui fond quand vous demandez une correction.</p>
      </div>
    </div>

    __BANDEAU_PROMO__
    <div class="offres">
      <div class="offre">
        <h3>Essai</h3>
        <p class="prix">0 € <small>aperçu seulement</small></p>
        <p class="pour">Pour découvrir et construire votre premier projet.</p>
        <ul><li>1 projet</li><li>Aperçu privé, pour tester avant de payer</li><li>Base, paiements en mode test</li><li>Rien n'est publié tant que vous n'avez pas choisi une offre</li></ul>
        <a class="bouton" href="#etapes">Commencer</a>
      </div>
      <div class="offre">
        <h3>Site</h3>
        <p class="prix">__PRIX_SITE__ <small>/ mois</small></p>__PROMO_OFFRE__
        <p class="pour">Un site vitrine pour présenter votre activité.</p>
        <ul><li>1 site publié</li><li>Votre nom de domaine (bientôt)</li><li>Design à vos couleurs</li><li>Pages RGPD et formulaire protégé du spam</li><li>Référencement et nombre de visites</li><li>Export du code et des données</li></ul>
        <a class="bouton" href="#etapes">Choisir Site</a>
      </div>
      <div class="offre vedette">
        <span class="etiquette">pour vendre</span>
        <h3>Boutique ou app</h3>
        <p class="prix">__PRIX_BOUTIQUE__ <small>/ mois</small></p>__PROMO_OFFRE__
        <p class="pour">Pour vendre en ligne ou gérer clients et dossiers.</p>
        <ul><li>Tout de l'offre Site</li><li>Compte Stripe ouvert depuis la console</li><li>Agents IA (bientôt)</li><li>TVA par article, factures numérotées</li><li>Comptes clients et rôles</li><li>Commandes et clients dans la console</li></ul>
        <a class="bouton plein" href="#etapes">Choisir Boutique</a>
      </div>
      <div class="offre">
        <h3>Pro</h3>
        <p class="prix">__PRIX_PRO__ <small>/ mois</small></p>__PROMO_OFFRE__
        <p class="pour">Pour plusieurs projets, ou pour vos clients.</p>
        <ul><li>5 projets, sites ou apps</li><li>Tout de l'offre Boutique</li><li>Export de chaque projet, code et données</li></ul>
        <a class="bouton" href="#etapes">Choisir Pro</a>
      </div>
    </div>
    <p class="en-plus">Un projet de plus, sur n'importe quelle offre payante : <b>__PRIX_EN_PLUS__ / mois</b>. Chaque offre engage 12 mois, payés chaque mois et reconduits tacitement ; après la première année, résiliable à tout moment.</p>
  </div>
</section>

<!-- ═════════ QUESTIONS ═════════ -->
<section id="questions" aria-labelledby="t-questions">
  <div class="enveloppe">
    <div class="titre-section">
      <span class="main">Vos questions</span>
      <h2 id="t-questions">Avant de commencer</h2>
    </div>
    <div class="questions">
      <details><summary>Faut-il savoir coder ?</summary><p>Non. Vous parlez à Claude comme à quelqu'un qui construit pour vous. Le code existe, il vous appartient, mais vous n'avez pas à le lire.</p></details>
      <details><summary>Quel abonnement Claude me faut-il ?</summary><p>Un compte Claude suffit pour commencer : l'offre gratuite permet un connecteur personnalisé, et vavi peut être celui-là. Une offre Claude payante vous laisse plus de messages et plusieurs connecteurs. vavi, lui, est gratuit à essayer : vous voyez tout de suite si ça marche chez vous.</p></details>
      <details><summary>Claude peut-il casser mon site en ligne ?</summary><p>Non. Claude travaille sur l'aperçu. Le site en ligne ne change que lorsque vous cliquez sur Publier, et une version avec une erreur ne se publie pas. Vous pouvez toujours revenir à la version précédente.</p></details>
      <details><summary>À qui appartiennent mon site et mes données ?</summary><p>À vous. Sur toutes les offres payantes, vous exportez le code de votre site et vos données (un Postgres standard) pour partir chez un autre hébergeur si vous le souhaitez. L'essai gratuit sert à voir l'aperçu : il ne publie ni n'exporte rien.</p></details>
      <details><summary>Où sont hébergées les données de mes clients ?</summary><p>En Europe : la base de données, les fichiers et le site.</p></details>
      <details><summary>Est-ce que vavi prend une commission sur mes ventes ?</summary><p>Non. Vous payez votre abonnement vavi. Les frais de paiement sont ceux de Stripe, prélevés directement par Stripe.</p></details>
      <details><summary>Mon site sera-t-il conforme au RGPD ?</summary><p>vavi pose ce que le RGPD demande à un site : mentions légales et politique de confidentialité avec vos informations, audience mesurée sans cookie, consentement sur les formulaires, données hébergées en Europe, et un moyen pour chaque client de récupérer ou d'effacer ses données. Vous restez responsable de l'usage que vous faites de ces données.</p></details>
      <details><summary>Et les agents IA ?</summary><p>Ils arrivent bientôt : des agents qui travaillent dans votre site, préparent et vous laissent valider. Ils utiliseront une clé d’IA à votre nom, facturée par le fournisseur d’IA ; vavi ne prend rien dessus.</p></details>
      <details><summary>Que demande Stripe pour ouvrir mon compte ?</summary><p>En général une pièce d'identité, un RIB et le numéro de votre entreprise. Vous les déposez une seule fois, sur le formulaire sécurisé de Stripe : vavi ne garde pas vos papiers.</p></details>
      <details><summary>Puis-je utiliser mon propre nom de domaine ?</summary><p>Bientôt, sur toutes les offres payantes. En attendant, votre site est en ligne à son adresse sécurisée chez vavi.</p></details>
    </div>
  </div>
</section>

<!-- ═════════ FIN ═════════ -->
<section class="fin" aria-labelledby="t-fin">
  <div class="enveloppe">
    <svg class="croquis" viewBox="0 0 420 120" fill="none" stroke="var(--encre)" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">
      <g><path class="trace" d="M20 90c60-60 120-60 180-20s120 30 190-40"/><path d="M372 26l20 4-6 20"/></g>
      <text x="40" y="40" font-size="20.2">votre idée</text><text x="300" y="104" font-size="20.2" style="fill:var(--vert)">en ligne</text>
    </svg>
    <h2 id="t-fin">Votre prochain site commence par une phrase à Claude</h2>
    <p style="color:var(--encre-douce);max-width:36em">Ajoutez vavi à Claude, connectez-vous, et décrivez ce que vous voulez construire.</p>
    <a class="bouton plein" href="__LIEN_D_INSTALLATION__" target="_blank" rel="noopener">Ajouter vavi à Claude</a>
  </div>
</section>

</main>

<footer class="pied">
  <div class="enveloppe">
    <span>vavi · hébergé en Europe</span>
    <nav aria-label="Pied de page"><a href="#prix">Prix</a><a href="#questions">Questions</a><a href="__CONSOLE__/commencer">Commencer</a><a href="__CONSOLE__/projets">Console</a><a href="__CONSOLE__/confidentialite">Confidentialité</a><a href="mailto:info@vavi.dev">Contact</a></nav>
  </div>
</footer>

<script>
document.querySelectorAll('[data-copier]').forEach(function(b){
  b.addEventListener('click', function(){
    var cible=document.getElementById(b.getAttribute('data-copier'));
    var t=b.getAttribute('data-texte')||cible.textContent;
    var ok=function(){b.textContent='Copié';setTimeout(function(){b.textContent='Copier'},1600)};
    var selectionner=function(){var r=document.createRange();r.selectNodeContents(cible);var s=getSelection();s.removeAllRanges();s.addRange(r);b.textContent='Sélectionné';};
    try{navigator.clipboard.writeText(t).then(ok,selectionner)}catch(e){selectionner()}
  });
});
</script>

</body>
</html>
`;

export type LangueDeLAccueil = 'fr' | 'en';

const ESPACES = /\s+/g;
/** Un texte à traduire : ni vide, ni neutre, ni un trou du gabarit, ni sans lettre. */
const aTraduire = (cle: string): boolean => cle !== '' && !NEUTRES.includes(cle) && !cle.includes('__') && /\p{L}/u.test(cle);
const traduit = (brut: string): string => {
  const cle = brut.replace(ESPACES, ' ').trim();
  if (!aTraduire(cle)) return brut;
  const en = EN[cle];
  return en === undefined ? brut : `${/^\s*/.exec(brut)![0]}${en}${/\s*$/.exec(brut)![0]}`;
};

/** PURE : les textes de la page (nœuds et attributs lus) qui n'ont pas leur traduction anglaise ; vide, la page est entière. */
export function lesTextesSansTraduction(html: string = GABARIT): readonly string[] {
  const manque = new Set<string>();
  const voir = (brut: string) => { const cle = brut.replace(ESPACES, ' ').trim(); if (aTraduire(cle) && EN[cle] === undefined) manque.add(cle); };
  for (const [i, morceau] of html.split(BLOCS).entries()) {
    if (i % 2 === 1) continue;
    for (const m of morceau.matchAll(/>([^<>]+)</g)) voir(m[1]!);
    for (const m of morceau.matchAll(ATTRIBUTS)) voir(m[2]!);
  }
  return [...manque];
}

const BLOCS = /(<style\b[\s\S]*?<\/style>|<script\b[\s\S]*?<\/script>)/;
const ATTRIBUTS = /\b(alt|title|aria-label|content|placeholder|data-texte)="([^"]*)"/g;

/** Le gabarit en anglais : chaque nœud de texte et chaque attribut lu, traduit par `EN` ; le style intact, le script aux
 * seuls mots qu'il écrit à l'écran. */
function enAnglais(html: string): string {
  return html.replace('<html lang="fr">', '<html lang="en">').split(BLOCS).map((morceau, i) => {
    if (i % 2 === 1) return morceau.startsWith('<script') ? morceau.replace(/'(Copié|Copier|Sélectionné)'/g, (_, m: string) => `'${m === 'Copier' ? 'Copy' : EN[m]}'`) : morceau;
    return morceau.replace(/>([^<>]+)</g, (_, t: string) => `>${traduit(t)}<`).replace(ATTRIBUTS, (_, a: string, v: string) => `${a}="${traduit(v)}"`);
  }).join('');
}

const GABARITS: Readonly<Record<LangueDeLAccueil, string>> = { fr: GABARIT, en: enAnglais(GABARIT) };
const AUTRE_LANGUE: Readonly<Record<LangueDeLAccueil, string>> = {
  fr: '<a class="langue" href="__CONSOLE__/en" hreflang="en" lang="en">English</a>',
  en: '<a class="langue" href="__CONSOLE__/fr" hreflang="fr" lang="fr">Français</a>',
};

/** Le texte, sûr dans un attribut comme dans un élément. */
const enHtml = (t: string): string => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** PURE : la page, l'adresse du connecteur, le premier message et la phrase des préférences posés (ceux de la page Commencer).
 * Les liens vers la console sont absolus : servie sous vavi.dev, la page envoie à la console, là où la connexion est réglée. */
export function laPageDAccueil(t: { readonly premier: string; readonly preference: string }, adresse: string = adresseMcp(), console: string = adresseDeLaPlateforme(), langue: LangueDeLAccueil = 'fr',
  prix: { readonly grille: Grille; readonly reduction: Reduction | null } = { grille: GRILLE_DU_CODE, reduction: null }): string {
  let html = GABARITS[langue];
  for (const [repere, morceau] of Object.entries(lesPrixDeLAccueil(prix.grille, prix.reduction, langue))) html = html.split(repere).join(morceau);
  return html.split('__AUTRE_LANGUE__').join(AUTRE_LANGUE[langue]).split('__LANGUE__').join(langue).split('__CONSOLE__').join(enHtml(console))
    .split('__LIEN_D_INSTALLATION__').join(enHtml(lienDInstallation(adresse)))
    .split('__ADRESSE_MCP__').join(enHtml(adresse))
    .split('__PREMIER_MESSAGE__').join(enHtml(t.premier.trim()))
    .split('__PREFERENCE__').join(enHtml(t.preference))
    .split('__IMAGES__').join(`${enHtml(console)}/accueil`);
}
