/**
 * LA VUE DE VAVI DANS CLAUDE (MCP Apps, spécification 2026-01-26) — sous la réponse de Claude, la fiche du projet :
 * l'aperçu encadré, où il en est (en ligne, à publier), ses dernières versions, ses messages et ses visites, et le
 * bouton « Publier » que la personne seule clique (décision d'Antoine du 24/11 : un maximum dans Claude, Publier aussi).
 *
 * La vue est une page HTML sans dépendance, servie par `resources/read` de `ui://vavi/projet`. Elle parle à l'hôte en
 * JSON-RPC par postMessage : `ui/initialize`, puis le résultat de l'outil (`ui/notifications/tool-result`), puis ses
 * propres appels (`tools/call` des outils réservés à la vue). Elle porte le jeton de vue du compte, que le modèle ne voit
 * jamais : c'est lui qui prouve qu'un clic vient de la personne.
 *
 * Neuf dans vavi (24/11).
 */
export const RESSOURCE_DE_LA_VUE = 'ui://vavi/projet';
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
export function laRessourceDeLaVue(o: { readonly jeton: string; readonly cadres: readonly string[] }) {
  return {
    contents: [{
      uri: RESSOURCE_DE_LA_VUE, mimeType: TYPE_DE_LA_VUE, text: laPage(o.jeton),
      _meta: { ui: { csp: { frameDomains: [...o.cadres], resourceDomains: [], connectDomains: [] }, prefersBorder: true } },
    }],
  };
}

/** Les domaines que le cadre de la vue ouvre : les hôtes des apps, sinon l'origine de la console (`/p/`). PURE. */
export const lesCadresPermis = (console: string, domaine: string | null): string[] =>
  domaine ? [`https://*.${domaine}`] : [new URL(console).origin];

