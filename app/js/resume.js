// =====================================================================
// resume.js — « Pendant votre absence » (ancien « Qu'est-ce que j'ai raté ? ») : ce qui s'est passé dans un projet
// depuis ma dernière visite (migration 011, visit_project). Une page plein écran sur téléphone (…/projet/absence) :
// une phrase, « Pour vous » (avec un bouton d'action), « Ce qui a avancé », les conversations, « J'ai tout vu ».
//
// Qui rédige le résumé : réglage de CE poste (Paramètres), un seul choix :
//   'none'        sans IA : quelques phrases factuelles, gratuites et instantanées (par défaut)
//   'api:<ia>'    mon IA branchée par clé API rédige le résumé dans l'app (ma clé, processus principal)
//   'con:<ia>'    l'IA de mon abonnement (connecteur) s'ouvre avec la demande déjà écrite
// =====================================================================

B.visits = new Map();      // projectId -> date de ma visite PRÉCÉDENTE (point de départ du résumé)
B.missedCount = new Map(); // projectId -> nombre de nouveautés (pastille du bouton)
let visitedProject = null;

/** J'entre dans un projet : on retient ma visite précédente et on enregistre celle-ci */
B.enterProject = async (pid) => {
  if (visitedProject === pid) return;
  visitedProject = pid;
  const { data, error } = await B.sb.rpc('visit_project', { p_project: pid });
  if (error) return console.warn('Visite', error.message); // ex. migration 011 pas encore appliquée
  B.visits.set(pid, data);
  const d = await B.missedData(pid, data, { countOnly: true }).catch(() => null);
  if (d) { B.missedCount.set(pid, d.count); B.paintUnread(); }
  B.emit('visit', pid);
};
B.leaveProject = () => { visitedProject = null; };

// ---------- Réglage : qui rédige le résumé ----------

B.summaryOptions = () => [
  { id: 'none', label: tr('Sans IA'), hint: tr('gratuit et instantané') },
  ...B.myProviders.filter((p) => p.hasKey).map((p) => ({ id: `api:${p.id}`, provider: p.id, label: PROVIDERS[p.id]?.label || p.label, hint: tr('clé API') })),
  ...(B.me?.connector_providers || []).filter((id) => PROVIDERS[id]).map((id) => ({ id: `con:${id}`, provider: id, label: PROVIDERS[id].label, hint: tr('abonnement') }))
];

/** Mon choix, ramené à « Sans IA » si l'IA choisie n'est plus branchée */
B.summaryPref = () => {
  const v = store.get('summary', 'none');
  return B.summaryOptions().some((o) => o.id === v) ? v : 'none';
};

// ---------- Ce qui s'est passé ----------

/** Rassemble ce qui a changé dans le projet depuis « since » */
B.missedData = async (pid, since, { countOnly = false } = {}) => {
  const { data: channels } = await B.sb.from('channels').select('id, name, kind, ai_read').eq('project_id', pid).order('created_at');
  const ids = (channels || []).map((c) => c.id);
  const [msgs, acts] = await Promise.all([
    ids.length
      ? B.sb.from('messages').select('id, channel_id, author_id, content, is_ai, ai_provider, created_at')
        .in('channel_id', ids).gt('created_at', since).order('created_at').limit(300)
      : Promise.resolve({ data: [] }),
    B.sb.from('activity').select('*').eq('project_id', pid).gt('created_at', since).order('created_at').limit(100)
  ]);
  const messages = (msgs.data || []).filter((m) => m.author_id !== B.me.id || m.is_ai);
  // Pièces jointes des salons (messages vocaux…) : déjà comptées comme messages, pas des avancées du projet.
  // Depuis la migration 053 la base ne les note plus ; on masque les anciennes lignes des messages vocaux.
  const activity = (acts.data || []).filter((a) => !(a.icon === 'file' && /message-vocal-/.test(a.text || '')));
  const count = messages.length + activity.length;
  if (countOnly) return { count };

  const today = isoDay();
  const [{ data: mine }, dates, { data: votes }] = await Promise.all([
    B.sb.from('tasks').select('id, title, due_date').eq('project_id', pid).eq('assignee_id', B.me.id).gt('created_at', since),
    B.loadDates([pid], { from: today, to: isoDay(new Date(Date.now() + 7 * 86400000)) }).then((r) => r.dates.filter((x) => x.status !== 'done')).catch(() => []),
    // Votes encore ouverts où je n'ai pas voté (une décision à trancher m'attend)
    B.sb.from('items').select('id, title, vote_until, item_votes(user_id)').eq('project_id', pid).eq('type', 'decision')
      .not('vote_options', 'is', null).gt('vote_until', new Date().toISOString())
  ]);
  const openVotes = (votes || []).filter((v) => !(v.item_votes || []).some((x) => x.user_id === B.me.id));
  // Discussion d'abord, Atelier IA ensuite
  const sorted = (channels || []).slice().sort((x, y) => (x.kind === 'ai') - (y.kind === 'ai'));
  return { since, channels: sorted, messages, activity, myTasks: mine || [], dates: dates || [], openVotes, count };
};

