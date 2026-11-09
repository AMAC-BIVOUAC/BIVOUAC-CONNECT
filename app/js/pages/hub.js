// =====================================================================
// Notre projet — idées, objectifs, décisions, feuille de route
// (le parcours : faire émerger → structurer → concrétiser)
// =====================================================================

const ITEM_TYPES = {
  idea: { label: 'Idées', one: 'idée', icon: 'bulb', tone: 'yellow', placeholder: 'Une nouvelle idée…', hint: 'Tout ce qui vous passe par la tête. Transformez-les ensuite en tâches.', empty: 'Aucune idée pour l\'instant.' },
  objective: { label: 'Objectifs', one: 'objectif', icon: 'target', tone: 'red', placeholder: 'Un objectif mesurable…', hint: 'À quoi verra-t-on que le projet est réussi ?', empty: 'Aucun objectif pour l\'instant.' },
  decision: { label: 'Décisions', one: 'décision', icon: 'decision', tone: 'green', placeholder: 'Une décision prise…', hint: 'Gardez la trace de ce qui a été tranché, et pourquoi.', empty: 'Aucune décision pour l\'instant.' },
  milestone: { label: 'Feuille de route', one: 'étape', icon: 'route', tone: 'orange', placeholder: 'Une grande étape…', hint: 'Les jalons du projet, avec une date.', empty: 'Aucune étape pour l\'instant.' }
};

