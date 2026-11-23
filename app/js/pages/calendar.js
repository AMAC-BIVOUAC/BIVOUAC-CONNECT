// =====================================================================
// Calendrier — toutes les dates du projet au même endroit, en un coup d'œil :
//   • événements (réunions, rendez-vous, dates limites…)   table events
//   • échéances des tâches                                  table tasks (due_date)
//   • étapes de la feuille de route                         table items (type milestone)
// Un clic sur un jour pour ajouter, un clic sur une pastille pour ouvrir.
// =====================================================================

/** Date du jour au format AAAA-MM-JJ (heure locale, pas UTC) */
function isoDay(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** "14:00" à partir de "14:00:00" */
const hhmm = (t) => (t ? t.slice(0, 5) : '');

/**
 * Toutes les dates d'un ou plusieurs projets, sous une forme commune :
 * { kind: 'event' | 'task' | 'milestone', id, project_id, day, title, time, status, late, raw }
 * eventsReady = false si la migration 004 n'est pas encore installée (les tâches et étapes s'affichent quand même).
 */
B.loadDates = async (projectIds, { from = null, to = null } = {}) => {
  const range = (q, col) => { if (from) q = q.gte(col, from); if (to) q = q.lte(col, to); return q; };
  const [ev, tk, ms] = await Promise.all([
    range(B.sb.from('events').select('*').in('project_id', projectIds), 'day').order('day'),
    range(B.sb.from('tasks').select('*').in('project_id', projectIds).not('due_date', 'is', null), 'due_date'),
    range(B.sb.from('items').select('*').in('project_id', projectIds).eq('type', 'milestone').not('due_date', 'is', null), 'due_date')
  ]);
  if (tk.error) throw tk.error;
  if (ms.error) throw ms.error;
  const today = isoDay();
  const out = [];
  for (const e of ev.data || []) {
    out.push({ kind: 'event', id: e.id, project_id: e.project_id, day: e.day, title: e.title, time: hhmm(e.start_time), end: hhmm(e.end_time), raw: e });
  }
  for (const t of (tk.data || []).filter((x) => x.due_date)) {
    out.push({ kind: 'task', id: t.id, project_id: t.project_id, day: t.due_date, title: t.title, status: t.status,
      late: t.status !== 'done' && t.due_date < today, raw: t });
  }
  for (const m of (ms.data || []).filter((x) => x.due_date)) {
    out.push({ kind: 'milestone', id: m.id, project_id: m.project_id, day: m.due_date, title: m.title, status: m.done ? 'done' : 'todo', raw: m });
  }
  // dans une journée : événements à heure fixe d'abord (par heure), puis le reste
  out.sort((a, b) => a.day.localeCompare(b.day) || (a.time || '99').localeCompare(b.time || '99'));
  return { dates: out, eventsReady: !ev.error };
};

const KIND_ICON = { event: 'calendar', task: 'checksq', milestone: 'flag' };

/** Pastille colorée pour un élément du calendrier */
B.dateChip = (d, { showProject = false } = {}) => {
  const cls = ['cal-chip', d.kind, d.status === 'done' ? 'done' : '', d.status === 'doing' ? 'doing' : '', d.late ? 'late' : ''].join(' ');
  const proj = showProject ? B.project(d.project_id) : null;
  // Tâche confiée à quelqu'un : sa photo au bout de la pastille (calendrier et « À venir »)
  const who = d.kind === 'task' && d.raw?.assignee_id ? B.person(d.raw.assignee_id) : null;
  const tip = [d.time ? `${d.time}${d.end ? '–' + d.end : ''}` : '', d.title, who ? tr('Confiée à {name}', { name: who.display_name }) : '',
    d.kind === 'task' && d.status === 'doing' ? tr('En cours') : '', d.late ? tr('En retard') : ''].filter(Boolean).join(' · ');
  return `<button class="${cls}" data-kind="${d.kind}" data-id="${d.id}" data-project="${d.project_id}" title="${esc(tip)}">
    ${icon(KIND_ICON[d.kind], 12)}${d.time ? `<b>${esc(d.time)}</b>` : ''}<span translate="no">${esc(d.title)}</span>
    ${who ? `<span class="chip-who">${avatar(who, 16)}</span>` : ''}
    ${proj ? `<i class="chip-proj" style="background:${esc(proj.color)}"></i>` : ''}</button>`;
};

/** Badge de date « 14 / nov. / lun. » */
function dayBadge(day) {
  const d = new Date(day + 'T00:00:00');
  const isToday = day === isoDay();
  return `<span class="day-badge ${isToday ? 'today' : ''}">
    <small>${esc(d.toLocaleDateString(B.locale(), { weekday: 'short' }))}</small>
    <strong>${d.getDate()}</strong>
    <small>${esc(d.toLocaleDateString(B.locale(), { month: 'short' }))}</small></span>`;
}

/** « Aujourd'hui », « Demain » ou la date en toutes lettres */
function dayLabel(day) {
  const today = isoDay();
  const tomorrow = isoDay(new Date(Date.now() + 86400000));
  if (day === today) return tr("Aujourd'hui");
  if (day === tomorrow) return tr('Demain');
  return new Date(day + 'T00:00:00').toLocaleDateString(B.locale(), { weekday: 'long', day: 'numeric', month: 'long' });
}

/** Liste « À venir » groupée par jour (utilisée dans le calendrier ET sur l'accueil) */
B.upcomingHtml = (dates, { showProject = false, empty = '' } = {}) => {
  const today = isoDay();
  const next = dates.filter((d) => d.day >= today && d.status !== 'done');
  const late = dates.filter((d) => d.late);
  const groups = new Map();
  for (const d of next) { if (!groups.has(d.day)) groups.set(d.day, []); groups.get(d.day).push(d); }
  let html = '';
  if (late.length) {
    html += `<div class="up-day late"><span class="day-badge late">${icon('flag', 18)}</span>
      <div><div class="up-label">${tr(late.length > 1 ? '{n} tâches en retard' : '{n} tâche en retard', { n: late.length })}</div>
      <div class="up-chips">${late.map((d) => B.dateChip(d, { showProject })).join('')}</div></div></div>`;
  }
  for (const [day, list] of groups) {
    html += `<div class="up-day">${dayBadge(day)}<div><div class="up-label">${esc(dayLabel(day))}</div>
      <div class="up-chips">${list.map((d) => B.dateChip(d, { showProject })).join('')}</div></div></div>`;
  }
  return html || `<p class="muted small">${empty || tr('Rien de prévu pour le moment.')}</p>`;
};

/** Fenêtre événement (création ou modification) */
B.openEvent = (ev, after) => {
  const isNew = !ev.id;
  const m = B.modal(`
    <h2>${isNew ? tr('Nouvel événement') : tr('Événement')}</h2>
    <label>${tr('Titre')}</label><input id="ev-title" maxlength="200" value="${esc(ev.title || '')}" placeholder="${tr('ex. Réunion de lancement')}" />
    <div class="form-row">
      <div><label>${tr('Date')}</label><input id="ev-day" type="date" value="${esc(ev.day || isoDay())}" /></div>
      <div><label>${tr('Début (facultatif)')}</label><input id="ev-start" type="time" value="${esc(hhmm(ev.start_time))}" /></div>
      <div><label>${tr('Fin (facultatif)')}</label><input id="ev-end" type="time" value="${esc(hhmm(ev.end_time))}" /></div>
    </div>
    <p class="muted small">${tr("Sans heure, l'événement dure toute la journée.")}</p>
    <label>${tr('Détails')}</label><textarea id="ev-desc" rows="3" maxlength="5000" placeholder="${tr('Lieu, lien de visio, ordre du jour…')}">${esc(ev.description || '')}</textarea>
    ${isNew ? '' : `<p class="muted small">${tr('Ajouté par {who}', { who: esc(B.person(ev.author_id).display_name) })}</p>`}
    <p class="msg" id="ev-msg"></p>
    <div class="actions">
      ${isNew || !B.canDelete(ev.project_id, ev.author_id) ? '' : `<button class="btn danger-ghost" id="ev-del">${icon('trash', 15)} ${tr('Supprimer')}</button>`}
      <span class="spacer"></span>
      <button class="btn" data-close>${tr('Annuler')}</button>
      <button class="btn primary" id="ev-save">${isNew ? tr('Créer') : tr('Enregistrer')}</button>
    </div>`);
  $('[data-close]', m).onclick = B.closeModal;
  $('#ev-save', m).onclick = async () => {
    const title = $('#ev-title', m).value.trim();
    const day = $('#ev-day', m).value;
    if (!title || !day) return ($('#ev-msg', m).textContent = tr('Il faut au moins un titre et une date.'));
    const row = {
      project_id: ev.project_id, title, day,
      start_time: $('#ev-start', m).value || null,
      end_time: $('#ev-end', m).value || null,
      description: $('#ev-desc', m).value.trim() || null
    };
    const q = isNew ? B.sb.from('events').insert(row) : B.sb.from('events').update(row).eq('id', ev.id);
    const { error } = await q;
    if (error) return ($('#ev-msg', m).textContent = errText(error));
    B.closeModal();
    after?.();
  };
  $('#ev-del', m)?.addEventListener('click', async () => {
    if (!(await B.confirm(tr('Supprimer « {name} » ?', { name: ev.title }), tr('Supprimer')))) return;
    try { await B.deleteRow('events', ev.id); } catch (err) { return B.error(err); }
    after?.();
  });
};

/** Fenêtre étape de feuille de route (création ou modification rapide) */
B.openMilestone = (it, after) => {
  const isNew = !it.id;
  const m = B.modal(`
    <h2>${isNew ? tr('Nouvelle étape') : tr('Étape')}</h2>
    <p class="muted small">${tr('Une grande étape du projet, visible dans la feuille de route.')}</p>
    <label>${tr('Titre')}</label><input id="ms-title" maxlength="200" value="${esc(it.title || '')}" placeholder="${tr('ex. Version de test prête')}" />
    <label>${tr('Date')}</label><input id="ms-day" type="date" value="${esc(it.due_date || isoDay())}" />
    ${isNew ? '' : `<label class="check"><input type="checkbox" id="ms-done" ${it.done ? 'checked' : ''} /> ${tr('Atteinte')}</label>`}
    <div class="actions">
      ${isNew || !B.canDelete(it.project_id, it.author_id) ? '' : `<button class="btn danger-ghost" id="ms-del">${icon('trash', 15)} ${tr('Supprimer')}</button>`}
      <span class="spacer"></span>
      <button class="btn" data-close>${tr('Annuler')}</button>
      <button class="btn primary" id="ms-save">${isNew ? tr('Créer') : tr('Enregistrer')}</button>
    </div>`);
  $('[data-close]', m).onclick = B.closeModal;
  $('#ms-save', m).onclick = async () => {
    const title = $('#ms-title', m).value.trim();
    const due = $('#ms-day', m).value;
    if (!title || !due) return;
    const row = { title, due_date: due, ...(isNew ? { project_id: it.project_id, type: 'milestone' } : { done: $('#ms-done', m).checked }) };
    const q = isNew ? B.sb.from('items').insert(row) : B.sb.from('items').update(row).eq('id', it.id);
    const { error } = await q;
    if (error) return B.error(error);
    B.closeModal();
    after?.();
  };
  $('#ms-del', m)?.addEventListener('click', async () => {
    if (!(await B.confirm(tr('Supprimer « {name} » ?', { name: it.title }), tr('Supprimer')))) return;
    try { await B.deleteRow('items', it.id); } catch (err) { return B.error(err); }
    after?.();
  });
};

/** Clic sur une pastille, où qu'elle soit (calendrier ou accueil) */
B.openDate = (d, after) => {
  if (d.kind === 'event') return B.openEvent(d.raw, after);
  if (d.kind === 'task') return B.openTask(d.raw, after);
  return B.openMilestone(d.raw, after);
};

/** Choix de ce qu'on ajoute un jour donné : trois gros boutons */
B.openAddOnDay = (projectId, day, after, { eventsReady = true } = {}) => {
  const m = B.modal(`
    <h2>${tr('Ajouter le {date}', { date: esc(new Date(day + 'T00:00:00').toLocaleDateString(B.locale(), { weekday: 'long', day: 'numeric', month: 'long' })) })}</h2>
    <div class="add-choices">
      <button class="add-choice event" data-a="event" ${eventsReady ? '' : 'disabled'}>${icon('calendar', 26)}<strong>${tr('Un événement')}</strong><span>${tr('Réunion, rendez-vous, date limite…')}</span></button>
      <button class="add-choice task" data-a="task">${icon('checksq', 26)}<strong>${tr('Une tâche')}</strong><span>${tr('Quelque chose à faire avant cette date')}</span></button>
      <button class="add-choice milestone" data-a="milestone">${icon('flag', 26)}<strong>${tr('Une étape')}</strong><span>${tr('Un grand jalon du projet')}</span></button>
    </div>
    <div class="actions"><span class="spacer"></span><button class="btn" data-close>${tr('Annuler')}</button></div>`);
  $('[data-close]', m).onclick = B.closeModal;
  $$('[data-a]', m).forEach((b) => (b.onclick = () => {
    const a = b.dataset.a;
    if (a === 'event') B.openEvent({ project_id: projectId, day }, after);
    if (a === 'task') B.openTask({ project_id: projectId, status: 'todo', due_date: day }, after);
    if (a === 'milestone') B.openMilestone({ project_id: projectId, due_date: day }, after);
  }));
};

// ---------------------------------------------------------------------
// La page Calendrier d'un projet (refaite façon Notion le 23/11, Apo) :
//   • vues Mois et Semaine (choix retenu par projet sur ce poste, `cal-view:<pid>`) ;
//   • cartes lisibles : titre sur deux lignes, rond d'état, photo du responsable ;
//   • « + Nouveau » sur chaque jour : on tape le titre, Entrée crée la tâche ce jour-là ;
//   • filtres personne (le même réglage que l'onglet Tâches, `tasks-who:<pid>`), état et type ;
//   • panneau « Sans date » : glisser une tâche sur un jour lui donne une date (et l'inverse) ;
//   • glisser-déposer à la souris ET au doigt (appui long), sans glisser-déposer HTML ;
//   • téléphone : petit mois avec des points + liste du jour choisi, ou semaine en agenda.
// Pas de tâche sur plusieurs jours : décision d'Apo du 23/11 (pas de date de début, pas de migration).
// ---------------------------------------------------------------------

const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return isoDay(d); };
const mondayOf = (iso) => addDays(iso, -((new Date(iso + 'T00:00:00').getDay() + 6) % 7));
const KIND_ORDER = { event: 0, milestone: 1, task: 2 };
const STATE_ORDER = { doing: 0, todo: 1, done: 2 };

