// =====================================================================
// ui.js — éléments d'interface communs : fenêtres, toasts, avatars,
// barre latérale, recherche, demandes d'IA entrantes, accompagnement
// =====================================================================

// ---------- Avatars ----------

function avatar(person, size = 36) {
  const p = person || {};
  if (p.avatar && /^data:image\/(jpeg|png);base64,/.test(p.avatar)) {
    return `<img class="avatar photo" src="${esc(p.avatar)}" alt="" width="${size}" height="${size}" style="width:${size}px;height:${size}px" />`;
  }
  return `<span class="avatar" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.38)}px;background:${colorFor(p.id)}">${esc(initials(p.display_name))}</span>`;
}

/** Transforme une image choisie en photo de profil : carré central, 160 px, JPEG */
B.squarePhoto = (file) => new Promise((resolve, reject) => {
  if (!/^image\//.test(file.type)) return reject(new Error(tr('Choisissez une image (JPEG, PNG…).')));
  if (file.size > 20 * 1024 * 1024) return reject(new Error(tr('Image trop lourde (20 Mo maximum).')));
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const c = document.createElement('canvas');
    c.width = c.height = 160;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 160, 160);
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, 160, 160);
    URL.revokeObjectURL(url);
    resolve(c.toDataURL('image/jpeg', 0.85));
  };
  img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(tr('Cette image ne peut pas être lue.'))); };
  img.src = url;
});

/**
 * Pastille d'une IA (couleur de la marque). Avec `owner`, la photo / les initiales de son propriétaire
 * s'ajoutent en petit en bas à droite : on voit d'un coup d'œil à qui appartient l'IA.
 */
function aiAvatar(provider, size = 36, owner = null) {
  const meta = PROVIDERS[provider] || { label: 'IA', color: '#F28C28' };
  // Logo officiel de la marque quand on a le droit de l'utiliser (logos.js), sinon l'étincelle Bivouac
  const logo = (typeof AI_LOGOS !== 'undefined' && AI_LOGOS[provider]) || null;
  const glyph = logo
    ? `<svg class="ai-logo" viewBox="0 0 24 24" width="${Math.round(size * 0.58)}" height="${Math.round(size * 0.58)}" aria-hidden="true"><path fill="#fff" d="${logo.d}"/></svg>`
    : icon('spark', Math.round(size * 0.55));
  const tile = `<span class="avatar ai" role="img" aria-label="${esc(meta.label)}" style="width:${size}px;height:${size}px;background:${logo ? logo.hex : meta.color}">${glyph}</span>`;
  if (!owner) return tile;
  const badge = Math.max(14, Math.round(size * 0.5));
  return `<span class="ai-duo" style="width:${size}px;height:${size}px" title="${esc(aiName(provider, owner))}">${tile}<span class="ai-owner">${avatar(owner, badge)}</span></span>`;
}

// ---------- Petit menu flottant (clic droit) ----------

/** Ouvre un petit menu à la position de la souris ; se ferme au clic dehors ou avec Échap */
B.popMenu = (x, y, html) => {
  B.closePopMenu();
  const m = document.createElement('div');
  m.className = 'pop-menu';
  m.innerHTML = html;
  document.body.appendChild(m);
  const r = m.getBoundingClientRect();
  m.style.left = `${Math.max(8, Math.min(x, innerWidth - r.width - 8))}px`;
  m.style.top = `${Math.max(8, Math.min(y, innerHeight - r.height - 8))}px`;
  setTimeout(() => document.addEventListener('mousedown', outside), 0);
  return m;
};
function outside(e) { if (!e.target.closest('.pop-menu')) B.closePopMenu(); }
B.closePopMenu = () => {
  document.removeEventListener('mousedown', outside);
  $('.pop-menu')?.remove();
};
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') B.closePopMenu(); });

// ---------- Fenêtre modale ----------

/**
 * Ouvre une fenêtre. `locked` : elle ne se ferme ni par un clic à côté ni par Échap, seulement par ses boutons
 * (première connexion : un clic à côté faisait disparaître la présentation et la visite guidée ne se lançait plus).
 */
B.modal = (html, { wide = false, locked = false } = {}) => {
  const m = $('#modal');
  m.className = wide ? 'wide' : '';
  m.dataset.locked = locked ? '1' : '';
  m.innerHTML = html;
  paintIcons(m);
  $('#modal-backdrop').classList.remove('hidden');
  setTimeout(() => $('input, textarea, select', m)?.focus(), 30);
  return m;
};
/**
 * Zone de texte longue (description d'une tâche, détails d'un objectif…) : grande par défaut, puis elle grandit
 * avec le texte jusqu'à `maxVh` % de la hauteur de l'écran (au-delà, elle défile). Toujours redimensionnable à la main.
 */
B.growTextarea = (ta, maxVh = 45) => {
  if (!ta) return;
  const fit = () => {
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight + 2, window.innerHeight * maxVh / 100) + 'px';
  };
  ta.addEventListener('input', fit);
  requestAnimationFrame(fit);
};
B.closeModal = () => {
  $('#modal-backdrop').classList.add('hidden');
  $('#modal').innerHTML = '';
  $('#modal').dataset.locked = '';
};
$('#modal-backdrop').addEventListener('mousedown', (e) => {
  if (e.target.id === 'modal-backdrop' && !$('#modal').dataset.locked) B.closeModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('#modal-backdrop').classList.contains('hidden') && !$('#modal').dataset.locked) B.closeModal();
});

/** Indicateur discret : coche grise à l'envoi, double coche pétrole après lecture. */
B.readIndicator = ({ seen, label, count = null }) => `<button type="button" class="read-indicator ${seen ? 'is-seen' : ''}"
  title="${esc(label)}" aria-label="${esc(label)}">${icon(seen ? 'doublecheck' : 'check', 17)}${count ? `<span aria-hidden="true">${count}</span>` : ''}</button>`;
