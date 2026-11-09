// =====================================================================
// chat.js — le fil de discussion, utilisé à deux endroits :
//   mode 'team' : Discussion de l'équipe (humains uniquement, façon Discord)
//   mode 'ai'   : Atelier IA (humains + IA, commandes @claude / @personne Claude)
// =====================================================================

const REACTIONS = ['👍', '🚀', '❤️', '✅', '😄', '👀'];

B.chat = async (root, { project, channel, mode }) => {
  const isAi = mode === 'ai';
  const st = {
    messages: [],
    reactions: new Map(), // messageId -> [{ user_id, emoji }]
    reads: new Map(),     // messageId -> identifiants des personnes ayant vu le message
    files: new Map(),     // messageId -> [file]
    filter: 'all',
    pendingFiles: [],
    editing: null,        // { id, draft } : message en cours de modification
    pins: [],             // messages épinglés du salon (du plus récent au plus ancien)
    pinsReady: true,      // false si la migration 013 n'est pas encore appliquée
    ac: null              // menu d'autocomplétion ouvert
  };

  root.innerHTML = `
    <div class="chat ${isAi ? 'is-ai' : ''}">
      ${isAi ? `<div class="chat-filters">
        <button class="pill on" data-f="all">${tr('Tous')}</button>
        <button class="pill" data-f="human">${tr('Humains')}</button>
        <button class="pill" data-f="ai">${tr('IA')}</button>
      </div>` : ''}
      <div class="pin-bar hidden"></div>
      <div class="pending-requests"></div>
      <div class="messages"><div class="loading">${tr('Chargement…')}</div></div>
      <form class="composer">
        <div class="attach-chips"></div>
        <div class="composer-row">
          <button type="button" class="icon-btn attach" title="${tr('Joindre un fichier')}">${icon('plus', 20)}</button>
          <input type="file" class="file-input hidden" multiple />
          <textarea rows="1" placeholder="${isAi
            ? tr("Écrire… « @claude … » pour votre IA, « @pseudo Claude … » pour l'IA d'un membre")
            : tr('Écrire dans #{channel}… (@pseudo pour mentionner)', { channel: esc(channel.name) })}"></textarea>
          <button type="submit" class="send" title="${tr('Envoyer')}">${icon('send', 18)}</button>
        </div>
        <div class="ac dropdown hidden"></div>
      </form>
    </div>`;

  // Ouvrir un salon le marque comme lu (badges)
  B.openChannel = channel.id;
  B.markRead(channel.id);
  B.onLeave(() => { if (B.openChannel === channel.id) B.openChannel = null; });

  const list = $('.messages', root);
  const ta = $('textarea', root);
  const acBox = $('.ac', root);
  let active = true, markingReads = false;
  B.onLeave(() => { active = false; });
  const visibleReads = debounce(async () => {
    if (!active || markingReads || document.hidden || !document.hasFocus()) return;
    const bounds = list.getBoundingClientRect();
    const ids = $$('.msg', list).filter(el => {
      const m = st.messages.find(m => m.id === el.dataset.id);
      const head = $('.msg-head', el)?.getBoundingClientRect();
      return m && m.author_id !== B.me.id && !st.reads.get(m.id)?.has(B.me.id)
        && head && head.top >= bounds.top && head.bottom <= bounds.bottom;
    }).map(el => el.dataset.id).slice(0, 100);
    if (!ids.length) return;
    markingReads = true;
    const { error } = await B.sb.from('message_reads').upsert(ids.map(message_id => ({ message_id, user_id: B.me.id })),
      { onConflict: 'message_id,user_id', ignoreDuplicates: true });
    markingReads = false;
    if (!error) ids.forEach(id => { if (!st.reads.has(id)) st.reads.set(id, new Set()); st.reads.get(id).add(B.me.id); });
  }, 250);
  const refreshReads = async () => {
    if (!active || document.hidden) return;
    const ids = st.messages.map(m => m.id);
    if (!ids.length) return;
    const { data } = await B.sb.from('message_reads').select('*').in('message_id', ids);
    if (!active) return;
    (data || []).forEach(r => {
      if (!st.reads.has(r.message_id)) st.reads.set(r.message_id, new Set());
      st.reads.get(r.message_id).add(r.user_id);
    });
    paintReads();
  };
  const onFocusReads = () => { visibleReads(); refreshReads(); };
  list.addEventListener('scroll', visibleReads);
  window.addEventListener('focus', onFocusReads);
  document.addEventListener('visibilitychange', onFocusReads);
  const readsTimer = setInterval(onFocusReads, 15000);
  B.onLeave(() => { clearInterval(readsTimer); window.removeEventListener('focus', onFocusReads); document.removeEventListener('visibilitychange', onFocusReads); });
  B.live('reads', 'message_reads', null, p => {
    const r = p.new;
    if (!r || !st.messages.some(m => m.id === r.message_id)) return;
    if (!st.reads.has(r.message_id)) st.reads.set(r.message_id, new Set());
    st.reads.get(r.message_id).add(r.user_id);
    paintReads();
  }, 'INSERT');
  function readersIndicator(id) {
    const names = [...(st.reads.get(id) || [])].filter(uid => uid !== B.me.id).map(uid => B.person(uid).display_name);
    return B.readIndicator({ seen: names.length > 0, count: names.length,
      label: names.length ? tr('Vu par {names}', { names: names.join(', ') }) : tr('Envoyé') });
  }
  function paintReads() {
    $$('.msg-read', list).forEach(el => {
      const next = h(readersIndicator(el.closest('.msg').dataset.id));
      if (el.firstElementChild?.getAttribute('aria-label') !== next.getAttribute('aria-label')) el.replaceChildren(next);
    });
  }

  // ---------------- Chargement ----------------

  // Les 100 derniers messages ; les plus anciens se chargent à la demande (bouton en haut du fil).
  // Un nouveau membre voit TOUT l'historique du salon, d'avant son arrivée compris.
  const PAGE = 100;
  let keepScroll = null; // position de lecture à garder quand on charge les plus anciens
  const { data: msgs, error } = await B.sb.from('messages')
    .select('*').eq('channel_id', channel.id)
    .order('created_at', { ascending: false }).limit(PAGE);
  if (error) return B.error(error);
  st.messages = msgs.reverse();
  st.hasMore = msgs.length === PAGE;
  const myJoin = (B.members.get(project.id) || []).find((m) => m.user_id === B.me.id)?.joined_at || null;
  await Promise.all([loadExtras(st.messages.map((m) => m.id)), loadPins()]);
  render();

  async function loadExtras(ids) {
    if (!ids.length) return;
    const [r, f, reads] = await Promise.all([
      B.sb.from('reactions').select('*').in('message_id', ids),
      B.sb.from('files').select('*').in('message_id', ids),
      B.sb.from('message_reads').select('*').in('message_id', ids)
    ]);
    (reads.data || []).forEach(r => {
      if (!st.reads.has(r.message_id)) st.reads.set(r.message_id, new Set());
      st.reads.get(r.message_id).add(r.user_id);
    });
    ids.forEach((id) => { st.reactions.set(id, []); });
    (r.data || []).forEach((x) => st.reactions.get(x.message_id)?.push(x));
    (f.data || []).forEach((x) => {
      if (!st.files.has(x.message_id)) st.files.set(x.message_id, []);
      st.files.get(x.message_id).push(x);
    });
  }

  // ---------------- Affichage ----------------

  function visible(m) {
    if (st.filter === 'human') return !m.is_ai;
    if (st.filter === 'ai') return m.is_ai;
    return true;
  }

  function render() {
    const shown = st.messages.filter(visible);
    if (!shown.length) {
      list.innerHTML = isAi
        ? `<div class="empty-chat">${icon('spark', 34)}<h3>${tr("L'Atelier IA")}</h3>
            <p>${tr('Faites travailler vos IA sur le projet. Exemples :')}</p>
            <code>${tr('@claude propose 5 idées pour lancer le projet')}</code>
            <code>${tr('@pseudo Perplexity trouve les concurrents principaux')}</code>
            <p class="muted small">${tr("« @claude » utilise votre clé. « @pseudo Claude » demande à ce membre d'utiliser la sienne : il doit accepter.")}</p></div>`
        : `<div class="empty-chat">${icon('chat', 34)}<h3>#${esc(channel.name)}</h3><p>${tr("Lancez la discussion avec l'équipe.")}</p></div>`;
      return;
    }
    // Repère « Vous avez rejoint le projet » : tout ce qui est au-dessus date d'avant mon arrivée
    const joinIdx = myJoin && shown[0] && shown[0].created_at < myJoin ? shown.findIndex((m) => m.created_at >= myJoin) : -1;
    list.innerHTML = (st.hasMore ? `<div class="older"><button class="btn small" data-older>${icon('arrow', 13).replace('<svg', '<svg style="transform:rotate(-90deg)"')} ${tr('Charger les messages plus anciens')}</button></div>`
      : shown.length > 8 ? `<div class="older muted small">${tr('Début du salon')}</div>` : '')
      + shown.map((m, i) => (i === joinIdx ? `<div class="join-mark"><span>${tr('Vous avez rejoint le projet ici · les messages au-dessus datent d\'avant votre arrivée')}</span></div>` : '') + msgHtml(m)).join('');
    if (keepScroll) {
      list.scrollTop = list.scrollHeight - keepScroll.fromBottom;
      keepScroll = null;
    } else scrollDown();
    visibleReads();
  }

  /** Charge les 100 messages précédents, sans faire sauter la lecture */
  async function loadOlder(btn) {
    btn.disabled = true;
    const { data, error } = await B.sb.from('messages').select('*').eq('channel_id', channel.id)
      .lt('created_at', st.messages[0].created_at).order('created_at', { ascending: false }).limit(PAGE);
    if (error) { btn.disabled = false; return B.error(error); }
    const older = data.reverse().filter((m) => !st.messages.some((x) => x.id === m.id));
    await loadExtras(older.map((m) => m.id));
    st.messages = [...older, ...st.messages];
    st.hasMore = data.length === PAGE;
    keepScroll = { fromBottom: list.scrollHeight - list.scrollTop };
    render();
  }

  function editedHtml(m) {
    if (!m.edited_at) return '';
    const when = new Date(m.edited_at).toLocaleString(B.locale(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    return `<span class="edited" title="${tr('Modifié le {when}', { when })}">${tr('(modifié)')}</span>`;
  }

  function editorHtml() {
    return `<div class="msg-edit">
        <textarea rows="2" translate="no">${esc(st.editing.draft)}</textarea>
        <div class="msg-edit-actions"><small class="muted">${tr('Entrée pour enregistrer · Échap pour annuler')}</small>
          <button type="button" class="btn small" data-edit-cancel>${tr('Annuler')}</button>
          <button type="button" class="btn small primary" data-edit-save>${tr('Enregistrer')}</button></div>
      </div>`;
  }

  function msgHtml(m) {
    const author = B.person(m.author_id);
    const files = st.files.get(m.id) || [];
    const mine = m.author_id === B.me.id;
    const editing = st.editing?.id === m.id;
    let head;
    if (m.is_ai) {
      const asked = m.requested_by && m.requested_by !== m.author_id
        ? ` · ${tr('demandé par {who}', { who: esc(B.person(m.requested_by).display_name) })}` : '';
      head = `<span class="name" translate="no">${esc(aiName(m.ai_provider, author))}</span>
        <span class="tag ai">${tr('IA')}</span><span class="time">${fmtTime(m.created_at)} · ${m.via === 'connector' ? tr('via connecteur') : tr('via API')}${asked}</span>${editedHtml(m)}`;
    } else {
      head = `<span class="name">${esc(author.display_name)}</span><span class="time">${fmtTime(m.created_at)}</span>${editedHtml(m)}`;
    }
    // IA : avatar double (marque + propriétaire) et liseré à la couleur de son propriétaire
    return `<div class="msg ${m.is_ai ? 'ai' : ''} ${m.pinned_at ? 'pinned' : ''}" data-id="${m.id}"${m.is_ai ? ` style="--owner:${colorFor(author.id)}"` : ''}>
      ${m.is_ai ? aiAvatar(m.ai_provider, 38, author) : avatar(author, 38)}
      <div class="msg-body">
        <div class="msg-head">${head}${m.pinned_at ? `<span class="pin-tag">${icon('pin', 12)} ${tr('Épinglé')}</span>` : ''}</div>
        ${editing ? editorHtml() : `<div class="msg-text" translate="no">${md(m.content)}</div>`}
        ${files.length ? `<div class="msg-files">${files.map(fileCard).join('')}</div>` : ''}
        ${reactionsHtml(m.id)}
        ${mine && !m.is_ai ? `<small class="msg-read muted">${readersIndicator(m.id)}</small>` : ''}
      </div>
      <div class="msg-tools">
        <button class="icon-btn" data-react title="${tr('Réagir')}">${icon('smile', 16)}</button>
        ${st.pinsReady ? `<button class="icon-btn ${m.pinned_at ? 'on' : ''}" data-pin title="${m.pinned_at ? tr('Désépingler') : tr('Épingler en haut du salon')}">${icon('pin', 16)}</button>` : ''}
        ${mine && !m.is_ai && !editing ? `<button class="icon-btn" data-edit title="${tr('Modifier')}">${icon('edit', 16)}</button>` : ''}
        ${mine || B.isManager(project.id) ? `<button class="icon-btn" data-del title="${mine ? tr('Supprimer') : tr('Supprimer (modération)')}">${icon('trash', 16)}</button>` : ''}
      </div>
    </div>`;
  }

  function fileCard(f) {
    const isImg = (f.mime || '').startsWith('image/');
    return `<button class="file-card" data-file="${esc(f.id)}" data-msg="${esc(f.message_id)}" title="${tr('Ouvrir')}">
      <span class="file-ico">${icon(isImg ? 'image' : 'file', 20)}</span>
      <span><strong>${esc(f.name)}</strong><small>${fmtSize(f.size)}</small></span></button>`;
  }

  function reactionsHtml(id) {
    const rs = st.reactions.get(id) || [];
    if (!rs.length) return '';
    const groups = {};
    rs.forEach((r) => { (groups[r.emoji] ||= []).push(r.user_id); });
    return `<div class="reactions">${Object.entries(groups).map(([e, users]) =>
      `<button class="reaction ${users.includes(B.me.id) ? 'mine' : ''}" data-emoji="${e}"
        title="${esc(users.map((u) => B.person(u).display_name).join(', '))}">${e} ${users.length}</button>`).join('')}</div>`;
  }

  function rerenderOne(id) {
    const el = $(`.msg[data-id="${id}"]`, list);
    const m = st.messages.find((x) => x.id === id);
    if (el && m) el.replaceWith(h(msgHtml(m)));
    if (st.editing?.id === id) focusEditor();
  }

  function scrollDown() { list.scrollTop = list.scrollHeight; visibleReads(); }

  // ---------------- Interactions sur les messages ----------------

  list.addEventListener('click', async (e) => {
    const read = e.target.closest('.read-indicator');
    if (read) return B.showReadDetails(read);
    const olderBtn = e.target.closest('[data-older]');
    if (olderBtn) return loadOlder(olderBtn);
    const msgEl = e.target.closest('.msg');
    const id = msgEl?.dataset.id;

    const fc = e.target.closest('.file-card');
    if (fc) {
      const f = (st.files.get(fc.dataset.msg) || []).find((x) => x.id === fc.dataset.file);
      return f && B.openFile(f).catch(B.error);
    }

    const rb = e.target.closest('.reaction');
    if (rb) return toggleReaction(id, rb.dataset.emoji);

    if (e.target.closest('[data-react]')) {
      const picker = h(`<div class="emoji-picker">${REACTIONS.map((r) => `<button>${r}</button>`).join('')}</div>`);
      $('.emoji-picker', list)?.remove();
      msgEl.appendChild(picker);
      picker.onclick = (ev) => {
        const b = ev.target.closest('button');
        if (b) toggleReaction(id, b.textContent);
        picker.remove();
      };
      return;
    }

    if (e.target.closest('[data-pin]')) return togglePin(st.messages.find((m) => m.id === id));

    if (e.target.closest('[data-edit]')) return startEdit(id);
    if (e.target.closest('[data-edit-cancel]')) return stopEdit();
    if (e.target.closest('[data-edit-save]')) return saveEdit();

    if (e.target.closest('[data-del]')) {
      const target = st.messages.find((x) => x.id === id);
      const other = target && target.author_id !== B.me.id;
      const question = other
        ? tr('Supprimer le message de {who} ? En tant que responsable du projet, vous pouvez le faire : ce sera noté dans l\'activité du projet.',
          { who: target.is_ai ? aiName(target.ai_provider, B.person(target.author_id)) : B.person(target.author_id).display_name })
        : tr('Supprimer ce message ?');
      if (!(await B.confirm(question, tr('Supprimer')))) return;
      try { await B.deleteRow('messages', id); } catch (err) { return B.error(err); }
      st.messages = st.messages.filter((m) => m.id !== id);
      if (st.editing?.id === id) st.editing = null;
      render();
      if (st.pins.some((p) => p.id === id)) { st.pins = st.pins.filter((p) => p.id !== id); renderPins(); }
    }
  });

  // ---------------- Messages épinglés ----------------

  async function loadPins() {
    const { data, error: err } = await B.sb.from('messages').select('*')
      .eq('channel_id', channel.id).not('pinned_at', 'is', null)
      .order('pinned_at', { ascending: false }).limit(25);
    if (err) { st.pinsReady = false; return; } // migration 013 pas encore appliquée : on cache la fonction
    st.pins = data || [];
    renderPins();
  }

  function firstLine(text) {
    const line = String(text || '').replace(/```[\s\S]*?```/g, ' ').split('\n').find((l) => l.trim()) || '';
    return line.length > 120 ? line.slice(0, 117) + '…' : line;
  }

  function renderPins() {
    const bar = $('.pin-bar', root);
    if (!bar) return;
    if (!st.pins.length) { bar.classList.add('hidden'); bar.innerHTML = ''; return; }
    const last = st.pins[0];
    bar.classList.remove('hidden');
    bar.innerHTML = `<span class="pin-ico">${icon('pin', 15)}</span>
      <button class="pin-last" data-jump="${last.id}" title="${tr('Aller au message')}">
        <strong translate="no">${esc(last.is_ai ? aiName(last.ai_provider, B.person(last.author_id)) : B.person(last.author_id).display_name)}</strong>
        <span translate="no">${esc(firstLine(last.content))}</span></button>
      <button class="link small" data-pins>${st.pins.length > 1 ? tr('Voir les {n} épinglés', { n: st.pins.length }) : tr('Voir')}</button>`;
    paintIcons(bar);
    $('[data-jump]', bar).onclick = () => jumpTo(last.id);
    $('[data-pins]', bar).onclick = openPins;
  }

  function jumpTo(id) {
    const el = $(`.msg[data-id="${id}"]`, list);
    if (!el) return openPins(); // message trop ancien pour être chargé : on l'affiche dans la fenêtre
    if (st.filter !== 'all' && el.offsetParent === null) { st.filter = 'all'; render(); return jumpTo(id); }
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  }

  function openPins() {
    const m = B.modal(`
      <h2>${icon('pin', 18)} ${tr('Messages épinglés')} · #${esc(channel.name)}</h2>
      <div class="pin-list">${st.pins.map((p) => {
        const who = p.is_ai ? aiName(p.ai_provider, B.person(p.author_id)) : B.person(p.author_id).display_name;
        return `<div class="pin-item" data-id="${p.id}">
          <div class="pin-item-head"><strong>${esc(who)}</strong><span class="muted small">${fmtTime(p.created_at)}
            ${p.pinned_by ? ` · ${tr('épinglé par {who}', { who: esc(B.person(p.pinned_by).display_name) })}` : ''}</span></div>
          <div class="msg-text" translate="no">${md(p.content)}</div>
          <div class="actions"><button class="btn small" data-go>${tr('Aller au message')}</button>
            <button class="btn small danger-ghost" data-unpin>${icon('pin', 13)} ${tr('Désépingler')}</button></div>
        </div>`;
      }).join('')}</div>
      <div class="actions"><span class="spacer"></span><button class="btn" data-close>${tr('Fermer')}</button></div>`, { wide: true });
    $('[data-close]', m).onclick = B.closeModal;
    $$('.pin-item', m).forEach((it) => {
      const p = st.pins.find((x) => x.id === it.dataset.id);
      const loaded = st.messages.some((x) => x.id === p.id);
      const go = $('[data-go]', it);
      if (!loaded) go.remove();
      else go.onclick = () => { B.closeModal(); jumpTo(p.id); };
      $('[data-unpin]', it).onclick = async () => { await togglePin(p); it.remove(); if (!st.pins.length) B.closeModal(); };
    });
  }

  async function togglePin(m) {
    if (!m) return;
    const pin = !m.pinned_at;
    const { error: err } = await B.sb.rpc('set_message_pin', { p_message: m.id, p_pin: pin });
    if (err) return B.error(err);
    m.pinned_at = pin ? new Date().toISOString() : null;
    m.pinned_by = pin ? B.me.id : null;
    const local = st.messages.find((x) => x.id === m.id);
    if (local && local !== m) Object.assign(local, { pinned_at: m.pinned_at, pinned_by: m.pinned_by });
    if (local) rerenderOne(m.id);
    st.pins = pin ? [m, ...st.pins.filter((x) => x.id !== m.id)] : st.pins.filter((x) => x.id !== m.id);
    renderPins();
    if (pin) B.toast(esc(tr('Message épinglé en haut du salon.')), { type: 'success', timeout: 2500 });
  }

  // ---------------- Modification de ses messages ----------------

  function focusEditor() {
    const ed = $(`.msg[data-id="${st.editing.id}"] .msg-edit textarea`, list);
    if (!ed) return;
    ed.style.height = 'auto';
    ed.style.height = Math.min(ed.scrollHeight, 320) + 'px';
    ed.focus();
    ed.setSelectionRange(ed.value.length, ed.value.length);
  }

  function startEdit(id) {
    const m = st.messages.find((x) => x.id === id);
    if (!m || m.author_id !== B.me.id || m.is_ai) return;
    const prev = st.editing?.id;
    st.editing = { id, draft: m.content };
    if (prev && prev !== id) rerenderOne(prev);
    rerenderOne(id);
  }

  function stopEdit() {
    const id = st.editing?.id;
    st.editing = null;
    if (id) rerenderOne(id);
  }

  async function saveEdit() {
    if (!st.editing) return;
    const { id, draft } = st.editing;
    const m = st.messages.find((x) => x.id === id);
    const text = draft.trim();
    if (!m) return stopEdit();
    if (!text) return B.toast(tr("Un message ne peut pas être vide. Pour l'effacer, utilisez Supprimer."), { type: 'error' });
    if (text === m.content) return stopEdit();
    const { data, error: err } = await B.sb.from('messages')
      .update({ content: text }).eq('id', id).select().single();
    if (err) return B.error(err);
    const before = m.content;
    Object.assign(m, data);
    stopEdit();
    // Seules les NOUVELLES mentions déclenchent une notification
    const already = mentionedHandles(before);
    notifyMentions(text, others().filter((p) => already.includes(p.handle)).map((p) => p.id));
  }

  list.addEventListener('input', (e) => {
    if (!st.editing || !e.target.matches('.msg-edit textarea')) return;
    st.editing.draft = e.target.value;
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 320) + 'px';
  });
  list.addEventListener('keydown', (e) => {
    if (!st.editing || !e.target.matches('.msg-edit textarea')) return;
    if (e.key === 'Escape') { e.preventDefault(); stopEdit(); }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(); }
  });

  async function toggleReaction(id, emoji) {
    const rs = st.reactions.get(id) || [];
    const mine = rs.find((r) => r.user_id === B.me.id && r.emoji === emoji);
    const q = mine
      ? B.sb.from('reactions').delete().match({ message_id: id, user_id: B.me.id, emoji })
      : B.sb.from('reactions').insert({ message_id: id, emoji });
    const { error: err } = await q;
    if (err) return B.error(err);
    await refreshReactions(id);
  }

  async function refreshReactions(id) {
    const { data } = await B.sb.from('reactions').select('*').eq('message_id', id);
    st.reactions.set(id, data || []);
    rerenderOne(id);
  }

  // ---------------- Filtres (Atelier) ----------------

  $$('.chat-filters .pill', root).forEach((b) => (b.onclick = () => {
    $$('.chat-filters .pill', root).forEach((x) => x.classList.toggle('on', x === b));
    st.filter = b.dataset.f;
    render();
  }));

  // ---------------- Temps réel ----------------

  B.live('msgs', 'messages', `channel_id=eq.${channel.id}`, async (p) => {
    if (p.eventType === 'INSERT') {
      if (st.messages.some((m) => m.id === p.new.id)) return;
      if (!B.profiles.has(p.new.author_id)) await B.loadProjects();
      st.messages.push(p.new);
      st.reactions.set(p.new.id, []);
      if (visible(p.new)) {
        $('.empty-chat', list)?.remove();
        list.appendChild(h(msgHtml(p.new)));
        scrollDown();
      }
    } else if (p.eventType === 'UPDATE') {
      const m = st.messages.find((x) => x.id === p.new.id);
      const wasPinned = st.pins.some((x) => x.id === p.new.id);
      if (m) {
        Object.assign(m, p.new);
        if (st.editing?.id !== m.id) rerenderOne(m.id);
      }
      if (Boolean(p.new.pinned_at) !== wasPinned || wasPinned) refreshPins();
    }
  });
  const refreshPins = debounce(loadPins, 300);

  // Suppressions : Supabase ne sait pas filtrer les DELETE par salon (seul l'identifiant du message
  // est transmis). On écoute donc toutes les suppressions et on ne garde que celles de ce salon.
  B.live('msgs-del', 'messages', null, (p) => {
    const id = p.old?.id;
    if (!id) return;
    if (st.messages.some((m) => m.id === id)) {
      st.messages = st.messages.filter((m) => m.id !== id);
      if (st.editing?.id === id) st.editing = null;
      const el = $(`.msg[data-id="${id}"]`, list);
      if (el) { el.classList.add('vanish'); setTimeout(() => { el.remove(); if (!st.messages.some(visible)) render(); }, 250); }
    }
    if (st.pins.some((x) => x.id === id)) { st.pins = st.pins.filter((x) => x.id !== id); renderPins(); }
  }, 'DELETE');
  B.live('reacts', 'reactions', null, (p) => {
    const id = (p.new && p.new.message_id) || (p.old && p.old.message_id);
    if (id && st.messages.some((m) => m.id === id)) refreshReactions(id);
  });
  B.live('files', 'files', `project_id=eq.${project.id}`, (p) => {
    const f = p.new;
    if (!f?.message_id || !st.messages.some((m) => m.id === f.message_id)) return;
    const arr = st.files.get(f.message_id) || [];
    if (!arr.some((x) => x.id === f.id)) arr.push(f);
    st.files.set(f.message_id, arr);
    rerenderOne(f.message_id);
  }, 'INSERT');

  // ---------------- Demandes en cours (Atelier) ----------------

  async function renderPending() {
    if (!isAi) return;
    const { data } = await B.sb.from('ai_requests').select('*')
      .eq('project_id', project.id).eq('requester_id', B.me.id)
      .in('status', ['pending', 'accepted']).order('created_at');
    $('.pending-requests', root).innerHTML = (data || []).map((r) => `
      <div class="pending">${icon('spark', 14)}
        <span><strong>${esc(PROVIDERS[r.provider]?.label)} (${esc(B.person(r.target_id).display_name)})</strong>
        ${r.status === 'pending' ? tr('attend son accord') : tr('est en train de répondre…')} · « ${esc(r.prompt.slice(0, 70))} »</span>
      </div>`).join('');
  }
  if (isAi) {
    renderPending();
    B.live('reqs', 'ai_requests', `requester_id=eq.${B.me.id}`, renderPending);
  }

  // ---------------- Pièces jointes ----------------

  const fileInput = $('.file-input', root);
  $('.attach', root).onclick = () => fileInput.click();
  fileInput.onchange = () => {
    st.pendingFiles.push(...B.acceptFiles(fileInput.files));
    fileInput.value = '';
    renderChips();
  };
  root.addEventListener('dragover', (e) => e.preventDefault());
  root.addEventListener('drop', (e) => {
    e.preventDefault();
    st.pendingFiles.push(...B.acceptFiles(e.dataTransfer.files));
    renderChips();
  });
  function renderChips() {
    $('.attach-chips', root).innerHTML = st.pendingFiles.map((f, i) =>
      `<span class="chip">${icon('clip', 13)} ${esc(f.name)} <button type="button" data-i="${i}">${icon('x', 12)}</button></span>`).join('');
    $$('.attach-chips button', root).forEach((b) => (b.onclick = () => {
      st.pendingFiles.splice(Number(b.dataset.i), 1);
      renderChips();
    }));
  }

  // ---------------- Autocomplétion des @ ----------------

  /** IA de ce membre qu'on peut lui demander depuis l'Atelier : clé API et/ou abonnement (une ligne par IA) */
  const theirAis = (p) => aisOf(p).filter((a) => PROVIDERS[a.id]);
  const modeHint = (a) => a.api && a.connector ? tr('clé API ou abonnement') : a.api ? tr("c'est sa clé API") : tr('via son abonnement, il la traitera depuis son app');

  const others = () => B.projectMembers(project.id).filter((p) => p.id !== B.me.id);

  function caretContext() {
    const before = ta.value.slice(0, ta.selectionStart);
    // 2e niveau : "@pseudo " juste tapé -> proposer ses IA (Atelier seulement)
    const m2 = before.match(/(^|\s)@([a-z0-9_]{3,30}) $/i);
    if (isAi && m2) {
      const person = others().find((p) => p.handle === m2[2].toLowerCase());
      if (person) return { level: 2, person };
    }
    const m1 = before.match(/(^|\s)@([a-z0-9_]*)$/i);
    if (m1) return { level: 1, q: m1[2].toLowerCase(), start: before.length - m1[2].length - 1 };
    return null;
  }

  function openAc() {
    const ctx = caretContext();
    if (!ctx) return closeAc();
    let options = [];
    if (ctx.level === 1) {
      if (isAi) {
        options.push(...B.myProviders.filter((p) => p.hasKey && PROVIDERS[p.id].word.startsWith(ctx.q)).map((p) => ({
          html: `${aiAvatar(p.id, 24, B.me)}<span><strong>@${PROVIDERS[p.id].word}</strong><small>${tr('Votre {ai} · sur votre clé API', { ai: esc(p.label) })}</small></span>`,
          insert: `@${PROVIDERS[p.id].word} `, start: ctx.start
        })));
      }
      options.push(...others().filter((p) => p.handle.startsWith(ctx.q) || p.display_name.toLowerCase().startsWith(ctx.q)).map((p) => ({
        html: `${avatar(p, 24)}<span><strong>@${esc(p.handle)}</strong><small>${esc(p.display_name)}${isAi && theirAis(p).length ? ' · ' + theirAis(p).map((a) => PROVIDERS[a.id].label).join(', ') : ''}</small></span>`,
        insert: `@${p.handle} `, start: ctx.start, then: isAi
      })));
    } else {
      const p = ctx.person;
      options.push({ html: `<span class="ac-space">␣</span><span><strong>${tr('Juste le mentionner')}</strong><small>${tr('{name} reçoit une notification', { name: esc(p.display_name) })}</small></span>`, insert: '', start: null });
      // Toutes les IA de ce membre : clé API et/ou abonnement (une seule ligne si les deux)
      options.push(...theirAis(p).map((a) => ({
        html: `${aiAvatar(a.id, 24, p)}<span><strong>${PROVIDERS[a.id].label}</strong><small>${tr('Utiliser le {ai} {de} · il devra accepter', { ai: PROVIDERS[a.id].label, de: esc(de(p.display_name)), name: esc(p.display_name) })} · ${modeHint(a)}</small></span>`,
        insert: `${PROVIDERS[a.id].label} `, start: null
      })));
      if (!theirAis(p).length) {
        options.push({ html: `<span class="ac-space">${icon('key', 14)}</span><span><small>${tr("{name} n'a pas encore branché d'IA", { name: esc(p.display_name) })}</small></span>`, insert: '', start: null, disabled: true });
      }
    }
    if (!options.length) return closeAc();
    st.ac = { options, index: 0 };
    acBox.innerHTML = options.map((o, i) => `<button type="button" class="ac-item ${i === 0 ? 'on' : ''} ${o.disabled ? 'disabled' : ''}" data-i="${i}">${o.html}</button>`).join('');
    acBox.classList.remove('hidden');
    $$('.ac-item', acBox).forEach((b) => b.onmousedown = (e) => { e.preventDefault(); pick(Number(b.dataset.i)); });
  }

  function closeAc() {
    st.ac = null;
    acBox.classList.add('hidden');
  }

  function pick(i) {
    const o = st.ac?.options[i];
    if (!o || o.disabled) return closeAc();
    const pos = ta.selectionStart;
    const start = o.start ?? pos;
    ta.value = ta.value.slice(0, start) + o.insert + ta.value.slice(pos);
    const caret = start + o.insert.length;
    ta.setSelectionRange(caret, caret);
    ta.focus();
    closeAc();
    if (o.then) openAc(); // enchaîne sur le choix de l'IA du membre
  }

  ta.addEventListener('input', () => { autoGrow(); openAc(); });
  ta.addEventListener('click', openAc);
  ta.addEventListener('blur', () => setTimeout(closeAc, 150));
  ta.addEventListener('keydown', (e) => {
    if (st.ac) {
      const n = st.ac.options.length;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        st.ac.index = (st.ac.index + (e.key === 'ArrowDown' ? 1 : n - 1)) % n;
        $$('.ac-item', acBox).forEach((b, i) => b.classList.toggle('on', i === st.ac.index));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); return pick(st.ac.index); }
      if (e.key === 'Escape') return closeAc();
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      $('.composer', root).requestSubmit();
    }
  });

  function autoGrow() {
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 220) + 'px';
  }

  // ---------------- Envoi ----------------

  /** Affiche un message tout juste créé (sans attendre le temps réel) */
  function addLocal(data) {
    if (st.messages.some((m) => m.id === data.id)) return;
    st.messages.push(data);
    st.reactions.set(data.id, []);
    if (visible(data)) { $('.empty-chat', list)?.remove(); list.appendChild(h(msgHtml(data))); scrollDown(); }
  }

  async function post(content) {
    const { data, error: err } = await B.sb.from('messages')
      .insert({ channel_id: channel.id, content }).select().single();
    if (err) throw err;
    addLocal(data);
    if (st.pendingFiles.length) {
      const files = st.pendingFiles.splice(0);
      renderChips();
      for (const f of files) {
        const row = await B.uploadFile(project.id, f, data.id).catch(B.error);
        if (row) {
          const arr = st.files.get(data.id) || [];
          if (!arr.some((x) => x.id === row.id)) arr.push(row);
          st.files.set(data.id, arr);
        }
      }
      rerenderOne(data.id);
    }
    return data;
  }

  function mentionedHandles(text) {
    return [...text.matchAll(/(^|\s)@([a-z0-9_]{3,30})/gi)].map((x) => x[2].toLowerCase());
  }

  function notifyMentions(text, skip = []) {
    const handles = mentionedHandles(text);
    const where = isAi ? tr("l'Atelier IA") : `#${channel.name}`;
    const link = isAi ? `#/p/${project.id}/atelier` : `#/p/${project.id}/discussion/${channel.id}`;
    others().filter((p) => handles.includes(p.handle) && !skip.includes(p.id)).forEach((p) =>
      B.notify(p.id, { projectId: project.id, type: 'mention', text: tr("{who} t'a mentionné dans {where} ({project}) : « {text} »", { who: B.me.display_name, where, project: project.name, text: text.slice(0, 140) }), link }));
  }

  function typing(label) {
    const t = h(`<div class="typing">${icon('spark', 14)} ${esc(label)}</div>`);
    list.appendChild(t);
    scrollDown();
    return t;
  }

  $('.composer', root).addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = ta.value.trim();
    if (!text && !st.pendingFiles.length) return;
    const content = text || st.pendingFiles.map((f) => `📎 ${f.name}`).join('\n');
    ta.value = '';
    autoGrow();
    closeAc();

    try {
      if (isAi) {
        const words = Object.keys(PROVIDER_BY_WORD).join('|');
        const mine = text.match(new RegExp(`^@(${words})\\b[\\s,:]*([\\s\\S]*)$`, 'i'));
        const theirs = text.match(new RegExp(`^@([a-z0-9_]{3,30})\\s+(${words})\\b[\\s,:]*([\\s\\S]*)$`, 'i'));

        // "@claude …" -> MON IA, MA clé
        if (mine) {
          const provider = PROVIDER_BY_WORD[mine[1].toLowerCase()];
          if (!B.hasProvider(provider)) {
            ta.value = text;
            if ((B.me.connector_providers || []).includes(provider)) {
              return B.toast(tr('Vous utilisez {ai} avec votre abonnement : demandez-le-lui depuis son application, par exemple « Dans Bivouac, projet {project}, {text} ». Sa réponse apparaîtra ici.', { ai: PROVIDERS[provider].label, project: esc(project.name), text: esc(text.replace(/^@\S+\s*/, '').slice(0, 60)) }), { timeout: 10000 });
            }
            return B.toast(tr('Branchez d\'abord votre clé {ai} dans <a href="#/settings">Paramètres</a>, ou utilisez le connecteur avec votre abonnement.', { ai: PROVIDERS[provider].label }), { type: 'error' });
          }
          await post(content);
          const t = typing(tr('{ai} réfléchit… (votre clé)', { ai: PROVIDERS[provider].label }));
          try {
            const answer = await B.runMyAi({ provider, projectId: project.id, channelId: channel.id, question: mine[2] || tr('Réagis aux derniers échanges.'), askedById: B.me.id });
            addLocal(answer);
          } finally { t.remove(); }
          return;
        }

        // "@amaury Claude …" -> demande à Amaury d'utiliser SON IA
        if (theirs) {
          const target = B.projectMembers(project.id).find((p) => p.handle === theirs[1].toLowerCase());
          const provider = PROVIDER_BY_WORD[theirs[2].toLowerCase()];
          if (target && target.id !== B.me.id) {
            if (!aisOf(target).some((x) => x.id === provider)) {
              ta.value = text;
              return B.toast(tr("{name} n'a pas branché {ai}.", { name: esc(target.display_name), ai: PROVIDERS[provider].label }), { type: 'error' });
            }
            await post(content);
            await B.requestAi({ targetId: target.id, provider, projectId: project.id, channelId: channel.id, prompt: theirs[3] || tr('Réagis aux derniers échanges.') });
            notifyMentions(text, [target.id]);
            return renderPending();
          }
        }
      }

      await post(content);
      notifyMentions(text);
    } catch (err) {
      B.error(err);
    }
  });
};