/** Ordre dans une journée : événements (par heure), étapes, puis tâches en cours, à faire, terminées */
const calSort = (a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || (a.time || '99').localeCompare(b.time || '99')
  || (STATE_ORDER[a.status] ?? 1) - (STATE_ORDER[b.status] ?? 1) || a.title.localeCompare(b.title);

/** Carte d'un élément du calendrier. `big` : ligne de téléphone, avec une seconde ligne (heure, état…) */
function calCard(d, { big = false } = {}) {
  const who = d.kind === 'task' && d.raw?.assignee_id ? B.person(d.raw.assignee_id) : null;
  const state = d.kind === 'task' ? tr(d.status === 'done' ? 'Terminé' : d.status === 'doing' ? 'En cours' : 'À faire') : '';
  const lead = d.kind === 'task' ? `<span class="cal-dot ${esc(d.status || 'todo')}" aria-hidden="true"></span>`
    : d.kind === 'milestone' ? icon('flag', 13) : '';
  const title = d.kind === 'task'
    ? `${B.taskCodeHtml(d.title)}<span translate="no">${esc(B.taskTitleText(d.title))}</span>`
    : `<span translate="no">${esc(d.title)}</span>`;
  const time = d.time ? `${d.time}${d.end ? '–' + d.end : ''}` : '';
  const sub = big ? [time, d.kind === 'milestone' ? tr('Étape du chemin') : '', state, d.late ? tr('En retard') : ''].filter(Boolean).join(' · ') : '';
  const tip = [time, d.title, state, who ? tr('Confiée à {name}', { name: who.display_name }) : '', d.late ? tr('En retard') : ''].filter(Boolean).join(' · ');
  const cls = ['cal-card', d.kind, d.status === 'done' ? 'done' : '', d.late ? 'late' : '', big ? 'big' : ''].join(' ');
  return `<button class="${cls}" data-kind="${d.kind}" data-id="${d.id}" title="${esc(tip)}">${lead}
    <span class="cal-card-t">${!big && d.time ? `<b>${esc(d.time)}</b> ` : ''}${title}${sub ? `<small>${esc(sub)}</small>` : ''}</span>
    ${who ? `<span class="cal-who">${avatar(who, big ? 24 : 18)}</span>` : ''}</button>`;
}

B.pages.calendar = async (el, p) => {
  const pid = p.id;
  const phone = B.isPhone();
  const today = isoDay();
  let view = store.get(`cal-view:${pid}`, 'month');
  if (!['month', 'week'].includes(view)) view = 'month';
  let cursor = today;          // jour qui fixe le mois ou la semaine affichés
  let selected = today;        // téléphone, vue Mois : jour dont on voit la liste
  let who = store.get(`tasks-who:${pid}`, '');
  if (who && who !== 'none' && !B.projectMembers(pid).some((m) => m.id === who)) who = '';
  let state = store.get(`cal-state:${pid}`, 'all');
  let kinds = store.get(`cal-kinds:${pid}`, ['task', 'event', 'milestone']);
  if (!Array.isArray(kinds)) kinds = ['task', 'event', 'milestone'];
  let sideOpen = store.get(`cal-nodate:${pid}`, false) === true;
  let filtersOpen = false;     // téléphone : filtres derrière un bouton
  let quick = null;            // création rapide en cours : { day, value }
  let items = [];              // tout, y compris les tâches sans date (day = null)
  let eventsReady = true;

  const members = B.projectMembers(pid).sort((a, b) => (a.id === B.me.id ? -1 : b.id === B.me.id ? 1 : a.display_name.localeCompare(b.display_name)));
  const KINDS = [['task', 'Tâches'], ['event', 'Événements'], ['milestone', 'Étapes']];
  const STATES = [['all', 'Tous les états'], ['open', 'À faire et en cours'], ['todo', 'À faire'], ['doing', 'En cours'], ['done', 'Terminé']];

  el.innerHTML = `
    <div class="cal2 ${phone ? 'is-phone' : ''}">
      <div class="cal-bar">
        <div class="cal-nav">
          <button class="icon-btn cal-prev">${icon('chevron', 18).replace('<svg', '<svg style="transform:rotate(180deg)"')}</button>
          <button class="icon-btn cal-next">${icon('chevron', 18)}</button>
          <h3 class="cal-title" aria-live="polite"></h3>
          <button class="btn small cal-today">${tr("Aujourd'hui")}</button>
        </div>
        <div class="cal-tools">
          <div class="seg cal-views" role="group" aria-label="${tr('Vue')}">
            <button data-cv="month">${tr('Mois')}</button><button data-cv="week">${tr('Semaine')}</button>
          </div>
          <button class="btn small cal-filter-btn" aria-expanded="false">${icon('filter', 15)} ${tr('Filtres')}<small class="cal-count"></small></button>
          <button class="btn small cal-nodate-btn" aria-expanded="false">${tr('Sans date')}<small class="cal-count"></small></button>
          <button class="btn small cal-add">${icon('plus', 15)} ${tr('Ajouter')}</button>
        </div>
      </div>
      <div class="cal-filters">
        <label><span>${tr('Personne')}</span><select class="cal-who-sel">
          <option value="">${tr('Tout le monde')}</option>
          ${members.map((m) => `<option value="${m.id}">${m.id === B.me.id ? tr('Moi') : esc(m.display_name)}</option>`).join('')}
          <option value="none">${tr('Sans responsable')}</option></select></label>
        <label><span>${tr('État')}</span><select class="cal-state-sel">${STATES.map(([v, l]) => `<option value="${v}">${tr(l)}</option>`).join('')}</select></label>
        <div class="cal-kinds" role="group" aria-label="${tr('Afficher')}">
          ${KINDS.map(([k, l]) => `<button class="cal-kind ${k}" data-k="${k}"><i></i>${tr(l)}</button>`).join('')}
        </div>
      </div>
      <div class="cal-warning"></div>
      <div class="cal-main">
        <div class="cal-grid"></div>
        <aside class="cal-nodate" data-day="" aria-label="${tr('Sans date')}">
          <h4>${tr('Sans date')}</h4>
          <p class="muted small">${phone ? tr('Touchez une tâche pour lui donner une date, ou gardez le doigt dessus et glissez-la sur un jour.')
            : tr('Glissez une tâche sur un jour pour lui donner une date.')}</p>
          <div class="cal-nodate-list"></div>
        </aside>
      </div>
    </div>`;
  const root = $('.cal2', el);
  const grid = $('.cal-grid', el);
  $('.cal-who-sel', el).value = who;
  $('.cal-state-sel', el).value = state;

  // ----- Données -----
  const load = async () => {
    let res, undated;
    try {
      [res, undated] = await Promise.all([
        B.loadDates([pid]),
        B.sb.from('tasks').select('*').eq('project_id', pid).is('due_date', null)
      ]);
    } catch (err) { return B.error(err); }
    eventsReady = res.eventsReady;
    items = res.dates.concat((undated.data || []).filter((t) => !t.due_date)
      .map((t) => ({ kind: 'task', id: t.id, project_id: t.project_id, day: null, title: t.title, status: t.status, late: false, raw: t })));
    render();
  };
  const find = (kind, id) => items.find((x) => x.kind === kind && x.id === id);

  // ----- Filtres -----
  const passWho = (d) => d.kind !== 'task' || !who || (who === 'none' ? !d.raw?.assignee_id : d.raw?.assignee_id === who);
  const passState = (d) => {
    if (state === 'all' || d.kind === 'event') return true;
    if (d.kind === 'milestone') return state === 'done' ? d.status === 'done' : d.status !== 'done';
    return state === 'open' ? d.status !== 'done' : d.status === state;
  };
  const shown = (d) => kinds.includes(d.kind) && passWho(d) && passState(d);
  const activeFilters = () => (who ? 1 : 0) + (state !== 'all' ? 1 : 0) + (kinds.length < 3 ? 1 : 0);

  // ----- Affichage -----
  const dayName = (iso, opts) => new Date(iso + 'T00:00:00').toLocaleDateString(B.locale(), opts);
  const dows = [...Array(7)].map((_, i) => dayName(addDays('2024-01-01', i), { weekday: 'short' })); // 2024-01-01 = un lundi

  function title() {
    if (view === 'month') return dayName(cursor, { month: 'long', year: 'numeric' });
    const a = mondayOf(cursor), b = addDays(a, 6);
    const sameMonth = a.slice(0, 7) === b.slice(0, 7);
    return `${dayName(a, sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'short' })} – ${dayName(b, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  }

  /** Une case de jour (ordinateur) : numéro, « + Nouveau », cartes, création rapide */
  function cell(iso, list, { other = false, limit = Infinity, week = false } = {}) {
    const dow = (new Date(iso + 'T00:00:00').getDay() + 6) % 7;
    const n = +iso.slice(8);
    const label = week ? `<span class="cal-dow-name">${esc(dows[dow])}</span><span class="cal-day">${n}</span>`
      : `<span class="cal-day">${n === 1 ? esc(dayName(iso, { day: 'numeric', month: 'short' })) : n}</span>`;
    const cards = list.slice(0, limit).map((d) => calCard(d)).join('');
    const more = list.length > limit ? `<button class="cal-more" data-more="${iso}">${tr('+{n} autres', { n: list.length - limit })}</button>` : '';
    const q = quick && quick.day === iso ? `<form class="cal-quick" data-quick="${iso}">
        <input maxlength="200" placeholder="${tr('Nouvelle tâche…')}" aria-label="${tr('Titre de la nouvelle tâche')}" value="${esc(quick.value)}" />
        <button type="button" class="link cal-other" data-other="${iso}">${tr('Événement ou étape ?')}</button></form>` : '';
    return `<div class="cal-cell ${week ? 'week' : ''} ${other ? 'other' : ''} ${iso === today ? 'today' : ''} ${iso < today ? 'past' : ''} ${dow >= 5 ? 'weekend' : ''}" data-day="${iso}">
      <div class="cal-cell-head">${label}<button class="cal-new" data-new="${iso}" title="${tr('Nouvelle tâche ce jour-là')}">${icon('plus', 13)}<span>${tr('Nouveau')}</span></button></div>
      <div class="cal-items">${cards}${more}${q}</div></div>`;
  }

  function render() {
    const vis = items.filter(shown);
    const byDay = new Map();
    for (const d of vis) { if (!d.day) continue; if (!byDay.has(d.day)) byDay.set(d.day, []); byDay.get(d.day).push(d); }
    for (const l of byDay.values()) l.sort(calSort);
    const of = (iso) => byDay.get(iso) || [];

    $('.cal-title', el).textContent = title();
    $('.cal-prev', el).title = view === 'month' ? tr('Mois précédent') : tr('Semaine précédente');
    $('.cal-next', el).title = view === 'month' ? tr('Mois suivant') : tr('Semaine suivante');
    $$('.cal-views button', el).forEach((b) => { b.classList.toggle('on', b.dataset.cv === view); b.setAttribute('aria-pressed', String(b.dataset.cv === view)); });
    $$('.cal-kind', el).forEach((b) => { b.classList.toggle('on', kinds.includes(b.dataset.k)); b.setAttribute('aria-pressed', String(kinds.includes(b.dataset.k))); });
    const nf = activeFilters();
    $('.cal-filter-btn .cal-count', el).textContent = nf ? ` · ${nf}` : '';
    $('.cal-filter-btn', el).setAttribute('aria-expanded', String(filtersOpen));
    root.classList.toggle('filters-open', filtersOpen);
    $('.cal-warning', el).innerHTML = eventsReady ? ''
      : `<p class="notice">${icon('key', 14)} ${tr("Les événements ne sont pas encore activés sur le serveur (migration 004_calendrier.sql). Les échéances et les étapes s'affichent quand même.")}</p>`;

    // Sans date : tâches non terminées sans échéance (avec le filtre de personne)
    const undated = items.filter((d) => !d.day && d.kind === 'task' && d.status !== 'done' && passWho(d)).sort(calSort);
    $('.cal-nodate-btn .cal-count', el).textContent = ` (${undated.length})`;
    $('.cal-nodate-btn', el).setAttribute('aria-expanded', String(sideOpen));
    $('.cal-nodate-btn', el).classList.toggle('on', sideOpen);
    root.classList.toggle('side-open', sideOpen);
    $('.cal-nodate-list', el).innerHTML = undated.map((d) => calCard(d, { big: phone })).join('')
      || `<p class="muted small">${tr('Toutes les tâches ont une date.')}</p>`;

    if (phone) return renderPhone(of);
    if (view === 'week') {
      const a = mondayOf(cursor);
      grid.className = 'cal-grid cal-week';
      grid.innerHTML = [...Array(7)].map((_, i) => cell(addDays(a, i), of(addDays(a, i)), { week: true })).join('');
    } else {
      const first = cursor.slice(0, 8) + '01';
      const start = mondayOf(first);
      const last = addDays(addDays(first.slice(0, 8) + '28', 4).slice(0, 8) + '01', -1); // dernier jour du mois
      const end = addDays(mondayOf(last), 6);
      const days = [];
      for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
      grid.className = 'cal-grid cal-month';
      grid.innerHTML = dows.map((x) => `<div class="cal-dow">${esc(x)}</div>`).join('')
        + days.map((d) => cell(d, of(d), { other: d.slice(0, 7) !== first.slice(0, 7), limit: 4 })).join('');
    }
    const input = $('.cal-quick input', grid);
    if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
  }

  /** Téléphone : petit mois + liste du jour choisi, ou semaine en agenda */
  function renderPhone(of) {
    const dayTitle = (iso) => (iso === today ? `${tr("Aujourd'hui")} · ` : '') + dayName(iso, { weekday: 'long', day: 'numeric', month: 'long' });
    // Semaine (agenda) : un « + » discret à côté de chaque jour ; Mois : un vrai bouton sous le jour choisi
    const dayBlock = (iso, list, compact = false) => `<section class="cal-agenda-day ${iso === today ? 'today' : ''}" data-day="${iso}">
        <header><h4>${esc(dayTitle(iso))}</h4>${compact ? `<button class="cal-add-day" data-new="${iso}" aria-label="${tr('Ajouter ce jour-là')}" title="${tr('Ajouter ce jour-là')}">${icon('plus', 18)}</button>` : ''}</header>
        ${list.map((d) => calCard(d, { big: true })).join('')}
        ${compact ? '' : `<button class="cal-add-day" data-new="${iso}">${icon('plus', 15)} ${tr('Ajouter ce jour-là')}</button>`}
      </section>`;
    if (view === 'week') {
      const a = mondayOf(cursor);
      grid.className = 'cal-grid cal-agenda';
      grid.innerHTML = [...Array(7)].map((_, i) => dayBlock(addDays(a, i), of(addDays(a, i)), true)).join('');
      return;
    }
    const first = cursor.slice(0, 8) + '01';
    const start = mondayOf(first);
    const days = [];
    for (let d = start; days.length < 42; d = addDays(d, 1)) { if (days.length % 7 === 0 && days.length && d.slice(0, 7) !== first.slice(0, 7)) break; days.push(d); }
    grid.className = 'cal-grid cal-phone-month';
    grid.innerHTML = `<div class="cal-mini">${dows.map((x) => `<span class="cal-dow">${esc(x.slice(0, 1).toUpperCase())}</span>`).join('')}
      ${days.map((d) => {
        const list = of(d);
        const dots = [...new Set(list.map((x) => (x.late ? 'late' : x.kind)))].slice(0, 3).map((k) => `<i class="${k}"></i>`).join('');
        const label = dayName(d, { weekday: 'long', day: 'numeric', month: 'long' }) + (list.length ? ` · ${tr(list.length > 1 ? '{n} éléments' : '{n} élément', { n: list.length })}` : '');
        return `<button class="cal-mday ${d.slice(0, 7) !== first.slice(0, 7) ? 'other' : ''} ${d === today ? 'today' : ''} ${d === selected ? 'sel' : ''}"
          data-pick="${d}" data-day="${d}" aria-label="${esc(label)}" aria-pressed="${d === selected}">${+d.slice(8)}<span class="cal-dots">${dots}</span></button>`;
      }).join('')}</div>
      ${dayBlock(selected, of(selected))}`;
  }

  // ----- Navigation, vues, filtres -----
  const shift = (n) => {
    if (view === 'week') cursor = addDays(cursor, 7 * n);
    else { const d = new Date(cursor.slice(0, 8) + '01T00:00:00'); d.setMonth(d.getMonth() + n); cursor = isoDay(d); }
    if (phone && view === 'month') selected = cursor.slice(0, 7) === today.slice(0, 7) ? today : cursor;
    quick = null;
    render();
  };
  $('.cal-prev', el).onclick = () => shift(-1);
  $('.cal-next', el).onclick = () => shift(1);
  $('.cal-today', el).onclick = () => { cursor = selected = today; quick = null; render(); };
  $$('.cal-views button', el).forEach((b) => (b.onclick = () => {
    view = b.dataset.cv; store.set(`cal-view:${pid}`, view);
    if (phone) cursor = selected;
    quick = null; render();
  }));
  $('.cal-filter-btn', el).onclick = () => { filtersOpen = !filtersOpen; render(); };
  $('.cal-nodate-btn', el).onclick = () => { sideOpen = !sideOpen; store.set(`cal-nodate:${pid}`, sideOpen); render(); };
  $('.cal-add', el).onclick = () => B.openAddOnDay(pid, phone ? selected : today, load, { eventsReady });
  $('.cal-who-sel', el).onchange = (e) => { who = e.target.value; store.set(`tasks-who:${pid}`, who); render(); };
  $('.cal-state-sel', el).onchange = (e) => { state = e.target.value; store.set(`cal-state:${pid}`, state); render(); };
  $$('.cal-kind', el).forEach((b) => (b.onclick = () => {
    const k = b.dataset.k;
    kinds = kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k];
    if (!kinds.length) kinds = [k]; // jamais un calendrier vide par erreur
    store.set(`cal-kinds:${pid}`, kinds);
    render();
  }));

  // ----- Création rapide (ordinateur) : on tape le titre dans la case du jour -----
  const openQuick = (day) => { quick = { day, value: '' }; render(); };
  grid.addEventListener('input', (e) => { if (quick && e.target.closest('.cal-quick')) quick.value = e.target.value; });
  grid.addEventListener('keydown', (e) => { if (e.key === 'Escape' && quick) { quick = null; render(); } });
  grid.addEventListener('focusout', (e) => {
    const f = e.target.closest('.cal-quick');
    // on quitte le champ vide sans rien taper : on referme (sauf si l'on clique sur « Événement ou étape ? »)
    if (f && quick && !quick.value.trim() && !f.contains(e.relatedTarget)) setTimeout(() => {
      if (quick && !quick.value.trim() && !$('.cal-quick', grid)?.contains(document.activeElement)) { quick = null; render(); }
    }, 150);
  });
  grid.addEventListener('submit', async (e) => {
    const f = e.target.closest('.cal-quick');
    if (!f) return;
    e.preventDefault();
    const titleText = quick?.value.trim();
    if (!titleText) return;
    const day = quick.day;
    const row = { project_id: pid, title: titleText, status: 'todo', due_date: day, ...(who && who !== 'none' ? { assignee_id: who } : {}) };
    quick = { day, value: '' }; // le champ reste ouvert : on peut enchaîner plusieurs tâches
    const { error } = await B.sb.from('tasks').insert(row);
    if (error) { quick = { day, value: titleText }; render(); return B.error(error); }
    if (row.assignee_id) B.notify(row.assignee_id, { projectId: pid, type: 'task', text: tr("{who} t'a confié la tâche « {title} » ({project})", { who: B.me.display_name, title: titleText, project: p.name }), link: `#/p/${pid}/taches` });
    B.loadProjects();
    load();
  });

  // ----- Glisser-déposer (souris et doigt) -----
  // Souris : on glisse dès 5 px. Doigt : appui long (0,35 s) puis on glisse ; bouger avant = faire défiler la page.
  // Cible : tout élément [data-day] (case, colonne, jour du petit mois, journée de l'agenda ; "" = Sans date).
  let drag = null;
  let swallowClick = false;
  const clearTargets = () => $$('.drop-here', el).forEach((x) => x.classList.remove('drop-here'));
  const endDrag = () => {
    if (!drag) return;
    clearTimeout(drag.timer);
    clearInterval(drag.scroller);
    drag.ghost?.remove();
    drag.card.classList.remove('dragging');
    root.classList.remove('drag-on');
    clearTargets();
    drag = null;
  };
  const targetAt = (x, y) => {
    const t = document.elementFromPoint(x, y)?.closest('[data-day]');
    return t && el.contains(t) ? t : null;
  };
  const startDrag = () => {
    const r = drag.card.getBoundingClientRect();
    drag.started = true;
    drag.dx = drag.x0 - r.left; drag.dy = drag.y0 - r.top;
    drag.ghost = drag.card.cloneNode(true);
    drag.ghost.classList.add('cal-ghost');
    drag.ghost.style.width = `${r.width}px`;
    document.body.appendChild(drag.ghost);
    drag.card.classList.add('dragging');
    root.classList.add('drag-on');
    moveGhost(drag.x0, drag.y0);
    if (drag.touch) navigator.vibrate?.(15);
    // Près du haut ou du bas de l'écran, la page défile toute seule (pour atteindre une autre semaine)
    let box = root.parentElement;
    while (box && !(box.scrollHeight > box.clientHeight && /auto|scroll/.test(getComputedStyle(box).overflowY))) box = box.parentElement;
    const scroller = box || document.scrollingElement;
    drag.x = drag.x0; drag.y = drag.y0;
    drag.scroller = setInterval(() => {
      if (!drag) return;
      const r = box ? box.getBoundingClientRect() : { top: 0, bottom: innerHeight };
      const step = drag.y < r.top + 60 ? -14 : drag.y > r.bottom - 60 ? 14 : 0;
      if (step) { scroller.scrollTop += step; moveGhost(drag.x, drag.y); }
    }, 16);
  };
  const moveGhost = (x, y) => {
    drag.ghost.style.transform = `translate(${x - drag.dx}px, ${y - drag.dy}px) rotate(-2deg)`;
    const t = targetAt(x, y);
    const d = find(drag.kind, drag.id);
    const ok = t && d && (t.dataset.day !== '' || d.kind === 'task') && t.dataset.day !== (d.day || '');
    clearTargets();
    if (ok) t.classList.add('drop-here');
    drag.target = ok ? t : null;
  };
  el.addEventListener('pointerdown', (e) => {
    const card = e.target.closest('.cal-card');
    if (!card || e.button !== 0 || quick) return;
    drag = { card, kind: card.dataset.kind, id: card.dataset.id, x0: e.clientX, y0: e.clientY, touch: e.pointerType !== 'mouse', started: false };
    if (!drag.touch) e.preventDefault(); // pas de sélection de texte en glissant à la souris
    if (drag.touch) drag.timer = setTimeout(() => drag && !drag.started && startDrag(), 350);
  });
  const onMove = (e) => {
    if (!drag) return;
    const dist = Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0);
    if (!drag.started) {
      if (!drag.touch && dist > 5) startDrag();
      else if (drag.touch && dist > 10) return endDrag(); // le doigt fait défiler la page
      else return;
    }
    drag.x = e.clientX; drag.y = e.clientY;
    moveGhost(e.clientX, e.clientY);
  };
  const onUp = () => {
    if (!drag) return;
    const { started, target, kind, id } = drag;
    endDrag();
    if (!started) return;
    swallowClick = true; setTimeout(() => (swallowClick = false), 50);
    const d = find(kind, id);
    if (target && d) moveTo(d, target.dataset.day || null);
  };
  // Pendant qu'on glisse au doigt, la page ne défile pas
  const onTouchMove = (e) => { if (drag?.started) e.preventDefault(); };
  const onMenu = (e) => { if (drag) e.preventDefault(); };
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
  document.addEventListener('pointercancel', endDrag);
  document.addEventListener('touchmove', onTouchMove, { passive: false });
  el.addEventListener('contextmenu', onMenu);

  /** Changer la date d'un élément : affichage immédiat, retour en arrière si le serveur refuse */
  async function moveTo(d, day) {
    const old = d.day;
    const set = (v) => {
      d.day = v;
      if (d.kind === 'event') d.raw.day = v; else d.raw.due_date = v;
      d.late = d.kind === 'task' && d.status !== 'done' && !!v && v < isoDay();
    };
    set(day);
    if (phone && view === 'month' && day) selected = day;
    render();
    const table = d.kind === 'event' ? 'events' : d.kind === 'task' ? 'tasks' : 'items';
    const { error } = await B.sb.from(table).update(d.kind === 'event' ? { day } : { due_date: day }).eq('id', d.id);
    if (error) { set(old); render(); return B.error(error); }
    B.toast(day ? tr('« {title} » déplacé au {date}.', { title: esc(d.title), date: esc(dayName(day, { weekday: 'long', day: 'numeric', month: 'long' })) })
      : tr('« {title} » n\'a plus de date.', { title: esc(d.title) }), { type: 'success', timeout: 3000 });
    if (d.kind === 'task') B.loadProjects();
  }

  // ----- Clics -----
  el.addEventListener('click', (e) => {
    if (swallowClick) { e.preventDefault(); e.stopPropagation(); return; }
    const card = e.target.closest('.cal-card');
    if (card) { const d = find(card.dataset.kind, card.dataset.id); if (d) B.openDate(d, load); return; }
    const pick = e.target.closest('[data-pick]');
    if (pick) { selected = pick.dataset.pick; render(); return; }
    const other = e.target.closest('[data-other]');
    if (other) { const day = other.dataset.other; quick = null; render(); return B.openAddOnDay(pid, day, load, { eventsReady }); }
    const nw = e.target.closest('[data-new]');
    if (nw) return phone ? B.openAddOnDay(pid, nw.dataset.new, load, { eventsReady }) : openQuick(nw.dataset.new);
    const more = e.target.closest('[data-more]');
    if (more) {
      const day = more.dataset.more;
      const list = items.filter((x) => x.day === day && shown(x)).sort(calSort);
      const m = B.modal(`<h2>${esc(dayLabel(day))}</h2><div class="cal-day-list">${list.map((x) => calCard(x, { big: true })).join('')}</div>
        <div class="actions"><button class="btn" id="day-add">${icon('plus', 14)} ${tr('Ajouter')}</button><span class="spacer"></span><button class="btn" data-close>${tr('Fermer')}</button></div>`);
      $('[data-close]', m).onclick = B.closeModal;
      $('#day-add', m).onclick = () => B.openAddOnDay(pid, day, load, { eventsReady });
      $$('.cal-card', m).forEach((c) => (c.onclick = () => { const d = find(c.dataset.kind, c.dataset.id); if (d) B.openDate(d, load); }));
      return;
    }
    // un clic dans le vide d'une case (ordinateur) : nouvelle tâche ce jour-là
    const c = e.target.closest('.cal-cell[data-day]');
    if (c && !phone && !e.target.closest('.cal-quick')) openQuick(c.dataset.day);
  });

  // La page est remplacée à chaque navigation : on retire les écouteurs posés sur document
  const stop = () => {
    if (root.isConnected) return;
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', endDrag);
    document.removeEventListener('touchmove', onTouchMove);
    window.removeEventListener('hashchange', onHash);
  };
  const onHash = () => setTimeout(stop, 0);
  window.addEventListener('hashchange', onHash);

  await load();
  const reload = debounce(() => { if (!drag?.started) load(); }, 300);
  B.live('cal-events', 'events', `project_id=eq.${pid}`, reload);
  B.live('cal-tasks', 'tasks', `project_id=eq.${pid}`, reload);
  B.live('cal-items', 'items', `project_id=eq.${pid}`, reload);
};