B.showReadDetails = (button) => {
  const m = B.modal(`<h2>${tr('Lecture du message')}</h2><p class="read-details">${esc(button.getAttribute('aria-label'))}</p>
    <div class="modal-actions"><button class="btn primary" data-close-read>${tr('Fermer')}</button></div>`);
  $('[data-close-read]', m).onclick = B.closeModal;
  $('[data-close-read]', m).focus();
};

/** Petite fenêtre de confirmation qui renvoie true/false */
B.confirm = (text, okLabel = tr('Confirmer'), danger = true) => new Promise((resolve) => {
  const m = B.modal(`
    <h2>${tr('Confirmer')}</h2><p>${esc(text)}</p>
    <div class="actions"><button class="btn" data-no>${tr('Annuler')}</button>
    <button class="btn ${danger ? 'danger' : 'primary'}" data-yes>${esc(okLabel)}</button></div>`);
  $('[data-no]', m).onclick = () => { B.closeModal(); resolve(false); };
  $('[data-yes]', m).onclick = () => { B.closeModal(); resolve(true); };
});

// ---------- Toasts (messages éphémères) ----------

B.toast = (text, { type = 'info', actions = null, timeout = 5000 } = {}) => {
  const t = h(`<div class="toast ${type}"><div class="toast-text">${text}</div></div>`);
  if (actions) {
    const row = h('<div class="toast-actions"></div>');
    actions.forEach(([label, cls, fn]) => {
      const b = h(`<button class="btn small ${cls}">${esc(label)}</button>`);
      b.onclick = async () => { b.disabled = true; try { await fn(); } finally { t.remove(); } };
      row.appendChild(b);
    });
    t.appendChild(row);
  }
  const close = h(`<button class="toast-close">${icon('x', 14)}</button>`);
  close.onclick = () => t.remove();
  t.appendChild(close);
  $('#toasts').appendChild(t);
  if (timeout) setTimeout(() => t.remove(), timeout);
  return t;
};
B.error = (err) => {
  console.error(err);
  B.toast(esc(errText(err)), { type: 'error', timeout: 8000 });
};

// ---------- Barre latérale ----------

B.renderSidebar = () => {
  const list = $('#space-list');
  list.innerHTML = B.projects.map((p) => `
    <a class="space" href="#/p/${p.id}" data-space="${p.id}">
      <span class="space-ico" style="background:${esc(p.color)}">${projectIcon(p, 14)}</span><span class="space-name">${esc(p.name)}</span>
      <span class="unread-badge hidden" data-unread="project:${p.id}"></span>
    </a>`).join('') || `<p class="nav-empty">${tr("Aucun espace pour l'instant")}</p>`;
  B.paintUnread(list);

  const me = B.me;
  B.renderMeCard();
  $('#top-avatar').innerHTML = avatar(me, 36);
  $('#bnav-me').innerHTML = avatar(me, 24);
  B.highlightNav();
};

/** Ma carte en bas de la colonne : photo + pastille de statut ; clic = changer de statut (sounds.js) */
B.renderMeCard = () => {
  const me = B.me;
  const card = $('#me-card');
  if (!me || !card) return;
  const st = B.myStatus();
  card.title = `@${me.handle} · ${tr('Changer mon statut')}`;
  card.innerHTML = `<span class="online-av">${avatar(me, 34)}<span class="presence ${st.state === 'free' ? '' : st.state}"></span></span>
    <div><strong>${esc(me.display_name)}</strong><span>${esc(st.text ? `${B.statusLabel(st.state)} · ${st.text}` : B.statusLabel(st.state))}</span></div>`;
};
$('#me-card').addEventListener('click', (e) => {
  const r = $('#me-card').getBoundingClientRect();
  e.stopPropagation();
  B.openStatusMenu(r.left, r.top - 260);
});
B.on('status', () => B.renderMeCard());

