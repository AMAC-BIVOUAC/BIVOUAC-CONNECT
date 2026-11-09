// =====================================================================
// Équipe — les humains du projet et leurs IA, réglages du projet
// =====================================================================

B.pages.team = async (el, p) => {
  const members = B.projectMembers(p.id);
  const ais = members.flatMap((m) => aisOf(m).map((x) => ({ ...x, owner: m })));
  const isOwner = p.owner_id === B.me.id;
  const roles = ROLE_LABEL();
  // Statut de chacun ; le Créateur peut le changer (Administrateur / Membre)
  const roleCell = (m) => {
    if (isOwner && m.role !== 'owner') {
      return `<select class="role-select" data-user="${m.id}" title="${tr('Changer le statut')}">
        <option value="admin" ${m.role === 'admin' ? 'selected' : ''}>${roles.admin}</option>
        <option value="member" ${m.role === 'member' ? 'selected' : ''}>${roles.member}</option></select>`;
    }
    return `<span class="role-badge ${m.role}">${roles[m.role] || roles.member}</span>`;
  };

  el.innerHTML = `
    <div class="team">
      <section class="card">
        <div class="card-head"><h2>${tr('Équipe du projet')} (${members.length + ais.length})</h2>
          ${B.canInvite(p.id) ? `<button class="btn small navy" id="t-invite">${icon('plus', 14)} ${tr('Inviter')}</button>` : ''}</div>
        <div class="team-list">
          ${members.map((m) => `
            <div class="team-row"><span class="presence ${B.isOnline(m.id) ? '' : 'off'}" data-online="${m.id}" title="${B.isOnline(m.id) ? tr('Connecté') : tr('Hors ligne')}"></span>${m.id === B.me.id ? avatar(m, 36)
              : `<a href="#/messages/${m.id}" title="${esc(tr('Écrire à {name}', { name: m.display_name }))}">${B.dmAvatar ? B.dmAvatar(m, 36, { presence: false }) : avatar(m, 36)}</a>`}
              <span class="team-name">${esc(m.display_name)}<small>@${esc(m.handle)}</small></span>
              <span class="tag human">${tr('Humain')}</span>
              <span class="team-role">${m.title ? esc(m.title) : ''}</span>
              <span class="team-extra">${roleCell(m)}
                ${B.canRemove(p.id, m) ? `<button class="icon-btn" data-remove="${m.id}" title="${tr('Retirer du projet')}">${icon('x', 15)}</button>` : ''}</span>
            </div>`).join('')}
          ${ais.map((a) => `
            <div class="team-row"><span class="presence ai"></span>${aiAvatar(a.id, 36, a.owner)}
              <span class="team-name" translate="no">${esc(aiNickname(a.owner, a.id) ? `${aiNickname(a.owner, a.id)} · ${PROVIDERS[a.id].label}` : PROVIDERS[a.id].label)}<small>${tr('{de}', { de: esc(de(a.owner.display_name)), name: esc(a.owner.display_name) })}</small></span>
              <span class="tag ai">${tr('IA')}</span>
              <span class="team-role">${a.api && a.connector ? tr("Via la clé API et l'abonnement {de}", { de: esc(de(a.owner.display_name)), name: esc(a.owner.display_name) }) : a.api ? tr('Via la clé API {de}', { de: esc(de(a.owner.display_name)), name: esc(a.owner.display_name) }) : tr("Via l'abonnement {de} (connecteur)", { de: esc(de(a.owner.display_name)), name: esc(a.owner.display_name) })}</span>
              <span class="team-extra"><code>${a.owner.id === B.me.id ? (a.api ? '@' + PROVIDERS[a.id].word : tr("depuis l'app {ai}", { ai: PROVIDERS[a.id].label })) : '@' + esc(a.owner.handle) + ' ' + PROVIDERS[a.id].label}</code></span>
            </div>`).join('')}
        </div>
        <p class="muted small">${tr('Créateur : tous les droits, seul à changer les statuts. Administrateur : invite et peut retirer un membre. Membre : participe au projet.')}</p>
        <p class="muted small">${tr("Chaque IA appartient à un membre et tourne sur sa clé API ou son abonnement. Pour la solliciter dans l'Atelier IA, écrivez la commande indiquée : son propriétaire devra accepter.")}</p>
      </section>

      <section class="card">
        <div class="card-head"><h2>${tr('Réglages du projet')}</h2></div>
        ${isOwner ? `
          <label>${tr('Nom')}</label><input id="pj-name" maxlength="60" value="${esc(p.name)}" />
          <label>${tr('Description')}</label><input id="pj-desc" maxlength="300" value="${esc(p.description || '')}" />
          <label>${tr('Couleur')}</label><input id="pj-color" type="color" value="${esc(p.color)}" />
          <div class="actions"><button class="btn danger-ghost" id="pj-del">${icon('trash', 15)} ${tr('Supprimer le projet')}</button>
            <span class="spacer"></span><button class="btn primary" id="pj-save">${tr('Enregistrer')}</button></div>`
        : `<p class="muted">${tr('Seul le créateur du projet peut le renommer ou le supprimer.')}</p>
           <div class="actions"><button class="btn danger-ghost" id="pj-leave">${icon('logout', 15)} ${tr('Quitter le projet')}</button></div>`}
      </section>
    </div>`;

  $('#t-invite', el)?.addEventListener('click', () => B.openInvite(p.id));
  B.paintDmBadges?.(); // pastille « messages privés non lus » sur la photo de chacun

  $$('.role-select', el).forEach((s) => (s.onchange = async () => {
    try {
      await B.setMemberRole(p.id, s.dataset.user, s.value);
      B.toast(tr('Statut mis à jour.'), { type: 'success' });
    } catch (err) { B.error(err); }
    B.route();
  }));

  $$('[data-remove]', el).forEach((b) => (b.onclick = async () => {
    const who = B.person(b.dataset.remove);
    if (!(await B.confirm(tr('Retirer {name} du projet « {project} » ? Il faudra une nouvelle invitation pour revenir.', { name: who.display_name, project: p.name }), tr('Retirer')))) return;
    try {
      await B.removeMember(p.id, who.id);
      B.toast(tr('{name} a été retiré du projet.', { name: who.display_name }), { type: 'success' });
    } catch (err) { B.error(err); }
    B.route();
  }));

  $('#pj-save', el)?.addEventListener('click', async () => {
    const { error } = await B.sb.from('projects').update({
      name: $('#pj-name', el).value.trim() || p.name,
      description: $('#pj-desc', el).value.trim() || null,
      color: $('#pj-color', el).value.toUpperCase()
    }).eq('id', p.id);
    if (error) return B.error(error);
    await B.loadProjects();
    B.toast(tr('Projet mis à jour.'), { type: 'success' });
    B.route();
  });

  $('#pj-del', el)?.addEventListener('click', async () => {
    if (!(await B.confirm(tr('Supprimer définitivement « {name} » et tout son contenu (messages, tâches, fichiers) ?', { name: p.name }), tr('Supprimer')))) return;
    const { error } = await B.sb.from('projects').delete().eq('id', p.id);
    if (error) return B.error(error);
    await B.loadProjects();
    location.hash = '#/home';
  });

  $('#pj-leave', el)?.addEventListener('click', async () => {
    if (!(await B.confirm(tr('Quitter « {name} » ? Il faudra une nouvelle invitation pour revenir.', { name: p.name }), tr('Quitter')))) return;
    const { error } = await B.sb.from('project_members').delete().match({ project_id: p.id, user_id: B.me.id });
    if (error) return B.error(error);
    await B.loadProjects();
    location.hash = '#/home';
  });

  // Point vert : mis à jour en direct quand quelqu'un se connecte ou se déconnecte
  B.onLeave(B.on('online', () => $$('[data-online]', el).forEach((d) => {
    const on = B.isOnline(d.dataset.online);
    d.classList.toggle('off', !on);
    d.title = on ? tr('Connecté') : tr('Hors ligne');
  })));
};
