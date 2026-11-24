// =====================================================================
// Camp de base (remplace « Notre projet » ; refonte, livraison 2, revue pour le téléphone le 16/11)
// Règle de clarté : un écran = une question. L'accueil du projet tient sans défiler : le paysage (où en est-on ?),
// UN seul « Votre prochain pas », puis des portes. Les listes sont derrière les portes, chacune sur sa page :
//   …/projet/chemin   Le chemin : étapes franchies, à venir, abandonnées (revenir en arrière = responsables, 032)
//   …/projet/decider  À décider : votes ouverts, décisions
//   …/projet/idees    Idées : une ligne par idée ; en faire une tâche, la ranger
//   …/projet/absence  Pendant votre absence (resume.js)
//   …/projet/tout     Tout le projet (hub.js) : aussi un onglet du projet depuis le 22/11 (…/tout)
// Mêmes données qu'avant : items (objective, milestone, decision, idea), item_votes, tasks, activity.
// =====================================================================

// Le paysage du chemin (24/11, Apo) : SES dessins de montagne, de jour ou de nuit selon l'heure (B.ambianceMoment),
// src/assets/scenes/chemin-jour.webp / chemin-nuit.webp (2000 × 848, même cadrage, version -1000 pour les petits écrans).
// Le sentier dessiné devient le chemin du projet : une tente (tente-jour / tente-nuit, détourées) = étape franchie,
// un point = étape à venir, jusqu'au drapeau du sommet (dessiné dans l'image).
// PHOTO_TRAIL = le milieu du sentier, en pixels de l'image, du premier plan (en bas à gauche) jusqu'au pied du drapeau,
// relevé automatiquement sur le dessin. Changer d'image = refaire ces coordonnées (et PHOTO_STARS pour la nuit).
const PHOTO = { w: 2000, h: 848 };
const PHOTO_VIEW = [30, 848]; // lignes de l'image toujours visibles : du drapeau jusqu'en bas (voir photoFit)
const PHOTO_TRAIL = [[19, 827], [75, 816], [132, 808], [187, 798], [245, 793], [296, 769], [343, 742], [396, 726], [448, 707],
  [501, 689], [556, 676], [610, 664], [666, 653], [722, 645], [779, 643], [835, 650], [891, 662], [947, 671], [1002, 681],
  [1059, 687], [1118, 686], [1176, 681], [1232, 672], [1268, 660], [1283, 640], [1274, 618], [1250, 605], [1207, 595],
  [1151, 587], [1094, 579], [1052, 571], [1034, 556], [1048, 542], [1087, 531], [1142, 519], [1198, 511], [1254, 502],
  [1310, 490], [1364, 477], [1417, 460], [1445, 444], [1452, 427], [1438, 417], [1402, 407], [1345, 400], [1288, 392],
  [1245, 383], [1231, 369], [1240, 355], [1288, 343], [1346, 337], [1403, 332], [1459, 328], [1516, 321], [1550, 312],
  [1566, 300], [1556, 290], [1519, 282], [1462, 273], [1406, 265], [1382, 255], [1392, 241], [1446, 231], [1490, 222],
  [1503, 208], [1504, 194], [1518, 181], [1542, 172], [1547, 160], [1530, 150], [1519, 140], [1526, 126], [1545, 112], [1560, 101]];
// étoiles dessinées dans le ciel de nuit : elles scintillent
const PHOTO_STARS = [[57, 27], [1428, 31], [707, 35], [334, 33], [1782, 36], [1923, 36], [1052, 43], [731, 57], [187, 80],
  [1743, 79], [961, 107], [1249, 116], [1382, 202]];

/** Courbe douce qui passe par tous les points (Catmull-Rom), pour mesurer et tracer le chemin */
function smooth(pts, n = 8) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((j) => 0.5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3)));
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** Cadrage « cover » : tout le sentier et le sommet restent visibles autant que possible */
function photoFit(W, H) {
  // Bandes de l'image qui doivent rester visibles quel que soit l'écran (24/11, Apo : rien de coupé en bas) :
  // du bout du drapeau (y ≈ 30) jusqu'au bas de l'image, où le sentier commence (premier plan, en bas à gauche).
  const [top, bottom] = PHOTO_VIEW;
  let s = Math.max(W / PHOTO.w, H / PHOTO.h);
  if (H / s < bottom - top) s = H / (bottom - top); // carte très large : on réduit plutôt que de couper
  const iw = PHOTO.w * s, ih = PHOTO.h * s;
  const ox = iw <= W ? (W - iw) / 2 : Math.min(0, Math.max(W - iw, (W - 1700 * s) / 2)); // du départ (à gauche) au sommet
  const oy = Math.min(0, Math.max(H - ih, (H - (top + bottom) * s) / 2));
  return { s, ox, oy, iw, ih };
}

/**
 * Le paysage, à la taille réelle de la carte. `path` vient de B.pathOf ; `W` × `H` = taille en pixels.
 */
const stackedHead = (W) => W < 560; // même seuil que la page : sur téléphone, le titre est au-dessus du dessin

