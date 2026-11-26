/**
 * LA VUE DE VAVI DANS CLAUDE (MCP Apps, spécification 2026-01-26) — sous la réponse de Claude, ou dans le panneau à
 * droite : l'aperçu de l'app lui-même, qui reste affiché, et sous lui une barre fixe de boutons (voir l'aperçu dans un
 * onglet, l'app à côté ou en grand si l'hôte l'offre, « Publier » que la personne seule clique, le site en ligne, l'offre,
 * la console). Décisions d'Antoine : un maximum dans Claude, Publier aussi (24/11) ; l'aperçu gardé et les boutons seuls,
 * fixes sous lui (25/11) — versions, messages et visites restent dans la console.
 *
 * La vue est une page HTML sans dépendance, servie par `resources/read` de `ui://vavi/projet`. Elle parle à l'hôte en
 * JSON-RPC par postMessage : `ui/initialize`, puis le résultat de l'outil (`ui/notifications/tool-result`), puis ses
 * propres appels (`tools/call` des outils réservés à la vue). Elle porte le jeton de vue du compte, que le modèle ne voit
 * jamais : c'est lui qui prouve qu'un clic vient de la personne.
 *
 * Neuf dans vavi (24/11). Le 26/11 (Antoine) : elle s'ouvre dès `create_project` et `ouvrir_chantier`, dit ce que Claude
 * construit tant que le chantier est ouvert, et devient l'aperçu au premier build.
 */
/**
 * L'adresse de la vue porte l'empreinte de sa page (10 premiers caractères du SHA-256, jeton `JETON`) : Claude.ai garde
 * la page qu'il a lue à une adresse (26/11 : une vue corrigée et déployée restait l'ancienne chez Antoine) ; une page
 * changée prend une adresse neuve, que l'hôte lit. `test/mcp/la-vue.test.ts` exige l'empreinte de la page servie.
 */
export const EMPREINTE_DE_LA_VUE = '0d94898d7c';
export const RESSOURCE_DE_LA_VUE = `ui://vavi/projet/${EMPREINTE_DE_LA_VUE}`;
export const TYPE_DE_LA_VUE = 'text/html;profile=mcp-app';

/** Ce qu'un outil porte pour être affiché dans la vue (la clé plate est l'ancienne forme, encore lue par des hôtes). */
export const META_DE_LA_VUE = { ui: { resourceUri: RESSOURCE_DE_LA_VUE }, 'ui/resourceUri': RESSOURCE_DE_LA_VUE } as const;
/** Un outil que seule la vue appelle : l'hôte ne le montre pas au modèle. */
export const META_DE_LA_VUE_SEULE = { ui: { resourceUri: RESSOURCE_DE_LA_VUE, visibility: ['app'] } } as const;

const enScript = (v: unknown): string => JSON.stringify(v).replace(/</g, '\\u003c');

/**
 * PURE — le contenu de `resources/read` : la page, et les domaines que son cadre peut ouvrir (l'aperçu de l'app, à son
 * hôte ou sous la console). Rien d'autre n'est permis : ni script, ni connexion hors de l'hôte.
 */
export function laRessourceDeLaVue(o: { readonly jeton: string; readonly cadres: readonly string[]; readonly ressources?: readonly string[]; readonly connexions?: readonly string[] }) {
  return {
    contents: [{
      uri: RESSOURCE_DE_LA_VUE, mimeType: TYPE_DE_LA_VUE, text: laPage(o.jeton),
      _meta: { ui: { csp: { frameDomains: [], resourceDomains: [...(o.ressources ?? [])], connectDomains: [...(o.connexions ?? [])] }, prefersBorder: true } },
    }],
  };
}

/** Les domaines que le cadre de la vue ouvre : les hôtes des apps, sinon l'origine de la console (`/p/`). PURE. */
export const lesCadresPermis = (console: string, domaine: string | null): string[] =>
  domaine ? [`https://*.${domaine}`] : [new URL(console).origin];

/** Les adresses relatives (`./assets/…`, `assets/…`, `/assets/…`) des attributs `src` et `href` d'une page, nommées en
 * entier sous `adresse` (qui finit par `/`). PURE. */
