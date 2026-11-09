// =====================================================================
// Tâches — vues Liste, Kanban (glisser-déposer) et Par personne (vision globale de l'équipe + une carte par membre).
// Les dates sont dans l'onglet Calendrier.
// =====================================================================

const STATUSES = [
  ['todo', 'À faire'],
  ['doing', 'En cours'],
  ['done', 'Terminé']
];

/** Fenêtre de création / modification d'une tâche */
B.openTask = (task, after) => {
  const isNew = !task.id;
  const members = B.projectMembers(task.project_id);
  const m = B.modal(`
    <h2>${isNew ? tr('Nouvelle tâche') : tr('Tâche')}</h2>
    <label>${tr('Titre')}</label><input id="tk-title" maxlength="200" value="${esc(task.title || '')}" placeholder="${tr('ex. Finaliser la maquette')}" />
    <label>${tr('Description')}</label><textarea id="tk-desc" rows="4" maxlength="5000">${esc(task.description || '')}</textarea>
    <div class="form-row">
      <div><label>${tr('Responsable')}</label><select id="tk-who"><option value="">${tr('— Personne —')}</option>
        ${members.map((p) => `<option value="${p.id}" ${p.id === task.assignee_id ? 'selected' : ''}>${esc(p.display_name)}</option>`).join('')}</select></div>
      <div><label>${tr('Échéance')}</label><input id="tk-due" type="date" value="${task.due_date || ''}" /></div>
      <div><label>${tr('Statut')}</label><select id="tk-status">${STATUSES.map(([v, l]) => `<option value="${v}" ${v === (task.status || 'todo') ? 'selected' : ''}>${tr(l)}</option>`).join('')}</select></div>
    </div>
    <div class="actions">
      ${isNew || !B.canDelete(task.project_id, task.created_by) ? '' : `<button class="btn danger-ghost" id="tk-del">${icon('trash', 15)} ${tr('Supprimer')}</button>`}
      <span class="spacer"></span>
      <button class="btn" data-close>${tr('Annuler')}</button><button class="btn primary" id="tk-save">${isNew ? tr('Créer') : tr('Enregistrer')}</button>
    </div>`);
  $('[data-close]', m).onclick = B.closeModal;
  $('#tk-save', m).onclick = async () => {
    const title = $('#tk-title', m).value.trim();
    if (!title) return;
    const assignee = $('#tk-who', m).value || null;
    const row = {
      project_id: task.project_id,
      title,
      description: $('#tk-desc', m).value.trim() || null,
      assignee_id: assignee,
      due_date: $('#tk-due', m).value || null,
      status: $('#tk-status', m).value
    };
    const q = isNew ? B.sb.from('tasks').insert(row) : B.sb.from('tasks').update(row).eq('id', task.id);
    const { error } = await q;
    if (error) return B.error(error);
    if (assignee && (isNew || assignee !== task.assignee_id)) {
      B.notify(assignee, { projectId: task.project_id, type: 'task', text: tr("{who} t'a confié la tâche « {title} » ({project})", { who: B.me.display_name, title, project: B.project(task.project_id)?.name }), link: `#/p/${task.project_id}/taches` });
    }
    B.closeModal();
    B.loadProjects();
    after?.();
  };
  $('#tk-del', m)?.addEventListener('click', async () => {
    if (!(await B.confirm(tr('Supprimer la tâche « {title} » ?', { title: task.title }), tr('Supprimer')))) return;
    try { await B.deleteRow('tasks', task.id); } catch (err) { return B.error(err); }
    B.loadProjects();
    after?.();
  });
};