function landscape(path, W, H) {
  const night = (B.ambianceMoment?.() || 'day') === 'night';
  const { s, ox, oy, iw, ih } = photoFit(W, H);
  const px = ([x, y]) => [ox + x * s, oy + y * s];
  // Tout le chemin, du départ (en bas à gauche) jusqu'au drapeau du sommet, montée comprise (23/11, Apo)
  const trail = smooth(PHOTO_TRAIL, 6).map(px);
  // longueur cumulée, pour poser les repères à intervalles réguliers
  const len = [0];
  for (let k = 1; k < trail.length; k++) len.push(len[k - 1] + Math.hypot(trail[k][0] - trail[k - 1][0], trail[k][1] - trail[k - 1][1]));
  const total = len[len.length - 1];
  const at = (f) => {
    const target = f * total;
    let k = len.findIndex((l) => l >= target);
    if (k <= 0) return { pt: trail[0], k: 0 };
    const r = (target - len[k - 1]) / (len[k] - len[k - 1] || 1);
    return { pt: [trail[k - 1][0] + (trail[k][0] - trail[k - 1][0]) * r, trail[k - 1][1] + (trail[k][1] - trail[k - 1][1]) * r], k };
  };
  // Emplacements, répartis régulièrement entre le point de départ (orange, en bas à gauche) et le drapeau :
  // les étapes franchies, puis « Vous êtes ici », puis les étapes à venir
  const slots = path.total + 1;
  // le départ : premier endroit du chemin bien visible (le bas de l'image peut être coupé par la carte)
  let f0 = 0;
  while (f0 < 0.3 && (at(f0).pt[1] > H - 12 || at(f0).pt[0] < 14)) f0 += 0.005;
  const spot = (n) => at(f0 + (1 - f0) * ((n + 1) / (slots + 1)));
  const start = at(f0).pt;
  const here = spot(path.done);
  const steps = path.steps.map((s2, n) => ({ s: s2, ...spot(n < path.done ? n : n + 1), done: n < path.done, next: s2 === path.next }));
  const line = (pts) => pts.map(([x, y], k) => `${k ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const k0 = at(f0).k;
  const walked = [start, ...trail.slice(k0, Math.max(k0, here.k)), here.pt]; // le chemin parcouru part du point de départ
  const ahead = [here.pt, ...trail.slice(here.k)];
  const big = W >= 560;
  const tentW = big ? 58 : 38;
  const img = (name) => `assets/scenes/${name}.webp`;
  const scene = (night ? 'chemin-nuit' : 'chemin-jour') + (iw * (window.devicePixelRatio || 1) <= 1100 ? '-1000' : '');
  const tent = night ? 'tente-nuit' : 'tente-jour';
  // les étoiles dessinées scintillent (nuit)
  const stars = night ? PHOTO_STARS.map((p0, i) => {
    const [x, y] = px(p0);
    return `<circle class="lp-star" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(2.2 * Math.max(s, 0.5)).toFixed(1)}" style="--dl:-${(i * 0.37).toFixed(2)}s"/>`;
  }).join('') : '';

  const svg = `<svg class="land-svg photo" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">
    <defs><radialGradient id="land-tent-glow"><stop offset="0" class="l-sun" stop-opacity=".55"/><stop offset="1" class="l-sun" stop-opacity="0"/></radialGradient></defs>
    <image href="${img(scene)}" x="${ox.toFixed(1)}" y="${oy.toFixed(1)}" width="${iw.toFixed(1)}" height="${ih.toFixed(1)}" preserveAspectRatio="none"/>
    ${night ? stars
      : `<g class="lp-birds" style="--w:${W}px"><path class="lp-bird" d="M0,0 q5,-5 10,0 q5,-5 10,0"/><path class="lp-bird" d="M18,9 q4,-4 8,0 q4,-4 8,0"/></g>`}
    <path class="l-dots" d="${line(ahead)}"/>
    <circle class="l-start" cx="${start[0].toFixed(1)}" cy="${start[1].toFixed(1)}" r="9"/>
    ${path.done || slots === 1 ? `<path class="l-walk-under" pathLength="1" d="${line(walked)}"/><path class="l-walk" pathLength="1" d="${line(walked)}"/>` : ''}
    ${steps.map(({ s: st, pt: [x, y], done, next }, i) => done
      ? (() => {
        // la tente est posée sur le sentier : le milieu de son carré d'herbe = l'emplacement de l'étape
        const w = tentW * (st.major ? 1.3 : 1), h = w * 0.686;
        return `<g class="lp-tent ${night ? 'lit' : ''}">
          ${night ? `<circle class="lp-tent-glow" cx="${(x - w * 0.12).toFixed(1)}" cy="${(y - h * 0.35).toFixed(1)}" r="${(w * 0.45).toFixed(1)}"/>` : ''}
          <image href="${img(tent)}" x="${(x - w / 2).toFixed(1)}" y="${(y - h * 0.82).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}"/></g>`;
      })()
      : `<circle class="l-step ${next ? 'next' : ''} ${st.major ? 'major' : ''}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${st.major ? 11 : next ? 9 : 6.5}"/>`).join('')}
    <g class="l-here" transform="translate(${here.pt[0].toFixed(1)} ${here.pt[1].toFixed(1)})"><circle class="l-here-wave" r="20"/><circle class="l-here-ring" r="10.6"/><circle class="l-here-dot" r="9"/></g>
  </svg>`;

  // Textes posés par-dessus (taille réelle : jamais sous 12 px, même sur téléphone)
  // Sur téléphone (ou quand les repères sont serrés) : seulement la date de la prochaine étape (les noms sont écrits juste sous le paysage).
  // Sur ordinateur : toutes les étapes si elles ont la place, sinon la prochaine seulement.
  const gap = total / (slots + 1);
  const phone = !big || gap < 150;
  const shown = steps.filter(({ s: st, next }) => phone ? (next && st.due_date) : (gap >= 230 || next || (st.major && gap >= 150)));
  // Placement sans chevauchement (24/11) : la bulle « Vous êtes ici » puis les étiquettes évitent les repères du chemin,
  // les autres textes et les bords. Tailles estimées (le texte n'est pas encore affiché) : ~7,4 px par caractère.
  const boxes = steps.map(({ pt: [x, y], done, s: st }) => {
    if (!done) return [x - 12, y - 12, x + 12, y + 12];
    const w = tentW * (st.major ? 1.3 : 1);
    return [x - w / 2, y - w * 0.6, x + w / 2, y + w * 0.15];
  });
  boxes.push([here.pt[0] - 13, here.pt[1] - 13, here.pt[0] + 13, here.pt[1] + 13]);
  if (!stackedHead(W)) boxes.push([0, 0, W * 0.62 + 32, 104]); // l'encart du sommet, en haut à gauche
  const hit = (r, list) => list.reduce((n, q) => n + Math.max(0, Math.min(r[2], q[2]) - Math.max(r[0], q[0])) * Math.max(0, Math.min(r[3], q[3]) - Math.max(r[1], q[1])), 0)
    + (r[0] < 2 || r[2] > W - 2 || r[1] < 2 || r[3] > H - 2 ? 1e6 : 0);
  const best = (cands, list) => cands.map((c) => ({ ...c, n: hit(c.r, list) })).sort((u, v) => u.n - v.n)[0];
  // la bulle : au-dessus du point, sinon en dessous
  const bw = tr('Vous êtes ici').length * 7.4 + 30;
  const [hx, hy] = here.pt;
  const clampX = (x) => Math.max(bw / 2 + 4, Math.min(W - bw / 2 - 4, x));
  // décalée sur le côté si besoin : la pointe reste sur le point
  const bub = best([0, -0.32, 0.32].flatMap((d) => [false, true].map((down) => {
    const x = clampX(hx + d * bw);
    return { down, x, r: down ? [x - bw / 2, hy + 14, x + bw / 2, hy + 52] : [x - bw / 2, hy - 52, x + bw / 2, hy - 14] };
  })), boxes.slice(0, -1));
  const bx = bub.x;
  const taken = [...boxes, bub.r];
  const labels = shown.map(({ s: st, pt: [x, y], next }) => {
    const date = st.due_date ? esc(fmtDate(st.due_date)) : '';
    const text = phone ? date : st.title + (date ? ` · ${date}` : '');
    const w = Math.min(280, text.length * 7.4 + 20), h = 26;
    const cx = Math.max(w / 2 + 4, Math.min(W - w / 2 - 4, x));
    const own = [x - 13, y - 13, x + 13, y + 13];
    const others = taken.filter((q) => hit(q, [own]) < 300);
    const c = best([
      { cls: '', l: cx, t: y + 16, r: [cx - w / 2, y + 16, cx + w / 2, y + 16 + h] },
      { cls: 'up', l: cx, t: y - 16, r: [cx - w / 2, y - 16 - h, cx + w / 2, y - 16] },
      { cls: 'to-l', l: x - 18, t: y, r: [x - 18 - w, y - h / 2, x - 18, y + h / 2] },
      { cls: 'to-r', l: x + 18, t: y, r: [x + 18, y - h / 2, x + 18 + w, y + h / 2] }
    ], others);
    taken.push(c.r);
    return `<span class="land-lab ${next ? 'next' : ''} ${st.major ? 'major' : ''} ${c.cls}" style="left:${c.l.toFixed(0)}px;top:${c.t.toFixed(0)}px">${phone ? `<i>${date}</i>` : `<span translate="no">${esc(st.title)}</span>${date ? `<i>· ${date}</i>` : ''}`}</span>`;
  }).join('');
  const bubble = `<span class="land-here ${bub.down ? 'down' : ''}" style="left:${bx.toFixed(0)}px;top:${(bub.down ? hy + 22 : hy - 22).toFixed(0)}px">${tr('Vous êtes ici')}<i style="left:calc(50% + ${(hx - bx).toFixed(0)}px)"></i></span>`;
  return `${svg}<div class="land-over" aria-hidden="true">${labels}${bubble}</div>`;
}