B.pages.hub = async (el, p) => {
  el.innerHTML = `<div class="hub-wrap"><div class="hub">${Object.entries(ITEM_TYPES).map(([type, t]) => `
    <section class="card hub-card" data-type="${type}">
      <div class="card-head"><h2><span class="our-ico ${t.tone}">${icon(t.icon, 16)}</span>${tr(t.label)} <span class="count"></span></h2>
        ${type === 'idea' ? `<button class="btn small tidy hidden" data-tidy title="${tr('Ranger les idées déjà transformées en tâches')}">${icon('check', 14)} <span></span></button>` : ''}</div>
      <p class="muted small">${tr(t.hint)}</p>
      <ul class="items"></ul>
      ${type !== 'milestone' ? '<details class="archived hidden"><summary></summary><ul class="items archived-list"></ul></details>' : ''}
      <form class="add-item">
        <input placeholder="${tr(t.placeholder)}" maxlength="200" />
        ${type === 'milestone' ? '<input type="date" class="date" />' : ''}
        <button class="btn small primary">${icon('plus', 14)}</button>
      </form>
      ${type === 'decision' ? `<button class="link small new-vote" data-new-vote>${icon('users', 14)} ${tr('…ou soumettre une décision au vote')}</button>` : ''}
    </section>`).join('')}</div>
    <aside class="card hub-activity">
      <div class="card-head"><h2>${tr('Activité récente')}</h2></div>
      <div class="activity" id="hub-activity"><div class="loading">${tr('Chargement…')}</div></div>
    </aside></div>`;

  // Activité récente de CE projet (en direct)
  const ACT_ICONS = { ai: 'spark', task: 'checksq', done: 'check', idea: 'bulb', objective: 'target', decision: 'decision', milestone: 'route', file: 'file', member: 'userplus', event: 'calendar' };
  const loadActivity = async () => {
    const box = $('#hub-activity', el);
    if (!box) return;
    const { data } = await B.sb.from('activity').select('*').eq('project_id', p.id)
      .order('created_at', { ascending: false }).limit(15);
    box.innerHTML = (data || []).length
      ? data.map((a) => `<div class="act">
          <span class="act-ico ${esc(a.icon)}">${icon(ACT_ICONS[a.icon] || 'spark', 16)}</span>
          <span class="act-text" translate="no">${esc(a.text)}</span>
          <span class="act-time">${timeAgo(a.created_at)}</span></div>`).join('')
      : `<p class="muted small">${tr("Rien pour l'instant. Ce qui se passe dans le projet apparaîtra ici.")}</p>`;
  };
  loadActivity();
  B.live('hub-act', 'activity', `project_id=eq.${p.id}`, debounce(loadActivity, 400), 'INSERT');

  let items = [];
  let votes = [];   // voix sur les décisions soumises au vote (migration 016)
  let closeTimer = null;
  const load = async () => {
    const { data, error } = await B.sb.from('items').select('*').eq('project_id', p.id).order('created_at');
    if (error) return B.error(error);
    items = data;
    await loadVotes();
    render();
  };
  const loadVotes = async () => {
    const ids = items.filter((i) => i.vote_options).map((i) => i.id);
    votes = ids.length ? ((await B.sb.from('item_votes').select('*').in('item_id', ids)).data || []) : [];
    // Re-afficher pile au moment où le prochain vote se clôt
    clearTimeout(closeTimer);
    const next = items.map((i) => i.vote_until && new Date(i.vote_until) - Date.now()).filter((ms) => ms > 0).sort((a, b) => a - b)[0];
    if (next && next < 2 ** 31) closeTimer = setTimeout(render, next + 500);
  };
  B.onLeave(() => clearTimeout(closeTimer));

  /** Bloc de vote d'une décision : choix, voix, résultat une fois clos */
  const voteHtml = (i) => {
    const open = new Date(i.vote_until) > new Date();
    const vs = votes.filter((v) => v.item_id === i.id);
    const counts = i.vote_options.map((_, k) => vs.filter((v) => v.choice === k).length);
    const max = Math.max(...counts);
    const myChoices = new Set(vs.filter((v) => v.user_id === B.me.id).map((v) => v.choice));
    const mine = myChoices.size > 0;
    const voters = B.projectMembers(p.id).length;
    const people = new Set(vs.map((v) => v.user_id)).size; // membres qui ont voté (choix multiple : plusieurs lignes chacun)
    const until = new Date(i.vote_until).toLocaleString(B.locale(), { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    let head;
    if (open) head = `<span class="vote-state open">${tr('Vote ouvert')}</span> ${tr('clôture {when}', { when: until })}`;
    else if (!vs.length) head = `<span class="vote-state">${tr('Vote clos')}</span> ${tr('aucune voix')}`;
    else {
      const winners = i.vote_options.filter((_, k) => counts[k] === max);
      head = `<span class="vote-state">${tr('Vote clos')}</span> ${winners.length > 1
        ? tr('Égalité : {list}', { list: `<span translate="no">${winners.map(esc).join(' / ')}</span>` })
        : tr('Résultat : {choice}', { choice: `<strong translate="no">${esc(winners[0])}</strong>` })}`;
    }
    const follow = i.followup_type ? followLink(i) : '';
    return `<div class="vote ${open ? '' : 'closed'} ${i.vote_multi ? 'multi' : ''}">
      <div class="vote-head">${icon('users', 13)} ${head}${i.vote_multi ? ` <span class="vote-kind">${tr('plusieurs réponses possibles')}</span>` : ''}</div>
      ${i.vote_options.map((o, k) => `<button class="vote-opt ${myChoices.has(k) ? 'mine' : ''} ${!open && counts[k] === max && max > 0 ? 'win' : ''}" data-choice="${k}" ${open ? '' : 'disabled'}
          title="${open ? (myChoices.has(k) ? tr('Retirer ma voix') : tr('Voter pour ce choix')) : ''}">
          ${i.vote_multi ? `<span class="vote-box">${myChoices.has(k) ? icon('check', 12) : ''}</span>` : ''}
          <span class="vote-bar" style="width:${people ? Math.round((counts[k] / people) * 100) : 0}%"></span>
          <span class="vote-label" translate="no">${esc(o)}</span><span class="vote-count">${counts[k]}</span></button>`).join('')}
      <div class="vote-foot muted small">${tr(people > 1 ? '{n} votants sur {m} membres' : '{n} votant sur {m} membres', { n: people, m: voters })}${open && mine ? ` · ${tr('vous pouvez changer d\'avis jusqu\'à la clôture')}` : ''}</div>
      ${!open && vs.length ? (follow || `<button class="btn small follow-btn" data-follow>${icon('arrow', 13)} ${tr('Donner suite')}</button>`) : ''}
    </div>`;
  };

  /** Ce qui a été fait d'une décision : lien vers la tâche / l'élément créé */
  const FOLLOW_LABEL = () => ({ task: tr('Tâche'), idea: tr('Idée'), objective: tr('Objectif'), decision: tr('Décision'), milestone: tr('Étape') });
  const followLink = (i) => `<div class="follow-done">${icon('check', 13)} ${tr('Suite donnée')} :
    <a href="#/p/${p.id}/${i.followup_type === 'task' ? 'taches' : 'projet'}">${FOLLOW_LABEL()[i.followup_type] || ''}</a></div>`;

  const render = () => {
    for (const [type, t] of Object.entries(ITEM_TYPES)) {
      const card = $(`.hub-card[data-type="${type}"]`, el);
      if (!card) return;
      let list = items.filter((i) => i.type === type && !i.archived_at);
      if (type === 'milestone') list = list.sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'));
      $('.count', card).textContent = list.length ? `(${list.length})` : '';
      $('.items', card).innerHTML = list.map((i) => `
        <li class="item ${i.done ? 'done' : ''}" data-id="${i.id}">
          ${type === 'idea' ? `<span class="bullet"></span>` : `<input type="checkbox" ${i.done ? 'checked' : ''} title="${type === 'decision' ? tr('Appliquée') : tr('Atteint')}" />`}
          <span class="item-title">${esc(i.title)}${i.body ? `<small>${esc(i.body.slice(0, 120))}</small>` : ''}${i.vote_options ? voteHtml(i) : ''}</span>
          ${i.due_date ? `<span class="due">${icon('calendar', 13)} ${fmtDate(i.due_date)}</span>` : ''}
          <span class="item-meta">${avatar(B.person(i.author_id), 20)}</span>
          ${type === 'idea' && !i.done ? `<button class="btn tiny" data-to-task title="${tr('Transformer en tâche')}">${tr('→ tâche')}</button>` : ''}
          ${type === 'idea' ? `<button class="icon-btn tiny-ico" data-archive title="${tr('Ranger cette idée')}">${icon('check', 14)}</button>` : ''}
        </li>`).join('') || `<li class="item empty-item">${tr(t.empty)}</li>`;
      if (type === 'idea') {
        // « Ranger » : les idées déjà transformées en tâches (ou marquées) quittent la liste
        const treated = list.filter((i) => i.done);
        const btn = $('[data-tidy]', card);
        btn.classList.toggle('hidden', !treated.length);
        $('span', btn).textContent = tr('Ranger ({n})', { n: treated.length });
      }
      // Archivés : idées rangées à la main ; objectifs atteints et décisions suivies, archivés tout seuls (migration 028)
      const box = $('.archived', card);
      if (box) {
        const archived = items.filter((i) => i.type === type && i.archived_at).sort((a, b) => b.archived_at.localeCompare(a.archived_at));
        const n = archived.length;
        box.classList.toggle('hidden', !n);
        $('summary', box).textContent = type === 'idea' ? tr(n > 1 ? '{n} idées rangées' : '{n} idée rangée', { n })
          : type === 'objective' ? tr(n > 1 ? '{n} objectifs atteints archivés' : '{n} objectif atteint archivé', { n })
          : tr(n > 1 ? '{n} décisions archivées' : '{n} décision archivée', { n });
        $('.archived-list', box).innerHTML = archived.map((i) => `
          <li class="item done" data-id="${i.id}"><span class="bullet"></span>
            <span class="item-title">${esc(i.title)}${i.vote_options ? voteHtml(i) : ''}</span>
            <button class="link small" data-unarchive>${tr('Ressortir')}</button></li>`).join('');
      }
    }
  };

  // Ajouter
  $$('.add-item', el).forEach((f) => f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const type = f.closest('.hub-card').dataset.type;
    const title = $('input', f).value.trim();
    if (!title) return;
    const due = $('.date', f)?.value || null;
    const { error } = await B.sb.from('items').insert({ project_id: p.id, type, title, due_date: due });
    if (error) return B.error(error);
    f.reset();
    load();
  }));

  // Soumettre une décision au vote
  $('[data-new-vote]', el)?.addEventListener('click', () => newVote());
  /** Lance un vote : nouvelle décision, ou décision existante sans vote (`item`) */
  function newVote(item = null) {
    // Clôture proposée : aujourd'hui, dans une heure (arrondie à la minute) ; modifiable
    const d = new Date(Date.now() + 36e5);
    d.setSeconds(0, 0);
    const local = new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
    const m = B.modal(`
      <h2>${tr('Soumettre une décision au vote')}</h2>
      <label>${tr('La question')}</label><input id="vt-title" maxlength="200" value="${item ? esc(item.title) : ''}" placeholder="${tr('Ex. : On part sur quelle date pour le lancement ?')}" />
      <label>${tr('Les choix (2 à 6)')}</label>
      <div class="vote-inputs">${[1, 2, 3, 4, 5, 6].map((n) => `<input class="vt-opt" maxlength="80" placeholder="${tr('Choix {n}', { n })}" ${n > 3 ? 'hidden' : ''} />`).join('')}
        <button class="link small" id="vt-more">${icon('plus', 13)} ${tr('Ajouter un choix')}</button></div>
      <label class="check"><input type="checkbox" id="vt-multi" /> ${tr('Plusieurs réponses possibles (chacun peut cocher plusieurs choix)')}</label>
      <label>${tr('Clôture du vote')}</label><input id="vt-until" type="datetime-local" value="${local}" />
      <p class="muted small">${tr('Chaque membre a une voix, qu\'il peut changer jusqu\'à la clôture. Ensuite le résultat est définitif.')}</p>
      <p class="msg" id="vt-msg"></p>
      <div class="actions"><button class="btn" data-close>${tr('Annuler')}</button><button class="btn primary" id="vt-go">${tr('Lancer le vote')}</button></div>`);
    $('[data-close]', m).onclick = B.closeModal;
    $('#vt-more', m).onclick = () => {
      const hidden = $$('.vt-opt[hidden]', m)[0];
      if (hidden) { hidden.hidden = false; hidden.focus(); }
      if (!$$('.vt-opt[hidden]', m).length) $('#vt-more', m).remove();
    };
    $('#vt-go', m).onclick = async () => {
      const title = $('#vt-title', m).value.trim();
      const options = $$('.vt-opt', m).map((x) => x.value.trim()).filter(Boolean);
      const until = $('#vt-until', m).value ? new Date($('#vt-until', m).value) : null;
      const msg = $('#vt-msg', m);
      if (!title) return (msg.textContent = tr('Écrivez la question.'));
      if (options.length < 2) return (msg.textContent = tr('Il faut au moins deux choix.'));
      if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) return (msg.textContent = tr('Deux choix sont identiques.'));
      if (!until || until <= new Date()) return (msg.textContent = tr('La clôture doit être dans le futur.'));
      const vote = { title, vote_options: options, vote_until: until.toISOString(), ...($('#vt-multi', m).checked ? { vote_multi: true } : {}) };
      const { data, error } = item
        ? await B.sb.from('items').update(vote).eq('id', item.id).select().single()
        : await B.sb.from('items').insert({ project_id: p.id, type: 'decision', ...vote }).select().single();
      if (error) return (msg.textContent = /vote_multi/.test(error.message || '') ? tr('Le choix multiple n\'est pas encore installé sur le serveur (migration 019).') : /vote_options|vote_until/.test(error.message || '') ? tr('Le vote n\'est pas encore installé sur le serveur (migration 016).') : errText(error));
      B.closeModal();
      for (const mem of B.projectMembers(p.id)) {
        B.notify(mem.id, { projectId: p.id, type: 'vote', refId: data.id, link: `#/p/${p.id}/projet`,
          text: tr('{who} lance un vote dans « {project} » : {title}', { who: B.me.display_name, project: p.name, title }) });
      }
      B.toast(tr('Vote lancé : les membres sont prévenus.'), { type: 'success' });
      load();
    };
  }

  // Ranger d'un coup les idées traitées
  $('[data-tidy]', el)?.addEventListener('click', async () => {
    const ids = items.filter((i) => i.type === 'idea' && i.done && !i.archived_at).map((i) => i.id);
    if (!ids.length) return;
    const { error } = await B.sb.from('items').update({ archived_at: new Date().toISOString() }).in('id', ids);
    if (error) return B.error(new Error(/archived_at/.test(error.message || '') ? tr('Ranger les idées n\'est pas encore installé sur le serveur (migration 018).') : errText(error)));
    B.toast(tr(ids.length > 1 ? '{n} idées rangées. Retrouvez-les en bas de la liste.' : '{n} idée rangée. Retrouvez-la en bas de la liste.', { n: ids.length }), { type: 'success' });
    load();
  });

  // Cocher / éditer / transformer en tâche / voter
  el.addEventListener('click', async (e) => {
    const li = e.target.closest('.item[data-id]');
    if (!li) return;
    const item = items.find((i) => i.id === li.dataset.id);
    const opt = e.target.closest('.vote-opt');
    if (opt) {
      if (opt.disabled) return;
      const choice = Number(opt.dataset.choice);
      const had = votes.some((v) => v.item_id === item.id && v.user_id === B.me.id && v.choice === choice);
      let error;
      if (had) {
        ({ error } = await B.sb.from('item_votes').delete().match({ item_id: item.id, user_id: B.me.id, choice }));
      } else {
        // Choix unique : on retire d'abord mon ancienne réponse
        if (!item.vote_multi) ({ error } = await B.sb.from('item_votes').delete().match({ item_id: item.id, user_id: B.me.id }));
        if (!error) ({ error } = await B.sb.from('item_votes').insert({ item_id: item.id, user_id: B.me.id, choice, voted_at: new Date().toISOString() }));
      }
      if (error) B.error(new Error(/row-level security/i.test(error.message || '') ? tr('Ce vote est clos.') : errText(error)));
      await loadVotes();
      return render();
    }
    if (e.target.matches('input[type=checkbox]')) {
      await B.sb.from('items').update({ done: e.target.checked }).eq('id', item.id);
      await load();
      if (items.find((i) => i.id === item.id)?.archived_at && !item.archived_at) B.toast(tr('Objectif atteint : il est archivé en bas de la liste.'), { type: 'success' });
      return;
    }
    if (e.target.closest('[data-archive]') || e.target.closest('[data-unarchive]')) {
      const { error } = await B.sb.from('items').update({ archived_at: e.target.closest('[data-archive]') ? new Date().toISOString() : null }).eq('id', item.id);
      if (error) return B.error(new Error(/archived_at/.test(error.message || '') ? tr('Ranger les idées n\'est pas encore installé sur le serveur (migration 018).') : errText(error)));
      return load();
    }
    if (e.target.closest('[data-to-task]')) {
      const { error } = await B.sb.from('tasks').insert({ project_id: p.id, title: item.title, description: item.body });
      if (error) return B.error(error);
      await B.sb.from('items').update({ done: true }).eq('id', item.id);
      B.toast(`${tr('Tâche créée : « {title} ».', { title: esc(item.title) })} <a href="#/p/${p.id}/taches">${tr('Voir les tâches')}</a>`, { type: 'success' });
      return load();
    }
    if (e.target.closest('[data-follow]')) return followUp(item);
    if (e.target.closest('.vote')) return;
    if (e.target.closest('.item-title')) openItem(item);
  });

  /**
   * Donner suite à une décision : en faire une tâche, un objectif, une étape ou une idée,
   * prérempli avec le résultat ; responsable et date pour une tâche, date pour une étape.
   */
  function followUp(item) {
    const vs = votes.filter((v) => v.item_id === item.id);
    let result = '';
    if (item.vote_options && vs.length) {
      const counts = item.vote_options.map((_, k) => vs.filter((v) => v.choice === k).length);
      const max = Math.max(...counts);
      result = item.vote_options.filter((_, k) => counts[k] === max).join(' / ');
    }
    const title = result ? `${item.title} → ${result}` : item.title;
    const details = item.vote_options
      ? `${tr('Décision votée')} : ${item.title}\n${item.vote_options.map((o, k) => `- ${o} : ${vs.filter((v) => v.choice === k).length}`).join('\n')}`
      : item.body || '';
    const members = B.projectMembers(p.id);
    const m = B.modal(`
      <h2>${tr('Donner suite à la décision')}</h2>
      <p class="muted small" translate="no">${esc(title)}</p>
      <label>${tr('En faire…')}</label>
      <div class="follow-types">
        ${[['task', tr('une tâche'), 'checksq'], ['objective', tr('un objectif'), 'target'], ['milestone', tr('une étape de la feuille de route'), 'route'], ['idea', tr('une idée'), 'bulb']]
          .map(([k, label, ic], n) => `<label class="follow-type ${n === 0 ? 'on' : ''}"><input type="radio" name="fu-type" value="${k}" ${n === 0 ? 'checked' : ''} />${icon(ic, 15)} ${label}</label>`).join('')}
      </div>
      <label>${tr('Titre')}</label><input id="fu-title" maxlength="200" value="${esc(title.slice(0, 200))}" />
      <label>${tr('Détails')}</label><textarea id="fu-body" rows="4" maxlength="5000">${esc(details)}</textarea>
      <div class="form-row">
        <div class="fu-assignee"><label>${tr('Responsable')}</label><select id="fu-who"><option value="">${tr('Personne pour l\'instant')}</option>
          ${members.map((x) => `<option value="${x.id}">${esc(x.display_name)}</option>`).join('')}</select></div>
        <div class="fu-date"><label>${tr('Date (facultatif)')}</label><input id="fu-date" type="date" /></div>
      </div>
      <label class="check"><input type="checkbox" id="fu-done" checked /> ${tr('Marquer la décision comme appliquée')}</label>
      <p class="msg" id="fu-msg"></p>
      <div class="actions"><button class="btn" data-close>${tr('Annuler')}</button><button class="btn primary" id="fu-go">${tr('Créer')}</button></div>`);
    $('[data-close]', m).onclick = B.closeModal;
    const kind = () => $('input[name=fu-type]:checked', m).value;
    const sync = () => {
      $$('.follow-type', m).forEach((l) => l.classList.toggle('on', $('input', l).checked));
      $('.fu-assignee', m).classList.toggle('hidden', kind() !== 'task'); // responsable : seulement pour une tâche
    };
    $$('input[name=fu-type]', m).forEach((r) => (r.onchange = sync));
    sync();
    $('#fu-go', m).onclick = async () => {
      const t = $('#fu-title', m).value.trim();
      if (!t) return ($('#fu-msg', m).textContent = tr('Écrivez un titre.'));
      const body = $('#fu-body', m).value.trim() || null;
      const date = $('#fu-date', m).value || null;
      const type = kind();
      const ins = type === 'task'
        ? B.sb.from('tasks').insert({ project_id: p.id, title: t, description: body, due_date: date, assignee_id: $('#fu-who', m).value || null })
        : B.sb.from('items').insert({ project_id: p.id, type, title: t, body, due_date: date });
      const { data, error } = await ins.select().single();
      if (error) return ($('#fu-msg', m).textContent = errText(error));
      const patch = { followup_type: type, followup_id: data.id, ...($('#fu-done', m).checked ? { done: true } : {}) };
      const up = await B.sb.from('items').update(patch).eq('id', item.id);
      if (up.error && /followup/.test(up.error.message || '')) await B.sb.from('items').update({ done: patch.done ?? item.done }).eq('id', item.id);
      if (type === 'task' && data.assignee_id) {
        B.notify(data.assignee_id, { projectId: p.id, type: 'task', refId: data.id, link: `#/p/${p.id}/taches`,
          text: tr('{who} vous a confié une tâche : {title}', { who: B.me.display_name, title: t }) });
      }
      B.closeModal();
      await load();
      const archived = items.find((i) => i.id === item.id)?.archived_at;
      B.toast(tr('{what} créé(e) à partir de la décision.', { what: FOLLOW_LABEL()[type] }) + (archived ? ` ${tr('La décision est archivée en bas de la liste.')}` : ''), { type: 'success' });
    };
  }

  function openItem(item) {
    const t = ITEM_TYPES[item.type];
    const m = B.modal(`
      <h2>${esc(((one) => one[0].toUpperCase() + one.slice(1))(tr(t.one)))}</h2>
      <label>${tr('Titre')}</label><input id="it-title" maxlength="200" value="${esc(item.title)}" />
      <label>${tr('Détails')}</label><textarea id="it-body" rows="5" maxlength="5000">${esc(item.body || '')}</textarea>
      <label>${tr('Date (facultatif)')}</label><input id="it-date" type="date" value="${item.due_date || ''}" />
      <p class="muted small">${tr('Ajouté par {who}', { who: esc(B.person(item.author_id).display_name) })} · ${timeAgo(item.created_at)}</p>
      <div class="actions">
        ${B.canDelete(p.id, item.author_id, { voted: Boolean(item.vote_options) }) ? `<button class="btn danger-ghost" id="it-del">${icon('trash', 15)} ${tr('Supprimer')}</button>` : ''}
        ${item.type === 'decision' && !item.vote_options ? `<button class="btn" id="it-vote">${icon('users', 14)} ${tr('Soumettre au vote')}</button>` : ''}
        ${item.type === 'decision' && !(item.vote_options && new Date(item.vote_until) > new Date()) ? `<button class="btn" id="it-follow">${icon('arrow', 14)} ${tr('Donner suite')}</button>` : ''}
        <span class="spacer"></span>
        <button class="btn" data-close>${tr('Annuler')}</button><button class="btn primary" id="it-save">${tr('Enregistrer')}</button>
      </div>`);
    $('[data-close]', m).onclick = B.closeModal;
    $('#it-save', m).onclick = async () => {
      const { error } = await B.sb.from('items').update({
        title: $('#it-title', m).value.trim() || item.title,
        body: $('#it-body', m).value.trim() || null,
        due_date: $('#it-date', m).value || null
      }).eq('id', item.id);
      if (error) return B.error(error);
      B.closeModal();
      load();
    };
    $('#it-follow', m)?.addEventListener('click', () => followUp(item));
    $('#it-vote', m)?.addEventListener('click', () => newVote(item));
    $('#it-del', m)?.addEventListener('click', async () => {
      if (!(await B.confirm(tr('Supprimer « {name} » ?', { name: item.title }), tr('Supprimer')))) return;
      try { await B.deleteRow('items', item.id); } catch (err) { return B.error(err); }
      load();
    });
  }

  await load();
  B.live('items', 'items', `project_id=eq.${p.id}`, debounce(load, 300));
  B.live('votes', 'item_votes', null, debounce(async () => { await loadVotes(); render(); }, 300));
};
