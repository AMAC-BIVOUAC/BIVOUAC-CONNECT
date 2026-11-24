// =====================================================================
// onboarding.js — la présentation au premier lancement + la visite guidée
// Refaites le 24/11 (Amaury) : on explique d'abord À QUOI sert BIVOUAC-TECH et l'image de l'ascension
// (sommet, chemin, bivouac, camp de base), puis la visite entre dans un projet et montre chaque partie.
// =====================================================================

// ---------------------------------------------------------------------
// Présentation : 3 écrans courts. Utilisée au premier lancement (avant « Présentez-vous ») et depuis
// Paramètres → Accompagnement → « Revoir la présentation ».
// ---------------------------------------------------------------------

// Le guide (personnage en papier découpé, 24/11, Amaury) : une image par pose, toutes cadrées pareil (371 × 560),
// dans src/assets/guide/. Nouvelle pose = déposer le fichier et l'ajouter ici, puis la choisir (`pose`) dans un écran ou une étape.
const POSES = ['explique', 'montre', 'accueille', 'presente', 'reflechit', 'pointe', 'salue', 'bras-ouverts', 'attend', 'invite'];
// Poses tournées vers la gauche (le doigt pointé) : retournées quand le guide est à gauche de la bulle, pour la montrer
const FACING_LEFT = ['pointe'];
const poseSrc = (p) => `assets/guide/${POSES.includes(p) ? p : 'explique'}.webp`;
const guideImg = (pose, cls = '') => `<img class="guide-img ${cls}" src="${poseSrc(pose)}" alt="" width="371" height="560" />`;
/** Change la pose d'une image du guide (petit saut, sauf si les animations sont coupées) */
const setPose = (img, pose) => {
  if (!img || !pose || img.getAttribute('src') === poseSrc(pose)) return;
  img.setAttribute('src', poseSrc(pose));
  img.classList.toggle('pop', false);
  void img.offsetWidth;
  img.classList.toggle('pop', true);
};

const RATIO = 371 / 560; // largeur / hauteur des images du guide
/**
 * Pose le guide (`g`, élément fixe contenant .guide-img) EN GRAND à côté de la bulle `b` (rectangle), sans toucher
 * la zone expliquée `avoid` (rectangle ou null).
 * Ordinateur : debout à gauche de la bulle (il la montre de la main), sinon à droite en miroir, les pieds au bas de la
 * bulle ; on essaie du plus grand (`maxH`) au plus petit (`minH`). Téléphone : il sort de la bulle par le haut (ou se tient
 * dessous si la bulle est en haut de l'écran). Pas de place : caché.
 */
const faceLeft = (g) => FACING_LEFT.some((p) => $('.guide-img', g)?.getAttribute('src') === poseSrc(p));
const fitGuide = (g, b, avoid, { phone = false, maxH = 460, minH = 220 } = {}) => {
  if (!g) return;
  const W = window.innerWidth, H = window.innerHeight;
  const hits = (x, y, w, h) => avoid && !(x + w <= avoid.left - 2 || x >= avoid.right + 2 || y + h <= avoid.top - 2 || y >= avoid.bottom + 2);
  const ok = (x, y, w, h) => x >= 2 && x + w <= W - 2 && y >= 2 && y + h <= H - 2 && !hits(x, y, w, h);
  let spot = null;
  if (phone) {
    const gh = Math.min(maxH, Math.round(H * 0.28)), gw = gh * RATIO;
    const tries = [
      [b.right - gw - 6, b.top - gh + 30, true], [b.left + 6, b.top - gh + 30, false],     // debout sur la bulle
      [b.right - gw - 6, b.bottom - 14, true], [b.left + 6, b.bottom - 14, false]          // sous la bulle
    ];
    const t = tries.find(([x, y]) => ok(x, y, gw, gh));
    if (t) spot = { x: t[0], y: t[1], w: gw, h: gh, flip: t[2] };
  } else {
    for (let gh = maxH; gh >= minH && !spot; gh -= 20) {
      const gw = gh * RATIO;
      let y = b.bottom - gh + 2;                          // les pieds au bas de la bulle
      if (y < 8) y = 8;                                   // bulle haute : il dépasse en dessous
      if (ok(b.left - gw + 14, y, gw, gh)) spot = { x: b.left - gw + 14, y, w: gw, h: gh, flip: false };
      else if (ok(b.right - 14, y, gw, gh)) spot = { x: b.right - 14, y, w: gw, h: gh, flip: true };
    }
  }
  // zone très grande (le paysage du chemin…) : il peut se tenir par-dessus son bord, plutôt que de disparaître
  if (!spot && avoid && (avoid.width * avoid.height) > W * H * (phone ? 0.1 : 0.2)) return fitGuide(g, b, null, { phone, maxH: Math.min(maxH, 360), minH });
  g.classList.toggle('hidden', !spot);
  g.classList.toggle('flip', Boolean(spot?.flip) !== faceLeft(g));
  if (spot) Object.assign(g.style, { left: `${Math.round(spot.x)}px`, top: `${Math.round(spot.y)}px`, width: `${Math.round(spot.w)}px`, height: `${Math.round(spot.h)}px` });
};

