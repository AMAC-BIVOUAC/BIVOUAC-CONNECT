// =====================================================================
// admin.js — Administration de toute l'application (migration 042, 24/11, Apo)
//
// Deux rôles GLOBAUX en plus des statuts de projet : modérateur (signalements, masquer, suspendre, comptes à
// surveiller) et admin (+ utilisateurs, projets, bannir, rôles, journal). Page #/admin/<onglet>, visible seulement
// par l'équipe Bivouac. Tout passe par les fonctions admin_* de la base, qui vérifient le rôle, la double
// authentification (code validé il y a moins de 30 jours sur cet appareil) et refusent le connecteur des IA ;
// chaque geste est noté au journal. Rien ici ne lit le contenu des projets sans signalement, sauf le
// « mode administration » (admins, motif obligatoire, visible dans l'activité du projet).
// =====================================================================

B.staff = null; // { role: 'admin' | 'moderator' | null, aal2, connector }
B.isStaff = () => Boolean(B.staff?.role);
B.isPlatformAdmin = () => B.staff?.role === 'admin';

/** Lit mon rôle global (sans erreur si la migration 042 n'est pas encore en ligne) et affiche l'entrée du menu */
B.loadStaff = async () => {
  const { data, error } = await B.sb.rpc('admin_status');
  B.staff = error ? null : data;
  const nav = $('#sidebar .nav');
  let link = $('#nav-admin');
  if (B.isStaff() && nav && !link) {
    link = h(`<a href="#/admin" data-nav="admin" id="nav-admin"><i data-icon="lock"></i>${tr('Administration')}</a>`);
    nav.appendChild(link);
    paintIcons(link);
    B.highlightNav();
  } else if (!B.isStaff()) link?.remove();
};

const ROLE_NAMES = () => ({ admin: tr('Admin'), moderator: tr('Modérateur') });
const TARGETS = () => ({ message: tr('Message'), dm: tr('Message privé'), file: tr('Document'), item: tr('Élément du projet'),
  task: tr('Tâche'), profile: tr('Personne'), project: tr('Projet') });
const ACTIONS = () => ({ voir_signalement: tr('a examiné un signalement'), traiter_signalement: tr('a traité un signalement'),
  masquer: tr('a masqué un contenu'), reafficher: tr('a réaffiché un contenu'), suspendre: tr('a suspendu un compte'),
  lever_suspension: tr('a levé une suspension'), bannir: tr('a fermé un compte'), debannir: tr('a rouvert un compte'),
  ouvrir_projet: tr('a ouvert un projet en mode administration'), supprimer_projet: tr('a supprimé un projet'),
  transferer_projet: tr('a transféré un projet'), role: tr('a changé un rôle'),
  reinitialiser_double_auth: tr('a réinitialisé une double authentification'), verifier_ia: tr('a lancé une vérification des IA') });
const when = (iso) => iso ? `${fmtDate(iso)} ${fmtTime(iso)}` : '';
const statusTag = (u) => u.banned_at ? `<span class="tag danger-tag">${tr('Compte fermé')}</span>`
  : u.suspended_until && new Date(u.suspended_until) > new Date() ? `<span class="tag late">${tr('Suspendu jusqu’au {date}', { date: when(u.suspended_until) })}</span>` : '';

