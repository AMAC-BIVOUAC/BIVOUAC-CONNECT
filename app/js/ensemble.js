// =====================================================================
// ensemble.js — ce qui fait la différence (v0.8.83, livraison 2 des recommandations de l'Atelier, 25/11, Amaury)
//   B.askAnAi        : choisir une IA de l'équipe (la mienne ou celle d'un coéquipier) et lui confier une demande
//   B.secondOpinion  : « Demander un 2e avis » sur un message d'IA de l'Atelier
//   B.entrust        : « Confier à une IA » une tâche ou un message
//   B.renderMemory   : « Demander au projet » (la mémoire : décisions, votes, notes, Atelier), sans IA ni coût
//   B.weekRecap / B.renderVeillee : la veillée de la semaine (récap autour du feu)
//   B.celebrateStep  : fêter une étape franchie (animation sobre + l'équipe prévenue)
//   B.renderCampfire : « Autour du feu » sur Aujourd'hui (qui est en vocal, rejoindre en silence)
//   B.welcomeNewcomer: accueil d'un nouvel arrivant dans un projet (l'essentiel en un écran)
//   B.projectWeather : la météo du projet (☀️ ⛅ ⛈️) dans le Camp de base
// Aucune table nouvelle : tout se calcule à partir de ce que le projet contient déjà.
// =====================================================================

const atelierOf = async (pid) => {
  const { data } = await B.sb.from('channels').select('id').eq('project_id', pid).eq('kind', 'ai').limit(1);
  return data?.[0]?.id || null;
};

/** Les IA que je peux solliciter dans ce projet : les miennes et celles des coéquipiers (une ligne par IA) */
B.teamAis = (pid, { except = null } = {}) => B.projectMembers(pid).flatMap((m) =>
  aisOf(m).filter((a) => PROVIDERS[a.id]).map((a) => ({ owner: m, provider: a.id, api: a.api, connector: a.connector, mine: m.id === B.me.id })))
  .filter((x) => !(except && x.owner.id === except.owner && x.provider === except.provider))
  .sort((a, b) => Number(b.mine) - Number(a.mine));

/**
 * Fenêtre « À quelle IA ? » puis la demande part :
 *   - mon IA par clé API : elle répond tout de suite dans l'Atelier ;
 *   - mon IA par abonnement : son application s'ouvre avec la demande déjà écrite (dans le clic : le navigateur bloque sinon) ;
 *   - l'IA d'un coéquipier : une demande (robot) qu'il accepte ou refuse — sa clé, son abonnement.
 */
B.askAnAi = async ({ project, title, intro = '', prompt, except = null }) => {
  const list = B.teamAis(project.id, { except });
  const atelier = await atelierOf(project.id);
  if (!list.length) {
    return B.toast(tr('Personne n’a encore branché d’IA dans ce projet. Paramètres → Mes IA pour brancher la vôtre.'), { type: 'error', timeout: 7000 });
  }
  const m = B.modal(`<h2>${icon('spark', 18)} ${esc(title)}</h2>
    ${intro ? `<p class="muted small">${esc(intro)}</p>` : ''}
    <div class="ai-pick-list">${list.map((a, i) => `<button type="button" class="ai-pick" data-i="${i}">
      ${aiAvatar(a.provider, 34, a.owner)}<span><strong translate="no">${esc(aiName(a.provider, a.owner))}</strong>
      <small>${a.mine ? (a.api && B.hasProvider(a.provider) ? tr('votre clé : réponse tout de suite dans l’Atelier') : tr('votre abonnement : son application s’ouvre avec la demande'))
        : tr('{name} reçoit la demande et l’accepte ou non', { name: esc(a.owner.display_name) })}</small></span></button>`).join('')}</div>
    <details class="ai-pick-prompt"><summary>${tr('Voir la demande')}</summary><p class="muted small" translate="no">${esc(prompt)}</p></details>
    <div class="actions"><button type="button" class="btn" data-close>${tr('Annuler')}</button></div>`);
  $('[data-close]', m).onclick = B.closeModal;
  $$('.ai-pick', m).forEach((b) => (b.onclick = () => {
    const a = list[Number(b.dataset.i)];
    B.closeModal();
    if (a.mine && !(a.api && B.hasProvider(a.provider))) {
      // Dans le clic : ouvrir l'application de mon IA avec la demande écrite (copiée aussi, au cas où)
      const full = tr('Avec le connecteur BIVOUAC-TECH, dans le projet « {project} » : {ask}', { project: project.name, ask: prompt });
      navigator.clipboard?.writeText(full).catch(() => {});
      window.bivouac.openAssistant(a.provider, full).catch(console.warn);
      return B.toast(tr('{ai} s’ouvre avec la demande (aussi copiée : collez-la si besoin). Sa réponse arrivera dans l’Atelier IA.', { ai: PROVIDERS[a.provider].label }), { timeout: 7000 });
    }
    (async () => {
      try {
        if (a.mine) {
          B.toast(tr('{ai} réfléchit… La réponse arrive dans l’Atelier IA.', { ai: PROVIDERS[a.provider].label }), { timeout: 4000 });
          await B.runMyAi({ provider: a.provider, projectId: project.id, channelId: atelier, question: prompt, askedById: B.me.id });
          B.toast(tr('Réponse publiée dans l’Atelier IA.'), { type: 'success', actions: [[tr('Voir'), '', () => { location.hash = `#/p/${project.id}/atelier`; }]] });
        } else {
          await B.requestAi({ targetId: a.owner.id, provider: a.provider, projectId: project.id, channelId: atelier, prompt: prompt.slice(0, 1800) });
          B.toast(tr('Demande envoyée à {name}. La réponse de son IA arrivera dans l’Atelier IA.', { name: esc(a.owner.display_name) }), { type: 'success' });
        }
      } catch (err) { B.error(err); }
    })();
  }));
};

