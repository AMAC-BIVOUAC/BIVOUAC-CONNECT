// =====================================================================
// messages.js — encart « En ligne » (colonne de gauche) et messages privés
// entre deux personnes qui partagent au moins un projet (migration 024).
// Une conversation ne dépend d'aucun projet. Lisible par les deux personnes
// seulement (et par l'IA de l'une d'elles via le connecteur, avec ses droits).
// Page : #/messages (liste) et #/messages/<identifiant de la personne>.
// =====================================================================

B.dmUnread = new Map(); // expéditeur -> nombre de messages non lus
B.dmOpen = null;        // personne dont la conversation est affichée

/** Mes coéquipiers : toutes les personnes de mes projets, sans moi */
B.teammates = () => {
  const ids = new Set();
  for (const list of B.members.values()) for (const m of list) if (m.user_id !== B.me?.id) ids.add(m.user_id);
  return [...ids].map((id) => B.person(id)).sort((a, b) => a.display_name.localeCompare(b.display_name, B.locale()));
};

const dmTotal = () => [...B.dmUnread.values()].reduce((a, b) => a + b, 0) + (B.noticesUnread || 0);

// ---------- Avis de l'équipe Bivouac (migration 042) : contenu masqué, suspension, signalement traité… ----------
// Une conversation en lecture seule « Équipe Bivouac » en tête de Messages (#/messages/equipe).
B.notices = [];
B.noticesUnread = 0;
B.loadNotices = async () => {
  const { data, error } = await B.sb.from('staff_notices').select('*').order('created_at', { ascending: false }).limit(100);
  if (error) return; // migration 042 pas encore en ligne
  B.notices = data || [];
  B.noticesUnread = B.notices.filter((n) => !n.read_at).length;
  paintDmBadges();
};

function paintDmBadges() {
  const total = dmTotal();
  const badge = $('#dm-badge');
  for (const b of [badge, $('#bnav-dm')]) if (b) { b.textContent = total > 99 ? '99+' : total; b.classList.toggle('hidden', !total); }
  $$('[data-dm-unread]').forEach((el) => {
    const n = B.dmUnread.get(el.dataset.dmUnread) || 0;
    el.textContent = n > 99 ? '99+' : n;
    el.classList.toggle('hidden', !n);
  });
}

B.paintDmBadges = paintDmBadges;

/** La photo d'une personne avec, posée dessus, la pastille de ses messages privés non lus (et sa présence) */
B.dmAvatar = (person, size = 26, { presence = true } = {}) =>
  `<span class="online-av">${avatar(person, size)}${presence ? `<span class="presence ${B.presenceClass(person.id)}" data-online="${person.id}" title="${esc(B.statusText(person.id))}"></span>` : ''}<span class="av-badge hidden" data-dm-unread="${person.id}" title="${esc(tr('Messages privés non lus'))}"></span></span>`;

/** Les non-lus ont changé : pastilles, et l'encart (une personne hors ligne qui m'a écrit y apparaît) */
function dmChanged() { B.renderOnline(); }

B.loadDmUnread = async () => {
  const { data, error } = await B.sb.rpc('dm_unread');
  if (error) return console.warn('Messages privés non lus', error.message); // ex. migration 024 pas encore appliquée
  B.dmUnread = new Map((data || []).map((r) => [r.sender_id, Number(r.unread)]));
  dmChanged();
};

// ---------- Encart « En ligne » de la colonne de gauche ----------

