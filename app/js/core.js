// =====================================================================
// core.js — connexion au serveur (Supabase) et données partagées
//   B.sb          : client Supabase
//   B.me          : mon profil
//   B.projects    : mes projets (avec membres et avancement)
//   B.profiles    : Map id -> profil de toutes les personnes de mes projets
// =====================================================================

const cfg = window.BIVOUAC_CONFIG || {};
B.configured = Boolean(cfg.SUPABASE_URL && !cfg.SUPABASE_URL.includes('VOTRE-PROJET'));
B.sb = B.configured
  ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true }
    })
  : null;

B.me = null;
B.projects = [];
B.profiles = new Map();
B.members = new Map(); // projectId -> [{ user_id, role }]

// ---------------------------------------------------------------------
// Profil
// ---------------------------------------------------------------------

B.loadMe = async (userId) => {
  const { data, error } = await B.sb.from('profiles').select('*').eq('id', userId).single();
  if (error) throw error;
  B.me = data;
  B.profiles.set(data.id, data);
  return data;
};

B.updateMe = async (patch) => {
  const { data, error } = await B.sb.from('profiles').update(patch).eq('id', B.me.id).select().single();
  if (error) throw error;
  B.me = data;
  B.profiles.set(data.id, data);
  B.emit('me');
  return data;
};

B.person = (id) => B.profiles.get(id) || { id, display_name: tr('Ancien membre'), handle: 'inconnu', ai_providers: [], connector_providers: [] };

// ---------------------------------------------------------------------
// Projets, membres, avancement
// ---------------------------------------------------------------------

B.loadProjects = async () => {
  const [{ data: projects, error: e1 }, { data: members, error: e2 }, { data: tasks, error: e3 }] =
    await Promise.all([
      B.sb.from('projects').select('*').order('created_at'),
      B.sb.from('project_members').select('project_id, user_id, role, joined_at, profiles(*)'),
      B.sb.from('tasks').select('project_id, status')
    ]);
  if (e1 || e2 || e3) throw e1 || e2 || e3;

  B.members.clear();
  for (const m of members) {
    if (m.profiles) B.profiles.set(m.user_id, m.profiles);
    if (!B.members.has(m.project_id)) B.members.set(m.project_id, []);
    B.members.get(m.project_id).push({ user_id: m.user_id, role: m.role, joined_at: m.joined_at });
  }
  B.projects = projects.map((p) => {
    const t = tasks.filter((x) => x.project_id === p.id);
    const done = t.filter((x) => x.status === 'done').length;
    const ms = B.members.get(p.id) || [];
    const aiCount = ms.reduce((n, m) => n + aisOf(B.person(m.user_id)).length, 0);
    return {
      ...p,
      memberCount: ms.length,
      aiCount,
      taskCount: t.length,
      progress: t.length ? Math.round((done / t.length) * 100) : 0
    };
  });
  B.emit('projects');
  return B.projects;
};

B.project = (id) => B.projects.find((p) => p.id === id);
B.projectMembers = (id) => (B.members.get(id) || []).map((m) => ({ ...B.person(m.user_id), role: m.role }));

B.createProject = async (name, description, color) => {
  const { data, error } = await B.sb.rpc('create_project', { p_name: name, p_description: description, p_color: color });
  if (error) throw error;
  await B.loadProjects();
  return data;
};

/** Rejoindre avec un code d'invitation ou un lien d'invitation collé */
B.joinProject = async (codeOrLink) => {
  const { data, error } = await B.sb.rpc('join_project', { code: inviteCodeFrom(codeOrLink) });
  if (error) throw error;
  await B.loadProjects();
  return data;
};

// ---------------------------------------------------------------------
// Statuts et invitations (Créateur / Administrateur / Membre)
// ---------------------------------------------------------------------

B.myRole = (projectId) => (B.members.get(projectId) || []).find((m) => m.user_id === B.me?.id)?.role || null;
B.canInvite = (projectId) => ['owner', 'admin'].includes(B.myRole(projectId));
/** Puis-je retirer cette personne ? Créateur : tout le monde sauf lui ; Administrateur : les Membres */
B.canRemove = (projectId, member) => {
  const me = B.myRole(projectId);
  if (member.id === B.me.id || member.role === 'owner') return false;
  return me === 'owner' || (me === 'admin' && member.role === 'member');
};

B.inviteLink = (code) => INVITE_PAGE + '#' + code;

/** Mon invitation en attente pour ce projet (ou une nouvelle si fresh) : { code, expires_at } */
B.createInvite = async (projectId, fresh = false) => {
  const { data, error } = await B.sb.rpc('create_invite', { p_project: projectId, p_new: fresh });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
};