B.highlightNav = () => {
  const hash = location.hash || '#/home';
  $$('#sidebar [data-nav]').forEach((a) => a.classList.toggle('active', hash.startsWith(`#/${a.dataset.nav}`)));
  $$('#sidebar [data-space]').forEach((a) => a.classList.toggle('active', hash.startsWith(`#/p/${a.dataset.space}`)));
  // Barre du bas (téléphone) : un projet ouvert compte pour « Projets »
  const where = hash.startsWith('#/p/') ? 'projects' : hash.replace(/^#\//, '').split('/')[0] || 'home';
  $$('#bottom-nav [data-bnav]').forEach((a) => { const on = a.dataset.bnav === where; a.classList.toggle('active', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  B.renderOnline?.(); // l'encart « En ligne » suit le projet ouvert
  B.renderPhoneNav?.(); // téléphone : barre du bas de l'appli ou du projet (phone.js)
};

$('#new-space').addEventListener('click', () => B.openNewProject());

// Fenêtre « Nouvel espace » (modèles de projet + rejoindre) : voir templates.js

/**
 * Fenêtre "Inviter" (Créateur et Administrateurs).
 * Un lien = une personne : valable 15 jours, utilisable une seule fois.
 * Clic sur le lien = copié. En dessous : « Copier le lien » et « Partager ».
 */
B.openInvite = async (projectId) => {
  const p = B.project(projectId);
  if (!B.canInvite(projectId)) return B.toast(tr('Seuls le créateur et les administrateurs du projet peuvent inviter.'), { type: 'error' });
  const date = (iso) => new Date(iso).toLocaleDateString(B.locale(), { day: 'numeric', month: 'long' });

  const m = B.modal(`
    <h2>${tr('Inviter dans « {name} »', { name: esc(p.name) })}</h2>
    <form class="invite-mail" id="inv-mail-form" novalidate>
      <label for="inv-mail">${tr('Par e-mail')}</label>
      <div class="invite-mail-row">
        <input type="email" id="inv-mail" autocomplete="email" maxlength="254" placeholder="${tr('adresse@exemple.fr')}" />
        <button class="btn primary" id="inv-mail-send" type="submit">${icon('send', 15)} ${tr("Envoyer l'invitation")}</button>
      </div>
      <p class="muted small" id="inv-mail-msg">${tr('La personne reçoit un e-mail à votre nom, avec un bouton pour rejoindre le projet.')}</p>
    </form>
    <h3 class="invite-or">${tr('Ou envoyez un lien vous-même')}</h3>
    <p class="muted">${tr("Envoyez ce lien à la personne. Il est valable 15 jours et ne sert qu'à une seule personne : pour inviter quelqu'un d'autre, créez un autre lien.")}</p>
    <button class="invite-link" id="inv-link" title="${tr('Cliquer pour copier')}"><span class="loading">${tr('Chargement…')}</span></button>
    <p class="invite-meta muted small" id="inv-meta"></p>
    <div class="invite-actions">
      <button class="btn" id="inv-copy">${icon('copy', 15)} ${tr('Copier le lien')}</button>
      <button class="btn" id="inv-share">${icon('send', 15)} ${tr('Partager')}</button>
      <span class="spacer"></span>
      <button class="link small" id="inv-new">${tr('Inviter une autre personne')}</button>
    </div>
    <div class="share-menu hidden" id="inv-share-menu">
      <button class="btn small" data-share="whatsapp">WhatsApp</button>
      <button class="btn small" data-share="mail">${tr('E-mail')}</button>
      <button class="btn small" data-share="message">${tr('Copier le message complet')}</button>
    </div>
    <div id="inv-pending"></div>
    <div class="actions"><span class="spacer"></span><button class="btn" data-close>${tr('Fermer')}</button></div>`);
  $('[data-close]', m).onclick = B.closeModal;

  let current = null; // { code, expires_at }
  const link = () => B.inviteLink(current.code);
  const message = (l = link()) => tr('{who} vous invite à rejoindre « {project} » sur BIVOUAC-TECH : {link}',
    { who: B.me.display_name, project: p.name, link: l });
  // E-mail préparé dans la messagerie du poste (quand l'envoi automatique n'est pas disponible)
  const mailDraft = (to, l) => {
    const subject = tr('{who} vous invite dans « {project} » sur BIVOUAC-TECH', { who: B.me.display_name, project: p.name });
    const v = { who: B.me.display_name, project: p.name };
    const body = [
      tr('Bonjour,'),
      tr("{who} vous invite à rejoindre le projet « {project} » sur BIVOUAC-TECH, le camp de base où l'équipe et ses IA avancent ensemble.", v),
      tr("Pour nous rejoindre, ouvrez ce lien : il s'ouvre dans votre navigateur, rien à installer. Créez votre compte (ou connectez-vous) et vous arrivez directement dans le projet.") + '\n' + l,
      tr('Cette invitation est personnelle : elle sert une seule fois et reste valable 15 jours.'),
      tr('À bientôt au camp de base !')
    ].join('\n\n');
    window.bivouac.openExternal(`mailto:${encodeURIComponent(to || '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
  };

  const copied = async (text, btn, label) => {
    await navigator.clipboard.writeText(text);
    if (btn) {
      btn.classList.add('copied');
      const old = btn.innerHTML;
      btn.innerHTML = label;
      setTimeout(() => { btn.classList.remove('copied'); btn.innerHTML = old; }, 1600);
    }
  };

  const show = async (fresh) => {
    try {
      current = await B.createInvite(projectId, fresh);
      $('#inv-link', m).innerHTML = `<span class="url" translate="no">${esc(link())}</span><span class="hint">${icon('copy', 14)}</span>`;
      $('#inv-meta', m).textContent = tr('Code : {code} · expire le {date}', { code: current.code, date: date(current.expires_at) });
      paintIcons(m);
      await showPending();
    } catch (err) {
      $('#inv-link', m).textContent = errText(err);
    }
  };

  const showPending = async () => {
    const list = (await B.pendingInvites(projectId).catch(() => [])).filter((x) => x.code !== current?.code);
    $('#inv-pending', m).innerHTML = list.length ? `
      <h3>${tr('Invitations en attente')}</h3>
      <div class="pending-invites">${list.map((x) => `
        <div class="pending-invite"><code translate="no">${esc(x.code)}</code>
          <span class="muted small">${tr('par {name} · expire le {date}', { name: esc(B.person(x.created_by).display_name), date: date(x.expires_at) })}</span>
          <span class="spacer"></span><button class="link small" data-cancel="${esc(x.code)}">${tr('Annuler')}</button></div>`).join('')}
      </div>` : '';
    $$('[data-cancel]', m).forEach((b) => (b.onclick = async () => {
      try { await B.cancelInvite(b.dataset.cancel); await showPending(); } catch (err) { B.error(err); }
    }));
  };

  $('#inv-link', m).onclick = () => current && copied(link(), $('#inv-link .hint', m), `${icon('check', 14)} ${tr('Copié')}`);
  $('#inv-copy', m).onclick = () => current && copied(link(), $('#inv-copy', m), `${icon('check', 15)} ${tr('Lien copié !')}`);
  $('#inv-new', m).onclick = () => show(true);

  const menu = $('#inv-share-menu', m);
  $('#inv-share', m).onclick = async () => {
    if (!current) return;
    // Partage du système quand il existe (Windows 10/11), sinon notre petit menu
    if (navigator.share) {
      try { return await navigator.share({ title: 'BIVOUAC-TECH', text: message() }); } catch { /* fermé ou indisponible */ }
    }
    menu.classList.toggle('hidden');
  };
  $$('[data-share]', m).forEach((b) => (b.onclick = async () => {
    menu.classList.add('hidden');
    const text = message();
    if (b.dataset.share === 'whatsapp') window.bivouac.openExternal(`https://wa.me/?text=${encodeURIComponent(text)}`);
    if (b.dataset.share === 'mail') mailDraft('', link());
    if (b.dataset.share === 'message') await copied(text, $('#inv-share', m), `${icon('check', 15)} ${tr('Message copié !')}`);
  }));

  // Invitation par e-mail : la fonction « invite-email » crée une invitation pour CETTE personne et envoie un vrai
  // e-mail (logo, votre nom, le projet, un bouton). Pas encore activée (secret Brevo absent) ou injoignable :
  // on prépare l'e-mail dans la messagerie du poste, avec une invitation neuve pour cette adresse.
  const mailMsg = $('#inv-mail-msg', m);
  $('#inv-mail-form', m).onsubmit = async (e) => {
    e.preventDefault();
    const input = $('#inv-mail', m);
    const to = input.value.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
      mailMsg.className = 'small error-text';
      mailMsg.textContent = tr('Adresse e-mail invalide.');
      return input.focus();
    }
    const btn = $('#inv-mail-send', m);
    btn.disabled = true;
    mailMsg.className = 'muted small';
    mailMsg.textContent = tr('Envoi…');
    try {
      const code = await B.sendInviteEmail(projectId, to);
      if (code) {
        mailMsg.className = 'small ok-text';
        mailMsg.textContent = tr('Invitation envoyée à {email}.', { email: to });
        input.value = '';
      } else {
        const inv = await B.createInvite(projectId, true);
        mailDraft(to, B.inviteLink(inv.code));
        mailMsg.className = 'muted small';
        mailMsg.textContent = tr("L'envoi automatique n'est pas encore activé : votre messagerie s'ouvre avec l'invitation prête à envoyer.");
      }
      await showPending();
    } catch (err) {
      mailMsg.className = 'small error-text';
      mailMsg.textContent = errText(err);
    } finally {
      btn.disabled = false;
    }
  };

  await show(false);
};

/** Choisir un projet (pour les actions rapides de l'accueil) */
B.pickProject = (title, filter) => new Promise((resolve) => {
  if (!B.projects.length) { B.openNewProject(); return resolve(null); }
  const list = filter ? B.projects.filter(filter) : B.projects;
  if (!list.length) {
    B.toast(tr('Seuls le créateur et les administrateurs du projet peuvent inviter.'), { type: 'error' });
    return resolve(null);
  }
  if (list.length === 1) return resolve(list[0].id);
  const m = B.modal(`<h2>${esc(title)}</h2><div class="pick-list">${list.map((p) =>
    `<button class="pick" data-id="${p.id}"><span class="space-ico" style="background:${esc(p.color)}">${projectIcon(p, 14)}</span>${esc(p.name)}</button>`).join('')}</div>
    <div class="actions"><button class="btn" data-close>${tr('Annuler')}</button></div>`);
  $('[data-close]', m).onclick = () => { B.closeModal(); resolve(null); };
  $$('.pick', m).forEach((b) => (b.onclick = () => { B.closeModal(); resolve(b.dataset.id); }));
});

// ---------- Recherche (globale depuis la v0.8.81) ----------
// Barre du haut : les premiers résultats en direct ; Entrée ou « Voir tous les résultats » ouvre la fenêtre complète
// (messages des salons et de l'Atelier, messages privés, tâches, documents, décisions / idées / étapes, calendrier),
// avec filtres Type, Projet, Personne et Période. Tout passe par le RLS : chacun ne trouve que ce qu'il peut voir.
// Ctrl+K (⌘K sur Mac) place le curseur dans la recherche, partout.

const SEARCH_TYPES = [
  ['all', 'Tout', 'search'], ['msg', 'Messages', 'chat'], ['dm', 'Messages privés', 'whisper'], ['task', 'Tâches', 'checksq'],
  ['doc', 'Documents', 'file'], ['item', 'Décisions et idées', 'bulb'], ['event', 'Calendrier', 'calendar']
];
const ITEM_KIND = { idea: 'Idée', decision: 'Décision', milestone: 'Étape', objective: 'Sommet' };
const likeOf = (q) => `%${q.replace(/[%_,()\\]/g, ' ').trim()}%`;
/** Extrait autour du mot trouvé, mot surligné (texte échappé) */
function searchSnippet(text, q, len = 140) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  const i = t.toLowerCase().indexOf(q.toLowerCase());
  const from = Math.max(0, i - 40);
  const part = (from ? '…' : '') + t.slice(from, from + len) + (t.length > from + len ? '…' : '');
  if (i < 0) return esc(part);
  const j = part.toLowerCase().indexOf(q.toLowerCase());
  return esc(part.slice(0, j)) + `<mark>${esc(part.slice(j, j + q.length))}</mark>` + esc(part.slice(j + q.length));
}

/**
 * Cherche partout. opts : { type, project, person, since (jours), limit }.
 * Renvoie des lignes { kind, href, icon, title (HTML), sub, when, open? }
 */
B.searchAll = async (q, { type = 'all', project = '', person = '', since = 0, limit = 20 } = {}) => {
  const like = likeOf(q);
  if (like.length < 4) return [];
  const sinceIso = since ? new Date(Date.now() - since * 864e5).toISOString() : null;
  const want = (k) => type === 'all' || type === k;
  const scope = (query, col = 'project_id') => (project ? query.eq(col, project) : query);
  const byWho = (query, col) => (person ? query.eq(col, person) : query);
  const after = (query) => (sinceIso ? query.gte('created_at', sinceIso) : query);
  const none = Promise.resolve({ data: [] });
  const [msgs, dms, tasks, files, items, events] = await Promise.all([
    want('msg') ? after(byWho(B.sb.from('messages').select('id, content, channel_id, author_id, is_ai, ai_provider, created_at, channels!inner(project_id, kind, name)')
      .ilike('content', like), 'author_id')).order('created_at', { ascending: false }).limit(limit)
      .then((r) => (project ? { data: (r.data || []).filter((m) => m.channels?.project_id === project) } : r)) : none,
    want('dm') && !project ? after(byWho(B.sb.from('direct_messages').select('id, sender_id, recipient_id, content, created_at')
      .ilike('content', like).is('deleted_at', null), 'sender_id')).order('created_at', { ascending: false }).limit(limit) : none,
    want('task') ? after(byWho(scope(B.sb.from('tasks').select('*').or(`title.ilike.${like},description.ilike.${like}`)), 'created_by')).order('created_at', { ascending: false }).limit(limit) : none,
    want('doc') ? after(byWho(scope(B.sb.from('files').select('id, name, project_id, uploader_id, created_at, mime, size, path, folder_id').ilike('name', like)), 'uploader_id')).order('created_at', { ascending: false }).limit(limit) : none,
    want('item') ? after(byWho(scope(B.sb.from('items').select('id, title, body, type, project_id, author_id, created_at').or(`title.ilike.${like},body.ilike.${like}`)), 'author_id')).order('created_at', { ascending: false }).limit(limit) : none,
    want('event') ? after(byWho(scope(B.sb.from('events').select('id, title, description, day, project_id, author_id, created_at').or(`title.ilike.${like},description.ilike.${like}`)), 'author_id')).order('day', { ascending: false }).limit(limit) : none
  ]);
  const pname = (id) => B.project(id)?.name || '';
  const rows = [];
  (msgs.data || []).forEach((m) => rows.push({
    kind: 'msg', icon: m.channels?.kind === 'ai' ? 'spark' : 'chat', when: m.created_at,
    href: `#/p/${m.channels?.project_id}/${m.channels?.kind === 'ai' ? 'atelier' : 'discussion/' + m.channel_id}`, jump: m.id,
    title: searchSnippet(m.content, q),
    sub: `${m.is_ai ? aiName(m.ai_provider, B.person(m.author_id)) : B.person(m.author_id).display_name} · ${m.channels?.kind === 'ai' ? tr('Atelier IA') : '#' + (m.channels?.name || '')} · ${pname(m.channels?.project_id)}`
  }));
  (dms.data || []).forEach((d) => {
    const other = d.sender_id === B.me.id ? d.recipient_id : d.sender_id;
    rows.push({ kind: 'dm', icon: 'whisper', when: d.created_at, href: `#/messages/${other}`, title: searchSnippet(d.content, q),
      sub: `${d.sender_id === B.me.id ? tr('Vous') : B.person(d.sender_id).display_name} → ${d.sender_id === B.me.id ? B.person(other).display_name : tr('vous')} · ${tr('Messages privés')}` });
  });
  (tasks.data || []).forEach((t) => rows.push({ kind: 'task', icon: 'checksq', when: t.created_at, href: `#/p/${t.project_id}/taches`, task: t,
    title: searchSnippet(t.title, q, 120), sub: `${tr('Tâche')} · ${pname(t.project_id)}${t.description && !t.title.toLowerCase().includes(q.toLowerCase()) ? ' · ' + t.description.replace(/\s+/g, ' ').slice(0, 60) : ''}` }));
  (files.data || []).forEach((f) => rows.push({ kind: 'doc', icon: 'file', when: f.created_at, href: `#/p/${f.project_id}/documents`, file: f,
    title: searchSnippet(f.name, q, 120), sub: `${tr('Document')} · ${B.person(f.uploader_id).display_name} · ${pname(f.project_id)}` }));
  (items.data || []).forEach((i) => rows.push({ kind: 'item', icon: i.type === 'decision' ? 'decision' : i.type === 'idea' ? 'bulb' : 'route', when: i.created_at,
    href: `#/p/${i.project_id}/projet/tout`, title: searchSnippet(i.title, q, 120), sub: `${tr(ITEM_KIND[i.type] || 'Idée')} · ${pname(i.project_id)}` }));
  (events.data || []).forEach((e) => rows.push({ kind: 'event', icon: 'calendar', when: e.created_at, href: `#/p/${e.project_id}/taches/calendrier`,
    title: searchSnippet(e.title, q, 120), sub: `${new Date(e.day + 'T12:00').toLocaleDateString(B.locale(), { day: 'numeric', month: 'short', year: 'numeric' })} · ${pname(e.project_id)}` }));
  return rows;
};

/** Ouvre un résultat : message = salon + message mis en évidence ; tâche = sa fenêtre ; le reste = la bonne page */
B.openSearchResult = (r) => {
  if (r.task) return B.openTask(r.task, () => {});
  if (r.jump) B.pendingJump = r.jump;
  location.hash = r.href;
};

function resultHtml(r, i) {
  const when = r.when ? new Date(r.when).toLocaleDateString(B.locale(), { day: 'numeric', month: 'short' }) : '';
  return `<a href="${esc(r.href)}" class="result" data-ri="${i}">${icon(r.icon, 16)}<span class="r-main"><span class="r-title" translate="no">${r.title}</span>
    <small translate="no">${esc(r.sub || '')}</small></span><small class="r-when">${esc(when)}</small></a>`;
}

/** Fenêtre « Résultats de la recherche » avec filtres */
B.openSearch = (q0 = '') => {
  const people = [...new Map(B.projects.flatMap((p) => B.projectMembers(p.id)).map((p) => [p.id, p])).values()]
    .sort((a, b) => (a.display_name || '').localeCompare(b.display_name || ''));
  const m = B.modal(`<div class="search-panel"><div class="media-head"><h2>${icon('search', 18)} ${tr('Rechercher partout')}</h2>
      <button type="button" class="icon-btn" data-close aria-label="${tr('Fermer')}">×</button></div>
    <form class="search-form"><input type="search" maxlength="100" value="${esc(q0)}" placeholder="${esc(tr('Un mot, un nom, un fichier…'))}" aria-label="${esc(tr('Rechercher'))}"/>
      <button class="btn primary" type="submit">${tr('Rechercher')}</button></form>
    <div class="search-types" role="tablist">${SEARCH_TYPES.map(([k, label, ic]) => `<button type="button" class="pill ${k === 'all' ? 'on' : ''}" data-stype="${k}" role="tab">${icon(ic, 13)} ${tr(label)}</button>`).join('')}</div>
    <div class="search-filters">
      <label>${tr('Projet')}<select data-sf="project"><option value="">${tr('Tous les projets')}</option>${B.projects.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></label>
      <label>${tr('Écrit par')}<select data-sf="person"><option value="">${tr('Tout le monde')}</option>${people.map((p) => `<option value="${p.id}">${esc(p.id === B.me.id ? tr('Moi') : p.display_name)}</option>`).join('')}</select></label>
      <label>${tr('Période')}<select data-sf="since"><option value="0">${tr('Depuis le début')}</option><option value="7">${tr('7 derniers jours')}</option><option value="30">${tr('30 derniers jours')}</option><option value="365">${tr('Cette année')}</option></select></label>
    </div>
    <div class="search-list" aria-live="polite"></div></div>`, { wide: true });
  const input = $('.search-form input', m), box = $('.search-list', m);
  let type = 'all', seq = 0, rows = [];
  const run = async () => {
    const q = input.value.trim();
    if (q.length < 2) { box.innerHTML = `<p class="muted">${tr('Tapez au moins 2 lettres.')}</p>`; return; }
    const cur = ++seq;
    box.innerHTML = `<div class="loading">${tr('Chargement…')}</div>`;
    const opts = { type, limit: type === 'all' ? 10 : 40 };
    $$('[data-sf]', m).forEach((s) => { opts[s.dataset.sf] = s.dataset.sf === 'since' ? Number(s.value) : s.value; });
    try { rows = await B.searchAll(q, opts); } catch (err) { if (cur === seq) box.innerHTML = `<p class="muted">${esc(errText(err))}</p>`; return; }
    if (cur !== seq) return;
    if (!rows.length) { box.innerHTML = `<p class="muted">${tr('Aucun résultat')}</p>`; return; }
    // Regroupés par type, dans l'ordre des onglets
    box.innerHTML = SEARCH_TYPES.slice(1).map(([k, label]) => {
      const list = rows.map((r, i) => [r, i]).filter(([r]) => r.kind === k);
      return list.length ? `<h3 class="search-group">${tr(label)} <span class="muted">· ${list.length}</span></h3>${list.map(([r, i]) => resultHtml(r, i)).join('')}` : '';
    }).join('');
    paintIcons(box);
  };
  $('[data-close]', m).onclick = () => B.closeModal();
  $('.search-form', m).onsubmit = (e) => { e.preventDefault(); run(); };
  input.addEventListener('input', debounce(run, 350));
  $$('[data-sf]', m).forEach((s) => (s.onchange = run));
  $$('[data-stype]', m).forEach((b) => (b.onclick = () => {
    type = b.dataset.stype;
    $$('[data-stype]', m).forEach((x) => x.classList.toggle('on', x === b));
    run();
  }));
  box.addEventListener('click', (e) => {
    const a = e.target.closest('[data-ri]');
    if (!a) return;
    e.preventDefault();
    B.closeModal();
    B.openSearchResult(rows[Number(a.dataset.ri)]);
  });
  input.focus();
  run();
};

const searchInput = $('#search-input');
const searchBox = $('#search-results');
let quickRows = [];
searchInput.addEventListener('input', debounce(async () => {
  const q = searchInput.value.trim();
  if (q.length < 2) return searchBox.classList.add('hidden');
  const projects = B.projects.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));
  quickRows = [
    ...projects.map((p) => ({ kind: 'project', href: `#/p/${p.id}`, icon: 'folder', title: esc(p.name), sub: tr('Espace') })),
    ...(await B.searchAll(q, { limit: 3 }).catch(() => []))
  ];
  if (searchInput.value.trim() !== q) return;
  searchBox.innerHTML = (quickRows.length ? quickRows.slice(0, 12).map(resultHtml).join('') : `<div class="result empty">${tr('Aucun résultat')}</div>`)
    + `<button type="button" class="result all-results" data-all>${icon('search', 16)}<span>${tr('Voir tous les résultats')}</span><small>${tr('Entrée')}</small></button>`;
  paintIcons(searchBox);
  searchBox.classList.remove('hidden');
}, 300));
searchInput.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const q = searchInput.value.trim();
  searchBox.classList.add('hidden');
  searchInput.value = '';
  searchInput.blur();
  B.openSearch(q);
});
searchBox.addEventListener('click', (e) => {
  const q = searchInput.value.trim();
  searchBox.classList.add('hidden'); searchInput.value = '';
  if (e.target.closest('[data-all]')) return B.openSearch(q);
  const a = e.target.closest('[data-ri]');
  if (a) { e.preventDefault(); B.openSearchResult(quickRows[Number(a.dataset.ri)]); }
});
document.addEventListener('mousedown', (e) => {
  if (!e.target.closest('.search')) searchBox.classList.add('hidden');
});
// Ctrl+K / ⌘K : rechercher, de partout
document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'k' || e.altKey || e.shiftKey) return;
  if (!B.me) return;
  e.preventDefault();
  if (B.isPhone?.()) return B.openSearch('');
  searchInput.focus();
  searchInput.select();
});