/** 2e avis sur un message d'IA de l'Atelier : une AUTRE IA (pas celle qui a écrit) relit et critique */
B.secondOpinion = (project, msg) => {
  const who = aiName(msg.ai_provider, B.person(msg.author_id));
  const excerpt = String(msg.content || '').replace(/\s+/g, ' ').slice(0, 900);
  return B.askAnAi({
    project, title: tr('Demander un 2e avis'), except: { owner: msg.author_id, provider: msg.ai_provider },
    intro: tr('Une autre IA de l’équipe relit la réponse de {who} : ce qui tient, ce qui est fragile, ce qu’elle ferait autrement.', { who }),
    prompt: tr('Donne un 2e avis critique sur ce message de {who} dans l’Atelier IA (message {id}) : « {text} ». Dis ce qui est solide, ce qui est fragile ou faux, et ce que tu proposerais à la place. Réponds dans l’Atelier IA, court et concret.',
      { who, id: msg.id, text: excerpt })
  });
};

/** Confier une tâche (ou un message) à une IA de l'équipe */
B.entrust = (project, { task = null, message = null } = {}) => {
  const prompt = task
    ? tr('Prends en charge la tâche « {title} » (tâche {id}). Lis-la avec get_task et le projet, puis propose dans l’Atelier IA un plan court ou un premier livrable. Ne la marque pas terminée sans qu’on te le demande.{desc}',
      { title: task.title, id: task.id, desc: task.description ? ' ' + tr('Description : « {d} »', { d: task.description.replace(/\s+/g, ' ').slice(0, 700) }) : '' })
    : tr('Voici un message de {who} dans le salon #{channel} : « {text} ». Aide l’équipe : propose une réponse ou une suite concrète dans l’Atelier IA.',
      { who: B.person(message.author_id).display_name, channel: message.channelName || '', text: String(message.content || '').replace(/\s+/g, ' ').slice(0, 900) });
  return B.askAnAi({ project, title: tr('Confier à une IA'), intro: tr('Choisissez l’IA qui s’en occupe. Sa réponse arrive dans l’Atelier IA.'), prompt });
};

// ---------------------------------------------------------------------
// La mémoire du projet : « Pourquoi on a choisi … ? » → les décisions, votes, notes et messages de l'Atelier qui en
// parlent, avec leurs liens. Recherche par mots dans l'appareil (aucune IA, aucun coût) ; « Demander à une IA » en plus.
// ---------------------------------------------------------------------
const STOP = new Set('alors avec avoir dans donc elle elles entre est été être fait faire leur leurs mais même nous notre nos pour pourquoi quand quel quelle quelles quels qui quoi sans sont sous sur tout tous très une vous votre vos cette ces cet comment combien avait avons était the and what why when'.split(' '));
const foldText = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const wordsOf = (q) => [...new Set(foldText(q).split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !STOP.has(w)))].slice(0, 8);