/** Petite fenêtre : un texte (raison, motif) et, au besoin, un choix. Renvoie { text, choice } ou null. */
function ask({ title, intro = '', label = tr('Raison'), placeholder = '', min = 5, choices = null, ok = tr('Confirmer'), danger = false }) {
  return new Promise((resolve) => {
    const m = B.modal(`<h2>${esc(title)}</h2>${intro ? `<p class="muted small">${intro}</p>` : ''}
      ${choices ? `<label for="ask-choice">${tr('Durée')}</label><select id="ask-choice">${choices.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select>` : ''}
      ${label ? `<label for="ask-text">${esc(label)}</label><textarea id="ask-text" rows="3" maxlength="1000" placeholder="${esc(placeholder)}"></textarea>` : ''}
      <p class="msg" id="ask-msg"></p>
      <div class="actions"><button class="btn" data-no>${tr('Annuler')}</button><button class="btn ${danger ? 'danger' : 'primary'}" data-yes>${esc(ok)}</button></div>`);
    $('[data-no]', m).onclick = () => { B.closeModal(); resolve(null); };
    $('[data-yes]', m).onclick = () => {
      const text = label ? $('#ask-text', m).value.trim() : '';
      if (label && text.length < min) { $('#ask-msg', m).textContent = tr('Écrivez au moins {n} caractères.', { n: min }); return; }
      B.closeModal();
      resolve({ text, choice: choices ? $('#ask-choice', m).value : null });
    };
  });
}

async function rpc(name, args) {
  const { data, error } = await B.sb.rpc(name, args);
  if (error) throw error;
  return data;
}

/** Fonction serveur « admin » (bannir, réinitialiser la double authentification) */
async function serverAction(body, fn = 'admin') {
  const { data, error } = await B.sb.functions.invoke(fn, { body });
  if (error) {
    let msg = error.message;
    try { msg = (await error.context?.json?.())?.error || msg; } catch { /* réponse illisible */ }
    throw new Error(msg);
  }
  return data;
}

// ---------- Double authentification (appli d'authentification : Microsoft / Google Authenticator, Mots de passe d'Apple…) ----------

/** Affiche l'enregistrement ou la demande du code ; renvoie true quand le code est validé */
async function mfaGate(box) {
  const { data: f, error } = await B.sb.auth.mfa.listFactors();
  if (error) { box.innerHTML = `<p class="msg error">${esc(errText(error))}</p>`; return false; }
  const verified = (f?.totp || []).filter((x) => x.status === 'verified');
  return new Promise((resolve) => {
    const codeForm = (factorId, intro) => {
      box.innerHTML = `<section class="card admin-mfa">
        <div class="card-head"><h2>${icon('key', 16)} ${tr('Double authentification')}</h2></div>
        <p>${intro}</p>
        <form id="mfa-form" class="mfa-form"><label for="mfa-code">${tr('Code à 6 chiffres')}</label>
          <input id="mfa-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required />
          <button class="btn primary" type="submit">${tr('Valider')}</button></form>
        <p class="msg" id="mfa-msg"></p></section>`;
      paintIcons(box);
      $('#mfa-code', box).focus();
      $('#mfa-form', box).onsubmit = async (e) => {
        e.preventDefault();
        const code = $('#mfa-code', box).value.replace(/\D/g, '');
        e.submitter.disabled = true;
        const { error: err } = await B.sb.auth.mfa.challengeAndVerify({ factorId, code });
        e.submitter.disabled = false;
        if (err) { $('#mfa-msg', box).textContent = tr('Code incorrect ou expiré. Réessayez avec le code affiché maintenant.'); return; }
        resolve(true);
      };
    };
    if (verified.length) {
      codeForm(verified[0].id, tr('Ouvrez votre appli d’authentification et tapez le code de Bivouac. Il est demandé une fois tous les 30 jours sur chaque appareil.'));
      return;
    }
    // Première fois : enregistrer l'appli d'authentification
    (async () => {
      for (const x of (f?.all || []).filter((y) => y.status !== 'verified')) await B.sb.auth.mfa.unenroll({ factorId: x.id }).catch(() => {});
      const { data: en, error: e2 } = await B.sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Bivouac ${new Date().toISOString().slice(0, 16)}` });
      if (e2) { box.innerHTML = `<p class="msg error">${esc(errText(e2))}</p>`; return resolve(false); }
      codeForm(en.id, tr('L’administration demande une double authentification. Installez une appli d’authentification (Microsoft Authenticator, Google Authenticator, Mots de passe d’Apple…), scannez ce QR code, puis tapez le code affiché.'));
      $('.admin-mfa p', box).insertAdjacentHTML('afterend', `<div class="mfa-qr"><img src="${esc(en.totp.qr_code)}" alt="${esc(tr('QR code à scanner'))}" width="180" height="180" />
        <p class="muted small">${tr('Pas de caméra ? Saisissez cette clé dans l’appli :')} <code translate="no">${esc(en.totp.secret)}</code></p></div>`);
    })();
  });
}

// ---------- Page ----------

const ADMIN_TABS = () => [
  ['signalements', 'flag', tr('Signalements'), false],
  ['surveiller', 'eye', tr('Comptes à surveiller'), false],
  ['ia', 'bot', tr('Santé des IA'), false],
  ['utilisateurs', 'users', tr('Utilisateurs'), true],
  ['projets', 'folder', tr('Projets'), true],
  ['equipe', 'key', tr('Équipe Bivouac'), true],
  ['journal', 'list', tr('Journal'), true]
];

B.pages.admin = async (view, [tab = 'signalements']) => {
  await B.loadStaff();
  if (!B.isStaff()) { location.hash = '#/home'; return; }
  const tabs = ADMIN_TABS().filter((t) => !t[3] || B.isPlatformAdmin());
  if (!tabs.some((t) => t[0] === tab)) tab = 'signalements';
  view.innerHTML = `<div class="page admin-page">
    <div class="page-head"><h1>${tr('Administration')}</h1>
      <span class="tag">${esc(ROLE_NAMES()[B.staff.role])}</span></div>
    <p class="muted small">${icon('lock', 13)} ${tr('Chaque action est notée au journal. Les messages privés ne sont jamais lisibles, sauf un message privé signalé par son destinataire.')}</p>
    <div id="admin-body"></div></div>`;
  const body = $('#admin-body', view);
  if (B.staff.connector) { body.innerHTML = `<p class="msg error">${tr('Les outils d’administration ne sont pas accessibles par le connecteur des IA.')}</p>`; return; }
  if (!B.staff.aal2) {
    const ok = await mfaGate(body);
    if (!ok || !view.isConnected) return;
    await B.loadStaff();
  }
  body.innerHTML = `<nav class="tabs admin-tabs">${tabs.map(([id, ic, label]) =>
      `<a href="#/admin/${id}" class="${id === tab ? 'on' : ''}">${icon(ic, 15)} ${esc(label)}</a>`).join('')}</nav>
    <div id="admin-tab"><div class="loading">${tr('Chargement…')}</div></div>`;
  paintIcons(body);
  const box = $('#admin-tab', body);
  try {
    await ({ signalements: tabReports, surveiller: tabWatch, ia: tabAiWatch, utilisateurs: tabUsers, projets: tabProjects, equipe: tabStaff, journal: tabLog })[tab](box);
  } catch (err) {
    box.innerHTML = `<p class="msg error">${esc(errText(err))}</p>`;
  }
};


// ---------- Signalements ----------

async function tabReports(box, open = true) {
  const list = await rpc('admin_reports', { p_open: open, p_limit: 150 });
  box.innerHTML = `<div class="admin-tools"><div class="seg">
      <button class="${open ? 'on' : ''}" data-open="1">${tr('À traiter')}</button>
      <button class="${open ? '' : 'on'}" data-open="0">${tr('Traités')}</button></div></div>
    ${list.length ? list.map((r) => `<div class="report-row admin-row ${r.urgent ? 'urgent' : ''}">
      <div class="report-text">
        <b>${r.urgent ? `<span class="tag danger-tag">${tr('Urgent')}</span> ` : ''}<span class="tag">${esc(TARGETS()[r.target_type] || r.target_type)}</span> ${esc(r.reason)}</b>
        ${r.excerpt ? `<blockquote class="small report-quote" translate="no">${esc(r.excerpt)}</blockquote>` : ''}
        <span class="muted small">${tr('Signalé par {who}', { who: `<span translate="no">${esc(r.reporter_name)}</span>` })}
          ${r.target_name ? ` · ${tr('concerne {who}', { who: `<span translate="no">${esc(r.target_name)}</span>` })}${r.reports_on_user > 1 ? ` (${tr('{n} signalements', { n: r.reports_on_user })})` : ''}` : ''}
          ${r.project_name ? ` · <span translate="no">${esc(r.project_name)}</span>` : ''} · ${timeAgo(r.created_at)}
          ${r.handled_at ? ` · ${tr('traité par {who}', { who: `<span translate="no">${esc(r.handled_name || '?')}</span>` })}${r.staff_note ? ` : <span translate="no">${esc(r.staff_note)}</span>` : ''}` : ''}</span>
      </div>
      <button class="btn small ${open ? 'primary' : ''}" data-see="${r.id}">${tr('Examiner')}</button></div>`).join('')
      : `<p class="muted">${open ? tr('Aucun signalement à traiter.') : tr('Aucun signalement traité pour l’instant.')}</p>`}`;
  $$('[data-open]', box).forEach((b) => (b.onclick = () => tabReports(box, b.dataset.open === '1').catch(B.error)));
  $$('[data-see]', box).forEach((b) => (b.onclick = () => openReport(b.dataset.see, () => tabReports(box, open))));
}

/** Fenêtre d'examen d'un signalement : contenu, contexte, et les gestes possibles */
async function openReport(id, done) {
  let c;
  try { c = await rpc('admin_report_context', { p_report: id }); } catch (err) { return B.error(err); }
  const r = c.report, t = c.target, u = c.user, p = c.project;
  const kind = c.kind || r.target_type;
  const ctx = (c.context || []).map((x) => `<div class="admin-ctx ${x.target ? 'target' : ''}"><b translate="no">${esc(x.author)}</b>
    <small class="muted">${when(x.created_at)}</small><div translate="no">${md(x.content || '')}</div></div>`).join('');
  const m = B.modal(`<h2>${icon('flag', 16)} ${tr('Signalement')} · ${esc(TARGETS()[r.target_type] || r.target_type)}</h2>
    <p><b>${esc(r.reason)}</b>${r.urgent ? ` <span class="tag danger-tag">${tr('Urgent')}</span>` : ''}</p>
    ${t ? `<div class="admin-target">
      <p class="muted small">${tr('Auteur : {who}', { who: `<span translate="no">${esc(t.author)}</span>` })} · ${when(t.created_at)}
        ${t.hidden_at ? ` · <span class="tag late">${tr('Masqué')}</span>` : ''}</p>
      ${t.title ? `<p><b translate="no">${esc(t.title)}</b></p>` : ''}
      ${t.name ? `<p>${icon('file', 15)} <span translate="no">${esc(t.name)}</span> (${fmtSize(t.size)}) <button class="btn small" id="ar-file">${tr('Voir le document')}</button></p>` : ''}
      ${ctx ? `<div class="admin-ctx-list">${ctx}</div>` : t.content ? `<div class="admin-ctx target" translate="no">${md(t.content)}</div>` : ''}
    </div>` : kind === 'project' || kind === 'profile' ? '' : `<p class="muted">${tr('Le contenu signalé n’existe plus.')}</p>`}
    ${p ? `<p class="small">${icon('folder', 14)} <b translate="no">${esc(p.name)}</b> · ${tr('Créateur : {who}', { who: `<span translate="no">${esc(p.owner)}</span>` })}
      · ${tr('{n} membres', { n: p.members })} · ${tr('{n} messages', { n: p.messages })} · ${tr('{n} documents', { n: p.files })}</p>` : ''}
    ${u ? `<p class="small">${icon('users', 14)} <b translate="no">${esc(u.name)}</b> <span class="muted" translate="no">@${esc(u.handle)}</span>
      · ${tr('inscrit le {date}', { date: fmtDate(u.created_at) })} · ${tr('{n} signalements', { n: u.reports })} ${statusTag(u)}</p>` : ''}
    <div class="actions admin-actions">
      ${t && !t.hidden_at ? `<button class="btn" id="ar-hide">${icon('eyeoff', 14)} ${tr('Masquer')}</button>` : ''}
      ${t && t.hidden_at ? `<button class="btn" id="ar-unhide">${icon('eye', 14)} ${tr('Réafficher')}</button>` : ''}
      ${(t?.author_id || u) && !u?.staff ? `<button class="btn" id="ar-suspend">${tr('Suspendre l’auteur')}</button>` : ''}
      ${p && B.isPlatformAdmin() ? `<button class="btn" id="ar-open">${tr('Mode administration')}</button>` : ''}
      <span class="spacer"></span>
      <button class="btn" data-close>${tr('Fermer')}</button>
      ${r.handled_at ? '' : `<button class="btn primary" id="ar-done">${icon('check', 14)} ${tr('Traité')}</button>`}
    </div>`, { wide: true });
  $('[data-close]', m).onclick = B.closeModal;
  const after = () => { done?.(); };
  $('#ar-file', m) && ($('#ar-file', m).onclick = async () => {
    try { window.bivouac.openExternal(await B.fileUrl(t.path)); } catch (err) { B.error(err); }
  });
  $('#ar-hide', m) && ($('#ar-hide', m).onclick = async () => {
    const a = await ask({ title: tr('Masquer ce contenu'), intro: tr('Il ne sera plus visible que par son auteur, qui recevra cette raison dans Messages.'),
      placeholder: tr('ex. Propos insultants envers un membre'), ok: tr('Masquer') });
    if (!a) return;
    try { await rpc('admin_set_hidden', { p_type: kind, p_id: t.id, p_hide: true, p_reason: a.text }); B.toast(tr('Contenu masqué. L’auteur a reçu la raison.'), { type: 'success' }); after(); }
    catch (err) { B.error(err); }
  });
  $('#ar-unhide', m) && ($('#ar-unhide', m).onclick = async () => {
    try { await rpc('admin_set_hidden', { p_type: kind, p_id: t.id, p_hide: false, p_reason: null }); B.closeModal(); B.toast(tr('Contenu réaffiché.'), { type: 'success' }); after(); }
    catch (err) { B.error(err); }
  });
  $('#ar-suspend', m) && ($('#ar-suspend', m).onclick = () => suspend(t?.author_id || u.id, t?.author || u.name).then((ok) => ok && after()));
  $('#ar-open', m) && ($('#ar-open', m).onclick = () => openProject(p.id, p.name));
  $('#ar-done', m) && ($('#ar-done', m).onclick = async () => {
    const a = await ask({ title: tr('Marquer comme traité'), intro: tr('La personne qui a signalé sera remerciée dans Messages. La note reste interne.'),
      label: tr('Note interne (facultatif)'), min: 0, ok: tr('Traité') });
    if (!a) return;
    try { await rpc('admin_handle_report', { p_report: r.id, p_note: a.text || null }); after(); } catch (err) { B.error(err); }
  });
}

/** Suspendre une personne (1, 7 ou 30 jours) ; renvoie true si c'est fait */
async function suspend(userId, name) {
  const a = await ask({ title: tr('Suspendre {name}', { name }), intro: tr('Pendant la suspension, la personne peut lire mais plus rien écrire. Elle reçoit la raison dans Messages.'),
    choices: [['1', tr('1 jour')], ['7', tr('7 jours')], ['30', tr('30 jours')]], placeholder: tr('ex. Spam répété malgré un avertissement'), ok: tr('Suspendre'), danger: true });
  if (!a) return false;
  try { await rpc('admin_suspend', { p_user: userId, p_days: Number(a.choice), p_reason: a.text }); B.toast(tr('Compte suspendu.'), { type: 'success' }); return true; }
  catch (err) { B.error(err); return false; }
}

// ---------- Comptes à surveiller (comportement seulement) ----------

async function tabWatch(box) {
  const list = await rpc('admin_watchlist');
  const chip = (n, label, warn) => n ? `<span class="tag ${warn ? 'late' : ''}">${esc(label)} : ${n}</span>` : '';
  box.innerHTML = `<p class="muted small">${tr('Calculé à partir du comportement (rythme d’envoi, signalements reçus, âge du compte), jamais à partir du contenu des messages.')}</p>
    ${list.length ? list.map((w) => `<div class="admin-row">
      <div class="report-text"><b translate="no">${esc(w.name)}</b> <span class="muted small" translate="no">@${esc(w.handle)}</span> ${statusTag(w)}
        <div class="chips">${chip(w.reports_30d, tr('signalements (30 j)'), w.reports_30d > 1)}${chip(w.messages_24h, tr('messages (24 h)'), w.messages_24h >= 300)}
          ${chip(w.dms_24h, tr('messages privés (24 h)'), w.dms_24h >= 150)}${chip(w.projects_7d, tr('projets créés (7 j)'), w.projects_7d >= 5)}
          ${chip(w.invites_7d, tr('invitations (7 j)'), w.invites_7d >= 30)}${chip(w.files_24h, tr('fichiers (24 h)'), w.files_24h >= 50)}
          <span class="tag">${tr('compte de {n} j', { n: w.age_days })}</span></div></div>
      <button class="btn small" data-suspend="${w.id}" data-name="${esc(w.name)}">${tr('Suspendre')}</button></div>`).join('')
      : `<p class="muted">${tr('Aucun compte à surveiller en ce moment.')}</p>`}`;
  $$('[data-suspend]', box).forEach((b) => (b.onclick = async () => { if (await suspend(b.dataset.suspend, b.dataset.name)) tabWatch(box); }));
}

// ---------- Santé des IA (migration 045, fonction serveur veille-ia) ----------

const WATCH_STATUS = () => ({ ok: [tr('OK'), 'ok-tag'], alerte: [tr('À vérifier'), 'late'], panne: [tr('En panne'), 'danger-tag'],
  inconnu: [tr('Illisible'), 'unknown-tag'] });
const WATCH_KINDS = () => [['sante', tr('Ce que Bivouac appelle')], ['statut', tr('Pages d’état des fournisseurs')],
  ['veille', tr('Annonces des fournisseurs')], ['version', tr('Bibliothèques du connecteur')]];

/** Tableau d'état de chaque contrôle ; les alertes arrivent aussi aux admins dans Messages → Équipe Bivouac */
async function tabAiWatch(box) {
  const w = await rpc('admin_ai_watch');
  const run = w.runs[0];
  const probs = w.checks.filter((c) => c.status === 'alerte' || c.status === 'panne').length;
  const row = (c) => {
    const [label, cls] = WATCH_STATUS()[c.status] || [c.status, ''];
    return `<div class="admin-row watch-row" data-watch="${esc(c.key)}">
      <span class="tag ${cls}">${esc(label)}</span>
      <div class="report-text"><b>${esc(c.label)}</b>
        <span class="small" translate="no">${esc(c.summary)}</span>
        <span class="muted small">${tr('Contrôlé {when}', { when: timeAgo(c.checked_at) })} · ${tr('dernier changement {when}', { when: timeAgo(c.changed_at) })}
          ${c.url ? ` · <a href="${esc(c.url)}" class="ext">${tr('Ouvrir la source')}</a>` : ''}</span></div></div>`;
  };
  box.innerHTML = `<p class="muted small">${tr('Chaque matin à 7 h, Bivouac vérifie ses liaisons avec les IA (connecteur, adresses des fournisseurs) et lit leurs annonces (modèles retirés, nouvelles versions). Les admins reçoivent un message dans Messages → Équipe Bivouac seulement quand quelque chose change ou casse.')}</p>
    <div class="admin-tools">
      ${run ? `<span class="small">${run.error ? `<span class="tag danger-tag">${tr('Échec')}</span> ` : ''}${tr('Dernière vérification : {when}', { when: when(run.started_at) })}
        (${run.trigger === 'auto' ? tr('automatique') : tr('à la demande')})${run.error ? '' : ` · ${tr(probs > 1 ? '{n} problèmes' : '{n} problème', { n: probs })}`}</span>`
        : `<span class="small muted">${tr('Aucune vérification pour l’instant.')}</span>`}
      <span class="spacer"></span>
      ${B.isPlatformAdmin() ? `<button class="btn small primary" id="aw-run">${icon('spark', 14)} ${tr('Vérifier maintenant')}</button>` : ''}
    </div>
    ${w.checks.length ? WATCH_KINDS().map(([k, title]) => {
      const list = w.checks.filter((c) => c.kind === k);
      return list.length ? `<section class="watch-group"><h3>${esc(title)}</h3>${list.map(row).join('')}</section>` : '';
    }).join('') : ''}`;
  paintIcons(box);
  const btn = $('#aw-run', box);
  if (btn) btn.onclick = async () => {
    btn.disabled = true;
    btn.textContent = tr('Vérification en cours… (30 secondes environ)');
    try {
      const r = await serverAction({ manual: true }, 'veille-ia');
      B.toast(r?.changes ? tr('Vérification faite : {n} changement(s), message envoyé aux admins.', { n: r.changes }) : tr('Vérification faite : rien de nouveau.'), { type: 'success' });
    } catch (err) { B.error(err); }
    tabAiWatch(box).catch(B.error);
  };
}

// ---------- Utilisateurs (admins) ----------

async function tabUsers(box, search = '') {
  const list = await rpc('admin_users', { p_search: search || null, p_limit: 150 });
  box.innerHTML = `<div class="admin-tools"><input id="au-q" type="search" placeholder="${esc(tr('Nom, pseudo ou e-mail…'))}" value="${esc(search)}" /></div>
    <p class="muted small">${tr(list.length > 1 ? '{n} personnes' : '{n} personne', { n: list.length })}</p>
    ${list.map((u) => `<div class="admin-row">
      <div class="report-text"><b translate="no">${esc(u.name)}</b> <span class="muted small" translate="no">@${esc(u.handle)} · ${esc(u.email || '')}</span>
        ${u.role ? `<span class="tag">${esc(ROLE_NAMES()[u.role])}</span>` : ''} ${statusTag(u)}
        <div class="muted small">${tr('Inscrit le {date}', { date: fmtDate(u.created_at) })}${u.last_sign_in_at ? ` · ${tr('dernière connexion {when}', { when: timeAgo(u.last_sign_in_at) })}` : ''}
          · ${tr('{n} projets', { n: u.projects })}${u.reports ? ` · ${tr('{n} signalements', { n: u.reports })}` : ''}</div></div>
      ${u.role || u.id === B.me.id ? '' : `<div class="admin-btns">
        ${u.suspended_until && new Date(u.suspended_until) > new Date()
          ? `<button class="btn small" data-unsuspend="${u.id}">${tr('Lever la suspension')}</button>`
          : `<button class="btn small" data-suspend="${u.id}" data-name="${esc(u.name)}">${tr('Suspendre')}</button>`}
        ${u.banned_at ? `<button class="btn small" data-unban="${u.id}">${tr('Rouvrir le compte')}</button>`
          : `<button class="btn small danger" data-ban="${u.id}" data-name="${esc(u.name)}">${tr('Fermer le compte')}</button>`}</div>`}
    </div>`).join('')}`;
  const q = $('#au-q', box);
  q.addEventListener('keydown', (e) => { if (e.key === 'Enter') tabUsers(box, q.value.trim()).catch(B.error); });
  const again = () => tabUsers(box, search).catch(B.error);
  $$('[data-suspend]', box).forEach((b) => (b.onclick = async () => { if (await suspend(b.dataset.suspend, b.dataset.name)) again(); }));
  $$('[data-unsuspend]', box).forEach((b) => (b.onclick = async () => {
    try { await rpc('admin_suspend', { p_user: b.dataset.unsuspend, p_days: 0, p_reason: null }); again(); } catch (err) { B.error(err); }
  }));
  $$('[data-ban]', box).forEach((b) => (b.onclick = async () => {
    const a = await ask({ title: tr('Fermer le compte de {name}', { name: b.dataset.name }),
      intro: tr('La personne ne pourra plus se connecter. Ses données restent (preuves) jusqu’à une décision de suppression.'), ok: tr('Fermer le compte'), danger: true });
    if (!a) return;
    try { await serverAction({ action: 'ban', user: b.dataset.ban, reason: a.text }); B.toast(tr('Compte fermé.'), { type: 'success' }); again(); } catch (err) { B.error(err); }
  }));
  $$('[data-unban]', box).forEach((b) => (b.onclick = async () => {
    try { await serverAction({ action: 'unban', user: b.dataset.unban, reason: '' }); again(); } catch (err) { B.error(err); }
  }));
}

// ---------- Projets (admins) ----------

async function tabProjects(box, search = '') {
  const list = await rpc('admin_projects', { p_search: search || null, p_limit: 150 });
  box.innerHTML = `<div class="admin-tools"><input id="ap-q" type="search" placeholder="${esc(tr('Nom du projet…'))}" value="${esc(search)}" /></div>
    <p class="muted small">${tr('{n} projets', { n: list.length })} · ${tr('Seules les informations générales sont affichées. Le contenu ne s’ouvre qu’en mode administration, avec un motif.')}</p>
    ${list.map((p) => `<div class="admin-row">
      <span class="space-ico" style="background:${esc(p.color)}">${projectIcon(p, 14)}</span>
      <div class="report-text"><b translate="no">${esc(p.name)}</b>
        <div class="muted small">${tr('Créateur : {who}', { who: `<span translate="no">${esc(p.owner)}</span>` })} · ${tr('{n} membres', { n: p.members })}
          · ${tr('créé le {date}', { date: fmtDate(p.created_at) })}${p.last_activity ? ` · ${tr('actif {when}', { when: timeAgo(p.last_activity) })}` : ''}
          · ${p.files_mb} ${tr('Mo')}${p.reports ? ` · <b>${tr('{n} signalements', { n: p.reports })}</b>` : ''}</div></div>
      <div class="admin-btns"><button class="btn small" data-open="${p.id}" data-name="${esc(p.name)}">${tr('Mode administration')}</button>
        <button class="btn small danger" data-del="${p.id}" data-name="${esc(p.name)}">${tr('Supprimer')}</button></div></div>`).join('')}`;
  const q = $('#ap-q', box);
  q.addEventListener('keydown', (e) => { if (e.key === 'Enter') tabProjects(box, q.value.trim()).catch(B.error); });
  $$('[data-open]', box).forEach((b) => (b.onclick = () => openProject(b.dataset.open, b.dataset.name)));
  $$('[data-del]', box).forEach((b) => (b.onclick = async () => {
    const a = await ask({ title: tr('Supprimer « {name} »', { name: b.dataset.name }),
      intro: tr('Le projet et tout son contenu seront supprimés définitivement. Chaque membre recevra la raison dans Messages.'), ok: tr('Supprimer'), danger: true });
    if (!a) return;
    try { await rpc('admin_delete_project', { p_project: b.dataset.del, p_reason: a.text }); B.toast(tr('Projet supprimé.'), { type: 'success' }); tabProjects(box, search); }
    catch (err) { B.error(err); }
  }));
}

/** Mode administration : lecture seule d'un projet (motif obligatoire, noté au journal, visible dans l'activité du projet) */
async function openProject(id, name) {
  const a = await ask({ title: tr('Ouvrir « {name} » en mode administration', { name }),
    intro: tr('Lecture seule. Votre motif est noté au journal et les membres verront dans l’activité du projet que l’équipe Bivouac l’a consulté.'),
    label: tr('Motif'), placeholder: tr('ex. Signalement d’arnaque du 24/11'), ok: tr('Ouvrir') });
  if (!a) return;
  let s;
  try { s = await rpc('admin_open_project', { p_project: id, p_reason: a.text }); } catch (err) { return B.error(err); }
  const row = (type, x, text) => `<div class="admin-ctx ${x.hidden_at ? 'is-hidden' : ''}">${text}
    ${x.hidden_at ? `<span class="tag late">${tr('Masqué')}</span>` : `<button class="link small" data-hide="${type}:${x.id}">${tr('Masquer')}</button>`}</div>`;
  const m = B.modal(`<h2>${icon('lock', 16)} <span translate="no">${esc(s.project.name)}</span></h2>
    <p class="muted small">${tr('Mode administration · lecture seule')} · ${tr('Créateur : {who}', { who: `<span translate="no">${esc(s.project.owner)}</span>` })}</p>
    <h3>${tr('Membres')}</h3>
    <div class="admin-members">${s.members.map((x) => `<span class="tag" translate="no">${esc(x.name)} · ${esc(x.role)}</span>`).join(' ')}</div>
    <div class="actions"><select id="ao-owner">${s.members.filter((x) => x.role !== 'owner').map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select>
      <button class="btn small" id="ao-transfer" ${s.members.length > 1 ? '' : 'disabled'}>${tr('Confier le projet à cette personne')}</button></div>
    ${s.channels.map((c) => `<details class="admin-chan"><summary translate="no">${esc(c.name)} (${c.messages.length})</summary>
      ${c.messages.map((x) => row('message', x, `<b translate="no">${esc(x.author)}</b> <small class="muted">${when(x.created_at)}</small><div translate="no">${md(x.content || '')}</div>`)).join('') || `<p class="muted small">${tr('Aucun message')}</p>`}</details>`).join('')}
    <details class="admin-chan"><summary>${tr('Tâches')} (${s.tasks.length})</summary>${s.tasks.map((x) => row('task', x, `<span translate="no">${esc(x.title)}</span>`)).join('')}</details>
    <details class="admin-chan"><summary>${tr('Tout le projet')} (${s.items.length})</summary>${s.items.map((x) => row('item', x, `<span translate="no">${esc(x.title)}</span>`)).join('')}</details>
    <details class="admin-chan"><summary>${tr('Documents')} (${s.files.length})</summary>${s.files.map((x) => row('file', x, `<span translate="no">${esc(x.name)}</span> <small class="muted">${fmtSize(x.size)} · ${esc(x.author)}</small>`)).join('')}</details>
    <div class="actions"><span class="spacer"></span><button class="btn" data-close>${tr('Fermer')}</button></div>`, { wide: true });
  $('[data-close]', m).onclick = B.closeModal;
  $('#ao-transfer', m).onclick = async () => {
    const who = $('#ao-owner', m);
    const b = await ask({ title: tr('Confier le projet à {name}', { name: who.selectedOptions[0]?.textContent || '' }),
      intro: tr('Cette personne devient Créatrice ; l’ancien Créateur reste Administrateur. Les deux sont prévenus.'), ok: tr('Confier') });
    if (!b) return;
    try { await rpc('admin_transfer_project', { p_project: id, p_user: who.value, p_reason: b.text }); B.toast(tr('Projet transféré.'), { type: 'success' }); }
    catch (err) { B.error(err); }
  };
  $$('[data-hide]', m).forEach((btn) => (btn.onclick = async () => {
    const [type, tid] = btn.dataset.hide.split(':');
    const b = await ask({ title: tr('Masquer ce contenu'), intro: tr('Il ne sera plus visible que par son auteur, qui recevra cette raison dans Messages.'), ok: tr('Masquer') });
    if (!b) return;
    try { await rpc('admin_set_hidden', { p_type: type, p_id: tid, p_hide: true, p_reason: b.text }); B.toast(tr('Contenu masqué. L’auteur a reçu la raison.'), { type: 'success' }); }
    catch (err) { B.error(err); }
  }));
}

// ---------- Équipe Bivouac (admins) ----------

async function tabStaff(box) {
  const [staff, factors] = await Promise.all([rpc('admin_staff'), B.sb.auth.mfa.listFactors()]);
  const mine = (factors.data?.totp || []).filter((f) => f.status === 'verified');
  box.innerHTML = `<section class="card"><div class="card-head"><h2>${tr('Rôles')}</h2></div>
    <p class="muted small">${tr('Modérateur : signalements, masquer, suspendre, comptes à surveiller. Admin : tout, plus utilisateurs, projets, rôles et journal.')}</p>
    ${staff.map((s) => `<div class="admin-row"><div class="report-text"><b translate="no">${esc(s.name)}</b>
      <span class="muted small">${s.granted_by ? tr('nommé par {who}', { who: `<span translate="no">${esc(s.granted_by)}</span>` }) + ' · ' : ''}${fmtDate(s.granted_at)}</span></div>
      <select data-role="${s.id}"><option value="admin" ${s.role === 'admin' ? 'selected' : ''}>${tr('Admin')}</option>
        <option value="moderator" ${s.role === 'moderator' ? 'selected' : ''}>${tr('Modérateur')}</option><option value="">${tr('Retirer le rôle')}</option></select>
      ${s.id === B.me.id ? '' : `<button class="btn small" data-mfa="${s.id}" data-name="${esc(s.name)}" title="${esc(tr('Téléphone perdu : la personne enregistrera une nouvelle appli à sa prochaine visite'))}">${tr('Réinitialiser sa double authentification')}</button>`}</div>`).join('')}
    <div class="admin-tools"><input id="as-q" type="search" placeholder="${esc(tr('Ajouter : nom, pseudo ou e-mail…'))}" /><div id="as-found"></div></div></section>
    <section class="card"><div class="card-head"><h2>${tr('Mes appareils de double authentification')}</h2></div>
      <p class="muted small">${tr('Enregistrez un second appareil (autre téléphone, 1Password…) pour ne pas être bloqué si vous perdez le premier.')}</p>
      ${mine.map((f) => `<div class="admin-row"><span>${icon('key', 14)} <span translate="no">${esc(f.friendly_name || 'TOTP')}</span> · ${fmtDate(f.created_at)}</span>
        ${mine.length > 1 ? `<button class="link small danger" data-unenroll="${f.id}">${tr('Retirer')}</button>` : ''}</div>`).join('')}
      <button class="btn small" id="as-add">${icon('plus', 14)} ${tr('Ajouter un appareil')}</button><div id="as-enroll"></div></section>`;
  paintIcons(box);
  $$('[data-role]', box).forEach((sel) => (sel.onchange = async () => {
    try { await rpc('admin_set_role', { p_user: sel.dataset.role, p_role: sel.value || null }); tabStaff(box); } catch (err) { B.error(err); tabStaff(box); }
  }));
  $$('[data-mfa]', box).forEach((b) => (b.onclick = async () => {
    if (!(await B.confirm(tr('Réinitialiser la double authentification de {name} ? Elle devra enregistrer une appli à sa prochaine visite de l’administration.', { name: b.dataset.name }), tr('Réinitialiser')))) return;
    try { await serverAction({ action: 'reset_mfa', user: b.dataset.mfa }); B.toast(tr('Double authentification réinitialisée.'), { type: 'success' }); } catch (err) { B.error(err); }
  }));
  const q = $('#as-q', box);
  q.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter' || !q.value.trim()) return;
    try {
      const found = (await rpc('admin_users', { p_search: q.value.trim(), p_limit: 8 })).filter((u) => !u.role);
      $('#as-found', box).innerHTML = found.map((u) => `<div class="admin-row"><span><b translate="no">${esc(u.name)}</b> <small class="muted" translate="no">${esc(u.email || '')}</small></span>
        <button class="btn small" data-give="${u.id}" data-r="moderator">${tr('Nommer modérateur')}</button>
        <button class="btn small" data-give="${u.id}" data-r="admin">${tr('Nommer admin')}</button></div>`).join('') || `<p class="muted small">${tr('Aucune personne trouvée.')}</p>`;
      $$('[data-give]', box).forEach((b) => (b.onclick = async () => {
        try { await rpc('admin_set_role', { p_user: b.dataset.give, p_role: b.dataset.r }); tabStaff(box); } catch (err) { B.error(err); }
      }));
    } catch (err) { B.error(err); }
  });
  $$('[data-unenroll]', box).forEach((b) => (b.onclick = async () => {
    const { error } = await B.sb.auth.mfa.unenroll({ factorId: b.dataset.unenroll });
    if (error) return B.error(error);
    tabStaff(box);
  }));
  $('#as-add', box).onclick = async () => {
    const { data: en, error } = await B.sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Bivouac ${new Date().toISOString().slice(0, 16)}` });
    if (error) return B.error(error);
    const z = $('#as-enroll', box);
    z.innerHTML = `<div class="mfa-qr"><img src="${esc(en.totp.qr_code)}" alt="${esc(tr('QR code à scanner'))}" width="180" height="180" />
      <p class="muted small">${tr('Pas de caméra ? Saisissez cette clé dans l’appli :')} <code translate="no">${esc(en.totp.secret)}</code></p></div>
      <form class="mfa-form"><label for="as-code">${tr('Code à 6 chiffres')}</label><input id="as-code" inputmode="numeric" maxlength="6" required />
      <button class="btn primary" type="submit">${tr('Valider')}</button></form>`;
    $('form', z).onsubmit = async (e) => {
      e.preventDefault();
      const { error: err } = await B.sb.auth.mfa.challengeAndVerify({ factorId: en.id, code: $('#as-code', z).value.replace(/\D/g, '') });
      if (err) return B.toast(tr('Code incorrect ou expiré. Réessayez avec le code affiché maintenant.'), { type: 'error' });
      B.toast(tr('Appareil ajouté.'), { type: 'success' });
      tabStaff(box);
    };
  };
}

// ---------- Journal (admins) ----------

async function tabLog(box, before = null, append = false) {
  const list = await rpc('admin_audit_log', { p_before: before, p_limit: 100 });
  const html = list.map((a) => `<div class="admin-row log-row"><span class="muted small">${when(a.created_at)}</span>
    <span><b translate="no">${esc(a.actor || '?')}</b> ${esc(ACTIONS()[a.action] || a.action)}${a.target_user ? ` · <span translate="no">${esc(a.target_user)}</span>` : ''}
      ${a.project ? ` · <span translate="no">${esc(a.project)}</span>` : ''}${a.reason ? ` — <i translate="no">${esc(a.reason)}</i>` : ''}</span></div>`).join('');
  if (!append) box.innerHTML = `<p class="muted small">${tr('Le journal ne peut être ni modifié ni effacé, même par un admin.')}</p><div id="log-list"></div>`;
  $('#log-list', box).insertAdjacentHTML('beforeend', html || (append ? '' : `<p class="muted">${tr('Rien pour l’instant.')}</p>`));
  $('#log-more', box)?.remove();
  if (list.length === 100) {
    $('#log-list', box).insertAdjacentHTML('afterend', `<button class="btn small" id="log-more">${tr('Plus ancien')}</button>`);
    $('#log-more', box).onclick = () => tabLog(box, list[list.length - 1].created_at, true).catch(B.error);
  }
}
