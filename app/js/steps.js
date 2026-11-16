// =====================================================================
// steps.js — ce que partagent « Aujourd'hui » et « Camp de base » (refonte, livraison 2)
//   • dates dites simplement : « prévu hier », « dans 2 jours » (jamais « en retard » en rouge) ;
//   • « C'est fait » et « Reporter » (Demain · Lundi · Choisir une date) sur une tâche ;
//   • le chemin d'un projet : étapes franchies, dernière, prochaine ;
//   • les progrès récents (tâches terminées, lues dans l'activité) ;
//   • le réglage « Animations » de ce poste.
// Aucune donnée nouvelle en base : tout vient des tâches, des étapes et de l'activité.
// =====================================================================

/** Nombre de jours entre aujourd'hui et une date « AAAA-MM-JJ » (négatif = passé) */
B.daysUntil = (day) => Math.round((new Date(day + 'T00:00:00') - new Date(isoDay() + 'T00:00:00')) / 86400000);

/** « aujourd'hui », « demain », « dans 3 jours », « hier », « il y a 4 jours » */
B.daysText = (day) => {
  const n = B.daysUntil(day);
  if (n === 0) return tr("aujourd'hui");
  if (n === 1) return tr('demain');
  if (n === -1) return tr('hier');
  return n > 0 ? tr('dans {n} jours', { n }) : tr('il y a {n} jours', { n: -n });
};

/** « mardi 17 nov. » */
B.longDate = (day) => new Date(day + 'T00:00:00').toLocaleDateString(B.locale(), { weekday: 'long', day: 'numeric', month: 'short' });

/** Une date passée, dite sans reproche : « prévu hier », « prévu lundi », « prévu le 3 nov. » */
B.plannedText = (day) => {
  const n = B.daysUntil(day);
  if (n === -1) return tr('prévu hier');
  if (n < -1 && n >= -6) return tr('prévu {day}', { day: new Date(day + 'T00:00:00').toLocaleDateString(B.locale(), { weekday: 'long' }) });
  return tr('prévu le {date}', { date: fmtDate(day) });
};

/** La date d'une tâche : pastille ambre si elle est passée, sinon texte simple */
/**
 * Titre d'une tâche : « [P0-02 · Avant bêta] Activer les sauvegardes » → étiquette + titre.
 * L'étiquette est écrite par l'équipe entre crochets au début du titre ; rien n'est deviné ni raccourci.
 */
B.taskLabel = (title = '') => {
  const m = String(title).match(/^\[([^\]]{2,24})\]\s*(.+)$/);
  return m ? { code: m[1], title: m[2] } : { code: '', title: String(title) };
};
/** Étiquette en pastille (vide s'il n'y en a pas) */
B.taskCodeHtml = (title) => { const { code } = B.taskLabel(title); return code ? `<span class="t-code" translate="no">${esc(code)}</span>` : ''; };
/** Titre seul, sans l'étiquette */
B.taskTitleText = (title) => B.taskLabel(title).title;

B.dueHtml = (day) => {
  if (!day) return '';
  if (B.daysUntil(day) < 0) return `<span class="chip-late">${esc(B.plannedText(day))}</span>`;
  return `<span class="chip-date">${icon('calendar', 12)} ${B.daysUntil(day) <= 1 ? esc(B.daysText(day)) : esc(fmtDate(day))}</span>`;
};

/** Mes tâches dans l'ordre où les faire : date passée, aujourd'hui, en cours, cette semaine, plus tard */
B.orderMyTasks = (tasks) => {
  const g = B.groupMyTasks(tasks);
  return [...g.late, ...g.today, ...g.doing, ...g.week, ...g.later];
};

/** « C'est fait » : la tâche passe à Terminé, avec « Annuler » pendant quelques secondes */
B.completeTask = async (t, after) => {
  const before = t.status;
  const { error } = await B.sb.from('tasks').update({ status: 'done' }).eq('id', t.id);
  if (error) { B.error(error); return false; }
  B.toast(`${icon('check', 14)} ${tr('Tâche terminée : « {title} »', { title: esc(t.title) })}`, {
    type: 'success',
    actions: [[tr('Annuler'), '', async () => {
      await B.sb.from('tasks').update({ status: before }).eq('id', t.id);
      B.loadProjects(); after?.();
    }]]
  });
  B.loadProjects();
  after?.();
  return true;
};

/** « Reporter » : petit menu sous le bouton (Demain · Lundi · Choisir une date) */
B.snoozeTask = (t, anchor, after) => {
  const plus = (n) => isoDay(new Date(Date.now() + n * 86400000));
  const toMonday = ((8 - new Date().getDay()) % 7) || 7; // jours jusqu'au prochain lundi
  const choices = [[tr('Demain'), plus(1)]];
  if (toMonday > 1) choices.push([tr('Lundi'), plus(toMonday)]);
  const r = anchor.getBoundingClientRect();
  const m = B.popMenu(r.left, r.bottom + 6, `
    <div class="pop-title">${icon('calendar', 14)} ${tr('Reporter à…')}</div>
    ${choices.map(([label, day]) => `<button class="pop-item" data-day="${day}"><span>${esc(label)}</span><span class="pop-hint">${esc(fmtDate(day))}</span></button>`).join('')}
    <button class="pop-item" data-pick><span>${tr('Choisir une date')}</span></button>`);
  const move = async (day) => {
    const before = t.due_date || null;
    const { error } = await B.sb.from('tasks').update({ due_date: day }).eq('id', t.id);
    if (error) return B.error(error);
    B.toast(`${icon('calendar', 14)} ${tr('Reportée au {date} : « {title} »', { date: esc(B.longDate(day)), title: esc(t.title) })}`, {
      type: 'success',
      actions: [[tr('Annuler'), '', async () => { await B.sb.from('tasks').update({ due_date: before }).eq('id', t.id); after?.(); }]]
    });
    after?.();
  };
  $$('[data-day]', m).forEach((b) => (b.onclick = () => { B.closePopMenu(); move(b.dataset.day); }));
  $('[data-pick]', m).onclick = () => {
    B.closePopMenu();
    const w = B.modal(`
      <h2 class="t-mine">${tr('Reporter')}</h2>
      <p class="muted small" translate="no">${esc(t.title)}</p>
      <label for="sn-date">${tr('Nouvelle date')}</label><input id="sn-date" type="date" min="${plus(1)}" value="${plus(1)}" />
      <div class="actions"><button class="btn" data-close>${tr('Annuler')}</button><button class="btn primary" id="sn-go">${tr('Reporter')}</button></div>`);
    $('[data-close]', w).onclick = B.closeModal;
    $('#sn-go', w).onclick = () => { const day = $('#sn-date', w).value; if (!day) return; B.closeModal(); move(day); };
  };
  $('.pop-item', m)?.focus();
};