B.searchMemory = async (pid, question) => {
  const words = wordsOf(question);
  if (!words.length) return [];
  const [it, notes, chans] = await Promise.all([
    B.sb.from('items').select('id, type, title, body, done, archived_at, vote_options, vote_until, followup_type, created_at, author_id').eq('project_id', pid),
    B.sb.from('project_notes').select('id, title, content, updated_at').eq('project_id', pid).then((r) => (r.error ? { data: [] } : r)),
    B.sb.from('channels').select('id, kind, name').eq('project_id', pid)
  ]);
  const ai = (chans.data || []).find((c) => c.kind === 'ai');
  const likes = words.map((w) => `content.ilike.%${w}%`).join(',');
  const msgs = ai ? await B.sb.from('messages').select('id, content, author_id, is_ai, ai_provider, created_at').eq('channel_id', ai.id).or(likes)
    .order('created_at', { ascending: false }).limit(40) : { data: [] };
  const score = (text) => { const t = foldText(text); return words.reduce((n, w) => n + (t.includes(w) ? 1 : 0), 0); };
  const KIND = { decision: 'Décision', idea: 'Idée', milestone: 'Étape', objective: 'Sommet' };
  const rows = [
    ...(it.data || []).map((i) => ({ s: score(i.title + ' ' + (i.body || '')) * (i.type === 'decision' ? 2 : 1), kind: tr(KIND[i.type] || 'Idée'),
      icon: i.type === 'decision' ? 'decision' : 'bulb', title: i.title, text: i.body || '', when: i.created_at, href: `#/p/${pid}/projet/tout`,
      extra: i.type === 'decision' ? (i.followup_type === 'none' ? tr('classée sans suite') : i.archived_at ? tr('décidée') : i.vote_until && new Date(i.vote_until) > new Date() ? tr('vote en cours') : '') : '' })),
    ...(notes.data || []).map((n) => ({ s: score(n.title + ' ' + n.content) * 1.5, kind: tr('Note'), icon: 'edit', title: n.title, text: n.content, when: n.updated_at, href: `#/p/${pid}/documents`, note: n.id })),
    ...(msgs.data || []).map((m) => ({ s: score(m.content), kind: tr('Atelier IA'), icon: 'spark',
      title: m.is_ai ? aiName(m.ai_provider, B.person(m.author_id)) : B.person(m.author_id).display_name, text: m.content, when: m.created_at,
      href: `#/p/${pid}/atelier`, jump: m.id }))
  ].filter((r) => r.s > 0).sort((a, b) => b.s - a.s || String(b.when).localeCompare(String(a.when)));
  return rows.slice(0, 10);
};

