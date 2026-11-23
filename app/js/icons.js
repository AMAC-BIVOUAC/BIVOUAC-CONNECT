// =====================================================================
// icons.js — icônes au trait (dessinées pour Bivouac, 24×24)
// Utilisation : icon('home')  ou  <i data-icon="home"></i> puis paintIcons()
// =====================================================================

const ICONS = {
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
  folder: '<path d="M3 6h6l2 2h10v11H3z"/>',
  bell: '<path d="M6 16V11a6 6 0 0112 0v5l2 2H4z"/><path d="M10 20a2 2 0 004 0"/>',
  // Paramètres = couteau suisse (manche + lame ouverte + croix), demande d'Apo du 23/11
  settings: '<rect x="2.5" y="12" width="19" height="7.5" rx="3.75"/><path d="M6 12L19.5 3.5c-1 4-3.8 7-7.5 8.5"/><path d="M15.5 14v3.5M13.75 15.75h3.5"/><path d="M6.25 15.75h.01"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  whisper: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8.5 10.5h.01M12 10.5h.01M15.5 10.5h.01" stroke-width="2.4"/>',
  spark: '<path d="M12 3c.6 4.5 2.5 6.4 7 7-4.5.6-6.4 2.5-7 7-.6-4.5-2.5-6.4-7-7 4.5-.6 6.4-2.5 7-7z"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.5-4 3-6 6.5-6s6 2 6.5 6"/><path d="M16 4.5a3.5 3.5 0 010 7M18 14c2 .6 3.3 2.6 3.5 6"/>',
  userplus: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.5-4 3-6 6.5-6s6 2 6.5 6"/><path d="M19 8v6M16 11h6"/>',
  bot: '<rect x="4" y="8" width="16" height="11" rx="3"/><path d="M12 4v4M9 13h.01M15 13h.01"/><circle cx="12" cy="3.5" r="1"/>',
  doublecheck: '<path d="M2.5 12.5l4.5 4.5L17 7M12 16l2 2 8-10"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  checksq: '<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M8 12.5l3 3 5-6"/>',
  file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M4 18l5-5 4 4 3-3 4 4"/>',
  clip: '<path d="M20 11l-8 8a5 5 0 01-7-7l8-8a3.5 3.5 0 015 5l-8 8a2 2 0 01-3-3l7-7"/>',
  send: '<path d="M4 12l16-8-6 16-2-7z"/>',
  bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0012 3z"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".8"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  route: '<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h7a3 3 0 000-6H9a3 3 0 010-6h7"/>',
  decision: '<circle cx="12" cy="12" r="8.5"/><path d="M8 12.5l3 3 5-6"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>',
  kanban: '<rect x="3.5" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="10" rx="1.5"/><rect x="16.5" y="4" width="4" height="13" rx="1.5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  logout: '<path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10"/>',
  smile: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 14c1 1.3 2.1 2 3.5 2s2.5-.7 3.5-2M9 9.5h.01M15 9.5h.01"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  pin: '<path d="M9 3h6l-1 6 3 3v2H7v-2l3-3z"/><path d="M12 14v7"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M15 8l2 2"/>',
  compass: '<circle cx="12" cy="12" r="8.5"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
  rocket: '<path d="M12 15l-3-3c1-4 4-8 10-8 0 6-4 9-8 10z"/><path d="M9 12l-4 1 2-4h3M12 15l-1 4 4-2v-3M6 18l-2 2"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  up: '<path d="M6 15l6-6 6 6"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3"/>',
  hash: '<path d="M9 4L7 20M17 4l-2 16M4 9h16M3 15h16"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  at: '<circle cx="12" cy="12" r="4"/><path d="M16 12v1.5a2.5 2.5 0 005 0V12a9 9 0 10-3.5 7.1"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3"/>',
  expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  shrink: '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>',
  popout: '<rect x="3" y="5" width="18" height="14" rx="2"/><rect x="12" y="11" width="7" height="6" rx="1"/>',
  dock: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M14 4v16"/>',
  screen: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  screenoff: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4M3 3l18 18"/>',
  videooff: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3M3 3l18 18"/>',
  micoff: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3M3 3l18 18"/>',
  headphones: '<path d="M4 15v-3a8 8 0 0116 0v3"/><rect x="3" y="14" width="4" height="7" rx="1.5"/><rect x="17" y="14" width="4" height="7" rx="1.5"/>',
  headoff: '<path d="M4 15v-3a8 8 0 0116 0v3"/><rect x="3" y="14" width="4" height="7" rx="1.5"/><rect x="17" y="14" width="4" height="7" rx="1.5"/><path d="M3 3l18 18"/>',
  volume: '<path d="M4 10h4l5-4v12l-5-4H4z"/><path d="M16.5 9a4 4 0 010 6M19 6.5a8 8 0 010 11"/>',
  volumeoff: '<path d="M4 10h4l5-4v12l-5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
  hangup: '<path d="M3 15c5-4 13-4 18 0l-2 3-4-1v-2a10 10 0 00-6 0v2l-4 1z"/>',
  // Icônes de projet (thème bivouac / montagne, demande d'Apo du 23/11)
  tent: '<path d="M2.5 20.5h19M4 20.5L12 4l8 16.5"/><path d="M12 12.5l-3 8M12 12.5l3 8"/>',
  mountain: '<path d="M2 20l7-13.5 4.6 7.6 2.6-3.6L22 20z"/><path d="M6.3 12.2l1.7 1 1.5-1.2 1.6 1"/>',
  campfire: '<path d="M12 3.5c.8 2.6 3.8 4 3.8 7.4a3.8 3.8 0 01-7.6 0c0-1.8.9-3 2-3.9-.1 1.5.6 2.5 1.6 2.6-.4-2.2-.3-4.2.2-6.1z"/><path d="M4 21l16-4.5M20 21L4 16.5"/>',
  map: '<path d="M3 6.5l6-2.5 6 2.5 6-2.5v13.5l-6 2.5-6-2.5-6 2.5z"/><path d="M9 4v13.5M15 6.5V20"/>',
  backpack: '<path d="M6 21v-9.5a6 6 0 0112 0V21z"/><path d="M10 5.7V3.5h4v2.2M9 21v-5h6v5M6 13h12"/>',
  tree: '<path d="M12 2.5l-5 7h3l-4.5 6.5h13L14 9.5h3z"/><path d="M12 16v5"/>',
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V4.5h6V7M3 12.5h18M11 12.5v2h2v-2"/>',
  book: '<path d="M12 6.5C10 5 7 4.5 3.5 5v13.5c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5c-3.5-.5-6.5 0-8.5 1.5zM12 6.5V20"/>',
  heart: '<path d="M12 20s-7.4-4.5-8.4-9.4C2.9 7.1 5 4.5 7.8 4.5c1.8 0 3.2 1 4.2 2.5 1-1.5 2.4-2.5 4.2-2.5 2.8 0 4.9 2.6 4.2 6.1-1 4.9-8.4 9.4-8.4 9.4z"/>',
  gift: '<rect x="3.5" y="8" width="17" height="4" rx="1"/><path d="M5 12v8h14v-8M12 8v12M12 8c-1.5-3-5-4-5-1.5S10 8 12 8zM12 8c1.5-3 5-4 5-1.5S14 8 12 8z"/>'
};