// ---------- Compteur de notifications ----------

B.refreshBadge = async () => {
  const { count } = await B.sb.from('notifications').select('id', { count: 'exact', head: true })
    .eq('user_id', B.me.id).is('read_at', null).neq('type', 'ai_request'); // les demandes d'IA : le robot (#req-btn) les compte
  $('#bell-dot').classList.toggle('hidden', !count);
  $('#bell-btn').title = count ? tr(count > 1 ? '{n} notifications non lues' : '{n} notification non lue', { n: count }) : tr('Notifications');
  $('#bell-btn').setAttribute('aria-label', $('#bell-btn').title);
};

// ---------- Demande d'IA entrante : petite notification « Voir », puis la fenêtre de la demande ----------

B.pendingReqs = [];
/** Relit les demandes en attente qui me sont adressées : robot de la barre du haut + « On vous attend » */
B.refreshRequests = async () => {
  if (!B.me) return;
  B.pendingReqs = await B.pendingRequestsForMe();
  B.paintRequestBtn();
  B.emit('requests', B.pendingReqs);
};
/**
 * La tête du robot à côté de la cloche : allumée (halo + compteur) tant qu'une demande n'a ni réponse ni refus, même
 * acceptée (retour de Claude d'Apo, 25/11 : ouvrir puis être interrompu ne doit pas la faire oublier).
 */
