// =====================================================================
// Camp de base (remplace « Notre projet » ; refonte, livraison 2, revue pour le téléphone le 16/11)
// Règle de clarté : un écran = une question. L'accueil du projet tient sans défiler : le paysage (où en est-on ?),
// UN seul « Votre prochain pas », puis des portes. Les listes sont derrière les portes, chacune sur sa page :
//   …/projet/chemin   Le chemin : étapes franchies, à venir, abandonnées (revenir en arrière = responsables, 032)
//   …/projet/decider  À décider : votes ouverts, décisions
//   …/projet/idees    Idées : une ligne par idée ; en faire une tâche, la ranger
//   …/projet/absence  Pendant votre absence (resume.js)
//   …/projet/tout     Tout le projet : l'ancien écran complet (hub.js), pour modifier en détail
// Mêmes données qu'avant : items (objective, milestone, decision, idea), item_votes, tasks, activity.
// =====================================================================

// Le chemin, dans le repère du dessin (1100 × 220, origine en haut à -20) : 4 courbes, puis la montée au sommet
const LAND = { w: 1100, h: 220, top: -20 };
const TRAIL = [
  [[40, 164], [120, 160], [180, 152], [240, 149]],
  [[240, 149], [300, 146], [320, 142], [360, 140]],
  [[360, 140], [430, 134], [500, 127], [560, 122]],
  [[560, 122], [650, 114], [730, 104], [790, 98]]
];
const CLIMB = [[790, 98], [860, 90], [940, 70], [1000, 30]];

/** Points d'une courbe de Bézier (pour mesurer le chemin sans dépendre du navigateur) */
function bezier([a, b, c, d], n = 24) {
  const pts = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n, u = 1 - t;
    pts.push([u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0],
      u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1]]);
  }
  return pts;
}

/**
 * Le paysage, dessiné à la taille réelle de la carte (rien n'est déformé dans le tracé ni les repères).
 * `path` vient de B.pathOf ; `W` × `H` = taille en pixels.
 */