B.renderMemory = async (el, p) => {
  el.innerHTML = `<div class="subpage">${B.campSubHead(p, tr('Demander au projet'))}
    <p class="muted">${tr('Posez une question sur le projet (« Pourquoi on a choisi… ? », « Qui s’occupe de… ? »). Bivouac cherche dans les décisions et leurs votes, les notes et l’Atelier IA, sans IA et sans coût.')}</p>
    <form class="memory-form"><input type="search" maxlength="200" placeholder="${esc(tr('Ex. : pourquoi on a choisi Brevo ?'))}" aria-label="${esc(tr('Votre question'))}" />
      <button class="btn primary" type="submit">${icon('search', 15)} ${tr('Chercher')}</button></form>
    <div class="memory-list" aria-live="polite"></div></div>`;
  const input = $('.memory-form input', el), box = $('.memory-list', el);
  let rows = [];
  $('.memory-form', el).onsubmit = async (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    box.innerHTML = `<div class="loading">${tr('Chargement…')}</div>`;
    rows = await B.searchMemory(p.id, q).catch((err) => { B.error(err); return []; });
    box.innerHTML = (rows.length ? rows.map((r, i) => `<a class="memory-row" href="${esc(r.href)}" data-i="${i}">${icon(r.icon, 18)}
        <span><small>${esc(r.kind)}${r.extra ? ' · ' + esc(r.extra) : ''} · ${esc(new Date(r.when).toLocaleDateString(B.locale(), { day: 'numeric', month: 'short', year: 'numeric' }))}</small>
        <strong translate="no">${esc(r.title)}</strong><span class="muted" translate="no">${esc(String(r.text).replace(/\s+/g, ' ').slice(0, 220))}</span></span></a>`).join('')
      : `<p class="muted">${tr('Rien trouvé dans la mémoire du projet. Essayez d’autres mots, ou demandez à une IA de l’équipe.')}</p>`)
      + `<button type="button" class="btn" data-ask-ai>${icon('spark', 15)} ${tr('Demander à une IA de l’équipe')}</button>`;
    paintIcons(box);
    $('[data-ask-ai]', box).onclick = () => B.askAnAi({ project: p, title: tr('Demander au projet'),
      intro: tr('L’IA lit le projet (décisions, votes, notes, Atelier) et répond dans l’Atelier IA en citant ses sources.'),
      prompt: tr('Réponds à cette question à partir de la mémoire du projet (décisions et leurs votes, notes, Atelier IA, tâches), en citant d’où vient chaque information : « {q} »', { q }) });
  };
  box.addEventListener('click', (e) => {
    const a = e.target.closest('.memory-row');
    if (!a) return;
    const r = rows[Number(a.dataset.i)];
    if (r?.jump) B.pendingJump = r.jump;
    if (r?.note) { e.preventDefault(); B.openNote(p, r.note); }
  });
  input.focus();
};

// ---------------------------------------------------------------------
// La veillée de la semaine : ce que l'équipe a fait ces 7 jours (étapes, décisions, tâches, documents, notes) et le
// prochain pas. Sur Aujourd'hui du vendredi 15 h au dimanche ; dans le Camp de base, toute la semaine.
// ---------------------------------------------------------------------
B.isVeillee = (d = new Date()) => (d.getDay() === 5 && d.getHours() >= 15) || d.getDay() === 6 || d.getDay() === 0;

B.weekRecap = async (p) => {
  const since = new Date(Date.now() - 7 * 864e5).toISOString();
  const [acts, items, done, files, notes] = await Promise.all([
    B.sb.from('activity').select('icon, text, actor_id, created_at').eq('project_id', p.id).gte('created_at', since).order('created_at').limit(300),
    B.sb.from('items').select('*').eq('project_id', p.id),
    B.sb.from('tasks').select('id, title, assignee_id, status, due_date').eq('project_id', p.id),
    B.sb.from('files').select('id, name, uploader_id, created_at').eq('project_id', p.id).gte('created_at', since),
    B.sb.from('project_notes').select('id, title, updated_by, updated_at').eq('project_id', p.id).gte('updated_at', since).then((r) => (r.error ? { data: [] } : r))
  ]);
  const a = acts.data || [];
  const its = items.data || [];
  const steps = a.filter((x) => /Étape franchie|Milestone reached/i.test(x.text));
  const decisions = its.filter((i) => i.type === 'decision' && i.archived_at && i.archived_at >= since);
  const finished = a.filter((x) => x.icon === 'done' && !/Étape/i.test(x.text));
  const byWho = new Map();
  finished.forEach((x) => { if (x.actor_id) byWho.set(x.actor_id, (byWho.get(x.actor_id) || 0) + 1); });
  const path = B.pathOf(its);
  const nextTasks = (done.data || []).filter((t) => t.status !== 'done' && t.due_date).sort((x, y) => x.due_date.localeCompare(y.due_date)).slice(0, 3);
  return { steps, decisions, finished, byWho, files: files.data || [], notes: notes.data || [], path, nextTasks };
};