B.paintRequestBtn = () => {
  const b = $('#req-btn');
  if (!b) return;
  const reqs = B.pendingReqs, n = reqs.length;
  b.classList.toggle('hidden', !n);
  b.classList.toggle('fresh', n > 0);
  const first = reqs[0];
  const label = !n ? '' : n > 1 ? tr('{n} demandes pour vos IA', { n })
    : tr('{who} veut utiliser votre {ai}', { who: B.person(first.requester_id).display_name, ai: PROVIDERS[first.provider]?.label || first.provider });
  b.title = label;
  b.setAttribute('aria-label', label);
  const c = $('.req-n', b);
  c.textContent = n ? String(n) : '';
  c.classList.toggle('hidden', !n);
};
$('#req-btn')?.addEventListener('click', () => {
  // d'abord celles qui attendent mon accord, puis celles acceptées sans réponse
  const next = B.pendingReqs.find((r) => r.status === 'pending') || B.pendingReqs[0];
  if (next) B.openAiRequest(next.id);
});

/** Nouvelle demande reçue (temps réel) : son, notification du système, robot qui s'allume */
B.showIncomingRequest = (req) => {
  const who = B.person(req.requester_id).display_name;
  const label = PROVIDERS[req.provider]?.label || req.provider;
  B.playSound('notif');
  B.pcNotify(tr('{who} veut utiliser votre {ai}', { who, ai: label }), B.project(req.project_id)?.name || '', B.soundPrefs().notif, `#/demande/${req.id}`,
    { group: B.notifyGroup(req.project_id), tag: `r-${req.id}` });
  B.refreshRequests().catch(console.error);
};

