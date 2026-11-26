// =====================================================================
// Projet — en-tête + 5 onglets (refonte, livraison 3) :
//   Camp de base · Discussion · Tâches · Tout le projet · Documents · Équipe
// (« Tout le projet » est un onglet depuis le 22/11, demande d'Amaury ; sur téléphone il reste dans le menu ⋯)
// L'Atelier IA est une rubrique de Discussion (« Avec les IA »), le Calendrier une vue de Tâches.
// Les anciennes adresses …/atelier et …/calendrier restent valables (liens des notifications, du connecteur).
// =====================================================================

const TABS = [
  ['projet', 'compass', 'Camp de base'],
  ['discussion', 'chat', 'Discussion'],
  ['taches', 'checksq', 'Tâches'],
  ['tout', 'list', 'Tout le projet'],
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

B.pages.project = async (view, [pid, tab = 'projet', sub]) => {
  // Onglet à souligner : l'Atelier est dans Discussion, le Calendrier dans Tâches
  if (tab === 'calendrier') { tab = 'taches'; sub = 'calendrier'; }
  // …/projet/tout (ancienne adresse, menu ⋯ du téléphone) = l'onglet « Tout le projet » sur ordinateur
  if (tab === 'projet' && sub === 'tout' && !B.isPhone()) { tab = 'tout'; sub = null; }
  const shownTab = tab === 'atelier' ? 'discussion' : tab;
  const p = B.project(pid);
  if (!p) {
    view.innerHTML = `<div class="page"><div class="empty">${icon('compass', 30)}<p>${tr("Ce projet n'existe pas ou vous n'en faites plus partie.")}</p><a class="btn" href="#/home">${tr("Retour à l'accueil")}</a></div></div>`;
    return;
  }
  // Invité (migration 050) : seulement son salon, ni onglets ni Camp de base
  const guestCh = B.guestChannel(pid);
  if (guestCh) { tab = 'discussion'; sub = guestCh; }
  const humans = p.memberCount;
  view.innerHTML = `
    <div class="project ${guestCh ? 'guest-view' : ''}">
      <header class="project-head">
        <a class="icon-btn proj-back" href="#/projects" aria-label="${tr('Retour à mes projets')}">${icon('back', 20)}</a>
        <span class="proj-icon" style="background:${esc(p.color)}">${projectIcon(p, 20)}</span>
        <div class="project-title">
          <h1>${esc(p.name)}</h1>
          <p>${tr('{n} membres', { n: humans + p.aiCount })} (${tr(humans > 1 ? '{n} humains' : '{n} humain', { n: humans })} · ${tr('{n} IA', { n: p.aiCount })})</p>
        </div>
        <button class="btn small missed-btn" id="missed" title="${tr('Un résumé de ce qui s\'est passé depuis votre dernière visite')}">${icon('spark', 15)} ${tr('Pendant votre absence')}<span class="unread-badge hidden" data-unread="missed:${pid}"></span></button>
        ${B.canInvite(pid) ? `<button class="btn small" id="invite">${icon('userplus', 15)} ${tr('Inviter')}</button>` : ''}
        <button class="create-btn proj-plus" id="proj-plus" type="button" aria-label="${tr('Créer')}" title="${tr('Créer')}">${icon('plus', 22)}</button>
        <button class="icon-btn proj-more" id="proj-more" aria-label="${tr('Plus d’options pour ce projet')}">${icon('more', 20)}</button>
      </header>
      <nav class="tabs" data-tour="tabs">
        ${TABS.map(([id, ic, label]) => `<a href="#/p/${pid}/${id}" class="${id === shownTab ? 'on' : ''}" ${id === shownTab ? 'aria-current="page"' : ''}>${icon(ic, 16)}${tr(label)}${
           id === 'discussion' ? `<span class="unread-badge hidden" data-unread="tab:${pid}"></span>` : ''}</a>`).join('')}
      </nav>
      <div id="guide-slot"></div>
      <div id="tab" class="tab tab-${shownTab}"></div>
    </div>`;
  // Petit écran : les onglets défilent ; on montre l'onglet ouvert (sinon « Tâches », « Documents »… restent cachés à droite)
  document.body.classList.toggle('guest-project', !!guestCh);
  B.onLeave(() => document.body.classList.remove('guest-project'));
  if (guestCh) {
    $('#missed', view)?.remove();
    view.querySelector('.project-title p').textContent = tr('Vous êtes invité dans un seul salon de ce projet.');
  }
  const tabsNav = $('.tabs', view), onTab = $('.tabs a.on', view);
  if (tabsNav && onTab && tabsNav.scrollWidth > tabsNav.clientWidth) {
    const left = onTab.getBoundingClientRect().left - tabsNav.getBoundingClientRect().left + tabsNav.scrollLeft;
    tabsNav.scrollLeft = Math.max(0, left - (tabsNav.clientWidth - onTab.offsetWidth) / 2);
  }
  $('#invite', view)?.addEventListener('click', () => B.openInvite(pid));
  $('#missed', view)?.addEventListener('click', () => (location.hash = `#/p/${pid}/projet/absence`));
  $('#proj-more', view).onclick = (e) => B.projectMoreMenu(e.currentTarget, pid);
  $('#proj-plus', view).onclick = (e) => B.openCreate(e); // téléphone : le « + » reste en haut dans un projet (v0.8.86)
  B.enterProject(pid); // retient ma visite précédente (point de départ du résumé)

  // Accompagnement (débutants)
  B.projectCounts(pid).then((counts) => {
    const slot = $('#guide-slot', view);
    if (slot) { slot.innerHTML = B.guideCard(pid, counts); paintIcons(slot); }
  });

  const el = $('#tab', view);
  if (tab === 'discussion') return renderDiscussion(el, p, sub);
  // Nouvel arrivant (rejoint depuis moins de 14 jours) : « Bienvenue », l'essentiel en un écran, une seule fois (v0.8.83)
  if (!guestCh) setTimeout(() => { if (B.project(p.id)) B.welcomeNewcomer?.(p).catch(console.error); }, 900);
  if (tab === 'atelier') return renderDiscussion(el, p, null, { atelier: true });
  if (tab === 'projet') return B.pages.camp(el, p, sub);
  if (tab === 'taches') return B.pages.tasks(el, p, sub);
  if (tab === 'tout') {
    if (B.isPhone()) return B.pages.camp(el, p, 'tout'); // téléphone : sous-page avec « ← Tout le projet »
    await B.pages.hub(el, p);
    paintIcons(el);
    if (B.pendingNewVote) { B.pendingNewVote = false; $('[data-new-vote]', el)?.click(); }
    return;
  }
  if (tab === 'documents') return B.pages.docs(el, p);
  if (tab === 'equipe') return B.pages.team(el, p);
};

// ---------- Discussion d'équipe : salons façon Discord, humains uniquement ----------


// ---------- Les IA dans un salon (migration 043, 24/11, Amaury) ----------
// Trois choix, dans la fenêtre de création (tout membre) et de modification (responsables) d'un salon :
// pas d'accès (les IA ne le voient pas) · lecture seule (par défaut, comme avant) · lecture et écriture.
// L'écriture est imposée par la base ; la lecture par le connecteur et les résumés (resume.js).
const AI_ACCESS = [
  ['none', 'eyeoff', 'Pas d’accès', 'Les IA ne voient pas ce salon.'],
  ['read', 'eye', 'Lecture seule', 'Les IA peuvent lire ce salon pour vous aider, mais n’y écrivent pas.'],
  ['write', 'bot', 'Lecture et écriture', 'Les IA peuvent lire ce salon et y publier messages et fichiers.']
];
const aiAccessOf = (c) => (c?.ai_write ? 'write' : c?.ai_read === false ? 'none' : 'read');
const aiAccessFields = (val = 'read') => `<fieldset class="ai-access"><legend>${tr('Les IA dans ce salon')}</legend>
  ${AI_ACCESS.map(([v, ic, t, d]) => `<label class="ai-access-opt"><input type="radio" name="ai-access" value="${v}" ${v === val ? 'checked' : ''} />
    <span class="ai-access-ico">${icon(ic, 18)}</span><span><strong>${tr(t)}</strong><small>${tr(d)}</small></span></label>`).join('')}
</fieldset>`;
const aiAccessValue = (m) => {
  const v = $('input[name=ai-access]:checked', m)?.value || 'read';
  return { ai_read: v !== 'none', ai_write: v === 'write' };
};
/** Petit repère à côté du nom d'un salon : ouvert aux IA en écriture, ou fermé aux IA */
const aiAccessMark = (c) => {
  const v = aiAccessOf(c);
  if (v === 'read') return '';
  const [, ic, t] = AI_ACCESS.find((x) => x[0] === v);
  return `<span class="ai-mark ai-mark-${v}" title="${esc(tr('IA : {t}', { t: tr(t) }))}" aria-label="${esc(tr('IA : {t}', { t: tr(t) }))}">${icon(ic, 13)}</span>`;
};

/** Fenêtre « Nouveau salon » (ordinateur et téléphone) */
function newChannel(p) {
  const m = B.modal(`<h2>${tr('Nouveau salon')}</h2>
    <label for="ch-name">${tr('Nom')}</label><input id="ch-name" maxlength="40" placeholder="${tr('ex. idées')}" />
    <label for="ch-desc">${tr('Sujet (facultatif)')}</label><input id="ch-desc" maxlength="200" placeholder="${tr('ex. Toutes les idées en vrac')}" />
    ${aiAccessFields('read')}
    <p class="msg" id="ch-msg"></p>
    <div class="actions"><button class="btn" data-close>${tr('Annuler')}</button><button class="btn primary" id="ch-ok">${tr('Créer')}</button></div>`);
  $('[data-close]', m).onclick = B.closeModal;
  $('#ch-ok', m).onclick = async () => {
    const name = $('#ch-name', m).value.trim().toLowerCase().replace(/\s+/g, '-');
    if (!name) return;
    const { data: ch, error } = await B.sb.from('channels')
      .insert({ project_id: p.id, kind: 'team', name, description: $('#ch-desc', m).value.trim() || null, ...aiAccessValue(m) })
      .select().single();
    if (error) return ($('#ch-msg', m).textContent = errText(error));
    B.closeModal();
    location.hash = `#/p/${p.id}/discussion/${ch.id}`;
  };
}

async function renderDiscussion(el, p, channelId, { atelier = false } = {}) {
  const { data: all, error } = await B.sb.from('channels').select('*')
    .eq('project_id', p.id).order('created_at');
  if (error) return B.error(error);
  const channels = all.filter((c) => c.kind === 'team');
  const ai = all.find((c) => c.kind === 'ai') || null;
  const current = atelier ? null : (channels.find((c) => c.id === channelId) || channels[0]);

  // Téléphone : d'abord la liste des salons ; un salon s'ouvre ensuite en plein écran (phone.js)
  if (B.isPhone() && !channelId && !atelier) return renderChannelList(el, p, channels, ai);

  // En-tête de l'Atelier : à quoi il sert, et mes IA dans ce projet
  const atelierHead = () => {
    const keys = B.myProviders.filter((x) => x.hasKey).map((x) => x.id);
    const subs = (B.me.connector_providers || []).filter((id) => !keys.includes(id));
    const mine = [...keys, ...subs];
    return `<header class="channel-head atelier-head">
      <a class="icon-btn conv-back" href="#/p/${p.id}/discussion" aria-label="${tr('Retour aux salons')}">${icon('back', 20)}</a>
      <h2>${icon('spark', 18)} <span class="conv-name">${tr('Atelier IA')}<small class="conv-sub" translate="no">${esc(p.name)}</small></span></h2>
      <p>${tr('Humains et IA travaillent ensemble ici.')} ${mine.length
        ? `<span class="my-ais-line">${tr('Vos IA')} : ${mine.map((id) => `<span class="my-ai">${aiAvatar(id, 20, B.me)}<span>${esc(PROVIDERS[id].label)}</span></span>`).join('')}</span>`
        : `${tr('Aucune IA branchée.')} <a href="#/settings">${tr('Ajouter une IA')}</a>`}</p>
      ${subs.length ? `<p>${tr("Avec l'abonnement, parlez à votre IA depuis son application : « Dans Bivouac, projet {project}, … ».", { project: esc(p.name) })}</p>` : ''}
      <span class="channel-tools"><button class="icon-btn ch-files-btn" data-ch-files title="${tr('Fichiers partagés dans ce salon')}" aria-label="${tr('Fichiers partagés dans ce salon')}">${icon('clip', 15)}</button><span class="pins-slot"></span></span>
    </header>`;
  };

  el.innerHTML = `
    <div class="discussion">
      <aside class="channels">
        <div class="channels-title">${tr('Entre humains')}</div>
        ${channels.map((c) => `<a href="#/p/${p.id}/discussion/${c.id}" class="${c.id === current?.id ? 'on' : ''}" ${c.id === current?.id ? 'aria-current="page"' : ''}>${icon('hash', 15)}<span class="channel-name">${esc(c.name)}</span>${aiAccessMark(c)}<span class="unread-badge hidden" data-unread="channel:${c.id}"></span></a>
          <div class="ch-voice" data-ch-voice="${c.id}"></div>`).join('')}
        <button class="add-channel">${icon('plus', 15)} ${tr('Ajouter un salon')}</button>
        ${ai ? `<div class="channels-title with-ai">${tr('Avec les IA')}</div>
        <a href="#/p/${p.id}/atelier" class="chan-ai ${atelier ? 'on' : ''}" ${atelier ? 'aria-current="page"' : ''}>${icon('spark', 15)}<span class="channel-name">${tr('Atelier IA')}</span><span class="unread-badge hidden" data-unread="channel:${ai.id}"></span></a>` : ''}
        <p class="channels-note">${icon('users', 13)} ${tr("Les IA travaillent dans l'Atelier, et dans les salons que vous leur ouvrez.")}</p>
      </aside>
      <section class="channel-main ${atelier ? 'is-atelier' : ''}">
        ${atelier ? atelierHead() : ''}
        ${current ? `<header class="channel-head">
          <a class="icon-btn conv-back" href="#/p/${p.id}/discussion" aria-label="${tr('Retour aux salons')}">${icon('back', 20)}</a>
          <h2><span class="conv-name"># ${esc(current.name)}${aiAccessMark(current)}<small class="conv-sub" translate="no">${esc(p.name)}</small></span></h2><p>${esc(current.description || '')}${aiAccessOf(current) !== 'read' ? ` <span class="ai-chip ai-chip-${aiAccessOf(current)}">${icon(AI_ACCESS.find((x) => x[0] === aiAccessOf(current))[1], 13)} ${tr(aiAccessOf(current) === 'write' ? 'Les IA peuvent écrire ici' : 'Fermé aux IA')}</span>` : ''}</p>
          <button class="btn small voice-toggle" id="voice-toggle" aria-expanded="false">${icon('headphones', 16)} ${tr('Vocal')}</button>
          <span class="channel-tools"><button class="icon-btn ch-files-btn" data-ch-files title="${tr('Fichiers partagés dans ce salon')}" aria-label="${tr('Fichiers partagés dans ce salon')}">${icon('clip', 15)}</button><span class="pins-slot"></span>${B.isManager(p.id) ? `
            <button class="icon-btn" id="ch-rename" title="${tr('Modifier le salon')}" aria-label="${tr('Modifier le salon')}">${icon('edit', 15)}</button>
            ${current.id !== channels[0].id ? `<button class="icon-btn" id="ch-delete" title="${tr('Supprimer le salon')}">${icon('trash', 15)}</button>` : ''}` : ''}
          </span></header>
        <div class="voice-strip"></div>` : ''}
        <div class="chat-slot"></div>
      </section>
    </div>`;

  $('.add-channel', el).onclick = () => newChannel(p);

  // Médias et documents partagés dans ce salon (ils ne vont plus dans Documents depuis la 0.8.87, migration 052)
  $('[data-ch-files]', el)?.addEventListener('click', () => B.openChannelFiles(p, atelier ? ai : current).catch(B.error));

  // Responsables (Créateur, Administrateurs) : renommer / supprimer un salon (#général ne se supprime pas)
  $('#ch-rename', el)?.addEventListener('click', () => {
    const m = B.modal(`<h2>${tr('Modifier le salon')}</h2>
      <label>${tr('Nom')}</label><input id="cr-name" maxlength="40" value="${esc(current.name)}" />
      <label>${tr('Sujet (facultatif)')}</label><input id="cr-desc" maxlength="200" value="${esc(current.description || '')}" />
      ${aiAccessFields(aiAccessOf(current))}
      <p class="msg" id="cr-msg"></p>
      <div class="actions"><span class="spacer"></span><button class="btn" data-close>${tr('Annuler')}</button><button class="btn primary" id="cr-ok">${tr('Enregistrer')}</button></div>`);
    $('[data-close]', m).onclick = B.closeModal;
    $('#cr-ok', m).onclick = async () => {
      const name = $('#cr-name', m).value.trim().toLowerCase().replace(/\s+/g, '-');
      if (!name) return;
      const { data, error: err } = await B.sb.from('channels').update({ name, description: $('#cr-desc', m).value.trim() || null, ...aiAccessValue(m) })
        .eq('id', current.id).select('id');
      if (err || !data?.length) return ($('#cr-msg', m).textContent = err ? errText(err) : tr('Seuls le Créateur et les Administrateurs peuvent modifier un salon.'));
      B.closeModal();
      B.route();
    };
  });
  // Supprimer un salon (v0.8.87, Apo) : on prévient de sauvegarder ses fichiers ; s'il en a, la case « Fichiers du salon
  // sauvegardés » doit être cochée. Ceux qui restent dans le salon partent à la corbeille du projet (migration 052).
  $('#ch-delete', el)?.addEventListener('click', async () => {
    const { count } = await B.sb.from('files').select('id', { count: 'exact', head: true }).eq('channel_id', current.id);
    const n = count || 0;
    const m = B.modal(`<h2>${tr('Supprimer le salon #{name} ?', { name: esc(current.name) })}</h2>
      <p>${tr('Tous ses messages seront supprimés. C\'est définitif.')}</p>
      ${n ? `<div class="ch-del-files">
        <p>${icon('clip', 16)} <strong>${tr(n > 1 ? '{n} fichiers ont été partagés dans ce salon.' : '{n} fichier a été partagé dans ce salon.', { n })}</strong>
          ${tr('Sauvegardez ceux que vous voulez garder avant de supprimer le salon : « Ranger dans Documents » ou téléchargez-les. Les autres iront à la corbeille du projet (30 jours).')}</p>
        <button class="btn small" id="ch-del-see">${icon('clip', 15)} ${tr('Voir les fichiers du salon')}</button>
        <label class="check-line"><input type="checkbox" id="ch-del-ok" /> ${tr('Fichiers du salon sauvegardés')}</label>
      </div>` : ''}
      <div class="actions"><span class="spacer"></span><button class="btn" data-close>${tr('Annuler')}</button>
        <button class="btn danger" id="ch-del-go" ${n ? 'disabled' : ''}>${tr('Supprimer le salon')}</button></div>`);
    $('[data-close]', m).onclick = B.closeModal;
    $('#ch-del-see', m)?.addEventListener('click', () => B.openChannelFiles(p, current).catch(B.error));
    $('#ch-del-ok', m)?.addEventListener('change', (e) => { $('#ch-del-go', m).disabled = !e.target.checked; });
    $('#ch-del-go', m).onclick = async () => {
      if (n && !$('#ch-del-ok', m).checked) return;
      B.closeModal();
      try { await B.deleteRow('channels', current.id); } catch (err) { return B.error(err); }
      location.hash = `#/p/${p.id}/discussion`;
    };
  });

  // Qui est en vocal dans chaque salon, façon Discord (présence du projet, sounds.js) ; clic = ouvrir le salon
  const paintChanVoice = () => $$('[data-ch-voice]', el).forEach((box) => {
    const people = B.voiceIn(p.id, box.dataset.chVoice);
    box.innerHTML = people.map((x) => {
      const person = B.person(x.id);
      return `<a class="ch-voice-person" data-person="${esc(x.id)}" href="#/p/${p.id}/discussion/${box.dataset.chVoice}" title="${esc(person.display_name)}">
        <span class="voice-ring ${B.voice && B.voiceSpeaking(x.id) ? 'speaking' : ''}" data-voice-uid="${esc(x.id)}">${avatar(person, 20)}</span>
        <span class="ch-voice-name" translate="no">${esc(person.display_name)}</span>
        ${B.voiceStateIcons(x)}</a>`;
    }).join('');
    box.classList.toggle('hidden', !people.length);
    paintIcons(box);
  });
  paintChanVoice();
  B.onLeave(B.on('online', paintChanVoice));
  B.onLeave(B.on('voice', debounce(paintChanVoice, 400)));

  B.live('chans', 'channels', `project_id=eq.${p.id}`, debounce(() => {
    if (location.hash.startsWith(`#/p/${p.id}/discussion`) || location.hash.startsWith(`#/p/${p.id}/atelier`)) B.route();
  }, 300), 'INSERT');

  if (atelier && ai) return B.chat($('.chat-slot', el), { project: p, channel: ai, mode: 'ai' });
  // Téléphone : le bandeau vocal reste replié tant qu'on n'est pas dans le vocal ; le bouton « Vocal » l'ouvre
  $('#voice-toggle', el)?.addEventListener('click', (e) => {
    const strip = $('.voice-strip', el);
    const open = !strip.classList.contains('open');
    strip.classList.toggle('open', open);
    e.currentTarget.setAttribute('aria-expanded', String(open));
  });
  if (current) {
    if (!B.isGuest(p.id)) B.voiceStrip($('.voice-strip', el), p, current); // un invité n'a pas le vocal
    await B.chat($('.chat-slot', el), { project: p, channel: current, mode: 'team' });
  }
}

// ---------- Téléphone : la liste des salons (une ligne par salon, dernier message, non-lus) ----------
async function renderChannelList(el, p, channels, ai) {
  const all = [...channels, ...(ai ? [ai] : [])];
  const { data } = all.length
    ? await B.sb.from('messages').select('channel_id, content, created_at, author_id, is_ai, ai_provider')
      .in('channel_id', all.map((c) => c.id)).order('created_at', { ascending: false }).limit(80)
    : { data: [] };
  const last = new Map();
  (data || []).forEach((m) => { if (!last.has(m.channel_id)) last.set(m.channel_id, m); });
  const when = (iso) => {
    const d = new Date(iso);
    return isoDay(d) === isoDay() ? d.toLocaleTimeString(B.locale(), { hour: '2-digit', minute: '2-digit' }) : fmtDate(isoDay(d));
  };
  const row = (c) => {
    const m = last.get(c.id);
    const who = m ? (m.is_ai ? aiName(m.ai_provider, B.person(m.author_id)) : B.person(m.author_id).display_name) : '';
    const preview = m ? `${esc(who)} : ${esc(String(m.content || '').replace(/[*`#>_]/g, '').replace(/\s+/g, ' ').slice(0, 90))}` : tr('Pas encore de message');
    const inVoice = c.kind === 'team' ? B.voiceIn(p.id, c.id).length : 0;
    const href = c.kind === 'ai' ? `#/p/${p.id}/atelier` : `#/p/${p.id}/discussion/${c.id}`;
    return `<a class="chan-row" href="${href}">
      <span class="chan-ico ${c.kind === 'ai' ? 'ai' : ''}">${icon(c.kind === 'ai' ? 'spark' : 'hash', 22)}</span>
      <span class="chan-text">
        <span class="chan-top"><b>${c.kind === 'ai' ? tr('Atelier IA') : esc(c.name)}</b>${c.kind === 'team' ? aiAccessMark(c) : ''}${m ? `<small>${esc(when(m.created_at))}</small>` : ''}</span>
        <span class="chan-bottom"><span translate="no">${preview}</span>
          ${inVoice ? `<span class="chan-voice" title="${tr('En vocal')}">${icon('headphones', 14)} ${inVoice}</span>` : ''}
          <span class="unread-badge hidden" data-unread="channel:${c.id}"></span></span>
      </span></a>`;
  };
  el.innerHTML = `<div class="chan-list">
    <section><h2 class="sec-title">${tr('Entre humains')}</h2>${channels.map(row).join('')}
      <button class="add-channel chan-add">${icon('plus', 20)} ${tr('Nouveau salon')}</button></section>
    ${ai ? `<section><h2 class="sec-title">${tr('Avec les IA')}</h2>${row(ai)}<p class="muted small">${tr('Les IA écrivent ici, et dans les salons que vous leur ouvrez.')}</p></section>` : ''}
  </div>`;
  B.paintUnread(el);
  $('.add-channel', el).onclick = () => newChannel(p);

  // Médias et documents partagés dans ce salon (ils ne vont plus dans Documents depuis la 0.8.87, migration 052)
  $('[data-ch-files]', el)?.addEventListener('click', () => B.openChannelFiles(p, atelier ? ai : current).catch(B.error));
  B.live('chans', 'channels', `project_id=eq.${p.id}`, debounce(() => { if (location.hash === `#/p/${p.id}/discussion`) B.route(); }, 300), 'INSERT');
  B.live('chan-list-msgs', 'messages', null, debounce(() => { if (location.hash === `#/p/${p.id}/discussion`) B.route(); }, 800), 'INSERT');
}