const introRow = (ic, title, text) => `<li>${ic}<div><strong>${tr(title)}</strong><span>${tr(text)}</span></div></li>`;
const introDots = (n) => `<div class="onb-dots" aria-hidden="true">${[1, 2, 3].map((k) => `<i class="${k === n ? 'on' : ''}"></i>`).join('')}</div>`;

/** Les 3 écrans ; `last` = bouton du dernier écran (« Continuer » au premier lancement, « Lancer la visite » ensuite) */
const introHtml = (last) => `
  <div class="onb-step" data-s="i1" data-pose="salue">
    ${introDots(1)}
    <h2>${tr('Bienvenue sur BIVOUAC-TECH')}</h2>
    <p class="onb-lead">${tr('Le camp de base de vos projets : votre équipe et vos IA y travaillent ensemble, au même endroit.')}</p>
    <img class="onb-hero" src="assets/scenes/chemin-jour-1000.webp" alt="" />
    <p class="muted">${tr('Une conversation qui part dans tous les sens, des fichiers éparpillés, des décisions oubliées… Ici, tout le projet est rangé au même endroit, et chacun sait quoi faire ensuite.')}</p>
    <div class="actions onb-actions"><button class="btn" data-skip>${tr('Passer')}</button><span class="spacer"></span><button class="btn primary" data-go="i2">${tr('Suivant')}</button></div>
  </div>
  <div class="onb-step hidden" data-s="i2" data-pose="montre">
    ${introDots(2)}
    <h2>${tr('Un projet, c’est une ascension')}</h2>
    <ul class="onb-rows">
      ${introRow(`<span class="onb-ico">${icon('flag', 22)}</span>`, 'Le sommet', 'Votre objectif final : ce que vous voulez réussir ensemble.')}
      ${introRow(`<span class="onb-ico">${icon('route', 22)}</span>`, 'Le chemin', 'Les étapes pour y arriver. Il se lit de bas en haut, du départ jusqu’au drapeau.')}
      ${introRow('<img class="onb-tent" src="assets/scenes/tente-jour.webp" alt="" />', 'Le bivouac', 'À chaque étape franchie, une tente est plantée sur le chemin : une halte pour souffler, fêter et repartir.')}
      ${introRow(`<span class="onb-ico">${icon('campfire', 22)}</span>`, 'Le camp de base', 'L’endroit où l’équipe se retrouve pour parler, s’organiser et décider.')}
    </ul>
    <p class="info">${tr('D’où le nom : un projet ne se fait pas d’une traite. On avance étape par étape, ensemble, avec un bivouac à chaque palier.')}</p>
    <div class="actions onb-actions"><button class="btn" data-go="i1">${tr('Retour')}</button><span class="spacer"></span><button class="btn primary" data-go="i3">${tr('Suivant')}</button></div>
  </div>
  <div class="onb-step hidden" data-s="i3" data-pose="bras-ouverts">
    ${introDots(3)}
    <h2>${tr('Ce que vous y faites')}</h2>
    <ul class="onb-rows">
      ${introRow(`<span class="onb-ico">${icon('chat', 22)}</span>`, 'Échanger', 'Des salons pour parler entre humains, et un Atelier où les IA de l’équipe vous aident.')}
      ${introRow(`<span class="onb-ico">${icon('checksq', 22)}</span>`, 'S’organiser', 'Des tâches avec un responsable et une date, et un calendrier.')}
      ${introRow(`<span class="onb-ico">${icon('decision', 22)}</span>`, 'Décider', 'Des idées, des votes, et la trace de ce qui a été décidé.')}
      ${introRow(`<span class="onb-ico">${icon('file', 22)}</span>`, 'Ranger', 'Tous les documents du projet, en dossiers, avec leurs anciennes versions.')}
    </ul>
    <p class="info">${icon('bot', 16)} ${tr('Vos IA, sans rien payer de plus : chacun branche son Claude ou son ChatGPT avec son propre abonnement.')}</p>
    <div class="actions onb-actions"><button class="btn" data-go="i2">${tr('Retour')}</button><span class="spacer"></span><button class="btn primary" data-intro-end>${last}</button></div>
  </div>`;

