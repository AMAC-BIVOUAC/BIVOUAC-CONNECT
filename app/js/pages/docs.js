// =====================================================================
// Documents — tous les fichiers du projet (joints aux messages ou déposés ici), rangés en dossiers
// (migration 022 : create_folder / rename_folder / move_folder / delete_folder / move_file).
// Un clic ouvre le document dans le logiciel du PC ; quand on l'enregistre, la nouvelle
// version part toute seule dans le projet (core.js). Les anciennes restent dans « Versions ».
// 22/11 (Amaury) : affichage en liste ou en icônes (réglage de ce poste), filtre par type et recherche par nom
// (la recherche et le filtre regardent TOUS les dossiers ; le dossier de chaque résultat est indiqué).
// 23/11 (Apo, v0.8.57) : miniature des images dans la liste et les icônes (file_thumbs, migration 041 : quelques Ko,
// jamais la photo entière) et visionneuse en grand au clic (l'image entière n'est téléchargée qu'à ce moment-là).
// 25/11 (Apo) : icône « Télécharger » sur chaque document (dernière version, B.downloadFile) et sur chaque dossier
// (un .zip de tout son contenu, sous-dossiers compris, fabriqué dans l'appareil par B.makeZip ; 500 Mo au plus).
// 25/11 (Apo, v0.8.80, migration 047) : « Journal » (Créateur et Administrateurs seulement) = qui a ajouté, modifié,
// renommé, déplacé ou supprimé quel document ou dossier, où et quand. Écrit par la base seule (doc_journal) : B.openDocJournal.
// 26/11 (Apo, v0.8.87, migration 052) : les fichiers partagés dans un salon (files.channel_id, posé par la base) ne sont
// plus dans Documents. Ils s'ouvrent depuis l'icône de l'en-tête du salon (B.openChannelFiles), avec la MÊME vue :
// B.pages.docs(el, p, { channel }) = recherche, type, tri, liste / icônes, aperçu des images, sans dossiers ni dépôt.
// Tri (« Plus récents », « Plus anciens », « Nom », « Taille ») : le même dans les deux, retenu sur l'appareil.
// « Ranger dans Documents » (file_to_documents) : le fichier va dans le dossier du salon (« Salon <nom> »), créé au 1er rangement.
// =====================================================================

/** Types de documents pour le filtre : [clé, libellé] */
const DOC_KINDS = [['all', 'Tous les types'], ['image', 'Images'], ['pdf', 'PDF'], ['text', 'Textes et Word'],
  ['sheet', 'Tableurs'], ['slides', 'Présentations'], ['media', 'Vidéos et sons'], ['archive', 'Archives'], ['other', 'Autres']];
/** Tris de la liste (Documents et fichiers d'un salon) : [clé, libellé, comparaison] */
const docStamp = (f) => f.updated_at || f.created_at || '';
const DOC_SORTS = [
  ['new', 'Plus récents', (a, b) => docStamp(b).localeCompare(docStamp(a))],
  ['old', 'Plus anciens', (a, b) => docStamp(a).localeCompare(docStamp(b))],
  ['name', 'Nom (A → Z)', (a, b) => String(a.name).localeCompare(String(b.name), B.locale(), { numeric: true, sensitivity: 'base' })],
  ['size', 'Taille (plus gros d’abord)', (a, b) => (b.size || 0) - (a.size || 0)]
];
const docExt = (f) => { const m = String(f.name || '').match(/\.([a-z0-9]{1,5})$/i); return m ? m[1].toUpperCase() : ''; };
/** Pour chercher sans tenir compte des majuscules ni des accents */
const fold = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
/** Le type d'un document, d'après son type MIME et son extension */
function docKind(f) {
  const mime = (f.mime || '').toLowerCase(), ext = docExt(f).toLowerCase();
  if (mime.startsWith('image/') || /^(png|jpe?g|gif|webp|svg|heic|bmp)$/.test(ext)) return 'image';
  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (/^(xlsx?|ods|csv|tsv|numbers)$/.test(ext) || /spreadsheet|excel|csv/.test(mime)) return 'sheet';
  if (/^(pptx?|odp|key)$/.test(ext) || /presentation|powerpoint/.test(mime)) return 'slides';
  if (/^(docx?|odt|rtf|txt|md|html?|json|pages)$/.test(ext) || mime.startsWith('text/') || /word|opendocument\.text/.test(mime)) return 'text';
  if (mime.startsWith('video/') || mime.startsWith('audio/') || /^(mp4|mov|avi|mkv|webm|mp3|wav|ogg|m4a|flac)$/.test(ext)) return 'media';
  if (/^(zip|rar|7z|tar|gz)$/.test(ext) || /zip|compressed|x-tar/.test(mime)) return 'archive';
  return 'other';
}

/** Taille maximale d'un dossier téléchargé en zip (tout est assemblé dans la mémoire de l'appareil) */
const ZIP_MAX_MB = 500;
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
const crc32 = (buf) => { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
/** Fabrique un .zip (sans compression : documents, images et vidéos sont déjà compressés) à partir de
 *  [{ name: 'sous-dossier/nom.ext', data: Uint8Array, date }]. Noms en UTF-8 ; un même nom reçoit « (2) », « (3)… ».
 *  Aucune bibliothèque : le format zip « stocké » tient en quelques lignes. */
B.makeZip = (entries) => {
  const enc = new TextEncoder(), parts = [], central = [], used = new Set();
  let offset = 0;
  for (const e of entries) {
    let name = String(e.name).replace(/\\/g, '/').replace(/^\/+/, '');
    if (used.has(name.toLowerCase())) {
      const m = name.match(/^(.*?)(\.[^./]*)?$/);
      for (let n = 2; ; n++) { const alt = `${m[1]} (${n})${m[2] || ''}`; if (!used.has(alt.toLowerCase())) { name = alt; break; } }
    }
    used.add(name.toLowerCase());
    const fname = enc.encode(name), data = e.data, crc = crc32(data);
    const d = e.date instanceof Date && !isNaN(e.date) ? e.date : new Date();
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const day = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true);
    local.setUint16(8, 0, true); local.setUint16(10, time, true); local.setUint16(12, day, true);
    local.setUint32(14, crc, true); local.setUint32(18, data.length, true); local.setUint32(22, data.length, true);
    local.setUint16(26, fname.length, true); local.setUint16(28, 0, true);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true);
    cen.setUint16(10, 0, true); cen.setUint16(12, time, true); cen.setUint16(14, day, true);
    cen.setUint32(16, crc, true); cen.setUint32(20, data.length, true); cen.setUint32(24, data.length, true);
    cen.setUint16(28, fname.length, true); cen.setUint32(42, offset, true);
    parts.push(local, fname, data);
    central.push(cen, fname);
    offset += 30 + fname.length + data.length;
  }
  const size = central.reduce((n, x) => n + x.byteLength, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
  end.setUint32(12, size, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end], { type: 'application/zip' });
};

