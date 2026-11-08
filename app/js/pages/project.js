// =====================================================================
// Projet — en-tête + onglets :
//   Discussion (équipe, humains) · Atelier IA · Notre projet · Tâches · Documents · Équipe
// =====================================================================

const TABS = [
  ['discussion', 'chat', 'Discussion'],
  ['atelier', 'spark', 'Atelier IA'],
  ['projet', 'compass', 'Notre projet'],
  ['taches', 'checksq', 'Tâches'],
  ['calendrier', 'calendar', 'Calendrier'],
  ['documents', 'file', 'Documents'],
  ['equipe', 'users', 'Équipe']
];

/** Compteurs du projet (pour le résumé et l'accompagnement) */
B.projectCounts = async (pid) => {
  const c = (q) => q.then((r) => r.count || 0);
  const [messages, ideas, objectives, decisions, milestones, tasks, done, files] = await Promise.all([
    c(B.sb.from('messages').select('id, channels!inner(project_id)', { count: 'exact', head: true }).eq('channels.project_id', pid)),
    c(B.sb.from('items').select('id', { count: 'exact', head: true }).eq('project_id', pid).eq('type', 'idea')),
    c(B.sb.from('items').select('id', { count: 'exact', head: true }).eq('project_id', pid).eq('type', 'objective')),
    c(B.sb.from('items').select('id', { count: 'exact', head: true }).eq('project_id', pid).eq('type', 'decision')),
    c(B.sb.from('items').select('id', { count: 'exact', head: true }).eq('project_id', pid).eq('type', 'milestone')),
    c(B.sb.from('tasks').select('id', { count: 'exact', head: true }).eq('project_id', pid)),
    c(B.sb.from('tasks').select('id', { count: 'exact', head: true }).eq('project_id', pid).eq('status', 'done')),
    c(B.sb.from('files').select('id', { count: 'exact', head: true }).eq('project_id', pid))
  ]);
  return { messages, ideas, objectives, decisions, milestones, tasks, done, files };
};

B.pages.project = async (view, [pid, tab = 'discussion', sub]) => {
  const p = B.project(pid);
  if (!p) {
    view.innerHTML = `<div class="page"><div class="empty">${icon('compass', 30)}<p>${tr("Ce projet n'existe pas ou vous n'en faites plus partie.")}</p><a class="btn" href="#/home">${tr("Retour à l'accueil")}</a></div></div>`;
    return;
  }
  const humans = p.memberCount;
  view.innerHTML = `
    <div class="project">
      <header class="project-head">
        <span class="proj-icon" style="background:${esc(p.color)}">${icon('users', 20)}</span>
        <div class="project-title">
          <h1>${esc(p.name)}</h1>
          <p>${tr('{n} membres', { n: humans + p.aiCount })} (${tr(humans > 1 ? '{n} humains' : '{n} humain', { n: humans })} · ${tr('{n} IA', { n: p.aiCount })})</p>
        </div>
        <button class="btn small missed-btn" id="missed" title="${tr('Un résumé de ce qui s\'est passé depuis votre dernière visite')}">${icon('spark', 15)} ${tr("Qu'est-ce que j'ai raté ?")}<span class="unread-badge hidden" data-unread="missed:${pid}"></span></button>
        ${B.canInvite(pid) ? `<button class="btn small" id="invite">${icon('userplus', 15)} ${tr('Inviter')}</button>` : ''}
      </header>
      <nav class="tabs" data-tour="tabs">
        ${TABS.map(([id, ic, label]) => `<a href="#/p/${pid}/${id}" class="${id === tab ? 'on' : ''}">${icon(ic, 16)}${tr(label)}${
           id === 'discussion' ? `<span class="unread-badge hidden" data-unread="tab:${pid}:team"></span>`
             : id === 'atelier' ? `<span class="unread-badge hidden" data-unread="tab:${pid}:ai"></span>` : ''}</a>`).join('')}
      </nav>
      <div id="guide-slot"></div>
      <div id="tab" class="tab tab-${tab}"></div>
    </div>`;
  $('#invite', view)?.addEventListener('click', () => B.openInvite(pid));
  $('#missed', view).onclick = () => B.openMissed(pid);
  B.enterProject(pid); // retient ma visite précédente (point de départ du résumé)

  // Accompagnement (débutants)
  B.projectCounts(pid).then((counts) => {
    const slot = $('#guide-slot', view);
    if (slot) { slot.innerHTML = B.guideCard(pid, counts); paintIcons(slot); }
  });

  const el = $('#tab', view);
  if (tab === 'discussion') return renderDiscussion(el, p, sub);
  if (tab === 'atelier') return renderAtelier(el, p);
  if (tab === 'projet') return B.pages.hub(el, p);
  if (tab === 'taches') return B.pages.tasks(el, p, sub);
  if (tab === 'calendrier') return B.pages.calendar(el, p);
  if (tab === 'documents') return B.pages.docs(el, p);
  if (tab === 'equipe') return B.pages.team(el, p);
};

// ---------- Discussion d'équipe : salons façon Discord, humains uniquement ----------