/** Fait marcher les boutons « Suivant / Retour » d'une fenêtre à étapes */
const stepper = (m) => {
  const show = (s) => {
    $$('.onb-step', m).forEach((x) => x.classList.toggle('hidden', x.dataset.s !== String(s)));
    m.scrollTop = 0;
    setPose($('#modal-backdrop .guide-float .guide-img'), $(`.onb-step[data-s="${s}"]`, m)?.dataset.pose);
    m.placeGuide?.();
    requestAnimationFrame(m.placeGuide || (() => {}));
    $(`.onb-step[data-s="${s}"] .btn.primary`, m)?.focus();
  };
  $$('[data-go]', m).forEach((b) => (b.onclick = () => show(b.dataset.go)));
  // le guide, en grand, debout à côté de la fenêtre (élément à part : la fenêtre défile et couperait l'image)
  m.classList.add('onb-modal');
  const g = document.createElement('div');
  g.className = 'guide-float';
  g.setAttribute('aria-hidden', 'true');
  g.innerHTML = guideImg($('.onb-step:not(.hidden)', m)?.dataset.pose || 'explique');
  $('#modal-backdrop').appendChild(g);
  m.placeGuide = () => {
    if (!g.isConnected) return;
    const r = m.getBoundingClientRect();
    fitGuide(g, r, null, { phone: B.isPhone(), maxH: 380, minH: 200 }); // même taille à chaque écran
  };
  const ro = new ResizeObserver(m.placeGuide);
  ro.observe(m);
  window.addEventListener('resize', m.placeGuide);
  m.placeGuide();
  return show;
};