B.pages.tasks = async (el, p) => {
  let view = store.get('tasks-view', 'kanban');
  if (!['list', 'people'].includes(view)) view = 'kanban'; // l'ancienne vue calendrier est devenue l'onglet Calendrier
  let tasks = [];
  // Filtre par personne (réglage de ce poste, par projet) : '' = tout le monde, 'none' = sans responsable
  let who = store.get(`tasks-who:${p.id}`, '');
  if (who && who !== 'none' && !B.projectMembers(p.id).some((m) => m.id === who)) who = '';

  el.innerHTML = `
    <div class="tasks">
      <div class="tasks-head">
        <h2>${esc(p.name)}</h2>
        <div class="seg">
          <button data-v="list">${icon('list', 15)} ${tr('Liste')}</button>
          <button data-v="kanban">${icon('kanban', 15)} ${tr('Kanban')}</button>
          <button data-v="people">${icon('users', 15)} ${tr('Par personne')}</button>
        </div>
        <button class="btn primary small" id="new-task">${icon('plus', 15)} ${tr('Tâche')}</button>
      </div>
      <div class="who-filter" role="group" aria-label="${tr('Filtrer par personne')}"></div>
      <div class="tasks-body"></div>
    </div>`;
  const body = $('.tasks-body', el);

  $$('.seg button', el).forEach((b) => (b.onclick = () => { view = b.dataset.v; store.set('tasks-view', view); render(); }));
  // Une nouvelle tâche créée pendant qu'on regarde les tâches de quelqu'un lui est confiée d'avance
  const draft = (status) => ({ project_id: p.id, status, ...(who && who !== 'none' ? { assignee_id: who } : {}) });
  $('#new-task', el).onclick = () => B.openTask(draft('todo'), load);
  $('.who-filter', el).addEventListener('click', (e) => {
    const b = e.target.closest('[data-who]');
    if (!b) return;
    who = b.dataset.who;
    store.set(`tasks-who:${p.id}`, who);
    render();
  });

  /** Puces « Tout le monde · Moi · chaque membre · Sans responsable », avec le nombre de tâches non terminées */
  function renderFilter() {
    const open = tasks.filter((x) => x.status !== 'done');
    const count = (fn) => open.filter(fn).length;
    const members = B.projectMembers(p.id).sort((a, b) => (a.id === B.me.id ? -1 : b.id === B.me.id ? 1 : a.display_name.localeCompare(b.display_name)));
    const chip = (id, label, n, extra = '') => `<button class="who-chip ${who === id ? 'on' : ''}" data-who="${id}">${extra}<span>${label}</span><small>${n}</small></button>`;
    $('.who-filter', el).innerHTML = chip('', tr('Tout le monde'), open.length)
      + members.map((m) => chip(m.id, m.id === B.me.id ? tr('Moi') : `<span translate="no">${esc(m.display_name)}</span>`, count((x) => x.assignee_id === m.id), avatar(m, 20))).join('')
      + chip('none', tr('Sans responsable'), count((x) => !x.assignee_id));
  }
  const isLate = (t) => t.due_date && t.status !== 'done' && t.due_date < new Date().toISOString().slice(0, 10);
  const shown = () => tasks.filter((x) => !who || (who === 'none' ? !x.assignee_id : x.assignee_id === who));

  async function load() {
    const { data, error } = await B.sb.from('tasks').select('*').eq('project_id', p.id).order('position');
    if (error) return B.error(error);
    tasks = data;
    render();
  }

  function card(t) {
    const who = t.assignee_id ? B.person(t.assignee_id) : null;
    const late = t.due_date && t.status !== 'done' && t.due_date < new Date().toISOString().slice(0, 10);
    return `<div class="task-card ${t.status}" draggable="true" data-id="${t.id}">
      <label class="tick"><input type="checkbox" ${t.status === 'done' ? 'checked' : ''} />${icon('check', 12)}</label>
      <span class="task-title">${esc(t.title)}</span>
      <span class="task-meta">
        ${t.due_date ? `<span class="due ${late ? 'late' : ''}">${icon('calendar', 12)} ${fmtDate(t.due_date)}</span>` : ''}
        ${who ? avatar(who, 22) : ''}
      </span>
    </div>`;
  }

  function render() {
    $$('.seg button', el).forEach((b) => b.classList.toggle('on', b.dataset.v === view));
    $('.who-filter', el).hidden = view === 'people'; // la vue Par personne montre déjà tout le monde
    if (view === 'people') return renderPeople();
    renderFilter();
    const tasks = shown();
    if (view === 'kanban') {
      body.innerHTML = `<div class="kanban">${STATUSES.map(([s, label]) => {
        const col = tasks.filter((t) => t.status === s);
        return `<div class="col col-${s}" data-status="${s}">
          <div class="col-head">${tr(label)} (${col.length})</div>
          <div class="col-cards">${col.map(card).join('')}</div>
          <button class="col-add" data-status="${s}">${icon('plus', 14)} ${tr('Ajouter')}</button>
        </div>`;
      }).join('')}</div>`;
      bindDnd();
    } else if (view === 'list') {
      body.innerHTML = tasks.length ? `<table class="task-table">
        <thead><tr><th></th><th>${tr('Tâche')}</th><th>${tr('Statut')}</th><th>${tr('Responsable')}</th><th>${tr('Échéance')}</th></tr></thead>
        <tbody>${tasks.map((t) => {
          const who = t.assignee_id ? B.person(t.assignee_id) : null;
          return `<tr data-id="${t.id}" class="${t.status}">
            <td><label class="tick"><input type="checkbox" ${t.status === 'done' ? 'checked' : ''} />${icon('check', 12)}</label></td>
            <td class="task-title">${esc(t.title)}</td>
            <td><span class="status s-${t.status}">${tr(STATUSES.find((x) => x[0] === t.status)[1])}</span></td>
            <td>${who ? `${avatar(who, 22)} ${esc(who.display_name)}` : '<span class="muted">—</span>'}</td>
            <td>${t.due_date ? fmtDate(t.due_date) : '<span class="muted">—</span>'}</td></tr>`;
        }).join('')}</tbody></table>`
        : `<div class="empty">${icon('checksq', 30)}<p>${who ? tr('Aucune tâche pour ce filtre.') : tr('Aucune tâche. Créez-en une, ou transformez une idée de « Notre projet ».')}</p></div>`;
    }
  }

  /** Vue Par personne : vision globale de l'équipe, puis une carte par membre (moi d'abord) et « Sans responsable » */
  function renderPeople() {
    const members = B.projectMembers(p.id).sort((a, b) => (a.id === B.me.id ? -1 : b.id === B.me.id ? 1 : a.display_name.localeCompare(b.display_name)));
    const groups = [
      ...members.map((m) => ({ person: m, list: tasks.filter((t) => t.assignee_id === m.id) })),
      // Tâches de personne ou d'un ancien membre : regroupées à la fin
      { person: null, list: tasks.filter((t) => !t.assignee_id || !members.some((m) => m.id === t.assignee_id)) }
    ].filter((g) => g.person || g.list.length);
    const count = (list, s) => list.filter((x) => x.status === s).length;
    const done = (n) => tr(n > 1 ? '{n} terminées' : '{n} terminée', { n });
    const pct = tasks.length ? Math.round((count(tasks, 'done') / tasks.length) * 100) : 0;
    const maxLoad = Math.max(1, ...groups.map((g) => g.list.length));
    const lateAll = tasks.filter(isLate).length;
    const order = (a, b) => (isLate(b) - isLate(a)) || ((b.status === 'doing') - (a.status === 'doing'))
      || (a.due_date || '9999').localeCompare(b.due_date || '9999');
    const name = (person) => person
      ? `<span translate="no">${esc(person.display_name)}</span>${person.id === B.me.id ? ` <span class="muted">${tr('(vous)')}</span>` : ''}`
      : tr('Sans responsable');

    const overview = `<section class="team-overview">
      <div class="to-head">
        <strong>${tr('Toute l\'équipe')}</strong>
        <span class="counts">
          <span>${tr('{n} à faire', { n: count(tasks, 'todo') })}</span>
          <span class="c-doing">${tr('{n} en cours', { n: count(tasks, 'doing') })}</span>
          ${lateAll ? `<span class="c-late">${tr('{n} en retard', { n: lateAll })}</span>` : ''}
          <span class="c-done">${done(count(tasks, 'done'))}</span>
        </span>
        <span class="to-pct">${tr('{n} % terminé', { n: pct })}</span>
      </div>
      <div class="to-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span style="width:${pct}%"></span></div>
      <div class="to-rows">${groups.map(({ person, list }) => {
        const w = (s) => (count(list, s) / maxLoad) * 100;
        const late = list.filter(isLate).length;
        return `<button class="to-row" data-who="${person ? person.id : 'none'}" title="${tr('Voir ses tâches')}">
          <span class="to-name">${person ? avatar(person, 22) : `<span class="avatar none sm">${icon('users', 12)}</span>`}<span>${name(person)}</span></span>
          <span class="to-bar"><span class="b-todo" style="width:${w('todo')}%"></span><span class="b-doing" style="width:${w('doing')}%"></span><span class="b-done" style="width:${w('done')}%"></span></span>
          <span class="to-num">${count(list, 'todo') + count(list, 'doing')}${late ? ` <span class="c-late">· ${tr('{n} en retard', { n: late })}</span>` : ''}</span>
        </button>`;
      }).join('')}</div>
      <p class="muted small to-legend"><i class="b-todo"></i>${tr('À faire')} <i class="b-doing"></i>${tr('En cours')} <i class="b-done"></i>${tr('Terminé')}</p>
    </section>`;

    body.innerHTML = overview + `<div class="people-board">${groups.map(({ person, list }) => {
      const open = list.filter((t) => t.status !== 'done').sort(order);
      const late = list.filter(isLate).length;
      return `<section class="person-tasks">
        <header>
          ${person ? avatar(person, 32) : `<span class="avatar none">${icon('users', 16)}</span>`}
          <div class="who"><strong>${name(person)}</strong>
            <span class="counts">
              <span>${tr('{n} à faire', { n: count(list, 'todo') })}</span>
              <span class="c-doing">${tr('{n} en cours', { n: count(list, 'doing') })}</span>
              ${late ? `<span class="c-late">${tr('{n} en retard', { n: late })}</span>` : ''}
              <span class="c-done">${done(count(list, 'done'))}</span>
            </span></div>
          <button class="icon-btn add-for" data-for="${person?.id || ''}" title="${tr('Nouvelle tâche')}">${icon('plus', 14)}</button>
        </header>
        ${open.length ? `<ul>${open.map((t) => `<li data-id="${t.id}" class="${t.status}">
            <label class="tick"><input type="checkbox" />${icon('check', 12)}</label>
            <span class="task-title">${esc(t.title)}</span>
            ${t.status === 'doing' ? `<span class="status s-doing">${tr('En cours')}</span>` : ''}
            ${t.due_date ? `<span class="due ${isLate(t) ? 'late' : ''}">${icon('calendar', 12)} ${fmtDate(t.due_date)}</span>` : ''}
          </li>`).join('')}</ul>`
          : `<p class="muted small">${tr('Rien en cours.')}</p>`}
      </section>`;
    }).join('')}</div>`;
  }

  // Clics : cocher, ouvrir, ajouter
  body.addEventListener('click', async (e) => {
    const add = e.target.closest('.col-add');
    if (add) return B.openTask(draft(add.dataset.status), load);
    // Vision globale : clic sur une personne = ses tâches en Kanban
    const row = e.target.closest('.to-row');
    if (row) { who = row.dataset.who; store.set(`tasks-who:${p.id}`, who); view = 'kanban'; store.set('tasks-view', view); return render(); }
    const addFor = e.target.closest('.add-for');
    if (addFor) return B.openTask({ project_id: p.id, status: 'todo', ...(addFor.dataset.for ? { assignee_id: addFor.dataset.for } : {}) }, load);
    const holder = e.target.closest('[data-id]');
    if (!holder) return;
    const t = tasks.find((x) => x.id === holder.dataset.id);
    if (e.target.matches('input[type=checkbox]')) {
      await setStatus(t, e.target.checked ? 'done' : 'todo');
      return;
    }
    if (!e.target.closest('.tick')) B.openTask(t, load);
  });

  async function setStatus(t, status, position) {
    const patch = { status };
    if (position !== undefined) patch.position = position;
    const { error } = await B.sb.from('tasks').update(patch).eq('id', t.id);
    if (error) return B.error(error);
    B.loadProjects();
    load();
  }

  // Glisser-déposer entre colonnes
  function bindDnd() {
    let dragged = null;
    $$('.task-card', body).forEach((c) => {
      c.addEventListener('dragstart', (e) => { dragged = c.dataset.id; c.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
      c.addEventListener('dragend', () => c.classList.remove('dragging'));
    });
    $$('.col', body).forEach((col) => {
      col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('over'); });
      col.addEventListener('dragleave', () => col.classList.remove('over'));
      col.addEventListener('drop', (e) => {
        e.preventDefault();
        col.classList.remove('over');
        const t = tasks.find((x) => x.id === dragged);
        if (!t) return;
        // position : on place la carte avant celle survolée, sinon en bas
        const cards = $$('.task-card', col).filter((c) => c.dataset.id !== dragged);
        const after = cards.find((c) => e.clientY < c.getBoundingClientRect().top + c.offsetHeight / 2);
        const pos = (id) => tasks.find((x) => x.id === id)?.position;
        let position;
        if (after) {
          const idx = cards.indexOf(after);
          const prev = idx > 0 ? pos(cards[idx - 1].dataset.id) : pos(after.dataset.id) - 1000;
          position = (prev + pos(after.dataset.id)) / 2;
        } else {
          position = cards.length ? pos(cards[cards.length - 1].dataset.id) + 1000 : Date.now() / 1000;
        }
        setStatus(t, col.dataset.status, position);
      });
    });
  }

  await load();
  B.live('tasks', 'tasks', `project_id=eq.${p.id}`, debounce(load, 300));
};
