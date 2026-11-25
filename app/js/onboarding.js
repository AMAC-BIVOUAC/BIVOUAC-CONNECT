// =====================================================================
// onboarding.js — la présentation ET la visite guidée, d'un seul tenant (refaites le 24/11, Amaury)
//
// Un seul parcours, une seule carte : le guide (personnage en papier découpé) se tient DANS la carte, sur le même fond
// que son texte, et il parle sur un ton enjoué. On commence par la présentation (à quoi sert BIVOUAC-TECH, l'image de
// l'ascension, ce qu'on y fait), on continue au premier lancement par « Présentez-vous » et le niveau, puis la visite
// enchaîne toute seule : Aujourd'hui et le menu, puis l'intérieur d'un projet.
//   * présentation et formulaires : carte au centre de l'écran, assombri ;
//   * visite : la zone expliquée est éclairée, la carte se range dans un coin du bas (ou du haut) sans la cacher ;
//   * téléphone : la carte prend toute la largeur, en bas ou en haut.
// B.runOnboarding({ pid, then }) au premier lancement (app.js), B.startTour({ intro: true }) depuis Paramètres.
// Textes : clés de tr() (à traduire à la main dans EN, i18n.js : le vérificateur ne voit pas ces clés).
// =====================================================================

// ---------- Le guide : une image par pose, toutes cadrées pareil (371 × 560, fond transparent), src/assets/guide/ ----------
const POSES = ['explique', 'montre', 'accueille', 'presente', 'reflechit', 'pointe', 'salue', 'bras-ouverts', 'attend', 'invite'];
// Poses tournées vers la gauche (le doigt pointé) : retournées pour montrer le texte, qui est à droite du guide
const FACING_LEFT = ['pointe'];
const poseSrc = (p) => `assets/guide/${POSES.includes(p) ? p : 'explique'}.webp`;

const row = (ic, title, text) => `<li>${ic}<div><strong>${tr(title)}</strong><span>${tr(text)}</span></div></li>`;
const ico = (name) => `<span class="onb-ico">${icon(name, 20)}</span>`;

// ---------- Les étapes ----------
// part : rubrique affichée en haut de la carte ; pose : pose du guide ; t : titre ; x : texte (ou html : contenu riche)
// Présentation et formulaires : pas de zone (carte au centre). Visite : `at` = zone sur ordinateur (pc) et téléphone
// (tel), `null` = pas sur cet appareil ; `go` = page où l'afficher ('home' ou 'p:<onglet>' dans le projet visité).
const INTRO = [
  { id: 'hello', part: 'Bienvenue', pose: 'salue', big: true, t: 'Salut, et bienvenue au camp de base ! 👋',
    html: () => `<p class="g-lead">${tr('Je suis votre guide. Ici, votre équipe et vos IA travaillent ensemble sur vos projets.')}</p>
      <img class="onb-hero" src="assets/scenes/chemin-jour-1000.webp" alt="" />
      <p>${tr('Fini les messages éparpillés, les fichiers perdus et les décisions oubliées : tout est au même endroit, et chacun sait quoi faire ensuite !')}</p>` },
  { id: 'climb', part: 'Bienvenue', pose: 'montre', big: true, t: 'Un projet, c’est une ascension 🏔️',
    html: () => `<ul class="onb-rows">
      ${row(ico('flag'), 'Le sommet', 'Votre grand objectif, celui que toute l’équipe vise.')}
      ${row(ico('route'), 'Le chemin', 'Les étapes pour y arriver, du départ jusqu’au drapeau.')}
      ${row('<img class="onb-tent" src="assets/scenes/tente-jour.webp" alt="" />', 'Le bivouac', 'À chaque étape franchie, on plante une tente : on souffle, on fête, et on repart !')}
      ${row(ico('campfire'), 'Le camp de base', 'Là où l’équipe se retrouve pour parler, s’organiser et décider.')}
    </ul>
    <p class="g-note">${tr('D’où le nom BIVOUAC : on avance étape par étape, ensemble.')}</p>` },
  { id: 'what', part: 'Bienvenue', pose: 'bras-ouverts', big: true, t: 'Ce que vous allez faire ici ✨',
    html: () => `<ul class="onb-rows">
      ${row(ico('chat'), 'Échanger', 'Discutez entre humains dans les salons, et appelez les IA à la rescousse dans l’Atelier.')}
      ${row(ico('checksq'), 'S’organiser', 'Une tâche, un responsable, une date. Simple et clair.')}
      ${row(ico('decision'), 'Décider', 'Proposez des idées, votez, et gardez la trace de ce qui est décidé.')}
      ${row(ico('file'), 'Ranger', 'Tous les documents du projet, bien rangés en dossiers.')}
    </ul>
    <p class="g-note">${icon('bot', 16)} ${tr('Et le meilleur : vos IA vous aident sans un centime de plus. Chacun branche son Claude ou son ChatGPT avec son propre abonnement !')}</p>` }
];