B.runOnboarding = () => new Promise((resolve) => {
  const me = B.me;
  let level = 'debutant';
  const m = B.modal(`
    <div class="onb">
      ${introHtml(tr('Continuer'))}
      <div class="onb-step hidden" data-s="1" data-pose="accueille">
        <h2>${tr('Présentez-vous')}</h2>
        <p class="muted">${tr('Votre équipe vous verra sous ce nom.')}</p>
        <label>${tr("Comment voulez-vous qu'on vous appelle ?")}</label><input id="o-name" maxlength="40" value="${esc(me.display_name)}" />
        <label>${tr('Votre pseudo (pour les @mentions)')}</label><input id="o-handle" maxlength="30" value="${esc(me.handle)}" />
        <label>${tr('Votre rôle (facultatif)')}</label><input id="o-title" maxlength="60" placeholder="${tr('ex. Product designer')}" />
        <p class="msg" id="o-msg"></p>
        <div class="actions onb-actions"><button class="btn" data-go="i3">${tr('Retour')}</button><span class="spacer"></span><button class="btn primary" id="o-next">${tr('Continuer')}</button></div>
      </div>
      <div class="onb-step hidden" data-s="2" data-pose="reflechit">
        <h2>${tr('Choisissez votre niveau')}</h2>
        <p class="muted">${tr('Vous pourrez le changer à tout moment dans Paramètres.')}</p>
        <div class="levels big">
          <button class="level on" data-l="debutant">${icon('compass', 28)}<strong>${tr('Je débute')}</strong><span>${tr('Plus de conseils : BIVOUAC-TECH vous suggère la prochaine étape de vos projets.')}</span></button>
          <button class="level" data-l="habitue">${icon('rocket', 28)}<strong>${tr("J'ai l'habitude")}</strong><span>${tr('Accompagnement léger, vous avancez à votre rythme.')}</span></button>
        </div>
        <div class="actions onb-actions"><span class="spacer"></span><button class="btn primary" id="o-next2">${tr('Continuer')}</button></div>
      </div>
      <div class="onb-step hidden" data-s="3" data-pose="invite">
        <h2>${tr("C'est parti !")}</h2>
        <p class="muted">${tr('Une visite de 2 minutes pour voir où se trouve chaque chose, dans un vrai projet ?')}</p>
        <div class="levels big">
          <button class="level" id="o-tour">${icon('compass', 28)}<strong>${tr('Faire la visite guidée')}</strong><span>${tr('Le chemin, les tâches, les documents, l’Atelier IA… pas à pas.')}</span></button>
          <button class="level" id="o-go">${icon('arrow', 28)}<strong>${tr('Commencer directement')}</strong><span>${tr('Vous pourrez la faire plus tard depuis Paramètres.')}</span></button>
        </div>
      </div>
    </div>`, { wide: true, locked: true });

  const show = stepper(m);
  $$('[data-skip], [data-intro-end]', m).forEach((b) => (b.onclick = () => show(1)));

  $('#o-next', m).onclick = async () => {
    try {
      await B.updateMe({
        display_name: $('#o-name', m).value.trim() || me.display_name,
        handle: $('#o-handle', m).value.trim().toLowerCase(),
        title: $('#o-title', m).value.trim() || null
      });
      show(2);
    } catch (err) { $('#o-msg', m).textContent = errText(err); }
  };
  $$('[data-l]', m).forEach((b) => (b.onclick = () => {
    level = b.dataset.l;
    $$('[data-l]', m).forEach((x) => x.classList.toggle('on', x === b));
  }));
  $('#o-next2', m).onclick = () => show(3);

  // Renvoie true si la personne veut la visite guidée : app.js la lance une fois la page affichée
  // (avant, elle partait pendant le chargement de la page et pouvait viser des zones pas encore là)
  const finish = async (tour) => {
    await B.updateMe({ level, onboarded: true }).catch(B.error);
    B.closeModal();
    B.renderSidebar();
    resolve(tour);
  };
  $('#o-tour', m).onclick = () => finish(true);
  $('#o-go', m).onclick = () => finish(false);
});

/** Revoir la présentation (Paramètres) ; le dernier bouton lance la visite guidée */
B.showIntro = () => {
  const m = B.modal(`<div class="onb">${introHtml(tr('Faire la visite guidée'))}</div>`, { wide: true });
  stepper(m);
  $('[data-skip]', m).onclick = () => B.closeModal();
  $('[data-intro-end]', m).onclick = () => { B.closeModal(); B.startTour(); };
};

// ---------------------------------------------------------------------
// Visite guidée : met en lumière les zones de l'écran une par une, d'abord la journée (Aujourd'hui et le menu),
// puis l'intérieur d'un projet (Camp de base, Discussion, Tâches, Tout le projet, Documents, Équipe).
// Chaque étape : `at` = zone sur ordinateur (pc) et sur téléphone (tel) ; `null` = pas sur cet appareil ;
// `go` = page où l'afficher ('home' ou 'p:<onglet>' dans le projet de la visite) ; pas de zone = bulle au centre.
// Une zone absente au moment de l'afficher est sautée. Textes : clés de tr() (à traduire à la main dans EN :
// le vérificateur ne les voit pas). Nouvel élément important de l'interface = une étape à ajouter ici.
// ---------------------------------------------------------------------