const mentionsMe = (m) => new RegExp(`(^|\\s)@${B.me.handle}\\b`, 'i').test(m.content || '');
const names = (ids) => {
  const list = [...new Set(ids)].map((id) => B.person(id).display_name);
  return list.length <= 2 ? list.join(tr(' et ')) : `${list.slice(0, 2).join(', ')}${tr(' et ')}${tr(list.length - 2 > 1 ? '{n} autres' : '{n} autre', { n: list.length - 2 })}`;
};

/** Résumé SANS IA : quelques phrases factuelles */
B.missedFacts = (d) => {
  const out = [];
  for (const c of d.channels) {
    const list = d.messages.filter((m) => m.channel_id === c.id);
    if (!list.length) continue;
    const where = c.kind === 'ai' ? tr("l'Atelier IA") : `#${c.name}`;
    const humans = list.filter((m) => !m.is_ai);
    const ais = list.length - humans.length;
    const who = names(humans.map((m) => m.author_id));
    let s = humans.length
      ? tr(humans.length > 1 ? '{who} : {n} messages dans {where}' : '{who} : {n} message dans {where}', { who, n: humans.length, where })
      : '';
    if (ais) s += (s ? tr(', dont ') : '') + tr(ais > 1 ? '{n} réponses d’IA dans {where}' : '{n} réponse d’IA dans {where}', { n: ais, where });
    out.push(s + '.');
  }
  const mentions = d.messages.filter(mentionsMe).length;
  if (mentions) out.push(tr(mentions > 1 ? 'Vous êtes mentionné {n} fois.' : 'Vous êtes mentionné une fois.', { n: mentions }));

  const by = (icon) => d.activity.filter((a) => a.icon === icon).length;
  const parts = [
    [by('task'), 'nouvelle tâche', 'nouvelles tâches'], [by('done'), 'tâche terminée', 'tâches terminées'],
    [by('decision'), 'décision', 'décisions'], [by('idea'), 'idée', 'idées'], [by('objective'), 'objectif', 'objectifs'],
    [by('milestone'), 'étape', 'étapes'], [by('file'), 'document', 'documents'], [by('event'), 'événement', 'événements'],
    [by('member'), 'nouveau membre', 'nouveaux membres']
  ].filter(([n]) => n).map(([n, one, many]) => `${n} ${tr(n > 1 ? many : one)}`);
  if (parts.length) out.push(tr('Dans le projet : {list}.', { list: parts.join(', ') }));
  if (d.myTasks.length) out.push(tr(d.myTasks.length > 1 ? '{n} nouvelles tâches vous sont assignées.' : 'Une nouvelle tâche vous est assignée.', { n: d.myTasks.length }));
  if (d.dates.length) {
    const first = d.dates[0];
    const rest = d.dates.length - 1;
    out.push(tr('À venir : {title} ({date}){rest}.', {
      title: first.title, date: fmtDate(first.day),
      rest: rest ? tr(rest > 1 ? ', et {n} autres' : ', et {n} autre', { n: rest }) : ''
    }));
  }
  return out.join(' ');
};

