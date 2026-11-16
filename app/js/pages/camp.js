// =====================================================================
// Camp de base (remplace « Notre projet » ; refonte, livraison 2 — voir REFONTE.md)
//   paysage : l'objectif est le sommet, les étapes sont le chemin, « Vous êtes ici » juste après
//   la dernière étape franchie → À faire de votre côté (carte principale) → À décider ensemble
//   (bloc compact) → Derniers progrès (liste) → Idées (une ligne).
// Mêmes données qu'avant : items (objective, milestone, decision, idea), item_votes, tasks, activity.
// Les listes complètes (modifier, archiver, donner suite, lancer un vote) restent dans
// « Tout le projet », en bas de page : c'est l'ancien écran (hub.js), ouvert à la demande.
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

B.pages.camp = async (el, p) => {
  el.innerHTML = `<div class="camp">
    <section class="card landcard" id="camp-land"></section>
    <div class="camp-grid">
      <section class="card main-card" id="camp-todo"></section>
      <div class="camp-side"><section class="card decide" id="camp-decide"></section><section class="plist" id="camp-wins"></section></div>
    </div>
    <section class="card ideas-row" id="camp-ideas"></section>
    <details class="camp-all" id="camp-all">
      <summary>${icon('list', 16)} ${tr('Tout le projet : objectifs, étapes, décisions, idées, activité')}</summary>
      <div id="camp-hub"></div>
    </details>
  </div>`;

  let items = [], votes = [], tasks = [], wins = [];
  let hubReady = false;

  /** Ouvre « Tout le projet » (l'ancien écran, chargé à la première ouverture) */
  const openAll = async (then) => {
    const d = $('#camp-all', el);
    if (!d) return;
    d.open = true;
    if (!hubReady) { hubReady = true; await B.pages.hub($('#camp-hub', el), p); paintIcons(d); }
    d.scrollIntoView({ behavior: B.animationsOn() ? 'smooth' : 'auto', block: 'start' });
    then?.();
  };
  $('#camp-all', el).addEventListener('toggle', (e) => { if (e.target.open && !hubReady) openAll(); });

  const load = async () => {
    if (!el.isConnected) return;
    const [it, tk, w] = await Promise.all([
      B.sb.from('items').select('*').eq('project_id', p.id).order('created_at'),
      B.sb.from('tasks').select('*').eq('project_id', p.id).eq('assignee_id', B.me.id).neq('status', 'done'),
      B.loadWins([p.id], { limit: 3 }).catch(() => [])
    ]);
    if (it.error) return B.error(it.error);
    items = (it.data || []).filter((i) => i.project_id === p.id);
    tasks = B.orderMyTasks((tk.data || []).filter((t) => t.project_id === p.id && t.assignee_id === B.me.id && t.status !== 'done'));
    wins = w;
    const ids = items.filter((i) => i.vote_options).map((i) => i.id);
    votes = ids.length ? ((await B.sb.from('item_votes').select('*').in('item_id', ids)).data || []).filter((v) => ids.includes(v.item_id)) : [];
    render();
  };

  const openVotes = () => items.filter((i) => i.type === 'decision' && i.vote_options && i.vote_until && new Date(i.vote_until) > new Date() && !i.archived_at);
  const iVoted = (i) => votes.some((v) => v.item_id === i.id && v.user_id === B.me.id);

  // ---------- Le paysage ----------
  let lastW = 0;
  let drawn = false; // le chemin ne se dessine qu'à l'ouverture, pas à chaque mise à jour
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
    const W = Math.max(280, Math.round(box.clientWidth)), H = W < 560 ? 320 : 300;
    lastW = W;
    box.innerHTML = `
      <div class="land ${drawn ? '' : 'draw'}" role="img" aria-label="${esc(say)}" style="height:${H}px">${landscape(path, W, H)}
        <div class="land-head">
          <div class="eyebrow">${reached ? tr('Sommet atteint') : tr('Le sommet')}${summitDay ? ` · ${esc(B.longDate(summitDay))}` : ''}</div>
          ${goal ? `<h2 class="land-title" translate="no" title="${esc(goal.title)}">${esc(goal.title)}</h2>`
            : `<h2 class="land-title">${tr('Quel sommet visez-vous ?')}</h2><button class="btn small" data-add="objective">${icon('plus', 14)} ${tr("Fixer l'objectif")}</button>`}
        </div>
      </div>
      <div class="where">
        <div class="wrow"><span class="wdot me"></span><div>
          ${path.total ? `<b>${tr(path.done > 1 ? '{n} étapes sur {m} franchies' : '{n} étape sur {m} franchie', { n: path.done, m: path.total })}</b>
            <span>${path.last ? `${tr('Dernière')} : <span translate="no">${esc(path.last.title)}</span>${path.last.due_date ? ` · ${esc(fmtDate(path.last.due_date))}` : ''}` : tr('Le départ est donné.')}</span>`
            : `<b>${tr("Pas encore d'étape sur le chemin")}</b><span>${tr('Posez 3 ou 4 grandes étapes, avec une date.')}</span>`}
        </div></div>
        <div class="wrow"><span class="wdot next"></span><div>
          ${path.next ? `<b>${tr('Prochaine étape')} : <span translate="no">${esc(path.next.title)}</span></b>
            <span>${path.next.due_date ? `${esc(B.longDate(path.next.due_date))} · ${esc(B.daysUntil(path.next.due_date) < 0 ? B.plannedText(path.next.due_date) : B.daysText(path.next.due_date))}` : tr('pas encore de date')}</span>`
            : path.total ? `<b>${tr('Toutes les étapes sont franchies')}</b><span>${tr('Le sommet est en vue.')}</span>`
            : `<b>${tr('Prochaine étape')}</b><span>${tr('à définir ensemble')}</span>`}
        </div>
        ${path.next ? `<button class="btn small" data-reach="${path.next.id}">${icon('flag', 14)} ${tr('Étape franchie')}</button>`
          : `<button class="btn small" data-add="milestone">${icon('plus', 14)} ${tr('Ajouter une étape')}</button>`}
        </div>
      </div>`;    drawn = true;
  };

  // ---------- À faire de votre côté : la carte principale ----------
  const renderTodo = () => {
    const box = $('#camp-todo', el);
    if (!box) return;
    const [first, ...rest] = tasks;
    const next = B.pathOf(items).next;
    // « Prépare … » : seulement si la tâche est prévue au plus tard le jour de la prochaine étape
    const prepares = first && next && next.due_date && (!first.due_date || first.due_date <= next.due_date);
    box.innerHTML = `
      <div class="card-label mine"><span class="label-ico">${icon('checksq', 15)}</span>${tr('À faire de votre côté')}</div>
      ${first ? `<div class="big-task" data-id="${first.id}">
          <label class="tick big" title="${tr("C'est fait")}"><input type="checkbox" data-done aria-label="${tr("C'est fait")} : ${esc(first.title)}" />${icon('check', 14)}</label>
          <div class="big-text">
            <button class="big-title" translate="no">${esc(first.title)}</button>
            ${prepares ? `<div class="prep">${icon('flag', 13)}<span>${tr('Prépare « {step} »', { step: `<span translate="no">${esc(next.title)}</span>` })}</span></div>` : ''}
            <div class="big-actions"><button class="btn teal" data-done>${tr("C'est fait")}</button><button class="btn" data-snooze>${tr('Reporter')}</button>${B.dueHtml(first.due_date)}</div>
          </div>
        </div>
        ${rest.length ? `<div class="then"><div class="then-t">${tr('Ensuite')}</div>
          ${rest.slice(0, 2).map((t) => `<div class="then-r" data-id="${t.id}">
            <label class="tick" title="${tr("C'est fait")}"><input type="checkbox" data-done aria-label="${tr("C'est fait")} : ${esc(t.title)}" />${icon('check', 12)}</label>
            <button class="then-title" translate="no">${esc(t.title)}</button>${B.dueHtml(t.due_date)}</div>`).join('')}
          ${rest.length > 2 ? `<a class="link" href="#/p/${p.id}/taches">${tr('Voir mes {n} tâches', { n: tasks.length })} ${icon('arrow', 14)}</a>` : ''}</div>` : ''}`
        : `<p class="muted calm">${tr('Rien à faire de votre côté dans ce projet.')}</p>
           <a class="btn" href="#/p/${p.id}/taches">${icon('checksq', 15)} ${tr('Voir les tâches')}</a>`}`;
  };

  // ---------- À décider ensemble : bloc compact ----------
  const renderDecide = () => {
    const box = $('#camp-decide', el);
    if (!box) return;
    const open = openVotes().sort((a, b) => Number(iVoted(a)) - Number(iVoted(b)) || String(a.vote_until).localeCompare(String(b.vote_until)));
    const missing = open.filter((i) => !iVoted(i)).length;
    const i = open[0];
    const label = `<div class="card-label decide-label"><span class="label-ico">${icon('decision', 15)}</span>${tr('À décider ensemble')}${missing ? `<span class="n">${missing}</span>` : ''}</div>`;
    if (!i) {
      box.innerHTML = `${label}<p class="muted calm">${tr("Rien à décider pour l'instant.")}</p>
        <button class="link" data-new-vote-camp>${icon('users', 14)} ${tr('Soumettre une décision au vote')}</button>`;
      return;
    }
    const vs = votes.filter((v) => v.item_id === i.id);
    const mine = new Set(vs.filter((v) => v.user_id === B.me.id).map((v) => v.choice));
    const until = new Date(i.vote_until).toLocaleString(B.locale(), { weekday: 'long', hour: '2-digit', minute: '2-digit' });
    box.innerHTML = `${label}
      <b class="vote-q" translate="no">${esc(i.title)}</b>
      <div class="vote-row" data-vote="${i.id}">${i.vote_options.map((o, k) => { const n = vs.filter((v) => v.choice === k).length;
        return `<button class="btn vote-b ${mine.has(k) ? 'on' : ''}" data-choice="${k}" aria-pressed="${mine.has(k)}"><span translate="no">${esc(o)}</span>${n ? ` · ${n}` : ''}</button>`; }).join('')}</div>
      <p class="vote-note">${mine.size ? tr('Vous avez voté') : tr('Votre vote manque')} · ${tr('clôture {when}', { when: esc(until) })}${i.vote_multi ? ` · ${tr('plusieurs réponses possibles')}` : ''}</p>
      ${open.length > 1 ? `<button class="link" data-all-votes>${tr(open.length > 2 ? '{n} autres votes en cours' : '{n} autre vote en cours', { n: open.length - 1 })} ${icon('arrow', 14)}</button>` : ''}`;
  };

  // ---------- Derniers progrès : simple liste ----------
  const renderWins = () => {
    const box = $('#camp-wins', el);
    if (!box) return;
    box.classList.toggle('hidden', !wins.length);
    box.innerHTML = wins.length ? `<div class="plist-t">${icon('doublecheck', 15)} ${tr('Derniers progrès')}</div><ul>${wins.map((a) => B.winRow(a)).join('')}</ul>` : '';
  };

  // ---------- Idées : une ligne de pastilles ----------
  const renderIdeas = () => {
    const box = $('#camp-ideas', el);
    if (!box) return;
    const ideas = items.filter((i) => i.type === 'idea' && !i.archived_at && !i.done);
    box.innerHTML = `<div class="card-label idea-label"><span class="label-ico">${icon('bulb', 15)}</span>${tr('Idées')}${ideas.length ? `<span class="n soft">${ideas.length}</span>` : ''}</div>
      ${ideas.slice(0, 4).map((i) => `<button class="idea-chip" data-idea="${i.id}" translate="no">${esc(i.title)}</button>`).join('')}
      ${ideas.length > 4 ? `<button class="link" data-all-ideas>${tr('+ {n} autres', { n: ideas.length - 4 })}</button>` : ''}
      <button class="idea-chip add" data-add="idea">${icon('plus', 13)} ${tr('Noter une idée')}</button>
      <span class="ideas-hint">${tr('Une idée devient une tâche en un clic')}</span>`;
  };

  const render = () => { renderLand(); renderTodo(); renderDecide(); renderWins(); renderIdeas(); paintIcons(el); };

  // Le paysage suit la largeur de la fenêtre
  const ro = new ResizeObserver(debounce(() => {
    const w = Math.round($('#camp-land', el)?.clientWidth || 0);
    if (w && Math.abs(w - lastW) > 4) { lastW = w; renderLand(); }
  }, 150));
  ro.observe($('#camp-land', el));
  B.onLeave(() => ro.disconnect());

  /** Petite fenêtre : noter une idée, fixer l'objectif, ajouter une étape */
  const addItem = (type) => {
    const T = {
      idea: [tr('Noter une idée'), tr('Une nouvelle idée…'), false],
      objective: [tr("Fixer l'objectif"), tr('À quoi verra-t-on que le projet est réussi ?'), true],
      milestone: [tr('Ajouter une étape'), tr('Une grande étape…'), true]
    }[type];
    const m = B.modal(`
      <h2>${esc(T[0])}</h2>
      <label for="ci-title">${tr('Titre')}</label><input id="ci-title" maxlength="200" placeholder="${esc(T[1])}" />
      ${T[2] ? `<label for="ci-date">${tr('Date (facultatif)')}</label><input id="ci-date" type="date" />` : ''}
      <p class="msg" id="ci-msg"></p>
      <div class="actions"><button class="btn" data-close>${tr('Annuler')}</button><button class="btn primary" id="ci-go">${tr('Ajouter')}</button></div>`);
    $('[data-close]', m).onclick = B.closeModal;
    const go = async () => {
      const title = $('#ci-title', m).value.trim();
      if (!title) return ($('#ci-msg', m).textContent = tr('Écrivez un titre.'));
      const { error } = await B.sb.from('items').insert({ project_id: p.id, type, title, due_date: $('#ci-date', m)?.value || null });
      if (error) return ($('#ci-msg', m).textContent = errText(error));
      B.closeModal();
      load();
    };
    $('#ci-go', m).onclick = go;
    $('#ci-title', m).addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    $('#ci-title', m).focus();
  };

  el.addEventListener('click', async (e) => {
    if (e.target.closest('#camp-hub')) return; // « Tout le projet » gère ses propres clics (hub.js)
    const add = e.target.closest('[data-add]');
    if (add) return addItem(add.dataset.add);

    // Étape franchie (avec « Annuler »)
    const reach = e.target.closest('[data-reach]');
    if (reach) {
      const s = items.find((i) => i.id === reach.dataset.reach);
      const { error } = await B.sb.from('items').update({ done: true }).eq('id', reach.dataset.reach);
      if (error) return B.error(error);
      B.toast(`${icon('flag', 14)} ${tr('Étape franchie : « {title} »', { title: esc(s?.title || '') })}`, { type: 'success',
        actions: [[tr('Annuler'), '', async () => { await B.sb.from('items').update({ done: false }).eq('id', reach.dataset.reach); load(); }]] });
      return load();
    }

    // Voter (même règle qu'avant : une voix, modifiable jusqu'à la clôture ; plusieurs si choix multiple)
    const vb = e.target.closest('.vote-b');
    if (vb) {
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
      return load();
    }
    if (e.target.closest('[data-all-votes]') || e.target.closest('[data-all-ideas]')) return openAll();
    if (e.target.closest('[data-new-vote-camp]')) return openAll(() => $('#camp-hub [data-new-vote]', el)?.click());

    // Une idée : en faire une tâche, ou la ranger
    const chip = e.target.closest('[data-idea]');
    if (chip) {
      const idea = items.find((i) => i.id === chip.dataset.idea);
      const r = chip.getBoundingClientRect();
      const m = B.popMenu(r.left, r.bottom + 6, `
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
      return;
    }

    // Mes tâches : c'est fait, reporter, ouvrir
    const row = e.target.closest('.big-task, .then-r');
    if (!row) return;
    const t = tasks.find((x) => x.id === row.dataset.id);
    if (!t) return;
    if (e.target.closest('[data-done]')) return B.completeTask(t, load);
    if (e.target.closest('[data-snooze]')) return B.snoozeTask(t, e.target.closest('[data-snooze]'), load);
    if (e.target.closest('.big-title, .then-title')) B.openTask(t, load);
  });

  await load();
  const soon = debounce(load, 300);
  B.live('camp-items', 'items', `project_id=eq.${p.id}`, soon);
  B.live('camp-votes', 'item_votes', null, soon);
  B.live('camp-tasks', 'tasks', `project_id=eq.${p.id}`, soon);
};