// ---------------------------------------------------------------------
// Petits morceaux communs aux pages du Camp de base
// ---------------------------------------------------------------------
const campHref = (p, sub = '') => `#/p/${p.id}/projet${sub ? '/' + sub : ''}`;

/** En-tête d'une sous-page : ← retour au Camp de base + titre */
const subHead = (p, title) => `<header class="sub-head">
  <a class="icon-btn" href="${campHref(p)}" aria-label="${tr('Retour au camp de base')}">${icon('back', 20)}</a>
  <h2>${title}</h2></header>`;

/** Une porte : icône, titre, une ligne. `tint` = celle qui demande d'agir (une seule par écran) */
const door = (href, ic, title, line, { tint = false, badge = 0 } = {}) => `<a class="door ${tint ? 'tint' : ''}" href="${href}">
  <span class="door-ico">${icon(ic, 20)}</span>
  <span class="door-text"><b>${title}</b><span>${line}</span></span>
  ${badge ? `<span class="n" aria-hidden="true">${badge}</span>` : ''}<span class="door-go" aria-hidden="true">${icon('chevron', 16)}</span></a>`;

/** Ligne d'une liste qui s'ouvre au toucher */
const tapRow = (attrs, lead, title, line = '', side = '') => `<button type="button" class="tap-row" ${attrs}>
  ${lead}<span class="tap-text"><b translate="no">${title}</b>${line ? `<span>${line}</span>` : ''}</span>${side}${icon('chevron', 16)}</button>`;

/** Les éléments du projet ouvert (pour retrouver le sommet existant) */
let campItems = [];
/** Le sommet : l'objectif encore ouvert, sinon le dernier atteint */
B.summitOf = (items) => (items || []).find((i) => i.type === 'objective' && !i.archived_at && !i.done)
  || (items || []).filter((i) => i.type === 'objective').pop() || null;