/** Matière brute pour l'IA (même structure que l'outil what_did_i_miss du connecteur) */
B.missedMaterial = (d, project) => {
  const when = (iso) => new Date(iso).toLocaleString(B.locale(), { dateStyle: 'short', timeStyle: 'short' });
  const lines = [`Projet « ${project.name} » — depuis le ${when(d.since)}. Utilisateur : ${B.me.display_name} (@${B.me.handle}).`];
  for (const c of d.channels) {
    if (c.kind === 'team' && c.ai_read === false) continue; // salon fermé aux IA (migration 043) : rien pour l'IA
    const list = d.messages.filter((m) => m.channel_id === c.id);
    if (!list.length) continue;
    lines.push(`\n${c.kind === 'ai' ? 'Atelier IA' : '#' + c.name} :`);
    list.slice(-150).forEach((m) => {
      const author = m.is_ai ? `${PROVIDERS[m.ai_provider]?.label || 'IA'} (${B.person(m.author_id).display_name})` : B.person(m.author_id).display_name;
      lines.push(`[${when(m.created_at)}] ${author} : ${(m.content || '').slice(0, 1500)}`);
    });
  }
  lines.push(`\nActivité :\n${d.activity.map((a) => `- ${a.text}`).join('\n') || '- (rien)'}`);
  lines.push(`\nNouvelles tâches assignées à ${B.me.display_name} :\n${d.myTasks.map((t) => `- ${t.title}${t.due_date ? ` (échéance ${t.due_date})` : ''}`).join('\n') || '- (aucune)'}`);
  lines.push(`\nÀ venir (7 jours) :\n${d.dates.map((x) => `- ${x.day}${x.time ? ' ' + x.time : ''} : ${x.title}`).join('\n') || '- (rien)'}`);
  return lines.join('\n');
};

// ---------- « Pendant votre absence » : une page, ce qui me concerne en premier ----------

