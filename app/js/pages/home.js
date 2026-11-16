// =====================================================================
// Aujourd'hui (remplace l'accueil ; refonte, livraison 2 — voir REFONTE.md)
//   bandeau discret → On vous attend (votes où je n'ai pas voté, mentions)
//   → À faire de votre côté (3 tâches, « Reporter ») → Vos projets (prochaine étape)
//   → Bien joué cette semaine (simple liste).
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
    const waiting = wv.length + mentions.length;
    const people = new Set([...wv.map((i) => i.author_id), ...mentions.map((n) => n.actor_id)]).size;

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

    // À faire de votre côté : 3 tâches, la carte principale
    const top = tasks.slice(0, 3);
    const todoHtml = `
      <section class="card main-card" id="today-todo">
        <div class="card-label mine"><span class="label-ico">${icon('route', 15)}</span>${tr('À faire de votre côté')}
          ${tasks.length > 3 ? `<button class="link see-all" data-all>${tr('Voir mes {n} tâches', { n: tasks.length })} ${icon('arrow', 14)}</button>` : ''}</div>
        ${top.length ? top.map((t, k) => {
          const p = B.project(t.project_id);
          const late = t.due_date && B.daysUntil(t.due_date) < 0;
          return `<div class="todo-row" data-id="${t.id}">
            <span class="todo-n" aria-hidden="true">${k + 1}</span>
            <label class="tick" title="${tr("C'est fait")}"><input type="checkbox" aria-label="${tr("C'est fait")} : ${esc(t.title)}" />${icon('check', 12)}</label>
            <div class="todo-text"><button class="todo-title" translate="no">${esc(t.title)}</button>
              <span class="meta">${projDot(p)}${t.due_date ? ` · ${late ? `<span class="chip-late">${esc(B.plannedText(t.due_date))}</span>` : esc(B.daysUntil(t.due_date) <= 1 ? B.daysText(t.due_date) : B.longDate(t.due_date))}` : ''}${t.status === 'doing' ? ` · ${tr('En cours')}` : ''}</span></div>
            ${t.due_date && B.daysUntil(t.due_date) <= 0 ? `<button class="btn" data-snooze>${tr('Reporter')}</button>` : ''}
          </div>`;
        }).join('') : `<p class="muted calm">${tr("Rien à faire de votre côté pour l'instant. Dans un projet, prenez une tâche pour la retrouver ici.")}</p>`}
      </section>`;

    // Vos projets : avancement sur le chemin et prochaine étape
    const projHtml = `
      <section class="card" id="today-projects">
        <div class="card-label"><span class="label-ico">${icon('folder', 15)}</span>${tr('Vos projets')}</div>
        ${B.projects.slice(0, 6).map((p) => {
          const path = B.pathOf(items.filter((i) => i.project_id === p.id));
          const pct = path.total ? Math.round((path.done / path.total) * 100) : p.progress;
          const count = path.total ? tr(path.done > 1 ? '{n} étapes sur {m}' : '{n} étape sur {m}', { n: path.done, m: path.total })
            : (p.taskCount ? tr('{n} % des tâches', { n: p.progress }) : '');
          const next = path.next
            ? `${tr('Prochaine étape')} : <b translate="no">${esc(path.next.title)}</b>${path.next.due_date ? ` · ${esc(B.daysText(path.next.due_date))}` : ''}`
            : path.total ? tr('Toutes les étapes sont franchies') : tr("Pas encore d'étape sur le chemin");
          return `<a class="tproj" href="#/p/${p.id}/projet">
            <span class="tproj-top"><i class="sq" style="background:${esc(p.color)}"></i><b translate="no">${esc(p.name)}</b><span class="unread-badge hidden" data-unread="project:${p.id}"></span><span class="tproj-count">${count}</span></span>
            <span class="bar"><span style="width:${pct}%;background:${esc(p.color)}"></span></span>
            <span class="tproj-next">${icon('flag', 14)}<span>${next}</span></span>
          </a>`;
        }).join('')}
        ${B.projects.length > 6 ? `<a href="#/projects" class="link">${tr('Voir tout')} ${icon('arrow', 14)}</a>` : ''}
      </section>`;

    // Bien joué cette semaine : simple liste, sans cadre
    const winsHtml = wins.length ? `
      <section class="plist" id="today-wins">
        <div class="plist-t">${icon('doublecheck', 15)} ${tr('Bien joué cette semaine')}</div>
        <ul>${wins.slice(0, 5).map((a) => B.winRow(a, { when: false })).join('')}</ul>
      </section>` : '';

    body.innerHTML = `<div class="today-grid"><div class="today-main">${waitHtml}${todoHtml}</div><div class="today-side">${projHtml}${winsHtml}</div></div>`;
    B.paintUnread(body);
  };

  // Clics : cocher, ouvrir, reporter, répondre, voir tout
  // (sur la page elle-même, recréée à chaque visite : #view, lui, reste en place)
  $('.today', view).addEventListener('click', async (e) => {
    const answer = e.target.closest('[data-answer]');
    if (answer) {
      const n = mentions.find((x) => x.id === answer.dataset.answer);
      await B.sb.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', answer.dataset.answer);
      B.refreshBadge();
      if (n?.link) location.hash = n.link; else load();
      return;
    }
    if (e.target.closest('[data-all]')) return B.openMyTasks(load);
    const row = e.target.closest('.todo-row');
    if (!row) return;
    const t = tasks.find((x) => x.id === row.dataset.id);
    if (!t) return;
    if (e.target.matches('input[type=checkbox]')) { row.classList.add('done'); if (!(await B.completeTask(t, load))) { row.classList.remove('done'); e.target.checked = false; } return; }
    if (e.target.closest('[data-snooze]')) return B.snoozeTask(t, e.target.closest('[data-snooze]'), load);
    if (e.target.closest('.todo-title')) B.openTask(t, load);
  });

  await load();
  const soon = debounce(load, 400);
  B.live('today-tasks', 'tasks', `assignee_id=eq.${B.me.id}`, soon);
  B.onLeave(B.on('projects', soon));
  B.onLeave(B.on('notification', soon));
  B.onLeave(B.on('notification-read', soon));
};