const openVotesOf = (items) => items.filter((i) => i.type === 'decision' && i.vote_options && i.vote_until && new Date(i.vote_until) > new Date() && !i.archived_at);

/** Une petite fenêtre : un titre et une date (noter une idée, fixer l'objectif, ajouter ou modifier une étape) */
function itemForm(p, type, item, done) {
  // Le sommet est unique : « Fixer le sommet » modifie celui qui existe déjà
  if (type === 'objective' && !item) item = B.summitOf?.(campItems) || null;
  const T = {
    idea: [tr('Noter une idée'), tr('Une nouvelle idée…'), false],
    objective: [item ? tr('Modifier le sommet') : tr('Fixer le sommet'), tr("L'objectif final : à quoi verra-t-on que le projet est réussi ?"), true],
    milestone: [item ? tr("Modifier l'étape") : tr('Ajouter une étape'), tr('Une étape du chemin…'), true]
  }[type];
  const m = B.modal(`
    <h2>${esc(T[0])}</h2>
    <label for="ci-title">${tr('Titre')}</label><input id="ci-title" maxlength="200" placeholder="${esc(T[1])}" value="${esc(item?.title || '')}" />
    ${T[2] ? `<label for="ci-date">${tr('Date (facultatif)')}</label><input id="ci-date" type="date" value="${esc(item?.due_date || '')}" />` : ''}
    ${type === 'milestone' ? `<label class="check"><input type="checkbox" id="ci-major" ${item?.major ? 'checked' : ''} /> ${tr('Étape majeure')} <span class="muted small">${tr('(un grand pas : plus visible sur le chemin)')}</span></label>` : ''}
    <p class="msg" id="ci-msg"></p>
    <div class="actions"><button class="btn" data-close>${tr('Annuler')}</button><button class="btn primary" id="ci-go">${item ? tr('Enregistrer') : tr('Ajouter')}</button></div>`);
  $('[data-close]', m).onclick = B.closeModal;
  const go = async () => {
    const title = $('#ci-title', m).value.trim();
    if (!title) return ($('#ci-msg', m).textContent = tr('Écrivez un titre.'));
    const row = { title, due_date: $('#ci-date', m)?.value || null, ...(type === 'milestone' ? { major: $('#ci-major', m).checked } : {}) };
    const { error } = item
      ? await B.sb.from('items').update(row).eq('id', item.id)
      : await B.sb.from('items').insert({ project_id: p.id, type, ...row });
    if (error) return ($('#ci-msg', m).textContent = errText(error));
    B.closeModal();
    done?.();
  };
  $('#ci-go', m).onclick = go;
  $('#ci-title', m).addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  $('#ci-title', m).focus();
}

// ---------------------------------------------------------------------
// La page : l'accueil du projet, ou l'une de ses sous-pages
// ---------------------------------------------------------------------
B.pages.camp = async (el, p, sub) => {
  if (sub === 'absence') return B.pages.absence(el, p);
  if (sub === 'chemin') return renderChemin(el, p);
  if (sub === 'decider') return renderDecider(el, p);
  if (sub === 'idees') return renderIdees(el, p);
  if (sub === 'tout') {
    el.innerHTML = `<div class="subpage wide">${subHead(p, tr('Tout le projet'))}<div id="camp-hub"></div></div>`;
    await B.pages.hub($('#camp-hub', el), p);
    paintIcons(el);
    if (B.pendingNewVote) { B.pendingNewVote = false; $('#camp-hub [data-new-vote]', el)?.click(); }
    return;
  }
  return renderCampHome(el, p);
};

