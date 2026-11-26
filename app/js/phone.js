// =====================================================================
// phone.js — navigation sur téléphone en 3 niveaux (refonte téléphone, 16/11/2026)
//   1. L'appli : barre du bas Aujourd'hui · Projets · Messages · Moi (#bottom-nav).
//   2. Dans un projet : la barre du bas devient celle du projet, Camp · Discussion · Tâches · Documents ·
//      Équipe (#project-nav) ; l'en-tête du projet tient sur une ligne (← nom ⋯), sans barre du haut.
//   3. Plein écran, sans barre : une conversation (salon ou Atelier) et « Pendant votre absence ».
// Plus de menu ☰ ni de barre de recherche fixe (une loupe). « En vocal » : une pastille au-dessus de la barre.
// Tout est piloté par des classes sur <body> : in-project, phone-full, search-open (styles.css, fin du fichier).
// Sur ordinateur, ces barres sont cachées : rien ne change.
// =====================================================================

B.isPhone = () => window.matchMedia('(max-width: 760px)').matches;

const PROJECT_TABS = [
  ['projet', 'compass', 'Camp'],
  ['discussion', 'chat', 'Discussion'],
  ['taches', 'checksq', 'Tâches'],
  ['documents', 'file', 'Documents'],
  ['equipe', 'users', 'Équipe']
];

/** Où suis-je ? { pid, tab, sub } si un projet est ouvert */
B.whereInProject = () => {
  const m = (location.hash || '').match(/^#\/p\/([^/]+)(?:\/([^/]+))?(?:\/([^/]+))?/);
  if (!m) return null;
  let tab = m[2] || 'projet';
  if (tab === 'atelier') tab = 'discussion';
  if (tab === 'calendrier') tab = 'taches';
  return { pid: m[1], tab, raw: m[2] || 'projet', sub: m[3] || null };
};

let lastNavHash = null;
/** Barre du bas et mode plein écran, à chaque changement de page (et au redimensionnement) */
B.renderPhoneNav = () => {
  const at = B.whereInProject();
  const project = at && B.project(at.pid);
  // Plein écran : une conversation ouverte, ou « Pendant votre absence »
  const full = Boolean(project && ((at.raw === 'discussion' && at.sub) || at.raw === 'atelier' || (at.raw === 'projet' && at.sub === 'absence')));
  document.body.classList.toggle('in-project', Boolean(project));
  document.body.classList.toggle('phone-full', full);
  // Sous-page du Camp de base (chemin, à décider…) : son propre en-tête « ← titre » remplace celui du projet
  document.body.classList.toggle('in-sub', Boolean(project && at.raw === 'projet' && at.sub && at.sub !== 'absence'));
  // Recherche ouverte : refermée seulement quand on CHANGE de page. Pas au redimensionnement : sur téléphone, le clavier
  // qui s'ouvre réduit la fenêtre (événement resize), et la refermer ici fermait aussitôt le clavier (bug du 26/11, Apo).
  if (lastNavHash !== location.hash) {
    lastNavHash = location.hash;
    document.body.classList.remove('search-open');
    $('#search-btn')?.setAttribute('aria-expanded', 'false');
  }

  const nav = $('#project-nav');
  if (!nav) return;
  if (!project) { nav.innerHTML = ''; return; }
  nav.innerHTML = PROJECT_TABS.map(([id, ic, label]) => {
    const on = at.tab === id;
    return `<a href="#/p/${project.id}/${id}" data-pnav="${id}" class="${on ? 'active' : ''}" ${on ? 'aria-current="page"' : ''}>
      <span class="bnav-ico">${icon(ic, 22)}</span><span>${tr(label)}</span>
      ${id === 'discussion' ? `<span class="badge-count hidden" data-unread="tab:${project.id}"></span>` : ''}</a>`;
  }).join('');
  B.paintUnread?.(nav);
};

// La loupe : ouvre la recherche par-dessus la barre du haut
$('#search-btn')?.addEventListener('click', () => {
  const open = !document.body.classList.contains('search-open');
  document.body.classList.toggle('search-open', open);
  $('#search-btn').setAttribute('aria-expanded', String(open));
  // Focus DANS le geste (pas après une attente) : sinon iPhone et certains Android n'ouvrent pas le clavier
  if (open) $('#search-input')?.focus();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.body.classList.contains('search-open')) {
    document.body.classList.remove('search-open');
    $('#search-btn')?.setAttribute('aria-expanded', 'false');
  }
});
window.addEventListener('resize', debounce(() => B.renderPhoneNav(), 200));

/** « En vocal » sur téléphone : une pastille au-dessus de la barre du bas, avec micro et raccrocher */
B.renderVoicePill = () => {
  const pill = $('#voice-pill');
  if (!pill) return;
  const v = B.voice;
  if (!v) { pill.classList.add('hidden'); pill.innerHTML = ''; return; }
  pill.classList.remove('hidden');
  pill.innerHTML = `
    <a class="voice-pill-where" href="#/p/${v.project.id}/discussion/${v.channel.id}">
      <span class="voice-pill-dot ${v.connecting ? '' : 'ok'}" aria-hidden="true"></span>
      <span><strong>${v.connecting ? tr('Connexion…') : tr('En vocal')}</strong> <span translate="no">#${esc(v.channel.name)}</span></span>
    </a>
    <button class="icon-btn ${v.muted || v.deafened ? 'off' : ''}" data-voice="mute" aria-label="${v.muted ? tr('Réactiver le micro') : tr('Couper le micro')}">${icon(v.muted || v.deafened ? 'micoff' : 'mic', 18)}</button>
    <button class="icon-btn leave" data-voice="leave" aria-label="${tr('Quitter le vocal')}">${icon('hangup', 18)}</button>`;
};
B.on('voice', () => B.renderVoicePill());

/** Menu « ⋯ » de l'en-tête du projet (téléphone) */
B.projectMoreMenu = (anchor, pid) => {
  const r = anchor.getBoundingClientRect();
  const m = B.popMenu(Math.max(8, r.right - 250), r.bottom + 6, `
    <a class="pop-item" href="#/p/${pid}/projet/absence">${icon('spark', 16)}<span>${tr('Pendant votre absence')}</span></a>
    ${B.canInvite(pid) ? `<button class="pop-item" data-m="invite">${icon('userplus', 16)}<span>${tr('Inviter')}</span></button>` : ''}
    <a class="pop-item" href="#/p/${pid}/projet/tout">${icon('list', 16)}<span>${tr('Tout le projet')}</span></a>`);
  $('[data-m="invite"]', m)?.addEventListener('click', () => { B.closePopMenu(); B.openInvite(pid); });
  $$('a.pop-item', m).forEach((a) => a.addEventListener('click', () => B.closePopMenu()));
  $('.pop-item', m)?.focus();
};