export const lesFichiersEnEntier = (html: string, adresse: string): string =>
  html.replace(/\b(src|href)="(?!https?:|data:|#|\/\/)(?:\.\/|\/)?([^"]*)"/g, (_t, attribut: string, chemin: string) => `${attribut}="${adresse}${chemin}"`);

/**
 * Le script et les feuilles de style de la page, mis DANS la page (`<script type="module">`, `<style>`), lus par `lire`
 * (le chemin sous `adresse`) ; un fichier illisible garde son adresse. Le cadre de Claude.ai ne charge un fichier que
 * des domaines que la vue déclarait quand l'hôte l'a lue, et il la garde : une adresse de la console changée depuis
 * (INCIDENT 25/11, `vavi-essai.fly.dev` → `www.vavi.dev`) laissait l'aperçu blanc, script et style « bloqués ».
 * Ce qu'il remplace : le script et le style chargés depuis l'aperçu. `</script` et `</style` sont neutralisés.
 */
export async function lesFichiersDansLaPage(html: string, adresse: string, lire: (chemin: string) => Promise<string | null>): Promise<string> {
  const echappe = adresse.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const scripts = [...html.matchAll(new RegExp(`<script\\b[^>]*\\bsrc="${echappe}([^"]+\\.js)"[^>]*>\\s*</script>`, 'g'))];
  const styles = [...html.matchAll(new RegExp(`<link\\b[^>]*\\brel="stylesheet"[^>]*\\bhref="${echappe}([^"]+\\.css)"[^>]*>|<link\\b[^>]*\\bhref="${echappe}([^"]+\\.css)"[^>]*\\brel="stylesheet"[^>]*>`, 'g'))];
  let page = html;
  for (const m of scripts) {
    const js = await lire(m[1]!).catch(() => null);
    if (js !== null) page = page.replace(m[0], () => `<script type="module">${js.replace(/<\/script/gi, '<\\/script')}</script>`);
  }
  for (const m of styles) {
    const css = await lire((m[1] ?? m[2])!).catch(() => null);
    if (css !== null) page = page.replace(m[0], () => `<style>${css.replace(/<\/style/gi, '<\\/style')}</style>`);
  }
  return page;
}

