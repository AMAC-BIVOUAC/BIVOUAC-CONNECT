// =====================================================================
// Mes projets — la liste de tous les espaces
// =====================================================================

B.pages.projects = async (view) => {
  const render = () => {
    view.innerHTML = `
      <div class="page">
        <div class="page-head">
          <div><h1>${tr('Mes projets')}</h1><p class="muted">${tr(B.projects.length > 1 ? '{n} espaces' : '{n} espace', { n: B.projects.length })}</p></div>
          <button class="btn primary" id="np">${icon('plus', 16)} ${tr('Nouvel espace')}</button>
        </div>
        <div class="proj-grid">
          ${B.projects.map((p) => `
            <a class="proj-card" href="#/p/${p.id}" style="--c:${esc(p.color)}">
              <div class="proj-card-top"><span class="proj-sq" style="background:${esc(p.color)}"></span><h3>${esc(p.name)}</h3></div>
              <p>${p.description ? esc(p.description) : tr('Pas de description')}</p>
              <div class="proj-meta">
                <span>${icon('users', 15)} ${tr(p.memberCount > 1 ? '{n} humains' : '{n} humain', { n: p.memberCount })} · ${tr('{n} IA', { n: p.aiCount })}</span>
                <span>${icon('checksq', 15)} ${tr(p.taskCount > 1 ? '{n} tâches' : '{n} tâche', { n: p.taskCount })}</span>
              </div>
              <div class="bar"><span style="width:${p.progress}%;background:${esc(p.color)}"></span></div>
              <small class="muted">${tr('{n} % des tâches terminées', { n: p.progress })}</small>
            </a>`).join('')}
          <button class="proj-card add" id="np2">${icon('plus', 28)}<span>${tr('Créer ou rejoindre un espace')}</span></button>
        </div>
      </div>`;
    $('#np', view).onclick = B.openNewProject;
    $('#np2', view).onclick = B.openNewProject;
  };
  render();
  B.onLeave(B.on('projects', render));
};
