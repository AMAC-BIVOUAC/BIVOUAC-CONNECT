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
  for (const t of tk.data || []) {
    out.push({ kind: 'task', id: t.id, project_id: t.project_id, day: t.due_date, title: t.title, status: t.status,
      late: t.status !== 'done' && t.due_date < today, raw: t });
  }
  for (const m of ms.data || []) {
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
  const tip = [d.time ? `${d.time}${d.end ? '–' + d.end : ''}` : '', d.title, d.kind === 'task' && d.status === 'doing' ? tr('En cours') : '', d.late ? tr('En retard') : ''].filter(Boolean).join(' · ');
  return `<button class="${cls}" data-kind="${d.kind}" data-id="${d.id}" data-project="${d.project_id}" title="${esc(tip)}">
    ${icon(KIND_ICON[d.kind], 12)}${d.time ? `<b>${esc(d.time)}</b>` : ''}<span translate="no">${esc(d.title)}</span>
    ${proj ? `<i class="chip-proj" style="background:${esc(proj.color)}"></i>` : ''}</button>`;
};

/** Légende des couleurs */
function calLegend() {
  return `<div class="cal-legend">
    <span><i class="lg event"></i>${tr('Événement')}</span>
    <span><i class="lg task"></i>${tr('Tâche')}</span>
    <span><i class="lg milestone"></i>${tr('Étape')}</span>
    <span><i class="lg late"></i>${tr('En retard')}</span>
  </div>`;
}

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
      ${isNew ? '' : `<button class="btn danger-ghost" id="ev-del">${icon('trash', 15)} ${tr('Supprimer')}</button>`}
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
    const { error } = await B.sb.from('events').delete().eq('id', ev.id);
    if (error) return B.error(error);
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
      ${isNew ? '' : `<button class="btn danger-ghost" id="ms-del">${icon('trash', 15)} ${tr('Supprimer')}</button>`}
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
    await B.sb.from('items').delete().eq('id', it.id);
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
// La page Calendrier d'un projet
// ---------------------------------------------------------------------