B.pages.docs = async (el, p, { channel = null } = {}) => {
  const inChan = Boolean(channel); // fichiers partagés dans un salon : même vue, sans dossiers ni dépôt
  const sortKey = inChan ? 'chan-files-sort' : 'docs-sort';
  el.innerHTML = `
    <div class="docs${inChan ? ' chan-files' : ''}">
      ${inChan ? '' : `<div class="drop-zone">
        ${icon('download', 26).replace('<svg', '<svg style="transform:rotate(180deg)"')}
        <p><strong>${tr('Déposez des fichiers ici')}</strong> ${tr('ou')} <button class="link" id="pick">${tr('parcourez')}</button></p>
        <p class="muted small">${tr('{max} Mo maximum par fichier.', { max: B.MAX_FILE_MB })}</p>
        <input type="file" id="doc-input" class="hidden" multiple />
      </div>
      <button class="btn primary docs-add" id="pick-phone">${icon('plus', 18)} ${tr('Ajouter un fichier')}</button>
      <p class="muted small docs-hint">${icon('edit', 14)} ${window.BIVOUAC_WEB
        // version web et téléphone : pas de modification sur place (web.js), le document s'ouvre ou se télécharge
        ? tr('Touchez un document pour l’ouvrir ou le télécharger ; les anciennes versions restent dans « Versions ».')
        : tr('Cliquez sur un document pour l\'ouvrir dans le logiciel de votre PC (Word, Excel…). Quand vous l\'enregistrez, la nouvelle version est envoyée toute seule au projet ; les précédentes restent dans « Versions ».')} ${tr('Les images s\'ouvrent d\'abord en aperçu.')}</p>
      <section class="notes-strip" aria-label="${tr('Notes du projet')}"></section>`}
      <div class="docs-tools">
        <label class="docs-search">${icon('search', 16)}<span class="sr-only">${tr('Rechercher un document')}</span>
          <input type="search" id="doc-q" placeholder="${tr('Rechercher un document…')}" autocomplete="off" /></label>
        <label class="sr-only" for="doc-type">${tr('Type de document')}</label>
        <select id="doc-type" class="pill-select">${DOC_KINDS.map(([k, label]) => `<option value="${k}">${tr(label)}</option>`).join('')}</select>
        <label class="sr-only" for="doc-sort">${tr('Trier par')}</label>
        <select id="doc-sort" class="pill-select" title="${tr('Trier par')}">${DOC_SORTS.map(([k, label]) => `<option value="${k}">${tr(label)}</option>`).join('')}</select>
        <div class="seg doc-views" role="group" aria-label="${tr('Affichage')}">
          <button data-view="list" title="${tr('Liste')}" aria-label="${tr('Liste')}">${icon('list', 16)}</button>
          <button data-view="grid" title="${tr('Icônes')}" aria-label="${tr('Icônes')}">${icon('kanban', 16)}</button>
        </div>
      </div>
      ${inChan ? '' : `<div class="docs-bar">
        <nav class="crumbs" aria-label="${tr('Dossiers')}"></nav>
        <span class="docs-bar-actions">
          <button class="link small docs-trash-btn" id="doc-trash" title="${tr('Documents supprimés depuis moins de 30 jours : on peut les récupérer')}">${icon('trash', 15)} ${tr('Corbeille')}</button>
          ${B.isManager(p.id) ? `<button class="link small docs-journal-btn" id="doc-journal" title="${tr('Qui a ajouté, modifié, déplacé ou supprimé quoi, et quand (visible du Créateur et des Administrateurs)')}">${icon('clock', 15)} ${tr('Journal')}</button>` : ''}
          <button class="btn small" id="new-folder">${icon('folder', 16)} ${tr('Nouveau dossier')}</button>
        </span>
      </div>`}
      <div class="card doc-view"></div>
    </div>`;

  let files = [];
  let folders = [];
  let query = '';
  let kind = 'all';
  let sort = DOC_SORTS.some(([k]) => k === store.get(sortKey, 'new')) ? store.get(sortKey, 'new') : 'new';
  let view = store.get('docs-view', 'list') === 'grid' ? 'grid' : 'list';
  let cur = inChan ? null : store.get('docs-folder:' + p.id, null); // dossier ouvert (null = racine)
  let here = []; // documents affichés (ordre de l'écran : la visionneuse passe de l'un à l'autre)
  let left = false;
  B.onLeave(() => { left = true; });
  // Miniatures : id → { v: version du document, data } ; demandées une fois par version
  const thumbs = new Map(), asked = new Set(), failed = new Set(), queue = [];
  const fresh = (f) => { const t = thumbs.get(f.id); return t && t.v === (f.version || 1) ? t.data : null; };
  const kids = (id) => folders.filter((d) => (d.parent_id || null) === id).sort((a, b) => a.name.localeCompare(b.name, B.locale()));
  const chain = (id) => { const out = []; let d = folders.find((x) => x.id === id); while (d) { out.unshift(d); d = folders.find((x) => x.id === d.parent_id); } return out; };
  /** Nombre de documents dans un dossier et ses sous-dossiers */
  const count = (id) => files.filter((f) => f.folder_id === id).length + kids(id).reduce((n, d) => n + count(d.id), 0);
  const setCur = (id) => { cur = id; store.set('docs-folder:' + p.id, id); paint(); };

  if (!inChan) B.renderNotesStrip($('.notes-strip', el), p);
  /** Documents = fichiers sans salon (migration 052) ; un salon = ses fichiers */
  const fileQuery = (withChannel = true) => {
    const q = B.sb.from('files').select('*').eq('project_id', p.id);
    if (!withChannel) return q.order('created_at', { ascending: false });
    return (inChan ? q.eq('channel_id', channel.id) : q.is('channel_id', null)).order('created_at', { ascending: false });
  };
  const load = async () => {
    const [fi0, fo] = await Promise.all([fileQuery(), inChan ? { data: [] } : B.sb.from('folders').select('*').eq('project_id', p.id)]);
    let fi = fi0;
    // Migration 052 pas encore passée (quelques instants pendant la mise en ligne) : l'ancienne liste
    if (fi.error && /channel_id/.test(fi.error.message || '')) fi = inChan ? { data: [] } : await fileQuery(false);
    if (fi.error) return B.error(fi.error);
    files = fi.data;
    folders = fo.error ? [] : fo.data; // dossiers absents (migration 022 pas encore passée) : tout à la racine
    if (!inChan) $('#new-folder', el).hidden = !!fo.error;
    paint();
  };

  const folderPath = (id) => chain(id).map((d) => d.name).join(' / ');
  const fileIcon = (f) => icon(docKind(f) === 'image' ? 'image' : 'file', view === 'grid' ? 34 : 18);
  /** Miniature si on l'a, sinon l'icône du type */
  const fileFace = (f) => { const t = fresh(f); return t ? `<img class="doc-thumb" src="${esc(t)}" alt="" />` : fileIcon(f); };
  const fileActions = (f) => inChan ? `
    <button class="icon-btn" data-dl title="${tr('Télécharger')}" aria-label="${tr('Télécharger')}">${icon('download', 16)}</button>
    ${f.message_id ? `<button class="icon-btn" data-jump title="${tr('Voir le message')}" aria-label="${tr('Voir le message')}">${icon('chat', 16)}</button>` : ''}
    ${B.isGuest?.(p.id) ? '' : `<button class="icon-btn" data-to-docs title="${tr('Ranger dans Documents')}" aria-label="${tr('Ranger dans Documents')}">${icon('folder', 16)}</button>`}` : `
    <button class="icon-btn" data-dl title="${tr('Télécharger')}" aria-label="${tr('Télécharger')}">${icon('download', 16)}</button>
    ${(f.version || 1) > 1 ? `<button class="link small" data-versions>${tr('Versions')}</button>` : ''}
    ${folders.length ? `<button class="icon-btn" data-move title="${tr('Ranger dans un dossier')}" aria-label="${tr('Ranger dans un dossier')}">${icon('arrow', 16)}</button>` : ''}
    <button class="icon-btn" data-share title="${tr('Partager par un lien')}" aria-label="${tr('Partager par un lien')}">${icon('link', 16)}</button>
    ${B.canDelete(f.project_id, f.uploader_id) ? `<button class="icon-btn" data-del title="${tr('Mettre à la corbeille')}" aria-label="${tr('Mettre à la corbeille')}">${icon('trash', 16)}</button>` : ''}`;
  const folderActions = () => `
    <button class="icon-btn" data-dl-folder title="${tr('Télécharger le dossier (zip)')}" aria-label="${tr('Télécharger le dossier (zip)')}">${icon('download', 16)}</button>
    <button class="icon-btn" data-rename title="${tr('Renommer')}" aria-label="${tr('Renommer')}">${icon('edit', 16)}</button>
    <button class="icon-btn" data-move-folder title="${tr('Déplacer')}" aria-label="${tr('Déplacer')}">${icon('arrow', 16)}</button>
    <button class="icon-btn" data-del-folder title="${tr('Supprimer le dossier')}" aria-label="${tr('Supprimer le dossier')}">${icon('trash', 16)}</button>`;

  /** Pose la miniature d'un document déjà affiché, sans tout redessiner */
  const showThumb = (f) => $$(`[data-ico="${f.id}"]`, el).forEach((box) => {
    const t = fresh(f);
    if (!t || box.querySelector('img')) return;
    box.classList.add('has-thumb');
    const img = document.createElement('img');
    img.className = 'doc-thumb'; img.alt = ''; img.src = t;
    box.querySelector('svg')?.replaceWith(img);
  });

  /** Miniatures des images affichées : lues dans file_thumbs ; celles qui manquent sont fabriquées une fois pour tous */
  async function loadThumbs(list) {
    const want = list.filter((f) => B.canPreview(f) && !fresh(f) && !asked.has(f.id + ':' + (f.version || 1)));
    if (!want.length) return;
    want.forEach((f) => asked.add(f.id + ':' + (f.version || 1)));
    for (let i = 0; i < want.length; i += 100) {
      const part = want.slice(i, i + 100);
      const { data, error } = await B.sb.from('file_thumbs').select('file_id, version, data').in('file_id', part.map((f) => f.id));
      if (error || left) return; // migration 041 pas encore passée : on garde les icônes
      for (const r of data || []) {
        const f = files.find((x) => x.id === r.file_id);
        if (f && r.version === (f.version || 1)) { thumbs.set(f.id, { v: r.version, data: r.data }); showThumb(f); }
      }
      // Pas encore de miniature (image envoyée par une IA, ou avant la 0.8.57) : on la fabrique une fois pour toute
      // l'équipe, une image à la fois. Sur téléphone, seulement pour les images légères (téléchargées en entier).
      const max = (B.isPhone() ? 4 : 20) * 1024 * 1024;
      part.filter((f) => !fresh(f) && !failed.has(f.id) && (f.size || 0) <= max).forEach((f) => queue.push(f));
    }
    makeMissing();
  }
  let making = false;
  async function makeMissing() {
    if (making) return;
    making = true;
    try {
      while (queue.length && !left) {
        const f = queue.shift();
        if (fresh(f) || failed.has(f.id)) continue;
        try {
          const res = await fetch(await B.fileUrl(f.path));
          if (!res.ok) throw new Error(String(res.status));
          const data = await B.saveThumb(f, await res.blob());
          if (!data) throw new Error('miniature');
          thumbs.set(f.id, { v: f.version || 1, data });
          showThumb(f);
        } catch { failed.add(f.id); }
      }
    } finally { making = false; }
  }

  function paint() {
    if (cur && !folders.some((d) => d.id === cur)) cur = null; // dossier supprimé entre-temps
    $$('.doc-views [data-view]', el).forEach((b) => { b.classList.toggle('on', b.dataset.view === view); b.setAttribute('aria-pressed', b.dataset.view === view); });
    const searching = Boolean(query) || kind !== 'all';
    const path = chain(cur);
    if (!inChan) $('.crumbs', el).innerHTML = [`<button class="crumb" data-go="" data-drop="">${icon('folder', 15)} ${tr('Documents')}</button>`]
      .concat(path.map((d) => `<span class="crumb-sep">›</span><button class="crumb" data-go="${d.id}" data-drop="${d.id}" translate="no">${esc(d.name)}</button>`))
      .join('');
    // Recherche ou filtre : tous les dossiers, sans les dossiers eux-mêmes ; sinon le dossier ouvert
    const q = fold(query);
    const match = (f) => (kind === 'all' || docKind(f) === kind) && (!q || fold(f.name).includes(q));
    const dirs = searching ? [] : kids(cur);
    here = (searching || inChan ? files.filter(match) : files.filter((f) => (f.folder_id || null) === cur))
      .sort(DOC_SORTS.find(([k]) => k === sort)[2]);
    loadThumbs(here);
    const hid = (f) => (f.hidden_at ? ` <span class="hidden-note">${icon('eyeoff', 12)} ${tr('Masqué par l’équipe Bivouac : vous seul le voyez.')}</span>` : '');
    const where = (f) => (searching && f.folder_id ? `<span class="doc-where" translate="no">${icon('folder', 12)} ${esc(folderPath(f.folder_id))}</span>` : '');
    const empty = searching ? tr('Aucun document ne correspond.')
      : inChan ? tr('Aucun fichier partagé dans ce salon pour l’instant.')
      : cur ? tr('Ce dossier est vide. Déposez des fichiers ici ou rangez-y des documents.') : tr("Aucun document pour l'instant.");
    const found = searching ? `<p class="muted small doc-found">${tr(here.length > 1 ? '{n} documents trouvés' : '{n} document trouvé', { n: here.length })}
      <button class="link small" data-clear>${tr('Tout afficher')}</button></p>` : '';
    const box = $('.doc-view', el);
    box.classList.toggle('grid', view === 'grid');
    if (view === 'grid') {
      box.innerHTML = found + (dirs.length + here.length ? `<div class="doc-grid">${dirs.map((d) => {
        const n = count(d.id);
        return `<div class="doc-card folder-card" data-folder="${d.id}" data-drop="${d.id}">
          <button class="doc-card-main" data-go="${d.id}"><span class="doc-card-ico">${icon('folder', 34)}</span>
            <b translate="no">${esc(d.name)}</b><span class="muted small">${tr(n > 1 ? '{n} documents' : '{n} document', { n })}</span></button>
          <div class="doc-card-actions">${folderActions()}</div></div>`;
      }).join('')}${here.map((f) => `<div class="doc-card" data-id="${f.id}" draggable="${folders.length ? 'true' : 'false'}">
          <button class="doc-card-main file-link"><span class="doc-card-ico k-${docKind(f)}${fresh(f) ? ' has-thumb' : ''}" data-ico="${f.id}">${fileFace(f)}<span class="doc-ext">${esc(docExt(f))}</span></span>
            <b translate="no">${esc(f.name)}</b><span class="muted small">${fmtSize(f.size)} · ${timeAgo(f.updated_at || f.created_at)}${(f.version || 1) > 1 ? ` · v${f.version}` : ''}</span>${where(f)}${hid(f)}</button>
          <div class="doc-card-actions">${fileActions(f)}</div></div>`).join('')}</div>`
        : `<p class="muted doc-empty">${empty}</p>`);
      return;
    }
    const dirRows = dirs.map((d) => {
      const n = count(d.id);
      return `
      <tr data-folder="${d.id}" data-drop="${d.id}" class="folder-row">
        <td><button class="file-link" data-go="${d.id}">${icon('folder', 18)} <span translate="no">${esc(d.name)}</span></button></td>
        <td class="muted small">${tr(n > 1 ? '{n} documents' : '{n} document', { n })}</td>
        <td></td><td></td>
        <td class="doc-actions">${folderActions()}</td>
      </tr>`;
    }).join('');
    const fileRows = here.map((f) => {
      const by = B.person(f.updated_by || f.uploader_id);
      return `
      <tr data-id="${f.id}" draggable="${folders.length ? 'true' : 'false'}">
        <td><button class="file-link"><span class="doc-ico${fresh(f) ? ' has-thumb' : ''}" data-ico="${f.id}">${fileFace(f)}</span> <span translate="no">${esc(f.name)}</span></button>
          ${(f.version || 1) > 1 ? `<span class="version-badge" title="${tr('Version {v}', { v: f.version })}">v${f.version}</span>` : ''}<span class="doc-when-tel">${timeAgo(f.updated_at || f.created_at)}</span>${where(f)}${hid(f)}</td>
        <td>${fmtSize(f.size)}</td>
        <td>${avatar(by, 22)} ${esc(by.display_name)}</td>
        <td>${timeAgo(f.updated_at || f.created_at)}</td>
        <td class="doc-actions">${fileActions(f)}</td>
      </tr>`;
    }).join('');
    box.innerHTML = `${found}<table class="doc-table"><thead><tr><th>${tr('Nom')}</th><th>${tr('Taille')}</th><th>${tr(inChan ? 'Partagé par' : 'Modifié par')}</th><th>${tr('Date')}</th><th></th></tr></thead>
      <tbody>${dirRows + fileRows || `<tr><td colspan="5" class="muted">${empty}</td></tr>`}</tbody></table>`;
  }

  $('#doc-q', el).addEventListener('input', debounce((e) => { query = e.target.value.trim(); paint(); }, 150));
  $('#doc-type', el).onchange = (e) => { kind = e.target.value; paint(); };
  $('#doc-sort', el).value = sort;
  $('#doc-sort', el).onchange = (e) => { sort = e.target.value; store.set(sortKey, sort); paint(); };
  $('.doc-views', el).addEventListener('click', (e) => {
    const b = e.target.closest('[data-view]');
    if (!b) return;
    view = b.dataset.view;
    store.set('docs-view', view);
    paint();
  });

  /** Fenêtre « nom du dossier » ; renvoie le nom saisi, ou null */
  function askName(title, value = '') {
    return new Promise((resolve) => {
      const m = B.modal(`
        <h2>${title}</h2>
        <form id="folder-form">
          <input name="name" maxlength="60" required value="${esc(value)}" placeholder="${tr('Ex. Comptabilité')}" />
          <div class="actions"><button type="button" class="btn" data-close>${tr('Annuler')}</button>
            <button class="btn primary">${tr('Valider')}</button></div>
        </form>`);
      const input = $('input', m);
      input.focus(); input.select();
      $('[data-close]', m).onclick = () => { B.closeModal(); resolve(null); };
      $('#folder-form', m).onsubmit = (e) => {
        e.preventDefault();
        const v = input.value.trim().replace(/[\/\\]+/g, '-');
        B.closeModal(); resolve(v || null);
      };
    });
  }

  /** Fenêtre « Ranger dans… » : arborescence des dossiers ; renvoie l'id choisi ('' = racine), ou undefined */
  function pickFolder(title, exclude = null) {
    const banned = new Set();
    if (exclude) { const walk = (id) => { banned.add(id); kids(id).forEach((d) => walk(d.id)); }; walk(exclude); }
    const tree = (id, depth) => kids(id).filter((d) => !banned.has(d.id)).map((d) =>
      `<button class="folder-pick" data-pick="${d.id}" style="padding-left:${12 + depth * 18}px">${icon('folder', 16)} <span translate="no">${esc(d.name)}</span></button>`
      + tree(d.id, depth + 1)).join('');
    return new Promise((resolve) => {
      const m = B.modal(`
        <h2>${title}</h2>
        <div class="folder-tree">
          <button class="folder-pick" data-pick="">${icon('folder', 16)} ${tr('Documents (racine)')}</button>
          ${tree(null, 1)}
        </div>
        <div class="actions"><button class="btn" data-close>${tr('Annuler')}</button></div>`);
      $('[data-close]', m).onclick = () => { B.closeModal(); resolve(undefined); };
      m.addEventListener('click', (e) => {
        const b = e.target.closest('[data-pick]');
        if (!b) return;
        B.closeModal(); resolve(b.dataset.pick);
      });
    });
  }

  const moveFile = async (f, folderId) => {
    const { error } = await B.sb.rpc('move_file', { p_file: f.id, p_folder: folderId || null });
    if (error) return B.error(error);
    f.folder_id = folderId || null;
    paint();
  };
  const moveFolder = async (d, parentId) => {
    const { error } = await B.sb.rpc('move_folder', { p_folder: d.id, p_parent: parentId || null });
    if (error) return B.error(error);
    load();
  };

  if ($('#doc-journal', el)) $('#doc-journal', el).onclick = () => B.openDocJournal(p).catch(B.error);
  if (!inChan) $('#doc-trash', el).onclick = () => B.openTrash(p, load).catch(B.error);
  if (!inChan) $('#new-folder', el).onclick = async () => {
    const name = await askName(tr('Nouveau dossier'));
    if (!name) return;
    const { error } = await B.sb.rpc('create_folder', { p_project: p.id, p_parent: cur, p_name: name });
    if (error) return B.error(error);
    load();
  };
  if (!inChan) $('.crumbs', el).addEventListener('click', (e) => {
    const b = e.target.closest('[data-go]');
    if (b) setCur(b.dataset.go || null);
  });

  // Glisser un document sur un dossier (ou sur le fil d'Ariane) pour l'y ranger
  el.addEventListener('dragstart', (e) => {
    const row = e.target.closest?.('[data-id][draggable="true"]');
    if (row) { e.dataTransfer.setData('text/bivouac-file', row.dataset.id); e.dataTransfer.effectAllowed = 'move'; }
  });
  el.addEventListener('dragover', (e) => {
    const t = e.target.closest?.('[data-drop]');
    if (t && e.dataTransfer.types.includes('text/bivouac-file')) { e.preventDefault(); t.classList.add('drop-over'); }
  });
  el.addEventListener('dragleave', (e) => e.target.closest?.('[data-drop]')?.classList.remove('drop-over'));
  el.addEventListener('drop', (e) => {
    const t = e.target.closest?.('[data-drop]');
    const id = e.dataTransfer.getData('text/bivouac-file');
    if (!t || !id) return;
    e.preventDefault(); t.classList.remove('drop-over');
    const f = files.find((x) => x.id === id);
    if (f && (f.folder_id || '') !== t.dataset.drop) moveFile(f, t.dataset.drop);
  });

  const upload = async (list) => {
    list = B.acceptFiles(list);
    if (!list.length) return;
    for (const f of list) {
      B.toast(tr('Envoi de {name}…', { name: esc(f.name) }), { timeout: 2000 });
      await B.uploadFile(p.id, f, null, cur).catch(B.error);
    }
    load();
  };

  const input = $('#doc-input', el);
  if (input) {
    $('#pick', el).onclick = () => input.click();
    $('#pick-phone', el).onclick = () => input.click(); // téléphone : un vrai bouton (pas de glisser-déposer au doigt)
    input.onchange = () => { upload([...input.files]); input.value = ''; };
    const zone = $('.drop-zone', el);
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('over'));
    zone.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); zone.classList.remove('over'); upload([...e.dataTransfer.files]); });
  }

  $('.doc-view', el).addEventListener('click', async (e) => {
    if (e.target.closest('[data-clear]')) {
      query = ''; kind = 'all'; $('#doc-q', el).value = ''; $('#doc-type', el).value = 'all';
      return paint();
    }
    const drow = e.target.closest('[data-folder]');
    if (drow) {
      const d = folders.find((x) => x.id === drow.dataset.folder);
      if (!d) return;
      if (e.target.closest('[data-dl-folder]')) return downloadFolder(d).catch(B.error);
      if (e.target.closest('[data-rename]')) {
        const name = await askName(tr('Renommer le dossier'), d.name);
        if (!name || name === d.name) return;
        const { error } = await B.sb.rpc('rename_folder', { p_folder: d.id, p_name: name });
        return error ? B.error(error) : load();
      }
      if (e.target.closest('[data-move-folder]')) {
        const to = await pickFolder(tr('Déplacer « {name} » dans…', { name: esc(d.name) }), d.id);
        if (to !== undefined && (to || null) !== (d.parent_id || null)) moveFolder(d, to);
        return;
      }
      if (e.target.closest('[data-del-folder]')) {
        if (!(await B.confirm(tr('Supprimer le dossier « {name} » ? Les documents qu\'il contient ne sont pas supprimés : ils remontent d\'un niveau.', { name: d.name }), tr('Supprimer')))) return;
        const { error } = await B.sb.rpc('delete_folder', { p_folder: d.id });
        return error ? B.error(error) : load();
      }
      return setCur(d.id);
    }
    const row = e.target.closest('[data-id]');
    if (!row) return;
    const f = files.find((x) => x.id === row.dataset.id);
    if (e.target.closest('.file-link')) {
      if (!B.canPreview(f)) return B.openFile(f).catch(B.error);
      const imgs = here.filter((x) => B.canPreview(x));
      return openViewer(imgs, Math.max(0, imgs.indexOf(f)), e.target.closest('.file-link'));
    }
    if (e.target.closest('[data-dl]')) return B.downloadFile(f).catch(B.error);
    if (e.target.closest('[data-to-docs]')) { // le fichier quitte le salon pour le dossier de ce salon dans Documents
      const { data, error } = await B.sb.rpc('file_to_documents', { p_file: f.id });
      if (error) return B.error(error);
      files = files.filter((x) => x.id !== f.id);
      paint();
      B.toast(tr('« {name} » est rangé dans Documents › {folder}.', { name: esc(f.name), folder: esc(data?.name || '') }), { type: 'success', timeout: 6000,
        actions: [[tr('Ouvrir Documents'), '', () => { B.closeModal(); if (data?.folder) store.set('docs-folder:' + p.id, data.folder); location.hash = `#/p/${p.id}/documents`; }]] });
      return;
    }
    if (e.target.closest('[data-jump]')) { // aller au message où le fichier a été partagé
      B.closeModal();
      B.pendingJump = f.message_id;
      const to = channel.kind === 'ai' ? `#/p/${p.id}/atelier` : `#/p/${p.id}/discussion/${channel.id}`;
      if (location.hash === to) B.route(); else location.hash = to;
      return;
    }
    if (e.target.closest('[data-versions]')) return showVersions(f).catch(B.error);
    if (e.target.closest('[data-move]')) {
      const to = await pickFolder(tr('Ranger « {name} » dans…', { name: esc(f.name) }));
      if (to !== undefined && (to || null) !== (f.folder_id || null)) moveFile(f, to);
      return;
    }
    if (e.target.closest('[data-share]')) return B.openShareFile(f).catch(B.error);
    if (e.target.closest('[data-del]')) {
      if (!(await B.confirm(tr('Mettre « {name} » à la corbeille ? Vous pourrez le récupérer pendant 30 jours.', { name: f.name }), tr('Mettre à la corbeille')))) return;
      try { await B.trashFile(f); } catch (err) { return B.error(err); }
      load();
      B.toast(tr('« {name} » est dans la corbeille.', { name: esc(f.name) }), { type: 'success', timeout: 8000,
        actions: [[tr('Annuler'), '', async () => { await B.restoreFile(f.id).catch(B.error); load(); }]] });
    }
  });

  /**
   * Visionneuse : l'image en grand, sur fond nuit. La miniature s'affiche tout de suite (floue), puis l'image entière
   * une fois téléchargée. ← → (ou glisser au doigt) pour passer d'une image à l'autre, Échap pour fermer.
   */
  function openViewer(list, start, from) {
    if (!list.length) return;
    let i = start, token = 0;
    const v = document.createElement('div');
    v.className = 'img-viewer';
    v.setAttribute('role', 'dialog');
    v.setAttribute('aria-modal', 'true');
    v.setAttribute('aria-label', tr('Aperçu de l\'image'));
    v.innerHTML = `
      <div class="iv-top">
        <span class="iv-name" translate="no"></span><span class="iv-count"></span>
        <button class="icon-btn iv-download" title="${tr('Télécharger')}" aria-label="${tr('Télécharger')}">${icon('download', 20)}</button>
        <button class="icon-btn iv-close" title="${tr('Fermer')}" aria-label="${tr('Fermer')}">${icon('x', 20)}</button>
      </div>
      <div class="iv-stage">
        <button class="icon-btn iv-prev" title="${tr('Image précédente')}" aria-label="${tr('Image précédente')}">${icon('back', 22)}</button>
        <img class="iv-img" alt="" />
        <p class="iv-msg" hidden></p>
        <button class="icon-btn iv-next" title="${tr('Image suivante')}" aria-label="${tr('Image suivante')}">${icon('chevron', 22)}</button>
      </div>
      <p class="iv-meta"></p>`;
    document.body.appendChild(v);
    const img = $('.iv-img', v), msg = $('.iv-msg', v);
    const show = async () => {
      const f = list[i], mine = ++token;
      const by = B.person(f.updated_by || f.uploader_id);
      $('.iv-name', v).textContent = f.name;
      $('.iv-count', v).textContent = list.length > 1 ? `${i + 1} / ${list.length}` : '';
      $('.iv-meta', v).textContent = `${fmtSize(f.size)} · ${by.display_name} · ${timeAgo(f.updated_at || f.created_at)}`;
      $('.iv-prev', v).hidden = $('.iv-next', v).hidden = list.length < 2;
      msg.hidden = true;
      img.alt = f.name;
      const t = fresh(f);
      img.classList.toggle('iv-blur', Boolean(t));
      if (t) img.src = t; else img.removeAttribute('src');
      img.hidden = !t;
      try {
        const url = await B.fileUrl(f.path);
        const full = new Image();
        full.referrerPolicy = 'no-referrer';
        full.src = url;
        await full.decode();
        if (mine !== token) return;
        img.src = url; img.hidden = false; img.classList.remove('iv-blur');
      } catch {
        if (mine !== token) return;
        msg.textContent = tr('Aperçu impossible. Ouvrez le fichier pour le voir.');
        msg.hidden = false;
      }
    };
    const go = (d) => { if (list.length > 1) { i = (i + d + list.length) % list.length; show(); } };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
    };
    function close() {
      if (!v.isConnected) return;
      token++;
      v.parentNode.removeChild(v);
      document.removeEventListener('keydown', onKey, true);
      if (from && from.isConnected) from.focus();
    }
    document.addEventListener('keydown', onKey, true);
    B.onLeave(close);
    $('.iv-close', v).onclick = close;
    $('.iv-prev', v).onclick = () => go(-1);
    $('.iv-next', v).onclick = () => go(1);
    $('.iv-download', v).onclick = () => B.downloadFile(list[i]).catch(B.error);
    $('.iv-stage', v).addEventListener('click', (e) => { if (e.target.classList.contains('iv-stage')) close(); });
    let x0 = null;
    v.addEventListener('touchstart', (e) => { x0 = e.touches.length === 1 ? e.touches[0].clientX : null; }, { passive: true });
    v.addEventListener('touchend', (e) => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0;
      x0 = null;
      if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
    });
    $('.iv-close', v).focus();
    show();
  }

  /** Télécharge un dossier entier en .zip (sous-dossiers compris, dernière version de chaque document).
   *  Les documents sont lus un par un depuis le stockage (adresses signées 5 min), puis assemblés par B.makeZip. */
  let zipping = false;
  async function downloadFolder(d) {
    if (zipping) return B.toast(tr('Un dossier est déjà en cours de préparation.'), { timeout: 3000 });
    const list = [];
    const walk = (id, prefix) => {
      files.filter((f) => f.folder_id === id).forEach((f) => list.push({ f, dir: prefix }));
      kids(id).forEach((k) => walk(k.id, prefix + k.name + '/'));
    };
    walk(d.id, '');
    if (!list.length) return B.toast(tr('Ce dossier est vide : rien à télécharger.'), { timeout: 3500 });
    const total = list.reduce((n, x) => n + (x.f.size || 0), 0);
    if (total > ZIP_MAX_MB * 1024 * 1024) {
      return B.error(new Error(tr('Ce dossier pèse plus de {max} Mo : téléchargez plutôt ses sous-dossiers ou ses documents un par un.', { max: ZIP_MAX_MB })));
    }
    zipping = true;
    const note = B.toast(tr('Préparation de « {name}.zip » ({n} documents)…', { name: esc(d.name), n: list.length }), { timeout: 0 });
    try {
      const { data, error } = await B.sb.storage.from('project-files').createSignedUrls(list.map((x) => x.f.path), 300);
      if (error) throw error;
      const entries = [];
      for (let i = 0; i < list.length; i++) {
        const url = data?.[i]?.signedUrl;
        if (!url) throw new Error(tr('Téléchargement impossible.'));
        const res = await fetch(url);
        if (!res.ok) throw new Error(tr('Téléchargement impossible.'));
        entries.push({ name: list[i].dir + list[i].f.name, data: new Uint8Array(await res.arrayBuffer()),
          date: new Date(list[i].f.updated_at || list[i].f.created_at) });
      }
      const blob = B.makeZip(entries);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = d.name + '.zip';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      if (window.BIVOUAC_WEB) B.toast(tr('Téléchargement de « {name} »…', { name: esc(d.name + '.zip') }), { timeout: 2500 });
    } finally {
      zipping = false;
      note?.remove?.();
    }
  }

  /** Fenêtre « Versions » : ouvrir une ancienne version (lecture seule) ou la restaurer */
  async function showVersions(f) {
    const list = await B.fileVersions(f);
    const m = B.modal(`
      <h2>${tr('Versions de « {name} »', { name: esc(f.name) })}</h2>
      <p class="muted small">${tr('Une ancienne version s\'ouvre en lecture : ses modifications ne sont pas envoyées. « Restaurer » la remet en version actuelle, sans rien effacer.')}</p>
      <div class="version-list">
        ${list.map((v) => {
          const who = B.person(v.author_id);
          return `<div class="version-row" data-v="${v.version}">
            <strong>${tr('Version {v}', { v: v.version })}</strong>${v.current ? ` <span class="tag">${tr('actuelle')}</span>` : ''}
            <span class="muted small">${avatar(who, 18)} ${esc(who.display_name)} · ${timeAgo(v.created_at)} · ${fmtSize(v.size)}</span>
            <span class="version-actions">
              ${v.current ? '' : `<button class="link small" data-open>${tr('Ouvrir')}</button>
              <button class="btn small" data-restore>${tr('Restaurer')}</button>`}</span>
          </div>`;
        }).join('')}
      </div>
      <div class="actions"><button class="btn" data-close>${tr('Fermer')}</button></div>`);
    $('[data-close]', m).onclick = B.closeModal;
    m.onclick = async (e) => {
      const row = e.target.closest('[data-v]');
      const v = row && list.find((x) => String(x.version) === row.dataset.v);
      if (!v) return;
      if (e.target.closest('[data-open]')) return B.openFile(f, v).catch(B.error);
      if (e.target.closest('[data-restore]')) {
        e.target.disabled = true;
        try {
          const n = await B.restoreFileVersion(f, v);
          B.closeModal();
          B.toast(tr('Version {old} restaurée : elle devient la version {v}.', { old: v.version, v: n }), { type: 'success' });
          load();
        } catch (err) { e.target.disabled = false; B.error(err); }
      }
    };
  }

  await load();
  B.live(inChan ? 'chan-files' : 'docs', 'files', `project_id=eq.${p.id}`, debounce(() => { if (el.isConnected) load(); }, 300));
  if (!inChan) B.live('docs-folders', 'folders', `project_id=eq.${p.id}`, debounce(load, 300));
  B.onLeave(B.on('files', load));
};