// ---------- Accueil du projet : où en est-on, mon prochain pas, les portes ----------
async function renderCampHome(el, p) {
  el.innerHTML = `<div class="camp">
    <section class="card landcard" id="camp-land"></section>
    <div class="camp-grid">
      <section class="card main-card" id="camp-todo"></section>
      <nav class="doors door-rows" id="camp-doors" aria-label="${tr('Dans ce projet')}"></nav>
    </div>
  </div>`;

  let items = [], votes = [], tasks = [], missed = null;
  let lastW = 0;
  let drawn = false; // le chemin ne se dessine qu'à l'ouverture, pas à chaque mise à jour

  const load = async () => {
    if (!el.isConnected) return;
    const [it, tk] = await Promise.all([
      B.sb.from('items').select('*').eq('project_id', p.id).order('created_at'),
      B.sb.from('tasks').select('*').eq('project_id', p.id).eq('assignee_id', B.me.id).neq('status', 'done')
    ]);
    if (it.error) return B.error(it.error);
    items = (it.data || []).filter((i) => i.project_id === p.id);
    campItems = items;
    tasks = B.orderMyTasks((tk.data || []).filter((t) => t.project_id === p.id && t.assignee_id === B.me.id && t.status !== 'done'));
    const ids = openVotesOf(items).map((i) => i.id);
    votes = ids.length ? ((await B.sb.from('item_votes').select('*').in('item_id', ids)).data || []).filter((v) => ids.includes(v.item_id)) : [];
    render();
    loadMissed();
  };
  // « Pendant votre absence » : compté à part (plus lent), la porte se met à jour toute seule
  const loadMissed = async () => {
    const since = B.visits.get(p.id);
    if (!since) return;
    try { missed = B.missedSummary(await B.missedData(p.id, since)); } catch { missed = null; }
    renderDoors();
  };

  // ---------- Le paysage ----------
  const renderLand = () => {
    const box = $('#camp-land', el);
    if (!box) return;
    const path = B.pathOf(items);
    const goal = B.summitOf(items);
    const lastStep = path.steps[path.steps.length - 1];
    const summitDay = goal?.due_date || (lastStep?.due_date && !lastStep.done ? lastStep.due_date : null);
    const reached = goal && (goal.done || goal.archived_at);
    const say = path.total
      ? tr('Chemin du projet : {n} étapes franchies sur {m}.', { n: path.done, m: path.total }) + (path.next ? ` ${tr('Prochaine étape')} : ${path.next.title}.` : '')
      : tr('Chemin du projet : aucune étape pour le moment.');
    const W = Math.max(280, Math.round(box.clientWidth));
    // Téléphone : le titre au-dessus du dessin (deux espaces distincts, jamais de collision avec « Vous êtes ici »)
    const stacked = W < 560;
    const H = stacked ? 190 : Math.round(Math.min(640, Math.max(300, W * 0.41))); // assez haut pour tout le sentier (photoFit)
    lastW = W;
    const head = `<div class="land-head">
          <div class="eyebrow">${reached ? tr('Sommet atteint') : tr('Le sommet')}${summitDay ? ` · ${esc(B.longDate(summitDay))}` : ''}</div>
          ${goal ? `<h2 class="land-title" translate="no" title="${esc(goal.title)}">${esc(goal.title)}</h2>`
            : `<h2 class="land-title">${tr('Quel sommet visez-vous ?')}</h2><button class="btn small" data-add="objective">${icon('plus', 14)} ${tr('Fixer le sommet')}</button>`}
        </div>`;
    const next = path.next;
    box.innerHTML = `
      <div class="land photo ${stacked ? 'stacked' : ''} ${drawn ? '' : 'draw'}" style="${stacked ? '' : `height:${H}px`}" role="img" aria-label="${esc(say)}">
        ${stacked ? head : ''}
        <div class="land-art" style="height:${H}px">${landscape(path, W, H)}</div>
        ${stacked ? '' : head}
      </div>
      <div class="land-progress">
        <span class="wdot me" aria-hidden="true"></span>
        <b>${path.total ? tr(path.done > 1 ? '{n} étapes sur {m} franchies' : '{n} étape sur {m} franchie', { n: path.done, m: path.total }) : tr("Pas encore d'étape sur le chemin")}</b>
      </div>
      <a class="where-link" href="${campHref(p, 'chemin')}">
        <span class="where-text">${next
          ? `<span class="eyebrow">${tr('Prochaine étape')}</span>
             <span class="ns-title" translate="no">${esc(next.title)}</span>
             ${next.due_date ? `<span class="ns-when">${esc(B.daysUntil(next.due_date) < 0 ? B.plannedText(next.due_date) : B.daysText(next.due_date))}</span>` : ''}`
          : `<span class="ns-when">${path.total ? tr('Le sommet est en vue.') : tr('Posez 3 ou 4 grandes étapes, avec une date.')}</span>`}</span>
        <span class="where-go">${tr('Voir le chemin')}${icon('chevron', 16)}</span>
      </a>`;
    drawn = true;
  };

  // ---------- Votre prochain pas : UNE tâche ----------
  const renderTodo = () => {
    const box = $('#camp-todo', el);
    if (!box) return;
    const [first, ...rest] = tasks;
    // (plus de « Prépare … » : rien ne relie une tâche à une étape, une date proche ne suffit pas)
    box.innerHTML = `
      <div class="next-head"><span class="door-ico">${icon('checksq', 20)}</span>
        <span class="door-text"><b>${tr('Votre prochain pas')}</b><span>${first
          ? (rest.length ? tr(rest.length > 1 ? 'puis {n} autres tâches pour vous' : 'puis {n} autre tâche pour vous', { n: rest.length }) : tr('votre seule tâche ici'))
          : tr('Rien à faire de votre côté dans ce projet.')}</span></span></div>
      ${first ? `<div class="big-task" data-id="${first.id}">
          <div class="big-text">
            ${B.taskCodeHtml(first.title)}
            <button class="big-title" translate="no">${esc(B.taskTitleText(first.title))}</button>
            ${first.due_date ? `<div class="big-due">${B.dueHtml(first.due_date)}</div>` : ''}
          </div>
        </div>` : ''}
      <div class="big-actions"><button class="btn primary" data-mine>${icon('checksq', 15)} ${tr('Mes tâches')}</button></div>`; // plus de « Reporter » ici (22/11, Apo)
  };

  // ---------- Les portes ----------
  const renderDoors = () => {
    const box = $('#camp-doors', el);
    if (!box) return;
    const open = openVotesOf(items);
    const missing = open.filter((i) => !votes.some((v) => v.item_id === i.id && v.user_id === B.me.id)).length;
    const ideas = items.filter((i) => i.type === 'idea' && !i.archived_at && !i.done).length;
    const forMe = missed?.forMe || 0;
    // Une seule porte teintée : celle qui m'attend en premier
    const tintAbsence = forMe > 0;
    const tintDecide = !tintAbsence && missing > 0;
    box.innerHTML = [
      door(campHref(p, 'absence'), 'spark', tr('Pendant votre absence'),
        missed == null ? tr('Ce qui a bougé') : forMe ? tr(forMe > 1 ? '{n} choses pour vous' : '{n} chose pour vous', { n: forMe })
          : missed.news ? tr(missed.news > 1 ? '{n} nouveautés' : '{n} nouveauté', { n: missed.news }) : tr('Rien de nouveau'),
        { tint: tintAbsence }),
      door(campHref(p, 'decider'), 'decision', tr('À décider'),
        missing ? tr('Votre vote manque') : open.length ? tr(open.length > 1 ? '{n} votes ouverts' : '{n} vote ouvert', { n: open.length }) : tr('Rien à trancher'),
        { tint: tintDecide, badge: missing }),
      door(campHref(p, 'idees'), 'bulb', tr('Idées'), ideas ? tr(ideas > 1 ? '{n} idées' : '{n} idée', { n: ideas }) : tr('Notez la première')),
      door(campHref(p, 'chemin'), 'route', tr('Le chemin'), tr('Les étapes jusqu’au sommet'))
    ].join('');
  };

  const render = () => { renderLand(); renderTodo(); renderDoors(); paintIcons(el); };

  // Le paysage suit la largeur de la fenêtre
  const ro = new ResizeObserver(debounce(() => {
    const w = Math.round($('#camp-land', el)?.clientWidth || 0);
    if (w && Math.abs(w - lastW) > 4) renderLand();
  }, 150));
  ro.observe($('#camp-land', el));
  B.onLeave(() => ro.disconnect());

  el.addEventListener('click', (e) => {
    const add = e.target.closest('[data-add]');
    if (add) return itemForm(p, add.dataset.add, null, load);
    if (e.target.closest('[data-mine]')) return B.myTasksInProject(p.id);
    const t = tasks[0];
    if (!t) return;
    if (e.target.closest('.big-title')) B.openTask(t, load);
  });

  await load();
  const soon = debounce(load, 300);
  B.live('camp-items', 'items', `project_id=eq.${p.id}`, soon);
  B.live('camp-votes', 'item_votes', null, soon);
  B.live('camp-tasks', 'tasks', `project_id=eq.${p.id}`, soon);
  B.onLeave(B.on('visit', (pid) => { if (pid === p.id) loadMissed(); }));
}