const TOUR = [
  { part: 'day', go: 'home', at: { pc: '[data-nav="home"]', tel: '[data-bnav="home"]' }, pose: 'explique', t: "Aujourd'hui",
    x: "Votre point de départ chaque jour : ce qu'on attend de vous (votes, mentions), puis votre prochain pas dans chacun de vos projets." },
  { part: 'day', go: 'home', at: { pc: '[data-tour="spaces"]', tel: '[data-bnav="projects"]' }, pose: 'montre', t: 'Vos projets',
    x: 'Tous vos projets. Chacun a son équipe, ses IA, son chemin jusqu’au sommet et ses outils.' },
  { part: 'day', go: 'home', at: { pc: '[data-tour="quick"]', tel: null }, pose: 'presente', t: 'Créer',
    x: "Une tâche, un projet, une invitation par lien : tout se crée d'ici." },
  { part: 'day', go: 'home', at: { pc: '[data-nav="messages"]', tel: '[data-bnav="messages"]' }, pose: 'pointe', t: 'Messages',
    x: 'Les messages privés, à deux, avec les personnes de vos projets.' },
  { part: 'day', go: 'home', at: { pc: '#bell-btn', tel: '#bell-btn' }, pose: 'explique', t: 'La cloche',
    x: "Mentions, tâches confiées, votes… et les demandes d'utilisation de votre IA, que vous acceptez ou refusez." },
  { part: 'day', go: 'home', at: { pc: '[data-tour="search"]', tel: '#search-btn' }, pose: 'reflechit', t: 'Recherche',
    x: 'Retrouvez un message, une idée, une tâche ou un projet.' },
  { part: 'day', go: 'home', at: { pc: '#me-gear', tel: '[data-bnav="settings"]' }, pose: 'presente', t: 'Vos IA et vos réglages',
    x: 'Branchez votre IA (Claude, ChatGPT…) avec votre abonnement, et réglez vos notifications, même quand l’app est fermée.' },

  { part: 'project', go: 'p:projet', at: { pc: '#camp-land', tel: '#camp-land' }, pose: 'explique', t: 'Le chemin jusqu’au sommet',
    x: 'Le drapeau en haut, c’est l’objectif du projet. Chaque point est une étape ; une étape franchie devient une tente. Le point orange « Vous êtes ici » montre où en est l’équipe.' },
  { part: 'project', go: 'p:projet', at: { pc: '#camp-todo', tel: '#camp-todo' }, pose: 'pointe', t: 'Votre prochain pas',
    x: 'Les tâches qui vous sont confiées dans ce projet, la plus urgente d’abord. Cochez-les quand c’est fait, ou reportez-les.' },
  { part: 'project', go: 'p:projet', at: { pc: '#camp-doors', tel: '#camp-doors' }, pose: 'montre', t: 'Le reste du Camp de base',
    x: '« Pendant votre absence » résume ce que vous avez manqué. « À décider » rassemble les votes, « Idées » les idées de l’équipe, et « Le chemin » sert à ajouter ou modifier les étapes.' },
  { part: 'project', go: 'p:discussion', at: { pc: '.tabs a[href$="/discussion"]', tel: '[data-pnav="discussion"]' }, pose: 'pointe', t: 'Discussion',
    x: 'Des salons pour parler entre humains, et l’Atelier IA, le seul endroit où les IA écrivent : tapez @claude ou @chatgpt pour demander de l’aide à l’IA d’un membre.' },
  { part: 'project', go: 'p:taches', at: { pc: '.tabs a[href$="/taches"]', tel: '[data-pnav="taches"]' }, pose: 'explique', t: 'Tâches',
    x: 'Qui fait quoi, et pour quand. Quatre façons de voir : Tableau, Liste, Calendrier et Par personne. Faites glisser une tâche pour changer son état ou sa date.' },
  { part: 'project', go: { pc: 'p:tout', tel: 'p:projet' }, at: { pc: '.tabs a[href$="/tout"]', tel: '#proj-more' }, pose: 'reflechit', t: 'Tout le projet',
    x: 'La mémoire du projet : le chemin complet, les idées et les décisions. On y soumet une décision au vote et on garde la trace de ce qui a été choisi.',
    xTel: 'La mémoire du projet, dans ce menu ⋯ : le chemin complet, les idées et les décisions. On y soumet une décision au vote et on garde la trace de ce qui a été choisi.' },
  { part: 'project', go: 'p:documents', at: { pc: '.tabs a[href$="/documents"]', tel: '[data-pnav="documents"]' }, pose: 'montre', t: 'Documents',
    x: 'Tous les fichiers du projet, rangés en dossiers. Glissez un fichier pour l’ajouter (50 Mo maximum) ; les anciennes versions sont gardées, et les IA peuvent aussi y déposer des documents.' },
  { part: 'project', go: 'p:equipe', at: { pc: '.tabs a[href$="/equipe"]', tel: '[data-pnav="equipe"]' }, pose: 'bras-ouverts', t: 'Équipe',
    x: 'Les membres et leur statut. Invitez quelqu’un par lien, réglez les notifications de ce projet, et « Préparer pour mon IA » met votre IA au travail sur ce projet.' },

  { part: 'end', go: 'p:projet', at: null, pose: 'salue', t: 'Vous êtes prêt !',
    x: 'Commencez par votre prochain pas, ou par la Discussion. Pour revoir cette visite : Paramètres → Accompagnement.' }
];

