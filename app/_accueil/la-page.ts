/**
 * LA PAGE D'ACCUEIL PUBLIQUE de vavi (vavi.dev) : la maquette du 24/11, corrigée le 25/11. Elle ne promet rien que vavi
 * ne fasse déjà : les agents et le domaine à soi sont marqués « bientôt ». Le tableau des prix d'autres outils est retiré,
 * faute d'avoir été relevé. Elle dit que l'offre gratuite de Claude permet un connecteur. Le bouton « Ajouter vavi à
 * Claude » ouvre le connecteur déjà rempli, et une animation dessinée montre les trois étapes. Les trous `__…__` sont
 * remplis par `laPageDAccueil`.
 */
import { adresseMcp, lienDInstallation } from '@/lib/mcp/l-adresse';

const GABARIT = String.raw`<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>vavi : votre site, construit avec Claude</title>
<meta name="description" content="vavi est le connecteur qui fait, de ce que Claude écrit, un vrai site : base de données, paiements Stripe, RGPD, aperçu, publication, hébergement en Europe.">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=Caveat:wght@500;700&display=swap">
<style>
/* Mise en page : un cahier d'écolier (petits carreaux, marge rouge) où l'on explique pas à pas, croquis au stylo bille. */
:root{
  --papier:#fbfcfe; --carreau:#e3eaf5; --marge:#e7a1a1;
  --encre:#1c2944; --encre-douce:#4b5874; --surligneur:#ffe36e; --surligne-fond:#fff1a8;
  --vert:#1d8657; --vert-fond:#e2f4ea; --carte:#ffffff; --trait:#c9d3e4;
  --f-titre:"Bricolage Grotesque", "Arial Black", system-ui, sans-serif;
  --f-texte:"Atkinson Hyperlegible", "Segoe UI", system-ui, sans-serif;
  --f-main:"Caveat", "Comic Sans MS", "Bradley Hand", cursive;
}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){
  --papier:#131926; --carreau:#1f283a; --marge:#7a3b3f;
  --encre:#e9eef7; --encre-douce:#aab5c9; --surligneur:#d8b93a; --surligne-fond:#4a4220;
  --vert:#45c48a; --vert-fond:#16392a; --carte:#1a2232; --trait:#334059; color-scheme:dark}}
:root[data-theme="dark"]{
  --papier:#131926; --carreau:#1f283a; --marge:#7a3b3f;
  --encre:#e9eef7; --encre-douce:#aab5c9; --surligneur:#d8b93a; --surligne-fond:#4a4220;
  --vert:#45c48a; --vert-fond:#16392a; --carte:#1a2232; --trait:#334059; color-scheme:dark}

*{box-sizing:border-box}
body{margin:0;background-color:var(--papier);color:var(--encre);font-family:var(--f-texte);font-size:17px;line-height:1.6;
  background-image:linear-gradient(var(--carreau) 1px,transparent 1px),linear-gradient(90deg,var(--carreau) 1px,transparent 1px);
  background-size:28px 28px;background-position:-1px -1px}
.enveloppe{max-width:1120px;margin:0 auto;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
h1,h2,h3{font-family:var(--f-titre);line-height:1.08;text-wrap:balance;margin:0;letter-spacing:-.01em}
h1{font-size:clamp(2.3rem,5.4vw,3.7rem);font-weight:800}
h2{font-size:clamp(1.9rem,4vw,2.8rem);font-weight:800}
h3{font-size:1.3rem;font-weight:600}
p{margin:0}
a{color:inherit}
:focus-visible{outline:3px solid var(--vert);outline-offset:3px;border-radius:6px}
.main{font-family:var(--f-main);font-weight:700}
.surligne{background:linear-gradient(transparent 52%,var(--surligne-fond) 52%,var(--surligne-fond) 92%,transparent 92%);padding:0 .1em}
.croquis{width:100%;height:auto;display:block;max-width:100%}
.croquis *{vector-effect:non-scaling-stroke}
.croquis text{font-family:var(--f-main);fill:var(--encre);stroke:none}

/* Bandeau maquette */
.maquette{background:var(--surligneur);color:#1c2944;font-size:.9rem;text-align:center;padding-block:6px}

/* En-tête */
.entete{position:sticky;top:env(safe-area-inset-top,0px);z-index:5;background:var(--papier);border-bottom:2px solid var(--encre)}
body::before{content:"";position:fixed;inset:0 0 auto;height:env(safe-area-inset-top,0px);z-index:10;background:var(--papier)}
.entete .enveloppe{display:flex;align-items:center;gap:24px;padding-block:12px}
.logo{display:flex;align-items:center;gap:8px;text-decoration:none;font-family:var(--f-titre);font-weight:800;font-size:1.6rem}
.logo svg{width:34px;height:34px}
.nav{display:flex;gap:22px;margin-left:auto;font-size:.98rem}
.nav a{text-decoration:none}
.nav a:hover{text-decoration:underline wavy var(--vert);text-underline-offset:5px}
.bouton{display:inline-flex;align-items:center;gap:8px;font-family:var(--f-texte);font-weight:700;font-size:1rem;text-decoration:none;
  padding:12px 20px;border:2px solid var(--encre);border-radius:12px 14px 11px 15px;background:var(--carte);color:var(--encre);
  box-shadow:3px 3px 0 var(--encre);transition:transform .12s, box-shadow .12s;cursor:pointer}
.bouton:hover{transform:translate(-1px,-1px);box-shadow:4px 4px 0 var(--encre)}
.bouton:active{transform:translate(2px,2px);box-shadow:1px 1px 0 var(--encre)}
.bouton.plein{background:var(--vert);color:#fff;border-color:var(--encre)}
.entete .bouton{padding:8px 14px;font-size:.95rem}
@media (max-width:820px){.nav{display:none}.entete .bouton{margin-left:auto}}

/* Ouverture */
.ouverture{padding-block:56px 40px}
.ouverture .enveloppe{display:grid;grid-template-columns:1.05fr 1fr;gap:40px;align-items:center}
.ouverture .texte{display:grid;gap:22px;min-width:0}
.ouverture .chapeau{font-size:1.2rem;max-width:34em;color:var(--encre-douce)}
.ouverture .chapeau strong{color:var(--encre)}
.gestes{display:flex;flex-wrap:wrap;gap:14px;align-items:center}
.note{font-family:var(--f-main);font-size:1.45rem;font-weight:700;color:var(--vert);transform:rotate(-2deg);display:inline-block}
@media (max-width:860px){.ouverture .enveloppe{grid-template-columns:1fr}}

.faits{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:10px 28px}
.faits li{display:grid;gap:0;min-width:0}
.faits b{font-family:var(--f-titre);font-weight:800;font-size:2rem;line-height:1.1;color:var(--vert);font-variant-numeric:tabular-nums}
.faits span{font-size:.9rem;color:var(--encre-douce);max-width:12em;line-height:1.3}

/* Comparaison */
.tableau{overflow-x:auto;border:2px solid var(--encre);border-radius:12px;background:var(--carte)}
.tableau table{border-collapse:collapse;width:100%;min-width:720px;font-size:.97rem}
.tableau th,.tableau td{padding:14px 16px;text-align:left;vertical-align:top;border-bottom:1.5px dashed var(--trait)}
.tableau thead th{font-size:.8rem;text-transform:uppercase;letter-spacing:.07em;color:var(--encre-douce);border-bottom:2px solid var(--encre)}
.tableau tbody tr:last-child td,.tableau tbody tr:last-child th{border-bottom:0}
.tableau tbody th{font-family:var(--f-titre);font-weight:600;font-size:1.1rem;white-space:nowrap}
.tableau tr.nous{background:var(--vert-fond)}
.tableau tr.nous th{color:var(--vert)}
.compteur{display:inline-block;font-family:var(--f-main);font-weight:700;font-size:1.6rem;line-height:1.1}
.compteur.oui{color:var(--marge)}
.compteur.non{color:var(--vert)}
.source{margin-top:12px;font-size:.85rem;color:var(--encre-douce)}
.duel{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:34px}
.duel>div{display:grid;gap:10px;align-content:start;padding:22px;border:2px solid var(--encre);border-radius:12px;background:var(--carte)}
.duel svg{width:100%;height:auto;max-width:360px}
@media (max-width:820px){.duel{grid-template-columns:1fr}}

@media (max-width:640px){
  .tableau{border:0;background:none;overflow:visible}
  .tableau table{min-width:0}
  .tableau thead{display:none}
  .tableau tbody,.tableau tr,.tableau th,.tableau td{display:block}
  .tableau tr{background:var(--carte);border:2px solid var(--encre);border-radius:12px;margin-bottom:12px;padding:8px 0}
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
.pastilles li{font-family:var(--f-main);font-weight:700;font-size:1.25rem;line-height:1.2;padding:2px 12px;border:1.8px solid var(--encre);border-radius:14px 10px 13px 9px;background:var(--carte)}
.pastilles li:first-child{background:var(--vert);color:#fff}
.pastilles li:nth-child(odd){transform:rotate(-1.5deg)}
.pastilles li:nth-child(even){transform:rotate(1.2deg);background:var(--surligne-fond)}

.sous{margin:4px 0 0;padding:0;list-style:none;counter-reset:sous;display:grid;gap:8px}
.sous li{counter-increment:sous;display:grid;grid-template-columns:28px 1fr;gap:10px;align-items:start}
.sous li::before{content:counter(sous,lower-alpha);font-family:var(--f-main);font-weight:700;font-size:1.3rem;line-height:1;width:26px;height:26px;display:grid;place-items:center;border:1.6px solid var(--encre);border-radius:50%;background:var(--surligne-fond)}
.sous kbd{font-family:var(--f-texte);font-size:.92em;font-weight:700;border:1.5px solid var(--encre);border-radius:7px;padding:0 7px;background:var(--papier);white-space:nowrap}
.attention{border:2px dashed var(--marge);border-radius:10px;padding:10px 14px;font-size:.95rem}
.attention b{color:var(--encre)}
.bloque{margin-top:28px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}
.bloque div{padding:18px 20px;border:2px dashed var(--encre);border-radius:12px;background:var(--papier);display:grid;gap:6px;align-content:start}
.bloque b{font-size:1.02rem}
.bloque p{color:var(--encre-douce);font-size:.96rem}
@media (max-width:900px){.bloque{grid-template-columns:1fr}}

/* Agents */
.agents{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(0,1fr);gap:20px}
.agent{display:grid;gap:10px;align-content:start;padding:22px;background:var(--carte);border:2px solid var(--encre);border-radius:12px 15px 10px 14px}
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
.titre-section .main{font-size:1.5rem;color:var(--encre-douce)}
.titre-section p{color:var(--encre-douce);font-size:1.1rem}

/* Le problème : page de cahier à marge */
.feuille{background:var(--carte);border:2px solid var(--encre);border-radius:6px 10px 8px 12px;position:relative;padding:32px 28px 32px 64px;box-shadow:5px 6px 0 var(--trait)}
.feuille::before{content:"";position:absolute;top:0;bottom:0;left:40px;width:2px;background:var(--marge)}
.feuille .colonnes{display:grid;grid-template-columns:1fr 1fr;gap:32px}
.feuille ul{margin:10px 0 0;padding-left:1.1em}
.feuille li{margin-block:4px}
.barre{text-decoration:line-through;text-decoration-color:var(--marge);text-decoration-thickness:2px}
@media (max-width:760px){.feuille{padding:24px 18px 24px 40px}.feuille::before{left:22px}.feuille .colonnes{grid-template-columns:1fr}}

/* Les étapes */
.etapes{display:grid;gap:28px;counter-reset:etape}
.etape{display:grid;grid-template-columns:96px minmax(0,1fr) minmax(0,.9fr);gap:28px;align-items:center;padding:26px;background:var(--carte);border:2px solid var(--encre);border-radius:14px 9px 16px 10px}
.etape:nth-child(even){border-radius:9px 15px 10px 16px}
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
.raison{padding:22px;background:var(--carte);border:2px solid var(--encre);border-radius:10px 14px 9px 13px;display:grid;gap:8px;align-content:start}
.raison .main{font-size:1.35rem;color:var(--vert);line-height:1.1}
.raison p{color:var(--encre-douce)}
@media (max-width:900px){.pourquoi{grid-template-columns:1fr}}

/* Le coût */
.addition{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:40px;align-items:center;margin-bottom:44px}
.ticket{background:var(--carte);border:2px solid var(--encre);padding:24px 26px;border-radius:4px;font-variant-numeric:tabular-nums;box-shadow:5px 6px 0 var(--trait)}
.ticket .ligne{display:flex;justify-content:space-between;gap:12px;padding-block:8px;border-bottom:1.5px dashed var(--trait)}
.ticket .ligne:last-child{border-bottom:0;font-weight:700;font-size:1.1rem;padding-top:14px}
.ticket .zero{color:var(--vert);font-weight:700}
@media (max-width:860px){.addition{grid-template-columns:1fr}}
.offres{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px}
.offre{display:flex;flex-direction:column;gap:12px;padding:24px 20px;background:var(--carte);border:2px solid var(--encre);border-radius:12px 9px 14px 10px;position:relative}
.offre .bouton{margin-top:auto;align-self:flex-start}
.offre.vedette{box-shadow:6px 6px 0 var(--vert)}
.offre .etiquette{position:absolute;top:-16px;right:14px;background:var(--surligneur);color:#1c2944;font-family:var(--f-main);font-weight:700;font-size:1.2rem;padding:0 10px;border:1.5px solid var(--encre);border-radius:8px;transform:rotate(3deg)}
.prix{font-family:var(--f-titre);font-weight:800;font-size:2.6rem;line-height:1;font-variant-numeric:tabular-nums}
.prix small{font-family:var(--f-texte);font-size:1rem;font-weight:400;color:var(--encre-douce)}
.offre ul{margin:0;padding-left:1.1em;display:grid;gap:4px;font-size:.96rem}
.offre .pour{color:var(--encre-douce);font-size:.96rem}
.en-plus{margin-top:22px;text-align:center;font-size:1.05rem}
@media (max-width:1000px){.offres{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:540px){.offres{grid-template-columns:1fr}}

/* Questions */
.questions{display:grid;gap:12px;max-width:820px}
details{background:var(--carte);border:2px solid var(--encre);border-radius:10px;padding:14px 18px}
summary{cursor:pointer;font-weight:700;font-size:1.08rem;list-style:none;display:flex;justify-content:space-between;gap:12px}
summary::-webkit-details-marker{display:none}
summary::after{content:"+";font-family:var(--f-main);font-size:1.8rem;line-height:.8}
details[open] summary::after{content:"–"}
details p{margin-top:10px;color:var(--encre-douce)}

/* Fin */
.fin{text-align:center}
.fin .enveloppe{display:grid;justify-items:center;gap:22px}
.fin svg{max-width:420px}
.pied{border-top:2px solid var(--encre);padding-block:28px;font-size:.92rem;color:var(--encre-douce);background:var(--papier)}
.pied .enveloppe{display:flex;flex-wrap:wrap;gap:18px 28px;justify-content:space-between}
.pied nav{display:flex;flex-wrap:wrap;gap:18px}

@media (prefers-reduced-motion:no-preference){
  .trace{stroke-dasharray:1200;stroke-dashoffset:0;animation:trace 2.4s ease-out both}
  @keyframes trace{from{stroke-dashoffset:1200}to{stroke-dashoffset:0}}
}
/* L'animation des trois étapes : trois scènes de 5 s, en boucle ; immobile (la 1re scène) si l'on réduit les animations. */
.film{margin:0 0 36px;display:grid;gap:10px;max-width:760px}
.film svg{width:100%;height:auto}
.film .scene{opacity:0;animation:15s infinite both}
.film .s1{animation-name:scene1}.film .s2{animation-name:scene2}.film .s3{animation-name:scene3}
@keyframes scene1{0%,30%{opacity:1}33.4%,97%{opacity:0}100%{opacity:1}}
@keyframes scene2{0%,30%{opacity:0}33.4%,63.4%{opacity:1}66.7%,100%{opacity:0}}
@keyframes scene3{0%,63.4%{opacity:0}66.7%,97%{opacity:1}100%{opacity:0}}
.film .curseur{animation:15s infinite ease-in-out both}
.film .k1{animation-name:curseur1}.film .k2{animation-name:curseur2}
@keyframes curseur1{0%,6%{transform:translate(560px,330px)}20%,100%{transform:translate(452px,292px)}}
@keyframes curseur2{0%,38%{transform:translate(560px,330px)}53%,100%{transform:translate(400px,286px)}}
.film .clic{opacity:0;animation:15s infinite both}
.film .c1{animation-name:clic1}.film .c2{animation-name:clic2}
@keyframes clic1{0%,20%{opacity:0}22%,27%{opacity:1}29%,100%{opacity:0}}
@keyframes clic2{0%,53%{opacity:0}55%,60%{opacity:1}62%,100%{opacity:0}}
.film .presse{animation:15s infinite both}
.film .s1 .presse{animation-name:presse1}.film .s2 .presse{animation-name:presse2}
@keyframes presse1{0%,21%{fill:var(--vert)}22%,27%{fill:var(--encre)}28%,100%{fill:var(--vert)}}
@keyframes presse2{0%,54%{fill:var(--vert)}55%,60%{fill:var(--encre)}61%,100%{fill:var(--vert)}}
.film .bulle{opacity:0;animation:bulle 15s infinite both}
.film .apercu{opacity:0;animation:apercu 15s infinite both}
@keyframes bulle{0%,68%{opacity:0}72%,100%{opacity:1}}
@keyframes apercu{0%,80%{opacity:0}85%,100%{opacity:1}}
.legende{display:flex;gap:10px 22px;flex-wrap:wrap;font-family:var(--f-main);font-weight:700;font-size:1.45rem;color:var(--encre-douce)}
.legende span{animation:15s infinite both;border-bottom:3px solid transparent}
.legende .l1{animation-name:l1}.legende .l2{animation-name:l2}.legende .l3{animation-name:l3}
@keyframes l1{0%,33%{color:var(--encre);border-color:var(--surligneur)}33.4%,100%{color:var(--encre-douce);border-color:transparent}}
@keyframes l2{0%,33.3%{color:var(--encre-douce);border-color:transparent}33.4%,66.6%{color:var(--encre);border-color:var(--surligneur)}66.7%,100%{color:var(--encre-douce);border-color:transparent}}
@keyframes l3{0%,66.6%{color:var(--encre-douce);border-color:transparent}66.7%,100%{color:var(--encre);border-color:var(--surligneur)}}
@media (prefers-reduced-motion:reduce){
  .film .scene,.film .curseur,.film .clic,.film .presse,.film .bulle,.film .apercu,.legende span{animation:none}
  .film .s1{opacity:1}.film .k1{transform:translate(452px,292px)}
}
</style>
</head>
<body>
<!-- Le tremblé du stylo : un seul filtre pour tous les croquis -->
<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <defs>
    <filter id="stylo" x="-5%" y="-5%" width="110%" height="110%">
      <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="4" result="bruit"/>
      <feDisplacementMap in="SourceGraphic" in2="bruit" scale="3.2"/>
    </filter>
    <pattern id="hachures" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(40)">
      <line x1="0" y1="0" x2="0" y2="7" stroke="var(--encre)" stroke-width="1.2" opacity=".35"/>
    </pattern>
  </defs>
</svg>


<header class="entete">
  <div class="enveloppe">
    <a class="logo" href="#haut" aria-label="vavi, accueil">
      <svg viewBox="0 0 40 40" fill="none" stroke="var(--encre)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" filter="url(#stylo)" aria-hidden="true">
        <rect x="6" y="12" width="20" height="18" rx="5" fill="var(--surligneur)"/><path d="M12 12V5M20 12V5M26 21h8"/>
      </svg>
      vavi
    </a>
    <nav class="nav" aria-label="Sections">
      <a href="#etapes">Comment ça marche</a>
      <a href="#apports">Ce que vavi apporte</a>
      <a href="#comparer">Comparer</a>
      <a href="#prix">Prix</a>
      <a href="#questions">Questions</a>
    </nav>
    <a class="bouton" href="/projets">Ma console</a>
  </div>
</header>

<main id="haut">

<!-- ═════════ OUVERTURE ═════════ -->
<div class="ouverture">
  <div class="enveloppe">
    <div class="texte">
      <span class="note">vous payez déjà Claude, ne payez pas l'IA deux fois</span>
      <h1>Claude écrit votre site. <span class="surligne">vavi apporte tout le reste.</span></h1>
      <p class="chapeau">vavi est le connecteur qui fait, de ce que Claude écrit, un <strong>vrai site d'entreprise</strong> : un design à vos couleurs, une base de données déjà réglée, les paiements avec votre compte Stripe ouvert en quelques minutes, le RGPD, le référencement et l'hébergement en Europe.</p>
      <ul class="pastilles" aria-label="Ce que vavi apporte">
        <li>design à vos couleurs</li><li>base de données</li><li>paiements Stripe</li><li>RGPD</li><li>référencement</li><li>hébergement en Europe</li>
      </ul>
      <div class="gestes">
        <a class="bouton plein" href="__LIEN_D_INSTALLATION__" target="_blank" rel="noopener">Ajouter vavi à Claude</a>
        <a class="bouton" href="#etapes">Voir les 7 étapes</a>
      </div>
      <ul class="faits" aria-label="En bref">
        <li><b>0</b><span>crédit de génération à acheter</span></li>
        <li><b>1</b><span>prix fixe par mois, connu d'avance</span></li>
        <li><b>100 %</b><span>hébergé en Europe</span></li>
      </ul>
      <p style="color:var(--encre-douce);font-size:.95rem">Essai gratuit, sans carte bancaire. Un compte Claude suffit : l'offre gratuite de Claude permet un connecteur personnalisé.</p>
    </div>

    <svg class="croquis" viewBox="0 0 560 400" fill="none" stroke="var(--encre)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Croquis : une conversation avec Claude passe par vavi et devient un site en ligne">
      <g filter="url(#stylo)">
        <!-- conversation -->
        <rect x="14" y="30" width="200" height="230" rx="16" fill="var(--carte)"/>
        <path d="M14 66h200"/><circle cx="36" cy="48" r="6"/><path d="M50 48h60"/>
        <rect x="70" y="84" width="130" height="54" rx="12" fill="var(--surligne-fond)"/>
        <rect x="28" y="152" width="150" height="74" rx="12"/>
        <path d="M42 172h110M42 188h120M42 204h80"/>
        <!-- flèche vers vavi -->
        <path class="trace" d="M218 150c40-30 60-30 92-4"/><path d="M300 136l12 12-16 4"/>
        <!-- prise vavi -->
        <rect x="300" y="152" width="96" height="76" rx="18" fill="var(--surligneur)"/>
        <path d="M326 152v-22M370 152v-22M396 190h22"/>
        <!-- flèche vers le site -->
        <path class="trace" d="M418 190c24 0 30-40 30-70"/><path d="M438 128l10-14 10 14"/>
      </g>
      <g filter="url(#stylo)">
        <rect x="300" y="250" width="246" height="140" rx="12" fill="var(--carte)"/>
        <path d="M300 276h246"/><circle cx="316" cy="263" r="4"/><circle cx="330" cy="263" r="4"/><circle cx="344" cy="263" r="4"/>
        <rect x="364" y="256" width="160" height="14" rx="7"/>
        <path d="M318 300h90M318 316h70"/>
        <rect x="318" y="332" width="64" height="22" rx="8" fill="var(--vert)" stroke="var(--encre)"/>
        <!-- pain -->
        <path d="M430 352c-6-30 20-46 50-46s56 16 50 46z" fill="url(#hachures)"/>
        <path d="M452 316l-8 22M478 310l-6 26M504 316l-4 22"/>
      </g>
      <g filter="url(#stylo)">
        <!-- le globe en haut à droite, la mise en ligne -->
        <circle cx="440" cy="62" r="40" fill="var(--vert-fond)"/>
        <path d="M400 62h80M440 22c-18 22-18 58 0 80M440 22c18 22 18 58 0 80M408 40h64M408 84h64"/>
      </g>
      <text x="82" y="106" font-size="19">Fais le site de</text>
      <text x="82" y="128" font-size="19">ma boulangerie</text>
      <text x="320" y="200" font-size="30" font-weight="700">vavi</text>
      <text x="324" y="348" font-size="15" style="fill:#fff">Commander</text>
      <text x="236" y="112" font-size="20" transform="rotate(-8 236 112)">Claude écrit</text>
      <text x="484" y="150" font-size="20" style="fill:var(--vert)">en ligne !</text>
      <text x="40" y="300" font-size="21">vous, dans Claude.ai</text>
      <path d="M100 280c10-10 10-14 6-22" stroke="var(--encre)" stroke-width="1.8" filter="url(#stylo)"/>
    </svg>
  </div>
</div>

<!-- ═════════ LE PROBLÈME ═════════ -->
<section aria-labelledby="t-probleme">
  <div class="enveloppe">
    <div class="feuille">
      <div class="colonnes">
        <div style="display:grid;gap:14px">
          <span class="main" style="font-size:1.5rem;color:var(--encre-douce)">Vous l'avez peut-être vécu</span>
          <h2 id="t-probleme">Claude écrit vite un joli site. Un site qui fait tourner une entreprise demande bien plus.</h2>
          <p>Le premier jet impressionne. Puis il faut des comptes clients, des paiements avec la TVA, des mentions RGPD, être trouvé sur Google, un design qui ne ressemble pas à tous les autres. Chaque morceau est un service de plus à choisir, à brancher et à payer.</p>
        </div>
        <div>
          <p><b>Ce que vous auriez à assembler vous-même :</b></p>
          <ul>
            <li class="barre">une base de données et ses droits d'accès</li>
            <li class="barre">un compte Stripe, la TVA, les factures</li>
            <li class="barre">les mentions légales, la confidentialité, le consentement</li>
            <li class="barre">le référencement et son suivi</li>
            <li class="barre">des images qui ne sortent pas d'une banque de photos</li>
            <li class="barre">l'hébergement, le domaine, le https</li>
          </ul>
          <p class="main" style="font-size:1.6rem;color:var(--vert);margin-top:12px">Avec vavi, tout ça est prêt avant que Claude écrive la première page.</p>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- ═════════ CE QUE VAVI APPORTE ═════════ -->
<section id="apports" aria-labelledby="t-apports">
  <div class="enveloppe">
    <div class="titre-section">
      <span class="main">Tout le reste, c'est quoi ?</span>
      <h2 id="t-apports">Claude écrit les pages. vavi pose tout ce qu'il y a autour.</h2>
      <p>Un écosystème complet, déjà réglé pour chaque site, pour que Claude n'ait rien à improviser et vous rien à assembler.</p>
    </div>
    <div class="apports">
      <div class="apport">
        <svg viewBox="0 0 80 80" fill="none" stroke="var(--encre)" stroke-width="2.4" stroke-linecap="round" filter="url(#stylo)" aria-hidden="true"><path d="M40 8C20 8 8 22 8 38s12 30 28 30c6 0 6-6 2-10s0-10 6-10h10c10 0 18-6 18-18C72 18 58 8 40 8z" fill="var(--carte)"/><circle cx="26" cy="30" r="5" fill="var(--surligneur)"/><circle cx="42" cy="22" r="5" fill="var(--vert)"/><circle cx="56" cy="32" r="5" fill="var(--marge)"/></svg>
        <h3>Un design à vos couleurs</h3>
        <p>Claude suit les règles de design de vavi : couleurs lisibles, contraste vérifié, mise en page pensée pour le téléphone. Vous changez vous-même couleurs et polices dans la console.</p>
      </div>
      <div class="apport">
        <svg viewBox="0 0 80 80" fill="none" stroke="var(--encre)" stroke-width="2.4" stroke-linecap="round" filter="url(#stylo)" aria-hidden="true"><ellipse cx="34" cy="18" rx="22" ry="8" fill="var(--surligne-fond)"/><path d="M12 18v40c0 4 10 8 22 8s22-4 22-8V18M12 38c0 4 10 8 22 8s22-4 22-8"/><circle cx="62" cy="56" r="7" fill="var(--carte)"/><path d="M62 63v12M62 70h5"/></svg>
        <h3>Une base déjà réglée</h3>
        <p>Clients, commandes, rendez-vous, dossiers : la base est posée pour chaque site. Chacun ne voit que ce que son rôle permet.</p>
      </div>
      <div class="apport">
        <svg viewBox="0 0 80 80" fill="none" stroke="var(--encre)" stroke-width="2.4" stroke-linecap="round" filter="url(#stylo)" aria-hidden="true"><rect x="6" y="20" width="46" height="30" rx="5" fill="var(--carte)"/><path d="M6 30h46M14 42h12"/><path d="M42 36h30v38l-5-4-5 4-5-4-5 4-5-4-5 4z" fill="var(--surligne-fond)"/><path d="M48 48h18M48 56h12"/></svg>
        <h3>Votre compte Stripe ouvert pour vous</h3>
        <p>Un clic dans la console ouvre votre compte Stripe. Vous déposez vos pièces une seule fois, sur le formulaire sécurisé de Stripe. TVA par article et factures numérotées sont déjà prêtes.</p>
      </div>
      <div class="apport">
        <svg viewBox="0 0 80 80" fill="none" stroke="var(--encre)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" filter="url(#stylo)" aria-hidden="true"><path d="M40 6l26 10v20c0 18-11 30-26 38C25 66 14 54 14 36V16z" fill="var(--carte)"/><rect x="28" y="36" width="24" height="18" rx="3" fill="var(--surligne-fond)"/><path d="M32 36v-6a8 8 0 0 1 16 0v6"/></svg>
        <h3>Conforme au RGPD dès le départ</h3>
        <p>Page de confidentialité tirée de ce que votre site collecte, aucun traceur donc aucun bandeau de cookies, formulaires protégés du spam. Un client peut récupérer ou effacer ses données.</p>
      </div>
      <div class="apport">
        <svg viewBox="0 0 80 80" fill="none" stroke="var(--encre)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" filter="url(#stylo)" aria-hidden="true"><circle cx="30" cy="30" r="20" fill="var(--carte)"/><path d="M45 45l18 18"/><path d="M20 38l7-8 6 5 9-12" stroke="var(--vert)"/></svg>
        <h3>Le référencement, posé</h3>
        <p>Vos pages publiques se lisent sans JavaScript, avec leur titre, leur description et le plan du site. Vous réglez titres et descriptions dans la console.</p>
      </div>
      <div class="apport">
        <svg viewBox="0 0 80 80" fill="none" stroke="var(--encre)" stroke-width="2.4" stroke-linecap="round" filter="url(#stylo)" aria-hidden="true"><rect x="8" y="26" width="54" height="26" rx="10" fill="var(--vert)"/><path d="M52 52l8 20 5-8 9 7 4-5-8-7 8-4z" fill="var(--carte)"/></svg>
        <h3>Aperçu privé, puis Publier</h3>
        <p>Vous testez chaque version sur un lien privé. Quand elle vous plaît, un clic dans la console la met en ligne.</p>
      </div>
      <div class="apport">
        <svg viewBox="0 0 80 80" fill="none" stroke="var(--encre)" stroke-width="2.4" stroke-linecap="round" filter="url(#stylo)" aria-hidden="true"><circle cx="40" cy="40" r="30" fill="var(--carte)"/><path d="M10 40h60M40 10c-14 16-14 44 0 60M40 10c14 16 14 44 0 60"/><rect x="14" y="58" width="52" height="16" rx="5" fill="var(--surligne-fond)"/></svg>
        <h3>Votre nom de domaine <small>(bientôt)</small></h3>
        <p>Bientôt, vous brancherez l'adresse que vous possédez déjà. En attendant, votre site a son adresse sécurisée chez vavi.</p>
      </div>
      <div class="apport">
        <svg viewBox="0 0 80 80" fill="none" stroke="var(--encre)" stroke-width="2.4" stroke-linecap="round" filter="url(#stylo)" aria-hidden="true"><circle cx="40" cy="40" r="30" fill="var(--carte)"/><g fill="var(--surligneur)"><circle cx="40" cy="16" r="3.5"/><circle cx="57" cy="23" r="3.5"/><circle cx="64" cy="40" r="3.5"/><circle cx="57" cy="57" r="3.5"/><circle cx="40" cy="64" r="3.5"/><circle cx="23" cy="57" r="3.5"/><circle cx="16" cy="40" r="3.5"/><circle cx="23" cy="23" r="3.5"/></g></svg>
        <h3>Tout reste en Europe</h3>
        <p>Votre site, vos fichiers et les données de vos clients sont hébergés en Europe.</p>
      </div>
    </div>
  </div>
</section>

<!-- ═════════ LES AGENTS ═════════ -->
<section id="agents" aria-labelledby="t-agents">
  <div class="enveloppe">
    <div class="agents-haut">
      <div class="titre-section" style="margin:0">
        <span class="main">Votre site travaille aussi quand vous dormez</span>
        <h2 id="t-agents">Bientôt : des agents IA livrés avec votre site</h2>
        <p class="attention"><b>Pas encore disponible.</b> Cette partie décrit ce qui arrive : les agents ne tournent pas encore.</p>
        <p>Votre boutique ne sortira pas seule : elle arrivera avec ses agents. Ils connaissent vos produits, vos clients et vos commandes, parce qu'ils lisent la même base que votre site. Ils préparent le travail, vous gardez la main.</p>
      </div>
      <svg class="croquis" viewBox="0 0 380 250" fill="none" stroke="var(--encre)" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Croquis : un agent propose trois actions, vous validez">
        <g filter="url(#stylo)">
          <rect x="16" y="60" width="96" height="88" rx="22" fill="var(--surligneur)"/>
          <path d="M64 60V38"/><circle cx="64" cy="32" r="7" fill="var(--carte)"/>
          <circle cx="46" cy="96" r="7" fill="var(--carte)"/><circle cx="82" cy="96" r="7" fill="var(--carte)"/>
          <path d="M46 122c10 8 26 8 36 0"/>
          <path class="trace" d="M118 104c22-4 30-20 46-24"/>
          <rect x="160" y="14" width="206" height="222" rx="12" fill="var(--carte)"/>
          <rect x="174" y="52" width="178" height="40" rx="8" fill="var(--papier)"/>
          <rect x="174" y="102" width="178" height="40" rx="8" fill="var(--papier)"/>
          <rect x="174" y="152" width="178" height="40" rx="8" fill="var(--papier)"/>
          <rect x="300" y="62" width="44" height="20" rx="8" fill="var(--vert)"/>
          <rect x="300" y="112" width="44" height="20" rx="8" fill="var(--vert)"/>
          <rect x="300" y="162" width="44" height="20" rx="8" fill="var(--vert)"/>
        </g>
        <text x="174" y="40" font-size="19" font-weight="700">Propositions du jour</text>
        <text x="182" y="77" font-size="15">Newsletter nouveautés</text>
        <text x="182" y="127" font-size="15">Relancer 4 paniers</text>
        <text x="182" y="177" font-size="15">Campagne des soldes</text>
        <text x="306" y="77" font-size="13" style="fill:#fff">valider</text>
        <text x="306" y="127" font-size="13" style="fill:#fff">valider</text>
        <text x="306" y="177" font-size="13" style="fill:#fff">valider</text>
        <text x="190" y="224" font-size="17" style="fill:var(--vert)">rien ne part sans vous</text>
        <text x="20" y="178" font-size="18">votre agent</text>
      </svg>
    </div>

    <div class="agents">
      <div class="agent">
        <span class="pour-qui">Pour une boutique</span>
        <h3>L'agent marketing</h3>
        <ul>
          <li>Prépare la newsletter quand vous ajoutez des produits</li>
          <li>Relance les paniers abandonnés</li>
          <li>Prépare vos campagnes publicitaires : textes, visuels, public visé, prêts à lancer</li>
        </ul>
      </div>
      <div class="agent">
        <span class="pour-qui">Pour un site vitrine</span>
        <h3>L'agent des demandes</h3>
        <ul>
          <li>Trie les messages reçus et prépare une réponse</li>
          <li>Rédige un brouillon de devis à partir de la demande</li>
          <li>Relance les prospects qui n'ont pas répondu</li>
        </ul>
      </div>
      <div class="agent">
        <span class="pour-qui">Pour une app de gestion</span>
        <h3>L'agent de suivi</h3>
        <ul>
          <li>Relance les factures impayées</li>
          <li>Repère les dossiers en retard</li>
          <li>Vous envoie le résumé de la semaine</li>
        </ul>
      </div>
    </div>
    <ul class="principes" aria-label="Comment travaillent les agents">
      <li>L'agent propose, vous validez</li>
      <li>Chaque action est notée dans un journal</li>
      <li>Il ne lit que ce que son rôle permet</li>
      <li>Vous le changez en le demandant à Claude</li>
    </ul>
  </div>
</section>

<!-- ═════════ LA COMPARAISON ═════════ -->
<section id="comparer" aria-labelledby="t-comparer">
  <div class="enveloppe">
    <div class="titre-section">
      <span class="main">Le calcul que personne ne fait</span>
      <h2 id="t-comparer">Ailleurs, chaque correction fait tourner un compteur. Chez vavi, non.</h2>
      <p>Beaucoup d'outils qui construisent un site par l'IA vendent des crédits : chaque demande en consomme. Avec vavi, l'IA qui construit, c'est Claude, déjà payé par votre abonnement Claude. vavi vend seulement ce qu'il fait tourner : la base, les paiements, l'hébergement.</p>
    </div>


    <div class="duel">
      <div>
        <span class="main" style="font-size:1.35rem;color:var(--marge)">Avec des crédits</span>
        <svg class="croquis" viewBox="0 0 360 150" fill="none" stroke="var(--encre)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <g filter="url(#stylo)"><path d="M20 130h320M20 130V14"/><path d="M28 120l40-6 40-14 40-4 40-22 40-10 40-30 40-20" stroke="var(--marge)" stroke-width="3"/>
          <circle cx="148" cy="96" r="5" fill="var(--marge)"/><circle cx="268" cy="34" r="5" fill="var(--marge)"/></g>
          <text x="96" y="86" font-size="15">recharge</text><text x="210" y="24" font-size="15">recharge</text><text x="250" y="146" font-size="15">corrections →</text>
        </svg>
        <p>Plus vous corrigez, plus vous payez. On finit par hésiter à demander une retouche.</p>
      </div>
      <div>
        <span class="main" style="font-size:1.35rem;color:var(--vert)">Avec vavi</span>
        <svg class="croquis" viewBox="0 0 360 150" fill="none" stroke="var(--encre)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <g filter="url(#stylo)"><path d="M20 130h320M20 130V14"/><path d="M28 70h300" stroke="var(--vert)" stroke-width="3"/></g>
          <text x="40" y="60" font-size="16" style="fill:var(--vert)">49 € le mois, que vous corrigiez 3 fois ou 30</text><text x="250" y="146" font-size="15">corrections →</text>
        </svg>
        <p>Le prix ne bouge pas avec le nombre de demandes. Vous corrigez jusqu'à ce que ce soit juste.</p>
      </div>
    </div>
  </div>
</section>

<!-- ═════════ LES ÉTAPES ═════════ -->
<section id="etapes" aria-labelledby="t-etapes">
  <div class="enveloppe">
    <div class="titre-section">
      <span class="main">Comment ça marche</span>
      <h2 id="t-etapes">Sept étapes, de l'idée au site qui vend</h2>
      <p>Les deux premières se font une seule fois, en deux minutes environ. Suivez-les dans l'ordre, chaque bouton est nommé. Ensuite, tout se passe en parlant à Claude.</p>
    </div>

    <figure class="film" aria-label="Animation : les trois étapes pour brancher vavi dans Claude">
  <svg class="croquis" viewBox="0 0 640 360" fill="none" stroke="var(--encre)" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="1, le bouton remplit le connecteur dans Claude.ai ; 2, vous vous connectez et autorisez Claude ; 3, vous décrivez votre projet et l'aperçu apparaît">
    <g filter="url(#stylo)">
      <rect x="10" y="10" width="620" height="340" rx="18" fill="var(--papier)"/>
      <path d="M10 46h620"/><circle cx="34" cy="28" r="6"/><circle cx="54" cy="28" r="6"/><circle cx="74" cy="28" r="6"/>
      <rect x="110" y="18" width="300" height="20" rx="10" fill="var(--carte)"/>
    </g>
    <!-- 1 : le connecteur déjà rempli -->
    <g class="scene s1">
      <text x="124" y="34" font-size="15">claude.ai · connecteurs</text>
      <g filter="url(#stylo)">
        <rect x="150" y="70" width="340" height="250" rx="16" fill="var(--carte)"/>
        <rect x="176" y="136" width="288" height="36" rx="9" fill="var(--surligne-fond)"/>
        <rect x="176" y="206" width="288" height="36" rx="9" fill="var(--surligne-fond)"/>
        <rect class="presse" x="356" y="262" width="108" height="38" rx="10" fill="var(--vert)"/>
      </g>
      <text x="176" y="106" font-size="24" font-weight="700">Nouveau connecteur</text>
      <text x="178" y="130" font-size="15" style="fill:var(--encre-douce)">Nom</text>
      <text x="190" y="161" font-size="19">vavi</text>
      <text x="178" y="200" font-size="15" style="fill:var(--encre-douce)">Adresse</text>
      <text x="190" y="231" font-size="17">vavi.dev/api/mcp</text>
      <text x="380" y="288" font-size="20" style="fill:#fff">Ajouter</text>
      <text x="500" y="160" font-size="20" style="fill:var(--vert)" transform="rotate(-6 500 160)">déjà rempli !</text>
      <path d="M498 168c-12 4-20 2-28-4" stroke="var(--vert)" filter="url(#stylo)"/>
      <g class="clic c1"><circle cx="452" cy="292" r="14" stroke="var(--vert)"/></g>
      <g class="curseur k1"><path d="M0 0l12 30 6-12 14 12 5-5-13-13 13-5z" fill="var(--carte)"/></g>
    </g>
    <!-- 2 : se connecter, autoriser -->
    <g class="scene s2">
      <text x="124" y="34" font-size="15">vavi · autoriser Claude</text>
      <g filter="url(#stylo)">
        <rect x="170" y="66" width="300" height="262" rx="16" fill="var(--carte)"/>
        <circle cx="268" cy="114" r="24" fill="var(--surligneur)"/>
        <path d="M300 114h36M330 106l8 8-8 8"/>
        <circle cx="372" cy="114" r="24" fill="var(--carte)"/><path d="M362 110c5-9 15-9 20 0M360 120c7 7 17 7 24 0"/>
        <rect x="196" y="186" width="248" height="36" rx="9" fill="var(--surligne-fond)"/>
        <rect class="presse" x="226" y="250" width="188" height="44" rx="11" fill="var(--vert)"/>
      </g>
      <text x="252" y="120" font-size="17" font-weight="700">vavi</text>
      <text x="216" y="172" font-size="19">Claude demande l'accès</text>
      <text x="208" y="211" font-size="18">vous@exemple.fr</text>
      <text x="276" y="280" font-size="24" style="fill:#fff">Autoriser</text>
      <text x="486" y="210" font-size="20" style="fill:var(--vert)" transform="rotate(5 486 210)">sans mot</text>
      <text x="486" y="232" font-size="20" style="fill:var(--vert)" transform="rotate(5 486 232)">de passe</text>
      <g class="clic c2"><circle cx="400" cy="286" r="14" stroke="var(--vert)"/></g>
      <g class="curseur k2"><path d="M0 0l12 30 6-12 14 12 5-5-13-13 13-5z" fill="var(--carte)"/></g>
    </g>
    <!-- 3 : décrire, voir l'aperçu -->
    <g class="scene s3">
      <text x="124" y="34" font-size="15">claude.ai · nouvelle conversation</text>
      <g filter="url(#stylo)">
        <rect class="bulle" x="250" y="66" width="360" height="74" rx="14" fill="var(--surligne-fond)"/>
        <rect class="apercu" x="40" y="160" width="400" height="170" rx="14" fill="var(--carte)"/>
        <path class="apercu" d="M40 188h400M62 216h150M62 236h110"/>
        <rect class="apercu" x="62" y="262" width="100" height="32" rx="9" fill="var(--vert)"/>
        <path class="apercu" d="M300 300c-6-34 22-52 56-52s62 18 56 52z" fill="url(#hachures)"/>
      </g>
      <text class="bulle" x="266" y="96" font-size="19">Avec vavi, fais le site</text>
      <text class="bulle" x="266" y="122" font-size="19">de ma boulangerie…</text>
      <text class="apercu" x="56" y="181" font-size="16" font-weight="700">Aperçu · Le Fournil</text>
      <text class="apercu" x="78" y="284" font-size="17" style="fill:#fff">Commander</text>
      <text class="apercu" x="462" y="250" font-size="24" style="fill:var(--vert)" transform="rotate(-6 462 250)">votre aperçu !</text>
    </g>
  </svg>
  <figcaption class="legende"><span class="l1">1. Ajouter vavi</span><span class="l2">2. Autoriser Claude</span><span class="l3">3. Décrire votre projet</span></figcaption>
</figure>

    <ol class="etapes" style="list-style:none;margin:0;padding:0">

      <!-- 1 -->
      <li class="etape">
        <div class="numero"><svg viewBox="0 0 84 84" fill="none" stroke="var(--encre)" stroke-width="2.4" filter="url(#stylo)" aria-hidden="true"><path d="M42 6c22 0 36 14 36 36S62 78 40 78 6 62 7 40 22 5 46 7"/></svg>1</div>
        <div class="corps">
          <span class="qui">Vous, dans <b>Claude.ai</b> · une fois</span>
          <h3>Ajoutez vavi à Claude, d'un bouton</h3>
          <p><a class="bouton plein" href="__LIEN_D_INSTALLATION__" target="_blank" rel="noopener">Ajouter vavi à Claude</a></p>
          <ol class="sous">
            <li><span>Le bouton ouvre Claude.ai avec le nom et l'adresse de vavi déjà remplis. Connectez-vous à Claude si on vous le demande.</span></li>
            <li><span>Vérifiez que le nom est <b>vavi</b>, puis cliquez sur <kbd>Ajouter</kbd>.</span></li>
          </ol>
          <p class="astuce">Un compte Claude suffit : l'offre gratuite permet un connecteur personnalisé. Le bouton ne s'ouvre pas ? Collez cette adresse dans Personnaliser, puis Connecteurs, puis « Ajouter un connecteur personnalisé ».</p>
          <div class="copie"><code id="adresse-mcp">__ADRESSE_MCP__</code><button type="button" data-copier="adresse-mcp">Copier</button></div>
        </div>
        <svg class="croquis dessin" viewBox="0 0 320 200" fill="none" stroke="var(--encre)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <g filter="url(#stylo)">
            <rect x="14" y="14" width="292" height="172" rx="14" fill="var(--papier)"/>
            <rect x="34" y="66" width="252" height="30" rx="8" fill="var(--carte)"/>
            <rect x="34" y="104" width="252" height="30" rx="8" fill="var(--carte)"/>
            <rect x="186" y="144" width="100" height="32" rx="9" fill="var(--vert)"/>
          </g>
          <text x="34" y="50" font-size="19" font-weight="700">Nouveau connecteur</text>
          <text x="46" y="87" font-size="16">vavi</text>
          <text x="46" y="125" font-size="16">vavi.dev/api/mcp</text>
          <text x="206" y="166" font-size="18" style="fill:#fff">Ajouter</text>
          <text x="36" y="166" font-size="18" style="fill:var(--vert)" transform="rotate(-6 36 166)">déjà rempli ↑</text>
        </svg>
      </li>

      <!-- 2 -->
      <li class="etape">
        <div class="numero"><svg viewBox="0 0 84 84" fill="none" stroke="var(--encre)" stroke-width="2.4" filter="url(#stylo)" aria-hidden="true"><path d="M44 7c20 1 34 16 33 36S60 78 39 77 6 60 8 39 25 6 48 8"/></svg>2</div>
        <div class="corps">
          <span class="qui">Vous, entre <b>Claude.ai</b> et <b>vavi</b> · une fois</span>
          <h3>Connectez-vous et autorisez Claude</h3>
          <ol class="sous">
            <li><span>À côté de vavi, cliquez sur <kbd>Se connecter</kbd>. Une page vavi s'ouvre.</span></li>
            <li><span>Tapez votre adresse e-mail. Ouvrez le courriel de vavi et cliquez sur le lien : votre compte vavi est créé, sans mot de passe.</span></li>
            <li><span>Cliquez sur <kbd>Autoriser</kbd>. Vous revenez dans Claude.ai, et vavi apparaît comme connecté.</span></li>
          </ol>
          <p>Claude peut alors travailler sur vos projets vavi, et seulement eux.</p>
          <p class="astuce">Vous pouvez retirer cet accès à tout moment depuis votre console vavi.</p>
        </div>
        <svg class="croquis dessin" viewBox="0 0 320 200" fill="none" stroke="var(--encre)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <g filter="url(#stylo)">
            <rect x="46" y="12" width="228" height="176" rx="14" fill="var(--papier)"/>
            <circle cx="110" cy="56" r="20" fill="var(--surligneur)"/>
            <path d="M138 56h30M162 48l8 8-8 8"/>
            <circle cx="206" cy="56" r="20" fill="var(--carte)"/><path d="M198 52c4-8 12-8 16 0M196 62c6 6 14 6 20 0"/>
            <rect x="80" y="124" width="160" height="38" rx="10" fill="var(--vert)"/>
            <path d="M224 170l10 24 5-10 11 9 4-5-10-9 10-4z" fill="var(--carte)"/>
          </g>
          <text x="96" y="62" font-size="16" font-weight="700">vavi</text>
          <text x="78" y="104" font-size="17">Claude demande l'accès</text>
          <text x="122" y="150" font-size="22" style="fill:#fff">Autoriser</text>
        </svg>
      </li>
      <!-- 3 -->
      <li class="etape">
        <div class="numero"><svg viewBox="0 0 84 84" fill="none" stroke="var(--encre)" stroke-width="2.4" filter="url(#stylo)" aria-hidden="true"><path d="M43 7c21 0 35 15 34 35S61 78 40 77 7 61 7 40 23 6 47 8"/></svg>3</div>
        <div class="corps">
          <span class="qui">Vous et <b>Claude</b>, dans une conversation</span>
          <h3>Décrivez votre projet, avec vos mots</h3>
          <p class="attention"><b>Avant d'écrire :</b> dans une nouvelle conversation, ouvrez le menu des outils, sous la zone où vous tapez, et activez <b>vavi</b>. Sans ça, Claude ne voit pas vavi.</p>
          <p>Collez ce premier message, puis complétez-le avec vos mots :</p>
          <div class="copie"><code id="premier-message">__PREMIER_MESSAGE__…</code><button type="button" data-copier="premier-message" data-texte="__PREMIER_MESSAGE__">Copier</button></div>
          <p>Dites ensuite ce que vous voulez. Claude vous pose les questions qui manquent, puis écrit les pages, la base de données et les paiements dans votre projet vavi.</p>
          <p class="exemple">« Fais le site de ma boulangerie. Je veux que les clients puissent commander un gâteau et venir le chercher le samedi. »</p>
          <p class="astuce">Joignez un logo, des photos, une carte des prix : Claude s'en sert.</p>
        </div>
        <svg class="croquis dessin" viewBox="0 0 320 200" fill="none" stroke="var(--encre)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <g filter="url(#stylo)">
            <rect x="120" y="14" width="180" height="52" rx="12" fill="var(--surligne-fond)"/>
            <rect x="20" y="82" width="200" height="56" rx="12" fill="var(--carte)"/>
            <path d="M36 104h150M36 120h110"/>
            <rect x="200" y="140" width="96" height="50" rx="6" fill="var(--carte)"/>
            <path d="M200 156h96M214 172h50"/>
            <path d="M262 120l26-26 8 8-26 26-12 4z" fill="var(--surligneur)"/>
          </g>
          <text x="132" y="38" font-size="17">Je veux un site pour</text>
          <text x="132" y="57" font-size="17">ma boulangerie…</text>
          <text x="36" y="160" font-size="17" style="fill:var(--encre-douce)">Qui prépare les commandes ?</text>
          <text x="214" y="152" font-size="13">accueil.tsx</text>
        </svg>
      </li>

      <!-- 4 -->
      <li class="etape">
        <div class="numero"><svg viewBox="0 0 84 84" fill="none" stroke="var(--encre)" stroke-width="2.4" filter="url(#stylo)" aria-hidden="true"><path d="M41 6c22 0 37 15 36 37S60 79 39 77 6 60 8 39 24 7 46 7"/></svg>4</div>
        <div class="corps">
          <span class="qui">Vous · autant de fois que nécessaire</span>
          <h3>Regardez l'aperçu, demandez des changements</h3>
          <p>Claude vous donne un lien d'aperçu privé. Ouvrez-le sur votre ordinateur et sur votre téléphone. Quelque chose ne va pas ? Dites-le à Claude, en une phrase : il lit ce qui existe avant de le modifier.</p>
          <p class="exemple">« Mets les gâteaux du week-end en premier, et le bouton Commander en plus grand. »</p>
        </div>
        <svg class="croquis dessin" viewBox="0 0 320 200" fill="none" stroke="var(--encre)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <g filter="url(#stylo)">
            <rect x="14" y="20" width="210" height="140" rx="10" fill="var(--carte)"/>
            <path d="M14 42h210M2 172h234l-12-12H14z"/>
            <path d="M32 64h90M32 80h70"/><rect x="32" y="96" width="54" height="18" rx="6" fill="var(--vert)"/>
            <path d="M120 140c-4-24 14-36 38-36s44 12 40 36z" fill="url(#hachures)"/>
            <rect x="236" y="40" width="72" height="140" rx="14" fill="var(--carte)"/>
            <path d="M250 70h44M250 84h30"/><rect x="250" y="98" width="34" height="14" rx="5" fill="var(--vert)"/>
            <path d="M250 150c-2-14 8-22 22-22s24 8 22 22z" fill="url(#hachures)"/>
            <path d="M264 56h16"/>
          </g>
          <text x="30" y="36" font-size="13">aperçu privé</text>
          <text x="40" y="196" font-size="19" style="fill:var(--vert)">pareil sur téléphone →</text>
        </svg>
      </li>

      <!-- 5 -->
      <li class="etape">
        <div class="numero"><svg viewBox="0 0 84 84" fill="none" stroke="var(--encre)" stroke-width="2.4" filter="url(#stylo)" aria-hidden="true"><path d="M43 6c22 1 35 16 34 37S59 79 40 77 6 60 8 39 24 6 47 8"/></svg>5</div>
        <div class="corps">
          <span class="qui">Vous, dans la <b>console vavi</b> · pour vendre</span>
          <h3>Ouvrez votre compte de paiement</h3>
          <p>Votre site vend ou prend des acomptes ? Cliquez sur <b>Ouvrir mon compte Stripe</b>. vavi crée le compte et vous emmène sur le formulaire sécurisé de Stripe : pièce d'identité, RIB, numéro d'entreprise. Vous ne le faites qu'une fois, et l'argent des ventes arrive sur votre compte.</p>
          <p class="astuce">Un site vitrine sans paiement saute cette étape.</p>
        </div>
        <svg class="croquis dessin" viewBox="0 0 320 200" fill="none" stroke="var(--encre)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <g filter="url(#stylo)">
            <rect x="14" y="20" width="150" height="160" rx="12" fill="var(--papier)"/>
            <rect x="30" y="120" width="118" height="36" rx="10" fill="var(--vert)"/>
            <path d="M30 56h90M30 74h70"/>
            <path class="trace" d="M170 138c30 0 40-40 62-46"/><path d="M222 82l12 10-14 6"/>
            <rect x="196" y="22" width="110" height="160" rx="12" fill="var(--carte)"/>
            <rect x="212" y="98" width="78" height="22" rx="5" fill="var(--surligne-fond)"/>
            <rect x="212" y="130" width="78" height="22" rx="5"/>
            <path d="M226 60l6 6 12-14" stroke="var(--vert)" stroke-width="3"/>
          </g>
          <text x="30" y="44" font-size="17" font-weight="700">Paiements</text>
          <text x="38" y="144" font-size="16" style="fill:#fff">Ouvrir mon compte</text>
          <text x="252" y="66" font-size="15">Stripe</text>
          <text x="216" y="114" font-size="14">pièce d'identité</text>
          <text x="216" y="146" font-size="14">RIB</text>
        </svg>
      </li>

      <!-- 6 -->
      <li class="etape">
        <div class="numero"><svg viewBox="0 0 84 84" fill="none" stroke="var(--encre)" stroke-width="2.4" filter="url(#stylo)" aria-hidden="true"><path d="M42 7c21-1 36 15 35 35S60 78 40 78 6 61 7 40 22 6 46 8"/></svg>6</div>
        <div class="corps">
          <span class="qui">Vous, dans la <b>console vavi</b></span>
          <h3>Publiez, d'un bouton</h3>
          <p>Quand l'aperçu vous plaît, ouvrez votre console vavi et cliquez sur <b>Publier</b>. Votre site est en ligne, avec son adresse sécurisée. C'est toujours vous qui publiez : Claude ne met rien en ligne à votre place.</p>
          <p class="astuce">vavi ne publie qu'une version qui se construit sans erreur.</p>
        </div>
        <svg class="croquis dessin" viewBox="0 0 320 200" fill="none" stroke="var(--encre)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <g filter="url(#stylo)">
            <rect x="14" y="14" width="292" height="172" rx="14" fill="var(--papier)"/>
            <path d="M14 46h292"/>
            <rect x="34" y="66" width="130" height="90" rx="8" fill="var(--carte)"/>
            <path d="M46 84h80M46 98h60"/>
            <path d="M48 130l10 10 20-22" stroke="var(--vert)" stroke-width="3"/>
            <rect x="186" y="92" width="102" height="44" rx="12" fill="var(--vert)"/>
            <path d="M270 140l9 22 5-9 10 8 4-5-9-8 9-4z" fill="var(--carte)"/>
            <path d="M296 84l10-8M298 100h12"/>
          </g>
          <text x="30" y="36" font-size="17" font-weight="700">Console vavi · Boulangerie</text>
          <text x="84" y="146" font-size="15" style="fill:var(--vert)">prêt</text>
          <text x="206" y="121" font-size="23" font-weight="700" style="fill:#fff">Publier</text>
        </svg>
      </li>

      <!-- 7 -->
      <li class="etape">
        <div class="numero"><svg viewBox="0 0 84 84" fill="none" stroke="var(--encre)" stroke-width="2.4" filter="url(#stylo)" aria-hidden="true"><path d="M44 6c21 1 34 17 33 37S59 79 39 77 6 59 8 39 26 6 48 8"/></svg>7</div>
        <div class="corps">
          <span class="qui">Vous, dans la <b>console vavi</b> · au quotidien</span>
          <h3>Gérez votre activité</h3>
          <p>Dans la console, vous retrouvez vos commandes, vos clients, vos factures, vos visites et toutes les données de votre site. Vous changez vous-même les couleurs, les polices et le référencement de vos pages. Une modification ne vous plaît pas ? Revenez à la version d'avant en un clic.</p>
          <p class="astuce">Pour faire évoluer le site, revenez simplement parler à Claude.</p>
        </div>
        <svg class="croquis dessin" viewBox="0 0 320 200" fill="none" stroke="var(--encre)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <g filter="url(#stylo)">
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
          <text x="26" y="56" font-size="15" font-weight="700">Commandes</text>
          <text x="28" y="78" font-size="14">Clients</text>
          <text x="28" y="100" font-size="14">Factures</text>
          <text x="28" y="122" font-size="14">Données</text>
          <text x="120" y="57" font-size="16">Fraisier · samedi</text>
          <text x="120" y="101" font-size="16">Tarte citron · samedi</text>
          <text x="120" y="145" font-size="16">Facture n° 2026-014</text>
          <text x="246" y="56" font-size="13">payée</text>
          <text x="244" y="100" font-size="13">à faire</text>
        </svg>
      </li>
    </ol>

    <div class="bloque" aria-label="Si vous êtes bloqué">
      <div><span class="main" style="font-size:1.3rem;color:var(--marge)">Bloqué ?</span><b>Claude ne me laisse pas ajouter vavi</b><p>Sur l'offre gratuite de Claude, un seul connecteur personnalisé est permis : retirez d'abord l'autre, ou passez à une offre payante. Le bouton ne s'ouvre pas ? La <a href="/commencer">page Commencer</a> donne l'adresse à copier.</p></div>
      <div><span class="main" style="font-size:1.3rem;color:var(--marge)">Bloqué ?</span><b>Je n'ai pas reçu le courriel de connexion</b><p>Regardez dans les indésirables. Le lien reste valable quelques minutes : au besoin, cliquez de nouveau sur Se connecter.</p></div>
      <div><span class="main" style="font-size:1.3rem;color:var(--marge)">Bloqué ?</span><b>Claude ne parle pas de vavi</b><p>vavi n'est pas activé dans cette conversation. Ouvrez le menu des outils sous la zone de texte et cochez vavi.</p></div>
    </div>
  </div>
</section>

<!-- ═════════ GARDE-FOUS ═════════ -->
<section aria-labelledby="t-garde">
  <div class="enveloppe garde">
    <svg class="croquis" viewBox="0 0 360 320" fill="none" stroke="var(--encre)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Croquis : un bouclier qui protège le site">
      <g filter="url(#stylo)">
        <path d="M180 20l120 40c0 120-40 200-120 240C100 260 60 180 60 60z" fill="var(--vert-fond)"/>
        <path d="M180 48l92 30c-2 92-32 156-92 188-60-32-90-96-92-188z" fill="url(#hachures)"/>
        <path d="M138 160l30 30 58-64" stroke="var(--vert)" stroke-width="5"/>
      </g>
      <text x="6" y="310" font-size="22">Claude travaille, vavi veille</text>
    </svg>
    <div>
      <div class="titre-section" style="margin-bottom:24px">
        <span class="main">Pour les débutants comme pour les autres</span>
        <h2 id="t-garde">Des garde-fous intégrés, pour que rien ne casse</h2>
        <p>Ces règles ne sont pas des conseils donnés à Claude : ce sont les outils de vavi qui refusent ce qui pourrait abîmer votre site.</p>
      </div>
      <ul class="liste-cochee">
        <li><svg viewBox="0 0 34 34" fill="none" stroke="var(--vert)" stroke-width="3" stroke-linecap="round" filter="url(#stylo)" aria-hidden="true"><rect x="3" y="3" width="28" height="28" rx="6" stroke="var(--encre)" stroke-width="2"/><path d="M9 17l6 6 11-13"/></svg><div><b>Claude relit avant de modifier</b><span>vavi refuse une modification si Claude n'a pas lu la version actuelle du fichier. Une page ne se fait pas écraser par erreur.</span></div></li>
        <li><svg viewBox="0 0 34 34" fill="none" stroke="var(--vert)" stroke-width="3" stroke-linecap="round" filter="url(#stylo)" aria-hidden="true"><rect x="3" y="3" width="28" height="28" rx="6" stroke="var(--encre)" stroke-width="2"/><path d="M9 17l6 6 11-13"/></svg><div><b>Aucun secret dans le code</b><span>Vos clés (Stripe, e-mail…) sont gardées par vavi. Elles ne sont jamais écrites dans les pages ni envoyées aux visiteurs.</span></div></li>
        <li><svg viewBox="0 0 34 34" fill="none" stroke="var(--vert)" stroke-width="3" stroke-linecap="round" filter="url(#stylo)" aria-hidden="true"><rect x="3" y="3" width="28" height="28" rx="6" stroke="var(--encre)" stroke-width="2"/><path d="M9 17l6 6 11-13"/></svg><div><b>Seule une version qui marche part en ligne</b><span>vavi construit chaque version. S'il y a une erreur, elle n'est pas publiable, et Claude reçoit l'erreur exacte pour la corriger.</span></div></li>
        <li><svg viewBox="0 0 34 34" fill="none" stroke="var(--vert)" stroke-width="3" stroke-linecap="round" filter="url(#stylo)" aria-hidden="true"><rect x="3" y="3" width="28" height="28" rx="6" stroke="var(--encre)" stroke-width="2"/><path d="M9 17l6 6 11-13"/></svg><div><b>Les droits sont posés par vavi</b><span>Claude décrit qui fait quoi. vavi écrit lui-même les règles d'accès de la base : un visiteur ne lit jamais les données d'un autre.</span></div></li>
        <li><svg viewBox="0 0 34 34" fill="none" stroke="var(--vert)" stroke-width="3" stroke-linecap="round" filter="url(#stylo)" aria-hidden="true"><rect x="3" y="3" width="28" height="28" rx="6" stroke="var(--encre)" stroke-width="2"/><path d="M9 17l6 6 11-13"/></svg><div><b>Toujours un retour en arrière</b><span>Chaque version est gardée. Vous revenez à celle d'hier en un clic.</span></div></li>
      </ul>
    </div>
  </div>
</section>

<!-- ═════════ ÉCONOMISER SON ABONNEMENT ═════════ -->
<section aria-labelledby="t-econome">
  <div class="enveloppe">
    <div class="titre-section">
      <span class="main">Votre abonnement Claude dure plus longtemps</span>
      <h2 id="t-econome">vavi fait le ménage pour que Claude travaille léger</h2>
      <p>Un abonnement Claude s'use surtout quand la conversation s'allonge, quand Claude relit tout le projet à chaque message ou quand il tourne en rond sur une erreur. vavi évite ces trois pièges.</p>
    </div>
    <ul class="econome" style="list-style:none;margin:0;padding:0">
      <li><svg viewBox="0 0 52 52" fill="none" stroke="var(--encre)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" filter="url(#stylo)" aria-hidden="true"><rect x="10" y="6" width="32" height="40" rx="4" fill="var(--carte)"/><path d="M17 16h18M17 24h12"/></svg><div><b>Des règles courtes, toujours à jour</b><span>Les règles de vavi tiennent en une page, et vavi les tient à jour lui-même. Pas de long fichier d'instructions à recopier et à relire à chaque message.</span></div></li>
      <li><svg viewBox="0 0 52 52" fill="none" stroke="var(--encre)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" filter="url(#stylo)" aria-hidden="true"><circle cx="22" cy="22" r="14" fill="var(--carte)"/><path d="M32 32l14 14"/><path d="M16 22h12"/></svg><div><b>Claude lit ce qui compte, pas tout</b><span>Claude ouvre seulement les fichiers que sa modification touche. Le reste du projet n'entre pas dans la conversation.</span></div></li>
      <li><svg viewBox="0 0 52 52" fill="none" stroke="var(--encre)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" filter="url(#stylo)" aria-hidden="true"><rect x="6" y="12" width="40" height="28" rx="5" fill="var(--carte)"/><path d="M14 26h6M24 26h14" stroke="var(--marge)"/></svg><div><b>Des erreurs dites en une ligne</b><span>Quand quelque chose ne marche pas, vavi donne le fichier et la ligne. Claude corrige du premier coup au lieu de chercher.</span></div></li>
      <li><svg viewBox="0 0 52 52" fill="none" stroke="var(--encre)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" filter="url(#stylo)" aria-hidden="true"><path d="M10 14h26a6 6 0 0 1 0 12H18a6 6 0 0 0 0 12h24" fill="none"/><path d="M38 32l6 6-6 6"/></svg><div><b>Une nouvelle conversation sans rien perdre</b><span>vavi garde les notes de chaque chantier : ce qui est fait, ce qui reste. Quand la conversation devient longue, Claude vous propose de reprendre dans une nouvelle, au même point.</span></div></li>
    </ul>
  </div>
</section>

<!-- ═════════ POURQUOI VAVI ═════════ -->
<section aria-labelledby="t-pourquoi">
  <div class="enveloppe">
    <div class="titre-section">
      <span class="main">Pourquoi vavi</span>
      <h2 id="t-pourquoi">Ce que vous y gagnez</h2>
    </div>
    <div class="pourquoi">
      <div class="raison"><span class="main">Aucun crédit à acheter</span><h3>Claude travaille dans votre abonnement Claude</h3><p>La conversation avec Claude est déjà payée par votre abonnement Claude. vavi ne vous facture pas les messages, les essais ni les corrections.</p></div>
      <div class="raison"><span class="main">Un prix fixe</span><h3>Vous savez ce que vous paierez</h3><p>Un abonnement mensuel par projet, le même quel que soit le nombre de changements demandés dans le mois.</p></div>
      <div class="raison"><span class="main">Prêt pour vendre en Europe</span><h3>TVA, factures, paiement</h3><p>TVA par article, factures numérotées, frais de livraison, paiement par carte : déjà construits, à brancher sur votre compte Stripe.</p></div>
      <div class="raison"><span class="main">Hébergé en Europe</span><h3>Vos données restent ici</h3><p>Base de données, fichiers et site sont hébergés en Europe, pour vous comme pour vos clients.</p></div>
      <div class="raison"><span class="main">Vous restez libre</span><h3>Votre code, votre base</h3><p>Sur toutes les offres payantes, vous exportez le code et les données (un Postgres standard) quand vous voulez. Vous restez parce que le service vous sert, pas parce que vous êtes coincé.</p></div>
      <div class="raison"><span class="main">Un seul connecteur</span><h3>Rien d'autre à brancher</h3><p>Base, paiements, aperçu, publication : tout passe par vavi. Vous ne jonglez pas entre cinq services.</p></div>
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
        <div class="ligne"><span>Abonnement vavi Boutique</span><span>49 €</span></div>
        <div class="ligne"><span>Messages à Claude, corrections, essais</span><span class="zero">0 € chez vavi</span></div>
        <div class="ligne"><span>Hébergement, base, aperçu, publication</span><span class="zero">inclus</span></div>
        <div class="ligne"><span>Votre nom de domaine branché (bientôt)</span><span class="zero">inclus</span></div>
        <div class="ligne"><span>Total vavi</span><span>49 € / mois</span></div>
      </div>
      <div style="display:grid;gap:14px">
        <h3>Ce qui ne passe pas par vavi</h3>
        <p>Votre <b>abonnement Claude</b> se paie chez Anthropic, comme aujourd'hui. Les <b>frais de paiement Stripe</b> sont prélevés par Stripe sur chaque vente. L'achat d'un <b>nom de domaine</b> se fait chez le registraire de votre choix.</p>
        <p class="main" style="font-size:1.45rem;color:var(--vert)">Pas de crédit qui fond quand vous demandez une correction.</p>
      </div>
    </div>

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
        <p class="prix">19 € <small>/ mois</small></p>
        <p class="pour">Un site vitrine pour présenter votre activité.</p>
        <ul><li>1 site publié</li><li>Votre nom de domaine (bientôt)</li><li>Design à vos couleurs</li><li>Pages RGPD et formulaire protégé du spam</li><li>Référencement et nombre de visites</li><li>Export du code et des données</li></ul>
        <a class="bouton" href="#etapes">Choisir Site</a>
      </div>
      <div class="offre vedette">
        <span class="etiquette">pour vendre</span>
        <h3>Boutique ou app</h3>
        <p class="prix">49 € <small>/ mois</small></p>
        <p class="pour">Pour vendre en ligne ou gérer clients et dossiers.</p>
        <ul><li>Tout de l'offre Site</li><li>Compte Stripe ouvert depuis la console</li><li>Agents IA (bientôt)</li><li>TVA par article, factures numérotées</li><li>Comptes clients et rôles</li><li>Commandes et clients dans la console</li></ul>
        <a class="bouton plein" href="#etapes">Choisir Boutique</a>
      </div>
      <div class="offre">
        <h3>Pro</h3>
        <p class="prix">129 € <small>/ mois</small></p>
        <p class="pour">Pour plusieurs projets, ou pour vos clients.</p>
        <ul><li>5 projets, sites ou apps</li><li>Tout de l'offre Boutique</li><li>Export de chaque projet, code et données</li></ul>
        <a class="bouton" href="#etapes">Choisir Pro</a>
      </div>
    </div>
    <p class="en-plus">Un projet de plus, sur n'importe quelle offre payante : <b>15 € / mois</b>. Sans engagement, résiliable à tout moment.</p>
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
      <details><summary>Les agents IA consommeront-ils mon abonnement Claude ?</summary><p>Non. Les agents arrivent bientôt. Ils travailleront dans votre site, même quand vous n'êtes pas là. Ils utiliseront une clé d'IA à votre nom, facturée à l'usage par le fournisseur d'IA. vavi ne prend rien dessus.</p></details>
      <details><summary>Un agent peut-il envoyer un e-mail ou lancer une publicité tout seul ?</summary><p>Non. Un agent prépare, vous validez. Rien n'est envoyé, payé ou publié sans votre clic.</p></details>
      <details><summary>Que demande Stripe pour ouvrir mon compte ?</summary><p>En général une pièce d'identité, un RIB et le numéro de votre entreprise. Vous les déposez une seule fois, sur le formulaire sécurisé de Stripe : vavi ne garde pas vos papiers.</p></details>
      <details><summary>Puis-je utiliser mon propre nom de domaine ?</summary><p>Bientôt, sur toutes les offres payantes. En attendant, votre site est en ligne à son adresse sécurisée chez vavi.</p></details>
    </div>
  </div>
</section>

<!-- ═════════ FIN ═════════ -->
<section class="fin" aria-labelledby="t-fin">
  <div class="enveloppe">
    <svg class="croquis" viewBox="0 0 420 120" fill="none" stroke="var(--encre)" stroke-width="2.4" stroke-linecap="round" aria-hidden="true">
      <g filter="url(#stylo)"><path class="trace" d="M20 90c60-60 120-60 180-20s120 30 190-40"/><path d="M372 26l20 4-6 20"/></g>
      <text x="40" y="40" font-size="24">votre idée</text><text x="300" y="104" font-size="24" style="fill:var(--vert)">en ligne</text>
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
    <nav aria-label="Pied de page"><a href="#prix">Prix</a><a href="#questions">Questions</a><a href="/commencer">Commencer</a><a href="/projets">Console</a><a href="/confidentialite">Confidentialité</a><a href="mailto:info@vavi.dev">Contact</a></nav>
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

/** Le texte, sûr dans un attribut comme dans un élément. */
const enHtml = (t: string): string => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** PURE : la page, l'adresse du connecteur et le premier message posés. `premier` : le message de la page Commencer. */
export function laPageDAccueil(premier: string, adresse: string = adresseMcp()): string {
  return GABARIT.split('__LIEN_D_INSTALLATION__').join(enHtml(lienDInstallation(adresse)))
    .split('__ADRESSE_MCP__').join(enHtml(adresse))
    .split('__PREMIER_MESSAGE__').join(enHtml(premier.trim()));
}
