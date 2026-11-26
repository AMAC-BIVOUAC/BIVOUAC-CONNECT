// =====================================================================
// Équipe — les humains du projet et leurs IA, réglages du projet
// Signalements (migration 034) : « Signaler » sur un message ; les responsables (Créateur, Administrateurs)
// les voient ici et les marquent « Traité ». La personne signalée n'est pas prévenue.
// =====================================================================

// [texte, urgent] : « urgent » met le signalement en tête de la file de l'équipe Bivouac (migration 042)
const REPORT_REASONS = () => [[tr('Propos blessants ou harcèlement'), false], [tr('Contenu inapproprié'), false],
  [tr('Spam ou arnaque'), false], [tr('Activité illégale (fraude, trafic, piratage…)'), false],
  [tr('Comportement inquiétant envers un mineur'), true], [tr('Danger immédiat (menace, violence, idées suicidaires)'), true], [tr('Autre'), false]];
const REPORT_TITLES = () => ({ message: tr('Signaler ce message'), dm: tr('Signaler ce message privé'), file: tr('Signaler ce document'),
  project: tr('Signaler ce projet'), profile: tr('Signaler cette personne'), item: tr('Signaler cet élément'), task: tr('Signaler cette tâche') });

/**
 * Fenêtre « Signaler » : raison + précisions. Les responsables du projet (sauf pour un projet ou un message privé)
 * ET l'équipe Bivouac (modération de toute l'application) le voient. La personne signalée n'est pas prévenue.
 */