/** Invitations en attente du projet (visibles par le Créateur et les Administrateurs) */
B.pendingInvites = async (projectId) => {
  const { data, error } = await B.sb.from('project_invites').select('code, created_by, expires_at')
    .eq('project_id', projectId).is('used_at', null).is('revoked_at', null)
    .gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
};

B.cancelInvite = async (code) => {
  const { error } = await B.sb.rpc('cancel_invite', { p_code: code });
  if (error) throw error;
};

B.setMemberRole = async (projectId, userId, role) => {
  const { error } = await B.sb.rpc('set_member_role', { p_project: projectId, p_user: userId, p_role: role });
  if (error) throw error;
  await B.loadProjects();
};

B.removeMember = async (projectId, userId) => {
  const { error } = await B.sb.rpc('remove_member', { p_project: projectId, p_user: userId });
  if (error) throw error;
  await B.loadProjects();
};

// ---------------------------------------------------------------------
// Notifications envoyées aux autres
// ---------------------------------------------------------------------

B.notify = async (userId, { projectId = null, type, text, link = null, refId = null }) => {
  if (!userId || userId === B.me.id) return;
  const { error } = await B.sb.from('notifications').insert({
    user_id: userId, project_id: projectId, type, text: text.slice(0, 500), link, ref_id: refId
  });
  if (error) console.warn('notification non envoyée', error);
};

// ---------------------------------------------------------------------
// Fichiers (Supabase Storage, bucket privé "project-files")
// ---------------------------------------------------------------------

/** Taille max d'un fichier : limite du plan gratuit Supabase (à relever si vous passez au plan Pro) */
B.MAX_FILE_MB = 50;

/** Garde les fichiers acceptés et prévient clairement pour ceux qui sont trop gros */
B.acceptFiles = (files) => {
  const ok = [];
  for (const f of files) {
    if (f.size > B.MAX_FILE_MB * 1024 * 1024) {
      B.toast(esc(tr('« {name} » est trop gros ({size}). Taille maximum : {max} Mo par fichier.', { name: f.name, size: fmtSize(f.size), max: B.MAX_FILE_MB })), { type: 'error', timeout: 8000 });
    } else ok.push(f);
  }
  return ok;
};

B.uploadFile = async (projectId, file, messageId = null, folderId = null) => {
  if (file.size > B.MAX_FILE_MB * 1024 * 1024) {
    throw new Error(tr('« {name} » est trop gros ({size}). Taille maximum : {max} Mo par fichier.', { name: file.name, size: fmtSize(file.size), max: B.MAX_FILE_MB }));
  }
  const path = await storeBlob(projectId, file, file.name);
  const { data, error } = await B.sb.from('files').insert({
    project_id: projectId, message_id: messageId, name: file.name, path, size: file.size, mime: file.type || null,
    ...(folderId ? { folder_id: folderId } : {})
  }).select().single();
  if (error) throw error;
  return data;
};

/** Envoie un contenu dans le stockage du projet ; renvoie son chemin "<project_id>/<uuid>-<nom>" */
async function storeBlob(projectId, blob, name) {
  const safe = name.replace(/[^\w.\-]+/g, '_').slice(-80);
  const path = `${projectId}/${crypto.randomUUID()}-${safe}`;
  const up = await B.sb.storage.from('project-files').upload(path, blob, { contentType: blob.type || undefined });
  if (up.error) throw up.error;
  return path;
}

async function signedUrl(path) {
  const { data, error } = await B.sb.storage.from('project-files').createSignedUrl(path, 300);
  if (error) throw new Error(/not.?found|404/i.test(error.message || '') ? tr('Ce fichier n\'existe plus sur le serveur (il a peut-être été supprimé).') : error.message);
  return data.signedUrl;
}

/**
 * Ouvre un fichier du projet dans le logiciel du PC (Word, Excel, lecteur PDF…), sous son vrai nom.
 * Modifier sur place : quand le logiciel l'enregistre, la nouvelle version part toute seule dans le projet.
 * old : { version, path } pour ouvrir une ancienne version (lecture seule, jamais renvoyée).
 */
B.openFile = async (f, old = null) => {
  const url = await signedUrl(old ? old.path : f.path);
  if (!window.bivouac.openFile) return window.bivouac.openExternal(url); // ancienne version de l'app
  B.toast(tr('Ouverture de « {name} »…', { name: esc(f.name) }), { timeout: 2500 });
  try {
    const r = await window.bivouac.openFile({ url, name: f.name, id: f.id, version: old ? old.version : (f.version || 1), readonly: Boolean(old) });
    if (!r.ok) B.toast(tr('Aucun logiciel de ce PC ne sait ouvrir ce type de fichier : il est affiché dans son dossier.'), { timeout: 8000 });
    else if (!old) openedVersion.set(f.id, f.version || 1);
  } catch (err) {
    window.bivouac.openExternal(url); // en dernier recours : le navigateur
    throw err;
  }
};

