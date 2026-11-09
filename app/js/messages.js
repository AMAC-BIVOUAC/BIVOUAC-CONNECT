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

const dmTotal = () => [...B.dmUnread.values()].reduce((a, b) => a + b, 0);

function paintDmBadges() {
  const total = dmTotal();
  const badge = $('#dm-badge');
  if (badge) { badge.textContent = total > 99 ? '99+' : total; badge.classList.toggle('hidden', !total); }
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
          ? `<small class="online-status">${esc(B.statusText(m.id))}</small>` : ''}</span>
        ${B.voiceWhere?.(m.id, project ? pid : null) ? `<span class="online-voice" title="${esc(tr('En vocal'))}">${icon('headphones', 13)}</span>` : ''}</a>`;
  box.innerHTML = (on.length
    ? on.map((m) => row(m, false)).join('')
    : `<p class="nav-empty">${project ? tr('Personne d\'autre de ce projet en ligne') : tr('Personne d\'autre en ligne')}</p>`)
    + (waiting.length ? `<div class="online-waiting">${tr('Vous ont écrit')}</div>${waiting.map((m) => row(m, true)).join('')}` : '');
  $('#online-count') && ($('#online-count').textContent = on.length ? String(on.length) : '');
  paintDmBadges();
};
B.on('online', () => { B.renderOnline(); if (B.dmOpen) B.emit('dm-presence'); });

// ---------- Temps réel : nouveau message privé pour moi ----------

B.startDmLive = () => {
  B.loadDmUnread();
  B.sb.channel('me-dm')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages', filter: `recipient_id=eq.${B.me.id}` }, (p) => {
      const msg = p.new;
      B.emit('dm', msg);
      if (msg.sender_id === B.dmOpen && !document.hidden && document.hasFocus() && B.dmAtBottom?.()) return;
      B.dmUnread.set(msg.sender_id, (B.dmUnread.get(msg.sender_id) || 0) + 1);
      dmChanged();
      B.playSound('notif');
      const who = B.person(msg.sender_id).display_name;
      B.pcNotify('Bivouac-Tech', tr('Message privé de {name}', { name: who }), B.soundPrefs().notif);
      if (msg.sender_id !== B.dmOpen) {
        B.toast(`${tr('Message privé de {name}', { name: `<span translate="no">${esc(who)}</span>` })} <a href="#/messages/${msg.sender_id}">${tr('Ouvrir')}</a>`);
      }
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'direct_messages', filter: `sender_id=eq.${B.me.id}` }, (p) => { B.emit('dm-read', p.new); B.emit('dm-change', p.new); })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'direct_messages', filter: `recipient_id=eq.${B.me.id}` }, (p) => { B.emit('dm-change', p.new); if (p.new.deleted_at) B.loadDmUnread(); })
    .subscribe();
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

B.pages.messages = async (view, [otherId]) => {
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
    $('.dm-list', view).innerHTML = sorted.map((m) => {
      const l = last.get(m.id);
      const unread = B.dmUnread.get(m.id);
      return `<a class="dm-person ${m.id === other?.id ? 'on' : ''} ${unread ? 'unread' : ''}" href="#/messages/${m.id}">
        ${B.dmAvatar(m, 34)}
        <span class="dm-person-text"><strong translate="no">${esc(m.display_name)}</strong>
          <small translate="no">${l ? `${l.sender_id === B.me.id ? tr('Vous :') + ' ' : ''}${esc(((l.deleted_at ? tr('Message supprimé') : l.content) || (l.attachments?.length ? tr('Pièce jointe') : '')).replace(/[*`#]/g, '').replace(/\s+/g, ' ').slice(0, 60))}` : `<em>${tr('Aucun message')}</em>`}</small></span></a>`;
    }).join('') || `<p class="muted small dm-pad">${tr('Personne pour l\'instant.')}</p>`;
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
      ${avatar(other, 32)}<div><strong translate="no">${esc(other.display_name)}</strong><small class="dm-status"></small></div></header>
    <div class="dm-msgs"><div class="loading">${tr('Chargement…')}</div></div>
    <form class="dm-compose"><div class="dm-pending"></div><div class="dm-compose-row">
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
  const bubble = (d) => `<div class="dm-msg ${d.sender_id === B.me.id ? 'mine' : ''}" data-dm-id="${esc(d.id)}">
    ${d.deleted_at ? `<em class="muted">${tr('Message supprimé')}</em>` : editing?.id === d.id ? `<div class="msg-edit"><textarea rows="2" maxlength="4000">${esc(editing.draft)}</textarea>
      <div class="msg-edit-actions"><button type="button" class="btn small" data-dm-cancel>${tr('Annuler')}</button><button type="button" class="btn small primary" data-dm-save>${tr('Enregistrer')}</button></div></div>`
      : d.content ? `<div class="dm-bubble" translate="no">${md(d.content)}</div>` : ''}
    ${(d.attachments || []).map((f, i) => `<button type="button" class="file-card dm-file" data-dm-file="${i}" title="${tr('Ouvrir')}">
      ${B.messageImage(f, 'dm-files')}${icon('file', 20)}<span><strong translate="no">${esc(f.name)}</strong><small>${fmtSize(f.size)}</small></span></button>`).join('')}
    <small>${fmtTime(d.created_at)}${d.edited_at && !d.deleted_at ? ` · ${tr('(modifié)')}` : ''}${receipt(d)}</small>
    ${d.sender_id === B.me.id && !d.deleted_at ? `<div class="dm-tools"><button type="button" class="icon-btn" data-dm-menu aria-label="${tr('Actions du message')}" aria-expanded="false">⋯</button>
      <div class="dm-actions" hidden><button type="button" class="btn small" data-dm-edit>${tr('Modifier')}</button><button type="button" class="btn small" data-dm-delete>${tr('Supprimer')}</button></div></div>` : ''}</div>`;
  const repaint = id => {
    const el = box.querySelector(`[data-dm-id="${id}"]`), d = shown.get(id);
    if (el && d) el.replaceWith(h(bubble(d)));
  };
  const change = d => {
    if (!active || !shown.has(d.id)) return;
    shown.set(d.id, d);
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
    if (follow) box.scrollTop = box.scrollHeight;
  };
  box.addEventListener('click', async (e) => {
    const msg = e.target.closest('[data-dm-id]'), d = shown.get(msg?.dataset.dmId);
    if (e.target.closest('[data-dm-menu]')) {
      const menu = $('.dm-actions', msg), button = $('[data-dm-menu]', msg); menu.hidden = !menu.hidden;
      button.setAttribute('aria-expanded', String(!menu.hidden)); return;
    }
    if (e.target.closest('[data-dm-edit]') && d?.sender_id === B.me.id && !d.deleted_at) {
      if (editing?.saving) return;
      cancelEdit(); editing = { id: d.id, draft: d.content }; repaint(d.id);
      const ta = box.querySelector(`[data-dm-id="${d.id}"] textarea`); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); return;
    }
    if (e.target.closest('[data-dm-cancel]')) return cancelEdit();
    if (e.target.closest('[data-dm-save]')) return saveEdit();
    if (e.target.closest('[data-dm-delete]') && d?.sender_id === B.me.id && !d.deleted_at) {
      if (!(await B.confirm(tr('Supprimer ce message ?'), tr('Supprimer')))) return;
      try {
        const { data, error } = await B.sb.rpc('delete_dm_message', { p_message: d.id });
        if (error) throw error;
        if (!data) throw new Error(tr('Message introuvable.'));
        change(data);
        if (d.attachments?.length) {
          const cleanup = await B.sb.storage.from('dm-files').remove(d.attachments.map(f => f.path));
          if (cleanup.error) console.warn('Nettoyage des fichiers privés', cleanup.error.message);
        }
      } catch (err) { B.error(err); }
      return;
    }
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
      else if (old.content !== d.content || old.deleted_at !== d.deleted_at || old.edited_at !== d.edited_at) change(d);
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
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); } });
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
      const { data, error: err } = await B.sb.from('direct_messages').insert(payload).select().single();
      if (err) throw new Error(/row-level security/.test(err.message || '') ? tr('Vous ne partagez plus de projet avec cette personne.') : errText(err));
      committed = true;
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
};

