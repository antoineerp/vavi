/**
 * LE RELEVÉ DE LA PAGE RENDUE — les formes qui trahissent un site généré, mesurées sur l'accueil d'un build vert
 * (Antoine, 26/11 : « je vois encore des bandeaux très IA » ; « Oui pour contrôle »).
 *
 * Repris de constructor-v13 `generateur/oracle/marqueurs-de-gabarit.ts` (af23e80bb, 24/09 et 02/10 : numéros géants,
 * chiffres nus, carrousel), élargi aux interdits de `lib/design/le-langage.ts` (`CE_QUI_TRAHIT`) qu'une page rendue
 * montre : la bande d'appel à la couleur de l'accent, les bandes alternées, le héros centré à badge et deux boutons,
 * l'icône en pastille répétée, l'emoji, le halo, le dégradé étendu, la même carte arrondie partout.
 *
 * Ce qui est mesuré : une largeur, une position, une couleur, un rayon, une ombre. AUCUN MOT n'est lu pour décider (la
 * règle 7, et les apps parlent plusieurs langues) : le texte ne sert qu'à l'exemple rendu à Claude, pour qu'il retrouve
 * l'endroit. Le chrome (en-tête à navigation, pied, `nav`) n'est pas la page. Rien n'est jugé ici : un relevé brut, un
 * compte et un exemple par forme ; les seuils et les mots pour Claude sont dans `lib/design/ce-qui-trahit-la-page.ts`.
 *
 * Exécuté DANS la page, envoyé en texte (même raison que la mesure de l'accueil : une fonction compilée y arriverait
 * avec l'aide `__name` du compilateur, que la page n'a pas).
 */

export const FORMES_RELEVEES = [
  'bande-d-appel', 'bandes-alternees', 'heros-centre', 'chiffres-nus', 'chiffres-geants', 'carrousel-d-ouverture',
  'icones-en-pastille', 'emojis', 'halos', 'degrade-etendu', 'meme-carte-partout',
] as const;
export type FormeRelevee = (typeof FORMES_RELEVEES)[number];
/** `dessin` (26/11) : le dessin le plus travaillé de l'accueil, `n` ses formes (0 : aucun dessin), `exemple` son titre. */
export type ReleveDeLaPage = Readonly<Record<FormeRelevee | 'dessin', { readonly n: number; readonly exemple: string }>>;

