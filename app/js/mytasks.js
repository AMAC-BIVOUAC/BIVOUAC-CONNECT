// =====================================================================
// mytasks.js — « Mes tâches » sur tous les projets, et « Mes tâches du jour »
//
//   • carte « Mes tâches » sur l'accueil (les plus urgentes + « Voir tout ») ;
//   • fenêtre « Mes tâches du jour » à l'ouverture de l'app : UNE fois par jour,
//     seulement s'il y a quelque chose (en retard, pour aujourd'hui, en cours),
//     refermable, avec « Ne plus afficher » (réactivable dans Paramètres).
// On coche « terminé » directement dedans, avec « Annuler » au cas où.
// Pas de nouvel onglet : tout passe par l'accueil et une fenêtre.
// =====================================================================

/** Mes tâches pas encore terminées, tous projets confondus */
B.loadMyTasks = async () => {
  const { data, error } = await B.sb.from('tasks').select('*')
    .eq('assignee_id', B.me.id).neq('status', 'done')
    .order('due_date', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data || []).filter((t) => B.project(t.project_id));
};

/** Range les tâches : en retard, aujourd'hui, en cours, cette semaine, plus tard / sans date */
B.groupMyTasks = (tasks) => {
  const today = isoDay();
  const week = isoDay(new Date(Date.now() + 7 * 86400000));
  const g = { late: [], today: [], doing: [], week: [], later: [] };
  for (const t of tasks) {
    if (t.due_date && t.due_date < today) g.late.push(t);
    else if (t.due_date === today) g.today.push(t);
    else if (t.status === 'doing') g.doing.push(t);
    else if (t.due_date && t.due_date <= week) g.week.push(t);
    else g.later.push(t);
  }
  return g;
};

const MYTASK_GROUPS = [
  ['late', 'En retard'],
  ['today', "Pour aujourd'hui"],
  ['doing', 'En cours'],
  ['week', 'Cette semaine'],
  ['later', 'Plus tard']
];

/** Une ligne de tâche : case à cocher, titre, projet, échéance */
function myTaskRow(t, group) {
  const p = B.project(t.project_id);
  const due = t.due_date
    ? `<span class="due ${group === 'late' ? 'late' : ''}">${icon('calendar', 12)} ${group === 'today' ? tr("aujourd'hui") : fmtDate(t.due_date)}</span>` : '';
  return `<div class="mytask" data-id="${t.id}">
    <label class="tick" title="${tr('Marquer comme terminée')}"><input type="checkbox" />${icon('check', 12)}</label>
    <button class="mytask-title" translate="no">${esc(t.title)}</button>
    ${t.status === 'doing' ? `<span class="status s-doing">${tr('En cours')}</span>` : ''}
    ${due}
    <span class="mytask-proj" title="${esc(p?.name || '')}"><i style="background:${esc(p?.color || '#12809A')}"></i><span translate="no">${esc(p?.name || '')}</span></span>
  </div>`;
}

/** Liste groupée (accueil, fenêtre « Voir tout », fenêtre du jour) */
function myTasksHtml(groups, { only = null, limit = null } = {}) {
  let left = limit ?? Infinity;
  let html = '';
  for (const [key, label] of MYTASK_GROUPS) {
    if (only && !only.includes(key)) continue;
    const list = groups[key].slice(0, Math.max(0, left));
    left -= list.length;
    if (!list.length) continue;
    html += `<div class="mytask-group ${key}"><div class="mytask-label">${tr(label)} <span>${groups[key].length}</span></div>
      ${list.map((t) => myTaskRow(t, key)).join('')}</div>`;
  }
  return html;
}

/** Branche les clics d'une liste de tâches : cocher = terminé (avec Annuler), titre = ouvrir */
function bindMyTasks(box, getTasks, reload) {
  box.addEventListener('click', async (e) => {
    const row = e.target.closest('.mytask');
    if (!row) return;
    const t = getTasks().find((x) => x.id === row.dataset.id);
    if (!t) return;
    if (e.target.matches('input[type=checkbox]')) {
      const before = t.status;
      row.classList.add('done');
      const { error } = await B.sb.from('tasks').update({ status: 'done' }).eq('id', t.id);
      if (error) { row.classList.remove('done'); e.target.checked = false; return B.error(error); }
      B.toast(`${icon('check', 14)} ${tr('Tâche terminée : « {title} »', { title: esc(t.title) })}`, {
        type: 'success',
        actions: [[tr('Annuler'), '', async () => {
          await B.sb.from('tasks').update({ status: before }).eq('id', t.id);
          B.loadProjects(); reload?.();
        }]]
      });
      setTimeout(() => { B.loadProjects(); reload?.(); }, 450);
      return;
    }
    if (e.target.closest('.mytask-title')) B.openTask(t, reload);
  });
}