const plain = (s, n) => esc(String(s || '').replace(/[*`#>_]/g, '').replace(/\s+/g, ' ').trim().slice(0, n));
const authorOf = (m) => (m.is_ai ? aiName(m.ai_provider, B.person(m.author_id)) : B.person(m.author_id).display_name);
// Ce qui a avancé : les nouveautés qui font progresser le projet (pas les messages)
const PROGRESS = ['done', 'milestone', 'decision', 'objective', 'file', 'member', 'event'];

/** Les deux chiffres de la porte du Camp de base */
B.missedSummary = (d) => ({ forMe: d.messages.filter(mentionsMe).length + d.myTasks.length + d.openVotes.length, news: d.count });

/** Compatibilité : l'ancienne fenêtre ouvre désormais la page */
B.openMissed = (pid) => { location.hash = `#/p/${pid}/projet/absence`; };

B.pages.absence = async (el, p) => {
  const pid = p.id;
  const camp = `#/p/${pid}/projet`;
  let since = B.visits.get(pid);
  if (!since) { await B.enterProject(pid); since = B.visits.get(pid); }
  if (!since) since = new Date(Date.now() - 7 * 86400000).toISOString();
  const sinceTxt = new Date(since).toLocaleString(B.locale(), { weekday: 'long', day: 'numeric', month: 'long' });
  const pref = B.summaryPref();
  const opt = B.summaryOptions().find((o) => o.id === pref);

  el.innerHTML = `<div class="absence">
    <header class="absence-head">
      <div><div class="eyebrow" translate="no">${esc(p.name)}</div>
        <h1>${tr('Pendant votre absence')}</h1>
        <p class="muted">${tr('Depuis {date}', { date: esc(sinceTxt) })}</p></div>
      <a class="icon-btn" href="${camp}" aria-label="${tr('Fermer')}">${icon('x', 20)}</a>
    </header>
    <div class="absence-body" aria-live="polite"><div class="loading">${tr('Chargement…')}</div></div>
    <footer class="absence-foot">
      <a class="btn primary big" href="${camp}">${tr('J’ai tout vu')}</a>
      ${pref !== 'none' && opt ? `<button class="btn link" id="ask-ai">${icon('spark', 15)} ${tr('Demander un résumé à {ai}', { ai: esc(opt.label) })}</button>` : ''}
    </footer>
  </div>`;
  const body = $('.absence-body', el);

  let d;
  try { d = await B.missedData(pid, since); } catch (err) { body.textContent = errText(err); return; }
  if (!el.isConnected) return;
  const chanHref = (c) => (c.kind === 'ai' ? `#/p/${pid}/atelier` : `#/p/${pid}/discussion/${c.id}`);
  const chanName = (c) => (c.kind === 'ai' ? tr('Atelier IA') : `#${esc(c.name)}`);
  const mentions = d.messages.filter(mentionsMe);
  const forMe = mentions.length + d.myTasks.length + d.openVotes.length;
  const progress = d.activity.filter((a) => PROGRESS.includes(a.icon)).reverse();
  const convs = d.channels.map((c) => ({ c, list: d.messages.filter((m) => m.channel_id === c.id) })).filter((x) => x.list.length);

  // Une phrase pour commencer
  const lead = !d.count && !forMe
    ? tr('Rien de nouveau depuis votre dernière visite. Vous êtes à jour !')
    : [d.count ? tr(d.count > 1 ? '{n} nouveautés dans le projet.' : 'Une nouveauté dans le projet.', { n: d.count }) : '',
      forMe ? tr(forMe > 1 ? '{n} choses attendent votre réponse.' : 'Une chose attend votre réponse.', { n: forMe }) : tr('Rien ne vous attend.')].filter(Boolean).join(' ');

  const act = (href, label) => `<a class="btn small" href="${href}">${label}</a>`;
  const forYou = [
    ...d.openVotes.map((v) => `<div class="fy-row"><span class="fy-ico">${icon('decision', 20)}</span><span class="fy-text"><b translate="no">${esc(v.title)}</b><span>${tr('Votre vote manque')}</span></span>${act(`${camp}/decider`, tr('Voter'))}</div>`),
    ...mentions.map((m) => { const c = d.channels.find((x) => x.id === m.channel_id);
      return `<div class="fy-row"><span class="fy-ico">${icon('at', 20)}</span><span class="fy-text"><b>${tr('{who} vous mentionne', { who: `<span translate="no">${esc(authorOf(m))}</span>` })}</b><span translate="no">« ${plain(m.content, 80)} »</span></span>${c ? act(chanHref(c), tr('Répondre')) : ''}</div>`; }),
    ...d.myTasks.map((t) => `<div class="fy-row"><span class="fy-ico">${icon('checksq', 20)}</span><span class="fy-text"><b translate="no">${esc(t.title)}</b><span>${tr('Tâche pour vous')}${t.due_date ? ` · ${esc(fmtDate(t.due_date))}` : ''}</span></span>${act(`#/p/${pid}/taches`, tr('Ouvrir'))}</div>`)
  ];

  body.innerHTML = `
    <p class="absence-lead">${lead}</p>
    <div id="ai-slot"></div>
    ${forYou.length ? `<section class="absence-sec"><h2>${tr('Pour vous')}</h2>${forYou.join('')}</section>` : ''}
    ${progress.length ? `<section class="absence-sec"><h2>${tr('Ce qui a avancé')}</h2><ul class="wins">
      ${progress.slice(0, 4).map((a) => `<li class="win"><span class="win-tick">${icon('check', 12)}</span><span translate="no">${esc(a.text)}</span></li>`).join('')}</ul>
      ${progress.length > 4 ? `<a class="more-link" href="${camp}/tout">${tr(progress.length - 4 > 1 ? 'et {n} autres' : 'et {n} autre', { n: progress.length - 4 })}${icon('chevron', 16)}</a>` : ''}</section>` : ''}
    ${convs.length ? `<section class="absence-sec"><h2>${tr('Conversations')}</h2>${convs.map(({ c, list }) => `<a class="tap-row" href="${chanHref(c)}">
      <span class="fy-ico ${c.kind === 'ai' ? 'ai' : ''}">${icon(c.kind === 'ai' ? 'spark' : 'hash', 20)}</span>
      <span class="tap-text"><b>${chanName(c)}</b><span>${tr(list.length > 1 ? '{n} nouveaux messages' : '{n} nouveau message', { n: list.length })}</span></span>${icon('chevron', 16)}</a>`).join('')}</section>` : ''}
    ${d.dates.length ? `<section class="absence-sec"><h2>${tr('Cette semaine')}</h2>${d.dates.slice(0, 3).map((x) => `<a class="tap-row" href="#/p/${pid}/taches/calendrier">
      <span class="fy-ico">${icon('calendar', 20)}</span><span class="tap-text"><b translate="no">${esc(x.title)}</b><span>${esc(B.longDate(x.day))}${x.time ? ' · ' + esc(x.time) : ''}</span></span>${icon('chevron', 16)}</a>`).join('')}</section>` : ''}`;
  paintIcons(el);

  // Résumé rédigé par une IA (réglage de ce poste) : sur demande seulement
  $('#ask-ai', el)?.addEventListener('click', async (e) => {
    const slot = $('#ai-slot', el);
    e.currentTarget.disabled = true;
    if (pref.startsWith('api:')) {
      slot.innerHTML = `<div class="missed-text typing">${icon('spark', 14)} ${tr('{ai} rédige votre résumé…', { ai: esc(opt.label) })}</div>`;
      try {
        const text = await window.bivouac.summarize({
          provider: opt.provider, model: await B.modelFor(opt.provider), userName: B.me.display_name, lang: B.lang, material: B.missedMaterial(d, p)
        });
        if (!el.isConnected) return;
        slot.innerHTML = `<div class="missed-ai"><div class="missed-text md" translate="no">${md(text)}</div>
          <p class="missed-hint">${icon('spark', 12)} ${tr('Rédigé par {ai} · votre clé API', { ai: esc(opt.label) })}</p></div>`;
      } catch (err) {
        slot.innerHTML = `<p class="missed-hint error">${tr("{ai} n'a pas pu rédiger le résumé : {err}", { ai: esc(opt.label), err: esc(errText(err)) })}</p>`;
      }
    } else {
      // IA de l'abonnement : elle s'ouvre avec la demande prête (et la demande est copiée, au cas où)
      const prompt = tr("Dans Bivouac, qu'est-ce que j'ai raté dans le projet « {project} » depuis le {date} ? Fais-moi un résumé court.", { project: p.name, date: sinceTxt })
        + ` (what_did_i_miss, since=${new Date(since).toISOString()})`;
      await navigator.clipboard.writeText(prompt).catch(() => {});
      let res = { target: 'web', prefilled: false };
      try { res = await window.bivouac.openAssistant(opt.provider, prompt); } catch (err) { console.warn(err); }
      slot.innerHTML = `<p class="missed-hint">${icon('spark', 12)} ${res.target === 'desktop' ? tr("{ai} s'ouvre (application) avec la demande prête.", { ai: esc(opt.label) })
        : res.prefilled ? tr("{ai} s'ouvre dans votre navigateur avec la demande prête.", { ai: esc(opt.label) })
          : tr("{ai} s'ouvre dans votre navigateur : collez la demande (déjà copiée).", { ai: esc(opt.label) })}</p>`;
    }
    paintIcons(slot);
  });
};
