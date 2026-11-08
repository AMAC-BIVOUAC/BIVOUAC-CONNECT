// =====================================================================
// Notifications — mentions, demandes d'IA (accepter / refuser), tâches
// =====================================================================

B.pages.notifications = async (view) => {
  view.innerHTML = `
    <div class="page narrow">
      <div class="page-head"><h1>${tr('Notifications')}</h1><button class="btn small" id="read-all">${icon('check', 15)} ${tr('Tout marquer comme lu')}</button></div>
      <div class="card notif-list"><div class="loading">${tr('Chargement…')}</div></div>
    </div>`;

  const icons = { mention: 'chat', ai_request: 'spark', ai_answer: 'spark', task: 'checksq', vote: 'users' };

  const load = async () => {
    const { data, error } = await B.sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(60);
    if (error) return B.error(error);
    const reqIds = data.filter((n) => n.type === 'ai_request' && n.ref_id).map((n) => n.ref_id);
    const { data: reqs } = reqIds.length
      ? await B.sb.from('ai_requests').select('*').in('id', reqIds)
      : { data: [] };
    const reqMap = new Map((reqs || []).map((r) => [r.id, r]));
    const STATUS = { accepted: tr('En cours…'), done: tr('Acceptée ✓'), refused: tr('Refusée'), error: tr('Erreur') };

    $('.notif-list', view).innerHTML = data.length ? data.map((n) => {
      const req = n.type === 'ai_request' ? reqMap.get(n.ref_id) : null;
      const actions = req?.status === 'pending'
        ? `<div class="notif-actions"><button class="btn small" data-refuse="${req.id}">${tr('Refuser')}</button>
           ${B.hasProvider(req.provider)
             ? `<button class="btn small primary" data-accept="${req.id}">${tr('Accepter (ma clé)')}</button>`
             : `<span class="notif-status">${tr('À traiter depuis ton app {ai} : « Traite mes demandes Bivouac »', { ai: esc(PROVIDERS[req.provider]?.label || '') })}</span>`}</div>`
        : req ? `<span class="notif-status">${STATUS[req.status] || ''}${req.error ? ' · ' + esc(req.error) : ''}</span>` : '';
      return `<div class="notif ${n.read_at ? '' : 'unread'}" data-id="${n.id}">
        ${avatar(B.person(n.actor_id), 36)}
        <div class="notif-body">
          <p>${icon(icons[n.type] || 'bell', 14)} <span translate="no">${esc(n.text)}</span></p>
          <small>${timeAgo(n.created_at)}${n.project_id ? ' · ' + esc(B.project(n.project_id)?.name || '') : ''}
          ${n.link ? ` · <a href="${esc(n.link)}">${tr('Ouvrir')}</a>` : ''}</small>
          ${actions}
        </div>
      </div>`;
    }).join('') : `<div class="empty">${icon('bell', 30)}<p>${tr('Aucune notification.')}</p></div>`;

    $$('[data-accept]', view).forEach((b) => (b.onclick = async () => {
      b.disabled = true;
      b.textContent = tr("L'IA travaille…");
      await B.acceptRequest(reqMap.get(b.dataset.accept)).catch(B.error);
      load();
    }));
    $$('[data-refuse]', view).forEach((b) => (b.onclick = async () => {
      await B.refuseRequest(reqMap.get(b.dataset.refuse)).catch(B.error);
      load();
    }));
  };

  $('#read-all', view).onclick = async () => {
    await B.sb.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', B.me.id).is('read_at', null);
    B.refreshBadge();
    load();
  };

  await load();
  // ouvrir la page = tout est vu
  await B.sb.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', B.me.id).is('read_at', null);
  B.refreshBadge();
  B.onLeave(B.on('notification', load));
};