B.renderOnline = () => {
  const box = $('#online-list');
  if (!box || !B.me) return;
  // Dans un projet : seulement ses membres ; ailleurs : tous mes coéquipiers
  const pid = (location.hash.match(/^#\/p\/([0-9a-f-]{36})/) || [])[1];
  const project = pid ? B.project(pid) : null;
  const people = project ? B.projectMembers(pid).filter((m) => m.id !== B.me.id) : B.teammates();
  const on = people.filter((m) => B.online.has(m.id));
  // Les personnes hors ligne qui m'ont écrit restent visibles (grisées) tant que je n'ai pas lu, quel que soit le projet
  const waiting = B.teammates().filter((m) => !B.online.has(m.id) && B.dmUnread.get(m.id));
  const scope = $('#online-scope');
  if (scope) { scope.textContent = project ? ` · ${project.name}` : ''; scope.title = project ? project.name : ''; }
  const row = (m, offline) => `<a class="online-person ${offline ? 'offline' : ''}" href="#/messages/${m.id}" title="${esc(B.dmUnread.get(m.id)
      ? tr('{name} vous a écrit en privé', { name: m.display_name }) : tr('Écrire à {name}', { name: m.display_name }))}">
        ${B.dmAvatar(m, 26)}
        <span class="online-who"><span class="space-name" translate="no">${esc(m.display_name)}</span>${!offline && (B.statusOf(m.id)?.state !== 'free' || B.statusOf(m.id)?.text)
          ? `<small class="online-status">${esc(B.statusText(m.id))}</small>` : ''}${B.localTimeHtml?.(m) || ''}</span>
        ${B.voiceWhere?.(m.id, project ? pid : null) ? `<span class="online-voice" title="${esc(tr('En vocal'))}">${icon('headphones', 13)}</span>` : ''}
        <span class="online-dm" aria-hidden="true">${icon('whisper', 15)}</span></a>`;
  box.innerHTML = (on.length
    ? on.map((m) => row(m, false)).join('')
    : `<p class="nav-empty">${project ? tr('Personne d\'autre de ce projet en ligne') : tr('Personne d\'autre en ligne')}</p>`)
    + (waiting.length ? `<div class="online-waiting">${tr('Vous ont écrit')}</div>${waiting.map((m) => row(m, true)).join('')}` : '');
  $('#online-count') && ($('#online-count').textContent = on.length ? String(on.length) : '');
  paintDmBadges();
};
B.on('online', () => { B.renderOnline(); if (B.dmOpen) B.emit('dm-presence'); });

// ---------- Temps réel : nouveau message privé pour moi ----------

/** Un message privé pour moi est arrivé (en direct, ou rattrapé après une coupure : B.catchUp) */
const seenDms = new Set();
const onIncomingDm = (msg) => {
  if (seenDms.has(msg.id)) return;
  seenDms.add(msg.id);
  B.emit('dm', msg);
  if (msg.sender_id === B.dmOpen && !document.hidden && document.hasFocus() && B.dmAtBottom?.()) return;
  B.dmUnread.set(msg.sender_id, (B.dmUnread.get(msg.sender_id) || 0) + 1);
  dmChanged();
  if (B.notifySettings?.prefs.dm === false) return; // Paramètres → Notifications : messages privés coupés
  B.playSound('notif');
  const who = B.person(msg.sender_id).display_name;
  B.pcNotify(tr('Message privé de {name}', { name: who }), String(msg.content || '').replace(/\s+/g, ' ').trim().slice(0, 140),
    B.soundPrefs().notif, `#/messages/${msg.sender_id}`, { group: { id: 'messages', title: tr('Messages privés') }, tag: `d-${msg.id}` });
  if (msg.sender_id !== B.dmOpen) {
    B.toast(`${tr('Message privé de {name}', { name: `<span translate="no">${esc(who)}</span>` })} <a href="#/messages/${msg.sender_id}">${tr('Ouvrir')}</a>`);
  }
};

B.startDmLive = () => {
  B.loadDmUnread();
  const since = B.catchUpSince();
  B.sb.channel('me-dm')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages', filter: `recipient_id=eq.${B.me.id}` }, (p) => onIncomingDm(p.new))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'staff_notices', filter: `user_id=eq.${B.me.id}` }, (p) => {
      B.notices.unshift(p.new);
      B.noticesUnread += 1;
      paintDmBadges();
      B.toast(`${tr('Message de l’équipe Bivouac')} <a href="#/messages/equipe">${tr('Ouvrir')}</a>`);
      B.playSound('notif');
      B.pcNotify(tr('Message de l’équipe Bivouac'), String(p.new.text || '').replace(/[*_#`>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 140),
        B.soundPrefs().notif, '#/messages/equipe', { group: { id: 'equipe', title: tr('Équipe Bivouac') }, tag: `s-${p.new.id}` });
      if (/^#\/messages(\/equipe)?$/.test(location.hash)) B.route();
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'direct_messages', filter: `sender_id=eq.${B.me.id}` }, (p) => { B.emit('dm-read', p.new); B.emit('dm-change', p.new); })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'direct_messages', filter: `recipient_id=eq.${B.me.id}` }, (p) => { B.emit('dm-change', p.new); if (p.new.deleted_at) B.loadDmUnread(); })
    // Reconnexion (veille du PC, réseau coupé) : les messages privés arrivés pendant la coupure préviennent quand même
    .subscribe(B.onRejoin(async () => {
      B.loadDmUnread();
      const { data } = await B.sb.from('direct_messages').select('*').eq('recipient_id', B.me.id)
        .gt('created_at', since.get()).is('read_at', null).is('deleted_at', null).order('created_at').limit(10);
      (data || []).forEach((m) => { since.see(m.created_at); onIncomingDm(m); });
    }));
};

/** Documents privés : bucket séparé, jamais ajoutés aux documents du projet. */
B.uploadDmFile = async (other, file) => {
  const path = `${B.me.id}/${other}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]+/g, '_').slice(-80)}`;
  const { error } = await B.sb.storage.from('dm-files').upload(path, file, { contentType: file.type || undefined });
  if (error) throw error;
  return { path, name: file.name, size: file.size, mime: file.type || 'application/octet-stream' };
};

B.openDmFile = async (file, messageId, index) => {
  const { data, error } = await B.sb.storage.from('dm-files').createSignedUrl(file.path, 300);
  if (error) throw error;
  // Copie locale seulement : aucune surveillance ni modification d'un document de projet.
  if (window.bivouac.openFile) await window.bivouac.openFile({ url: data.signedUrl, name: file.name,
    id: `dm-${messageId}-${index}`, version: 1, readonly: true });
  else await window.bivouac.openExternal(data.signedUrl);
};

// ---------- Page « Messages » ----------

/** Ligne « Équipe Bivouac » de la liste des conversations (seulement si elle a déjà écrit) */
const noticesRow = (on) => B.notices.length ? `<a class="dm-person ${on ? 'on' : ''} ${B.noticesUnread ? 'unread' : ''}" href="#/messages/equipe">
  <span class="online-av"><span class="avatar staff-av" style="width:34px;height:34px">${icon('lock', 16)}</span>${B.noticesUnread ? `<span class="av-badge">${B.noticesUnread}</span>` : ''}</span>
  <span class="dm-person-text"><strong>${tr('Équipe Bivouac')}</strong><small translate="no">${esc(B.notices[0].text.slice(0, 60))}</small></span></a>` : '';

async function renderNotices(view) {
  view.innerHTML = `<div class="page dm-page has-conv">
    <div class="page-head"><h1>${tr('Messages')}</h1></div>
    <div class="dm card"><aside class="dm-list">${noticesRow(true)}</aside>
      <section class="dm-conv"><header class="dm-head"><a class="icon-btn dm-back" href="#/messages" title="${tr('Retour')}">${icon('arrow', 16)}</a>
        <span class="avatar staff-av" style="width:32px;height:32px">${icon('lock', 15)}</span><div><strong>${tr('Équipe Bivouac')}</strong>
        <small>${tr('Modération de l’application · lecture seule')}</small></div></header>
        <div class="dm-msgs">${B.notices.slice().reverse().map((n) => `<div class="dm-msg staff-notice">
          <div class="dm-bubble">${n.kind === 'ai_watch' ? `<div class="msg-text" translate="no">${md(n.text)}</div>` : `<p translate="no">${esc(n.text)}</p>`}
            ${n.excerpt ? `<blockquote class="small report-quote" translate="no">${esc(n.excerpt)}</blockquote>` : ''}
            ${n.reason ? `<p class="small"><b>${tr('Raison :')}</b> <span translate="no">${esc(n.reason)}</span></p>` : ''}</div>
          <small>${fmtDate(n.created_at)} ${fmtTime(n.created_at)}</small></div>`).join('') || `<p class="muted small dm-pad">${tr('Aucun message pour l\'instant.')}</p>`}</div>
        <p class="muted small dm-pad">${tr('Une question sur une décision de l’équipe ? Écrivez à {email}.', { email: B.CONTACT_EMAIL || 'contact@bivouac-tech.com' })}</p>
      </section></div></div>`;
  const box = $('.dm-msgs', view);
  box.scrollTop = box.scrollHeight;
  if (B.noticesUnread) {
    await B.sb.rpc('mark_staff_notices_read');
    B.notices.forEach((n) => { n.read_at = n.read_at || new Date().toISOString(); });
    B.noticesUnread = 0;
    paintDmBadges();
  }
}

B.pages.messages = async (view, [otherId]) => {
  if (otherId === 'equipe') { await B.loadNotices(); return renderNotices(view); }
  const people = B.teammates();
  const other = otherId ? people.find((m) => m.id === otherId) : null;
  B.dmOpen = other?.id || null;
  B.onLeave(() => { B.dmOpen = null; });

  view.innerHTML = `
    <div class="page dm-page ${other ? 'has-conv' : ''}">
      <div class="page-head"><h1>${tr('Messages')}</h1></div>
      <div class="dm card">
        <aside class="dm-list"><div class="loading">${tr('Chargement…')}</div></aside>
        <section class="dm-conv">${other ? '' : `<div class="empty">${icon('chat', 30)}<p>${
          people.length ? tr('Choisissez une personne pour lui écrire en privé.') : tr('Invitez quelqu\'un dans un projet pour pouvoir lui écrire.')}</p></div>`}</section>
      </div>
      <p class="muted small dm-note">${icon('lock', 13)} ${tr('Visible seulement par vous deux. Votre IA peut lire vos propres conversations si vous le lui demandez (connecteur).')}</p>
    </div>`;

  // Liste des conversations : dernier message avec chaque coéquipier
  const renderList = async () => {
    const { data, error } = await B.sb.from('direct_messages').select('sender_id, recipient_id, content, attachments, created_at, deleted_at')
      .order('created_at', { ascending: false }).limit(400);
    if (error) {
      $('.dm-list', view).innerHTML = `<p class="muted small dm-pad">${/direct_messages/.test(error.message || '')
        ? tr('Les messages privés ne sont pas encore installés sur le serveur (migration 024).') : esc(errText(error))}</p>`;
      return;
    }
    const last = new Map();
    for (const d of data || []) { const o = d.sender_id === B.me.id ? d.recipient_id : d.sender_id; if (!last.has(o)) last.set(o, d); }
    const sorted = [...people].sort((a, b) => (last.get(b.id)?.created_at || '').localeCompare(last.get(a.id)?.created_at || '')
      || a.display_name.localeCompare(b.display_name, B.locale()));
    $('.dm-list', view).innerHTML = noticesRow(false) + sorted.map((m) => {
      const l = last.get(m.id);
      const unread = B.dmUnread.get(m.id);
      return `<a class="dm-person ${m.id === other?.id ? 'on' : ''} ${unread ? 'unread' : ''}" href="#/messages/${m.id}">
        ${B.dmAvatar(m, 34)}
        <span class="dm-person-text"><strong translate="no">${esc(m.display_name)}</strong>
          <small translate="no">${l ? `${l.sender_id === B.me.id ? tr('Vous :') + ' ' : ''}${esc(((l.deleted_at ? tr('Message supprimé') : l.content) || (l.attachments?.length ? tr('Pièce jointe') : '')).replace(/[*`#]/g, '').replace(/\s+/g, ' ').slice(0, 60))}` : `<em>${tr('Aucun message')}</em>`}</small></span></a>`;
    }).join('') || (B.notices.length ? '' : `<p class="muted small dm-pad">${tr('Personne pour l\'instant.')}</p>`);
    paintDmBadges();
  };
  await renderList();
  B.onLeave(B.on('dm-presence', () => B.paintPresence(view)));

  if (!other) {
    B.onLeave(B.on('dm-change', debounce(renderList, 300)));
    B.onLeave(B.on('dm', debounce(renderList, 300)));
    return;
  }

  // Conversation avec une personne
  const conv = $('.dm-conv', view);
  conv.innerHTML = `
    <header class="dm-head"><a class="icon-btn dm-back" href="#/messages" title="${tr('Retour')}">${icon('arrow', 16)}</a>
      ${avatar(other, 32)}<div><strong translate="no">${esc(other.display_name)}</strong><small class="dm-status"></small>${B.localTimeHtml?.(other, { mode: 'chez' }) || ''}</div>
      <span class="pins-slot dm-pins"></span></header>
    <div class="dm-msgs"><div class="loading">${tr('Chargement…')}</div></div>
    <form class="dm-compose"><div class="reply-bar hidden"></div><div class="dm-pending"></div><div class="dm-compose-row">
      <button type="button" class="icon-btn dm-attach" title="${tr('Joindre un fichier')}">${icon('plus', 20)}</button>
      <input type="file" class="dm-file-input hidden" multiple />
      <textarea rows="2" maxlength="4000" placeholder="${esc(tr('Écrire à {name}…', { name: other.display_name }))}"></textarea>
      <button class="btn primary" type="submit" title="${tr('Envoyer')}">${icon('send', 16)}</button></div><small class="muted">${tr('10 fichiers maximum · 50 Mo par fichier')}</small></form>`;
  const status = () => { $('.dm-status', conv).textContent = B.statusText(other.id); };
  status();
  B.onLeave(B.on('dm-presence', status));

  B.watchMessageImages(conv);
  const box = $('.dm-msgs', conv);
  const shown = new Map();
  const parents = new Map(); // messages cités par une réponse, absents des 200 derniers
  let pins = [], pinsReady = true, replyTo = null, pinsPop = null, pinsBtn = null;
  let active = true, loading = true, reading = false, sending = false, editing = null;
  const atBottom = () => box.scrollHeight - box.scrollTop - box.clientHeight < 32;
  B.dmAtBottom = atBottom;
  const readConversation = async () => {
    if (!active || loading || reading || document.hidden || !document.hasFocus() || !atBottom()) return;
    const received = [...shown.values()].filter((d) => d.recipient_id === B.me.id && !d.read_at && !d.deleted_at);
    if (!received.length) return;
    const until = received.reduce((latest, d) => d.created_at > latest ? d.created_at : latest, '');
    reading = true;
    const { error } = await B.sb.rpc('mark_dm_read_until', { p_other: other.id, p_until: until });
    reading = false;
    if (error) { console.warn('Lecture des messages privés', error.message); return; }
    received.forEach((d) => { d.read_at = new Date().toISOString(); });
    // Recharger plutôt que supprimer le compteur : un message peut arriver pendant l'appel.
    await B.loadDmUnread();
    if (active) readConversation();
  };
  B.onLeave(() => { active = false; B.dmAtBottom = null; });
  const indicator = (d) => B.readIndicator({ seen: Boolean(d.read_at), label: d.read_at
    ? `${tr('Vu par {names}', { names: other.display_name })} · ${fmtDate(d.read_at)} ${fmtTime(d.read_at)}` : tr('Envoyé') });
  const receipt = (d) => d.sender_id === B.me.id && !d.deleted_at ? ` <span class="dm-receipt">${indicator(d)}</span>` : '';
  const whoDm = (d) => (d.sender_id === B.me.id ? B.me : other).display_name;
  const dmReactions = (d) => (Array.isArray(d.reactions) ? d.reactions : []).map((r) => ({ emoji: r.e, user_id: r.u }));
  // Citation au-dessus d'une réponse (clic = aller au message cité)
  const replyQuote = (d) => {
    if (!d.reply_to) return '';
    const p = shown.get(d.reply_to) || parents.get(d.reply_to);
    if (!p || p.deleted_at) return `<div class="msg-reply gone">${icon('reply', 13)} <span>${tr('Message supprimé')}</span></div>`;
    return `<button type="button" class="msg-reply" data-jump-reply="${esc(p.id)}" title="${tr('Aller au message')}">${icon('reply', 13)}
      <strong translate="no">${esc(whoDm(p))}</strong><span translate="no">${esc(B.msgFirstLine(p.content) || (p.attachments?.length ? tr('Pièce jointe') : ''))}</span></button>`;
  };
  // Regroupement façon WhatsApp : bulles d'un même expéditeur rapprochées ; l'heure (et les coches) sous la
  // dernière bulle de la minute seulement. Bloc coupé après 5 minutes de silence (B.msgSameGroup, msgmenu.js).
  const sender = (d) => d.sender_id;
  const neighbours = (d) => {
    const list = [...shown.values()], i = list.indexOf(shown.get(d.id));
    return i < 0 ? [list[list.length - 1], null] : [list[i - 1], list[i + 1]];
  };
  const footer = (d, showTime) => {
    const parts = [
      d.pinned_at && !d.deleted_at ? `<span class="pin-tag">${icon('pin', 12)} ${tr('Épinglé')}</span>` : '',
      showTime ? fmtTime(d.created_at) : '',
      d.edited_at && !d.deleted_at ? tr('(modifié)') : '',
    ].filter(Boolean);
    const tail = showTime ? receipt(d) : '';
    return parts.length || tail ? `<small>${parts.join(' · ')}${tail}</small>` : '';
  };
  const bubble = (d) => {
    const [prev, next] = neighbours(d);
    const cont = B.msgSameGroup(prev, d, sender);
    const showTime = !(B.msgSameGroup(d, next, sender) && B.msgSameMinute(d, next));
    return `<div class="dm-msg ${d.sender_id === B.me.id ? 'mine' : ''} ${cont ? 'cont' : ''} ${d.pinned_at && !d.deleted_at ? 'pinned' : ''}" data-dm-id="${esc(d.id)}">
    ${d.deleted_at ? '' : replyQuote(d)}
    ${d.deleted_at ? `<em class="muted">${tr('Message supprimé')}</em>` : editing?.id === d.id ? `<div class="msg-edit"><textarea rows="2" maxlength="4000">${esc(editing.draft)}</textarea>
      <div class="msg-edit-actions"><button type="button" class="btn small" data-dm-cancel>${tr('Annuler')}</button><button type="button" class="btn small primary" data-dm-save>${tr('Enregistrer')}</button></div></div>`
      : d.content ? `<div class="dm-bubble" translate="no">${md(d.content)}</div>` : ''}
    ${(d.attachments || []).map((f, i) => `${B.messageMedia(f, 'dm-files') ? `<div class="file-media">${B.messageMedia(f, 'dm-files')}</div>` : ''}<button type="button" class="file-card dm-file" data-dm-file="${i}" title="${tr('Ouvrir')}">
      ${B.messageImage(f, 'dm-files')}${icon('file', 20)}<span><strong translate="no">${esc(f.name)}</strong><small>${fmtSize(f.size)}</small></span></button>`).join('')}
    ${d.deleted_at ? '' : B.reactionsHtml(dmReactions(d))}
    ${d.hidden_at && !d.deleted_at ? `<small class="hidden-note">${icon('eyeoff', 12)} ${tr('Masqué par l’équipe Bivouac : vous seul le voyez.')}</small>` : ''}
    ${footer(d, showTime)}
    ${d.deleted_at ? '' : `<div class="dm-tools">
      <button type="button" class="icon-btn" data-dm-quick="reply" title="${tr('Répondre')}" aria-label="${tr('Répondre')}">${icon('reply', 15)}</button>
      <button type="button" class="icon-btn" data-dm-quick="react" title="${tr('Ajouter une réaction')}" aria-label="${tr('Ajouter une réaction')}">${icon('smile', 15)}</button>
      <button type="button" class="icon-btn" data-dm-menu aria-haspopup="menu" aria-expanded="false" title="${tr('Plus d’actions (ou clic droit sur le message)')}" aria-label="${tr('Actions du message')}">⋯</button></div>`}</div>`;
  };
  const repaint = id => {
    const el = box.querySelector(`[data-dm-id="${id}"]`), d = shown.get(id);
    if (el && d) el.replaceWith(h(bubble(d)));
  };
  const change = d => {
    if (!active || !shown.has(d.id)) return;
    shown.set(d.id, d);
    syncPin(d);
    if (d.deleted_at && editing?.id === d.id) editing = null;
    if (editing?.id !== d.id) repaint(d.id);
    renderList();
  };
  B.onLeave(B.on('dm-change', change));
  const cancelEdit = () => { const id = editing?.id; if (editing?.saving) return; editing = null; if (id) repaint(id); };
  const saveEdit = async () => {
    if (!editing || editing.saving) return;
    const current = editing, d = shown.get(current.id);
    if (!current.draft.trim() && !d.attachments?.length) return B.toast(tr("Un message ne peut pas être vide. Pour l'effacer, utilisez Supprimer."), { type: 'error' });
    current.saving = true;
    const controls = $$('textarea, button', box.querySelector(`[data-dm-id="${current.id}"] .msg-edit`));
    controls.forEach(el => { el.disabled = true; });
    try {
      const { data, error } = await B.sb.rpc('edit_dm_message', { p_message: current.id, p_content: current.draft.trim() });
      if (error) throw error;
      if (!data) throw new Error(tr('Message introuvable.'));
      if (active) { editing = null; change(data); }
    } catch (err) { B.error(err); }
    finally { current.saving = false; controls.forEach(el => { el.disabled = false; }); }
  };
  box.addEventListener('input', e => { if (editing && e.target.matches('.msg-edit textarea')) editing.draft = e.target.value; });
  box.addEventListener('keydown', e => {
    if (!editing || !e.target.matches('.msg-edit textarea') || e.isComposing) return;
    if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(); }
  });
  const add = (d) => {
    if (shown.has(d.id)) return;
    const follow = atBottom();
    shown.set(d.id, d);
    box.querySelector('.empty-dm')?.remove();
    box.insertAdjacentHTML('beforeend', bubble(d));
    // La bulle d'avant peut perdre son heure (même minute, même expéditeur) : on la redessine
    const [prev] = neighbours(d);
    if (prev && editing?.id !== prev.id && B.msgSameGroup(prev, d, sender)) repaint(prev.id);
    if (follow) box.scrollTop = box.scrollHeight;
  };
  box.addEventListener('click', async (e) => {
    const msg = e.target.closest('[data-dm-id]'), d = shown.get(msg?.dataset.dmId);
    const menuBtn = e.target.closest('[data-dm-menu]');
    if (menuBtn && d) return openDmMenu(d.id, { anchor: menuBtn });
    const quick = e.target.closest('[data-dm-quick]');
    if (quick && d) return dmAct(quick.dataset.dmQuick, d.id);
    const rb = e.target.closest('.reaction');
    if (rb && d) return toggleDmReaction(d, rb.dataset.emoji);
    const jump = e.target.closest('[data-jump-reply]');
    if (jump) return jumpTo(jump.dataset.jumpReply);
    if (e.target.closest('[data-dm-cancel]')) return cancelEdit();
    if (e.target.closest('[data-dm-save]')) return saveEdit();
    const read = e.target.closest('.read-indicator');
    if (read) return B.showReadDetails(read);
    const btn = e.target.closest('[data-dm-file]');
    if (!btn) return;
    const attached = shown.get(btn.closest('[data-dm-id]').dataset.dmId);
    const i = Number(btn.dataset.dmFile);
    B.openDmFile(attached.attachments[i], attached.id, i).catch(B.error);
  });
  // S'abonner avant le chargement : aucun message perdu entre la requête et l'écoute.
  B.onLeave(B.on('dm', (d) => {
    if (!active) return;
    if (d.sender_id === other.id) { add(d); readConversation(); }
    renderList();
  }));
  const updateReceipt = (d) => {
    const old = shown.get(d.id);
    if (!old || !d.read_at) return;
    old.read_at = d.read_at;
    const el = box.querySelector(`[data-dm-id="${d.id}"] .dm-receipt`);
    if (el) {
      const next = h(indicator(old));
      if (el.firstElementChild?.getAttribute('aria-label') !== next.getAttribute('aria-label')) el.replaceChildren(next);
    }
  };
  B.onLeave(B.on('dm-read', updateReceipt));
  const refreshReceipts = async () => {
    if (!active || document.hidden) return;
    const { data } = await B.sb.from('direct_messages').select('*')
      .or(`and(sender_id.eq.${B.me.id},recipient_id.eq.${other.id}),and(sender_id.eq.${other.id},recipient_id.eq.${B.me.id})`).order('created_at', { ascending: false }).limit(200);
    if (active) (data || []).forEach(d => {
      const old = shown.get(d.id);
      if (!old) add(d);
      else if (old.content !== d.content || old.deleted_at !== d.deleted_at || old.edited_at !== d.edited_at
        || old.pinned_at !== d.pinned_at || JSON.stringify(old.reactions || []) !== JSON.stringify(d.reactions || [])) change(d);
      else updateReceipt(d);
    });
  };
  const onFocus = () => { readConversation(); refreshReceipts(); };
  window.addEventListener('focus', onFocus);
  document.addEventListener('visibilitychange', onFocus);
  box.addEventListener('scroll', readConversation);
  // Repli après une reconnexion temps réel, uniquement tant que la conversation est ouverte.
  const timer = setInterval(onFocus, 15000);
  B.onLeave(() => { clearInterval(timer); window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus); });

  const { data: msgs, error } = await B.sb.from('direct_messages').select('*')
    .or(`and(sender_id.eq.${B.me.id},recipient_id.eq.${other.id}),and(sender_id.eq.${other.id},recipient_id.eq.${B.me.id})`)
    .order('created_at', { ascending: false }).limit(200);
  if (!active) return;
  // Fusionner avec les messages arrivés pendant le chargement, puis ranger dans l'ordre.
  const all = new Map((msgs || []).map((d) => [d.id, d]));
  shown.forEach((d, id) => all.set(id, d));
  shown.clear();
  box.innerHTML = '';
  if (error) box.innerHTML = `<p class="muted small dm-pad">${esc(errText(error))}</p>`;
  else if (!all.size) box.innerHTML = `<p class="muted small empty-dm dm-pad">${tr('Aucun message pour l\'instant. Dites bonjour !')}</p>`;
  [...all.values()].sort((a, b) => a.created_at.localeCompare(b.created_at)).forEach(add);
  box.scrollTop = box.scrollHeight;
  loading = false;
  refreshReceipts();

  const form = $('.dm-compose', conv), ta = $('textarea', form), input = $('.dm-file-input', form);
  let pending = [];
  const addMediaFiles = files => {
    const accepted = B.acceptFiles(files);
    if (!accepted.length) return false;
    if (pending.length + accepted.length > 10) { B.toast(tr('10 fichiers maximum par message.'), { type: 'error' }); return false; }
    pending.push(...accepted); paintPending(); return true;
  };
  const previewPending = B.bindMediaComposer(form, ta, addMediaFiles);
  const paintPending = () => {
    $('.dm-pending', form).innerHTML = pending.map((f, i) => `<span class="attach-chip"><span translate="no">${esc(f.name)}</span> (${fmtSize(f.size)})
      <button type="button" data-remove-file="${i}" title="${tr('Retirer')}">×</button></span>`).join('');
    previewPending($('.dm-pending', form), pending);
  };
  $('.dm-attach', form).onclick = () => input.click();
  input.onchange = () => {
    const accepted = B.acceptFiles(input.files);
    if (pending.length + accepted.length > 10) B.toast(tr('10 fichiers maximum par message.'), { type: 'error' });
    pending.push(...accepted.slice(0, Math.max(0, 10 - pending.length)));
    input.value = '';
    paintPending();
  };
  $('.dm-pending', form).onclick = (e) => {
    const b = e.target.closest('[data-remove-file]');
    if (b && !sending) { pending.splice(Number(b.dataset.removeFile), 1); paintPending(); }
  };
  ta.focus();
  readConversation();
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && replyTo) { e.preventDefault(); return cancelReply(); }
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
  });
  form.onsubmit = async (e) => {
    e.preventDefault();
    const content = ta.value.trim();
    if (sending || (!content && !pending.length)) return;
    sending = true;
    $$('button, textarea, input', form).forEach((el) => { el.disabled = true; });
    const uploaded = [];
    let committed = false;
    try {
      for (const f of pending) uploaded.push(await B.uploadDmFile(other.id, f));
      const payload = { sender_id: B.me.id, recipient_id: other.id, content };
      if (uploaded.length) payload.attachments = uploaded;
      const answering = replyTo && shown.has(replyTo.id) ? replyTo.id : null;
      if (answering) payload.reply_to = answering;
      let { data, error: err } = await B.sb.from('direct_messages').insert(payload).select().single();
      // Migration 044 pas encore appliquée : on envoie sans la citation plutôt que de bloquer le message
      if (err && answering && /reply_to/.test(err.message || '')) {
        delete payload.reply_to;
        ({ data, error: err } = await B.sb.from('direct_messages').insert(payload).select().single());
      }
      if (err) throw new Error(/row-level security/.test(err.message || '') ? tr('Vous ne partagez plus de projet avec cette personne.') : errText(err));
      committed = true;
      if (answering) cancelReply();
      B.sendPush('dm', data.id);
      ta.value = '';
      B.grammarReset?.(ta);
      pending = [];
      paintPending();
      if (active) { add(data); box.scrollTop = box.scrollHeight; renderList(); }
    } catch (err) {
      // Ne supprimer que les fichiers provisoires : la base protège ceux déjà envoyés.
      if (!committed && uploaded.length) await B.sb.storage.from('dm-files').remove(uploaded.map((f) => f.path));
      B.error(err);
    } finally {
      sending = false;
      $$('button, textarea, input', form).forEach((el) => { el.disabled = false; });
      if (active) ta.focus();
    }
  };

  // ---------------- Menu d'un message (le même que dans les salons : msgmenu.js) ----------------

  async function loadParents(list) {
    const need = [...new Set(list.map((d) => d.reply_to).filter((id) => id && !shown.has(id) && !parents.has(id)))];
    if (!need.length) return;
    const { data } = await B.sb.from('direct_messages').select('*').in('id', need);
    need.forEach((id) => parents.set(id, (data || []).find((x) => x.id === id) || null));
    if (active) list.filter((d) => need.includes(d.reply_to)).forEach((d) => { if (editing?.id !== d.id) repaint(d.id); });
  }

  function openDmMenu(id, { x, y, anchor } = {}) {
    const d = shown.get(id);
    if (!d || d.deleted_at) return;
    const mine = d.sender_id === B.me.id;
    const items = [
      { act: 'reply', icon: 'reply', label: tr('Répondre') },
      { act: 'copy', icon: 'copy', label: tr('Copier le message') },
      ...(pinsReady ? [{ act: 'pin', icon: 'pin', label: d.pinned_at ? tr('Désépingler') : tr('Épingler') }] : []),
      ...(mine ? [{ act: 'edit', icon: 'edit', label: tr('Modifier') }, { act: 'del', icon: 'trash', label: tr('Supprimer'), danger: true }]
        : [{ act: 'report', icon: 'flag', label: tr('Signaler') }])
    ];
    B.openMsgMenu({ key: id, x, y, anchor, items, scroller: box, msgEl: box.querySelector(`[data-dm-id="${id}"]`),
      reacted: dmReactions(d).filter((r) => r.user_id === B.me.id).map((r) => r.emoji),
      onEmoji: (emoji) => toggleDmReaction(d, emoji), onAct: (a) => dmAct(a, id) });
  }
  B.onLeave(() => B.closeMsgMenu());
  B.bindMsgPress(box, { selector: '.dm-msg', idOf: (el) => (shown.get(el.dataset.dmId)?.deleted_at ? null : el.dataset.dmId), open: openDmMenu });

  async function dmAct(action, id) {
    const d = shown.get(id);
    if (!d || d.deleted_at) return;
    if (action === 'reply') return startReply(d);
    if (action === 'copy') return copyDm(d);
    if (action === 'react') return B.openMediaPicker({ emojisOnly: true, onEmoji: (emoji) => toggleDmReaction(d, emoji) });
    if (action === 'pin') return toggleDmPin(d);
    if (action === 'report' && d.sender_id !== B.me.id) return B.reportContent({ type: 'dm', targetId: d.id, targetUser: d.sender_id, excerpt: d.content });
    if (d.sender_id !== B.me.id) return;
    if (action === 'edit') {
      if (editing?.saving) return;
      cancelEdit(); editing = { id: d.id, draft: d.content }; repaint(d.id);
      const ed = box.querySelector(`[data-dm-id="${d.id}"] textarea`); ed.focus(); ed.setSelectionRange(ed.value.length, ed.value.length);
      return;
    }
    if (action === 'del') {
      if (!(await B.confirm(tr('Supprimer ce message ?'), tr('Supprimer')))) return;
      try {
        const { data, error } = await B.sb.rpc('delete_dm_message', { p_message: d.id });
        if (error) throw error;
        if (!data) throw new Error(tr('Message introuvable.'));
        if (replyTo?.id === d.id) cancelReply();
        change(data);
        if (d.attachments?.length) {
          const cleanup = await B.sb.storage.from('dm-files').remove(d.attachments.map(f => f.path));
          if (cleanup.error) console.warn('Nettoyage des fichiers privés', cleanup.error.message);
        }
      } catch (err) { B.error(err); }
    }
  }

  async function copyDm(d) {
    const text = [d.content, ...(d.attachments || []).map((f) => `📎 ${f.name}`)].filter(Boolean).join('\n');
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch {
      const tmp = h('<textarea class="copy-tmp" aria-hidden="true"></textarea>');
      tmp.value = text; document.body.appendChild(tmp); tmp.select();
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      tmp.remove();
    }
    B.toast(esc(ok ? tr('Message copié.') : tr('Impossible de copier ce message.')), { type: ok ? 'success' : 'error', timeout: 2000 });
  }

  async function toggleDmReaction(d, emoji) {
    const { data, error } = await B.sb.rpc('toggle_dm_reaction', { p_message: d.id, p_emoji: emoji });
    if (error) return B.error(/toggle_dm_reaction/.test(error.message || '') ? tr('Les réactions en privé ne sont pas encore installées sur le serveur (migration 044).') : error);
    if (data) change(data);
  }

  function jumpTo(id) {
    const el = box.querySelector(`[data-dm-id="${id}"]`);
    if (!el) return B.toast(esc(tr('Ce message est plus ancien que ceux affichés.')), { timeout: 4000 });
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  }

  // ----- Répondre -----
  const replyBar = $('.reply-bar', form);
  function startReply(d) {
    replyTo = d;
    replyBar.innerHTML = `${icon('reply', 15)}<span class="reply-text">${tr('Répondre à {who}', { who: `<strong translate="no">${esc(whoDm(d))}</strong>` })}
        <span class="muted" translate="no">${esc(B.msgFirstLine(d.content) || (d.attachments?.length ? tr('Pièce jointe') : ''))}</span></span>
      <button type="button" class="icon-btn" data-reply-cancel title="${tr('Annuler la réponse')}" aria-label="${tr('Annuler la réponse')}">${icon('x', 15)}</button>`;
    paintIcons(replyBar);
    replyBar.classList.remove('hidden');
    $('[data-reply-cancel]', replyBar).onclick = () => { cancelReply(); ta.focus(); };
    ta.focus();
  }
  function cancelReply() {
    replyTo = null;
    replyBar.classList.add('hidden');
    replyBar.innerHTML = '';
  }

  // ----- Épingles de la conversation -----
  pinsBtn = B.pinsButton($('.dm-pins', conv));
  pinsBtn.classList.add('hidden');
  pinsBtn.onclick = () => (pinsPop ? pinsPop.close() : (pinsPop = B.openPinsPop(pinsBtn, fillPins, () => { pinsPop = null; })));
  B.onLeave(() => pinsPop?.close());
  async function loadPins() {
    const { data, error } = await B.sb.from('direct_messages').select('*')
      .or(`and(sender_id.eq.${B.me.id},recipient_id.eq.${other.id}),and(sender_id.eq.${other.id},recipient_id.eq.${B.me.id})`)
      .not('pinned_at', 'is', null).order('pinned_at', { ascending: false }).limit(25);
    if (error) { pinsReady = false; return; } // migration 044 pas encore appliquée : on cache la fonction
    pins = (data || []).filter((d) => !d.deleted_at);
    paintPins();
  }
  function paintPins() {
    if (!pinsBtn) return;
    pinsBtn.classList.toggle('hidden', !pinsReady);
    B.paintPinsButton(pinsBtn, pins.length);
    pinsPop?.fill();
  }
  function syncPin(d) {
    if (!pinsReady) return;
    const had = pins.some((p) => p.id === d.id);
    if (d.pinned_at && !d.deleted_at) pins = [d, ...pins.filter((p) => p.id !== d.id)].sort((a, b) => b.pinned_at.localeCompare(a.pinned_at));
    else if (had) pins = pins.filter((p) => p.id !== d.id);
    else return;
    paintPins();
  }
  async function toggleDmPin(d) {
    const pin = !d.pinned_at;
    const { data, error } = await B.sb.rpc('set_dm_pin', { p_message: d.id, p_pin: pin });
    if (error) return B.error(error);
    if (data) change(data);
    if (pin) B.toast(esc(tr('Message épinglé : retrouvez-le avec le bouton 📌 en haut à droite.')), { type: 'success', timeout: 3000 });
  }
  function fillPins(el) {
    const hint = B.isPhone?.() ? tr('Appui long sur un message, puis « Épingler ».') : tr('Clic droit sur un message, puis « Épingler ».');
    el.innerHTML = `<div class="pins-head"><h3>${icon('pin', 16)} ${tr('Messages épinglés')}${pins.length ? ` <span class="muted">· ${pins.length}</span>` : ''}</h3>
        <button type="button" class="icon-btn" data-pins-close aria-label="${tr('Fermer')}">${icon('x', 15)}</button></div>
      ${pins.length ? `<div class="pins-list">${pins.map((p) => `
        <div class="pin-item" data-id="${esc(p.id)}">
          <div class="pin-item-head"><strong translate="no">${esc(whoDm(p))}</strong><span class="muted small">${fmtDate(p.created_at)} ${fmtTime(p.created_at)}
            ${p.pinned_by ? ` · ${tr('épinglé par {who}', { who: esc((p.pinned_by === B.me.id ? B.me : other).display_name) })}` : ''}</span></div>
          <div class="msg-text pin-text" translate="no">${md(p.content || (p.attachments?.length ? '📎 ' + p.attachments.map((f) => f.name).join(', ') : ''))}</div>
          <div class="pin-actions">
            ${shown.has(p.id) ? `<button type="button" class="btn small" data-go>${tr('Aller au message')}</button>` : ''}
            <button type="button" class="btn small" data-unpin>${tr('Désépingler')}</button></div>
        </div>`).join('')}</div>`
      : `<p class="pins-empty muted">${tr('Aucun message épinglé dans cette conversation.')}<br>${hint}</p>`}`;
    $('[data-pins-close]', el).onclick = () => { pinsPop?.close(); pinsBtn.focus(); };
    $$('.pin-item', el).forEach((it) => {
      const p = pins.find((x) => x.id === it.dataset.id);
      const go = $('[data-go]', it);
      if (go) go.onclick = () => { pinsPop?.close(); jumpTo(p.id); };
      $('[data-unpin]', it).onclick = async () => {
        const { data, error } = await B.sb.rpc('set_dm_pin', { p_message: p.id, p_pin: false });
        if (error) return B.error(error);
        if (data) { if (shown.has(data.id)) change(data); else syncPin(data); }
      };
    });
  }
  paintPins();
  await Promise.all([loadParents([...shown.values()]), loadPins()]);
};