B.renderVeillee = async (el, p) => {
  el.innerHTML = `<div class="subpage veillee">${B.campSubHead(p, tr('La veillée de la semaine'))}<div class="veillee-body"><div class="loading">${tr('Chargement…')}</div></div></div>`;
  const r = await B.weekRecap(p).catch((err) => { B.error(err); return null; });
  const box = $('.veillee-body', el);
  if (!r || !box) return;
  const li = (arr, f) => arr.length ? `<ul>${arr.map(f).join('')}</ul>` : `<p class="muted small">${tr('Rien cette semaine.')}</p>`;
  const nothing = !r.steps.length && !r.decisions.length && !r.finished.length && !r.files.length && !r.notes.length;
  box.innerHTML = `
    <div class="veillee-fire" aria-hidden="true">🔥</div>
    <p class="veillee-intro">${nothing ? tr('Semaine calme autour du feu. Le prochain pas vous attend.')
      : tr('Autour du feu, ce que l’équipe a fait ces 7 derniers jours.')}</p>
    <section class="card"><h3>${icon('route', 16)} ${tr('Étapes franchies')}</h3>${li(r.steps, (x) => `<li translate="no">${esc(x.text)}</li>`)}</section>
    <section class="card"><h3>${icon('decision', 16)} ${tr('Décisions prises')}</h3>${li(r.decisions, (d) => `<li><span translate="no">${esc(d.title)}</span>${d.followup_type === 'none' ? ` <small class="muted">· ${tr('classée sans suite')}</small>` : ''}</li>`)}</section>
    <section class="card"><h3>${icon('checksq', 16)} ${tr('Qui a fait avancer quoi')}</h3>${li([...r.byWho], ([uid, n]) => `<li><strong translate="no">${esc(B.person(uid).display_name)}</strong> · ${tr(n > 1 ? '{n} tâches terminées' : '{n} tâche terminée', { n })}</li>`)}</section>
    <section class="card"><h3>${icon('file', 16)} ${tr('Documents et notes')}</h3>${li([...r.files.map((f) => ({ t: f.name })), ...r.notes.map((n) => ({ t: '📝 ' + n.title }))], (x) => `<li translate="no">${esc(x.t)}</li>`)}</section>
    <section class="card wait"><h3>${icon('flag', 16)} ${tr('Le prochain pas')}</h3>
      ${r.path.next ? `<p><strong translate="no">${esc(r.path.next.title)}</strong> <small class="muted">· ${tr('prochaine étape du chemin')}</small></p>` : ''}
      ${li(r.nextTasks, (t) => `<li><span translate="no">${esc(t.title)}</span> <small class="muted">· ${esc(B.plannedText ? B.plannedText(t.due_date) : t.due_date)}</small></li>`)}</section>`;
  paintIcons(box);
};

// ---------------------------------------------------------------------
// Fêter une étape franchie : une tente qui se plante, quelques étincelles (coupées par .no-anim / reduced-motion),
// puis l'équipe est prévenue dans sa cloche. Sobre : pas de points ni de badges.
// ---------------------------------------------------------------------
B.celebrateStep = (p, item) => {
  const box = h(`<div class="celebrate" role="status" aria-live="polite"><div class="celebrate-card">
    <div class="celebrate-tent" aria-hidden="true">⛺</div>
    <strong>${tr('Étape franchie !')}</strong><span translate="no">${esc(item.title)}</span>
    <div class="celebrate-sparks" aria-hidden="true">${'<i></i>'.repeat(12)}</div></div></div>`);
  document.body.appendChild(box);
  const close = () => box.remove();
  box.addEventListener('click', close);
  setTimeout(close, 2800);
  B.playSound?.('online');
  for (const m of B.projectMembers(p.id)) {
    if (m.id === B.me.id) continue;
    B.notify(m.id, { projectId: p.id, type: 'task', text: tr('⛺ {who} a franchi une étape dans « {project} » : {title}', { who: B.me.display_name, project: p.name, title: item.title }),
      link: `#/p/${p.id}/projet/chemin` }).catch?.(() => {});
  }
};