function laPage(jeton: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
:root{--fond:#fff;--texte:#1c1c1c;--doux:#666;--trait:#e3e3e3;--vert:#1f7a4a;--accent:#1f7a4a}
@media (prefers-color-scheme:dark){:root{--fond:#1e1e1e;--texte:#eee;--doux:#aaa;--trait:#3a3a3a;--vert:#4cc38a;--accent:#4cc38a}}
*{box-sizing:border-box}body{margin:0;font:14px/1.45 system-ui,-apple-system,sans-serif;background:var(--fond);color:var(--texte)}
main{padding:12px 14px;display:grid;gap:10px}
.entete{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}
h1{font-size:16px;margin:0}.etat{font-size:12px;padding:2px 8px;border-radius:99px;border:1px solid var(--trait);color:var(--doux)}
.etat.vert{color:var(--vert);border-color:var(--vert)}
iframe{width:100%;height:460px;border:1px solid var(--trait);border-radius:8px;background:#fff}
.boutons{display:flex;gap:8px;flex-wrap:wrap}
button{font:inherit;padding:7px 12px;border-radius:8px;border:1px solid var(--trait);background:transparent;color:var(--texte);cursor:pointer}
button.principal{background:var(--accent);border-color:var(--accent);color:#fff}button:disabled{opacity:.5;cursor:default}
.doux{color:var(--doux)}ul{margin:0;padding-left:18px}.grille{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}
.carte{border:1px solid var(--trait);border-radius:8px;padding:8px 10px}.carte h2{font-size:13px;margin:0 0 4px}
[role=status]{font-weight:600}
</style></head>
<body><main id="vue"><p class="doux" id="attente">…</p></main>
<script>
(function(){
  var JETON=${enScript(jeton)};
  var fr=(navigator.language||'').toLowerCase().indexOf('fr')===0;
  var T=fr?{attente:'Chargement du projet…',enLigne:'En ligne',aPublier:'Changements à publier',rien:'Pas encore d’aperçu',grand:'Ouvrir en grand',
    site:'Voir le site en ligne',publier:'Publier',publierQ:'Confirmer : mettre en ligne cet aperçu',publie:'C’est en ligne.',console:'Console vavi',
    versions:'Dernières versions',messages:'Messages reçus',visites:'Visites (30 jours)',aucun:'Aucun',offre:'Choisir une offre',
    travail:'Travail en cours avec Claude',erreur:'Cela n’a pas marché :',sansApercu:'Demandez à Claude de construire l’aperçu.'}
  :{attente:'Loading the project…',enLigne:'Online',aPublier:'Changes to publish',rien:'No preview yet',grand:'Open full size',
    site:'See the live site',publier:'Publish',publierQ:'Confirm: put this preview online',publie:'It is online.',console:'vavi console',
    versions:'Latest versions',messages:'Messages received',visites:'Visits (30 days)',aucun:'None',offre:'Choose a plan',
    travail:'Work in progress with Claude',erreur:'That did not work:',sansApercu:'Ask Claude to build the preview.'};
  document.getElementById('attente').textContent=T.attente;
  var n=0,attendus={};
  function envoyer(methode,params,notif){var m={jsonrpc:'2.0',method:methode,params:params||{}};if(!notif){m.id=++n;}
    window.parent.postMessage(m,'*');if(notif)return Promise.resolve();return new Promise(function(ok,non){attendus[m.id]={ok:ok,non:non};});}
  function lien(url){return envoyer('ui/open-link',{url:url}).catch(function(){window.open(url,'_blank','noopener');});}
  function taille(){envoyer('ui/notifications/size-changed',{width:document.body.scrollWidth,height:document.body.scrollHeight},true);}
  function el(tag,attrs,enfants){var e=document.createElement(tag);for(var k in attrs||{}){if(k==='texte')e.textContent=attrs[k];else if(k.indexOf('on')===0)e.addEventListener(k.slice(2),attrs[k]);else e.setAttribute(k,attrs[k]);}
    (enfants||[]).forEach(function(c){if(c)e.appendChild(c);});return e;}
  function outil(nom,args){return envoyer('tools/call',{name:nom,arguments:args}).then(function(r){var s=r&&r.structuredContent;if(!s||s.refuse)throw new Error((s&&s.fait)||'refus');return s;});}
  var projet=null,entree=null;
  function montrer(f,message){
    var v=document.getElementById('vue');v.textContent='';
    var etat=f.state==='en_ligne'?T.enLigne:f.state==='a_publier'?T.aPublier:T.rien;
    v.appendChild(el('div',{class:'entete'},[el('h1',{texte:f.name}),el('span',{class:'etat'+(f.state==='en_ligne'?' vert':''),texte:etat})]));
    if(f.work_session)v.appendChild(el('p',{class:'doux',texte:T.travail+' : '+f.work_session}));
    if(message)v.appendChild(el('p',{role:'status',texte:message}));
    if(f.preview_url)v.appendChild(el('iframe',{src:f.preview_url,title:'aperçu',loading:'lazy'}));else v.appendChild(el('p',{class:'doux',texte:T.sansApercu}));
    var b=el('div',{class:'boutons'});
    if(f.preview_url)b.appendChild(el('button',{texte:T.grand,onclick:function(){lien(f.preview_url);}}));
    // Deux clics, dans la vue : le cadre de l'hôte peut interdire window.confirm (bac à sable sans « allow-modals »).
    if(f.state==='a_publier')b.appendChild(el('button',{class:'principal',texte:T.publier,onclick:function(e){var x=e.target;
      if(!x.dataset.sur){x.dataset.sur='1';x.textContent=T.publierQ;return;}
      x.disabled=true;outil('vavi_mettre_en_ligne',{project:f.id,geste:JETON})
        .then(function(r){montrer(r.fiche,T.publie);}).catch(function(y){montrer(f,T.erreur+' '+y.message);});}}));
    if(f.online_url)b.appendChild(el('button',{texte:T.site,onclick:function(){lien(f.online_url);}}));
    if(f.plan_url&&f.state==='a_publier'&&f.can_publish===false)b.appendChild(el('button',{texte:T.offre,onclick:function(){lien(f.plan_url);}}));
    b.appendChild(el('button',{texte:T.console,onclick:function(){lien(f.console_url);}}));
    v.appendChild(b);
    var g=el('div',{class:'grille'});
    g.appendChild(el('div',{class:'carte'},[el('h2',{texte:T.versions}),f.versions&&f.versions.length?el('ul',{},f.versions.map(function(x){return el('li',{texte:x.version+' · '+x.why});})):el('p',{class:'doux',texte:T.aucun})]));
    g.appendChild(el('div',{class:'carte'},[el('h2',{texte:T.messages}),el('p',{texte:f.messages==null?'—':String(f.messages)})]));
    g.appendChild(el('div',{class:'carte'},[el('h2',{texte:T.visites}),el('p',{texte:f.visits==null?'—':String(f.visits)})]));
    v.appendChild(g);setTimeout(taille,50);
  }
  function charger(id){projet=id;outil('vavi_fiche_du_projet',{project:id,geste:JETON}).then(function(f){montrer(f);})
    .catch(function(x){document.getElementById('vue').textContent=T.erreur+' '+x.message;taille();});}
  window.addEventListener('message',function(e){var m=e.data;if(!m||m.jsonrpc!=='2.0')return;
    if(m.id!=null&&attendus[m.id]){var a=attendus[m.id];delete attendus[m.id];if(m.error)a.non(new Error(m.error.message));else a.ok(m.result);return;}
    if(m.method==='ui/notifications/tool-input'){var a2=(m.params&&m.params.arguments)||{};if(a2.project){entree=a2.project;if(!projet)charger(a2.project);}}
    if(m.method==='ui/notifications/tool-result'){var s=(m.params&&m.params.structuredContent)||{};var id=s.project||s.id||entree;if(id)charger(id);}
    if(m.method==='ui/resource-teardown'&&m.id!=null)window.parent.postMessage({jsonrpc:'2.0',id:m.id,result:{}},'*');
  });
  envoyer('ui/initialize',{protocolVersion:'2026-01-26',appInfo:{name:'vavi',version:'1'},clientInfo:{name:'vavi',version:'1'},appCapabilities:{availableDisplayModes:['inline','fullscreen']}})
    .then(function(){envoyer('ui/notifications/initialized',{},true);taille();}).catch(function(){taille();});
})();
</script></body></html>`;
}
