// =====================================================================
// Tâches — vues Tableau (glisser-déposer), Liste, Calendrier et Par personne (vision globale de l'équipe + une carte par membre).
// Le Calendrier (calendar.js) est une vue de cet onglet depuis la refonte, livraison 3 : adresse …/taches/calendrier.
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

B.pages.tasks = async (el, p, sub) => {
  // Quatre vues : Tableau · Liste · Calendrier · Par personne. Le Calendrier a sa propre adresse
  // (…/taches/calendrier) : il vit dans calendar.js et s'abonne à d'autres tables.
  const onCalendar = sub === 'calendrier';
  // Téléphone : la Liste par défaut (les colonnes du Tableau s'empilent et deviennent très longues)
  const phone = B.isPhone();
  const viewKey = phone ? 'tasks-view-phone' : 'tasks-view';
  let view = onCalendar ? 'calendar' : store.get(viewKey, phone ? 'list' : 'kanban');
  if (!['list', 'people', 'calendar'].includes(view)) view = 'kanban';
  let tasks = [];
  // Filtre par personne (réglage de ce poste, par projet) : '' = tout le monde, 'none' = sans responsable
  let who = store.get(`tasks-who:${p.id}`, '');
  if (who && who !== 'none' && !B.projectMembers(p.id).some((m) => m.id === who)) who = '';

  el.innerHTML = `
    <div class="tasks">
      <div class="tasks-head">
        <h2>${esc(p.name)}</h2>
        <div class="seg">
          <button data-v="kanban">${icon('kanban', 15)} ${tr('Tableau')}</button>
          <button data-v="list">${icon('list', 15)} ${tr('Liste')}</button>
          <button data-v="calendar">${icon('calendar', 15)} ${tr('Calendrier')}</button>
          <button data-v="people">${icon('users', 15)} ${tr('Par personne')}</button>
        </div>
        <button class="btn primary small" id="new-task">${icon('plus', 15)} ${tr('Tâche')}</button>
        <div class="tasks-phone-bar">
          <label class="sr-only" for="view-select">${tr('Vue')}</label>
          <select id="view-select" class="pill-select">
            <option value="list">${tr('Liste')}</option><option value="kanban">${tr('Tableau')}</option>
            <option value="calendar">${tr('Calendrier')}</option><option value="people">${tr('Par personne')}</option>
          </select>
          <button class="btn small pill" id="who-toggle" aria-expanded="false">${icon('filter', 15)} <span id="who-label">${tr('Tout le monde')}</span></button>
        </div>
      </div>
      <div class="who-filter" role="group" aria-label="${tr('Filtrer par personne')}"></div>
      <div class="tasks-body"></div>
      <button class="fab" id="fab-task">${icon('plus', 20)} ${tr('Tâche')}</button>
    </div>`;
  const body = $('.tasks-body', el);

  const pickView = (v) => {
    if (v === 'calendar') return (location.hash = `#/p/${p.id}/taches/calendrier`);
    store.set(viewKey, v);
    if (onCalendar) return (location.hash = `#/p/${p.id}/taches`);
    view = v;
    render();
  };
  $$('.seg button', el).forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.v === view));
    b.onclick = () => pickView(b.dataset.v);
  });
  // Téléphone : la vue dans une liste déroulante, le filtre derrière un bouton
  $('#view-select', el).value = view;
  $('#view-select', el).onchange = (e) => pickView(e.target.value);
  $('#who-toggle', el).onclick = (e) => {
    const f = $('.who-filter', el);
    const open = !f.classList.contains('open');
    f.classList.toggle('open', open);
    e.currentTarget.setAttribute('aria-expanded', String(open));
  };
  $('#fab-task', el).onclick = () => $('#new-task', el).click();
  if (onCalendar) {
    $$('.seg button', el).forEach((b) => b.classList.toggle('on', b.dataset.v === 'calendar'));
    $('.who-filter', el).hidden = true;
    $('#new-task', el).onclick = () => B.openTask({ project_id: p.id, status: 'todo' }, () => B.route());
    body.classList.add('in-calendar');
    return B.pages.calendar(body, p);
  }
  // Une nouvelle tâche créée pendant qu'on regarde les tâches de quelqu'un lui est confiée d'avance
  const draft = (status) => ({ project_id: p.id, status, ...(who && who !== 'none' ? { assignee_id: who } : {}) });
  $('#new-task', el).onclick = () => B.openTask(draft('todo'), load);
  $('.who-filter', el).addEventListener('click', (e) => {
    const b = e.target.closest('[data-who]');
    if (!b) return;
    who = b.dataset.who;
    store.set(`tasks-who:${p.id}`, who);
    $('.who-filter', el).classList.remove('open');
    $('#who-toggle', el).setAttribute('aria-expanded', 'false');
    render();
  });

  /** Puces « Tout le monde · Moi · chaque membre · Sans responsable », avec le nombre de tâches non terminées */
  function renderFilter() {
    const open = tasks.filter((x) => x.status !== 'done');
    const count = (fn) => open.filter(fn).length;
    const members = B.projectMembers(p.id).sort((a, b) => (a.id === B.me.id ? -1 : b.id === B.me.id ? 1 : a.display_name.localeCompare(b.display_name)));
    const chip = (id, label, n, extra = '') => `<button class="who-chip ${who === id ? 'on' : ''}" data-who="${id}">${extra}<span>${label}</span><small>${n}</small></button>`;
    const mine = members.find((m) => m.id === who);
    $('#who-label', el).innerHTML = !who ? tr('Tout le monde') : who === 'none' ? tr('Sans responsable')
      : who === B.me.id ? tr('Moi') : `<span translate="no">${esc(mine?.display_name || '')}</span>`;
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
      <label class="tick"><input type="checkbox" aria-label="${tr('Marquer comme terminée')}" ${t.status === 'done' ? 'checked' : ''} />${icon('check', 12)}</label>
      <span class="task-title">${esc(t.title)}</span>
      <span class="task-meta">
        ${t.due_date ? `<span class="due ${late ? 'late' : ''}">${icon('calendar', 12)} ${fmtDate(t.due_date)}</span>` : ''}
        ${who ? avatar(who, 22) : ''}
      </span>
    </div>`;
  }

  function render() {
    $$('.seg button', el).forEach((b) => { b.classList.toggle('on', b.dataset.v === view); b.setAttribute('aria-pressed', String(b.dataset.v === view)); });
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
    } else if (view === 'list' && phone) {
      body.innerHTML = tasks.length ? phoneList(tasks)
        : `<div class="empty">${icon('checksq', 30)}<p>${who ? tr('Aucune tâche pour ce filtre.') : tr('Aucune tâche. Créez-en une, ou transformez une idée de « Camp de base ».')}</p></div>`;
    } else if (view === 'list') {
      body.innerHTML = tasks.length ? `<table class="task-table">
        <thead><tr><th></th><th>${tr('Tâche')}</th><th>${tr('Statut')}</th><th>${tr('Responsable')}</th><th>${tr('Échéance')}</th></tr></thead>
        <tbody>${tasks.map((t) => {
          const who = t.assignee_id ? B.person(t.assignee_id) : null;
          return `<tr data-id="${t.id}" class="${t.status}">
            <td><label class="tick"><input type="checkbox" aria-label="${tr('Marquer comme terminée')}" ${t.status === 'done' ? 'checked' : ''} />${icon('check', 12)}</label></td>
            <td class="task-title">${esc(t.title)}</td>
            <td><span class="status s-${t.status}">${tr(STATUSES.find((x) => x[0] === t.status)[1])}</span></td>
            <td>${who ? `${avatar(who, 22)} ${esc(who.display_name)}` : '<span class="muted">—</span>'}</td>
            <td>${t.due_date ? fmtDate(t.due_date) : '<span class="muted">—</span>'}</td></tr>`;
        }).join('')}</tbody></table>`
        : `<div class="empty">${icon('checksq', 30)}<p>${who ? tr('Aucune tâche pour ce filtre.') : tr('Aucune tâche. Créez-en une, ou transformez une idée de « Camp de base ».')}</p></div>`;
    }
  }

  /** Téléphone : une liste groupée. « À vous » d'abord, puis À faire ; En cours et Terminé repliés.
   *  Une ligne par tâche : rond à cocher, titre (code « P0-05 » mis en petite étiquette), date si besoin, responsable. */
  function phoneList(list) {
    const row = (t) => {
      const m = t.title.match(/^\[([^\]]{2,24})\]\s*(.*)$/);
      const code = m ? m[1].split('·')[0].trim() : '';
      const title = m ? m[2] : t.title;
      const whoP = t.assignee_id && t.assignee_id !== B.me.id ? B.person(t.assignee_id) : null;
      return `<div class="t-row ${t.status}" data-id="${t.id}">
        <label class="tick"><input type="checkbox" aria-label="${tr('Marquer comme terminée')}" ${t.status === 'done' ? 'checked' : ''} />${icon('check', 12)}</label>
        <button class="t-title task-title">${code ? `<span class="t-code" translate="no">${esc(code)}</span>` : ''}<span translate="no">${esc(title)}</span></button>
        ${t.due_date && t.status !== 'done' ? B.dueHtml(t.due_date) : ''}${whoP ? avatar(whoP, 24) : ''}</div>`;
    };
    const mine = list.filter((t) => t.assignee_id === B.me.id && t.status !== 'done');
    const todo = list.filter((t) => t.status === 'todo' && t.assignee_id !== B.me.id);
    const doing = list.filter((t) => t.status === 'doing' && t.assignee_id !== B.me.id);
    const done = list.filter((t) => t.status === 'done');
    const block = (title, arr, cls = '') => arr.length ? `<section class="t-block ${cls}"><h3>${title} <small>${arr.length}</small></h3>${arr.map(row).join('')}</section>` : '';
    const fold = (title, arr) => arr.length ? `<details class="t-block fold"><summary>${title} <small>${arr.length}</small></summary>${arr.map(row).join('')}</details>` : '';
    return block(tr('À vous'), B.orderMyTasks(mine), 'mine') + block(tr('À faire'), todo) + fold(tr('En cours'), doing) + fold(tr('Terminé'), done);
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
            <label class="tick"><input type="checkbox" aria-label="${tr('Marquer comme terminée')}" />${icon('check', 12)}</label>
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
    if (row) { who = row.dataset.who; store.set(`tasks-who:${p.id}`, who); view = 'kanban'; store.set(viewKey, view); return render(); }
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