// ---------------------------------------------------------------------
// Journal des Documents (migration 047). La base l'écrit seule (déclencheurs sur files et folders, connecteur compris) ;
// personne ne peut le modifier. Lisible par le Créateur et les Administrateurs du projet (règle doc_journal_select).
// ---------------------------------------------------------------------
/** [action, libellé, icône, groupe du filtre] */
const JOURNAL_ACTIONS = {
  ajout: ['a ajouté', 'plus', 'add'],
  nouvelle_version: ['a enregistré une nouvelle version de', 'edit', 'edit'],
  renommage: ['a renommé', 'edit', 'move'],
  deplacement: ['a déplacé', 'arrow', 'move'],
  suppression: ['a supprimé', 'trash', 'delete'],
  masquage: ['a masqué', 'eyeoff', 'delete'],
  reaffichage: ['a réaffiché', 'eye', 'add'],
  dossier_creation: ['a créé le dossier', 'folder', 'folder'],
  dossier_renommage: ['a renommé le dossier', 'folder', 'folder'],
  dossier_deplacement: ['a déplacé le dossier', 'folder', 'folder'],
  dossier_suppression: ['a supprimé le dossier', 'trash', 'folder']
};
const JOURNAL_GROUPS = [['all', 'Toutes les actions'], ['add', 'Ajouts'], ['edit', 'Nouvelles versions'],
  ['move', 'Déplacements et renommages'], ['delete', 'Suppressions'], ['folder', 'Dossiers']];
