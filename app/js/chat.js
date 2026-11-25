// =====================================================================
// chat.js — le fil de discussion, utilisé à deux endroits :
//   mode 'team' : Discussion de l'équipe (humains uniquement, façon Discord)
//   mode 'ai'   : Atelier IA (humains + IA, commandes @claude / @personne Claude)
// =====================================================================


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
    replyTo: null,        // message auquel je réponds (barre au-dessus de la zone de saisie)
    parents: new Map(),   // messages cités par une réponse mais pas chargés dans le fil (null = supprimé)
    ac: null,             // menu d'autocomplétion ouvert
    unfolded: new Set()   // longs messages dépliés par moi (le reste montre le début, puis « Afficher le message complet »)
  };
  // Un message est « long » au-delà de 14 lignes ou 900 caractères : on montre son début exact, jamais un résumé
  const isLong = (m) => (m.content || '').length > 900 || (m.content || '').split('\n').length > 14;

  root.innerHTML = `
    <div class="chat ${isAi ? 'is-ai' : ''}">
      ${isAi ? `<div class="chat-filters">
        <button class="pill on" data-f="all">${tr('Tous')}</button>
        <button class="pill" data-f="human">${tr('Humains')}</button>
        <button class="pill" data-f="ai">${tr('IA')}</button>
        <span class="spacer"></span>
        <button type="button" class="pill ai-brief-btn" data-ai-brief title="${esc(tr('Un texte tout prêt pour que votre IA travaille sur ce projet sans avoir à lui redire « dans Bivouac »'))}">${icon('spark', 14)} ${tr('Préparer pour mon IA')}</button>
      </div>` : ''}
      <div class="pending-requests"></div>
      <div class="messages"><div class="loading">${tr('Chargement…')}</div></div>
      <form class="composer">
        <div class="reply-bar hidden"></div>
        <div class="attach-chips"></div>
        <div class="composer-row">
          <button type="button" class="icon-btn attach" title="${tr('Joindre un fichier')}">${icon('plus', 20)}</button>
          <input type="file" class="file-input hidden" multiple />
          <textarea rows="1" placeholder="${B.isPhone?.()
            ? (isAi ? tr('Écrire…') : tr('Écrire dans #{channel}…', { channel: esc(channel.name) }))
            : isAi
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

  B.watchMessageImages(root);
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
      const head = $('.msg-body', el)?.getBoundingClientRect();
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
  let pinsBtn = null, pinsPop = null; // bouton « Messages épinglés » et sa fenêtre ouverte
  mountPinsButton();
  await Promise.all([loadExtras(st.messages.map((m) => m.id)), loadPins()]);
  render();
  // Arrivée depuis la recherche (v0.8.81) : on montre le message trouvé
  if (B.pendingJump) { const id = B.pendingJump; B.pendingJump = null; setTimeout(() => jumpTo(id), 60); }

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
    await loadParents(st.messages.filter((m) => ids.includes(m.id)));
  }

  /** Messages cités par des réponses, quand ils ne sont pas (encore) dans le fil chargé */
  async function loadParents(msgs) {
    const need = [...new Set(msgs.map((m) => m.reply_to).filter((id) => id && !st.parents.has(id) && !st.messages.some((x) => x.id === id)))];
    if (!need.length) return;
    const { data } = await B.sb.from('messages').select('id, author_id, content, is_ai, ai_provider, created_at').in('id', need);
    need.forEach((id) => st.parents.set(id, (data || []).find((x) => x.id === id) || null));
  }
  function parentOf(m) { return st.messages.find((x) => x.id === m.reply_to) || st.parents.get(m.reply_to) || null; }
  function whoWrote(m) { return m.is_ai ? aiName(m.ai_provider, B.person(m.author_id)) : B.person(m.author_id).display_name; }

  /** Citation au-dessus d'une réponse (clic = aller au message cité) */
  function replyQuoteHtml(m) {
    if (!m.reply_to) return '';
    const p = parentOf(m);
    if (!p) return `<div class="msg-reply gone">${icon('reply', 13)} <span>${tr('Message supprimé')}</span></div>`;
    return `<button type="button" class="msg-reply" data-jump-reply="${p.id}" title="${tr('Aller au message')}">${icon('reply', 13)}
      <strong translate="no">${esc(whoWrote(p))}</strong><span translate="no">${esc(firstLine(p.content))}</span></button>`;
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
      + shown.map((m, i) => (i === joinIdx ? `<div class="join-mark"><span>${tr('Vous avez rejoint le projet ici · les messages au-dessus datent d\'avant votre arrivée')}</span></div>` : '') + msgHtml(m, i ? shown[i - 1] : null)).join('');
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
    // Masqué par l'équipe Bivouac (migration 042) : seul l'auteur le voit encore
    const hidden = m.hidden_at ? ` <span class="hidden-note">${icon('eyeoff', 12)} ${tr('Masqué par l’équipe Bivouac : vous seul le voyez.')}</span>` : '';
    if (!m.edited_at) return hidden;
    const when = new Date(m.edited_at).toLocaleString(B.locale(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    return `<span class="edited" title="${tr('Modifié le {when}', { when })}">${tr('(modifié)')}</span>${hidden}`;
  }

  function editorHtml() {
    return `<div class="msg-edit">
        <textarea rows="2" translate="no">${esc(st.editing.draft)}</textarea>
        <div class="msg-edit-actions"><small class="muted">${tr('Entrée pour enregistrer · Échap pour annuler')}</small>
          <button type="button" class="btn small" data-edit-cancel>${tr('Annuler')}</button>
          <button type="button" class="btn small primary" data-edit-save>${tr('Enregistrer')}</button></div>
      </div>`;
  }

  // ---------------- Regroupement façon WhatsApp ----------------
  // Une IA se regroupe avec elle-même (même propriétaire, même façon d'arriver, même demandeur), jamais avec une personne.
  function senderKey(m) { return m.is_ai ? `ai:${m.author_id}:${m.ai_provider}:${m.via}:${m.requested_by || ''}` : `h:${m.author_id}`; }
  function shownNeighbour(m, step) {
    for (let i = st.messages.indexOf(m) + step; i >= 0 && i < st.messages.length; i += step) {
      if (visible(st.messages[i])) return st.messages[i];
    }
    return null;
  }
  /** Le message précédent du même bloc, ou null si ce message ouvre un bloc (avatar, nom, heure) */
  function groupPrev(m, prev) {
    if (prev === undefined) prev = shownNeighbour(m, -1);
    if (!prev || (myJoin && prev.created_at < myJoin && m.created_at >= myJoin)) return null; // repère « Vous avez rejoint »
    return B.msgSameGroup(prev, m, senderKey) ? prev : null;
  }

  function msgHtml(m, prevShown) {
    const author = B.person(m.author_id);
    const files = st.files.get(m.id) || [];
    const mine = m.author_id === B.me.id;
    const editing = st.editing?.id === m.id;
    const pinTag = m.pinned_at ? `<span class="pin-tag">${icon('pin', 12)} ${tr('Épinglé')}</span>` : '';
    const prev = groupPrev(m, prevShown);
    let head, side, headHtml;
    if (prev) {
      // Suite d'un bloc : ni avatar ni nom ; l'heure dans la marge seulement si elle change (sinon au survol)
      const extra = pinTag + editedHtml(m);
      side = `<span class="msg-gutter" aria-hidden="${B.msgSameMinute(prev, m)}"><span class="time ${B.msgSameMinute(prev, m) ? '' : 'show'}">${fmtTime(m.created_at)}</span></span>`;
      headHtml = extra ? `<div class="msg-head mini">${extra}</div>` : '';
    } else if (m.is_ai) {
      const asked = m.requested_by && m.requested_by !== m.author_id
        ? ` · ${tr('demandé par {who}', { who: esc(B.person(m.requested_by).display_name) })}` : '';
      head = `<span class="name" translate="no">${esc(aiName(m.ai_provider, author))}</span>
        <span class="tag ai">${tr('IA')}</span><span class="time">${fmtTime(m.created_at)} · ${m.via === 'connector' ? tr('via connecteur') : tr('via API')}${asked}</span>${editedHtml(m)}`;
    } else {
      head = `<span class="name">${esc(author.display_name)}</span><span class="time">${fmtTime(m.created_at)}</span>${editedHtml(m)}`;
    }
    if (!prev) {
      side = m.is_ai ? aiAvatar(m.ai_provider, 38, author) : avatar(author, 38);
      headHtml = `<div class="msg-head">${head}${pinTag}</div>`;
    }
    // IA : avatar double (marque + propriétaire) et liseré à la couleur de son propriétaire
    return `<div class="msg ${m.is_ai ? 'ai' : ''} ${mine && !m.is_ai ? 'mine' : ''} ${prev ? 'cont' : ''} ${m.pinned_at ? 'pinned' : ''}" data-id="${m.id}"${m.is_ai ? ` style="--owner:${colorFor(author.id)}"` : ''}>
      ${side}
      <div class="msg-body">
        ${headHtml}
        ${replyQuoteHtml(m)}
        ${editing ? editorHtml() : isLong(m) ? `<div class="msg-text ${st.unfolded.has(m.id) ? '' : 'folded'}" id="mt-${m.id}" translate="no">${md(m.content)}</div>
          <button type="button" class="msg-more" data-more aria-controls="mt-${m.id}" aria-expanded="${st.unfolded.has(m.id)}">${st.unfolded.has(m.id) ? tr('Réduire') : tr('Afficher le message complet')}${icon(st.unfolded.has(m.id) ? 'up' : 'down', 14)}</button>`
          : `<div class="msg-text" translate="no">${md(m.content)}</div>`}
        ${files.length ? `<div class="msg-files">${files.map(fileCard).join('')}</div>` : ''}
        ${reactionsHtml(m.id)}
        ${threadLinkHtml(m)}
        ${mine && !m.is_ai ? `<small class="msg-read muted">${readersIndicator(m.id)}</small>` : ''}
      </div>
      <div class="msg-tools">
        <button type="button" class="icon-btn" data-quick="reply" title="${tr('Répondre')}" aria-label="${tr('Répondre')}">${icon('reply', 16)}</button>
        <button type="button" class="icon-btn" data-quick="react" title="${tr('Ajouter une réaction')}" aria-label="${tr('Ajouter une réaction')}">${icon('smile', 16)}</button>
        <button type="button" class="icon-btn msg-menu" data-msg-menu aria-haspopup="menu" aria-expanded="false" title="${tr('Plus d’actions (ou clic droit sur le message)')}" aria-label="${tr('Actions du message')}">⋯</button>
      </div>
    </div>`;
  }

  function fileCard(f) {
    const isImg = (f.mime || '').startsWith('image/');
    const media = B.messageMedia(f, 'project-files');
    if (media) {
      return `<div class="file-media">${media}<button class="file-card" data-file="${esc(f.id)}" data-msg="${esc(f.message_id)}" title="${tr('Ouvrir')}">
        <span class="file-ico">${icon('file', 20)}</span><span><strong>${esc(f.name)}</strong><small>${fmtSize(f.size)}</small></span></button></div>`;
    }
    return `<button class="file-card" data-file="${esc(f.id)}" data-msg="${esc(f.message_id)}" title="${tr('Ouvrir')}">
      <span class="file-ico">${icon(isImg ? 'image' : 'file', 20)}</span>${B.messageImage(f, 'project-files')}
      <span><strong>${esc(f.name)}</strong><small>${fmtSize(f.size)}</small></span></button>`;
  }

  function reactionsHtml(id) { return B.reactionsHtml(st.reactions.get(id)); }

  // ---------------- Fils de discussion (v0.8.81) ----------------
  // Un fil = un message et toutes les réponses qui le citent (reply_to, migration 038), sans nouvelle table.
  // Sous un message qui a des réponses : « 3 réponses · dernière à 14:05 », qui ouvre le fil à part.
  function repliesOf(id) { return st.messages.filter((x) => x.reply_to === id); }
  function threadLinkHtml(m) {
    const rs = repliesOf(m.id);
    if (!rs.length) return '';
    const last = rs[rs.length - 1];
    return `<button type="button" class="thread-link" data-thread="${m.id}">${icon('thread', 14)}
      <span>${tr(rs.length > 1 ? '{n} réponses' : '{n} réponse', { n: rs.length })}</span>
      <small class="muted">${tr('dernière à {time}', { time: fmtTime(last.created_at) })}</small></button>`;
  }
  /** Un nouveau message qui répond : le compteur du message cité se met à jour */
  function bumpThread(m) { if (m?.reply_to && st.messages.some((x) => x.id === m.reply_to)) rerenderOne(m.reply_to); refreshThread(); }

  let threadRoot = null; // fil ouvert (identifiant du premier message)
  /** Remonte au premier message du fil (tant que le message cité est connu) */
  function threadTop(id) {
    let cur = st.messages.find((x) => x.id === id) || st.parents.get(id);
    for (let i = 0; cur?.reply_to && i < 20; i++) {
      const up = st.messages.find((x) => x.id === cur.reply_to) || st.parents.get(cur.reply_to);
      if (!up) break;
      cur = up;
    }
    return cur?.id || id;
  }
  async function loadThread(rootId) {
    const { data: root } = await B.sb.from('messages').select('*').eq('id', rootId).maybeSingle();
    const all = root ? [root] : [];
    let level = [rootId];
    for (let depth = 0; level.length && depth < 5; depth++) { // réponses aux réponses, 5 niveaux au plus
      const { data } = await B.sb.from('messages').select('*').eq('channel_id', channel.id).in('reply_to', level).order('created_at').limit(200);
      const fresh = (data || []).filter((x) => !all.some((y) => y.id === x.id));
      all.push(...fresh);
      level = fresh.map((x) => x.id);
    }
    return all.sort((a, b) => a.created_at.localeCompare(b.created_at));
  }
  function threadMsgHtml(m, root) {
    const author = B.person(m.author_id);
    const files = st.files.get(m.id) || [];
    return `<div class="thread-msg ${m.id === root ? 'root' : ''}">
      ${m.is_ai ? aiAvatar(m.ai_provider, 28, author) : avatar(author, 28)}
      <div><div class="msg-head"><span class="name" translate="no">${esc(whoWrote(m))}</span>${m.is_ai ? `<span class="tag ai">${tr('IA')}</span>` : ''}
        <span class="time">${new Date(m.created_at).toLocaleString(B.locale(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span></div>
        <div class="msg-text" translate="no">${md(m.content)}</div>
        ${files.length ? `<div class="msg-files">${files.map(fileCard).join('')}</div>` : ''}</div></div>`;
  }
  async function openThread(id) {
    threadRoot = threadTop(id);
    const m = B.modal(`<div class="thread-panel"><div class="media-head"><h2>${icon('thread', 18)} ${tr('Fil de discussion')}</h2>
      <button type="button" class="icon-btn" data-close aria-label="${tr('Fermer')}">×</button></div>
      <div class="thread-list"><div class="loading">${tr('Chargement…')}</div></div>
      <form class="thread-compose"><textarea rows="2" maxlength="40000" placeholder="${esc(tr('Répondre dans le fil…'))}" aria-label="${esc(tr('Répondre dans le fil…'))}"></textarea>
        <button type="submit" class="btn primary">${icon('send', 15)} ${tr('Envoyer')}</button></form></div>`, { wide: true });
    $('[data-close]', m).onclick = () => { threadRoot = null; B.closeModal(); };
    const ta2 = $('.thread-compose textarea', m);
    ta2.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('.thread-compose', m).requestSubmit(); } });
    $('.thread-compose', m).onsubmit = async (e) => {
      e.preventDefault();
      const text = ta2.value.trim();
      if (!text) return;
      ta2.value = '';
      try {
        // Toutes les réponses du fil citent son premier message : le compteur reste sous ce message
        const { data, error: err } = await B.sb.from('messages').insert({ channel_id: channel.id, content: text, reply_to: threadRoot }).select().single();
        if (err) throw err;
        addLocal(data);
        B.sendPush('message', data.id);
        notifyMentions(text);
        refreshThread();
      } catch (err) { ta2.value = text; B.error(err); }
    };
    await refreshThread();
    ta2.focus();
  }
  async function refreshThread() {
    if (!threadRoot) return;
    const box = $('#modal .thread-list');
    if (!box) { threadRoot = null; return; }
    const rootId = threadRoot;
    const msgs = await loadThread(rootId);
    const missing = msgs.map((x) => x.id).filter((id) => !st.files.has(id));
    if (missing.length) {
      const { data } = await B.sb.from('files').select('*').in('message_id', missing);
      (data || []).forEach((x) => { if (!st.files.has(x.message_id)) st.files.set(x.message_id, []); if (!st.files.get(x.message_id).some((y) => y.id === x.id)) st.files.get(x.message_id).push(x); });
    }
    if (threadRoot !== rootId || !box.isConnected) return;
    box.innerHTML = msgs.length ? msgs.map((x) => threadMsgHtml(x, rootId)).join('') : `<p class="muted">${tr('Message supprimé')}</p>`;
    paintIcons(box);
    box.scrollTop = box.scrollHeight;
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

    if (e.target.closest('[data-more]')) {
      const open = !st.unfolded.has(id);
      if (open) st.unfolded.add(id); else st.unfolded.delete(id);
      const text = $('.msg-text', msgEl), btn = $('[data-more]', msgEl);
      text.classList.toggle('folded', !open);
      btn.setAttribute('aria-expanded', String(open));
      btn.innerHTML = `${open ? tr('Réduire') : tr('Afficher le message complet')}${icon(open ? 'up' : 'down', 14)}`;
      // En réduisant, on garde le message sous les yeux (sans perdre sa place dans le fil)
      if (!open && msgEl.getBoundingClientRect().top < list.getBoundingClientRect().top) msgEl.scrollIntoView({ block: 'start' });
      return;
    }
    const menuBtn = e.target.closest('[data-msg-menu]');
    if (menuBtn) return openMsgMenu(id, { anchor: menuBtn });
    const quick = e.target.closest('[data-quick]');
    if (quick) return act(quick.dataset.quick, id);
    const jump = e.target.closest('[data-jump-reply]');
    if (jump) return jumpTo(jump.dataset.jumpReply);
    const thread = e.target.closest('[data-thread]');
    if (thread) return openThread(thread.dataset.thread);

    if (e.target.closest('[data-edit-cancel]')) return stopEdit();
    if (e.target.closest('[data-edit-save]')) return saveEdit();
  });

  // ---------------- Actions sur un message (menu du clic droit / appui long, et boutons au survol) ----------------

  /** Une action sur le message id : reply, copy, react, pin, edit, del, report */
  async function act(action, id) {
    const m = st.messages.find((x) => x.id === id);
    if (!m) return;
    if (action === 'reply') return startReply(m);
    if (action === 'thread') return openThread(id);
    if (action === 'copy') return copyMessage(m);
    if (action === 'react') return B.openMediaPicker({ emojisOnly: true, onEmoji: (emoji) => toggleReaction(id, emoji) });
    if (action === 'pin') return togglePin(m);
    if (action === 'edit') return startEdit(id);
    if (action === 'report') return B.reportContent({ projectId: project.id, type: 'message', targetId: id, targetUser: m.author_id, excerpt: m.content });
    if (action === 'del') {
      const other = m.author_id !== B.me.id;
      const question = other
        ? tr('Supprimer le message de {who} ? En tant que responsable du projet, vous pouvez le faire : ce sera noté dans l\'activité du projet.',
          { who: whoWrote(m) })
        : tr('Supprimer ce message ?');
      if (!(await B.confirm(question, tr('Supprimer')))) return;
      try { await B.deleteRow('messages', id); } catch (err) { return B.error(err); }
      st.messages = st.messages.filter((x) => x.id !== id);
      if (st.editing?.id === id) st.editing = null;
      if (st.replyTo?.id === id) cancelReply();
      render();
      if (st.pins.some((p) => p.id === id)) { st.pins = st.pins.filter((p) => p.id !== id); renderPins(); }
    }
  }

  /** Copie le message entier (texte tel qu'il a été écrit), avec les noms des pièces jointes */
  async function copyMessage(m) {
    const files = (st.files.get(m.id) || []).map((f) => `📎 ${f.name}`);
    const text = [m.content, ...files.filter((f) => !String(m.content).includes(f))].join('\n');
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch {
      const tmp = h('<textarea class="copy-tmp" aria-hidden="true"></textarea>');
      tmp.value = text; document.body.appendChild(tmp); tmp.select();
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      tmp.remove();
    }
    B.toast(esc(ok ? tr('Message copié.') : tr('Impossible de copier ce message.')), { type: ok ? 'success' : 'error', timeout: 2000 });
  }

  /** Ouvre le menu d'un message (menu partagé avec les messages privés : msgmenu.js) */
  function openMsgMenu(id, { x, y, anchor } = {}) {
    const m = st.messages.find((z) => z.id === id);
    if (!m) return;
    const mine = m.author_id === B.me.id;
    const items = [
      { act: 'reply', icon: 'reply', label: tr('Répondre') },
      { act: 'thread', icon: 'thread', label: m.reply_to || repliesOf(m.id).length ? tr('Voir le fil') : tr('Répondre dans un fil') },
      { act: 'copy', icon: 'copy', label: tr('Copier le message') },
      ...(st.pinsReady ? [{ act: 'pin', icon: 'pin', label: m.pinned_at ? tr('Désépingler') : tr('Épingler') }] : []),
      ...(mine && !m.is_ai ? [{ act: 'edit', icon: 'edit', label: tr('Modifier') }] : []),
      ...(mine || B.isManager(project.id) ? [{ act: 'del', icon: 'trash', label: mine ? tr('Supprimer') : tr('Supprimer (modération)'), danger: true }] : []),
      ...(mine ? [] : [{ act: 'report', icon: 'flag', label: tr('Signaler') }])
    ];
    B.openMsgMenu({ key: id, x, y, anchor, items, scroller: list, msgEl: $(`.msg[data-id="${id}"]`, list),
      reacted: (st.reactions.get(id) || []).filter((r) => r.user_id === B.me.id).map((r) => r.emoji),
      onEmoji: (emoji) => toggleReaction(id, emoji), onAct: (a) => act(a, id) });
  }
  B.onLeave(() => B.closeMsgMenu());
  B.bindMsgPress(list, { selector: '.msg', idOf: (el) => el.dataset.id, open: openMsgMenu });

  // ---------------- Répondre à un message ----------------

  const replyBar = $('.reply-bar', root);
  function startReply(m) {
    st.replyTo = m;
    replyBar.innerHTML = `${icon('reply', 15)}<span class="reply-text">${tr('Répondre à {who}', { who: `<strong translate="no">${esc(whoWrote(m))}</strong>` })}
        <span class="muted" translate="no">${esc(firstLine(m.content))}</span></span>
      <button type="button" class="icon-btn" data-reply-cancel title="${tr('Annuler la réponse')}" aria-label="${tr('Annuler la réponse')}">${icon('x', 15)}</button>`;
    paintIcons(replyBar);
    replyBar.classList.remove('hidden');
    $('[data-reply-cancel]', replyBar).onclick = () => { cancelReply(); ta.focus(); };
    ta.focus();
  }
  function cancelReply() {
    st.replyTo = null;
    replyBar.classList.add('hidden');
    replyBar.innerHTML = '';
  }

  // ---------------- Messages épinglés ----------------

  async function loadPins() {
    const { data, error: err } = await B.sb.from('messages').select('*')
      .eq('channel_id', channel.id).not('pinned_at', 'is', null)
      .order('pinned_at', { ascending: false }).limit(25);
    if (err) { st.pinsReady = false; return; } // migration 013 pas encore appliquée : on cache la fonction
    st.pins = data || [];
    renderPins();
  }

  function firstLine(text) { return B.msgFirstLine(text); }

  // Bouton « Messages épinglés » en haut à droite de la discussion (en-tête du salon / de l'Atelier)
  function mountPinsButton() {
    const pinsSlot = root.closest('.channel-main')?.querySelector('.pins-slot') || $('.chat-filters', root);
    if (!pinsSlot) return;
    pinsBtn = B.pinsButton(pinsSlot);
    pinsBtn.classList.add('hidden');
    pinsBtn.onclick = () => (pinsPop ? closePins() : openPins());
    B.onLeave(() => { closePins(); pinsBtn.remove(); });
  }

  function renderPins() {
    if (pinsBtn) {
      pinsBtn.classList.toggle('hidden', !st.pinsReady);
      B.paintPinsButton(pinsBtn, st.pins.length);
    }
    pinsPop?.fill();
  }

  function jumpTo(id) {
    const el = $(`.msg[data-id="${id}"]`, list);
    if (!el) return B.toast(esc(tr('Ce message est plus ancien que ceux affichés : chargez les messages plus anciens pour le retrouver.')), { timeout: 4000 });
    if (st.filter !== 'all' && el.offsetParent === null) { st.filter = 'all'; render(); return jumpTo(id); }
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  }

  function closePins() { pinsPop?.close(); }

  function fillPins(el) {
    const hint = B.isPhone?.() ? tr('Appui long sur un message, puis « Épingler ».') : tr('Clic droit sur un message, puis « Épingler ».');
    el.innerHTML = `<div class="pins-head"><h3>${icon('pin', 16)} ${tr('Messages épinglés')}${st.pins.length ? ` <span class="muted">· ${st.pins.length}</span>` : ''}</h3>
        <button type="button" class="icon-btn" data-pins-close aria-label="${tr('Fermer')}">${icon('x', 15)}</button></div>
      ${st.pins.length ? `<div class="pins-list">${st.pins.map((p) => `
        <div class="pin-item" data-id="${p.id}">
          <div class="pin-item-head"><strong translate="no">${esc(whoWrote(p))}</strong><span class="muted small">${fmtTime(p.created_at)}
            ${p.pinned_by ? ` · ${tr('épinglé par {who}', { who: esc(B.person(p.pinned_by).display_name) })}` : ''}</span></div>
          <div class="msg-text pin-text" translate="no">${md(p.content)}</div>
          <div class="pin-actions">
            ${st.messages.some((x) => x.id === p.id) ? `<button type="button" class="btn small" data-go>${tr('Aller au message')}</button>` : ''}
            <button type="button" class="btn small" data-unpin>${tr('Désépingler')}</button></div>
        </div>`).join('')}</div>`
      : `<p class="pins-empty muted">${tr('Aucun message épinglé dans ce salon.')}<br>${hint}</p>`}`;
    $('[data-pins-close]', el).onclick = () => { closePins(); pinsBtn?.focus(); };
    $$('.pin-item', el).forEach((it) => {
      const p = st.pins.find((x) => x.id === it.dataset.id);
      const go = $('[data-go]', it);
      if (go) go.onclick = () => { closePins(); jumpTo(p.id); };
      $('[data-unpin]', it).onclick = () => togglePin(p);
    });
  }

  function openPins() {
    if (!pinsBtn) return;
    pinsPop = B.openPinsPop(pinsBtn, fillPins, () => { pinsPop = null; });
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
    if (pin) B.toast(esc(tr('Message épinglé : retrouvez-le avec le bouton 📌 en haut à droite.')), { type: 'success', timeout: 3000 });
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
    if (!st.editing || st.editing.saving) return;
    const { id, draft } = st.editing;
    const m = st.messages.find((x) => x.id === id);
    const text = draft.trim();
    if (!m) return stopEdit();
    if (!text) return B.toast(tr("Un message ne peut pas être vide. Pour l'effacer, utilisez Supprimer."), { type: 'error' });
    if (text === m.content) return stopEdit();
    const editing = st.editing; editing.saving = true;
    const controls = $$('textarea, button', $(`.msg[data-id="${id}"] .msg-edit`, list));
    controls.forEach(el => { el.disabled = true; });
    let data;
    try {
      const result = await B.sb.from('messages').update({ content: text }).eq('id', id).select().single();
      if (result.error) throw result.error;
      if (!result.data) throw new Error(tr('Message introuvable.'));
      data = result.data;
    } catch (err) { B.error(err); return; }
    finally { editing.saving = false; controls.forEach(el => { el.disabled = false; }); }
    if (!active) return;
    const before = m.content;
    Object.assign(m, data);
    if (st.editing === editing) stopEdit();
    else rerenderOne(id);
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
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); saveEdit(); }
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

  $('[data-ai-brief]', root)?.addEventListener('click', () => B.openAiBrief(project));
  $$('.chat-filters .pill[data-f]', root).forEach((b) => (b.onclick = () => {
    $$('.chat-filters .pill[data-f]', root).forEach((x) => x.classList.toggle('on', x === b));
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
      await loadParents([p.new]);
      if (visible(p.new)) {
        $('.empty-chat', list)?.remove();
        list.appendChild(h(msgHtml(p.new)));
        scrollDown();
      }
      bumpThread(p.new);
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
      // Le message suivant peut devenir le début d'un bloc (avatar, nom, heure) : on le redessine
      const next = shownNeighbour(st.messages.find((m) => m.id === id), 1);
      st.messages = st.messages.filter((m) => m.id !== id);
      if (st.editing?.id === id) st.editing = null;
      const el = $(`.msg[data-id="${id}"]`, list);
      if (el) {
        el.classList.add('vanish');
        setTimeout(() => {
          el.remove();
          if (!st.messages.some(visible)) render();
          else if (next && st.editing?.id !== next.id) rerenderOne(next.id);
        }, 250);
      }
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
        ${r.status === 'pending' ? tr('attend son accord') : tr('a accepté · réponse attendue')} · « ${esc(r.prompt.slice(0, 70))} »</span>
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
    addMediaFiles(fileInput.files);
    fileInput.value = '';
    renderChips();
  };
  root.addEventListener('dragover', (e) => e.preventDefault());
  root.addEventListener('drop', (e) => {
    e.preventDefault();
    addMediaFiles(e.dataTransfer.files);
    renderChips();
  });
  const previewPending = B.bindMediaComposer($('.composer', root), ta, addMediaFiles);
  function addMediaFiles(files) {
    const accepted = B.acceptFiles(files);
    if (!accepted.length) return false;
    st.pendingFiles.push(...accepted); renderChips(); return true;
  }
  function renderChips() {
    $('.attach-chips', root).innerHTML = st.pendingFiles.map((f, i) =>
      `<span class="chip">${icon('clip', 13)} ${esc(f.name)} <button type="button" data-i="${i}">${icon('x', 12)}</button></span>`).join('');
    previewPending($('.attach-chips', root), st.pendingFiles);
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
    if (e.key === 'Escape' && st.replyTo) { e.preventDefault(); return cancelReply(); }
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
    bumpThread(data);
  }

  async function post(content) {
    const row = { channel_id: channel.id, content };
    const replyTo = st.replyTo?.id && st.messages.some((m) => m.id === st.replyTo.id) ? st.replyTo.id : null;
    if (replyTo) row.reply_to = replyTo;
    let { data, error: err } = await B.sb.from('messages').insert(row).select().single();
    // Base pas encore à jour (migration 038) : on envoie quand même, sans la citation
    if (err && replyTo && /reply_to/.test(err.message || '')) ({ data, error: err } = await B.sb.from('messages').insert({ channel_id: channel.id, content }).select().single());
    if (err) throw err;
    if (replyTo) cancelReply();
    addLocal(data);
    B.sendPush('message', data.id); // notifications app fermée (selon le niveau de chacun pour ce projet)
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
    const everyone = handles.some((x) => ['tous', 'all', 'everyone', 'equipe'].includes(x)); // @tous : toute l'équipe
    others().filter((p) => (everyone || handles.includes(p.handle)) && !skip.includes(p.id)).forEach((p) =>
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
    const content = text || st.pendingFiles.map(B.attachmentLabel).join('\n');
    ta.value = '';
    B.grammarReset?.(ta);
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

