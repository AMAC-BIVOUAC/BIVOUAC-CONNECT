// =====================================================================
// templates.js — « Nouvel espace » avec des MODÈLES de projet
//
// Un modèle = un point de départ léger, jamais un programme imposé :
//   • 2 salons en plus de #général, 3 à 4 étapes, 5 tâches au maximum ;
//   • les autres idées de tâches ne s'affichent que si on les demande ;
//   • UNE seule question : la date clé (facultative) ; les étapes sont placées
//     toutes seules (J-30, J-7…) ; sans date, les étapes n'ont pas de date ;
//   • tâches « À faire », sans responsable ; tout se modifie ou se supprime.
// Les textes sont écrits en français et traduits par tr() au moment de créer le
// projet (dans la langue de celui qui le crée). Pas de table en base : tout est ici.
// =====================================================================

const NP_COLORS = ['#12809A', '#F28C28', '#5ECDB5', '#7C6FE0', '#E0607E', '#3D9BE9', '#0E2A3B', '#8BAE3F'];

B.TEMPLATES = [
  {
    id: 'pro', emoji: '💼', color: '#12809A',
    name: 'Projet professionnel', line: 'Un projet client ou interne, avec une équipe au travail',
    dateLabel: 'Date de livraison',
    channels: [['réunions', 'Ordres du jour et comptes rendus'], ['livrables', 'Ce qui doit être rendu, et quand']],
    milestones: [['Cadrage', -60], ["Point d'étape", -30], ['Livraison', 0], ['Bilan', 14]],
    tasks: ["Définir l'objectif et le périmètre", 'Répartir qui fait quoi', 'Établir le planning', 'Estimer le budget', 'Lister les risques'],
    more: ['Compte rendu de la réunion de lancement', "Préparer le point d'équipe de la semaine", 'Faire valider les livrables', 'Rédiger le bilan du projet']
  },
  {
    id: 'etudiant', emoji: '🎓', color: '#7C6FE0',
    name: 'Projet étudiant', line: 'Exposé, projet de groupe, mémoire ou soutenance',
    dateLabel: 'Date du rendu',
    channels: [['recherches', 'Sources, liens et documents'], ['rédaction', 'Avancement de chaque partie']],
    milestones: [['Plan validé', -35], ['Premier jet', -21], ['Relecture', -7], ['Rendu / soutenance', 0]],
    tasks: ['Choisir le sujet', 'Se répartir les parties', 'Rassembler les sources', 'Rédiger sa partie', 'Préparer le diaporama'],
    more: ["Répéter l'oral", "Relire l'ensemble", 'Vérifier les consignes de rendu', 'Préparer la bibliographie']
  },
  {
    id: 'activite', emoji: '🚀', color: '#F28C28',
    name: 'Lancer son activité', line: 'Une entreprise, une appli, une chaîne, un produit…',
    dateLabel: 'Date de lancement',
    channels: [['idées', 'Toutes les idées, même les plus folles'], ['com', 'Nom, logo, réseaux, communication']],
    milestones: [['Idée validée', -90], ['Premiers tests', -45], ['Lancement', 0], ['Premier bilan', 30]],
    tasks: ["Décrire l'idée en une page", 'Étudier les concurrents', 'Définir la cible', 'Estimer le budget', 'Créer un premier prototype'],
    more: ['Préparer le plan de communication', 'Trouver un nom', "Faire tester l'idée à 5 personnes", 'Créer les comptes sur les réseaux sociaux']
  },
  {
    id: 'asso', emoji: '🎪', color: '#5ECDB5',
    name: 'Événement associatif', line: 'Concert, kermesse, tournoi, collecte…',
    dateLabel: "Date de l'événement",
    channels: [['logistique', 'Lieu, matériel, buvette'], ['bénévoles', 'Qui est disponible, et quand']],
    milestones: [['Autorisations demandées', -60], ['Communication lancée', -30], ['Planning des bénévoles', -7], ['Jour J', 0]],
    tasks: ['Faire la demande en mairie', "Vérifier l'assurance", "Créer l'affiche", 'Lister le matériel', 'Organiser la buvette'],
    more: ['Publier sur les réseaux sociaux', 'Lancer un appel aux bénévoles', 'Prévoir la sécurité et les premiers secours', 'Faire le bilan financier']
  },
  {
    id: 'fete', emoji: '🎉', color: '#E0607E',
    name: 'Fête / anniversaire', line: 'Une fête entre amis ou en famille',
    dateLabel: 'Date de la fête',
    channels: [['idées', 'Déco, musique, surprises'], ['courses', 'Qui achète quoi']],
    milestones: [['Invitations envoyées', -21], ['Courses', -7], ['Jour J', 0], ['Remerciements', 2]],
    tasks: ['Choisir le lieu', 'Faire la liste des invités', 'Fixer le budget', 'Prévoir la musique', 'Commander le gâteau'],
    more: ['Préparer la décoration', 'Faire les courses', 'Prévoir le rangement', 'Organiser une surprise']
  },
  {
    id: 'sortie', emoji: '🏕️', color: '#3D9BE9',
    name: 'Sortie / voyage', line: 'Un week-end, des vacances, une sortie en groupe',
    dateLabel: 'Date de départ',
    channels: [['infos-pratiques', 'Adresses, horaires, réservations'], ['covoiturage', 'Qui part avec qui']],
    milestones: [['Réservations faites', -30], ['Courses et bagages', -2], ['Départ', 0]],
    tasks: ['Choisir la destination', 'Réserver le logement', 'Organiser les trajets', 'Partager les frais', "Faire la liste de ce qu'il faut apporter"],
    more: ['Vérifier la météo', 'Trouver des activités sur place', "Vérifier les papiers d'identité", "Penser à l'assurance voyage"]
  },
  {
    id: 'mariage', emoji: '💍', color: '#0E2A3B',
    name: 'Mariage', line: 'Pour les mariés, les témoins et la famille',
    dateLabel: 'Date du mariage',
    channels: [['prestataires', 'Traiteur, photographe, musique…'], ['invités', 'Liste, réponses, hébergements']],
    milestones: [['Lieu réservé', -365], ['Faire-part envoyés', -180], ['Plan de table', -30], ['Jour J', 0]],
    tasks: ['Fixer le budget', 'Réserver le lieu', 'Choisir le traiteur', 'Réserver le photographe', 'Faire la liste des invités'],
    more: ['Trouver la musique ou le DJ', 'Choisir les tenues', 'Préparer les faire-part', 'Faire le plan de table', 'Choisir les alliances']
  }
];

