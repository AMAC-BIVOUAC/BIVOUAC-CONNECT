// =====================================================================
// resume.js — « Qu'est-ce que j'ai raté ? » : un résumé de ce qui s'est passé dans un projet
// depuis ma dernière visite (migration 011, visit_project).
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
  const { data: channels } = await B.sb.from('channels').select('id, name, kind').eq('project_id', pid).order('created_at');
  const ids = (channels || []).map((c) => c.id);
  const [msgs, acts] = await Promise.all([
    ids.length
      ? B.sb.from('messages').select('id, channel_id, author_id, content, is_ai, ai_provider, created_at')
        .in('channel_id', ids).gt('created_at', since).order('created_at').limit(300)
      : Promise.resolve({ data: [] }),
    B.sb.from('activity').select('*').eq('project_id', pid).gt('created_at', since).order('created_at').limit(100)
  ]);
  const messages = (msgs.data || []).filter((m) => m.author_id !== B.me.id || m.is_ai);
  const activity = acts.data || [];
  const count = messages.length + activity.length;
  if (countOnly) return { count };

  const today = isoDay();
  const [{ data: mine }, dates] = await Promise.all([
    B.sb.from('tasks').select('id, title, due_date').eq('project_id', pid).eq('assignee_id', B.me.id).gt('created_at', since),
    B.loadDates([pid], { from: today, to: isoDay(new Date(Date.now() + 7 * 86400000)) }).then((r) => r.dates.filter((x) => x.status !== 'done')).catch(() => [])
  ]);
  // Discussion d'abord, Atelier IA ensuite
  const sorted = (channels || []).slice().sort((x, y) => (x.kind === 'ai') - (y.kind === 'ai'));
  return { since, channels: sorted, messages, activity, myTasks: mine || [], dates: dates || [], count };
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

/** Le détail cliquable sous le résumé */
function missedDetails(d, pid) {
  const rows = [];
  for (const c of d.channels) {
    const n = d.messages.filter((m) => m.channel_id === c.id).length;
    if (!n) continue;
    const href = c.kind === 'ai' ? `#/p/${pid}/atelier` : `#/p/${pid}/discussion/${c.id}`;
    rows.push(`<a class="act" href="${href}"><span class="act-ico">${icon(c.kind === 'ai' ? 'spark' : 'hash', 15)}</span>
      <span class="act-text">${c.kind === 'ai' ? tr('Atelier IA') : '#' + esc(c.name)}</span>
      <span class="act-time">${tr(n > 1 ? '{n} messages' : '{n} message', { n })}</span></a>`);
  }
  const ICONS = { ai: 'spark', task: 'checksq', done: 'check', idea: 'bulb', objective: 'target', decision: 'decision', milestone: 'route', file: 'file', member: 'userplus', event: 'calendar' };
  d.activity.slice().reverse().forEach((a) => rows.push(`<div class="act"><span class="act-ico ${esc(a.icon)}">${icon(ICONS[a.icon] || 'spark', 15)}</span>
    <span class="act-text" translate="no">${esc(a.text)}</span><span class="act-time">${timeAgo(a.created_at)}</span></div>`));
  return rows.length ? `<details class="missed-details"><summary>${tr('Le détail')}</summary><div class="activity">${rows.join('')}</div></details>` : '';
}

// ---------- La fenêtre ----------

B.openMissed = async (pid) => {
  const project = B.project(pid);
  let since = B.visits.get(pid);
  if (!since) { await B.enterProject(pid); since = B.visits.get(pid); }
  if (!since) since = new Date(Date.now() - 7 * 86400000).toISOString();
  const sinceTxt = new Date(since).toLocaleString(B.locale(), { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  const m = B.modal(`
    <h2>${icon('spark', 18)} ${tr("Qu'est-ce que j'ai raté ?")}</h2>
    <p class="muted small">${tr('Dans « {project} », depuis votre dernière visite ({date}).', { project: esc(project.name), date: esc(sinceTxt) })}</p>
    <div class="missed-body"><div class="loading">${tr('Chargement…')}</div></div>
    <div class="actions"><span class="spacer"></span><button class="btn" data-close>${tr('Fermer')}</button></div>`, { wide: true });
  $('[data-close]', m).onclick = B.closeModal;
  const body = $('.missed-body', m);

  let d;
  try { d = await B.missedData(pid, since); } catch (err) { body.textContent = errText(err); return; }
  if (!d.count && !d.myTasks.length) {
    body.innerHTML = `<p class="missed-text">${tr('Rien de nouveau depuis votre dernière visite.')}</p>${missedDetails(d, pid)}`;
    return;
  }

  const pref = B.summaryPref();
  const facts = esc(B.missedFacts(d));
  const details = missedDetails(d, pid);
  const opt = B.summaryOptions().find((o) => o.id === pref);

  if (pref === 'none') {
    body.innerHTML = `<p class="missed-text">${facts}</p>
      <p class="missed-hint">${tr('Résumé simple, fait sans IA. Pour un vrai résumé rédigé par l\'une de vos IA, choisissez-la dans <a href="#/settings">Paramètres</a>.')}</p>
      ${details}`;
  } else if (pref.startsWith('api:')) {
    const provider = opt.provider;
    body.innerHTML = `<div class="missed-text typing">${icon('spark', 14)} ${tr('{ai} rédige votre résumé…', { ai: esc(opt.label) })}</div>${details}`;
    try {
      const text = await window.bivouac.summarize({
        provider, model: await B.modelFor(provider), userName: B.me.display_name, lang: B.lang, material: B.missedMaterial(d, project)
      });
      if (!$('.missed-body', m)) return; // fenêtre fermée entre-temps
      body.innerHTML = `<div class="missed-text md" translate="no">${md(text)}</div>
        <p class="missed-hint">${tr('Rédigé par {ai} · votre clé API', { ai: esc(opt.label) })}</p>${details}`;
    } catch (err) {
      body.innerHTML = `<p class="missed-text">${facts}</p>
        <p class="missed-hint error">${tr("{ai} n'a pas pu rédiger le résumé : {err}", { ai: esc(opt.label), err: esc(errText(err)) })}</p>${details}`;
    }
  } else {
    // IA de l'abonnement : elle s'ouvre avec la demande prête (et la demande est copiée, au cas où)
    const prompt = tr("Dans Bivouac, qu'est-ce que j'ai raté dans le projet « {project} » depuis le {date} ? Fais-moi un résumé court.", { project: project.name, date: sinceTxt })
      + ` (what_did_i_miss, since=${new Date(since).toISOString()})`;
    await navigator.clipboard.writeText(prompt).catch(() => {});
    let res = { target: 'web', prefilled: false };
    try { res = await window.bivouac.openAssistant(opt.provider, prompt); } catch (err) { console.warn(err); }
    const where = res.target === 'desktop' ? tr("{ai} s'ouvre (application) avec la demande prête.", { ai: esc(opt.label) })
      : res.prefilled ? tr("{ai} s'ouvre dans votre navigateur avec la demande prête.", { ai: esc(opt.label) })
        : tr("{ai} s'ouvre dans votre navigateur : collez la demande (déjà copiée).", { ai: esc(opt.label) });
    body.innerHTML = `<p class="missed-text">${where}</p>
      <p class="missed-hint">${tr('La demande est aussi copiée : collez-la si besoin. En attendant, l\'essentiel :')}</p>
      <p class="missed-text small">${facts}</p>${details}`;
  }
  $$('a[href^="#/"]', body).forEach((a) => a.addEventListener('click', () => B.closeModal()));
  paintIcons(body);
};