/** Fenêtre « Mes tâches » : toute la liste */
B.openMyTasks = async (after) => {
  const tasks = await B.loadMyTasks().catch((err) => { B.error(err); return null; });
  if (!tasks) return;
  const m = B.modal(`
    <h2>${icon('checksq', 20)} ${tr('Mes tâches')}</h2>
    <p class="muted small">${tr('Les tâches qui vous sont confiées, dans tous vos projets.')}</p>
    <div class="mytasks">${myTasksHtml(B.groupMyTasks(tasks)) || `<p class="muted">${tr('Aucune tâche ne vous est confiée pour le moment.')}</p>`}</div>
    <div class="actions"><span class="spacer"></span><button class="btn" data-close>${tr('Fermer')}</button></div>`, { wide: true });
  $('[data-close]', m).onclick = B.closeModal;
  bindMyTasks($('.mytasks', m), () => tasks, () => { B.closeModal(); after?.(); B.openMyTasks(after); });
};

// ---------------------------------------------------------------------
// Fenêtre « Mes tâches du jour », à l'ouverture de l'app
// ---------------------------------------------------------------------

B.todayTasksEnabled = () => store.get('today-tasks', true) !== false;
B.setTodayTasksEnabled = (on) => store.set('today-tasks', Boolean(on));

/** À l'ouverture : une fois par jour, seulement s'il y a des tâches urgentes */
B.showTodayTasks = async ({ force = false } = {}) => {
  if (!force && (!B.todayTasksEnabled() || store.get('today-tasks-day') === isoDay())) return;
  let tasks;
  try { tasks = await B.loadMyTasks(); } catch (err) { return console.warn('Mes tâches du jour', err); }
  const g = B.groupMyTasks(tasks);
  const urgent = g.late.length + g.today.length + g.doing.length;
  if (!urgent && !force) return; // rien d'urgent : on ne dérange pas
  if (!$('#modal-backdrop').classList.contains('hidden')) return; // une autre fenêtre est ouverte
  store.set('today-tasks-day', isoDay());

  const dateText = new Date().toLocaleDateString(B.locale(), { weekday: 'long', day: 'numeric', month: 'long' });
  const m = B.modal(`
    <div class="today-head">
      <span class="today-ico">${icon('checksq', 24)}</span>
      <div><h2>${tr('Mes tâches du jour')}</h2><p class="muted small today-date">${esc(dateText)}</p></div>
    </div>
    <div class="mytasks">${myTasksHtml(g, { only: ['late', 'today', 'doing'] }) || `<p class="muted">${tr("Rien d'urgent aujourd'hui.")}</p>`}</div>
    <div class="actions">
      <label class="check small"><input type="checkbox" id="today-off" /> ${tr('Ne plus afficher à l’ouverture')}</label>
      <span class="spacer"></span>
      <button class="btn primary" data-close>${tr("C'est parti")}</button>
    </div>`, { wide: true });
  $('[data-close]', m).onclick = () => {
    if ($('#today-off', m).checked) {
      B.setTodayTasksEnabled(false);
      B.toast(esc(tr('Vous pouvez la réactiver dans Paramètres → Accompagnement.')), { timeout: 6000 });
    }
    B.closeModal();
  };
  bindMyTasks($('.mytasks', m), () => tasks, null);
};

// ---------------------------------------------------------------------
// Carte « Mes tâches » de l'accueil
// ---------------------------------------------------------------------

B.myTasksCard = (box) => {
  let tasks = [];
  const load = async () => {
    if (!box.isConnected) return;
    try { tasks = await B.loadMyTasks(); } catch (err) { box.innerHTML = ''; return console.warn(err); }
    const g = B.groupMyTasks(tasks);
    const head = box.closest('.card')?.querySelector('[data-mytasks-all]');
    if (head) head.classList.toggle('hidden', tasks.length <= 5);
    if (head) head.innerHTML = `${tr('Voir tout ({n})', { n: tasks.length })} ${icon('arrow', 14)}`;
    box.innerHTML = myTasksHtml(g, { limit: 5 })
      || `<p class="muted small">${tr('Aucune tâche ne vous est confiée. Dans un projet, attribuez-vous une tâche pour la retrouver ici.')}</p>`;
    paintIcons(box);
  };
  bindMyTasks(box, () => tasks, load);
  load();
  B.live('home-mytasks', 'tasks', `assignee_id=eq.${B.me.id}`, debounce(load, 400));
  return load;
};