const JOURNAL_PAGE = 200;

/** Une ligne du journal en texte simple (fenêtre et fichier CSV) */
const journalWhere = (path) => path ? path.split('/').join(' / ') : tr('Racine');
/** La cause est écrite par la base en français (« dossier « X » supprimé ») : traduite à l'affichage */
const journalCause = (c) => { const x = /^dossier « (.*) » supprimé$/.exec(c || ''); return x ? tr('dossier « {name} » supprimé', { name: x[1] }) : c; };
function journalSentence(r) {
  const [label] = JOURNAL_ACTIONS[r.action] || [r.action];
  const d = r.details || {};
  let extra = '';
  if (d.ancien_nom) extra = ' ' + tr('(avant : « {name} »)', { name: d.ancien_nom });
  if (r.action === 'deplacement' || r.action === 'dossier_deplacement') extra = ' ' + tr('de {from} vers {to}', { from: journalWhere(d.depuis || ''), to: journalWhere(r.folder_path) });
  if (r.action === 'nouvelle_version' && d.version) extra = ' ' + tr('(version {v})', { v: d.version });
  return { label: tr(label), extra };
}

B.openDocJournal = async (p) => {
  let rows = [], done = false, group = 'all', who = '', q = '';
  const m = B.modal(`
    <h2>${icon('clock', 20)} ${tr('Journal des documents')}</h2>
    <p class="muted small">${tr('Tout ce qui a été ajouté, modifié, renommé, déplacé ou supprimé, par qui et quand (y compris par les IA). Écrit automatiquement, impossible à modifier ou à effacer. Visible seulement par le Créateur et les Administrateurs.')}</p>
    <div class="journal-tools">
      <label class="sr-only" for="jr-group">${tr('Action')}</label>
      <select id="jr-group" class="pill-select">${JOURNAL_GROUPS.map(([k, l]) => `<option value="${k}">${tr(l)}</option>`).join('')}</select>
      <label class="sr-only" for="jr-who">${tr('Personne')}</label>
      <select id="jr-who" class="pill-select"><option value="">${tr('Tout le monde')}</option></select>
      <label class="docs-search">${icon('search', 16)}<span class="sr-only">${tr('Rechercher un document ou un dossier')}</span>
        <input type="search" id="jr-q" placeholder="${tr('Document ou dossier…')}" autocomplete="off" /></label>
    </div>
    <div class="journal-list" aria-live="polite"></div>
    <div class="actions">
      <button class="btn" id="jr-csv">${icon('download', 16)} ${tr('Exporter (CSV)')}</button>
      <button class="btn primary" data-close>${tr('Fermer')}</button>
    </div>`, { wide: true });
  $('[data-close]', m).onclick = B.closeModal;
  const list = $('.journal-list', m);

  const fetchPage = async () => {
    let req = B.sb.from('doc_journal').select('*').eq('project_id', p.id)
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(JOURNAL_PAGE);
    const last = rows[rows.length - 1];
    if (last) req = req.lt('id', last.id);
    const { data, error } = await req;
    if (error) throw error;
    rows = rows.concat(data);
    done = data.length < JOURNAL_PAGE;
  };
  const shown = () => rows.filter((r) => (group === 'all' || (JOURNAL_ACTIONS[r.action] || [])[2] === group)
    && (!who || (r.actor_id || r.actor_name) === who)
    && (!q || fold(r.target_name + ' ' + r.folder_path + ' ' + (r.details?.ancien_nom || '')).includes(q)));
  const paintWho = () => {
    const sel = $('#jr-who', m), seen = new Map();
    for (const r of rows) seen.set(r.actor_id || r.actor_name, r.actor_name);
    sel.innerHTML = `<option value="">${tr('Tout le monde')}</option>` + [...seen].sort((a, b) => a[1].localeCompare(b[1], B.locale()))
      .map(([k, n]) => `<option value="${esc(k)}" ${k === who ? 'selected' : ''} translate="no">${esc(n)}</option>`).join('');
  };
  const paint = () => {
    const list2 = shown();
    let day = '';
    list.innerHTML = list2.length ? list2.map((r) => {
      const d = new Date(r.created_at);
      const dayText = d.toLocaleDateString(B.locale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      const head = dayText !== day ? `<h3 class="journal-day">${esc(dayText)}</h3>` : '';
      day = dayText;
      const [, ic] = JOURNAL_ACTIONS[r.action] || ['', 'file'];
      const { label, extra } = journalSentence(r);
      const where = r.action.endsWith('deplacement') ? '' : ` <span class="muted">· ${icon('folder', 13)} <span translate="no">${esc(journalWhere(r.folder_path))}</span></span>`;
      const tags = [r.via_ia ? `<span class="tag ai">${tr('via son IA')}</span>` : '',
        r.details?.reprise ? `<span class="tag human" title="${tr('Repris de l’historique existant à l’ouverture du journal')}">${tr('repris')}</span>` : '',
        r.details?.cause ? `<span class="muted">· ${esc(journalCause(r.details.cause))}</span>` : ''].join(' ');
      return `${head}<div class="journal-row ${r.action === 'suppression' || r.action === 'dossier_suppression' ? 'is-del' : ''}">
        <span class="journal-ic">${icon(ic, 15)}</span>
        <span class="journal-text"><strong translate="no">${esc(r.actor_name)}</strong> ${esc(label)}
          « <span translate="no">${esc(r.target_name)}</span> »${esc(extra)}${where} ${tags}</span>
        <time class="muted small" datetime="${esc(r.created_at)}" title="${esc(d.toLocaleString(B.locale()))}">${d.toLocaleTimeString(B.locale(), { hour: '2-digit', minute: '2-digit' })}</time>
      </div>`;
    }).join('') : `<p class="muted">${rows.length ? tr('Aucune ligne ne correspond à ces filtres.') : tr('Rien pour l’instant : le journal se remplit à chaque action sur les documents.')}</p>`;
    if (!done) list.insertAdjacentHTML('beforeend', `<button class="btn small journal-more" id="jr-more">${tr('Afficher les plus anciennes')}</button>`);
    paintIcons(list);
  };
  list.innerHTML = `<p class="muted">${tr('Chargement…')}</p>`;
  await fetchPage();
  paintWho(); paint();

  $('#jr-group', m).onchange = (e) => { group = e.target.value; paint(); };
  $('#jr-who', m).onchange = (e) => { who = e.target.value; paint(); };
  $('#jr-q', m).oninput = debounce((e) => { q = fold(e.target.value.trim()); paint(); }, 150);
  list.onclick = async (e) => {
    if (!e.target.closest('#jr-more')) return;
    e.target.disabled = true;
    try { await fetchPage(); paintWho(); paint(); } catch (err) { e.target.disabled = false; B.error(err); }
  };
  // CSV : tout le journal (pas seulement ce qui est chargé), pour le garder ou le joindre en cas de litige
  $('#jr-csv', m).onclick = async (e) => {
    e.target.disabled = true;
    try {
      while (!done) await fetchPage();
      paintWho(); paint();
      const cell = (x) => `"${String(x ?? '').replace(/"/g, '""')}"`;
      const lines = [[tr('Date'), tr('Heure'), tr('Qui'), tr('Via son IA'), tr('Action'), tr('Élément'), tr('Dossier'), tr('Détails')].map(cell).join(';')];
      for (const r of rows) {
        const d = new Date(r.created_at), { label, extra } = journalSentence(r);
        lines.push([d.toLocaleDateString(B.locale()), d.toLocaleTimeString(B.locale()), r.actor_name, r.via_ia ? tr('oui') : '',
          label, r.target_name, journalWhere(r.folder_path), (extra.trim() + (r.details?.cause ? ' ' + journalCause(r.details.cause) : '')).trim()].map(cell).join(';'));
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
      // nom de fichier sans accents ni espaces (certains navigateurs remplacent sinon le nom par « download »)
      const safe = (x) => String(x).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
      a.download = `${safe(tr('journal-documents'))}-${safe(p.name) || 'projet'}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    } catch (err) { B.error(err); } finally { e.target.disabled = false; }
  };
};

// ---------------------------------------------------------------------
// Corbeille (v0.8.82, migration 049) : documents supprimés depuis moins de 30 jours. Tout membre la voit ;
// restaurer = la personne qui l'a envoyé ou supprimé, ou un responsable ; supprimer définitivement = la personne qui
// l'a envoyé ou un responsable. Au-delà de 30 jours, ce qu'on a le droit d'effacer l'est à l'ouverture de la corbeille.
// ---------------------------------------------------------------------
B.openTrash = async (p, after = () => {}) => {
  const m = B.modal(`<h2>${icon('trash', 20)} ${tr('Corbeille')}</h2>
    <p class="muted small">${tr('Les documents supprimés restent ici 30 jours, puis disparaissent pour de bon.')}</p>
    <div class="trash-list"><div class="loading">${tr('Chargement…')}</div></div>
    <div class="actions"><button class="btn primary" data-close>${tr('Fermer')}</button></div>`, { wide: true });
  $('[data-close]', m).onclick = B.closeModal;
  const box = $('.trash-list', m);
  const canPurge = (r) => r.uploader_id === B.me.id || B.isManager(p.id);
  const canRestore = (r) => canPurge(r) || r.deleted_by === B.me.id;
  const paint = async () => {
    const { data, error } = await B.sb.rpc('list_trash', { p_project: p.id });
    if (error) { box.innerHTML = `<p class="muted">${esc(errText(error))}</p>`; return; }
    // Plus de 30 jours : effacés pour de bon par la première personne qui en a le droit
    const old = (data || []).filter((r) => r.expired && canPurge(r));
    for (const r of old) await B.purgeFile(r.id).catch(() => {});
    const rows = (data || []).filter((r) => !old.includes(r));
    box.innerHTML = rows.length ? rows.map((r) => {
      const left = Math.max(0, 30 - Math.floor((Date.now() - new Date(r.deleted_at)) / 864e5));
      return `<div class="trash-row" data-id="${r.id}">${icon('file', 18)}
        <span class="trash-name"><strong translate="no">${esc(r.name)}</strong>
          <small>${tr('Supprimé par {who}, {when}', { who: esc(r.deleted_by_name || ''), when: esc(new Date(r.deleted_at).toLocaleDateString(B.locale(), { day: 'numeric', month: 'long' })) })} · ${tr(left > 1 ? 'encore {n} jours' : 'encore {n} jour', { n: left })}</small></span>
        ${canRestore(r) ? `<button class="btn small" data-restore>${icon('restore', 14)} ${tr('Restaurer')}</button>` : ''}
        ${canPurge(r) ? `<button class="icon-btn" data-purge title="${tr('Supprimer définitivement')}" aria-label="${tr('Supprimer définitivement')}">${icon('x', 15)}</button>` : ''}</div>`;
    }).join('') : `<p class="muted">${tr('La corbeille est vide.')}</p>`;
    paintIcons(box);
  };
  box.addEventListener('click', async (e) => {
    const row = e.target.closest('.trash-row');
    if (!row) return;
    if (e.target.closest('[data-restore]')) {
      try { await B.restoreFile(row.dataset.id); } catch (err) { return B.error(err); }
      B.toast(tr('Document restauré.'), { type: 'success', timeout: 2500 });
      after(); paint();
    }
    if (e.target.closest('[data-purge]')) {
      if (!(await B.confirm(tr('Supprimer définitivement ce document ? Il ne pourra plus être récupéré.'), tr('Supprimer définitivement')))) return B.openTrash(p, after);
      try { await B.purgeFile(row.dataset.id); } catch (err) { B.error(err); }
      B.openTrash(p, after);
    }
  });
  await paint();
};

// ---------------------------------------------------------------------
// Partager un document par un lien (v0.8.82, migration 049) : quelqu'un qui n'a pas de compte télécharge le document
// depuis la page publique « Partage » pendant 1, 7 ou 30 jours. Le lien se coupe à tout moment. Tout est noté
// dans le journal des Documents. Le jeton n'est lisible que par la personne qui a créé le lien.
// ---------------------------------------------------------------------
B.openShareFile = async (f) => {
  const m = B.modal(`<h2>${icon('link', 20)} ${tr('Partager « {name} »', { name: esc(f.name) })}</h2>
    <p class="muted small">${tr('Toute personne qui a le lien peut télécharger ce document, sans compte, jusqu’à la date choisie. Vous pouvez couper le lien à tout moment.')}</p>
    <div class="share-list"></div>
    <form class="share-new"><label for="share-days">${tr('Nouveau lien valable')}</label>
      <div class="when-row"><select id="share-days"><option value="1">${tr('1 jour')}</option><option value="7" selected>${tr('7 jours')}</option><option value="30">${tr('30 jours')}</option></select>
      <button class="btn primary" type="submit">${icon('link', 15)} ${tr('Créer le lien')}</button></div></form>
    <div class="actions"><button class="btn" data-close>${tr('Fermer')}</button></div>`);
  $('[data-close]', m).onclick = B.closeModal;
  const box = $('.share-list', m);
  const copy = async (tok) => {
    const url = SHARE_PAGE + '#' + tok;
    try { await navigator.clipboard.writeText(url); B.toast(tr('Lien copié : collez-le dans un e-mail ou un message.'), { type: 'success' }); }
    catch { window.prompt(tr('Copiez ce lien'), url); }
  };
  const paint = async () => {
    const { data, error } = await B.sb.from('file_shares').select('id, created_by, expires_at, revoked_at, downloads, created_at')
      .eq('file_id', f.id).is('revoked_at', null).gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false });
    if (error) { box.innerHTML = `<p class="muted">${esc(errText(error))}</p>`; $('.share-new', m).hidden = true; return; }
    box.innerHTML = (data || []).map((s) => `<div class="share-row" data-id="${s.id}">
      <span><strong>${tr('Lien de {who}', { who: esc(B.person(s.created_by).display_name) })}</strong>
        <small>${tr('jusqu’au {date}', { date: esc(B.whenText(s.expires_at)) })} · ${tr(s.downloads > 1 ? '{n} téléchargements' : '{n} téléchargement', { n: s.downloads })}</small></span>
      ${s.created_by === B.me.id ? `<button class="btn small" data-copy>${icon('copy', 14)} ${tr('Copier')}</button>` : ''}
      ${s.created_by === B.me.id || B.isManager(f.project_id) ? `<button class="link small" data-revoke>${tr('Couper le lien')}</button>` : ''}</div>`).join('');
    paintIcons(box);
  };
  box.addEventListener('click', async (e) => {
    const row = e.target.closest('.share-row');
    if (!row) return;
    if (e.target.closest('[data-copy]')) {
      const { data: tok, error } = await B.sb.rpc('share_token', { p_share: row.dataset.id });
      if (error || !tok) return B.error(error || new Error(tr('Ce lien n’est plus valable.')));
      return copy(tok);
    }
    if (e.target.closest('[data-revoke]')) {
      const { error } = await B.sb.rpc('revoke_file_share', { p_share: row.dataset.id });
      if (error) return B.error(error);
      B.toast(tr('Lien coupé : il ne fonctionne plus.'), { type: 'success', timeout: 3000 });
      paint();
    }
  });
  $('.share-new', m).onsubmit = async (e) => {
    e.preventDefault();
    const { data: tok, error } = await B.sb.rpc('create_file_share', { p_file: f.id, p_days: Number($('#share-days', m).value) });
    if (error) return B.error(error);
    await copy(tok);
    paint();
  };
  await paint();
};

// ---------------------------------------------------------------------
// Notes du projet (v0.8.82, migration 049) : un petit wiki (compte rendu, mode d'emploi, liste…) écrit en Markdown,
// modifiable par tout membre. Chaque enregistrement fait avancer la version : si quelqu'un a enregistré entre-temps,
// on le dit au lieu d'écraser son travail. Lues (et écrites, à la demande) par les IA via le connecteur.
// ---------------------------------------------------------------------
B.renderNotesStrip = async (box, p) => {
  if (!box) return;
  const paint = async () => {
    const { data, error } = await B.sb.from('project_notes').select('id, title, updated_at, updated_by, created_by')
      .eq('project_id', p.id).order('updated_at', { ascending: false });
    if (!box.isConnected) return;
    if (error) { box.hidden = true; return; } // migration 049 pas encore passée
    box.innerHTML = `<div class="notes-head"><h2>${icon('edit', 16)} ${tr('Notes du projet')}</h2>
        <button class="btn small" data-note-new>${icon('plus', 14)} ${tr('Nouvelle note')}</button></div>
      ${data.length ? `<div class="notes-list">${data.map((n) => `<button class="note-card" data-note="${n.id}">
        <strong translate="no">${esc(n.title)}</strong>
        <small>${tr('Modifiée par {who}, {when}', { who: esc(B.person(n.updated_by || n.created_by).display_name), when: esc(new Date(n.updated_at || Date.now()).toLocaleDateString(B.locale(), { day: 'numeric', month: 'short' })) })}</small></button>`).join('')}</div>`
        : `<p class="muted small">${tr('Un compte rendu, un mode d’emploi, une liste à garder : écrivez-le ici, toute l’équipe (et ses IA) pourra le lire et le compléter.')}</p>`}`;
    paintIcons(box);
  };
  box.onclick = (e) => {
    if (e.target.closest('[data-note-new]')) return B.openNote(p, null, paint);
    const c = e.target.closest('[data-note]');
    if (c) B.openNote(p, c.dataset.note, paint);
  };
  B.live('notes', 'project_notes', `project_id=eq.${p.id}`, paint);
  await paint();
};

B.openNote = async (p, id, after = () => {}) => {
  let note = null;
  if (id) {
    const { data, error } = await B.sb.from('project_notes').select('*').eq('id', id).maybeSingle();
    if (error) return B.error(error);
    if (!data) return B.toast(tr('Cette note a été supprimée.'), { type: 'error' });
    note = data;
  }
  let editing = !note;
  const canDel = note && (note.created_by === B.me.id || B.isManager(p.id));
  const m = B.modal(`<div class="note-panel">
    <div class="media-head"><h2>${icon('edit', 18)} <span class="note-title-view" translate="no"></span></h2>
      <button type="button" class="icon-btn" data-close aria-label="${tr('Fermer')}">×</button></div>
    <div class="note-alert hidden" role="status"></div>
    <div class="note-read"><div class="note-meta muted small"></div><div class="note-body msg-text" translate="no"></div></div>
    <form class="note-edit hidden">
      <label for="note-title">${tr('Titre')}</label><input id="note-title" maxlength="200" required />
      <label for="note-text">${tr('Texte')} <small class="muted">${tr('(Markdown : **gras**, - liste, # titre)')}</small></label>
      <textarea id="note-text" rows="16" maxlength="100000"></textarea>
    </form>
    <div class="actions">
      ${canDel ? `<button class="btn danger-ghost" data-note-del>${icon('trash', 15)} ${tr('Supprimer')}</button>` : ''}
      <span class="spacer"></span>
      <button class="btn" data-note-edit>${icon('edit', 15)} ${tr('Modifier')}</button>
      <button class="btn primary hidden" data-note-save>${tr('Enregistrer')}</button>
    </div></div>`, { wide: true });
  const paint = () => {
    $('.note-title-view', m).textContent = note ? note.title : tr('Nouvelle note');
    if (note) {
      $('.note-meta', m).textContent = tr('Version {v} · modifiée par {who}, le {when}', { v: note.version,
        who: B.person(note.updated_by || note.created_by).display_name, when: B.whenText(note.updated_at || note.created_at || Date.now()) });
      $('.note-body', m).innerHTML = note.content ? md(note.content) : `<p class="muted">${tr('Note vide.')}</p>`;
    }
    $('.note-read', m).classList.toggle('hidden', editing);
    $('.note-edit', m).classList.toggle('hidden', !editing);
    $('[data-note-edit]', m).classList.toggle('hidden', editing);
    $('[data-note-save]', m).classList.toggle('hidden', !editing);
  };
  const startEdit = () => {
    editing = true;
    $('#note-title', m).value = note?.title || '';
    $('#note-text', m).value = note?.content || '';
    paint();
    $(note ? '#note-text' : '#note-title', m).focus();
  };
  $('[data-close]', m).onclick = () => {
    if (editing && note && $('#note-text', m).value !== note.content && !confirm(tr('Fermer sans enregistrer vos changements ?'))) return;
    B.closeModal();
  };
  $('[data-note-edit]', m).onclick = startEdit;
  $('[data-note-save]', m).onclick = async () => {
    const title = $('#note-title', m).value.trim(), content = $('#note-text', m).value;
    if (!title) return B.toast(tr('Donnez un titre à la note.'), { type: 'error' });
    if (!note) {
      const { data, error } = await B.sb.from('project_notes').insert({ project_id: p.id, title, content, created_by: B.me.id }).select().single();
      if (error) return B.error(error);
      note = data;
    } else {
      // Seulement si personne n'a enregistré depuis que j'ai ouvert la note (même version)
      const { data, error } = await B.sb.from('project_notes').update({ title, content }).eq('id', note.id).eq('version', note.version).select();
      if (error) return B.error(error);
      if (!data?.length) {
        const { data: fresh } = await B.sb.from('project_notes').select('*').eq('id', note.id).maybeSingle();
        const a = $('.note-alert', m);
        a.classList.remove('hidden');
        a.innerHTML = fresh ? tr('{who} a enregistré cette note pendant que vous écriviez. Copiez vos changements, puis rechargez la note pour repartir de sa version.', { who: esc(B.person(fresh.updated_by).display_name) })
          + ` <button class="link small" data-note-reload>${tr('Recharger la note')}</button>` : tr('Cette note a été supprimée.');
        $('[data-note-reload]', a)?.addEventListener('click', () => { note = fresh; a.classList.add('hidden'); startEdit(); });
        return;
      }
      note = data[0];
    }
    editing = false;
    paint(); after();
    B.toast(tr('Note enregistrée.'), { type: 'success', timeout: 2000 });
  };
  $('[data-note-del]', m)?.addEventListener('click', async () => {
    if (!(await B.confirm(tr('Supprimer la note « {title} » ?', { title: note.title }), tr('Supprimer')))) return B.openNote(p, note.id, after);
    try { await B.deleteRow('project_notes', note.id); } catch (err) { return B.error(err); }
    after();
  });
  if (editing) startEdit(); else paint();
};

/**
 * « Fichiers du salon » (v0.8.87, Apo) : médias et documents partagés dans un salon (ou l'Atelier), ouverts par l'icône
 * de l'en-tête. Même vue que Documents (recherche, type, tri, liste / icônes, aperçu des images).
 */
B.openChannelFiles = (p, channel) => {
  const name = channel.kind === 'ai' ? tr('Atelier IA') : '#' + channel.name;
  const m = B.modal(`
    <div class="chan-files-head"><h2>${icon('clip', 18)} ${tr('Fichiers partagés')} <small translate="no">${esc(name)}</small></h2>
      <button class="icon-btn" data-close title="${tr('Fermer')}" aria-label="${tr('Fermer')}">${icon('x', 18)}</button></div>
    <div class="chan-files-body"></div>`, { wide: true });
  m.classList.add('chan-files-modal');
  $('[data-close]', m).onclick = B.closeModal;
  return B.pages.docs($('.chan-files-body', m), p, { channel });
};
