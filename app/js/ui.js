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

B.modal = (html, { wide = false } = {}) => {
  const m = $('#modal');
  m.className = wide ? 'wide' : '';
  m.innerHTML = html;
  paintIcons(m);
  $('#modal-backdrop').classList.remove('hidden');
  setTimeout(() => $('input, textarea, select', m)?.focus(), 30);
  return m;
};
B.closeModal = () => {
  $('#modal-backdrop').classList.add('hidden');
  $('#modal').innerHTML = '';
};
$('#modal-backdrop').addEventListener('mousedown', (e) => {
  if (e.target.id === 'modal-backdrop') B.closeModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('#modal-backdrop').classList.contains('hidden')) B.closeModal();
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
      <span class="space-dot" style="background:${esc(p.color)}"></span><span class="space-name">${esc(p.name)}</span>
      <span class="unread-badge hidden" data-unread="project:${p.id}"></span>
    </a>`).join('') || `<p class="nav-empty">${tr("Aucun espace pour l'instant")}</p>`;
  B.paintUnread(list);

  const me = B.me;
  B.renderMeCard();
  $('#top-avatar').innerHTML = avatar(me, 36);
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
  B.renderOnline?.(); // l'encart « En ligne » suit le projet ouvert
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
    <p class="muted">${tr("Envoyez ce lien à la personne. Il est valable 15 jours et ne sert qu'à une seule personne : pour inviter quelqu'un d'autre, créez un autre lien.")}</p>
    <button class="invite-link" id="inv-link" title="${tr('Cliquer pour copier')}"><span class="loading">${tr('Chargement…')}</span></button>
    <p class="invite-meta muted small" id="inv-meta"></p>
    <div class="invite-actions">
      <button class="btn primary" id="inv-copy">${icon('copy', 15)} ${tr('Copier le lien')}</button>
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
  const message = () => tr('{who} vous invite à rejoindre « {project} » sur BIVOUAC-TECH : {link}',
    { who: B.me.display_name, project: p.name, link: link() });

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
    if (b.dataset.share === 'mail') {
      const subject = tr('Invitation dans « {project} » sur BIVOUAC-TECH', { project: p.name });
      window.bivouac.openExternal(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`);
    }
    if (b.dataset.share === 'message') await copied(text, $('#inv-share', m), `${icon('check', 15)} ${tr('Message copié !')}`);
  }));

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
    `<button class="pick" data-id="${p.id}"><span class="space-dot" style="background:${esc(p.color)}"></span>${esc(p.name)}</button>`).join('')}</div>
    <div class="actions"><button class="btn" data-close>${tr('Annuler')}</button></div>`);
  $('[data-close]', m).onclick = () => { B.closeModal(); resolve(null); };
  $$('.pick', m).forEach((b) => (b.onclick = () => { B.closeModal(); resolve(b.dataset.id); }));
});

// ---------- Recherche ----------

const searchInput = $('#search-input');
const searchBox = $('#search-results');
searchInput.addEventListener('input', debounce(async () => {
  const q = searchInput.value.trim();
  if (q.length < 2) return searchBox.classList.add('hidden');
  const like = `%${q.replace(/[%_]/g, '')}%`;
  const [msgs, tasks, items] = await Promise.all([
    B.sb.from('messages').select('id, content, channel_id, channels(project_id, kind)').ilike('content', like).order('created_at', { ascending: false }).limit(5),
    B.sb.from('tasks').select('id, title, project_id').ilike('title', like).limit(5),
    B.sb.from('items').select('id, title, type, project_id').ilike('title', like).limit(5)
  ]);
  const projects = B.projects.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));
  const rows = [
    ...projects.map((p) => [`#/p/${p.id}`, 'folder', p.name, tr('Espace')]),
    ...(items.data || []).map((i) => [`#/p/${i.project_id}/projet`, 'bulb', i.title, B.project(i.project_id)?.name]),
    ...(tasks.data || []).map((t) => [`#/p/${t.project_id}/taches`, 'checksq', t.title, B.project(t.project_id)?.name]),
    ...(msgs.data || []).map((m) => [
      `#/p/${m.channels.project_id}/${m.channels.kind === 'ai' ? 'atelier' : 'discussion/' + m.channel_id}`,
      'chat', m.content.slice(0, 80), B.project(m.channels.project_id)?.name])
  ];
  searchBox.innerHTML = rows.length
    ? rows.map(([href, ic, title, sub]) => `<a href="${href}" class="result">${icon(ic, 16)}<span>${esc(title)}</span><small>${esc(sub || '')}</small></a>`).join('')
    : `<div class="result empty">${tr('Aucun résultat')}</div>`;
  searchBox.classList.remove('hidden');
}, 300));
searchBox.addEventListener('click', () => { searchBox.classList.add('hidden'); searchInput.value = ''; });
document.addEventListener('mousedown', (e) => {
  if (!e.target.closest('.search')) searchBox.classList.add('hidden');
});

