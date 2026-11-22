// =====================================================================
// Documents — tous les fichiers du projet (joints aux messages ou déposés ici), rangés en dossiers
// (migration 022 : create_folder / rename_folder / move_folder / delete_folder / move_file).
// Un clic ouvre le document dans le logiciel du PC ; quand on l'enregistre, la nouvelle
// version part toute seule dans le projet (core.js). Les anciennes restent dans « Versions ».
// 22/11 (Amaury) : affichage en liste ou en icônes (réglage de ce poste), filtre par type et recherche par nom
// (la recherche et le filtre regardent TOUS les dossiers ; le dossier de chaque résultat est indiqué).
// =====================================================================

/** Types de documents pour le filtre : [clé, libellé] */
const DOC_KINDS = [['all', 'Tous les types'], ['image', 'Images'], ['pdf', 'PDF'], ['text', 'Textes et Word'],
  ['sheet', 'Tableurs'], ['slides', 'Présentations'], ['media', 'Vidéos et sons'], ['archive', 'Archives'], ['other', 'Autres']];
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

B.pages.docs = async (el, p) => {
  el.innerHTML = `
    <div class="docs">
      <div class="drop-zone">
        ${icon('download', 26).replace('<svg', '<svg style="transform:rotate(180deg)"')}
        <p><strong>${tr('Déposez des fichiers ici')}</strong> ${tr('ou')} <button class="link" id="pick">${tr('parcourez')}</button></p>
        <p class="muted small">${tr('{max} Mo maximum par fichier.', { max: B.MAX_FILE_MB })}</p>
        <input type="file" id="doc-input" class="hidden" multiple />
      </div>
      <p class="muted small docs-hint">${icon('edit', 14)} ${tr('Cliquez sur un document pour l\'ouvrir dans le logiciel de votre PC (Word, Excel…). Quand vous l\'enregistrez, la nouvelle version est envoyée toute seule au projet ; les précédentes restent dans « Versions ».')}</p>
      <div class="docs-tools">
        <label class="docs-search">${icon('search', 16)}<span class="sr-only">${tr('Rechercher un document')}</span>
          <input type="search" id="doc-q" placeholder="${tr('Rechercher un document…')}" autocomplete="off" /></label>
        <label class="sr-only" for="doc-type">${tr('Type de document')}</label>
        <select id="doc-type" class="pill-select">${DOC_KINDS.map(([k, label]) => `<option value="${k}">${tr(label)}</option>`).join('')}</select>
        <div class="seg doc-views" role="group" aria-label="${tr('Affichage')}">
          <button data-view="list" title="${tr('Liste')}" aria-label="${tr('Liste')}">${icon('list', 16)}</button>
          <button data-view="grid" title="${tr('Icônes')}" aria-label="${tr('Icônes')}">${icon('kanban', 16)}</button>
        </div>
      </div>
      <div class="docs-bar">
        <nav class="crumbs" aria-label="${tr('Dossiers')}"></nav>
        <button class="btn small" id="new-folder">${icon('folder', 16)} ${tr('Nouveau dossier')}</button>
      </div>
      <div class="card doc-view"></div>
    </div>`;

  let files = [];
  let folders = [];
  let query = '';
  let kind = 'all';
  let view = store.get('docs-view', 'list') === 'grid' ? 'grid' : 'list';
  let cur = store.get('docs-folder:' + p.id, null); // dossier ouvert (null = racine)
  const kids = (id) => folders.filter((d) => (d.parent_id || null) === id).sort((a, b) => a.name.localeCompare(b.name, B.locale()));
  const chain = (id) => { const out = []; let d = folders.find((x) => x.id === id); while (d) { out.unshift(d); d = folders.find((x) => x.id === d.parent_id); } return out; };
  /** Nombre de documents dans un dossier et ses sous-dossiers */
  const count = (id) => files.filter((f) => f.folder_id === id).length + kids(id).reduce((n, d) => n + count(d.id), 0);
  const setCur = (id) => { cur = id; store.set('docs-folder:' + p.id, id); paint(); };

  const load = async () => {
    const [fi, fo] = await Promise.all([
      B.sb.from('files').select('*').eq('project_id', p.id).order('created_at', { ascending: false }),
      B.sb.from('folders').select('*').eq('project_id', p.id)
    ]);
    if (fi.error) return B.error(fi.error);
    files = fi.data.sort((a, b) => (b.updated_at || b.created_at).localeCompare(a.updated_at || a.created_at));
    folders = fo.error ? [] : fo.data; // dossiers absents (migration 022 pas encore passée) : tout à la racine
    $('#new-folder', el).hidden = !!fo.error;
    paint();
  };

  const folderPath = (id) => chain(id).map((d) => d.name).join(' / ');
  const fileIcon = (f) => icon(docKind(f) === 'image' ? 'image' : 'file', view === 'grid' ? 34 : 18);
  const fileActions = (f) => `
    ${(f.version || 1) > 1 ? `<button class="link small" data-versions>${tr('Versions')}</button>` : ''}
    ${folders.length ? `<button class="icon-btn" data-move title="${tr('Ranger dans un dossier')}" aria-label="${tr('Ranger dans un dossier')}">${icon('arrow', 16)}</button>` : ''}
    ${B.canDelete(f.project_id, f.uploader_id) ? `<button class="icon-btn" data-del title="${tr('Supprimer')}" aria-label="${tr('Supprimer')}">${icon('trash', 16)}</button>` : ''}`;
  const folderActions = () => `
    <button class="icon-btn" data-rename title="${tr('Renommer')}" aria-label="${tr('Renommer')}">${icon('edit', 16)}</button>
    <button class="icon-btn" data-move-folder title="${tr('Déplacer')}" aria-label="${tr('Déplacer')}">${icon('arrow', 16)}</button>
    <button class="icon-btn" data-del-folder title="${tr('Supprimer le dossier')}" aria-label="${tr('Supprimer le dossier')}">${icon('trash', 16)}</button>`;

  function paint() {
    if (cur && !folders.some((d) => d.id === cur)) cur = null; // dossier supprimé entre-temps
    $$('.doc-views [data-view]', el).forEach((b) => { b.classList.toggle('on', b.dataset.view === view); b.setAttribute('aria-pressed', b.dataset.view === view); });
    const searching = Boolean(query) || kind !== 'all';
    const path = chain(cur);
    $('.crumbs', el).innerHTML = [`<button class="crumb" data-go="" data-drop="">${icon('folder', 15)} ${tr('Documents')}</button>`]
      .concat(path.map((d) => `<span class="crumb-sep">›</span><button class="crumb" data-go="${d.id}" data-drop="${d.id}" translate="no">${esc(d.name)}</button>`))
      .join('');
    // Recherche ou filtre : tous les dossiers, sans les dossiers eux-mêmes ; sinon le dossier ouvert
    const q = fold(query);
    const match = (f) => (kind === 'all' || docKind(f) === kind) && (!q || fold(f.name).includes(q));
    const dirs = searching ? [] : kids(cur);
    const here = searching ? files.filter(match) : files.filter((f) => (f.folder_id || null) === cur);
    const where = (f) => (searching && f.folder_id ? `<span class="doc-where" translate="no">${icon('folder', 12)} ${esc(folderPath(f.folder_id))}</span>` : '');
    const empty = searching ? tr('Aucun document ne correspond.')
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
          <button class="doc-card-main file-link"><span class="doc-card-ico k-${docKind(f)}">${fileIcon(f)}<span class="doc-ext">${esc(docExt(f))}</span></span>
            <b translate="no">${esc(f.name)}</b><span class="muted small">${fmtSize(f.size)} · ${timeAgo(f.updated_at || f.created_at)}${(f.version || 1) > 1 ? ` · v${f.version}` : ''}</span>${where(f)}</button>
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
        <td><button class="file-link">${fileIcon(f)} <span translate="no">${esc(f.name)}</span></button>
          ${(f.version || 1) > 1 ? `<span class="version-badge" title="${tr('Version {v}', { v: f.version })}">v${f.version}</span>` : ''}${where(f)}</td>
        <td>${fmtSize(f.size)}</td>
        <td>${avatar(by, 22)} ${esc(by.display_name)}</td>
        <td>${timeAgo(f.updated_at || f.created_at)}</td>
        <td class="doc-actions">${fileActions(f)}</td>
      </tr>`;
    }).join('');
    box.innerHTML = `${found}<table class="doc-table"><thead><tr><th>${tr('Nom')}</th><th>${tr('Taille')}</th><th>${tr('Modifié par')}</th><th>${tr('Date')}</th><th></th></tr></thead>
      <tbody>${dirRows + fileRows || `<tr><td colspan="5" class="muted">${empty}</td></tr>`}</tbody></table>`;
  }

  $('#doc-q', el).addEventListener('input', debounce((e) => { query = e.target.value.trim(); paint(); }, 150));
  $('#doc-type', el).onchange = (e) => { kind = e.target.value; paint(); };
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

  $('#new-folder', el).onclick = async () => {
    const name = await askName(tr('Nouveau dossier'));
    if (!name) return;
    const { error } = await B.sb.rpc('create_folder', { p_project: p.id, p_parent: cur, p_name: name });
    if (error) return B.error(error);
    load();
  };
  $('.crumbs', el).addEventListener('click', (e) => {
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
  $('#pick', el).onclick = () => input.click();
  input.onchange = () => { upload([...input.files]); input.value = ''; };
  const zone = $('.drop-zone', el);
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('over'));
  zone.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); zone.classList.remove('over'); upload([...e.dataTransfer.files]); });

  $('.doc-view', el).addEventListener('click', async (e) => {
    if (e.target.closest('[data-clear]')) {
      query = ''; kind = 'all'; $('#doc-q', el).value = ''; $('#doc-type', el).value = 'all';
      return paint();
    }
    const drow = e.target.closest('[data-folder]');
    if (drow) {
      const d = folders.find((x) => x.id === drow.dataset.folder);
      if (!d) return;
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
    if (e.target.closest('.file-link')) return B.openFile(f).catch(B.error);
    if (e.target.closest('[data-versions]')) return showVersions(f).catch(B.error);
    if (e.target.closest('[data-move]')) {
      const to = await pickFolder(tr('Ranger « {name} » dans…', { name: esc(f.name) }));
      if (to !== undefined && (to || null) !== (f.folder_id || null)) moveFile(f, to);
      return;
    }
    if (e.target.closest('[data-del]')) {
      if (!(await B.confirm(tr('Supprimer « {name} » ?', { name: f.name }), tr('Supprimer')))) return;
      await B.deleteFile(f).catch(B.error);
      load();
    }
  });

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
  B.live('docs', 'files', `project_id=eq.${p.id}`, debounce(load, 300));
  B.live('docs-folders', 'folders', `project_id=eq.${p.id}`, debounce(load, 300));
  B.onLeave(B.on('files', load));
};