const PROFILE = [
  { id: 'me', part: 'Votre profil', pose: 'accueille', big: true, t: 'Et vous, comment on vous appelle ? 😊', form: true,
    html: () => `<p>${tr('Votre équipe vous verra sous ce nom.')}</p>
      <label for="o-name">${tr("Comment voulez-vous qu'on vous appelle ?")}</label><input id="o-name" maxlength="40" value="${esc(B.me.display_name || '')}" />
      <label for="o-handle">${tr('Votre pseudo (pour les @mentions)')}</label><input id="o-handle" maxlength="30" value="${esc(B.me.handle || '')}" />
      <label for="o-title">${tr('Votre rôle (facultatif)')}</label><input id="o-title" maxlength="60" placeholder="${tr('ex. Product designer')}" />
      <p class="msg" id="o-msg"></p>`,
    next: async (box) => {
      await B.updateMe({
        display_name: $('#o-name', box).value.trim() || B.me.display_name,
        handle: $('#o-handle', box).value.trim().toLowerCase(),
        title: $('#o-title', box).value.trim() || null
      });
    } },
  { id: 'level', part: 'Votre profil', pose: 'reflechit', big: true, t: 'Vous êtes plutôt…', form: true, nextLabel: "C'est parti !", laterLabel: 'Plus tard',
    html: () => `<div class="levels big">
        <button class="level on" data-l="debutant">${icon('compass', 26)}<strong>${tr('Je débute')}</strong><span>${tr('Plus de conseils : BIVOUAC-TECH vous suggère la prochaine étape de vos projets.')}</span></button>
        <button class="level" data-l="habitue">${icon('rocket', 26)}<strong>${tr("J'ai l'habitude")}</strong><span>${tr('Accompagnement léger, vous avancez à votre rythme.')}</span></button>
      </div>
      <p class="muted small">${tr('Vous pourrez le changer à tout moment dans Paramètres.')}</p>
      <p class="msg" id="o-msg"></p>`,
    bind: (box) => $$('[data-l]', box).forEach((b) => (b.onclick = () => $$('[data-l]', box).forEach((x) => x.classList.toggle('on', x === b)))),
    next: async (box) => {
      await B.updateMe({ level: $('[data-l].on', box)?.dataset.l || 'debutant', onboarded: true });
      B.renderSidebar();
    } }
];