/** Icônes qu'on peut choisir pour un projet (Équipe → Réglages du projet). 'users' = ancienne icône, par défaut.
 *  Ajouter une icône : la dessiner dans ICONS, l'ajouter ici (la base n'accepte qu'un nom en minuscules, migration 037). */
const PROJECT_ICONS = [
  ['users', 'Équipe'], ['tent', 'Tente'], ['mountain', 'Montagne'], ['campfire', 'Feu de camp'],
  ['compass', 'Boussole'], ['map', 'Carte'], ['backpack', 'Sac à dos'], ['tree', 'Sapin'],
  ['flag', 'Sommet'], ['star', 'Étoile'], ['rocket', 'Lancement'], ['bulb', 'Idée'],
  ['briefcase', 'Travail'], ['book', 'Études'], ['heart', 'Cœur'], ['gift', 'Fête']
];

/** Icône d'un projet (repli sur 'users' si la valeur est inconnue, par exemple ajoutée par une version plus récente) */
function projectIcon(p, size = 18) {
  const name = PROJECT_ICONS.some(([k]) => k === p?.icon) ? p.icon : 'users';
  return icon(name, size);
}

function icon(name, size = 18) {
  return `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

/** Remplace les <i data-icon="…"> d'un bloc par les icônes */
function paintIcons(root = document) {
  $$('i[data-icon]', root).forEach((el) => {
    el.outerHTML = icon(el.dataset.icon, Number(el.dataset.size) || 18);
  });
}
