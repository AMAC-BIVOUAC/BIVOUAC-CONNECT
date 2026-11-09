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
  `<span class="online-av">${avatar(person, size)}${presence ? `<span class="presence ${B.isOnline(person.id) ? '' : 'off'}" data-online="${person.id}"></span>` : ''}<span class="av-badge hidden" data-dm-unread="${person.id}" title="${esc(tr('Messages privés non lus'))}"></span></span>`;

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
        <span class="space-name" translate="no">${esc(m.display_name)}</span>
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
      if (msg.sender_id === B.dmOpen && document.hasFocus()) { B.sb.rpc('mark_dm_read', { p_other: msg.sender_id }); return; }
      B.dmUnread.set(msg.sender_id, (B.dmUnread.get(msg.sender_id) || 0) + 1);
      dmChanged();
      B.playSound('notif');
      const who = B.person(msg.sender_id).display_name;
      window.bivouac.notify('Bivouac-Tech', tr('Message privé de {name}', { name: who }), B.soundPrefs().notif);
      if (msg.sender_id !== B.dmOpen) {
        B.toast(`${tr('Message privé de {name}', { name: `<span translate="no">${esc(who)}</span>` })} <a href="#/messages/${msg.sender_id}">${tr('Ouvrir')}</a>`);
      }
    })
    .subscribe();
  window.addEventListener('focus', () => { if (B.dmOpen && B.dmUnread.get(B.dmOpen)) readConversation(B.dmOpen); });
};

async function readConversation(other) {
  if (!B.dmUnread.get(other)) return;
  B.dmUnread.delete(other);
  dmChanged();
  await B.sb.rpc('mark_dm_read', { p_other: other });
}

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
    const { data, error } = await B.sb.from('direct_messages').select('sender_id, recipient_id, content, created_at')
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
          <small translate="no">${l ? `${l.sender_id === B.me.id ? tr('Vous :') + ' ' : ''}${esc(l.content.replace(/[*`#]/g, '').replace(/\s+/g, ' ').slice(0, 60))}` : `<em>${tr('Aucun message')}</em>`}</small></span></a>`;
    }).join('') || `<p class="muted small dm-pad">${tr('Personne pour l\'instant.')}</p>`;
    paintDmBadges();
  };
  await renderList();
  B.onLeave(B.on('dm-presence', () => $$('[data-online]', view).forEach((d) => d.classList.toggle('off', !B.isOnline(d.dataset.online)))));

  if (!other) {
    B.onLeave(B.on('dm', debounce(renderList, 300)));
    return;
  }

  // Conversation avec une personne
  const conv = $('.dm-conv', view);
  conv.innerHTML = `
    <header class="dm-head"><a class="icon-btn dm-back" href="#/messages" title="${tr('Retour')}">${icon('arrow', 16)}</a>
      ${avatar(other, 32)}<div><strong translate="no">${esc(other.display_name)}</strong><small class="dm-status"></small></div></header>
    <div class="dm-msgs"><div class="loading">${tr('Chargement…')}</div></div>
    <form class="dm-compose"><textarea rows="2" maxlength="4000" placeholder="${esc(tr('Écrire à {name}…', { name: other.display_name }))}"></textarea>
      <button class="btn primary" type="submit" title="${tr('Envoyer')}">${icon('send', 16)}</button></form>`;
  const status = () => { $('.dm-status', conv).textContent = B.isOnline(other.id) ? tr('En ligne') : tr('Hors ligne'); };
  status();
  B.onLeave(B.on('dm-presence', status));

  const box = $('.dm-msgs', conv);
  const shown = new Set();
  const bubble = (d) => `<div class="dm-msg ${d.sender_id === B.me.id ? 'mine' : ''}"><div class="dm-bubble" translate="no">${md(d.content)}</div><small>${fmtTime(d.created_at)}</small></div>`;
  const add = (d) => {
    if (shown.has(d.id)) return;
    shown.add(d.id);
    box.querySelector('.empty-dm')?.remove();
    box.insertAdjacentHTML('beforeend', bubble(d));
    box.scrollTop = box.scrollHeight;
  };
  const { data: msgs, error } = await B.sb.from('direct_messages').select('*')
    .or(`and(sender_id.eq.${B.me.id},recipient_id.eq.${other.id}),and(sender_id.eq.${other.id},recipient_id.eq.${B.me.id})`)
    .order('created_at', { ascending: false }).limit(200);
  box.innerHTML = '';
  if (error) box.innerHTML = `<p class="muted small dm-pad">${esc(errText(error))}</p>`;
  else if (!msgs.length) box.innerHTML = `<p class="muted small empty-dm dm-pad">${tr('Aucun message pour l\'instant. Dites bonjour !')}</p>`;
  (msgs || []).reverse().forEach(add);
  readConversation(other.id);

  B.onLeave(B.on('dm', (d) => {
    if (d.sender_id === other.id) add(d);
    renderList();
  }));

  const form = $('.dm-compose', conv), ta = $('textarea', form);
  ta.focus();
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); } });
  form.onsubmit = async (e) => {
    e.preventDefault();
    const content = ta.value.trim();
    if (!content) return;
    ta.disabled = true;
    const { data, error: err } = await B.sb.from('direct_messages').insert({ sender_id: B.me.id, recipient_id: other.id, content }).select().single();
    ta.disabled = false;
    if (err) return B.error(new Error(/row-level security/.test(err.message || '') ? tr('Vous ne partagez plus de projet avec cette personne.') : errText(err)));
    ta.value = '';
    ta.focus();
    add(data);
    renderList();
  };
};