function landscape(path, W, H) {
  const sx = W / LAND.w, sy = H / LAND.h;
  const px = ([x, y]) => [x * sx, (y - LAND.top) * sy];
  const trail = TRAIL.flatMap((seg, k) => bezier(seg).slice(k ? 1 : 0)).map(px);
  const climb = bezier(CLIMB).map(px);
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
  // Emplacements : les étapes franchies, puis « Vous êtes ici », puis les étapes à venir
  const slots = path.total + 1;
  const spot = (n) => at(slots > 1 ? n / (slots - 1) : 0.12);
  const here = spot(path.done);
  const steps = path.steps.map((s, n) => ({ s, ...spot(n < path.done ? n : n + 1), done: n < path.done, next: s === path.next }));
  const line = (pts) => pts.map(([x, y], k) => `${k ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const walked = [...trail.slice(0, here.k), here.pt];
  const ahead = [here.pt, ...trail.slice(here.k)];
  const top = climb[climb.length - 1];
  const sun = px([930, 80]);

  const svg = `<svg class="land-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">
    <defs>
      <linearGradient id="land-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="l-sky-1"/><stop offset=".55" class="l-sky-2"/><stop offset="1" class="l-sky-3"/></linearGradient>
      <radialGradient id="land-glow"><stop offset="0" class="l-sun" stop-opacity=".9"/><stop offset=".35" class="l-sun" stop-opacity=".4"/><stop offset="1" class="l-sun" stop-opacity="0"/></radialGradient>
      <linearGradient id="land-peak" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="l-peak-1"/><stop offset="1" class="l-peak-2"/></linearGradient>
      <linearGradient id="land-hill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="l-hill-1"/><stop offset="1" class="l-hill-2"/></linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#land-sky)"/>
    <circle cx="${sun[0]}" cy="${sun[1]}" r="${Math.min(150, W * .3)}" fill="url(#land-glow)"/>
    <circle cx="${sun[0]}" cy="${sun[1]}" r="${Math.min(34, W * .07)}" class="l-sun" opacity=".9"/>
    <g transform="scale(${sx} ${sy}) translate(0 ${-LAND.top})">
      <path class="l-far" d="M0,120 L90,96 L170,110 L260,80 L350,104 L450,72 L540,98 L640,64 L720,90 L800,62 L880,88 L960,58 L1040,84 L1100,70 V200 H0 Z"/>
      <path class="l-mid" d="M0,150 L110,120 L200,138 L300,110 L410,136 L520,106 L620,132 L700,102 L790,126 L860,108 V200 H0 Z"/>
      <path fill="url(#land-peak)" d="M820,200 L930,92 L962,106 L1000,30 L1050,94 L1074,82 L1100,92 V200 Z"/>
      <path class="l-snow" d="M1000,30 L1019,54 L1010,50 L1002,58 L994,51 L987,54 Z"/>
      <path fill="url(#land-hill)" d="M0,200 L0,174 C140,170 220,160 300,156 S470,140 560,134 S720,118 800,112 C850,108 878,124 905,200 Z"/>
    </g>
    ${[[90, 198, 1], [108, 197, .8], [520, 192, .9], [700, 178, .8]].map(([x, y, s]) => { const [tx, ty] = px([x, y]); return `<path class="l-tree" d="M${tx},${ty - 26 * s} l${7 * s},${26 * s} h${-14 * s} z"/>`; }).join('')}
    <path class="l-dots" d="${line(ahead)}"/>
    <path class="l-dots up" d="${line(climb)}"/>
    ${path.done || slots === 1 ? `<path class="l-walk-under" pathLength="1" d="${line(walked)}"/><path class="l-walk" pathLength="1" d="${line(walked)}"/>` : ''}
    ${steps.map(({ pt: [x, y], done, next }) => done
      ? `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><path class="l-tent" d="M-12,3 L0,-15 L12,3 Z"/><path class="l-tent-door" d="M0,-8 L-4.5,3 L4.5,3 Z"/><path class="l-ground" d="M-16,3 H16"/></g>`
      : `<circle class="l-step ${next ? 'next' : ''}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${next ? 9 : 6.5}"/>`).join('')}
    <g transform="translate(${top[0].toFixed(1)} ${top[1].toFixed(1)})"><path class="l-flag" d="M0,0 v-26 M0,-26 l20,7 l-20,7"/></g>
    <g class="l-here" transform="translate(${here.pt[0].toFixed(1)} ${here.pt[1].toFixed(1)})"><circle class="l-here-wave" r="20"/><circle class="l-here-ring" r="10.6"/><circle class="l-here-dot" r="9"/></g>
  </svg>`;

  // Textes posés par-dessus (taille réelle : jamais sous 12 px, même sur téléphone)
  // Sur téléphone (ou quand les repères sont serrés) : seulement la date de la prochaine étape (les noms sont écrits juste sous le paysage).
  // Sur ordinateur : toutes les étapes si elles ont la place, sinon la prochaine seulement.
  const gap = slots > 1 ? (total / (slots - 1)) : total;
  const phone = W < 560 || gap < 150;
  const shown = steps.filter(({ s, next }) => phone ? (next && s.due_date) : (gap >= 230 || next));
  const labels = shown.map(({ s, pt: [x, y], next }) => {
    const side = x < 130 ? 'l' : x > W - 140 ? 'r' : '';
    const date = s.due_date ? esc(fmtDate(s.due_date)) : '';
    return `<span class="land-lab ${next ? 'next' : ''} ${side}" style="left:${x.toFixed(0)}px;top:${(y + 16).toFixed(0)}px">${phone ? `<i>${date}</i>` : `<span translate="no">${esc(s.title)}</span>${date ? `<i>· ${date}</i>` : ''}`}</span>`;
  }).join('');
  const bx = Math.max(64, Math.min(W - 64, here.pt[0]));
  const bubble = `<span class="land-here" style="left:${bx.toFixed(0)}px;top:${(here.pt[1] - 22).toFixed(0)}px">${tr('Vous êtes ici')}<i style="left:calc(50% + ${(here.pt[0] - bx).toFixed(0)}px)"></i></span>`;
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

const openVotesOf = (items) => items.filter((i) => i.type === 'decision' && i.vote_options && i.vote_until && new Date(i.vote_until) > new Date() && !i.archived_at);

/** Une petite fenêtre : un titre et une date (noter une idée, fixer l'objectif, ajouter ou modifier une étape) */
function itemForm(p, type, item, done) {
  const T = {
    idea: [tr('Noter une idée'), tr('Une nouvelle idée…'), false],
    objective: [tr("Fixer l'objectif"), tr('À quoi verra-t-on que le projet est réussi ?'), true],
    milestone: [item ? tr("Modifier l'étape") : tr('Ajouter une étape'), tr('Une grande étape…'), true]
  }[type];
  const m = B.modal(`
    <h2>${esc(T[0])}</h2>
    <label for="ci-title">${tr('Titre')}</label><input id="ci-title" maxlength="200" placeholder="${esc(T[1])}" value="${esc(item?.title || '')}" />
    ${T[2] ? `<label for="ci-date">${tr('Date (facultatif)')}</label><input id="ci-date" type="date" value="${esc(item?.due_date || '')}" />` : ''}
    <p class="msg" id="ci-msg"></p>
    <div class="actions"><button class="btn" data-close>${tr('Annuler')}</button><button class="btn primary" id="ci-go">${item ? tr('Enregistrer') : tr('Ajouter')}</button></div>`);
  $('[data-close]', m).onclick = B.closeModal;
  const go = async () => {
    const title = $('#ci-title', m).value.trim();
    if (!title) return ($('#ci-msg', m).textContent = tr('Écrivez un titre.'));
    const row = { title, due_date: $('#ci-date', m)?.value || null };
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
    const goal = items.find((i) => i.type === 'objective' && !i.archived_at && !i.done) || items.filter((i) => i.type === 'objective').pop() || null;
    const lastStep = path.steps[path.steps.length - 1];
    const summitDay = goal?.due_date || (lastStep?.due_date && !lastStep.done ? lastStep.due_date : null);
    const reached = goal && (goal.done || goal.archived_at);
    const say = path.total
      ? tr('Chemin du projet : {n} étapes franchies sur {m}.', { n: path.done, m: path.total }) + (path.next ? ` ${tr('Prochaine étape')} : ${path.next.title}.` : '')
      : tr('Chemin du projet : aucune étape pour le moment.');
    const W = Math.max(280, Math.round(box.clientWidth));
    // Téléphone : le titre au-dessus du dessin (deux espaces distincts, jamais de collision avec « Vous êtes ici »)
    const stacked = W < 560;
    const H = stacked ? 190 : 300;
    lastW = W;
    const head = `<div class="land-head">
          <div class="eyebrow">${reached ? tr('Sommet atteint') : tr('Le sommet')}${summitDay ? ` · ${esc(B.longDate(summitDay))}` : ''}</div>
          ${goal ? `<h2 class="land-title" translate="no" title="${esc(goal.title)}">${esc(goal.title)}</h2>`
            : `<h2 class="land-title">${tr('Quel sommet visez-vous ?')}</h2><button class="btn small" data-add="objective">${icon('plus', 14)} ${tr("Fixer l'objectif")}</button>`}
        </div>`;
    const next = path.next;
    box.innerHTML = `
      <div class="land ${stacked ? 'stacked' : ''} ${drawn ? '' : 'draw'}" role="img" aria-label="${esc(say)}">
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
      <div class="card-label mine"><span class="label-ico">${icon('checksq', 15)}</span>${tr('Votre prochain pas')}</div>
      ${first ? `<div class="big-task" data-id="${first.id}">
          <div class="big-text">
            ${B.taskCodeHtml(first.title)}
            <button class="big-title" translate="no">${esc(B.taskTitleText(first.title))}</button>
            <div class="big-actions"><button class="btn teal" data-done>${tr("C'est fait")}</button><button class="btn" data-snooze>${tr('Reporter')}</button>${B.dueHtml(first.due_date)}</div>
          </div>
        </div>
        ${rest.length ? `<a class="more-link" href="#/p/${p.id}/taches">${tr(rest.length > 1 ? '{n} autres tâches pour vous' : '{n} autre tâche pour vous', { n: rest.length })}${icon('chevron', 16)}</a>` : ''}`
        : `<p class="muted calm">${tr('Rien à faire de votre côté dans ce projet.')}</p>
           <a class="more-link" href="#/p/${p.id}/taches">${tr('Voir les tâches')}${icon('chevron', 16)}</a>`}`;
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
      door(campHref(p, 'tout'), 'list', tr('Tout le projet'), tr('Objectifs, décisions, activité'))
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
    const row = e.target.closest('.big-task');
    if (!row) return;
    const t = tasks.find((x) => x.id === row.dataset.id);
    if (!t) return;
    if (e.target.closest('[data-done]')) return B.completeTask(t, load);
    if (e.target.closest('[data-snooze]')) return B.snoozeTask(t, e.target.closest('[data-snooze]'), load);
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
  el.innerHTML = `<div class="subpage">${subHead(p, tr('Le chemin'))}<div id="chemin"></div></div>`;
  let items = [];
  const manager = B.isManager(p.id);

  const load = async () => {
    const { data, error } = await B.sb.from('items').select('*').eq('project_id', p.id).order('created_at');
    if (error) return B.error(error);
    items = (data || []).filter((i) => i.project_id === p.id);
    render();
  };

  const stepRow = (s, state) => {
    const mark = state === 'done' ? `<span class="step-mark done">${icon('check', 14)}</span>`
      : state === 'gone' ? `<span class="step-mark gone"></span>`
        : `<span class="step-mark ${state === 'next' ? 'next' : ''}"></span>`;
    const line = state === 'done' ? tr('Franchie') + (s.due_date ? ` · ${tr('prévue le {date}', { date: fmtDate(s.due_date) })}` : '')
      : state === 'gone' ? tr('Abandonnée')
        : s.due_date ? `${esc(B.longDate(s.due_date))} · ${esc(B.daysUntil(s.due_date) < 0 ? B.plannedText(s.due_date) : B.daysText(s.due_date))}` : tr('pas encore de date');
    return tapRow(`data-step="${s.id}"`, mark, esc(s.title), line);
  };

  const render = () => {
    const box = $('#chemin', el);
    if (!box) return;
    const path = B.pathOf(items);
    const gone = items.filter((i) => i.type === 'milestone' && i.archived_at);
    const goal = items.find((i) => i.type === 'objective' && !i.archived_at && !i.done) || null;
    const done = path.steps.slice(0, path.done), ahead = path.steps.slice(path.done);
    box.innerHTML = `
      <section class="summit">
        <span class="summit-ico">${icon('flag', 22)}</span>
        <div><div class="eyebrow">${tr('Le sommet')}${goal?.due_date ? ` · ${esc(B.longDate(goal.due_date))}` : ''}</div>
        ${goal ? `<p class="summit-title" translate="no">${esc(goal.title)}</p>` : `<button class="btn small" data-add="objective">${icon('plus', 14)} ${tr("Fixer l'objectif")}</button>`}</div>
      </section>
      ${done.length ? `<section class="list-block"><h3>${tr('Franchies')}</h3>${done.map((s) => stepRow(s, 'done')).join('')}</section>` : ''}
      <div class="here-mark"><span class="here-dot" aria-hidden="true"></span>${tr('Vous êtes ici')}</div>
      <section class="list-block"><h3>${tr('À venir')}</h3>
        ${ahead.length ? ahead.map((s) => stepRow(s, s === path.next ? 'next' : 'later')).join('') : `<p class="muted calm">${tr('Plus aucune étape à venir.')}</p>`}
        <button class="btn dashed" data-add="milestone">${icon('plus', 16)} ${tr('Ajouter une étape')}</button>
      </section>
      ${gone.length ? `<details class="list-block gone"><summary>${tr(gone.length > 1 ? '{n} étapes abandonnées' : '{n} étape abandonnée', { n: gone.length })}</summary>${gone.map((s) => stepRow(s, 'gone')).join('')}</details>` : ''}`;
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
      <p class="muted">${status}</p>
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