// ---------- Compteur de notifications ----------

B.refreshBadge = async () => {
  const { count } = await B.sb.from('notifications').select('id', { count: 'exact', head: true })
    .eq('user_id', B.me.id).is('read_at', null);
  const badge = $('#nav-badge');
  badge.textContent = count > 9 ? '9+' : count;
  badge.classList.toggle('hidden', !count);
  $('#bell-dot').classList.toggle('hidden', !count);
};

// ---------- Demande d'IA entrante : toast Accepter / Refuser ----------

B.showIncomingRequest = (req) => {
  const who = B.person(req.requester_id).display_name;
  const label = PROVIDERS[req.provider]?.label || req.provider;
  const projectName = B.project(req.project_id)?.name || '';
  B.playSound('notif');
  B.pcNotify(tr('{who} veut utiliser ton {ai}', { who, ai: label }), req.prompt.slice(0, 120), B.soundPrefs().notif);
  if (!B.hasProvider(req.provider)) {
    // Pas de clé API pour cette IA : on la traite avec l'abonnement, depuis l'application Claude
    B.toast(
      `${tr('<strong>{who}</strong> veut utiliser ton <strong>{ai}</strong> dans {project} :', { who: esc(who), ai: esc(label), project: esc(projectName) })}<br><em>« ${esc(req.prompt.slice(0, 200))} »</em><br>
       <small>${tr('Ouvre ton application {ai} et dis : <b>« Traite mes demandes Bivouac »</b> (connecteur BIVOUAC-TECH).', { ai: esc(label) })}</small>`,
      { type: 'request', timeout: 0, actions: [[tr('Refuser'), '', () => B.refuseRequest(req).catch(B.error)]] }
    );
    return;
  }
  B.toast(
    `${tr('<strong>{who}</strong> veut utiliser ton <strong>{ai}</strong> dans {project} :', { who: esc(who), ai: esc(label), project: esc(projectName) })}<br><em>« ${esc(req.prompt.slice(0, 200))} »</em><br><small>${tr("L'appel sera facturé sur ta clé API.")}</small>`,
    {
      type: 'request',
      timeout: 0,
      actions: [
        [tr('Refuser'), '', () => B.refuseRequest(req).catch(B.error)],
        [tr('Accepter'), 'primary', async () => {
          B.toast(tr('{ai} travaille pour {who}…', { ai: esc(label), who: esc(who) }), { timeout: 3000 });
          await B.acceptRequest(req).catch(B.error);
        }]
      ]
    }
  );
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
  if (c.ideas === 0) return ['bulb', 'Faire émerger', "Notez vos premières idées dans « Notre projet ». Vous pouvez demander à votre IA d'en proposer dans l'Atelier.", `#/p/${pid}/projet`];
  if (c.objectives === 0) return ['target', 'Structurer', 'Fixez 1 à 3 objectifs clairs : à quoi verra-t-on que le projet est réussi ?', `#/p/${pid}/projet`];
  if (c.tasks === 0) return ['checksq', 'Structurer', 'Transformez vos idées en tâches (bouton « → tâche » sur une idée).', `#/p/${pid}/projet`];
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