async function renderDiscussion(el, p, channelId) {
  const { data: channels, error } = await B.sb.from('channels').select('*')
    .eq('project_id', p.id).eq('kind', 'team').order('created_at');
  if (error) return B.error(error);
  const current = channels.find((c) => c.id === channelId) || channels[0];

  el.innerHTML = `
    <div class="discussion">
      <aside class="channels">
        <div class="channels-title">${tr('Salons')}</div>
        ${channels.map((c) => `<a href="#/p/${p.id}/discussion/${c.id}" class="${c.id === current?.id ? 'on' : ''}">${icon('hash', 15)}<span class="channel-name">${esc(c.name)}</span><span class="unread-badge hidden" data-unread="channel:${c.id}"></span></a>`).join('')}
        <button class="add-channel">${icon('plus', 15)} ${tr('Ajouter un salon')}</button>
        <p class="channels-note">${icon('users', 13)} ${tr("Ici, uniquement entre humains. Les IA travaillent dans l'Atelier.")}</p>
      </aside>
      <section class="channel-main">
        ${current ? `<header class="channel-head"><h2># ${esc(current.name)}</h2><p>${esc(current.description || '')}</p></header>
        <div class="voice-strip"></div>` : ''}
        <div class="chat-slot"></div>
      </section>
    </div>`;

  $('.add-channel', el).onclick = () => {
    const m = B.modal(`<h2>${tr('Nouveau salon')}</h2>
      <label>${tr('Nom')}</label><input id="ch-name" maxlength="40" placeholder="${tr('ex. idées')}" />
      <label>${tr('Sujet (facultatif)')}</label><input id="ch-desc" maxlength="200" placeholder="${tr('ex. Toutes les idées en vrac')}" />
      <p class="msg" id="ch-msg"></p>
      <div class="actions"><button class="btn" data-close>${tr('Annuler')}</button><button class="btn primary" id="ch-ok">${tr('Créer')}</button></div>`);
    $('[data-close]', m).onclick = B.closeModal;
    $('#ch-ok', m).onclick = async () => {
      const name = $('#ch-name', m).value.trim().toLowerCase().replace(/\s+/g, '-');
      if (!name) return;
      const { data, error: err } = await B.sb.from('channels')
        .insert({ project_id: p.id, kind: 'team', name, description: $('#ch-desc', m).value.trim() || null })
        .select().single();
      if (err) return ($('#ch-msg', m).textContent = errText(err));
      B.closeModal();
      location.hash = `#/p/${p.id}/discussion/${data.id}`;
    };
  };

  B.live('chans', 'channels', `project_id=eq.${p.id}`, debounce(() => {
    if (location.hash.startsWith(`#/p/${p.id}/discussion`)) B.route();
  }, 300), 'INSERT');

  if (current) {
    B.voiceStrip($('.voice-strip', el), p, current);
    await B.chat($('.chat-slot', el), { project: p, channel: current, mode: 'team' });
  }
}

// ---------- Atelier IA : le fil où humains et IA travaillent ensemble ----------

async function renderAtelier(el, p) {
  const { data: channel, error } = await B.sb.from('channels').select('*')
    .eq('project_id', p.id).eq('kind', 'ai').single();
  if (error) return B.error(error);

  el.innerHTML = `
    <div class="atelier">
      <section class="atelier-main"><div class="chat-slot"></div></section>
      <aside class="our-project">
        <div class="our-head"><h3>${tr('Notre projet')}</h3></div>
        <div class="our-list"><div class="loading">…</div></div>
        <div class="my-ais">
          <h4>${tr('Vos IA dans ce projet')}</h4>
          ${B.myProviders.filter((x) => x.hasKey).map((x) => `<div class="my-ai">${aiAvatar(x.id, 24, B.me)}<span>@${PROVIDERS[x.id].word}</span></div>`).join('')}
          ${(B.me.connector_providers || []).map((id) => `<div class="my-ai">${aiAvatar(id, 24, B.me)}<span>${PROVIDERS[id].label} · ${tr('abonnement')}</span></div>`).join('')}
          ${!B.myProviders.some((x) => x.hasKey) && !(B.me.connector_providers || []).length
            ? `<p class="muted small">${tr('Aucune IA branchée.')} <a href="#/settings">${tr('Ajouter une IA')}</a></p>` : ''}
          ${(B.me.connector_providers || []).length
            ? `<p class="muted small">${tr("Avec l'abonnement, parlez à votre IA depuis son application : « Dans Bivouac, projet {project}, … ».", { project: esc(p.name) })}</p>` : ''}
        </div>
      </aside>
    </div>`;

  B.projectCounts(p.id).then((c) => {
    const rows = [
      ['bulb', 'Idées', c.ideas, 'projet', 'yellow'],
      ['target', 'Objectifs', c.objectives, 'projet', 'red'],
      ['checksq', 'Tâches', c.tasks, 'taches', 'teal'],
      ['file', 'Documents', c.files, 'documents', 'violet'],
      ['decision', 'Décisions', c.decisions, 'projet', 'green'],
      ['route', 'Feuille de route', c.milestones, 'projet', 'orange']
    ];
    const box = $('.our-list', el);
    if (box) box.innerHTML = rows.map(([ic, label, n, tab, tone]) =>
      `<a class="our-row" href="#/p/${p.id}/${tab}"><span class="our-ico ${tone}">${icon(ic, 16)}</span>${tr(label)}${n ? ` (${n})` : ''}</a>`).join('');
  });

  await B.chat($('.chat-slot', el), { project: p, channel, mode: 'ai' });
}