// ---------- Le chemin : toutes les étapes, et revenir en arrière ----------
async function renderChemin(el, p) {
  // La montagne au pied de la page (fond calme, décoratif) : 22/11, demande d'Amaury
  el.innerHTML = `<div class="chemin-wrap"><div class="subpage">${subHead(p, tr('Le chemin'))}<div id="chemin"></div></div>
    <div class="chemin-scene" aria-hidden="true">${B.sceneSvg(false)}</div></div>`;
  let items = [];
  const manager = B.isManager(p.id);

  const load = async () => {
    const { data, error } = await B.sb.from('items').select('*').eq('project_id', p.id).order('created_at');
    if (error) return B.error(error);
    items = (data || []).filter((i) => i.project_id === p.id);
    campItems = items;
    render();
  };

  /**
   * Le chemin se lit comme une montée (22/11, demande d'Amaury) : le départ en bas, le sommet en haut.
   * De haut en bas : le sommet, les étapes à venir (la plus lointaine en haut), « Vous êtes ici »,
   * les étapes franchies (la plus récente juste sous « Vous êtes ici »), puis le départ.
   */
  const render = () => {
    const box = $('#chemin', el);
    if (!box) return;
    const path = B.pathOf(items);
    const gone = items.filter((i) => i.type === 'milestone' && i.archived_at);
    const goal = B.summitOf(items);
    const reached = goal && (goal.done || goal.archived_at);
    const done = path.steps.slice(0, path.done).reverse(), ahead = path.steps.slice(path.done).reverse();
    const stop = (s, state) => {
      const line = state === 'done' ? tr('Franchie') + (s.due_date ? ` · ${esc(fmtDate(s.due_date))}` : '')
        : s.due_date ? `${esc(B.longDate(s.due_date))} · ${esc(B.daysUntil(s.due_date) < 0 ? B.plannedText(s.due_date) : B.daysText(s.due_date))}` : tr('pas encore de date');
      return `<li class="trail-stop ${state} ${s.major ? 'major' : ''}">
        <button type="button" class="trail-btn" data-step="${s.id}">
          <span class="trail-mark">${state === 'done' ? icon('check', s.major ? 16 : 13) : ''}</span>
          <span class="tap-text">${s.major ? `<span class="major-tag">${tr('Étape majeure')}</span>` : ''}<b translate="no">${esc(s.title)}</b><span>${line}</span></span>
          ${icon('chevron', 16)}</button></li>`;
    };
    box.innerHTML = `
      <button class="btn dashed" data-add="milestone">${icon('plus', 16)} ${tr('Ajouter une étape')}</button>
      <ol class="trail" aria-label="${tr('Du sommet (en haut) au départ (en bas)')}">
        <li class="trail-stop summit ${reached ? 'done' : ''}">
          <span class="summit-ico">${icon('flag', 22)}</span>
          <div class="trail-summit"><div class="eyebrow">${reached ? tr('Sommet atteint') : tr('Le sommet')}${goal?.due_date ? ` · ${esc(B.longDate(goal.due_date))}` : ''}</div>
            ${goal ? `<button type="button" class="summit-title" data-add="objective" translate="no">${esc(goal.title)}</button>`
              : `<button class="btn small" data-add="objective">${icon('plus', 14)} ${tr('Fixer le sommet')}</button>`}</div>
        </li>
        ${ahead.map((s) => stop(s, s === path.next ? 'next' : 'later')).join('')}
        <li class="trail-stop here"><span class="here-dot" aria-hidden="true"></span><b>${tr('Vous êtes ici')}</b>
          <span class="muted small">${path.total ? tr(path.done > 1 ? '{n} étapes sur {m} franchies' : '{n} étape sur {m} franchie', { n: path.done, m: path.total }) : tr("Pas encore d'étape sur le chemin")}</span></li>
        ${done.map((s) => stop(s, 'done')).join('')}
        <li class="trail-stop start"><span class="start-mark" aria-hidden="true"></span><b>${tr('Départ')}</b></li>
      </ol>
      ${gone.length ? `<details class="list-block gone"><summary>${tr(gone.length > 1 ? '{n} étapes abandonnées' : '{n} étape abandonnée', { n: gone.length })}</summary>${gone.map((s) => tapRow(`data-step="${s.id}"`, '<span class="step-mark gone"></span>', esc(s.title), tr('Abandonnée'))).join('')}</details>` : ''}`;
    paintIcons(box);
  };

  /** Une étape : ce qu'on peut en faire (revenir en arrière = responsables, comme la base l'impose, migration 032) */
  const openStep = (s) => {
    const state = s.archived_at ? 'gone' : s.done ? 'done' : 'todo';
    const status = state === 'done' ? tr('Franchie') : state === 'gone' ? tr('Abandonnée')
      : s.due_date ? tr('Prévue le {date}', { date: B.longDate(s.due_date) }) : tr('Pas encore de date');
    const back = manager ? (state === 'done'
      ? `<button class="btn" data-act="undo">${tr('Remettre à faire')}</button>`
      : state === 'gone' ? `<button class="btn" data-act="restore">${tr('Reprendre cette étape')}</button>`
        : `<button class="btn link danger-ghost" data-act="drop">${tr('Abandonner cette étape')}</button>`) : '';
    const m = B.modal(`
      <h2 translate="no">${esc(s.title)}</h2>
      <p class="muted">${s.major ? `<span class="major-tag">${tr('Étape majeure')}</span> ` : ''}${status}</p>
      ${s.body ? `<p translate="no">${esc(s.body)}</p>` : ''}
      <div class="sheet-actions">
        ${state === 'todo' ? `<button class="btn teal" data-act="reach">${icon('flag', 15)} ${tr('Étape franchie')}</button>` : ''}
        ${state !== 'gone' ? `<button class="btn" data-act="edit">${icon('edit', 15)} ${tr('Modifier')}</button>` : ''}
        ${back}
      </div>
      ${!manager && state !== 'todo' ? `<p class="muted small">${tr('Seuls le Créateur et les Administrateurs peuvent revenir en arrière sur une étape.')}</p>` : ''}
      ${manager && state === 'todo' ? `<p class="muted small">${tr('Une étape abandonnée reste visible dans l’historique du chemin.')}</p>` : ''}
      <div class="actions"><span class="spacer"></span><button class="btn" data-close>${tr('Fermer')}</button></div>`);
    $('[data-close]', m).onclick = B.closeModal;
    $$('[data-act]', m).forEach((b) => (b.onclick = async () => {
      const act = b.dataset.act;
      if (act === 'edit') { B.closeModal(); return itemForm(p, 'milestone', s, load); }
      const patch = { reach: { done: true }, undo: { done: false }, drop: { archived_at: new Date().toISOString() }, restore: { archived_at: null } }[act];
      const { error } = await B.sb.from('items').update(patch).eq('id', s.id);
      if (error) return B.error(error);
      B.closeModal();
      const said = { reach: tr('Étape franchie : « {title} »'), undo: tr('Étape remise à faire : « {title} »'), drop: tr('Étape abandonnée : « {title} »'), restore: tr('Étape reprise : « {title} »') }[act];
      B.toast(esc(said.replace('{title}', s.title)), { type: 'success' });
      load();
    }));
  };

  el.addEventListener('click', (e) => {
    const add = e.target.closest('[data-add]');
    if (add) return itemForm(p, add.dataset.add, null, load);
    const row = e.target.closest('[data-step]');
    if (row) { const s = items.find((x) => x.id === row.dataset.step); if (s) openStep(s); }
  });
  await load();
  B.live('chemin-items', 'items', `project_id=eq.${p.id}`, debounce(load, 300));
}