/** La fenêtre d'une demande : quelle IA, qui demande, quel projet, la demande ; Accepter / Refuser */
B.openAiRequest = async (id) => {
  const { data: req, error } = await B.sb.from('ai_requests').select('*').eq('id', id).maybeSingle();
  if (error) return B.error(error);
  if (!req) return B.toast(tr('Cette demande n’existe plus.'));
  const label = PROVIDERS[req.provider]?.label || req.provider;
  const who = B.person(req.requester_id);
  const p = B.project(req.project_id);
  const withKey = B.hasProvider(req.provider);
  const STATUS = { accepted: '', done: tr('Déjà traitée : la réponse est dans l’Atelier IA.'), refused: tr('Vous avez refusé cette demande.'), error: tr('Erreur : {err}', { err: esc(req.error || '') }) };
  const pending = req.status === 'pending';
  const accepted = req.status === 'accepted'; // acceptée, mais la réponse n'est pas encore envoyée
  const open = pending || accepted;
  const m = B.modal(`
    <div class="req-head">
      <img class="req-robot" src="assets/robot-tete.webp" alt="" width="72" height="72" />
      <div><p class="card-label">${tr('Demande pour votre IA')}</p>
        <h2>${tr('{who} voudrait utiliser votre {ai}', { who: `<span translate="no">${esc(who.display_name)}</span>`, ai: esc(label) })}</h2></div>
    </div>
    <dl class="req-facts">
      <div><dt>${tr('IA concernée')}</dt><dd>${aiAvatar(req.provider, 28, B.me)}<span translate="no">${esc(aiName(req.provider, B.me))}</span></dd></div>
      <div><dt>${tr('Qui demande')}</dt><dd>${avatar(who, 28)}<span translate="no">${esc(who.display_name)}</span></dd></div>
      <div><dt>${tr('Projet')}</dt><dd>${p ? `<span class="space-ico" style="background:${esc(p.color)}">${projectIcon(p, 14)}</span>` : ''}<span translate="no">${esc(p?.name || '')}</span></dd></div>
    </dl>
    <p class="req-label">${tr('La demande')}</p>
    <blockquote class="req-prompt" translate="no">${esc(req.prompt)}</blockquote>
    <p class="muted small" id="req-how">${accepted ? (withKey
        ? tr('Vous l’avez acceptée, mais la réponse n’est pas arrivée. Relancez votre {ai}, ou refusez.', { ai: esc(label) })
        : tr('Vous l’avez acceptée, mais la réponse n’est pas encore envoyée. Rouvrez {ai} et envoyez la demande, ou refusez.', { ai: esc(label) }))
      : !pending ? (STATUS[req.status] || '')
      : withKey ? tr('Si vous acceptez, votre {ai} répond tout de suite dans l’Atelier IA, avec votre clé API (l’appel vous est facturé).', { ai: esc(label) })
        : tr('Si vous acceptez, votre application {ai} s’ouvre avec la demande déjà écrite : envoyez-la, la réponse arrivera dans l’Atelier IA du projet.', { ai: esc(label) })}</p>
    <div class="actions req-actions">${open
      ? `<button class="btn" id="req-no">${tr('Refuser')}</button><button class="btn primary" id="req-yes">${pending ? `${icon('check', 14)} ${tr('Accepter')}`
        : withKey ? tr('Relancer {ai}', { ai: esc(label) }) : tr('Rouvrir dans {ai}', { ai: esc(label) })}</button>`
      : `<button class="btn primary" data-close>${tr('Fermer')}</button>`}</div>`);
  $('[data-close]', m)?.addEventListener('click', B.closeModal);
  const how = $('#req-how', m);
  const done = (html) => {
    B.refreshRequests().catch(console.error);
    how.innerHTML = html;
    $('.req-actions', m).innerHTML = `<button class="btn primary" data-close>${tr('Fermer')}</button>`;
    m.querySelectorAll('[data-close]').forEach((b) => { b.onclick = B.closeModal; });
    paintIcons(m);
  };
  $('#req-no', m)?.addEventListener('click', async (e) => {
    e.target.disabled = true;
    try { await B.refuseRequest(req); B.closeModal(); B.refreshRequests().catch(console.error); B.toast(tr('Demande refusée. {who} est prévenu·e.', { who: esc(who.display_name) })); }
    catch (err) { e.target.disabled = false; B.error(err); }
  });
  $('#req-yes', m)?.addEventListener('click', (e) => {
    e.currentTarget.disabled = true;
    $('#req-no', m).disabled = true;
    if (withKey) {
      how.innerHTML = `${icon('spark', 13)} ${tr('{ai} travaille pour {who}…', { ai: esc(label), who: esc(who.display_name) })}`;
      paintIcons(how);
      B.acceptRequest(req)
        .then(() => done(`${icon('check', 13)} ${tr('C’est fait : la réponse est dans l’Atelier IA.')} <a href="#/p/${req.project_id}/atelier" data-close>${tr('Voir')}</a>`))
        .catch((err) => done(`<span class="error">${esc(errText(err))}</span>`));
      return;
    }
    // Dans le clic, sans attendre : sinon le navigateur bloque l'ouverture de l'IA
    B.acceptRequestInApp(req)
      .then((res) => done(`${icon('check', 13)} ${res.target === 'web'
        ? tr('{ai} s’ouvre dans votre navigateur avec la demande prête : envoyez-la.', { ai: esc(label) })
        : tr('Votre application {ai} s’ouvre avec la demande prête : envoyez-la.', { ai: esc(label) })}
        <br>${tr('Si le texte n’y est pas, collez-le : il est déjà copié.')}`))
      .catch((err) => done(`<span class="error">${esc(errText(err))}</span>`));
  });
};