const PARTS = { day: 'Votre journée', project: 'Dans un projet', end: 'Bonne ascension' };

const visibleZone = (sel) => {
  const el = sel && $(sel);
  const r = el?.getBoundingClientRect();
  return r && r.width && r.height ? el : null;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Lance la visite guidée. `pid` = projet à visiter (sinon celui qui est ouvert, sinon le premier) ;
 * `then` est appelé à la fin (terminée ou passée).
 */
B.startTour = ({ then, pid } = {}) => {
  const tour = $('#tour');
  const phone = B.isPhone();
  const dev = phone ? 'tel' : 'pc';
  pid = pid || B.whereInProject()?.pid || B.projects[0]?.id;
  if (pid && !B.project(pid)) pid = B.projects[0]?.id;
  const pick = (v) => (v && typeof v === 'object' ? v[dev] : v);
  const steps = TOUR.filter((s) => (s.at === null || pick(s.at))
    && (pid || !String(pick(s.go)).startsWith('p:')));
  if (!pid) steps[steps.length - 1] = { ...steps[steps.length - 1], go: 'home',
    x: 'Créez votre premier projet avec « Créer », ou rejoignez celui d’un proche grâce à son lien d’invitation. Pour revoir cette visite : Paramètres → Accompagnement.' };

  POSES.forEach((p) => { new Image().src = poseSrc(p); });
  let cur = -1, target = null, alive = true;
  const end = () => {
    alive = false;
    tour.classList.add('hidden');
    tour.innerHTML = '';
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', place);
    document.removeEventListener('scroll', place, true);
    then?.();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') end();
    else if (e.key === 'ArrowRight') $('[data-next]', tour)?.click();
    else if (e.key === 'ArrowLeft') $('[data-prev]', tour)?.click();
  };
  document.addEventListener('keydown', onKey);

  // Place le trou de lumière sur la zone, puis le duo « guide + bulle » : TOUJOURS dans un coin du bas de l'écran
  // (le guide debout, la bulle à côté de lui, pointe vers lui), dans le coin qui ne cache pas la zone ; sinon en haut.
  // Le duo ne saute pas d'un bout à l'autre de l'écran : seule la zone éclairée change à chaque étape.
  function place() {
    const tip = $('.tour-tip', tour), hole = $('.tour-hole', tour), g = $('.tour-guide', tour);
    if (!tip) return;
    const W = window.innerWidth, H = window.innerHeight;
    const r = target?.isConnected ? target.getBoundingClientRect() : null;
    hole.classList.toggle('hidden', !r);
    if (r) Object.assign(hole.style, { top: `${r.top - 6}px`, left: `${r.left - 6}px`, width: `${r.width + 12}px`, height: `${r.height + 12}px` });
    const m = phone ? 8 : 24;                                        // marge au bord de l'écran
    const gh = phone ? Math.min(150, Math.round(H * 0.2)) : Math.min(300, Math.round(H * 0.4)), gw = Math.round(gh * RATIO);
    const w = phone ? W - 2 * m - gw + 4 : Math.min(360, W - 2 * m - gw);
    tip.style.width = `${w}px`;
    const h = tip.offsetHeight;
    const boxH = Math.max(gh, h);
    // coins essayés : bas-gauche, bas-droite, haut-gauche, haut-droite (sur téléphone : bas puis haut)
    const corners = phone ? [['bottom', 'left'], ['top', 'left']]
      : [['bottom', 'left'], ['bottom', 'right'], ['top', 'right'], ['top', 'left']];
    const box = ([v, hz]) => {
      const bw = gw - 4 + w, x = hz === 'left' ? m : W - m - bw, y = v === 'bottom' ? H - m - boxH : (phone ? m : 70);
      return { v, hz, x, y, w: bw, h: boxH };
    };
    const clear = (b) => !r || b.x + b.w <= r.left - 8 || b.x >= r.right + 8 || b.y + b.h <= r.top - 8 || b.y >= r.bottom + 8;
    const spot = corners.map(box).find(clear) || box(corners[0]);
    const left = spot.hz === 'left';
    // le guide debout (pieds en bas du duo), la bulle à côté de lui, à hauteur de son visage / de ses mains
    const gx = left ? spot.x : spot.x + spot.w - gw, gy = spot.y + boxH - gh;
    const tx = left ? spot.x + gw - 4 : spot.x, ty = phone ? spot.y + boxH - h : Math.max(spot.y, gy + Math.round(gh * 0.12));
    Object.assign(tip.style, { left: `${Math.round(tx)}px`, top: `${Math.round(Math.min(ty, H - m - h))}px` });
    tip.classList.toggle('tail-left', left);
    tip.classList.toggle('tail-right', !left);
    if (g) {
      g.classList.toggle('hidden', false);
      g.classList.toggle('flip', !left !== faceLeft(g)); // tourné vers la bulle
      Object.assign(g.style, { left: `${Math.round(gx)}px`, top: `${Math.round(gy)}px`, width: `${gw}px`, height: `${gh}px` });
    }
  }
  window.addEventListener('resize', place);
  document.addEventListener('scroll', place, true);

  const show = async (i, dir = 1) => {
    const step = steps[i];
    if (!alive) return;
    if (!step) return end();
    cur = i;
    // 1) la bonne page
    const go = pick(step.go);
    const want = go === 'home' ? '#/home' : `#/p/${pid}/${go.slice(2)}`;
    if (location.hash !== want) {
      location.hash = want;
      await wait(450);
    }
    // 2) la zone (la page peut mettre un moment à s'afficher)
    const sel = step.at && pick(step.at);
    target = null;
    if (sel) {
      for (let k = 0; k < 30 && alive && !(target = visibleZone(sel)); k++) await wait(100);
      if (!alive || cur !== i) return;
      if (!target) return show(i + dir, dir); // zone absente : étape sautée
      target.scrollIntoView({ block: 'center', inline: 'nearest' });
      await wait(60);
    }
    if (!alive || cur !== i) return;
    const last = i === steps.length - 1;
    const text = phone && step.xTel ? step.xTel : step.x;
    tour.innerHTML = `
      <div class="tour-hole ${target ? '' : 'hidden'}"></div>
      <div class="tour-shade ${target ? 'hidden' : ''}"></div>
      <div class="tour-guide hidden" aria-hidden="true">${guideImg(step.pose)}</div>
      <div class="tour-tip ${phone ? 'sheet' : ''}" role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-live="polite">
        <small>${esc(tr(PARTS[step.part]))} · ${i + 1} / ${steps.length}</small>
        <div class="tour-bar" aria-hidden="true"><i style="width:${Math.round(((i + 1) / steps.length) * 100)}%"></i></div>
        <h3 id="tour-title">${esc(tr(step.t))}</h3><p>${esc(tr(text))}</p>
        <div class="actions"><button class="btn small" data-end>${last ? tr('Fermer') : tr('Quitter la visite')}</button><span class="spacer"></span>
          ${i ? `<button class="btn small" data-prev>${tr('Retour')}</button>` : ''}
          <button class="btn small primary" data-next>${last ? tr('Terminer') : tr('Suivant')}</button></div>
      </div>`;
    tour.classList.remove('hidden');
    place();
    setTimeout(() => alive && cur === i && place(), 400); // la page a pu bouger (paysage dessiné, images)
    $('[data-end]', tour).onclick = end;
    $('[data-prev]', tour)?.addEventListener('click', () => show(i - 1, -1));
    $('[data-next]', tour).onclick = () => (last ? end() : show(i + 1, 1));
    $('[data-next]', tour).focus({ preventScroll: true });
  };
  show(0);
};
