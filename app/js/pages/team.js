// =====================================================================
// Équipe — les humains du projet et leurs IA, réglages du projet
// Signalements (migration 034) : « Signaler » sur un message ; les responsables (Créateur, Administrateurs)
// les voient ici et les marquent « Traité ». La personne signalée n'est pas prévenue.
// =====================================================================

const REPORT_REASONS = () => [tr('Propos blessants ou harcèlement'), tr('Contenu inapproprié'), tr('Comportement inquiétant envers un mineur'), tr('Spam ou arnaque'), tr('Autre')];

/** Fenêtre « Signaler » : raison + précisions, puis les responsables du projet sont prévenus */
B.reportContent = ({ projectId, type = 'message', targetId = null, targetUser = null, excerpt = '' }) => {
  const m = B.modal(`
    <h2>${tr('Signaler ce message')}</h2>
    <p class="muted small">${tr('Les responsables du projet (Créateur et Administrateurs) le verront. La personne signalée n’est pas prévenue.')}</p>
    ${excerpt ? `<blockquote class="small report-quote" translate="no">${esc(String(excerpt).slice(0, 300))}</blockquote>` : ''}
    <label>${tr('Pourquoi ?')}</label>
    <div class="report-reasons">${REPORT_REASONS().map((r, i) => `<label class="check"><input type="radio" name="rp-why" value="${i}" ${i === 0 ? 'checked' : ''} /> ${esc(r)}</label>`).join('')}</div>
    <label for="rp-details">${tr('Précisions (facultatif)')}</label><textarea id="rp-details" rows="3" maxlength="800"></textarea>
    <p class="msg" id="rp-msg"></p>
    <div class="actions"><button class="btn" data-close>${tr('Annuler')}</button><button class="btn primary" id="rp-go">${icon('flag', 14)} ${tr('Signaler')}</button></div>`);
  $('[data-close]', m).onclick = B.closeModal;
  $('#rp-go', m).onclick = async (e) => {
    const why = REPORT_REASONS()[Number($('input[name=rp-why]:checked', m).value)];
    const details = $('#rp-details', m).value.trim();
    e.target.disabled = true;
    const { error } = await B.sb.from('reports').insert({ project_id: projectId, target_type: type, target_id: targetId, target_user: targetUser,
      excerpt: excerpt ? String(excerpt).slice(0, 500) : null, reason: (details ? `${why} — ${details}` : why).slice(0, 1000) });
    if (error) {
      e.target.disabled = false;
      $('#rp-msg', m).textContent = /reports|schema cache/i.test(error.message || '') ? tr('Le signalement n’est pas encore installé sur le serveur (migration 034).') : errText(error);
      return;
    }
    B.closeModal();
    const p = B.project(projectId);
    for (const mem of B.projectMembers(projectId).filter((x) => ['owner', 'admin'].includes(x.role))) {
      B.notify(mem.id, { projectId, type: 'report', link: `#/p/${projectId}/equipe`,
        text: tr('Nouveau signalement dans « {project} » : à regarder dans Équipe.', { project: p?.name || '' }) });
    }
    B.toast(tr('Merci : le signalement est transmis aux responsables du projet.'), { type: 'success' });
  };
};

/** Liste des signalements d'un projet (responsables seulement) */
async function renderReports(box, p) {
  const { data, error } = await B.sb.from('reports').select('*').eq('project_id', p.id).order('created_at', { ascending: false }).limit(50);
  if (error || !box.isConnected) { box.classList.add('hidden'); return; }
  const list = (data || []).filter((r) => r.project_id === p.id);
  const open = list.filter((r) => !r.handled_at);
  box.classList.remove('hidden');
  box.innerHTML = `
    <div class="card-head"><h2>${icon('flag', 16)} ${tr('Signalements')} ${open.length ? `<span class="n">${open.length}</span>` : ''}</h2></div>
    ${list.length ? list.map((r) => `<div class="report-row ${r.handled_at ? 'done' : ''}">
        <div class="report-text"><b>${esc(r.reason)}</b>
          ${r.excerpt ? `<blockquote class="small report-quote" translate="no">${esc(r.excerpt)}</blockquote>` : ''}
          <span class="muted small">${tr('Signalé par {who}', { who: esc(B.person(r.reporter_id).display_name) })}${r.target_user ? ` · ${tr('concerne {who}', { who: esc(B.person(r.target_user).display_name) })}` : ''} · ${timeAgo(r.created_at)}${r.handled_at ? ` · ${tr('traité par {who}', { who: esc(B.person(r.handled_by).display_name) })}` : ''}</span></div>
        ${r.handled_at ? `<span class="tag">${tr('Traité')}</span>` : `<button class="btn small" data-handle="${r.id}">${icon('check', 14)} ${tr('Traité')}</button>`}
      </div>`).join('')
      : `<p class="muted small">${tr('Aucun signalement. Chacun peut signaler un message (menu ⋯ du message) : vous le verrez ici.')}</p>`}`;
  $$('[data-handle]', box).forEach((b) => (b.onclick = async () => {
    const { error: err } = await B.sb.rpc('handle_report', { p_report: b.dataset.handle });
    if (err) return B.error(err);
    renderReports(box, p);
  }));
}

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
            <div class="team-row"><span class="presence ${B.presenceClass(m.id)}" data-online="${m.id}" title="${esc(B.statusText(m.id))}"></span>${m.id === B.me.id ? avatar(m, 36)
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
        <p class="muted small">${tr("Créateur : tous les droits, seul à changer les statuts et à supprimer une décision soumise au vote. Administrateur : invite, retire un membre, gère les salons et peut supprimer messages, tâches et documents des autres (modération). Membre : participe, et supprime ce qu'il a lui-même créé.")}</p>
        <p class="muted small">${tr("Chaque IA appartient à un membre et tourne sur sa clé API ou son abonnement. Pour la solliciter dans l'Atelier IA, écrivez la commande indiquée : son propriétaire devra accepter.")}</p>
      </section>

      ${B.isManager(p.id) ? '<section class="card hidden" id="t-reports"></section>' : ''}
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
  if ($('#t-reports', el)) renderReports($('#t-reports', el), p);
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

  // Pastille de présence et de statut : mise à jour en direct (connexion, déconnexion, changement de statut)
  B.onLeave(B.on('online', () => B.paintPresence(el)));
  B.onLeave(B.on('status', () => B.paintPresence(el)));
};