// ---------- Mises à jour automatiques ----------

/** Texte d'état de la mise à jour (affiché dans Paramètres) */
B.updateText = (u) => {
  if (u?.web) return tr('Version web : toujours à jour (rechargez la page pour la toute dernière version).');
  if (!u?.packaged) return tr('Version de développement : pas de mise à jour automatique.');
  if (u.state === 'checking') return tr('Recherche de mise à jour…');
  if (u.state === 'downloading') return tr('Téléchargement de la version {v}…', { v: u.version });
  if (u.state === 'ready') return tr('La version {v} est prête : elle sera installée au redémarrage.', { v: u.version });
  if (u.state === 'error') return tr('Impossible de vérifier les mises à jour (connexion ?).');
  if (u.state === 'none') return tr('Vous avez la dernière version.');
  return '';
};

B.update = { state: 'idle' };
let updateToastFor = null;
window.bivouac.onUpdate((u) => {
  B.update = { ...B.update, ...u };
  B.emit('update', B.update);
  if (u.state === 'ready' && updateToastFor !== u.version) {
    updateToastFor = u.version;
    B.toast(esc(tr('Nouvelle version {v} prête. Elle sera installée à la prochaine fermeture de l\'app.', { v: u.version })), {
      type: 'success', timeout: 0,
      actions: [[tr('Plus tard'), '', () => {}], [tr('Redémarrer maintenant'), 'primary', () => window.bivouac.installUpdate()]]
    });
  }
});
window.bivouac.getUpdate().then((u) => { B.update = { ...B.update, ...u }; B.emit('update', B.update); });