/** Version de chaque document au moment où JE l'ai ouvert (pour prévenir si quelqu'un l'a modifié entre-temps) */
const openedVersion = new Map();

/** Enregistre un nouveau contenu comme nouvelle version d'un document ; renvoie le numéro de version */
B.saveFileVersion = async (f, blob) => {
  if (blob.size > B.MAX_FILE_MB * 1024 * 1024) {
    throw new Error(tr('« {name} » est trop gros ({size}). Taille maximum : {max} Mo par fichier.', { name: f.name, size: fmtSize(blob.size), max: B.MAX_FILE_MB }));
  }
  const path = await storeBlob(f.project_id, blob, f.name);
  const { data, error } = await B.sb.rpc('add_file_version', { p_file: f.id, p_path: path, p_size: blob.size });
  if (error) {
    await B.sb.storage.from('project-files').remove([path]).catch(() => {});
    throw new Error(/add_file_version/.test(error.message || '') ? tr('Les versions de documents ne sont pas encore installées sur le serveur (migration 015).') : error.message);
  }
  return data;
};

// Le logiciel du PC a enregistré un document ouvert depuis Bivouac : on l'envoie au projet
if (window.bivouac?.onFileChanged) {
  const saving = new Map(); // id -> promesse en cours (un seul envoi à la fois par document)
  window.bivouac.onFileChanged(({ id }) => {
    const run = async () => {
      const { data: f, error } = await B.sb.from('files').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      if (!f) throw new Error(tr('Ce document a été supprimé du projet : vos modifications restent seulement sur ce PC.'));
      const bytes = await window.bivouac.readOpenedFile(id);
      const mine = openedVersion.get(id);
      const v = await B.saveFileVersion(f, new Blob([bytes], { type: f.mime || '' }));
      openedVersion.set(id, v);
      await window.bivouac.fileSaved(id, v);
      B.toast(tr('« {name} » enregistré dans le projet (version {v}).', { name: esc(f.name), v }), { type: 'success' });
      if (mine && f.version > mine) {
        B.toast(tr('Attention : {who} avait aussi modifié « {name} » pendant ce temps. Sa version est gardée dans l\'historique (Documents → Versions).', { who: esc(B.person(f.updated_by).display_name), name: esc(f.name) }), { type: 'error', timeout: 12000 });
      }
      B.emit('files');
    };
    const p = (saving.get(id) || Promise.resolve()).then(run).catch((err) => B.toast(tr('Vos modifications n\'ont pas pu être envoyées au projet : {err}. Elles restent sur ce PC ; enregistrez à nouveau le fichier pour réessayer.', { err: esc(errText(err)) }), { type: 'error', timeout: 12000 }));
    saving.set(id, p);
  });
}

/** Historique d'un document : la version actuelle puis les anciennes, de la plus récente à la plus ancienne */
B.fileVersions = async (f) => {
  const { data, error } = await B.sb.from('file_versions').select('*').eq('file_id', f.id).order('version', { ascending: false });
  if (error) throw error;
  return [{ version: f.version || 1, path: f.path, size: f.size, author_id: f.updated_by || f.uploader_id, created_at: f.updated_at || f.created_at, current: true }, ...(data || [])];
};

/** Restaurer une ancienne version = la renvoyer comme nouvelle version (rien n'est perdu) */
B.restoreFileVersion = async (f, old) => {
  const res = await fetch(await signedUrl(old.path));
  if (!res.ok) throw new Error(tr('Téléchargement impossible (erreur {n}).', { n: res.status }));
  return B.saveFileVersion(f, await res.blob());
};

B.deleteFile = async (f) => {
  await B.deleteRow('files', f.id);
  await B.sb.storage.from('project-files').remove([f.path]);
};

// ---------------------------------------------------------------------
// Droits (migration 026) : « responsables » = Créateur et Administrateurs.
// Supprimer : l'auteur ou un responsable ; une décision soumise au vote : le Créateur seul ;
// le message de quelqu'un d'autre : un responsable (modération, notée dans l'activité).
// ---------------------------------------------------------------------
B.isManager = (projectId) => ['owner', 'admin'].includes(B.myRole(projectId));
B.canDelete = (projectId, authorId, { voted = false } = {}) =>
  voted ? B.myRole(projectId) === 'owner' : authorId === B.me?.id || B.isManager(projectId);