// ---------- À décider : les votes ouverts, puis les décisions ----------
async function renderDecider(el, p) {
  el.innerHTML = `<div class="subpage">${subHead(p, tr('À décider'))}<div id="decider"></div></div>`;
  let items = [], votes = [];
  const load = async () => {
    const { data, error } = await B.sb.from('items').select('*').eq('project_id', p.id).eq('type', 'decision').order('created_at', { ascending: false });
    if (error) return B.error(error);
    items = (data || []).filter((i) => i.project_id === p.id && i.type === 'decision');
    const ids = items.filter((i) => i.vote_options).map((i) => i.id);
    votes = ids.length ? ((await B.sb.from('item_votes').select('*').in('item_id', ids)).data || []).filter((v) => ids.includes(v.item_id)) : [];
    render();
  };
  const voteBlock = (i) => {
    const vs = votes.filter((v) => v.item_id === i.id);
    const mine = new Set(vs.filter((v) => v.user_id === B.me.id).map((v) => v.choice));
    const until = new Date(i.vote_until).toLocaleString(B.locale(), { weekday: 'long', hour: '2-digit', minute: '2-digit' });
    return `<section class="vote-card">
      <b class="vote-q" translate="no">${esc(i.title)}</b>
      <div class="vote-row" data-vote="${i.id}">${i.vote_options.map((o, k) => { const n = vs.filter((v) => v.choice === k).length;
        return `<button class="btn vote-b ${mine.has(k) ? 'on' : ''}" data-choice="${k}" aria-pressed="${mine.has(k)}"><span translate="no">${esc(o)}</span>${n ? ` · ${n}` : ''}</button>`; }).join('')}</div>
      <p class="vote-note">${mine.size ? tr('Vous avez voté') : tr('Votre vote manque')} · ${tr('clôture {when}', { when: esc(until) })}${i.vote_multi ? ` · ${tr('plusieurs réponses possibles')}` : ''}</p>
    </section>`;
  };
  const render = () => {
    const box = $('#decider', el);
    if (!box) return;
    const open = openVotesOf(items);
    const others = items.filter((i) => !open.includes(i) && !i.archived_at);
    box.innerHTML = `
      ${open.length ? open.map(voteBlock).join('') : `<p class="muted calm">${tr("Rien à décider pour l'instant.")}</p>`}
      <a class="btn dashed" href="${campHref(p, 'tout')}" data-new-vote-go>${icon('plus', 16)} ${tr('Soumettre une décision au vote')}</a>
      ${others.length ? `<section class="list-block"><h3>${tr('Décisions')}</h3>${others.slice(0, 8).map((i) => `<a class="tap-row" href="${campHref(p, 'tout')}">
        <span class="step-mark ${i.done || (i.vote_until && new Date(i.vote_until) <= new Date()) ? 'done' : ''}">${i.done || (i.vote_until && new Date(i.vote_until) <= new Date()) ? icon('check', 14) : ''}</span>
        <span class="tap-text"><b translate="no">${esc(i.title)}</b></span>${icon('chevron', 16)}</a>`).join('')}</section>` : ''}`;
    paintIcons(box);
  };
  el.addEventListener('click', async (e) => {
    if (e.target.closest('[data-new-vote-go]')) B.pendingNewVote = true; // « Tout le projet » ouvre la fenêtre du vote
    const vb = e.target.closest('.vote-b');
    if (!vb) return;
    const item = items.find((i) => i.id === vb.closest('[data-vote]').dataset.vote);
    const choice = Number(vb.dataset.choice);
    const had = votes.some((v) => v.item_id === item.id && v.user_id === B.me.id && v.choice === choice);
    let error;
    if (had) ({ error } = await B.sb.from('item_votes').delete().match({ item_id: item.id, user_id: B.me.id, choice }));
    else {
      if (!item.vote_multi) ({ error } = await B.sb.from('item_votes').delete().match({ item_id: item.id, user_id: B.me.id }));
      if (!error) ({ error } = await B.sb.from('item_votes').insert({ item_id: item.id, user_id: B.me.id, choice, voted_at: new Date().toISOString() }));
    }
    if (error) B.error(new Error(/row-level security/i.test(error.message || '') ? tr('Ce vote est clos.') : errText(error)));
    load();
  });
  await load();
  const soon = debounce(load, 300);
  B.live('decider-items', 'items', `project_id=eq.${p.id}`, soon);
  B.live('decider-votes', 'item_votes', null, soon);
}