// ---------------------------------------------------------------------
// Autour du feu (Aujourd'hui) : les coéquipiers en vocal en ce moment, dans tous mes projets ; « Rejoindre en silence »
// entre dans le vocal micro coupé (pour travailler ensemble sans parler, comme autour d'un feu).
// ---------------------------------------------------------------------
B.renderCampfire = async (box) => {
  if (!box) return;
  const groups = (B.voiceGatherings?.() || []).filter((g) => g.people.some((u) => u !== B.me.id));
  if (!groups.length) { box.innerHTML = ''; box.hidden = true; return; }
  const { data: chans } = await B.sb.from('channels').select('id, name, project_id').in('id', groups.map((g) => g.channelId));
  if (!box.isConnected) return;
  box.hidden = false;
  box.innerHTML = `<div class="card-label">${icon('headphones', 14)} ${tr('Autour du feu')}</div>
    ${groups.map((g) => {
      const c = (chans || []).find((x) => x.id === g.channelId);
      const p = B.project(g.projectId);
      if (!c || !p) return '';
      return `<div class="campfire-row"><span class="campfire-people">${g.people.slice(0, 5).map((u) => avatar(B.person(u), 26)).join('')}</span>
        <span class="campfire-where"><strong translate="no">#${esc(c.name)}</strong><small translate="no">${esc(p.name)} · ${tr(g.people.length > 1 ? '{n} personnes' : '{n} personne', { n: g.people.length })}</small></span>
        <button class="btn small" data-fire-join="${esc(c.id)}" data-fire-pid="${esc(p.id)}">${icon('mic', 14)} ${tr('Rejoindre en silence')}</button></div>`;
    }).join('')}`;
  paintIcons(box);
  box.onclick = async (e) => {
    const b = e.target.closest('[data-fire-join]');
    if (!b) return;
    const p = B.project(b.dataset.firePid);
    const { data: ch } = await B.sb.from('channels').select('*').eq('id', b.dataset.fireJoin).maybeSingle();
    if (!p || !ch) return;
    location.hash = `#/p/${p.id}/discussion/${ch.id}`;
    try {
      await B.voiceJoin(p, ch);
      if (B.voice && !B.voice.muted) B.voiceToggleMute();
      B.toast(tr('Vous êtes autour du feu, micro coupé. Réactivez-le quand vous voulez parler.'), { timeout: 5000 });
    } catch (err) { B.error(err); }
  };
};

// ---------------------------------------------------------------------
// Accueil du nouvel arrivant : la première fois qu'on ouvre un projet rejoint depuis moins de 14 jours (pas son créateur)
// ---------------------------------------------------------------------
B.welcomeNewcomer = async (p, { force = false } = {}) => {
  const me = (B.members.get(p.id) || []).find((m) => m.user_id === B.me.id);
  const key = 'welcome:' + p.id;
  if (!force && (!me || me.role === 'owner' || store.get(key) || Date.now() - new Date(me.joined_at) > 14 * 864e5)) return;
  if (!force && (document.querySelector('.guide-card') || !$('#modal-backdrop').classList.contains('hidden'))) return; // visite ou fenêtre en cours
  store.set(key, true);
  const [it, tk, notes] = await Promise.all([
    B.sb.from('items').select('*').eq('project_id', p.id),
    B.sb.from('tasks').select('title, assignee_id, status').eq('project_id', p.id).eq('status', 'doing'),
    B.sb.from('project_notes').select('id, title').eq('project_id', p.id).order('updated_at', { ascending: false }).limit(5).then((r) => (r.error ? { data: [] } : r))
  ]);
  const items = it.data || [];
  const goal = B.summitOf?.(items);
  const path = B.pathOf(items);
  const decisions = items.filter((i) => i.type === 'decision').sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 3);
  const doing = new Map();
  (tk.data || []).forEach((t) => { if (t.assignee_id) doing.set(t.assignee_id, [...(doing.get(t.assignee_id) || []), t.title]); });
  const m = B.modal(`<div class="welcome">
    <h2>${projectIcon(p, 20)} ${tr('Bienvenue dans « {name} »', { name: esc(p.name) })}</h2>
    <p class="muted">${tr('L’essentiel pour vous y retrouver, en un coup d’œil.')}</p>
    <dl class="welcome-list">
      <div><dt>${icon('flag', 15)} ${tr('Le sommet')}</dt><dd translate="no">${goal ? esc(goal.title) : `<span class="muted">${tr('Pas encore fixé')}</span>`}</dd></div>
      <div><dt>${icon('route', 15)} ${tr('Où on en est')}</dt><dd>${path.total ? tr('{n} étapes sur {m} franchies', { n: path.done, m: path.total }) + (path.next ? ` · ${tr('prochaine : {t}', { t: esc(path.next.title) })}` : '') : `<span class="muted">${tr('Pas encore d’étape')}</span>`}</dd></div>
      <div><dt>${icon('decision', 15)} ${tr('Dernières décisions')}</dt><dd>${decisions.length ? `<ul>${decisions.map((d) => `<li translate="no">${esc(d.title)}</li>`).join('')}</ul>` : `<span class="muted">${tr('Aucune pour l’instant')}</span>`}</dd></div>
      <div><dt>${icon('users', 15)} ${tr('Qui fait quoi en ce moment')}</dt><dd>${doing.size ? `<ul>${[...doing].map(([uid, ts]) => `<li><strong translate="no">${esc(B.person(uid).display_name)}</strong> : <span translate="no">${esc(ts.slice(0, 2).join(', '))}</span></li>`).join('')}</ul>` : `<span class="muted">${tr('Rien en cours')}</span>`}</dd></div>
      ${(notes.data || []).length ? `<div><dt>${icon('edit', 15)} ${tr('À lire')}</dt><dd><ul>${notes.data.map((n) => `<li><button class="link" data-wnote="${n.id}" translate="no">${esc(n.title)}</button></li>`).join('')}</ul></dd></div>` : ''}
    </dl>
    <div class="actions"><button class="btn" data-wbrief>${icon('spark', 15)} ${tr('Préparer pour mon IA')}</button>
      <span class="spacer"></span><button class="btn primary" data-close>${tr('C’est parti')}</button></div></div>`, { wide: true });
  paintIcons(m);
  $('[data-close]', m).onclick = B.closeModal;
  $('[data-wbrief]', m).onclick = () => { B.closeModal(); B.openAiBrief?.(p); };
  $$('[data-wnote]', m).forEach((b) => (b.onclick = () => { B.closeModal(); B.openNote(p, b.dataset.wnote); }));
};