B.pages.calendar = async (el, p) => {
  const month = new Date();
  month.setDate(1);
  let dates = [];
  let eventsReady = true;

  el.innerHTML = `
    <div class="calendar-page">
      <section class="calendar">
        <div class="cal-head">
          <div class="cal-nav">
            <button class="icon-btn cal-prev" title="${tr('Mois précédent')}">${icon('chevron', 18).replace('<svg', '<svg style="transform:rotate(180deg)"')}</button>
            <h3 class="cal-title"></h3>
            <button class="icon-btn cal-next" title="${tr('Mois suivant')}">${icon('chevron', 18)}</button>
            <button class="btn small cal-today">${tr("Aujourd'hui")}</button>
          </div>
          ${calLegend()}
          <button class="btn primary small" id="cal-add">${icon('plus', 15)} ${tr('Ajouter')}</button>
        </div>
        <div class="cal-warning"></div>
        <div class="cal-grid"></div>
      </section>
      <aside class="card cal-side">
        <div class="card-head"><h2>${tr('À venir')}</h2></div>
        <div class="upcoming"></div>
      </aside>
    </div>`;

  const grid = $('.cal-grid', el);

  const load = async () => {
    try {
      ({ dates, eventsReady } = await B.loadDates([p.id]));
    } catch (err) { return B.error(err); }
    render();
  };

  function render() {
    const y = month.getFullYear(), mo = month.getMonth();
    $('.cal-title', el).textContent = month.toLocaleDateString(B.locale(), { month: 'long', year: 'numeric' });
    $('.cal-warning', el).innerHTML = eventsReady ? ''
      : `<p class="notice">${icon('key', 14)} ${tr("Les événements ne sont pas encore activés sur le serveur (migration 004_calendrier.sql). Les échéances et les étapes s'affichent quand même.")}</p>`;

    // en-têtes des jours (lundi → dimanche), dans la langue de l'app
    const monday = new Date(2024, 0, 1); // un lundi
    const dows = [...Array(7)].map((_, i) => new Date(monday.getTime() + i * 86400000)
      .toLocaleDateString(B.locale(), { weekday: 'short' }));
    const first = (new Date(y, mo, 1).getDay() + 6) % 7;
    const days = new Date(y, mo + 1, 0).getDate();
    const today = isoDay();
    const byDay = new Map();
    for (const d of dates) { if (!byDay.has(d.day)) byDay.set(d.day, []); byDay.get(d.day).push(d); }

    const cells = [];
    for (let i = 0; i < first; i++) cells.push('<div class="cal-cell off"></div>');
    for (let d = 1; d <= days; d++) {
      const iso = `${y}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const list = byDay.get(iso) || [];
      const dow = (first + d - 1) % 7;
      const shown = list.slice(0, 3);
      cells.push(`<div class="cal-cell ${iso === today ? 'today' : ''} ${iso < today ? 'past' : ''} ${dow >= 5 ? 'weekend' : ''}" data-day="${iso}">
        <div class="cal-cell-head"><span class="cal-day">${d}</span><span class="cal-plus" title="${tr('Ajouter')}">${icon('plus', 13)}</span></div>
        ${shown.map((x) => B.dateChip(x)).join('')}
        ${list.length > 3 ? `<button class="cal-more" data-more="${iso}">${tr('+{n} autres', { n: list.length - 3 })}</button>` : ''}
      </div>`);
    }
    while (cells.length % 7) cells.push('<div class="cal-cell off"></div>');
    grid.innerHTML = dows.map((x) => `<div class="cal-dow">${esc(x)}</div>`).join('') + cells.join('');
    $$('.cal-chip', grid).forEach((chip) => { chip.draggable = true; chip.title += ` · ${tr('glisser sur un autre jour pour changer la date')}`; });
    $('.upcoming', el).innerHTML = B.upcomingHtml(dates, { empty: tr('Rien de prévu. Cliquez sur un jour du calendrier pour ajouter un événement, une tâche ou une étape.') });
  }

  // navigation
  $('.cal-prev', el).onclick = () => { month.setMonth(month.getMonth() - 1); render(); };
  $('.cal-next', el).onclick = () => { month.setMonth(month.getMonth() + 1); render(); };
  $('.cal-today', el).onclick = () => { const n = new Date(); month.setFullYear(n.getFullYear(), n.getMonth(), 1); render(); };
  $('#cal-add', el).onclick = () => B.openAddOnDay(p.id, isoDay(), load, { eventsReady });

  // Glisser une pastille sur un autre jour = changer sa date (événement, échéance d'une tâche, étape)
  let dragging = null;
  grid.addEventListener('dragstart', (e) => {
    const chip = e.target.closest('.cal-chip');
    if (!chip) return;
    dragging = dates.find((x) => x.kind === chip.dataset.kind && x.id === chip.dataset.id) || null;
    if (!dragging) return;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragging.title);
    chip.classList.add('dragging');
    grid.classList.add('drag-on');
  });
  grid.addEventListener('dragend', () => {
    dragging = null;
    grid.classList.remove('drag-on');
    $$('.cal-cell.drop-here', grid).forEach((x) => x.classList.remove('drop-here'));
    $$('.cal-chip.dragging', grid).forEach((x) => x.classList.remove('dragging'));
  });
  grid.addEventListener('dragover', (e) => {
    const cell = e.target.closest('.cal-cell[data-day]');
    if (!dragging || !cell) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    $$('.cal-cell.drop-here', grid).forEach((x) => x !== cell && x.classList.remove('drop-here'));
    cell.classList.add('drop-here');
  });
  grid.addEventListener('drop', async (e) => {
    const cell = e.target.closest('.cal-cell[data-day]');
    const d = dragging;
    if (!d || !cell) return;
    e.preventDefault();
    const day = cell.dataset.day;
    if (day === d.day) return;
    const old = d.day;
    // Affichage immédiat, puis enregistrement (retour en arrière si le serveur refuse)
    d.day = day;
    if (d.raw) { if (d.kind === 'event') d.raw.day = day; else d.raw.due_date = day; }
    render();
    const q = d.kind === 'event' ? B.sb.from('events').update({ day }).eq('id', d.id)
      : d.kind === 'task' ? B.sb.from('tasks').update({ due_date: day }).eq('id', d.id)
        : B.sb.from('items').update({ due_date: day }).eq('id', d.id);
    const { error } = await q;
    if (error) {
      d.day = old;
      if (d.raw) { if (d.kind === 'event') d.raw.day = old; else d.raw.due_date = old; }
      render();
      return B.error(error);
    }
    B.toast(tr('« {title} » déplacé au {date}.', { title: esc(d.title), date: esc(dayLabel(day)) }), { type: 'success', timeout: 3000 });
    if (d.kind === 'task') B.loadProjects();
  });

  // clics : une pastille = l'ouvrir ; « +N autres » = la journée ; le reste d'une case = ajouter ce jour-là
  el.addEventListener('click', (e) => {
    const chip = e.target.closest('.cal-chip');
    if (chip) {
      const d = dates.find((x) => x.kind === chip.dataset.kind && x.id === chip.dataset.id);
      if (d) B.openDate(d, load);
      return;
    }
    const more = e.target.closest('[data-more]');
    if (more) {
      const day = more.dataset.more;
      const list = dates.filter((x) => x.day === day);
      const m = B.modal(`<h2>${esc(dayLabel(day))}</h2><div class="up-chips column">${list.map((x) => B.dateChip(x)).join('')}</div>
        <div class="actions"><button class="btn" id="day-add">${icon('plus', 14)} ${tr('Ajouter')}</button><span class="spacer"></span><button class="btn" data-close>${tr('Fermer')}</button></div>`);
      $('[data-close]', m).onclick = B.closeModal;
      $('#day-add', m).onclick = () => B.openAddOnDay(p.id, day, load, { eventsReady });
      $$('.cal-chip', m).forEach((c) => (c.onclick = () => {
        const d = list.find((x) => x.kind === c.dataset.kind && x.id === c.dataset.id);
        if (d) B.openDate(d, load);
      }));
      return;
    }
    const cell = e.target.closest('.cal-cell[data-day]');
    if (cell) B.openAddOnDay(p.id, cell.dataset.day, load, { eventsReady });
  });

  await load();
  const reload = debounce(load, 300);
  B.live('cal-events', 'events', `project_id=eq.${p.id}`, reload);
  B.live('cal-tasks', 'tasks', `project_id=eq.${p.id}`, reload);
  B.live('cal-items', 'items', `project_id=eq.${p.id}`, reload);
};
