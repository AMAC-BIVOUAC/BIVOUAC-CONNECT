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
  B.emit('animations', Boolean(on)); // l'ambiance d'Aujourd'hui arrête ou relance ses mouvements (ambiance.js)
};
document.documentElement.classList.toggle('no-anim', !B.animationsOn());

// ---------------------------------------------------------------------
// Bouton « + » (barre du haut, ordinateur ET téléphone ; v0.8.86, Apo) : le bouton du coin, avant d'entrer dans les menus.
// Note rapide, Nouveau projet, Inviter quelqu'un (un projet ou « Faire découvrir Bivouac »), Ajouter une IA.
// Une tâche se crée là où elle vit (Tâches, Camp de base) ou à partir d'une note.
// ---------------------------------------------------------------------
const openCreate = (e) => {
  const r = e.currentTarget.getBoundingClientRect();
  const below = r.bottom + 220 < innerHeight;
  const m = B.popMenu(below ? r.right - 250 : r.left + r.width / 2 - 125, below ? r.bottom + 6 : r.top - 200, `
    <button class="pop-item" data-c="note">${icon('edit', 16)}<span>${tr('Note rapide')}</span></button>
    <button class="pop-item" data-c="project">${icon('folder', 16)}<span>${tr('Nouveau projet')}</span></button>
    <button class="pop-item" data-c="invite">${icon('userplus', 16)}<span>${tr('Inviter quelqu’un')}</span></button>
    <button class="pop-item" data-c="ai">${icon('bot', 16)}<span>${tr('Ajouter une IA')}</span></button>`);
  m.classList.add('create-menu');
  $$('[data-c]', m).forEach((b) => (b.onclick = () => {
    const c = b.dataset.c;
    B.closePopMenu();
    if (c === 'note') return B.quickNote();
    if (c === 'project') return B.openNewProject();
    if (c === 'ai') return B.connectWizard();
    const here = B.lastProjectId && B.project(B.lastProjectId) && /^#\/p\//.test(location.hash) ? B.lastProjectId : null;
    return B.openInvite(null, { preselect: here });
  }));
  $('.pop-item', m)?.focus();
};
B.openCreate = openCreate;
$('#create-btn')?.addEventListener('click', openCreate);

// ---------------------------------------------------------------------
// Paysage de fond (22/11, Amaury) : la montée vers le sommet, dans les couleurs du Camp de base (jetons --land-*).
//   animated = true  : « Les prochains pas » (Aujourd'hui) ; boucle de 5 minutes : le soleil se lève et se couche,
//                      les nuages passent, un petit marcheur orange part du camp, s'arrête à la tente du milieu
//                      et arrive au drapeau du sommet.
//   animated = false : fond calme en bas de la page « Le chemin ».
// Purement décoratif (aria-hidden) ; « Animations » coupé (.no-anim) ou « réduire les animations » : image fixe.
// ---------------------------------------------------------------------
B.sceneSvg = (animated = false) => `<svg class="scene-svg ${animated ? 'sc-anim' : 'sc-still'}" viewBox="0 0 1200 200" preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false">
  <g class="sc-sun"><circle class="l-sun sc-glow" r="90"/><circle class="l-sun" r="30"/></g>
  <g class="sc-cloud"><ellipse class="sc-cloud-a" cx="0" cy="0" rx="46" ry="12"/><ellipse class="sc-cloud-a" cx="28" cy="-8" rx="26" ry="11"/></g>
  <g class="sc-cloud two"><ellipse class="sc-cloud-a" cx="0" cy="0" rx="34" ry="9"/><ellipse class="sc-cloud-a" cx="-18" cy="-6" rx="20" ry="9"/></g>
  <path class="l-far" d="M0,120 L90,98 L170,112 L260,84 L350,106 L450,76 L540,100 L640,70 L720,94 L800,66 L880,92 L960,64 L1040,88 L1120,70 L1200,84 V200 H0 Z"/>
  <path class="l-mid" d="M0,152 L110,124 L200,140 L300,114 L410,138 L520,110 L620,134 L700,106 L790,128 L860,112 V200 H0 Z"/>
  <path class="sc-peak" d="M860,200 L960,82 L985,94 L1000,30 L1040,88 L1065,76 L1100,96 L1200,120 V200 Z"/>
  <path class="l-snow" d="M1000,30 L1016,52 L1008,48 L1001,56 L994,49 L987,52 Z"/>
  <path class="sc-hill" d="M0,200 L0,180 C140,176 240,168 330,164 S480,146 570,138 S730,122 820,114 C860,110 885,130 905,200 Z"/>
  <path class="l-dots" d="M60,186 L180,176 L320,170 L440,150 L560,130 L680,120 L780,96 L870,78 L950,56 L1000,36"/>
  <g transform="translate(140 180)"><path class="l-tent" d="M-13,3 L0,-16 L13,3 Z"/><path class="l-tent-door" d="M0,-8 L-4.5,3 L4.5,3 Z"/></g>
  <g transform="translate(560 132)"><path class="l-tent" d="M-10,3 L0,-13 L10,3 Z"/><path class="l-tent-door" d="M0,-6 L-3.5,3 L3.5,3 Z"/></g>
  ${[[90, 196, 1], [108, 195, .8], [400, 182, .9], [720, 160, .8], [760, 156, .7]].map(([x, y, s]) => `<path class="l-tree" d="M${x},${y - 24 * s} l${7 * s},${24 * s} h${-14 * s} z"/>`).join('')}
  <g transform="translate(1000 34)"><path class="l-flag sc-flag" d="M0,0 v-24 M0,-24 l18,6 l-18,6"/></g>
  ${animated ? '<g class="sc-walker"><circle class="sc-walker-halo" r="15"/><circle class="l-here-dot" r="8"/></g>' : ''}
</svg>`;