B.reportContent = ({ projectId = null, type = 'message', targetId = null, targetUser = null, excerpt = '' }) => {
  const staffOnly = type === 'project' || type === 'dm';
  const m = B.modal(`
    <h2>${REPORT_TITLES()[type] || tr('Signaler')}</h2>
    <p class="muted small">${staffOnly ? tr('Seule l’équipe Bivouac (modération de l’application) le verra. La personne ou le projet signalé n’est pas prévenu.')
      : tr('Les responsables du projet (Créateur et Administrateurs) et l’équipe Bivouac le verront. La personne signalée n’est pas prévenue.')}</p>
    ${excerpt ? `<blockquote class="small report-quote" translate="no">${esc(String(excerpt).slice(0, 300))}</blockquote>` : ''}
    <label>${tr('Pourquoi ?')}</label>
    <div class="report-reasons">${REPORT_REASONS().map(([r], i) => `<label class="check"><input type="radio" name="rp-why" value="${i}" ${i === 0 ? 'checked' : ''} /> ${esc(r)}</label>`).join('')}</div>
    <p class="report-urgent hidden small">${icon('flag', 13)} ${tr('En cas de danger immédiat, appelez aussi le 17 (police) ou le 112. Un contenu illégal vu en ligne peut aussi être signalé sur internet-signalement.gouv.fr (PHAROS).')}</p>
    <label for="rp-details">${type === 'project' || type === 'profile' ? tr('Contexte (ce qui s’est passé, où, quand)') : tr('Précisions (facultatif)')}</label><textarea id="rp-details" rows="3" maxlength="800"></textarea>
    <p class="msg" id="rp-msg"></p>
    <div class="actions"><button class="btn" data-close>${tr('Annuler')}</button><button class="btn primary" id="rp-go">${icon('flag', 14)} ${tr('Signaler')}</button></div>`);
  $('[data-close]', m).onclick = B.closeModal;
  const pick = () => REPORT_REASONS()[Number($('input[name=rp-why]:checked', m).value)];
  $$('input[name=rp-why]', m).forEach((r) => (r.onchange = () => $('.report-urgent', m).classList.toggle('hidden', !pick()[1])));
  $('#rp-go', m).onclick = async (e) => {
    const [why, urgent] = pick();
    const details = $('#rp-details', m).value.trim();
    if ((staffOnly || type === 'profile' || why === tr('Autre')) && details.length < 5) {
      $('#rp-msg', m).textContent = tr('Ajoutez quelques mots de contexte pour aider l’équipe à comprendre.');
      return;
    }
    e.target.disabled = true;
    const { error } = await B.sb.from('reports').insert({ project_id: type === 'dm' ? null : projectId, target_type: type, target_id: targetId,
      target_user: targetUser, urgent, excerpt: excerpt ? String(excerpt).slice(0, 500) : null, reason: (details ? `${why} — ${details}` : why).slice(0, 1000) });
    if (error) {
      e.target.disabled = false;
      $('#rp-msg', m).textContent = /reports|schema cache|urgent/i.test(error.message || '') ? tr('Le signalement n’est pas encore installé sur le serveur (migration 042).') : errText(error);
      return;
    }
    B.closeModal();
    const p = projectId ? B.project(projectId) : null;
    if (p && !staffOnly) {
      for (const mem of B.projectMembers(projectId).filter((x) => ['owner', 'admin'].includes(x.role) && x.id !== B.me.id)) {
        B.notify(mem.id, { projectId, type: 'report', link: `#/p/${projectId}/equipe`,
          text: tr('Nouveau signalement dans « {project} » : à regarder dans Équipe.', { project: p?.name || '' }) });
      }
    }
    B.toast(staffOnly ? tr('Merci : le signalement est transmis à l’équipe Bivouac.') : tr('Merci : le signalement est transmis aux responsables du projet et à l’équipe Bivouac.'), { type: 'success' });
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
        ${m.role === 'guest' ? `<option value="guest" selected disabled>${roles.guest}</option>` : ''}
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
              <span class="team-role">${m.title ? esc(m.title) : ''}${B.localTimeHtml?.(m, { mode: 'place', always: true }) || ''}</span>
              ${B.relayOf?.(m.id) ? `<div class="team-relay"><strong>${icon('route', 13)} ${tr('Relais de {name}', { name: esc(m.display_name) })}</strong><span translate="no">${esc(B.relayOf(m.id))}</span></div>` : ''}
              <span class="team-extra">${m.id === B.me.id ? '' : `<a class="icon-btn dm-btn" href="#/messages/${m.id}" title="${esc(tr('Message privé à {name}', { name: m.display_name }))}" aria-label="${esc(tr('Message privé à {name}', { name: m.display_name }))}">${icon('whisper', 16)}</a>`}${roleCell(m)}
                ${B.canRemove(p.id, m) ? `<button class="icon-btn" data-remove="${m.id}" title="${tr('Retirer du projet')}">${icon('x', 15)}</button>` : ''}
                ${m.id === B.me.id ? '' : `<button class="icon-btn" data-report-user="${m.id}" title="${esc(tr('Signaler {name}', { name: m.display_name }))}" aria-label="${esc(tr('Signaler {name}', { name: m.display_name }))}">${icon('flag', 15)}</button>`}</span>
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

      <section class="card" id="t-notify">
        <div class="card-head"><h2>${icon('bell', 16)} ${tr('Mes notifications pour ce projet')}</h2></div>
        <div class="notify-levels" role="radiogroup" aria-label="${esc(tr('Mes notifications pour ce projet'))}">
          ${B.NOTIFY_LEVELS().map(([v, label, hint]) => `<label class="check notify-level">
            <input type="radio" name="t-level" value="${v}" ${B.projectNotifyLevel(p.id) === v ? 'checked' : ''} />
            <span><strong>${label}</strong> <span class="muted small">· ${hint}</span></span></label>`).join('')}
        </div>
        <p class="muted small">${tr("Vaut pour vous seul, sur tous vos appareils, app ouverte ou fermée. Son, vibreur et messages privés : Paramètres → Notifications.")}</p>
      </section>

      <section class="card" id="t-ai">
        <div class="card-head"><h2>${icon('spark', 16)} ${tr('Mon IA sur ce projet')}</h2></div>
        <p class="muted">${tr("Faites travailler Claude, ChatGPT ou une autre IA sur ce projet sans avoir à lui redire « dans Bivouac » : un texte tout prêt à coller dans un projet de votre IA.")}</p>
        <div class="actions"><button type="button" class="btn" id="t-ai-brief">${icon('spark', 15)} ${tr('Préparer pour mon IA')}</button></div>
      </section>

      ${B.isManager(p.id) ? '<section class="card hidden" id="t-reports"></section>' : ''}
      <section class="card">
        <div class="card-head"><h2>${tr('Réglages du projet')}</h2></div>
        ${isOwner ? `
          <label>${tr('Nom')}</label><input id="pj-name" maxlength="60" value="${esc(p.name)}" />
          <label>${tr('Description')}</label><input id="pj-desc" maxlength="300" value="${esc(p.description || '')}" />
          <div class="pj-look">
            <div><label for="pj-icon">${tr('Icône')}</label>
              <button type="button" class="pj-icon-btn" id="pj-icon" data-icon="${esc(p.icon || 'users')}" style="background:${esc(p.color)}"
                aria-expanded="false" aria-controls="pj-icons" title="${tr("Changer l'icône du projet")}">${icon(PROJECT_ICONS.some(([k]) => k === p.icon) ? p.icon : 'users', 22)}</button></div>
            <div><label for="pj-color">${tr('Couleur')}</label><input id="pj-color" type="color" value="${esc(p.color)}" /></div>
            <div class="pj-image"><label for="pj-image-pick">${tr('Image')}</label>
              <div class="pj-image-row"><span class="proj-sq pj-image-preview" style="background:${esc(p.color)}">${projectIcon(p, 18)}</span>
                <button type="button" class="btn small" id="pj-image-pick">${icon('image', 14)} ${p.image ? tr('Changer') : tr('Choisir une image')}</button>
                <button type="button" class="link small ${p.image ? '' : 'hidden'}" id="pj-image-clear">${tr('Retirer')}</button>
                <input type="file" id="pj-image-file" class="hidden" accept="image/png,image/jpeg,image/webp,image/gif" /></div></div>
          </div>
          <p class="muted small">${tr("L'image (photo, logo) remplace l'icône partout, pour reconnaître le projet d'un coup d'œil.")}</p>
          <div class="pj-icons hidden" id="pj-icons" role="radiogroup" aria-label="${tr('Icône du projet')}" style="--c:${esc(p.color)}">
            ${PROJECT_ICONS.map(([k, label]) => `<button type="button" class="pj-icon-opt" role="radio" data-pick="${k}"
              aria-checked="${k === (p.icon || 'users')}" aria-label="${tr(label)}" title="${tr(label)}">${icon(k, 22)}</button>`).join('')}
          </div>
          <div class="actions"><button class="btn danger-ghost" id="pj-del">${icon('trash', 15)} ${tr('Supprimer le projet')}</button>
            <span class="spacer"></span><button class="btn primary" id="pj-save">${tr('Enregistrer')}</button></div>`
        : `<p class="muted">${tr('Seul le créateur du projet peut le renommer ou le supprimer.')}</p>
           <div class="actions"><button class="btn danger-ghost" id="pj-leave">${icon('logout', 15)} ${tr('Quitter le projet')}</button>
             <span class="spacer"></span><button class="link small" id="pj-report">${icon('flag', 14)} ${tr('Signaler ce projet')}</button></div>`}
      </section>
    </div>`;

  $('#t-invite', el)?.addEventListener('click', () => B.openInvite(p.id));
  $('#t-ai-brief', el).onclick = () => B.openAiBrief(p);
  // Mon niveau de notifications pour ce projet (tous, mentions, seulement moi, muet)
  $$('[name="t-level"]', el).forEach((r) => (r.onchange = async () => {
    const before = B.projectNotifyLevel(p.id);
    try {
      await B.setProjectNotifyLevel(p.id, r.value);
      B.toast(tr('Notifications de ce projet : {level}.', { level: B.NOTIFY_LEVELS().find(([v]) => v === r.value)[1].toLowerCase() }), { type: 'success', timeout: 2500 });
    } catch (err) {
      $(`[name="t-level"][value="${before}"]`, el).checked = true;
      B.error(err);
    }
  }));
  if ($('#t-reports', el)) renderReports($('#t-reports', el), p);
  $$('[data-report-user]', el).forEach((b) => (b.onclick = () => B.reportContent({ projectId: p.id, type: 'profile', targetUser: b.dataset.reportUser })));
  $('#pj-report', el)?.addEventListener('click', () => B.reportContent({ projectId: p.id, type: 'project', targetUser: p.owner_id }));
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

  // Icône du projet : le bouton ouvre la grille ; l'aperçu suit la couleur choisie (rien n'est enregistré avant « Enregistrer »)
  const iconBtn = $('#pj-icon', el), iconGrid = $('#pj-icons', el);
  if (iconBtn) {
    iconBtn.onclick = () => {
      const open = iconGrid.classList.toggle('hidden') === false;
      iconBtn.setAttribute('aria-expanded', open);
      if (open) $('.pj-icon-opt[aria-checked="true"]', iconGrid)?.focus();
    };
    $$('.pj-icon-opt', iconGrid).forEach((b) => (b.onclick = () => {
      $$('.pj-icon-opt', iconGrid).forEach((o) => o.setAttribute('aria-checked', o === b));
      iconBtn.dataset.icon = b.dataset.pick;
      iconBtn.innerHTML = icon(b.dataset.pick, 22);
      iconGrid.classList.add('hidden');
      iconBtn.setAttribute('aria-expanded', 'false');
      iconBtn.focus();
    }));
    $('#pj-color', el).addEventListener('input', (e) => {
      iconBtn.style.background = e.target.value;
      iconGrid.style.setProperty('--c', e.target.value);
    });
  }

  // Image du projet (migration 048) : carré de 160 px fabriqué dans l'appareil, enregistré avec « Enregistrer »
  let imageVal; // undefined = inchangée, null = retirée, sinon l'image data:
  const paintImage = () => {
    const prev = $('.pj-image-preview', el);
    if (!prev) return;
    prev.innerHTML = projectIcon({ ...p, icon: iconBtn?.dataset.icon || p.icon, image: imageVal === undefined ? p.image : imageVal }, 18);
    const has = imageVal === undefined ? Boolean(p.image) : Boolean(imageVal);
    $('#pj-image-clear', el).classList.toggle('hidden', !has);
    $('#pj-image-pick', el).innerHTML = `${icon('image', 14)} ${has ? tr('Changer') : tr('Choisir une image')}`;
  };
  $('#pj-image-pick', el)?.addEventListener('click', () => $('#pj-image-file', el).click());
  $('#pj-image-file', el)?.addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try { imageVal = await B.squarePhoto(f); paintImage(); B.toast(tr('Image prête : cliquez sur « Enregistrer ».'), { timeout: 3000 }); }
    catch (err) { B.error(err); }
  });
  $('#pj-image-clear', el)?.addEventListener('click', () => { imageVal = null; paintImage(); });

  $('#pj-save', el)?.addEventListener('click', async () => {
    const { error } = await B.sb.from('projects').update({
      name: $('#pj-name', el).value.trim() || p.name,
      description: $('#pj-desc', el).value.trim() || null,
      color: $('#pj-color', el).value.toUpperCase(),
      icon: iconBtn?.dataset.icon || 'users',
      ...(imageVal !== undefined ? { image: imageVal } : {})
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