/** Date clé + décalage en jours → AAAA-MM-JJ (jamais avant aujourd'hui) */
function npShift(keyDay, offset) {
  const d = new Date(keyDay + 'T00:00:00');
  d.setDate(d.getDate() + offset);
  const day = isoDay(d);
  return day < isoDay() ? isoDay() : day;
}

/** Crée le contenu d'un modèle dans un projet tout juste créé. Renvoie les compteurs. */
B.applyTemplate = async (projectId, t, keyDay) => {
  const base = Date.now() / 1000;
  const [ch, ms, tk] = await Promise.all([
    B.sb.from('channels').insert(t.channels.map(([name, desc]) => ({
      project_id: projectId, kind: 'team', name: tr(name), description: tr(desc)
    }))),
    B.sb.from('items').insert(t.milestones.map(([title, offset]) => ({
      project_id: projectId, type: 'milestone', title: tr(title), due_date: keyDay ? npShift(keyDay, offset) : null
    }))),
    B.sb.from('tasks').insert(t.tasks.map((title, i) => ({
      project_id: projectId, title: tr(title), status: 'todo', position: base + i
    })))
  ]);
  const err = ch.error || ms.error || tk.error;
  if (err) throw err;
  return { channels: t.channels.length, milestones: t.milestones.length, tasks: t.tasks.length };
};

// ---------------------------------------------------------------------
// La fenêtre « Nouvel espace » : 1) choisir un modèle  2) nom (+ date)  3) c'est prêt
// ---------------------------------------------------------------------

B.openNewProject = () => {
  const m = B.modal(`
    <h2>${tr('Nouvel espace projet')}</h2>
    <p class="muted">${tr('Choisissez un point de départ. Tout se modifie ensuite.')}</p>
    <div class="tpl-grid">
      ${B.TEMPLATES.map((t) => `<button class="tpl-card" data-tpl="${t.id}">
        <span class="tpl-emoji">${t.emoji}</span><strong>${tr(t.name)}</strong><span>${tr(t.line)}</span></button>`).join('')}
      <button class="tpl-card empty" data-tpl="">
        <span class="tpl-emoji">⬜</span><strong>${tr('Projet vide')}</strong><span>${tr('Je pars de zéro')}</span></button>
    </div>
    <hr />
    <h3>${tr('…ou rejoindre un espace existant')}</h3>
    <div class="row"><input id="np-code" placeholder="${tr("Lien ou code d'invitation")}" /><button class="btn" id="np-join">${tr('Rejoindre')}</button></div>
    <p class="msg" id="np-msg"></p>
    <div class="actions"><span class="spacer"></span><button class="btn" data-close>${tr('Annuler')}</button></div>`, { wide: true });
  $('[data-close]', m).onclick = B.closeModal;
  $$('[data-tpl]', m).forEach((b) => (b.onclick = () => npDetails(B.TEMPLATES.find((t) => t.id === b.dataset.tpl) || null)));
  $('#np-join', m).onclick = async () => {
    const code = $('#np-code', m).value.trim();
    if (!code) return;
    try {
      const id = await B.joinProject(code);
      B.closeModal();
      location.hash = `#/p/${id}`;
    } catch (err) { $('#np-msg', m).textContent = errText(err); }
  };
};