const TOUR = [
  { part: 'Votre journée', go: 'home', at: { pc: '[data-nav="home"]', tel: '[data-bnav="home"]' }, pose: 'explique', t: "Aujourd'hui",
    x: 'Votre point de départ chaque jour ☀️ D’abord ce qu’on attend de vous (un vote, une mention), puis votre prochain pas dans chacun de vos projets.' },
  { part: 'Votre journée', go: 'home', at: { pc: '[data-tour="spaces"]', tel: '[data-bnav="projects"]' }, pose: 'montre', t: 'Vos projets',
    x: 'Tous vos projets sont rangés ici. Chacun a son équipe, ses IA et son chemin jusqu’au sommet.' },
  { part: 'Votre journée', go: 'home', at: { pc: '[data-tour="quick"]', tel: null }, pose: 'presente', t: 'Créer',
    x: 'Une nouvelle tâche, un nouveau projet, une invitation ? Tout part de ce bouton !' },
  { part: 'Votre journée', go: 'home', at: { pc: '[data-nav="messages"]', tel: '[data-bnav="messages"]' }, pose: 'pointe', t: 'Messages',
    x: 'Pour discuter en privé, à deux, avec les personnes de vos projets 💬' },
  { part: 'Votre journée', go: 'home', at: { pc: '#bell-btn', tel: '#bell-btn' }, pose: 'explique', t: 'La cloche',
    x: 'Elle vous prévient : une mention, une tâche pour vous, un vote… Et quand quelqu’un veut utiliser votre IA, c’est vous qui dites oui ou non.' },
  { part: 'Votre journée', go: 'home', at: { pc: '[data-tour="search"]', tel: '#search-btn' }, pose: 'reflechit', t: 'Recherche',
    x: 'Un message, une idée ou une tâche introuvable ? Tapez quelques mots, et hop, on la retrouve.' },
  { part: 'Votre journée', go: 'home', at: { pc: '#me-gear', tel: '[data-bnav="settings"]' }, pose: 'presente', t: 'Vos IA et vos réglages',
    x: 'Branchez ici votre IA (Claude, ChatGPT…) avec votre abonnement, et réglez vos notifications, même quand l’app est fermée.' },

  { part: 'Dans un projet', go: 'p:projet', at: { pc: '#camp-land', tel: '#camp-land' }, pose: 'explique', t: 'Le chemin jusqu’au sommet 🏔️',
    x: 'Le drapeau, c’est le sommet. Chaque point est une étape : quand vous la franchissez, une tente apparaît ! Le point orange « Vous êtes ici » montre où en est l’équipe.' },
  { part: 'Dans un projet', go: 'p:projet', at: { pc: '#camp-todo', tel: '#camp-todo' }, pose: 'pointe', t: 'Votre prochain pas',
    x: 'Les tâches qui vous attendent dans ce projet, la plus urgente d’abord. Cochez quand c’est fait… ça fait du bien 😄' },
  { part: 'Dans un projet', go: 'p:projet', at: { pc: '#camp-doors', tel: '#camp-doors' }, pose: 'montre', t: 'Le reste du Camp de base',
    x: '« Pendant votre absence » : tout ce que vous avez manqué. « À décider » : les votes en cours. « Idées » : la boîte à idées de l’équipe. « Le chemin » : pour ajouter ou modifier les étapes.' },
  { part: 'Dans un projet', go: 'p:discussion', at: { pc: '.tabs a[href$="/discussion"]', tel: '[data-pnav="discussion"]' }, pose: 'pointe', t: 'Discussion',
    x: 'Les salons, c’est pour discuter entre humains. Dans l’Atelier IA, tapez @claude ou @chatgpt pour appeler l’IA d’un coéquipier à la rescousse 🤖 Un salon peut aussi être ouvert aux IA.' },
  { part: 'Dans un projet', go: 'p:taches', at: { pc: '.tabs a[href$="/taches"]', tel: '[data-pnav="taches"]' }, pose: 'explique', t: 'Tâches',
    x: 'Qui fait quoi, et pour quand. Tableau, liste, calendrier ou par personne : choisissez votre vue préférée, et faites glisser les tâches.' },
  { part: 'Dans un projet', go: { pc: 'p:tout', tel: 'p:projet' }, at: { pc: '.tabs a[href$="/tout"]', tel: '#proj-more' }, pose: 'reflechit', t: 'Tout le projet',
    x: 'La mémoire du projet 🧠 Le chemin complet, les idées, les décisions… et les votes, quand il faut trancher.',
    xTel: 'La mémoire du projet, dans ce menu ⋯ 🧠 Le chemin complet, les idées, les décisions… et les votes, quand il faut trancher.' },
  { part: 'Dans un projet', go: 'p:documents', at: { pc: '.tabs a[href$="/documents"]', tel: '[data-pnav="documents"]' }, pose: 'montre', t: 'Documents',
    x: 'Tous les fichiers du projet, rangés en dossiers. Ajoutez-en un d’un geste : les anciennes versions sont gardées, et vos IA peuvent aussi y déposer leurs documents.' },
  { part: 'Dans un projet', go: 'p:equipe', at: { pc: '.tabs a[href$="/equipe"]', tel: '[data-pnav="equipe"]' }, pose: 'bras-ouverts', t: 'Équipe',
    x: 'Votre équipe ! Invitez quelqu’un par un simple lien, réglez les notifications du projet, et mettez votre IA au travail avec « Préparer pour mon IA ».' },

  { id: 'end', part: 'Bonne ascension', go: 'p:projet', at: null, pose: 'salue', t: 'Vous êtes prêt pour l’ascension ! 🎉',
    x: 'Commencez par votre prochain pas, ou dites bonjour dans la Discussion. Pour refaire le tour avec moi : Paramètres → Accompagnement.' }
];