function laPage(jeton: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
:root{--fond:#fff;--texte:#1c1c1c;--doux:#666;--trait:#e3e3e3;--vert:#1f7a4a;--accent:#1f7a4a}
@media (prefers-color-scheme:dark){:root{--fond:#1e1e1e;--texte:#eee;--doux:#aaa;--trait:#3a3a3a;--vert:#4cc38a;--accent:#4cc38a}}
*{box-sizing:border-box}body{margin:0;font:14px/1.45 system-ui,-apple-system,sans-serif;background:var(--fond);color:var(--texte)}
main{padding:12px 14px;display:grid;gap:10px}
.doux{color:var(--doux)}
</style></head>
<body><main id="vue"><p class="doux" id="attente">…</p></main>
<script>
(function(){
  var JETON=${enScript(jeton)};
  var fr=(navigator.language||'').toLowerCase().indexOf('fr')===0;
  var T=fr?{attente:'Chargement de l’aperçu…',enLigne:'En ligne',aPublier:'Changements à publier',rien:'Pas encore d’aperçu',grand:'Voir l’aperçu',
    site:'Voir le site en ligne',publier:'Publier',publierQ:'Confirmer : mettre en ligne cet aperçu',publie:'C’est en ligne.',console:'Console vavi',
    offre:'Choisir une offre',
    cote:'Garder l’app à côté',enGrand:'Ouvrir l’app en grand',erreur:'Cela n’a pas marché :',sansApercu:'Demandez à Claude de construire l’aperçu.',
    construit:'Claude construit :',prepare:'Claude prépare le premier aperçu, il s’affichera ici.',version:'Version'}
  :{attente:'Loading the preview…',enLigne:'Online',aPublier:'Changes to publish',rien:'No preview yet',grand:'See the preview',
    site:'See the live site',publier:'Publish',publierQ:'Confirm: put this preview online',publie:'It is online.',console:'vavi console',
    offre:'Choose a plan',
    cote:'Keep the app alongside',enGrand:'Open the app large',erreur:'That did not work:',sansApercu:'Ask Claude to build the preview.',
    construit:'Claude is building:',prepare:'Claude is preparing the first preview; it will show here.',version:'Version'};
  document.getElementById('attente').textContent=T.attente;
  var n=0,attendus={};
  // Ce que l'hôte répond (modes, panneau), redit après chaque écriture de l'app : document.open efface la console du cadre.
  var journal=[];function noter(){var x=['[vavi]'].concat([].slice.call(arguments));journal.push(x);console.log.apply(console,x);}
  function envoyer(methode,params,notif){var m={jsonrpc:'2.0',method:methode,params:params||{}};if(!notif){m.id=++n;}
    window.parent.postMessage(m,'*');if(notif)return Promise.resolve();return new Promise(function(ok,non){attendus[m.id]={ok:ok,non:non};});}
  function lien(url){return envoyer('ui/open-link',{url:url}).catch(function(){window.open(url,'_blank','noopener');});}
  function taille(){envoyer('ui/notifications/size-changed',{width:document.body.scrollWidth,height:Math.max(document.body.scrollHeight,140)},true);}
  function el(tag,attrs,enfants){var e=document.createElement(tag);for(var k in attrs||{}){if(k==='texte')e.textContent=attrs[k];else if(k.indexOf('on')===0)e.addEventListener(k.slice(2),attrs[k]);else e.setAttribute(k,attrs[k]);}
    (enfants||[]).forEach(function(c){if(c)e.appendChild(c);});return e;}
  function outil(nom,args){return envoyer('tools/call',{name:nom,arguments:args}).then(function(r){var s=r&&r.structuredContent;if(!s||s.refuse)throw new Error((s&&s.fait)||'refus');return s;});}
  var projet=null,entree=null,modes=[],ecrite=null,derniere=null,panneauRefuse=null;
  // L'APERÇU RESTE AFFICHÉ (Antoine, 25/11) : dès qu'il y a un aperçu, la vue devient l'app (son code chargé de vavi,
  // sa base jointe, sans cadre extérieur) ; les boutons tiennent dans une barre fixe sous elle. document.open efface les
  // écouteurs de la fenêtre : celui des messages de l'hôte est reposé après chaque écriture. La barre vit dans une ombre
  // (shadow DOM) : ni le style de l'app ne la touche, ni le sien ne touche l'app.
  function ecrire(html){if(ecrite===html)return;ecrite=html;document.open();document.write(html);document.close();
    window.removeEventListener('message',recevoir);window.addEventListener('message',recevoir);journal.forEach(function(x){console.log.apply(console,x);});
    envoyer('ui/notifications/size-changed',{width:document.body?document.body.scrollWidth:640,height:720},true);}
  function mode(m){return envoyer('ui/request-display-mode',{mode:m}).then(function(r){modeCourant=(r&&r.mode)||modeCourant;noter('mode accordé',r&&r.mode);},function(x){noter('mode refusé',x&&x.message);panneauRefuse=(x&&x.message)||'refused';if(derniere)laBarre(derniere);});}
  var STYLE=':host{all:initial}.barre{position:fixed;left:0;right:0;bottom:0;z-index:2147483647;display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:8px 10px;'
    +'font:13px/1.3 system-ui,-apple-system,sans-serif;background:#fff;color:#1c1c1c;border-top:1px solid #e3e3e3;box-shadow:0 -2px 10px rgba(0,0,0,.06)}'
    +'button{font:inherit;padding:6px 11px;border-radius:8px;border:1px solid #d6d6d6;background:#fff;color:inherit;cursor:pointer}'
    +'button.principal{background:#1f7a4a;border-color:#1f7a4a;color:#fff}button:disabled{opacity:.5;cursor:default}'
    +'.mot{flex-basis:100%;font-weight:600}.doux{flex-basis:100%;color:#666}'
    +'@media (prefers-color-scheme:dark){.barre{background:#1e1e1e;color:#eee;border-color:#3a3a3a}button{background:#262626;border-color:#444}.doux{color:#aaa}}';
  function laBarre(f,message){
    if(!document.body)document.documentElement.appendChild(document.createElement('body'));
    var hote=document.getElementById('vavi-barre');if(!hote){hote=el('div',{id:'vavi-barre'});document.body.appendChild(hote);hote.attachShadow({mode:'open'});}
    var ombre=hote.shadowRoot;ombre.textContent='';ombre.appendChild(el('style',{texte:STYLE}));
    var b=el('div',{class:'barre',role:'toolbar','aria-label':'vavi'});
    if(message)b.appendChild(el('span',{class:'mot',role:'status',texte:message}));
    else if(f.building)b.appendChild(el('span',{class:'mot',role:'status',texte:T.construit+' '+(f.work_session||'')}));
    if(!f.app_html&&!f.app_html_unchanged&&!f.building)b.appendChild(el('span',{class:'doux',texte:f.preview_url?T.attente:T.sansApercu}));
    if(f.preview_url)b.appendChild(el('button',{texte:T.grand,onclick:function(){lien(f.preview_url);}}));
    if(f.app_html&&(modes.indexOf('pip')>=0||!modes.length))b.appendChild(el('button',{texte:T.cote,onclick:function(){mode('pip');}}));
    if(f.app_html&&(modes.indexOf('fullscreen')>=0||!modes.length))b.appendChild(el('button',{texte:T.enGrand,onclick:function(){mode('fullscreen');}}));
    // Deux clics, dans la vue : le cadre de l'hôte peut interdire window.confirm (bac à sable sans « allow-modals »).
    if(f.state==='a_publier')b.appendChild(el('button',{class:'principal',texte:T.publier,onclick:function(e){var x=e.target;
      if(!x.dataset.sur){x.dataset.sur='1';x.textContent=T.publierQ;return;}
      x.disabled=true;outil('vavi_mettre_en_ligne',{project:f.id,geste:JETON})
        .then(function(r){montrer(r.fiche,T.publie);}).catch(function(y){montrer(f,T.erreur+' '+y.message);});}}));
    if(f.online_url)b.appendChild(el('button',{texte:T.site,onclick:function(){lien(f.online_url);}}));
    if(f.plan_url&&f.state==='a_publier'&&f.can_publish===false)b.appendChild(el('button',{texte:T.offre,onclick:function(){lien(f.plan_url);}}));
    b.appendChild(el('button',{texte:T.console,onclick:function(){lien(f.console_url);}}));
    // Ce que l'hôte a répondu à la demande du panneau, lisible sans la console du navigateur (26/11).
    if(panneauRefuse)b.appendChild(el('span',{class:'doux',texte:'Claude: '+panneauRefuse}));
    ombre.appendChild(b);
    setTimeout(function(){document.body.style.paddingBottom=(b.offsetHeight+8)+'px';},30);
  }
  // PENDANT QUE CLAUDE CONSTRUIT (Antoine, 26/11 : la vue s'ouvre dès la création, dit l'avancement, puis devient
  // l'aperçu) : avant le premier aperçu, ce que le chantier a déjà fait, version par version ; la fiche est relue toutes
  // les 5 s tant que le chantier est ouvert (45 min au plus), et l'aperçu nouveau remplace l'ancien de lui-même.
  function lAvancement(f){var v=document.getElementById('vue');if(!v)return;v.textContent='';
    v.appendChild(el('strong',{texte:f.name||''}));
    if(f.building)v.appendChild(el('p',{role:'status',texte:T.construit+' '+(f.work_session||'')}));
    v.appendChild(el('p',{class:'doux',texte:f.building?T.prepare:T.sansApercu}));
    var l=el('ol',{reversed:'reversed'});(f.versions||[]).forEach(function(x){l.appendChild(el('li',{texte:T.version+' '+x.version+' · '+(x.why||'')}));});
    if(l.childNodes.length)v.appendChild(l);}
  function montrer(f,message){var avant=derniere;derniere=f;
    if(f.app_html)ecrire(f.app_html);
    else if(f.app_html_unchanged&&avant&&ecrite){f.app_html=avant.app_html;}
    else lAvancement(f);
    laBarre(f,message);if(!f.app_html)setTimeout(taille,50);
    suivre(f);
  }
  var debutDuSuivi=Date.now(),minuteur=null;
  function suivre(f){if(minuteur)clearTimeout(minuteur);minuteur=null;
    if(!projet||Date.now()-debutDuSuivi>45*60000)return;
    // UNE SEULE VUE PAR CONVERSATION (Antoine, 26/11 : « je vois 2 fois le rendu dans le même message ») : seuls create_project
    // et get_project_state la portent, et elle suit le projet elle-même, vite pendant un chantier, lentement sinon.
    minuteur=setTimeout(function(){minuteur=null;relire();},f.building?5000:15000);}
  function relire(){if(!projet)return;outil('vavi_fiche_du_projet',{project:projet,geste:JETON,known:(derniere&&derniere.preview_fingerprint)||undefined})
    .then(function(f){montrer(f);},function(){if(derniere)suivre(derniere);});}
  // LE PANNEAU S'OUVRE DE LUI-MÊME (Antoine, 26/11 : « comme Claude Design, qui s'ouvre automatiquement à droite ») : le
  // modèle ne choisit pas où la vue s'affiche, la vue le demande à l'hôte, une fois, dès qu'elle a un projet. L'hôte peut
  // refuser (un geste de la personne exigé) : la vue reste alors dans la conversation, ses boutons « à côté » et « en grand ».
  var modeCourant=null,dejaDemande=false;
  function ouvrirLePanneau(){if(dejaDemande||modeCourant==='fullscreen')return;
    // Un hôte qui ne dit pas ses modes (Claude.ai, 26/11 : la vue restait dans la conversation) reçoit la demande quand même.
    var voulu=modes.indexOf('fullscreen')>=0||!modes.length?'fullscreen':modes.indexOf('pip')>=0?'pip':null;if(!voulu)return;dejaDemande=true;mode(voulu);}
  function charger(id){projet=id;debutDuSuivi=Date.now();outil('vavi_fiche_du_projet',{project:id,geste:JETON}).then(function(f){montrer(f);ouvrirLePanneau();})
    .catch(function(x){var v=document.getElementById('vue');if(v)v.textContent=T.erreur+' '+x.message;taille();});}
  function recevoir(e){var m=e.data;if(!m||m.jsonrpc!=='2.0')return;
    if(m.id!=null&&attendus[m.id]){var a=attendus[m.id];delete attendus[m.id];if(m.error)a.non(new Error(m.error.message));else a.ok(m.result);return;}
    if(m.method==='ui/notifications/tool-input'){var a2=(m.params&&m.params.arguments)||{};if(a2.project){entree=a2.project;if(!projet)charger(a2.project);}}
    if(m.method==='ui/notifications/tool-result'){var s=(m.params&&m.params.structuredContent)||{};var id=s.project||s.id||entree;if(id)charger(id);}
    if(m.method==='ui/notifications/host-context-changed'&&m.params&&m.params.displayMode)modeCourant=m.params.displayMode;
    if(m.method==='ui/resource-teardown'&&m.id!=null)window.parent.postMessage({jsonrpc:'2.0',id:m.id,result:{}},'*');
  }
  window.addEventListener('message',recevoir);
  envoyer('ui/initialize',{protocolVersion:'2026-01-26',appInfo:{name:'vavi',version:'1'},clientInfo:{name:'vavi',version:'1'},appCapabilities:{availableDisplayModes:['inline','fullscreen','pip']}})
    .then(function(r){modes=(r&&r.hostContext&&r.hostContext.availableDisplayModes)||[];modeCourant=(r&&r.hostContext&&r.hostContext.displayMode)||null;if(projet&&derniere)ouvrirLePanneau();noter('modes de l’hôte',JSON.stringify(modes),'affichage',modeCourant);envoyer('ui/notifications/initialized',{},true);taille();}).catch(function(x){noter('initialisation refusée',x&&x.message);taille();});
})();
</script></body></html>`;
}