/** Étape 2 : le nom, la date clé (facultative), la couleur */
function npDetails(t) {
  let color = t?.color || NP_COLORS[0];
  const swatches = [...new Set([color, ...NP_COLORS])];
  const m = B.modal(`
    <button class="link small np-back">← ${tr('Changer de modèle')}</button>
    <h2>${t ? `${t.emoji} ${tr(t.name)}` : tr('Projet vide')}</h2>
    <label for="np-name">${tr('Nom du projet')}</label>
    <input id="np-name" maxlength="60" value="${t ? esc(tr(t.name)) : ''}" placeholder="${tr('ex. Lancement produit')}" />
    ${t ? `
      <label for="np-date">${tr(t.dateLabel)}</label>
      <div class="np-date-row">
        <input id="np-date" type="date" />
        <label class="check small"><input type="checkbox" id="np-nodate" /> ${tr('Je ne sais pas encore')}</label>
      </div>
      <p class="muted small">${tr('Les étapes seront placées toutes seules dans le calendrier à partir de cette date.')}</p>` : `
      <label for="np-desc">${tr('En une phrase (facultatif)')}</label>
      <input id="np-desc" maxlength="300" placeholder="${tr('ex. Préparer la sortie de la v1 au printemps')}" />`}
    <label>${tr('Couleur')}</label>
    <div class="color-pick">${swatches.map((c) => `<button type="button" class="swatch ${c === color ? 'on' : ''}" data-c="${c}" style="background:${c}"></button>`).join('')}</div>
    ${t ? `<p class="tpl-summary">${icon('spark', 14)} ${tr('Ajouté au projet : {c} salons, {s} étapes et {n} tâches de départ.', { c: t.channels.length, s: t.milestones.length, n: t.tasks.length })}</p>` : ''}
    <p class="msg" id="np-msg"></p>
    <div class="actions"><button class="btn" data-close>${tr('Annuler')}</button><span class="spacer"></span>
      <button class="btn primary" id="np-create">${tr("Créer l'espace")}</button></div>`);
  $('[data-close]', m).onclick = B.closeModal;
  $('.np-back', m).onclick = B.openNewProject;
  $$('.swatch', m).forEach((s) => (s.onclick = () => {
    $$('.swatch', m).forEach((x) => x.classList.remove('on'));
    s.classList.add('on');
    color = s.dataset.c;
  }));
  const nodate = $('#np-nodate', m);
  if (nodate) nodate.onchange = () => { $('#np-date', m).disabled = nodate.checked; };
  $('#np-name', m).select();

  $('#np-create', m).onclick = async (e) => {
    const name = $('#np-name', m).value.trim();
    if (!name) return ($('#np-msg', m).textContent = tr('Donnez un nom au projet.'));
    const keyDay = t && !nodate.checked ? ($('#np-date', m).value || null) : null;
    e.target.disabled = true;
    e.target.textContent = tr('Création…');
    try {
      const id = await B.createProject(name, t ? '' : $('#np-desc', m).value.trim(), color);
      if (!t) { B.closeModal(); location.hash = `#/p/${id}`; return; }
      let counts = null;
      try { counts = await B.applyTemplate(id, t, keyDay); } catch (err) { console.warn('Modèle', err); }
      await B.loadProjects();
      location.hash = `#/p/${id}/projet`;
      npReady(id, t, counts, keyDay);
    } catch (err) {
      e.target.disabled = false;
      e.target.textContent = tr("Créer l'espace");
      $('#np-msg', m).textContent = errText(err);
    }
  };
}

/** Étape 3 : « Votre projet est prêt » + les autres idées de tâches, seulement si on les demande */
function npReady(projectId, t, counts, keyDay) {
  const m = B.modal(`
    <div class="tpl-ready">
      <span class="tpl-emoji big">${t.emoji}</span>
      <h2>${tr('Votre projet est prêt !')}</h2>
      ${counts
        ? `<p>${tr('{n} tâches, {s} étapes et {c} salons ont été ajoutés. Tout se modifie ou se supprime.', { n: counts.tasks, s: counts.milestones, c: counts.channels })}</p>
           ${keyDay ? `<p class="muted small">${tr('Les étapes sont dans le calendrier.')}</p>` : `<p class="muted small">${tr("Les étapes n'ont pas encore de date : ajoutez-la quand vous la connaîtrez.")}</p>`}`
        : `<p class="msg error">${tr("Le projet est créé, mais le modèle n'a pas pu être ajouté. Vous pouvez partir de zéro.")}</p>`}
    </div>
    ${counts ? `<details class="tpl-more"><summary>${tr("Voir d'autres idées de tâches")}</summary>
      <div class="tpl-more-list">${t.more.map((title, i) => `<div class="tpl-more-row"><span>${esc(tr(title))}</span>
        <button class="btn tiny" data-more="${i}">${icon('plus', 12)} ${tr('Ajouter')}</button></div>`).join('')}</div>
    </details>` : ''}
    <div class="actions"><span class="spacer"></span><button class="btn primary" data-close>${tr('Voir mon projet')}</button></div>`);
  $('[data-close]', m).onclick = B.closeModal;
  $$('[data-more]', m).forEach((b) => (b.onclick = async () => {
    b.disabled = true;
    const { error } = await B.sb.from('tasks').insert({ project_id: projectId, title: tr(t.more[Number(b.dataset.more)]), status: 'todo' });
    if (error) { b.disabled = false; return B.error(error); }
    b.innerHTML = `${icon('check', 12)} ${tr('Ajoutée')}`;
    B.loadProjects();
  }));
}