// ---------- Idées : une ligne par idée ----------
async function renderIdees(el, p) {
  el.innerHTML = `<div class="subpage">${subHead(p, tr('Idées'))}<div id="idees"></div></div>`;
  let ideas = [];
  const load = async () => {
    const { data, error } = await B.sb.from('items').select('*').eq('project_id', p.id).eq('type', 'idea').order('created_at', { ascending: false });
    if (error) return B.error(error);
    ideas = (data || []).filter((i) => i.project_id === p.id && i.type === 'idea' && !i.archived_at && !i.done);
    const box = $('#idees', el);
    if (!box) return;
    box.innerHTML = `
      <button class="btn dashed" data-add="idea">${icon('plus', 16)} ${tr('Noter une idée')}</button>
      ${ideas.length ? `<section class="list-block">${ideas.map((i) => tapRow(`data-idea="${i.id}"`, `<span class="idea-ico">${icon('bulb', 18)}</span>`, esc(i.title),
        esc(B.person(i.author_id).display_name || ''))).join('')}</section>
        <p class="muted small">${tr('Touchez une idée pour en faire une tâche ou la ranger.')}</p>`
        : `<p class="muted calm">${tr('Pas encore d’idée. Notez-en une : elle pourra devenir une tâche en un geste.')}</p>`}`;
    paintIcons(box);
  };
  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-add]')) return itemForm(p, 'idea', null, load);
    const row = e.target.closest('[data-idea]');
    if (!row) return;
    const idea = ideas.find((i) => i.id === row.dataset.idea);
    const r = row.getBoundingClientRect();
    const m = B.popMenu(Math.max(8, r.right - 250), r.bottom - 6, `
      <button class="pop-item" data-m="task">${icon('checksq', 16)}<span>${tr('En faire une tâche')}</span></button>
      <button class="pop-item" data-m="tidy">${icon('check', 16)}<span>${tr('Ranger cette idée')}</span></button>`);
    $('[data-m="task"]', m).onclick = async () => {
      B.closePopMenu();
      const { error } = await B.sb.from('tasks').insert({ project_id: p.id, title: idea.title, description: idea.body });
      if (error) return B.error(error);
      await B.sb.from('items').update({ done: true }).eq('id', idea.id);
      B.toast(`${tr('Tâche créée : « {title} ».', { title: esc(idea.title) })} <a href="#/p/${p.id}/taches">${tr('Voir les tâches')}</a>`, { type: 'success' });
      B.loadProjects(); load();
    };
    $('[data-m="tidy"]', m).onclick = async () => {
      B.closePopMenu();
      const { error } = await B.sb.from('items').update({ archived_at: new Date().toISOString() }).eq('id', idea.id);
      if (error) return B.error(error);
      load();
    };
    $('.pop-item', m)?.focus();
  });
  await load();
  B.live('idees-items', 'items', `project_id=eq.${p.id}`, debounce(load, 300));
}
