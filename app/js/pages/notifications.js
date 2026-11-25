// =====================================================================
// Notifications — mentions, demandes d'IA (accepter / refuser), tâches, votes
// Depuis la refonte (livraison 3), ce n'est plus une page : la cloche de la barre du haut ouvre un panneau.
// L'ancienne adresse #/notifications ramène sur « Aujourd'hui » et ouvre ce panneau.
// Une notification devient « lue » quand on l'ouvre, ou avec « Tout marquer comme lu » : ouvrir la cloche
// ne suffit pas (sinon les mentions disparaîtraient de « On vous attend » sans avoir été traitées).
// =====================================================================

const NOTIF_ICONS = { mention: 'at', ai_request: 'spark', ai_answer: 'spark', task: 'checksq', vote: 'decision', report: 'flag' };

/** Remplit un bloc avec la liste des notifications ; renvoie la fonction qui la recharge */
B.renderNotifications = (box) => {
  let reqMap = new Map();
  const load = async () => {
    if (!box.isConnected) return;
    const { data, error } = await B.sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(60);
    if (error) return B.error(error);
    const reqIds = data.filter((n) => n.type === 'ai_request' && n.ref_id).map((n) => n.ref_id);
    const { data: reqs } = reqIds.length
      ? await B.sb.from('ai_requests').select('*').in('id', reqIds)
      : { data: [] };
    reqMap = new Map((reqs || []).map((r) => [r.id, r]));
    const STATUS = { accepted: tr('Acceptée · réponse attendue'), done: tr('Répondue ✓'), refused: tr('Refusée'), error: tr('Erreur') };

    box.innerHTML = data.length ? data.map((n) => {
      const req = n.type === 'ai_request' ? reqMap.get(n.ref_id) : null;
      const actions = ['pending', 'accepted'].includes(req?.status)
        ? `<div class="notif-actions"><button class="btn small primary" data-req="${req.id}" data-nid="${n.id}">${tr('Voir la demande')}</button></div>`
        : req ? `<span class="notif-status">${STATUS[req.status] || ''}${req.error ? ' · ' + esc(req.error) : ''}</span>` : '';
      return `<div class="notif ${n.read_at ? '' : 'unread'}" data-id="${n.id}">
        ${avatar(B.person(n.actor_id), 36)}
        <div class="notif-body">
          <p>${icon(NOTIF_ICONS[n.type] || 'bell', 14)} <span translate="no">${esc(n.text)}</span></p>
          <small>${timeAgo(n.created_at)}${n.project_id ? ' · ' + esc(B.project(n.project_id)?.name || '') : ''}
          ${n.link ? ` · <a href="${esc(n.link)}" data-open="${n.id}">${tr('Ouvrir')}</a>` : ''}</small>
          ${actions}
        </div>
      </div>`;
    }).join('') : `<div class="empty">${icon('bell', 30)}<p>${tr('Aucune notification.')}</p></div>`;
    paintIcons(box);
  };
  box.addEventListener('click', async (e) => {
    const see = e.target.closest('[data-req]'), open = e.target.closest('[data-open]');
    if (see) { // la fenêtre de la demande (Accepter / Refuser) ; la notification est lue
      B.sb.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', see.dataset.nid).then(() => B.refreshBadge());
      B.closeBell();
      return B.openAiRequest(see.dataset.req);
    }
    if (open) { // ouvrir une notification = elle est lue ; le lien fait le reste
      B.sb.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', open.dataset.open).then(() => B.refreshBadge());
      B.closeBell();
    }
  });
  load();
  return load;
};

/** Le panneau de la cloche */
B.closeBell = () => {
  const p = $('#bell-panel');
  if (!p) return;
  p.remove();
  document.removeEventListener('mousedown', bellOutside);
  $('#bell-btn').setAttribute('aria-expanded', 'false');
  B.bellOff?.();
  B.bellOff = null;
};
function bellOutside(e) { if (!e.target.closest('#bell-panel, #bell-btn')) B.closeBell(); }

B.openBell = () => {
  if ($('#bell-panel')) return B.closeBell();
  const panel = document.createElement('section');
  panel.id = 'bell-panel';
  panel.className = 'bell-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', tr('Notifications'));
  panel.innerHTML = `
    <header class="bell-head"><h2>${tr('Notifications')}</h2>
      <button class="link" id="read-all">${icon('check', 14)} ${tr('Tout marquer comme lu')}</button>
      <button class="icon-btn" data-close title="${tr('Fermer')}" aria-label="${tr('Fermer')}">${icon('x', 16)}</button></header>
    <div class="notif-list"><div class="loading">${tr('Chargement…')}</div></div>`;
  document.body.appendChild(panel);
  const load = B.renderNotifications($('.notif-list', panel));
  $('[data-close]', panel).onclick = B.closeBell;
  $('#read-all', panel).onclick = async () => {
    await B.sb.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', B.me.id).is('read_at', null);
    B.refreshBadge();
    B.emit('notification-read');
    load();
  };
  $('#bell-btn').setAttribute('aria-expanded', 'true');
  B.bellOff = B.on('notification', load);
  setTimeout(() => document.addEventListener('mousedown', bellOutside), 0);
  $('[data-close]', panel).focus();
};
$('#bell-btn').addEventListener('click', B.openBell);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') B.closeBell(); });
window.addEventListener('hashchange', () => B.closeBell());

/** #/demande/<id> (clic sur une notification de demande d'IA) : Aujourd'hui, avec la fenêtre de la demande */
B.pages.demande = async (_view, [id]) => {
  location.replace('#/home');
  if (/^[0-9a-f-]{36}$/.test(id || '')) setTimeout(() => B.openAiRequest(id), 350);
};

/** Ancienne page : on revient sur « Aujourd'hui », cloche ouverte */
B.pages.notifications = async () => {
  location.replace('#/home');
  setTimeout(() => { if (!$('#bell-panel')) B.openBell(); }, 350);
};
