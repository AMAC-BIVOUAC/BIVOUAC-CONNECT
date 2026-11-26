// =====================================================================
// Aujourd'hui (remplace l'accueil ; refonte, livraison 2, revue pour le téléphone le 16/11 — voir REFONTE.md)
//   bandeau discret (avec les tâches terminées de la semaine) → On vous attend (votes où je n'ai pas voté, mentions)
//   → Les prochains pas (UNE tâche par projet, sur un paysage animé ; 22/11) → Vos projets (une porte par projet).
// Règle de clarté : un écran = une question (« que dois-je faire ? »), tient sans défiler sur téléphone.
// Une seule carte teintée (« On vous attend »), une seule carte principale (« À faire de votre côté »).
// Les actions rapides sont dans le bouton « Créer » de la barre du haut (steps.js).
// =====================================================================

B.pages.home = async (view) => {
  const now = new Date();
  const hello = now.getHours() < 5 || now.getHours() >= 18 ? tr('Bonsoir') : tr('Bonjour');
  const dateText = now.toLocaleDateString(B.locale(), { weekday: 'long', day: 'numeric', month: 'long' });
  view.innerHTML = `
    <div class="page today">
      <section class="today-hero">
        <div class="today-hello">
          <div class="eyebrow">${esc(dateText)}</div>
          <h1>${tr('{hello} {name} ! 👋', { hello, name: esc(B.me.display_name) })}</h1>
          <p class="today-sum" id="today-sum"></p>
        </div>
        <div class="today-week hidden" id="today-week"></div>
      </section>
      <div id="today-body"><div class="loading">${tr('Chargement…')}</div></div>
    </div>`;
  B.mountAmbiance?.(view); // fond animé (montagnes, chamois, feu de camp, marmotte) et son d'ambiance — ambiance.js

  let tasks = [], items = [], votes = [], mentions = [], wins = [];

  const load = async () => {
    if (!$('#today-body', view)) return;
    const ids = B.projects.map((p) => p.id);
    if (!ids.length) return render();
    try {
      const [t, it, nt, w] = await Promise.all([
        B.loadMyTasks(),
        B.sb.from('items').select('*').in('project_id', ids),
        B.sb.from('notifications').select('*').eq('user_id', B.me.id).eq('type', 'mention').is('read_at', null).order('created_at', { ascending: false }).limit(10),
        B.loadWins(ids, { days: 7 }).catch(() => [])
      ]);
      if (it.error) throw it.error;
      tasks = B.orderMyTasks(t);
      items = (it.data || []).filter((i) => ids.includes(i.project_id));
      mentions = (nt.data || []).filter((n) => n.type === 'mention' && !n.read_at);
      wins = w;
      const open = items.filter((i) => i.vote_options && i.vote_until && new Date(i.vote_until) > new Date() && !i.archived_at);
      votes = open.length ? ((await B.sb.from('item_votes').select('*').in('item_id', open.map((i) => i.id))).data || []) : [];
    } catch (err) { return B.error(err); }
    render();
  };

  /** Votes ouverts où je n'ai pas encore voté */
  const waitingVotes = () => items
    .filter((i) => i.vote_options && i.vote_until && new Date(i.vote_until) > new Date() && !i.archived_at)
    .filter((i) => !votes.some((v) => v.item_id === i.id && v.user_id === B.me.id))
    .sort((a, b) => String(a.vote_until).localeCompare(String(b.vote_until)));

  const render = () => {
    const body = $('#today-body', view);
    if (!body) return;
    if (!B.projects.length) {
      $('#today-sum', view).textContent = tr('Bienvenue sur votre camp de base.');
      body.innerHTML = `<section class="card"><div class="empty">${icon('compass', 30)}<p>${tr("Pas encore de projet.<br>Créez votre premier espace ou rejoignez celui d'un ami avec son code.")}</p>
        <button class="btn primary" id="first-project">${icon('plus', 16)} ${tr('Créer un projet')}</button></div></section>`;
      $('#first-project', view).onclick = B.openNewProject;
      return;
    }
    const wv = waitingVotes();
    const reqs = (B.pendingReqs || []).filter((r) => B.project(r.project_id));
    const waiting = reqs.length + wv.length + mentions.length;
    const people = new Set([...reqs.map((r) => r.requester_id), ...wv.map((i) => i.author_id), ...mentions.map((n) => n.actor_id)]).size;

    // Bandeau : une phrase, et les tâches terminées par l'équipe cette semaine
    $('#today-sum', view).textContent = [
      people ? tr(people > 1 ? '{n} personnes vous attendent' : '{n} personne vous attend', { n: people }) : tr('Personne ne vous attend'),
      tasks.length ? tr(tasks.length > 1 ? '{n} tâches pour vous' : '{n} tâche pour vous', { n: tasks.length }) : tr('aucune tâche pour vous')
    ].join(' · ');
    const week = $('#today-week', view);
    week.classList.toggle('hidden', !wins.length);
    if (wins.length) {
      const perDay = [...Array(7)].map((_, k) => { const d = isoDay(new Date(Date.now() - (6 - k) * 86400000)); return wins.filter((a) => isoDay(new Date(a.created_at)) === d).length; });
      const max = Math.max(...perDay, 1);
      week.innerHTML = `<span class="week-bars" aria-hidden="true">${perDay.map((n) => `<i class="${n ? '' : 'none'}" style="height:${n ? Math.max(30, Math.round((n / max) * 100)) : 18}%"></i>`).join('')}</span>
        <span class="week-text"><b>${tr(wins.length > 1 ? '{n} tâches terminées' : '{n} tâche terminée', { n: wins.length })}</b><span>${tr('par vos équipes cette semaine')}</span></span>`;
    }

    const projDot = (p) => `<i class="dot" style="background:${esc(p?.color || '')}"></i><span translate="no">${esc(p?.name || '')}</span>`;
    const until = (i) => new Date(i.vote_until).toLocaleString(B.locale(), { weekday: 'long', hour: '2-digit', minute: '2-digit' });

    // On vous attend : la seule carte teintée (titres neutres, seul le bouton est orange)
    const waitHtml = waiting ? `
      <section class="card wait" id="today-wait">
        <div class="card-label wait-label"><span class="label-ico">${icon('bell', 15)}</span>${tr('On vous attend')}<span class="n">${waiting}</span></div>
        ${reqs.map((r) => `<div class="wait-row">
            <span class="wait-ico req-ico"><img src="assets/robot-tete.webp" alt="" width="30" height="30" /></span>
            <div class="wait-text"><b>${tr(r.status === 'accepted' ? '{who} attend la réponse de votre {ai}' : '{who} veut utiliser votre {ai}', { who: `<span translate="no">${esc(B.person(r.requester_id).display_name)}</span>`, ai: esc(PROVIDERS[r.provider]?.label || r.provider) })}</b>
              <span class="meta">${projDot(B.project(r.project_id))} · ${timeAgo(r.created_at)}</span></div>
            <button class="btn primary" data-req="${r.id}">${tr('Voir')}</button>
          </div>`).join('')}
        ${wv.map((i) => {
          const voted = new Set(votes.filter((v) => v.item_id === i.id).map((v) => v.user_id)).size;
          return `<div class="wait-row">
            <span class="wait-ico">${icon('decision', 18)}</span>
            <div class="wait-text"><b>${tr('Vote : {title}', { title: `<span translate="no">${esc(i.title)}</span>` })}</b>
              <span class="meta">${projDot(B.project(i.project_id))} · ${tr('se termine {when}', { when: esc(until(i)) })}${voted ? ` · ${tr(voted > 1 ? '{n} ont déjà voté' : '{n} a déjà voté', { n: voted })}` : ''}</span></div>
            <a class="btn primary" href="#/p/${i.project_id}/projet">${tr('Voter')}</a>
          </div>`;
        }).join('')}
        ${mentions.map((n) => `<div class="wait-row">
            <span class="wait-ico">${icon('at', 18)}</span>
            <div class="wait-text"><b translate="no">${esc(n.text)}</b>
              <span class="meta">${n.project_id ? `${projDot(B.project(n.project_id))} · ` : ''}${timeAgo(n.created_at)}</span></div>
            <button class="btn" data-answer="${n.id}">${tr('Répondre')}</button>
          </div>`).join('')}
      </section>` : '';

    // Les prochains pas (22/11, Amaury) : UNE tâche par projet (la plus pressée).
    // Une seule action par ligne (22/11, Apo) : « Mes tâches » = les tâches de ce projet filtrées sur moi (plus de « C'est fait » ni « Reporter »).
    const byProject = new Map();
    for (const t of tasks) if (B.project(t.project_id)) (byProject.get(t.project_id) || byProject.set(t.project_id, []).get(t.project_id)).push(t);
    const groups = [...byProject.entries()];
    const todoHtml = `
      <section class="card main-card next-card" id="today-todo">
        <div class="card-label mine"><span class="label-ico">${icon('route', 15)}</span>${tr('Les prochains pas')}</div>
        ${groups.length ? `<div class="next-list">${groups.map(([pid, list]) => {
          const t = list[0];
          return `<div class="next-row todo-row" data-id="${t.id}">
            <span class="meta next-proj">${projDot(B.project(pid))}</span>
            ${B.taskCodeHtml(t.title)}
            <button class="todo-title next-title" translate="no">${esc(B.taskTitleText(t.title))}</button>
            <div class="next-actions"><button class="btn small" data-proj-tasks="${pid}">${icon('checksq', 14)} ${tr('Mes tâches')}</button>${B.dueHtml(t.due_date)}
              ${list.length > 1 ? `<span class="muted small">${tr(list.length - 1 > 1 ? '+ {n} autres dans ce projet' : '+ {n} autre dans ce projet', { n: list.length - 1 })}</span>` : ''}</div>
          </div>`;
        }).join('')}</div>
          ${tasks.length > groups.length ? `<button class="more-link" data-all>${tr('Toutes mes tâches ({n})', { n: tasks.length })}${icon('chevron', 16)}</button>` : ''}`
          : `<p class="muted calm">${tr("Rien à faire de votre côté pour l'instant. Dans un projet, prenez une tâche pour la retrouver ici.")}</p>`}
      </section>`; // plus de paysage sous la carte (22/11, Apo)

    // Vos projets : une porte par projet (où il en est, sa prochaine étape)
    const projHtml = `
      <section id="today-projects">
        <h2 class="sec-title">${tr('Vos projets')}</h2>
        <div class="doors">${B.projects.slice(0, 6).map((p) => {
          const path = B.pathOf(items.filter((i) => i.project_id === p.id));
          const line = path.next ? `${tr('Prochaine')} : <span translate="no">${esc(path.next.title)}</span>`
            : path.total ? tr('Toutes les étapes sont franchies') : tr("Pas encore d'étape sur le chemin");
          return `<a class="door tproj" href="#/p/${p.id}/projet">
            <span class="door-ico" style="background:${esc(p.color)}">${projectIcon(p, 20)}</span>
            <span class="door-text"><b translate="no">${esc(p.name)}</b><span>${line}</span></span>
            <span class="unread-badge hidden" data-unread="project:${p.id}"></span></a>`;
        }).join('')}</div>
        ${B.projects.length > 6 ? `<a href="#/projects" class="more-link">${tr('Voir tout')}${icon('chevron', 16)}</a>` : ''}
      </section>`;

    // La veillée (vendredi 15 h → dimanche) et « Autour du feu » (qui est en vocal) : v0.8.83, ensemble.js
    const veilleeHtml = B.isVeillee?.() && B.projects.length ? `<section class="card veillee-card" id="today-veillee">
        <div class="card-label">${icon('flame', 14)} ${tr('La veillée')}</div>
        <p>${tr('C’est la fin de la semaine : venez voir ce que vos équipes ont accompli, autour du feu.')}</p>
        <div class="veillee-links">${B.projects.slice(0, 4).map((p) => `<a class="btn small" href="#/p/${p.id}/projet/veillee" translate="no">${projectIcon(p, 14)} ${esc(p.name)}</a>`).join('')}</div>
      </section>` : '';
    body.innerHTML = `<div class="today-grid"><div class="today-main">${waitHtml}${todoHtml}</div><div class="today-side">${veilleeHtml}<section class="card campfire" id="today-fire" hidden></section>${projHtml}</div></div>`;
    B.paintUnread(body);
    B.renderCampfire?.($('#today-fire', body));
  };

  // Clics : cocher, ouvrir, reporter, répondre, voir tout
  // (sur la page elle-même, recréée à chaque visite : #view, lui, reste en place)
  $('.today', view).addEventListener('click', async (e) => {
    const see = e.target.closest('[data-req]');
    if (see) return B.openAiRequest(see.dataset.req);
    const answer = e.target.closest('[data-answer]');
    if (answer) {
      const n = mentions.find((x) => x.id === answer.dataset.answer);
      await B.sb.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', answer.dataset.answer);
      B.refreshBadge();
      if (n?.link) location.hash = n.link; else load();
      return;
    }
    if (e.target.closest('[data-all]')) return B.openMyTasks(load);
    const pt = e.target.closest('[data-proj-tasks]');
    if (pt) return B.myTasksInProject(pt.dataset.projTasks);
    const row = e.target.closest('.todo-row');
    if (!row) return;
    const t = tasks.find((x) => x.id === row.dataset.id);
    if (!t) return;
    if (e.target.closest('.todo-title')) B.openTask(t, load);
  });

  await load();
  const soon = debounce(load, 400);
  B.live('today-tasks', 'tasks', `assignee_id=eq.${B.me.id}`, soon);
  B.onLeave(B.on('projects', soon));
  B.onLeave(B.on('notification', soon));
  B.onLeave(B.on('notification-read', soon));
  B.onLeave(B.on('requests', render)); // demandes d'IA : relues par B.refreshRequests (ui.js)
  B.onLeave(B.on('online', debounce(() => B.renderCampfire?.($('#today-fire', view)), 600))); // quelqu'un entre ou sort d'un vocal
};