/** Supprime une ligne ; la base ne dit rien quand une règle l'empêche (0 ligne) : on l'explique clairement */
B.deleteRow = async (table, id) => {
  const { data, error } = await B.sb.from(table).delete().eq('id', id).select('id');
  if (error) throw error;
  if (!data?.length) throw new Error(tr("Vous n'avez pas le droit de supprimer cet élément : seuls son auteur, le Créateur et les Administrateurs du projet le peuvent."));
};

// ---------------------------------------------------------------------
// Mini système d'événements + nettoyage des abonnements à chaque page
// ---------------------------------------------------------------------

const listeners = {};
B.on = (ev, fn) => ((listeners[ev] ||= new Set()).add(fn), () => listeners[ev].delete(fn));
B.emit = (ev, data) => (listeners[ev] || []).forEach((fn) => fn(data));

let pageCleanups = [];
B.onLeave = (fn) => pageCleanups.push(fn);
B.leavePage = () => {
  pageCleanups.forEach((fn) => { try { fn(); } catch { /* ignoré */ } });
  pageCleanups = [];
};

/** Abonnement temps réel, retiré automatiquement quand on quitte la page */
B.live = (name, table, filter, handler, events = '*') => {
  const ch = B.sb
    .channel(`${name}-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: events, schema: 'public', table, ...(filter ? { filter } : {}) }, handler)
    .subscribe();
  B.onLeave(() => B.sb.removeChannel(ch));
  return ch;
};

/** Abonnements globaux (toute la session) */
// ---------------------------------------------------------------------
// Messages non lus (badges). Un salon est « lu » dès qu'on l'ouvre (migration 010).
// Les éléments d'interface portent data-unread="project:<id>" | "channel:<id>" | "tab:<projectId>:team|ai"
// ---------------------------------------------------------------------

B.unread = new Map();   // channelId -> { project_id, kind, unread }
B.openChannel = null;   // salon affiché à l'écran (ses messages sont lus tout de suite)

B.loadUnread = async () => {
  const { data, error } = await B.sb.rpc('unread_counts');
  if (error) return console.warn('Non lus', error.message); // ex. migration 010 pas encore appliquée
  B.unread = new Map((data || []).map((r) => [r.channel_id, r]));
  if (B.openChannel) B.unread.delete(B.openChannel);
  B.emit('unread');
};

B.unreadCount = ({ project, channel, kind } = {}) => {
  let n = 0;
  for (const [id, r] of B.unread) {
    if (channel && id !== channel) continue;
    if (project && r.project_id !== project) continue;
    if (kind && r.kind !== kind) continue;
    n += r.unread;
  }
  return n;
};

B.markRead = async (channelId) => {
  if (B.unread.delete(channelId)) B.emit('unread');
  const { error } = await B.sb.rpc('mark_read', { p_channel: channelId });
  if (error) console.warn('Lecture', error.message);
};

/** Met à jour tous les badges présents dans la page */
B.paintUnread = (root = document) => {
  $$('[data-unread]', root).forEach((el) => {
    const [type, a, b] = el.dataset.unread.split(':');
    const n = type === 'project' ? B.unreadCount({ project: a })
      : type === 'channel' ? B.unreadCount({ channel: a })
        : type === 'missed' ? (B.missedCount?.get(a) || 0)
          : B.unreadCount({ project: a, kind: b });
    el.textContent = n > 99 ? '99+' : String(n);
    el.classList.toggle('hidden', !n);
    el.title = !n ? '' : type === 'missed'
      ? tr(n > 1 ? '{n} nouveautés depuis votre dernière visite' : '{n} nouveauté depuis votre dernière visite', { n })
      : tr(n > 1 ? '{n} messages non lus' : '{n} message non lu', { n });
  });
};

B.startGlobalLive = () => {
  // Nouveau message dans un de mes projets (la RLS filtre) : badge à jour, ou lu tout de suite
  // si le salon est affiché et la fenêtre active
  const refresh = debounce(() => B.loadUnread(), 400);
  const readOpen = debounce(() => B.openChannel && B.markRead(B.openChannel), 400);
  B.sb.channel('me-unread')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (p) => {
      if (p.new.author_id === B.me.id) return;
      if (p.new.channel_id === B.openChannel && document.hasFocus()) readOpen();
      else refresh();
    })
    .subscribe();
  window.addEventListener('focus', () => { if (B.openChannel) B.markRead(B.openChannel); });

  B.sb.channel('me-notifs')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${B.me.id}` },
      (p) => B.emit('notification', p.new))
    .subscribe();
  B.sb.channel('me-requests')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ai_requests', filter: `target_id=eq.${B.me.id}` },
      (p) => B.emit('ai_request', p.new))
    .subscribe();
  B.sb.channel('me-memberships')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'project_members' },
      debounce(() => B.loadProjects().catch(console.error), 500))
    .subscribe();
};