export const RELEVER_LA_PAGE = `(() => {
  const vw = window.innerWidth, vh = window.innerHeight;
  const releve = {};
  for (const id of ${JSON.stringify(FORMES_RELEVEES)}) releve[id] = { n: 0, exemple: '' };
  const court = (t) => String(t || '').replace(/\\s+/g, ' ').trim().slice(0, 60);
  const noter = (id, exemple) => { const r = releve[id]; r.n += 1; if (!r.exemple) r.exemple = court(exemple); };
  const garder = (id, n, exemple) => { const r = releve[id]; if (n > r.n) { r.n = n; r.exemple = court(exemple); } };
  const px = (v) => { const x = parseFloat(v); return Number.isFinite(x) ? x : 0; };

  // Une couleur CSS, quelle que soit sa forme (rgb, oklab, color-mix…), lue par le navigateur lui-même sur un pixel.
  const toile = document.createElement('canvas'); toile.width = toile.height = 1;
  const cx = toile.getContext('2d', { willReadFrequently: true });
  const memo = new Map();
  const couleur = (c) => {
    if (memo.has(c)) return memo.get(c);
    let v = null;
    if (cx && c) { cx.clearRect(0, 0, 1, 1); cx.fillStyle = 'rgba(0,0,0,0)'; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1);
      const d = cx.getImageData(0, 0, 1, 1).data; v = { r: d[0], g: d[1], b: d[2], a: d[3] / 255 }; }
    memo.set(c, v); return v;
  };
  const opaque = (c) => { const v = couleur(c); return !!v && v.a > 0.4; };
  const proche = (a, b, t) => !!a && !!b && Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b)) <= t;
  const saturee = (v) => { if (!v) return false; const M = Math.max(v.r, v.g, v.b) / 255, m = Math.min(v.r, v.g, v.b) / 255, l = (M + m) / 2;
    if (M === m) return false; const s = l > 0.5 ? (M - m) / (2 - M - m) : (M - m) / (M + m); return s >= 0.35 && l >= 0.2 && l <= 0.85; };
  const jeton = (nom) => { const e = document.createElement('div'); e.style.color = 'var(' + nom + ')'; document.body.appendChild(e);
    const v = couleur(getComputedStyle(e).color); e.remove(); return v; };
  const accent = jeton('--accent'), seconde = jeton('--seconde');
  const fondDe = (el) => { let e = el; while (e) { const c = getComputedStyle(e).backgroundColor; if (opaque(c)) return couleur(c); e = e.parentElement; } return { r: 255, g: 255, b: 255, a: 1 }; };

  const visible = (el) => { const b = el.getBoundingClientRect(); const s = getComputedStyle(el);
    return b.width > 0 && b.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const horsChrome = (el) => { if (el.closest('nav, footer, [data-squelette]')) return false; const h = el.closest('header'); return !(h && h.querySelector('nav')); };
  const aire = (el) => { const b = el.getBoundingClientRect(); return b.width * b.height; };
  const MEDIA = 'img, picture, video, canvas, iframe, [data-emplacement-d-image]';
  const montreSaChose = (el, part) => { if (el.matches(MEDIA)) return true; const a = aire(el);
    for (const m of el.querySelectorAll(MEDIA)) if (visible(m) && a > 0 && aire(m) / a >= part) return true; return false; };
  const propre = (el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
  const texteDe = (el) => (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
  const titreDe = (el) => el.querySelector('h1, h2, h3, h4, [role="heading"]');
  const centre = (el) => !!el && getComputedStyle(el).textAlign === 'center';
  const gestes = (el) => [...el.querySelectorAll('a[href], button')].filter((g) => visible(g) && g.getBoundingClientRect().height >= 28);
  const encadre = (el) => { const s = getComputedStyle(el);
    return (opaque(s.backgroundColor) && !proche(couleur(s.backgroundColor), fondDe(el.parentElement || document.body), 6))
      || (px(s.borderTopWidth) > 0 && px(s.borderBottomWidth) > 0 && s.borderTopStyle !== 'none') || (!!s.boxShadow && s.boxShadow !== 'none'); };
  const tous = [...(document.getElementById('root') || document.body).querySelectorAll('*')].filter((e) => visible(e) && horsChrome(e));
  const corps = px(getComputedStyle(document.body).fontSize) || 16;

  // Les sections de premier niveau, comme la mesure de l'accueil.
  const dehors = (e) => !e.closest('header, footer, nav');
  let sections = [...document.querySelectorAll('section')].filter((e) => visible(e) && dehors(e) && !(e.parentElement && e.parentElement.closest('section')));
  if (!sections.length) { const main = document.querySelector('main'); sections = main ? [...main.children].filter((e) => visible(e) && dehors(e)) : []; }
  // Le fond que montre une section : le sien, ou celui d'un enfant qui la couvre presque (une boîte posée dedans).
  const leFondMontre = (s) => { const a = aire(s);
    for (const e of [s, ...s.children]) { if (e !== s && aire(e) < a * 0.75) continue; const st = getComputedStyle(e);
      if (/gradient\\(/.test(st.backgroundImage)) return { degrade: true, couleur: null, el: e };
      if (opaque(st.backgroundColor)) return { degrade: false, couleur: couleur(st.backgroundColor), el: e }; }
    return { degrade: false, couleur: fondDe(s), el: s }; };

  // ── LA BANDE D'APPEL : une section à la couleur de l'accent (ou en dégradé), un titre centré, un ou deux boutons, rien à voir.
  for (const s of sections) {
    const f = leFondMontre(s);
    const vive = f.degrade || proche(f.couleur, accent, 40) || proche(f.couleur, seconde, 40);
    const t = titreDe(s);
    const g = gestes(s).length;
    if (vive && f.el.getBoundingClientRect().width >= vw * 0.6 && t && centre(t) && g >= 1 && g <= 2 && !montreSaChose(s, 0.15) && texteDe(s).length < 500) noter('bande-d-appel', texteDe(t));
  }

  // ── LES BANDES ALTERNÉES : quatre sections de suite dont le fond change à chaque fois, la plupart centrées.
  { let suite = [], meilleure = [];
    for (let i = 0; i < sections.length; i++) {
      const c = leFondMontre(sections[i]);
      const prec = i > 0 ? leFondMontre(sections[i - 1]) : null;
      const change = prec && (c.degrade !== prec.degrade || !proche(c.couleur, prec.couleur, 10));
      suite = change ? [...suite, sections[i]] : [sections[i]];
      if (suite.length > meilleure.length) meilleure = suite;
    }
    const centrees = meilleure.filter((s) => centre(titreDe(s))).length;
    if (meilleure.length >= 4 && centrees >= 3) garder('bandes-alternees', meilleure.length, texteDe(titreDe(meilleure[0]) || meilleure[0])); }

  // ── LE HÉROS CENTRÉ : un h1 centré, deux boutons centrés côte à côte, aucune image, et un badge en pilule au-dessus, un
  // titre entier en dégradé ou une rangée d'avatars ou de logos.
  { const h1 = [...document.querySelectorAll('h1')].find((h) => visible(h) && horsChrome(h));
    const s = h1 && (sections.find((x) => x.contains(h1)) || h1.parentElement);
    if (h1 && s && centre(h1) && !montreSaChose(s, 0.2)) {
      const hb = h1.getBoundingClientRect();
      const bas = gestes(s).filter((g) => g.getBoundingClientRect().top >= hb.top);
      const rangee = bas.filter((g) => bas.some((o) => o !== g && Math.abs(o.getBoundingClientRect().top - g.getBoundingClientRect().top) < 8));
      const milieu = rangee.length ? rangee.reduce((m, g) => m + g.getBoundingClientRect().left + g.getBoundingClientRect().width / 2, 0) / rangee.length : 0;
      if (rangee.length >= 2 && Math.abs(milieu - (hb.left + hb.width / 2)) < vw * 0.12) {
        const dedans = [...s.querySelectorAll('*')].filter(visible);
        const pilule = dedans.some((e) => { const b = e.getBoundingClientRect(), st = getComputedStyle(e);
          return b.bottom <= hb.top + 4 && b.height <= 44 && b.width < vw * 0.6 && px(st.borderTopLeftRadius) >= b.height / 2 - 1 && texteDe(e).length > 0 && encadre(e); });
        const enDegrade = [h1, ...h1.querySelectorAll('*')].some((e) => { const st = getComputedStyle(e);
          return (st.backgroundClip === 'text' || st.webkitBackgroundClip === 'text') && texteDe(e).length >= texteDe(h1).length * 0.6; });
        const petites = [...s.querySelectorAll('img')].filter((i) => visible(i) && i.getBoundingClientRect().height <= 64);
        const avatars = petites.length >= 3;
        const accessoires = [pilule, enDegrade, avatars].filter(Boolean).length;
        if (accessoires) garder('heros-centre', accessoires, texteDe(h1));
      }
    } }

  // ── LES CHIFFRES NUS (constructor, 02/10) : trois grands nombres au moins à la même hauteur, sans ce qu'ils comptent.
  const NOMBRE = /^[+−-]?\\d[\\d\\s\\u00a0\\u202f.,]*(\\s?%|\\+|\\s?[^\\s\\d]{1,4})?$/;
  const grandsNombres = tous.filter((el) => { const p = propre(el); return p && NOMBRE.test(p) && px(getComputedStyle(el).fontSize) >= Math.max(corps * 2, 36); });
  { const rangees = [];
    for (const el of grandsNombres) { const haut = el.getBoundingClientRect().top + window.scrollY;
      const r = rangees.find((x) => Math.abs(x.haut - haut) < 16); if (r) r.els.push(el); else rangees.push({ haut, els: [el] }); }
    const commun = (els) => { let a = els[0].parentElement; while (a && !els.every((e) => a.contains(e))) a = a.parentElement; return a; };
    for (const r of rangees) { if (r.els.length < 3) continue; const c = commun(r.els); if (c && montreSaChose(c, 0.2)) continue;
      garder('chiffres-nus', r.els.length, r.els.map(texteDe).join(' · ')); } }

  // ── LES NUMÉROS GÉANTS (constructor, 24/09) : une SUITE 1, 2, 3 (ou 01, 02, 03) en très grand.
  { const grands = new Map();
    for (const el of tous) { const p = propre(el); if (!/^0?\\d{1,2}[.)]?$/.test(p)) continue;
      if (px(getComputedStyle(el).fontSize) >= Math.max(corps * 2, 36)) { const v = parseInt(p, 10); if (!grands.has(v)) grands.set(v, p); } }
    let suite = 0, debut = 0;
    for (const v of grands.keys()) { if (grands.has(v - 1)) continue; let k = v; while (grands.has(k + 1)) k += 1; if (k - v + 1 > suite) { suite = k - v + 1; debut = v; } }
    if (suite >= 2) garder('chiffres-geants', suite, [...Array(suite).keys()].map((i) => grands.get(debut + i)).join(' · ')); }

  // ── LE CARROUSEL D'OUVERTURE : sur le premier écran, un défilement horizontal de diapositives (chacune plus de 40 % de large).
  for (const el of tous) {
    if (el.getBoundingClientRect().top + window.scrollY >= vh) continue;
    const st = getComputedStyle(el);
    if (!(/(auto|scroll|hidden)/.test(st.overflowX) && el.scrollWidth > el.clientWidth + 20)) continue;
    const diapos = [...el.children].filter((c) => c.getBoundingClientRect().width >= el.clientWidth * 0.4);
    if (diapos.length >= 3) { noter('carrousel-d-ouverture', texteDe(diapos[0])); break; }
  }

  // ── L'ICÔNE EN PASTILLE : un carré coloré qui ne porte qu'une icône, répété à la même taille.
  { const tailles = new Map();
    for (const el of tous) { const b = el.getBoundingClientRect();
      if (b.width < 28 || b.width > 96 || Math.abs(b.width - b.height) > 4 || texteDe(el)) continue;
      if (el.querySelectorAll('svg').length !== 1 || el.querySelector(MEDIA)) continue;
      const st = getComputedStyle(el);
      if (!opaque(st.backgroundColor) || proche(couleur(st.backgroundColor), fondDe(el.parentElement || document.body), 6)) continue;
      const k = Math.round(b.width); const l = tailles.get(k) || []; l.push(el); tailles.set(k, l); }
    for (const l of tailles.values()) if (l.length >= 3) { let c = l[0].parentElement; while (c && !titreDe(c)) c = c.parentElement; garder('icones-en-pastille', l.length, c ? texteDe(titreDe(c)) : ''); } }

  // ── L'EMOJI : un pictogramme d'emoji dans le texte de la page.
  for (const el of tous) { const p = propre(el); if (/(?![\\u00a9\\u00ae\\u2122])\\p{Extended_Pictographic}/u.test(p)) noter('emojis', p); }

  // ── LE HALO : une tache floutée (flou de 24 px et plus sur un fond) ou une lueur colorée sans décalage.
  for (const el of tous) { const st = getComputedStyle(el);
    const flou = /blur\\((\\d+(?:\\.\\d+)?)px\\)/.exec(st.filter);
    if (flou && Number(flou[1]) >= 24 && (opaque(st.backgroundColor) || /gradient\\(/.test(st.backgroundImage))) { noter('halos', texteDe(el.parentElement || el)); continue; }
    if (st.boxShadow && st.boxShadow !== 'none') {
      const couches = st.boxShadow.split(/,(?![^(]*\\))/);
      if (couches.some((c) => { const m = /^(.*?\\))?\\s*(-?[\\d.]+)px\\s+(-?[\\d.]+)px\\s+([\\d.]+)px/.exec(c.trim()) || [];
        return Number(m[2]) === 0 && Number(m[3]) === 0 && Number(m[4]) >= 24 && saturee(couleur((m[1] || '').trim())); })) noter('halos', texteDe(el).slice(0, 60));
    } }

  // ── LE DÉGRADÉ ÉTENDU : sur le fond de la page ou d'une grande partie, ou sur un titre entier, un paragraphe.
  for (const el of [document.documentElement, document.body, document.getElementById('root'), document.querySelector('main')].filter(Boolean)) {
    if (/gradient\\(/.test(getComputedStyle(el).backgroundImage)) { noter('degrade-etendu', 'page background'); break; } }
  for (const el of tous) { const st = getComputedStyle(el);
    if ((st.backgroundClip === 'text' || st.webkitBackgroundClip === 'text') && /gradient\\(/.test(st.backgroundImage) && texteDe(el).length > 40) noter('degrade-etendu', texteDe(el)); }

  // ── LA MÊME CARTE PARTOUT : six blocs et plus au même grand arrondi (16 px et plus) et à la même ombre.
  { const groupes = new Map();
    for (const el of tous) { const b = el.getBoundingClientRect(), st = getComputedStyle(el);
      if (b.width < 160 || b.height < 100 || !st.boxShadow || st.boxShadow === 'none' || px(st.borderTopLeftRadius) < 16) continue;
      const k = st.borderTopLeftRadius + '|' + st.boxShadow; const l = groupes.get(k) || []; l.push(el); groupes.set(k, l); }
    for (const l of groupes.values()) if (l.length >= 6) garder('meme-carte-partout', l.length, texteDe(titreDe(l[0]) || l[0])); }

  // ── LE DESSIN (26/11) : combien de formes porte le plus travaillé des dessins de l'accueil (les trames de la brique à part).
  releve['dessin'] = { n: 0, exemple: '' };
  for (const d of document.querySelectorAll('[data-piece="dessin"] svg')) {
    const n = [...d.querySelectorAll('path, rect, circle, ellipse, polygon, polyline, line')].filter((e) => !e.closest('defs')).length;
    if (n > releve['dessin'].n) releve['dessin'] = { n, exemple: court(d.getAttribute('aria-label')) };
  }

  return releve;
})()`;
