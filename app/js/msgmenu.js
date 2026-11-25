/* =====================================================================
   BIVOUAC-TECH — menu d'un message, réactions et fenêtre des épingles
   Partagés par les salons / l'Atelier (chat.js) et les messages privés (messages.js) :
   une seule façon d'agir sur un message, partout (clic droit, appui long ou ⋯).
   ===================================================================== */

B.QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

let msgCtx = null; // menu ouvert : { el, back, key, opener, msgEl, off }

/** Le message dont le menu est ouvert (ou null) */
B.msgMenuKey = () => msgCtx?.key ?? null;

B.closeMsgMenu = ({ focus = false } = {}) => {
  if (!msgCtx) return;
  const { el, back, opener, msgEl, off } = msgCtx;
  msgCtx = null;
  off();
  el.remove(); back?.remove();
  msgEl?.classList.remove('ctx-on');
  opener?.setAttribute('aria-expanded', 'false');
  if (focus) opener?.focus();
};

/**
 * Ouvre le menu d'un message : au pointeur (clic droit), sous un bouton (⋯), ou en bas d'écran (téléphone).
 * items : [{ act, icon, label, danger }] ; reacted : mes réactions déjà posées (emojis) ;
 * onEmoji(emoji) / onAct(act) : appelés après la fermeture du menu ; scroller : la liste qui défile.
 */
B.openMsgMenu = ({ key, x, y, anchor, msgEl, scroller, items, reacted = [], onEmoji, onAct }) => {
  const wasSame = msgCtx?.key === key && anchor && msgCtx.opener === anchor;
  B.closeMsgMenu();
  if (wasSame) return; // second clic sur ⋯ = refermer
  const item = (it) => `<button type="button" role="menuitem" class="ctx-item ${it.danger ? 'danger' : ''}" data-act="${it.act}">${icon(it.icon, 16)}<span>${it.label}</span></button>`;
  const sheet = B.isPhone?.();
  const el = h(`<div class="msg-ctx ${sheet ? 'sheet' : ''}" role="menu" aria-label="${tr('Actions du message')}">
    ${onEmoji ? `<div class="ctx-emojis" role="group" aria-label="${tr('Ajouter une réaction')}">
      ${B.QUICK_EMOJIS.map((e) => `<button type="button" role="menuitem" class="ctx-emoji ${reacted.includes(e) ? 'on' : ''}" data-emoji="${e}" aria-label="${tr('Réagir avec {emoji}', { emoji: e })}">${e}</button>`).join('')}
      <button type="button" role="menuitem" class="ctx-emoji more" data-act="react" title="${tr('Autres réactions')}" aria-label="${tr('Autres réactions')}">${icon('plus', 16)}</button>
    </div>` : ''}
    ${items.map(item).join('')}
  </div>`);
  const back = sheet ? h('<div class="msg-ctx-back"></div>') : null;
  if (back) document.body.appendChild(back);
  document.body.appendChild(el);
  paintIcons(el);
  msgEl?.classList.add('ctx-on');
  if (!sheet) {
    // Placé au pointeur ou sous le bouton, sans jamais sortir de la fenêtre
    const r = anchor?.getBoundingClientRect();
    const px = r ? r.right : (x ?? msgEl?.getBoundingClientRect().left ?? 0);
    const py = r ? r.bottom + 4 : (y ?? msgEl?.getBoundingClientRect().top ?? 0);
    const w = el.offsetWidth, hgt = el.offsetHeight, pad = 8;
    const left = Math.max(pad, Math.min(r ? px - w : px, innerWidth - w - pad));
    const top = py + hgt + pad > innerHeight ? Math.max(pad, (r ? r.top - 4 : py) - hgt) : py;
    el.style.left = `${left}px`; el.style.top = `${top}px`;
  }
  anchor?.setAttribute('aria-expanded', 'true');

  el.addEventListener('click', (e) => {
    const em = e.target.closest('[data-emoji]');
    const a = e.target.closest('[data-act]');
    if (!em && !a) return;
    B.closeMsgMenu();
    if (em) onEmoji?.(em.dataset.emoji);
    else onAct(a.dataset.act);
  });
  const all = () => $$('[role="menuitem"]', el);
  el.addEventListener('keydown', (e) => {
    const list = all(), i = list.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); B.closeMsgMenu({ focus: true }); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); list[(i + 1) % list.length].focus(); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); list[(i - 1 + list.length) % list.length].focus(); }
    else if (e.key === 'Tab') B.closeMsgMenu();
  });
  // Se ferme dès qu'on clique ailleurs, qu'on fait défiler le fil, ou qu'on change de taille de fenêtre
  const outside = (e) => { if (msgCtx?.el === el && !el.contains(e.target) && !anchor?.contains(e.target)) B.closeMsgMenu(); };
  // (un petit décalage, comme une image qui finit de charger, ne ferme pas le menu)
  const top0 = scroller?.scrollTop ?? 0;
  const onScroll = (e) => { if (msgCtx?.el === el && (e.type === 'resize' || Math.abs((scroller?.scrollTop ?? 0) - top0) > 40)) B.closeMsgMenu(); };
  let alive = true;
  setTimeout(() => { if (alive) document.addEventListener('pointerdown', outside, true); }, 0);
  scroller?.addEventListener('scroll', onScroll);
  window.addEventListener('resize', onScroll);
  msgCtx = { el, back, key, opener: anchor || null, msgEl, off: () => {
    alive = false;
    document.removeEventListener('pointerdown', outside, true);
    scroller?.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onScroll);
  } };
  (anchor || !sheet ? all()[0] : null)?.focus({ preventScroll: true });
};