/**
 * Le chemin d'un projet à partir de ses étapes (items de type milestone) :
 * les étapes franchies d'abord, puis celles à venir, chacune dans l'ordre des dates.
 */
B.pathOf = (items) => {
  const byDate = (a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999') || String(a.created_at).localeCompare(String(b.created_at));
  const all = (items || []).filter((i) => i.type === 'milestone' && !i.archived_at);
  const reached = all.filter((s) => s.done).sort(byDate);
  const ahead = all.filter((s) => !s.done).sort(byDate);
  return { steps: [...reached, ...ahead], done: reached.length, total: all.length, last: reached[reached.length - 1] || null, next: ahead[0] || null };
};

/** Tâches terminées récemment (activité « Tâche terminée : … »), les plus récentes d'abord */
B.loadWins = async (projectIds, { days = null, limit = 200 } = {}) => {
  if (!projectIds.length) return [];
  const since = days ? new Date(Date.now() - days * 86400000).toISOString() : null;
  let q = B.sb.from('activity').select('*').in('project_id', projectIds).eq('icon', 'done');
  if (since) q = q.gte('created_at', since);
  const { data, error } = await q.order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return (data || [])
    .filter((a) => a.icon === 'done' && projectIds.includes(a.project_id) && (!since || a.created_at >= since))
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, limit)
    .map((a) => ({ ...a, title: a.text.includes(' : ') ? a.text.slice(a.text.indexOf(' : ') + 3) : a.text }));
};

/** Une ligne de progrès : coche verte, titre, qui (« vous » pour soi) et quand */
B.winRow = (a, { when = true } = {}) => {
  const who = a.actor_id ? (a.actor_id === B.me.id ? tr('vous') : esc(B.person(a.actor_id).display_name)) : '';
  const tail = [who, when ? timeAgo(a.created_at) : ''].filter(Boolean).join(', ');
  return `<li class="win"><span class="win-tick">${icon('check', 12)}</span><span><b translate="no">${esc(a.title)}</b>${tail ? ` <span class="muted">· ${tail}</span>` : ''}</span></li>`;
};

// ---------------------------------------------------------------------
// Animations (chemin qui se dessine, onde du point « Vous êtes ici ») : réglage de CE poste.
// Le réglage « réduire les animations » de l'appareil les coupe aussi (styles.css).
// ---------------------------------------------------------------------
B.animationsOn = () => store.get('animations', true) !== false;
B.setAnimations = (on) => {
  store.set('animations', Boolean(on));
  document.documentElement.classList.toggle('no-anim', !on);
};
document.documentElement.classList.toggle('no-anim', !B.animationsOn());

// ---------------------------------------------------------------------
// Bouton « Créer » (barre du haut ; « + » de la barre du bas sur téléphone) : tâche, projet, invitation, IA
// ---------------------------------------------------------------------
const openCreate = (e) => {
  const r = e.currentTarget.getBoundingClientRect();
  const below = r.bottom + 220 < innerHeight; // la barre du bas ouvre le menu au-dessus d'elle
  const m = B.popMenu(below ? r.right - 240 : r.left + r.width / 2 - 120, below ? r.bottom + 6 : r.top - 190, `
    <button class="pop-item" data-c="task">${icon('checksq', 16)}<span>${tr('Créer une tâche')}</span></button>
    <button class="pop-item" data-c="project">${icon('folder', 16)}<span>${tr('Nouveau projet')}</span></button>
    <button class="pop-item" data-c="invite">${icon('userplus', 16)}<span>${tr('Inviter un membre')}</span></button>
    <button class="pop-item" data-c="ai">${icon('bot', 16)}<span>${tr('Ajouter une IA')}</span></button>`);
  $$('[data-c]', m).forEach((b) => (b.onclick = async () => {
    const c = b.dataset.c;
    B.closePopMenu();
    if (c === 'project') return B.openNewProject();
    if (c === 'ai') return B.connectWizard();
    const here = B.lastProjectId && B.project(B.lastProjectId) ? B.lastProjectId : null; // dans un projet : c'est celui-là
    const pid = c === 'invite'
      ? (here && B.canInvite(here) ? here : await B.pickProject(tr('Inviter dans quel projet ?'), (p) => B.canInvite(p.id)))
      : (here || await B.pickProject(tr('Tâche pour quel projet ?')));
    if (!pid) return;
    if (c === 'invite') B.openInvite(pid);
    if (c === 'task') B.openTask({ project_id: pid, status: 'todo' }, () => (location.hash = `#/p/${pid}/taches`));
  }));
  $('.pop-item', m)?.focus();
};
$('#create-btn')?.addEventListener('click', openCreate);
$('#bottom-create')?.addEventListener('click', openCreate);