// ---------------------------------------------------------------------
// La météo du projet : ☀️ beau temps, ⛅ quelques nuages, ⛈️ orage — d'après les tâches prévues dépassées, les votes
// qui attendent et les demandes d'IA restées sans réponse plus d'un jour. Un clic dit pourquoi.
// ---------------------------------------------------------------------
B.projectWeather = async (p) => {
  const today = new Date().toISOString().slice(0, 10);
  const [tk, it, rq] = await Promise.all([
    B.sb.from('tasks').select('id, due_date, status').eq('project_id', p.id).neq('status', 'done'),
    B.sb.from('items').select('id, type, vote_until, archived_at').eq('project_id', p.id).eq('type', 'decision'),
    B.sb.from('ai_requests').select('id, created_at, status').eq('project_id', p.id).in('status', ['pending', 'accepted'])
  ]);
  const late = (tk.data || []).filter((t) => t.status !== 'done' && t.due_date && t.due_date < today).length;
  const votes = (it.data || []).filter((i) => i.vote_until && new Date(i.vote_until) > new Date() && !i.archived_at).length;
  const stale = (rq.data || []).filter((r) => Date.now() - new Date(r.created_at) > 864e5).length;
  const score = late + stale + (votes > 2 ? 1 : 0);
  const reasons = [
    late ? tr(late > 1 ? '{n} tâches prévues avant aujourd’hui' : '{n} tâche prévue avant aujourd’hui', { n: late }) : '',
    votes ? tr(votes > 1 ? '{n} votes en cours' : '{n} vote en cours', { n: votes }) : '',
    stale ? tr(stale > 1 ? '{n} demandes d’IA sans réponse depuis plus d’un jour' : '{n} demande d’IA sans réponse depuis plus d’un jour', { n: stale }) : ''
  ].filter(Boolean);
  const [emoji, label] = score === 0 ? ['☀️', tr('Beau temps')] : score <= 3 ? ['⛅', tr('Quelques nuages')] : ['⛈️', tr('Orage')];
  return { emoji, label, reasons, score };
};

B.paintWeather = async (slot, p) => {
  if (!slot) return;
  const w = await B.projectWeather(p).catch(() => null);
  if (!w || !slot.isConnected) return;
  const why = w.reasons.length ? w.reasons.join(' · ') : tr('Rien ne traîne : tout est à jour.');
  slot.innerHTML = `<button type="button" class="weather-chip" title="${esc(why)}" aria-label="${esc(tr('Météo du projet : {label}. {why}', { label: w.label, why }))}">
    <span aria-hidden="true">${w.emoji}</span> ${esc(w.label)}</button>`;
  $('.weather-chip', slot).onclick = () => B.toast(`<strong>${w.emoji} ${esc(w.label)}</strong><br>${esc(why)}`, { timeout: 6000 });
};