/**
 * Clic droit (ordinateur ; sur Android l'appui long envoie aussi « contextmenu ») et appui long au doigt
 * (0,45 s ; iPhone n'envoie pas « contextmenu ») sur les messages d'une liste.
 * selector : un message ; idOf(el) : son identifiant ; open(id, { x, y }) ouvre le menu.
 * Dans la modification d'un message (.msg-edit), le menu habituel du système reste (couper, coller…).
 */
B.bindMsgPress = (list, { selector, idOf, open }) => {
  let pressed = null; // appui long en cours : { id, x, y, timer, fired }
  list.addEventListener('contextmenu', (e) => {
    const msgEl = e.target.closest(selector);
    if (!msgEl || e.target.closest('.msg-edit')) return;
    const id = idOf(msgEl);
    if (!id) return;
    e.preventDefault();
    if (pressed?.fired || B.msgMenuKey() === id) return; // déjà ouvert par l'appui long
    const keyboard = !e.clientX && !e.clientY;
    open(id, keyboard ? {} : { x: e.clientX, y: e.clientY });
  });
  list.addEventListener('touchstart', (e) => {
    const msgEl = e.target.closest(selector);
    if (!msgEl || e.touches.length > 1 || e.target.closest('.msg-edit, button, a, .file-card, video, audio')) { pressed = null; return; }
    const id = idOf(msgEl);
    if (!id) { pressed = null; return; }
    const t = e.touches[0];
    pressed = { id, x: t.clientX, y: t.clientY, fired: false };
    pressed.timer = setTimeout(() => {
      if (!pressed) return;
      pressed.fired = true;
      navigator.vibrate?.(10);
      open(pressed.id, { x: pressed.x, y: pressed.y });
    }, 450);
  }, { passive: true });
  list.addEventListener('touchmove', (e) => {
    if (!pressed || pressed.fired) return;
    const t = e.touches[0];
    if (Math.hypot(t.clientX - pressed.x, t.clientY - pressed.y) > 10) { clearTimeout(pressed.timer); pressed = null; }
  }, { passive: true });
  list.addEventListener('touchend', (e) => {
    if (!pressed) return;
    clearTimeout(pressed.timer);
    if (pressed.fired && e.cancelable) e.preventDefault(); // pas de « clic » juste après l'ouverture du menu
    pressed = null;
  });
  list.addEventListener('touchcancel', () => { if (pressed) clearTimeout(pressed.timer); pressed = null; });
};