const visibleZone = (sel) => {
  const el = sel && $(sel);
  const r = el?.getBoundingClientRect();
  return r && r.width && r.height ? el : null;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Premier lancement : présentation, « Présentez-vous », niveau, puis la visite, sans interruption */
B.runOnboarding = ({ pid, then } = {}) => B.startTour({ intro: true, profile: true, pid, then });

/** Revoir la présentation (Paramètres) : c'est le même parcours */
B.showIntro = () => B.startTour({ intro: true });

/**
 * Lance le parcours. `intro` = commencer par la présentation ; `profile` = premier lancement (« Présentez-vous » et niveau,
 * qu'on ne peut pas passer) ; `pid` = projet à visiter (sinon celui qui est ouvert, sinon le premier) ; `then` = à la fin.
 * Renvoie une promesse résolue à la fin.
 */
B.startTour = ({ intro = false, profile = false, pid, then } = {}) => new Promise((resolve) => {
  const tour = $('#tour');
  const phone = B.isPhone();
  const dev = phone ? 'tel' : 'pc';
  pid = pid || B.whereInProject()?.pid || B.projects[0]?.id;
  if (pid && !B.project(pid)) pid = B.projects[0]?.id;
  const pick = (v) => (v && typeof v === 'object' ? v[dev] : v);
  let visit = TOUR.filter((s) => (s.at === null || pick(s.at)) && (pid || !String(pick(s.go)).startsWith('p:')));
  if (!pid) visit = visit.map((s) => (s.id === 'end' ? { ...s, go: 'home',
    x: 'Créez votre premier projet avec « Créer », ou rejoignez celui d’un proche grâce à son lien d’invitation. Pour refaire le tour avec moi : Paramètres → Accompagnement.' } : s));
  const steps = [...(intro ? INTRO : []), ...(profile ? PROFILE : []), ...visit];
  const firstVisit = steps.length - visit.length;
  const locked = profile; // premier lancement : le profil ne se passe pas

  let cur = -1, target = null, alive = true;
  const end = () => {
    if (!alive) return;
    alive = false;
    if (B.stopTour === end) B.stopTour = null;
    tour.classList.add('hidden');
    tour.innerHTML = '';
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', place);
    document.removeEventListener('scroll', place, true);
    then?.();
    resolve();
  };
  B.stopTour = end; // compte disparu pendant la visite : B.accountGone (core.js) ferme la carte
  // « Passer » / Échap : pendant la présentation du premier lancement, on saute au profil ; sinon on quitte
  const skip = () => {
    const at = steps[cur];
    if (locked && at?.form) return; // le profil ne se passe pas
    if (locked && cur < firstVisit) return show(steps.findIndex((s) => s.form), 1);
    end();
  };
  const onKey = (e) => {
    if (e.target.closest?.('input, textarea')) return;
    if (e.key === 'Escape') skip();
    else if (e.key === 'ArrowRight') $('[data-next]', tour)?.click();
    else if (e.key === 'ArrowLeft') $('[data-prev]', tour)?.click();
  };
  document.addEventListener('keydown', onKey);
  POSES.forEach((p) => { new Image().src = poseSrc(p); });

  // La carte (guide + texte) : au centre sans zone ; sinon dans un coin du bas qui ne cache pas la zone (sinon en haut)
  function place() {
    const card = $('.tour-tip', tour), hole = $('.tour-hole', tour);
    if (!card) return;
    const W = window.innerWidth, H = window.innerHeight;
    const r = target?.isConnected ? target.getBoundingClientRect() : null;
    hole.classList.toggle('hidden', !r);
    if (r) Object.assign(hole.style, { top: `${r.top - 6}px`, left: `${r.left - 6}px`, width: `${r.width + 12}px`, height: `${r.height + 12}px` });
    const m = phone ? 8 : 24;
    const w = phone ? W - 2 * m : Math.min(card.classList.contains('big') ? 680 : 520, W - 2 * m);
    card.style.width = `${w}px`;
    const h = card.offsetHeight;
    const set = (x, y) => Object.assign(card.style, { left: `${Math.round(x)}px`, top: `${Math.round(Math.max(m, Math.min(y, H - h - m)))}px` });
    if (!r) return set((W - w) / 2, (H - h) / 2);
    const spots = phone
      ? [[m, H - m - h], [m, m]]
      : [[m, H - m - h], [W - m - w, H - m - h], [W - m - w, 70], [m, 70]];
    const clear = ([x, y]) => x + w <= r.left - 8 || x >= r.right + 8 || y + h <= r.top - 8 || y >= r.bottom + 8;
    const [x, y] = spots.find(clear) || spots[0];
    set(x, y);
  }
  window.addEventListener('resize', place);
  document.addEventListener('scroll', place, true);

  async function show(i, dir = 1) {
    const step = steps[i];
    if (!alive) return;
    if (!step) return end();
    cur = i;
    // 1) la bonne page (visite seulement)
    const go = pick(step.go);
    if (go) {
      const want = go === 'home' ? '#/home' : `#/p/${pid}/${go.slice(2)}`;
      if (location.hash !== want) { location.hash = want; await wait(450); }
    }
    // 2) la zone (la page peut mettre un moment à s'afficher) ; zone absente = étape sautée
    const sel = step.at && pick(step.at);
    target = null;
    if (sel) {
      for (let k = 0; k < 30 && alive && !(target = visibleZone(sel)); k++) await wait(100);
      if (!alive || cur !== i) return;
      if (!target) return show(i + dir, dir);
      target.scrollIntoView({ block: 'center', inline: 'nearest' });
      await wait(60);
    }
    if (!alive || cur !== i) return;
    const last = i === steps.length - 1;
    const inVisit = i >= firstVisit;
    const text = phone && step.xTel ? step.xTel : step.x;
    const flip = FACING_LEFT.includes(step.pose);
    // Boutons : présentation (Passer), formulaires (pas de Passer au premier lancement), visite (Quitter la visite)
    const leftBtn = step.form
      ? (step.laterLabel ? `<button class="btn small" data-later>${tr(step.laterLabel)}</button>` : '')
      : `<button class="btn small" data-end>${last ? tr('Fermer') : inVisit ? tr('Quitter la visite') : tr('Passer')}</button>`;
    tour.innerHTML = `
      <div class="tour-hole ${target ? '' : 'hidden'}"></div>
      <div class="tour-shade ${target ? 'hidden' : ''}"></div>
      <div class="tour-tip guide-card ${phone ? 'sheet' : ''} ${step.big && !target ? 'big' : ''}" role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-live="polite">
        <div class="guide-pic" aria-hidden="true"><img class="guide-img ${flip ? 'flip' : ''}" src="${poseSrc(step.pose)}" alt="" width="371" height="560" /></div>
        <div class="guide-body">
          <small>${esc(tr(step.part))} · ${i + 1} / ${steps.length}</small>
          <div class="tour-bar" aria-hidden="true"><i style="width:${Math.round(((i + 1) / steps.length) * 100)}%"></i></div>
          <h3 id="tour-title">${esc(tr(step.t))}</h3>
          <div class="guide-text">${step.html ? step.html() : `<p>${esc(tr(text))}</p>`}</div>
          <div class="actions">${leftBtn}<span class="spacer"></span>
            ${i && !(locked && i === firstVisit) ? `<button class="btn small" data-prev>${tr('Retour')}</button>` : ''}
            <button class="btn small primary" data-next>${step.nextLabel ? tr(step.nextLabel) : last ? tr('Terminer') : tr('Suivant')}</button></div>
        </div>
      </div>`;
    tour.classList.remove('hidden');
    const box = $('.tour-tip', tour);
    step.bind?.(box);
    place();
    setTimeout(() => alive && cur === i && place(), 400); // la page a pu bouger (paysage dessiné, images)
    $('[data-end]', tour)?.addEventListener('click', skip);
    $('[data-later]', tour)?.addEventListener('click', async () => {
      try { await step.next?.(box); } catch (err) { const msg = $('#o-msg', box); if (msg) msg.textContent = errText(err); return; }
      end();
    });
    $('[data-prev]', tour)?.addEventListener('click', () => show(i - 1, -1));
    $('[data-next]', tour).onclick = async () => {
      if (step.next) {
        try { await step.next(box); } catch (err) { const msg = $('#o-msg', box); if (msg) msg.textContent = errText(err); return; }
      }
      last ? end() : show(i + 1, 1);
    };
    (step.form ? $('input, [data-next]', box) : $('[data-next]', tour)).focus({ preventScroll: true });
  }
  show(0);
});
