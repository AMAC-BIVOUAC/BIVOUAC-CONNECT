// =====================================================================
// Accueil — le camp de base : actions rapides, mes projets, à venir
// (l'activité récente est dans chaque projet, onglet « Notre projet »)
// =====================================================================

B.pages.home = async (view) => {
  const hour = new Date().getHours();
  const hello = hour < 5 || hour >= 18 ? tr('Bonsoir') : tr('Bonjour');
  view.innerHTML = `
    <div class="page home">
      <section class="hero">
        <img src="assets/banner.svg" alt="" />
        <div class="hero-text">
          <h1>${tr('{hello} {name} ! 👋', { hello, name: esc(B.me.display_name) })}</h1>
          <p>${tr('Bienvenue sur votre camp de base.')}</p>
        </div>
      </section>

      <section class="quick" data-tour="quick">
        <button class="quick-card" data-q="project">${icon('folder', 26)}<span>${tr('Nouveau projet')}</span></button>
        <button class="quick-card" data-q="invite">${icon('userplus', 26)}<span>${tr('Inviter un membre')}</span></button>
        <button class="quick-card" data-q="ai">${icon('bot', 26)}<span>${tr('Ajouter une IA')}</span></button>
        <button class="quick-card" data-q="task">${icon('checksq', 26)}<span>${tr('Créer une tâche')}</span></button>
      </section>

      <div class="home-grid">
        <div class="home-col">
        <section class="card">
          <div class="card-head"><h2>${tr('Mes projets')}</h2><a href="#/projects" class="link">${tr('Voir tout')} ${icon('arrow', 14)}</a></div>
          <div id="home-projects"></div>
        </section>
        <section class="card">
          <div class="card-head"><h2>${icon('checksq', 18)} ${tr('Mes tâches')}</h2>
            <button class="link hidden" data-mytasks-all></button></div>
          <div id="home-mytasks" class="mytasks"><div class="loading">${tr('Chargement…')}</div></div>
        </section>
        </div>
        <section class="card">
          <div class="card-head"><h2>${icon('calendar', 18)} ${tr('À venir cette semaine')}</h2></div>
          <div id="home-upcoming" class="upcoming"><div class="loading">${tr('Chargement…')}</div></div>
        </section>
      </div>
    </div>`;

  // Actions rapides
  $$('.quick-card', view).forEach((b) => (b.onclick = async () => {
    const q = b.dataset.q;
    if (q === 'project') return B.openNewProject();
    if (q === 'ai') return B.connectWizard();
    const pid = q === 'invite'
      ? await B.pickProject(tr('Inviter dans quel projet ?'), (p) => B.canInvite(p.id))
      : await B.pickProject(tr('Tâche pour quel projet ?'));
    if (!pid) return;
    if (q === 'invite') B.openInvite(pid);
    if (q === 'task') B.openTask({ project_id: pid, status: 'todo' }, () => (location.hash = `#/p/${pid}/taches`));
  }));

  // Mes tâches (tous projets)
  const reloadMyTasks = B.myTasksCard($('#home-mytasks', view));
  $('[data-mytasks-all]', view).onclick = () => B.openMyTasks(reloadMyTasks);

  // Mes projets avec avancement
  const renderProjects = () => {
    const box = $('#home-projects', view);
    if (!box) return;
    box.innerHTML = B.projects.length
      ? B.projects.slice(0, 6).map((p) => `
        <a class="proj-row" href="#/p/${p.id}">
          <span class="proj-sq" style="background:${esc(p.color)}"></span>
          <span class="proj-name">${esc(p.name)} <span class="unread-badge hidden" data-unread="project:${p.id}"></span></span>
          <span class="proj-members">${icon('users', 15)} ${p.memberCount}</span>
          <span class="bar"><span style="width:${p.progress}%;background:${esc(p.color)}"></span></span>
          <span class="proj-pct">${p.progress} %</span>
        </a>`).join('')
      : `<div class="empty">${icon('compass', 30)}<p>${tr("Pas encore de projet.<br>Créez votre premier espace ou rejoignez celui d'un ami avec son code.")}</p>
          <button class="btn primary" id="first-project">${icon('plus', 16)} ${tr('Créer un projet')}</button></div>`;
    $('#first-project', view)?.addEventListener('click', B.openNewProject);
    B.paintUnread(box);
  };
  renderProjects();
  B.onLeave(B.on('projects', renderProjects));

  // À venir : les 7 prochains jours, tous projets confondus (+ tâches en retard)
  const loadUpcoming = async () => {
    const box = $('#home-upcoming', view);
    if (!box || !B.projects.length) { if (box) box.innerHTML = `<p class="muted small">${tr('Rien de prévu pour le moment.')}</p>`; return; }
    try {
      const { dates } = await B.loadDates(B.projects.map((p) => p.id), { to: isoDay(new Date(Date.now() + 7 * 86400000)) });
      box.innerHTML = B.upcomingHtml(dates, { showProject: true, empty: tr('Rien de prévu cette semaine.') });
      paintIcons(box);
      $$('.cal-chip', box).forEach((c) => (c.onclick = () => {
        const d = dates.find((x) => x.kind === c.dataset.kind && x.id === c.dataset.id);
        if (d) B.openDate(d, loadUpcoming);
      }));
    } catch (err) { box.innerHTML = ''; console.warn(err); }
  };
  loadUpcoming();
  B.onLeave(B.on('projects', debounce(loadUpcoming, 300)));

};