/** Pastilles de réactions sous un message ; rs = [{ emoji, user_id }] */
B.reactionsHtml = (rs) => {
  if (!rs?.length) return '';
  const groups = {};
  rs.forEach((r) => { (groups[r.emoji] ||= []).push(r.user_id); });
  return `<div class="reactions">${Object.entries(groups).map(([e, users]) =>
    `<button type="button" class="reaction ${users.includes(B.me.id) ? 'mine' : ''}" data-emoji="${e}"
      title="${esc(users.map((u) => B.person(u).display_name).join(', '))}">${e} ${users.length}</button>`).join('')}</div>`;
};

/** Première ligne lisible d'un message (citation d'une réponse, barre « Répondre à ») */
B.msgFirstLine = (text) => {
  const line = String(text || '').replace(/```[\s\S]*?```/g, ' ').split('\n').find((l) => l.trim())?.replace(/\*\*|__|`/g, '').replace(/^#+\s*/, '') || '';
  return line.length > 120 ? line.slice(0, 117) + '…' : line;
};

/** Bouton 📌 « Messages épinglés » (compteur), posé dans slot */
B.pinsButton = (slot) => {
  const btn = h(`<button type="button" class="icon-btn pins-btn" aria-haspopup="dialog" aria-expanded="false"
    title="${tr('Messages épinglés')}" aria-label="${tr('Messages épinglés')}">${icon('pin', 17)}<span class="pins-count"></span></button>`);
  slot.appendChild(btn);
  paintIcons(btn);
  return btn;
};
B.paintPinsButton = (btn, n) => {
  $('.pins-count', btn).textContent = n ? String(n) : '';
  btn.classList.toggle('has-pins', n > 0);
  btn.setAttribute('aria-label', n ? tr(n > 1 ? '{n} messages épinglés' : '{n} message épinglé', { n }) : tr('Messages épinglés'));
};

/**
 * Fenêtre des épingles sous le bouton ; se ferme dès qu'on clique ailleurs (ou Échap).
 * fill(el) la remplit (et la remplira à nouveau quand on rappelle pop.fill()). Renvoie { el, fill, close }.
 */
B.openPinsPop = (btn, fill, onClose) => {
  const el = h(`<div class="pins-pop" role="dialog" aria-label="${tr('Messages épinglés')}"></div>`);
  document.body.appendChild(el);
  const place = () => {
    const r = btn.getBoundingClientRect(), pad = 8;
    el.style.top = `${r.bottom + 6}px`;
    el.style.left = `${Math.max(pad, Math.min(r.right - el.offsetWidth, innerWidth - el.offsetWidth - pad))}px`;
  };
  let open = true;
  const pop = {
    el,
    fill: () => { if (open) { fill(el); paintIcons(el); } },
    close: () => {
      if (!open) return;
      open = false;
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', esc_);
      window.removeEventListener('resize', place);
      el.remove();
      btn.setAttribute('aria-expanded', 'false');
      onClose?.();
    }
  };
  const outside = (e) => { if (!el.contains(e.target) && !btn.contains(e.target)) pop.close(); };
  const esc_ = (e) => { if (e.key === 'Escape') { pop.close(); btn.focus(); } };
  pop.fill();
  place();
  setTimeout(() => { if (open) document.addEventListener('pointerdown', outside, true); }, 0);
  document.addEventListener('keydown', esc_);
  window.addEventListener('resize', place);
  btn.setAttribute('aria-expanded', 'true');
  $('[data-go], [data-unpin], [data-pins-close]', el)?.focus({ preventScroll: true });
  return pop;
};