// ---------- Accompagnement (mode débutant) ----------

/**
 * Propose la prochaine étape du "parcours projet" selon l'état du projet :
 * Échanger → Faire émerger → Structurer → Avancer → Concrétiser
 */
B.nextStep = (pid, c) => {
  if (c.messages === 0) return ['chat', 'Échanger librement', "Lancez la discussion dans #général : partagez l'idée de départ avec l'équipe.", `#/p/${pid}/discussion`];
  if (c.ideas === 0) return ['bulb', 'Faire émerger', "Notez vos premières idées dans « Camp de base ». Vous pouvez demander à votre IA d'en proposer dans l'Atelier.", `#/p/${pid}/projet`];
  if (c.objectives === 0) return ['target', 'Structurer', 'Fixez 1 à 3 objectifs clairs : à quoi verra-t-on que le projet est réussi ?', `#/p/${pid}/projet`];
  if (c.tasks === 0) return ['checksq', 'Structurer', 'Transformez vos idées en tâches : dans le Camp de base, cliquez sur une idée.', `#/p/${pid}/projet`];
  if (c.done === 0) return ['rocket', 'Avancer ensemble', "Glissez une tâche dans « En cours » et attribuez-la à quelqu'un.", `#/p/${pid}/taches`];
  if (c.milestones === 0) return ['route', 'Concrétiser', 'Posez les grandes étapes dans la feuille de route, avec des dates.', `#/p/${pid}/projet`];
  return null;
};

B.guideCard = (pid, counts) => {
  if (B.me.level !== 'debutant') return '';
  const step = B.nextStep(pid, counts);
  if (!step) return '';
  const [ic, title, text, href] = step;
  const key = `guide:${pid}:${title}`;
  if (store.get(key)) return '';
  return `<div class="guide" data-guide="${esc(key)}">
    <span class="guide-ico">${icon('compass', 20)}</span>
    <div><strong>${tr('Prochaine étape')} · ${esc(tr(title))}</strong><p>${esc(tr(text))}</p></div>
    <a class="btn small primary" href="${href}">${icon(ic, 14)} ${tr('Y aller')}</a>
    <button class="icon-btn" data-guide-close title="${tr('Masquer')}">${icon('x', 14)}</button>
  </div>`;
};

document.addEventListener('click', (e) => {
  const close = e.target.closest('[data-guide-close]');
  if (close) {
    const g = close.closest('[data-guide]');
    store.set(g.dataset.guide, true);
    g.remove();
  }
  // les liens externes s'ouvrent dans le navigateur, jamais dans l'app
  const a = e.target.closest('a.ext');
  if (a) {
    e.preventDefault();
    window.bivouac.openExternal(a.href);
  }
});
