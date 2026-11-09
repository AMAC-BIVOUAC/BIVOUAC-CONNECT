// =====================================================================
// app.js — démarrage, connexion, navigation entre les pages
// =====================================================================

paintIcons();

function showScreen(which) {
  $('#login').classList.toggle('hidden', which !== 'login');
  $('#app').classList.toggle('hidden', which !== 'app');
}

function loginMsg(text, isError = false) {
  const el = $('#login-msg');
  el.textContent = text;
  el.classList.toggle('error', isError);
}

// ---------------------------------------------------------------------
// Navigation : #/home, #/projects, #/notifications, #/settings, #/p/<id>/<onglet>/<sous-page>
// ---------------------------------------------------------------------

let routing = 0;
B.route = async () => {
  if (!B.me) return;
  const id = ++routing;
  B.leavePage();
  const parts = (location.hash || '#/home').replace(/^#\//, '').split('/');
  const view = $('#view');
  view.scrollTop = 0;
  B.highlightNav();
  try {
    const [page, ...params] = parts;
    if (page !== 'p' || params[0] !== B.lastProjectId) B.leaveProject();
    B.lastProjectId = page === 'p' ? params[0] : null;
    if (page === 'p') await B.pages.project(view, params);
    else if (B.pages[page]) await B.pages[page](view, params);
    else await B.pages.home(view, []);
    if (id === routing) { paintIcons(view); B.paintUnread(); }
  } catch (err) {
    B.error(err);
  }
};
window.addEventListener('hashchange', B.route);

// ---------------------------------------------------------------------
// Connexion : e-mail + mot de passe (création de compte au premier passage)
// ---------------------------------------------------------------------

let signupMode = false;
$('#auth-toggle').addEventListener('click', () => {
  signupMode = !signupMode;
  $('#auth-submit').textContent = signupMode ? tr('Créer mon compte') : tr('Se connecter');
  $('#auth-toggle').textContent = signupMode ? tr('Déjà un compte ? Se connecter') : tr('Pas encore de compte ? Créer un compte');
  $('#login-sub').textContent = signupMode
    ? tr('Choisissez votre e-mail et un mot de passe (8 caractères minimum).')
    : tr('Connectez-vous avec votre e-mail et votre mot de passe.');
  $('#pass-input').autocomplete = signupMode ? 'new-password' : 'current-password';
  // Inscription : informations personnelles obligatoires (sauf téléphone et adresse)
  $('#signup-fields').classList.toggle('hidden', !signupMode);
  $('#forgot').classList.toggle('hidden', signupMode);
  ['#pass2-input', '#su-first', '#su-last', '#su-gender', '#su-birth'].forEach((s) => ($(s).required = signupMode));
  $('#su-birth').max = new Date().toISOString().slice(0, 10);
  loginMsg('');
});

// Mot de passe oublié : e-mail avec un lien vers la page publique « Nouveau mot de passe »
$('#forgot').addEventListener('click', async () => {
  const email = $('#email-input').value.trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) { $('#email-input').focus(); return loginMsg(tr('Écrivez d\'abord votre adresse e-mail ci-dessus.'), true); }
  $('#forgot').disabled = true;
  loginMsg(tr('Envoi…'));
  const { error } = await B.sb.auth.resetPasswordForEmail(email, { redirectTo: RESET_PAGE });
  $('#forgot').disabled = false;
  if (error) return loginMsg(/rate|limit|seconds/i.test(error.message || '') ? tr('Trop de demandes : réessayez dans quelques minutes.') : errText(error), true);
  loginMsg(tr('Si un compte existe pour {email}, un e-mail vient de partir avec un lien pour choisir un nouveau mot de passe (pensez aux spams).', { email }));
});

$('#email-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('#email-input').value.trim();
  const password = $('#pass-input').value;
  e.submitter.disabled = true;
  loginMsg(signupMode ? tr('Création du compte…') : tr('Connexion…'));
  let personal = null;
  if (signupMode) {
    personal = B.readPersonal($('#signup-fields'), 'su');
    const bad = B.checkPersonal(personal) || (password !== $('#pass2-input').value ? tr('Les deux mots de passe ne sont pas identiques.') : '');
    if (bad) { e.submitter.disabled = false; return loginMsg(bad, true); }
  }
  const { data, error } = signupMode
    ? await B.sb.auth.signUp({ email, password, options: { data: personal } })
    : await B.sb.auth.signInWithPassword({ email, password });
  e.submitter.disabled = false;
  if (error) return loginMsg(errText(error), true);
  if (signupMode && !data.session) {
    loginMsg(tr('Compte créé. Cliquez sur le lien de confirmation envoyé à {email} (pensez aux spams), puis revenez vous connecter ici.', { email }));
    $('#auth-toggle').click();
    return;
  }
  loginMsg('');
});

// ---------------------------------------------------------------------
// Invitation reçue par un lien (bivouac://rejoindre/K7QM-4TPX)
// Gardée tant qu'on n'est pas connecté, puis utilisée juste après la connexion
// ou la création du compte : on arrive directement dans le projet.
// ---------------------------------------------------------------------

B.pendingInvite = null;

function showInviteBanner() {
  const el = $('#login-invite');
  el.textContent = B.pendingInvite
    ? tr('Vous avez été invité dans un projet. Créez votre compte (ou connectez-vous) : vous y arriverez directement.')
    : '';
  el.classList.toggle('hidden', !B.pendingInvite);
  if (B.pendingInvite && !signupMode) $('#auth-toggle').click(); // la plupart des invités n'ont pas encore de compte
}

/** Utilise l'invitation en attente : renvoie l'id du projet rejoint, ou null */
async function useInvite() {
  const code = B.pendingInvite;
  if (!code || !B.me) return null;
  B.pendingInvite = null;
  try {
    const id = await B.joinProject(code);
    const p = B.project(id);
    B.toast(tr('Bienvenue dans « {name} » !', { name: esc(p?.name || '') }), { type: 'success' });
    return id;
  } catch (err) {
    B.toast(errText(err), { type: 'error', timeout: 10000 });
    return null;
  }
}

/** Récupère une invitation transmise par l'app (lien cliqué) */
async function takeInvite() {
  const code = await window.bivouac.takeInvite?.();
  if (!code) return;
  B.pendingInvite = code;
  if (!B.me) return showInviteBanner();
  const id = await useInvite();
  if (id) { B.renderSidebar(); location.hash = `#/p/${id}`; }
}
window.bivouac.onInvite?.(takeInvite);

// ---------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------

let sessionUser;
async function onSession(session) {
  const uid = session?.user?.id || null;
  if (uid === sessionUser) return;
  sessionUser = uid;

  if (!uid) {
    await B.voiceLeave();
    B.me = null;
    B.leavePage();
    B.sb.removeAllChannels();
    showScreen('login');
    showInviteBanner();
    return;
  }

  try {
    await B.loadMe(uid);
    await B.ensurePersonal(); // anciens comptes : prénom, nom, sexe, date de naissance à compléter
    if (sessionUser !== uid) return;
    showScreen('app');
    await Promise.all([B.loadProjects(), B.loadMyProviders()]);
    const joined = await useInvite(); // arrivé par un lien d'invitation : on rejoint le projet
    B.renderSidebar();
    B.loadUnread();
    B.startGlobalLive();
    B.startDmLive();
    B.refreshBadge();
    if (!B.me.onboarded) await B.runOnboarding();
    if (joined) location.hash = `#/p/${joined}`;
    await B.route();

    // Mes tâches du jour : une fois par jour, seulement s'il y a quelque chose d'urgent
    if (!joined) B.showTodayTasks();

    // Demandes d'IA reçues pendant mon absence
    (await B.pendingRequestsForMe()).forEach(B.showIncomingRequest);
  } catch (err) {
    B.error(err);
  }
}

B.on('projects', () => { if (B.me) { B.renderSidebar(); B.loadUnread(); B.syncOnline().catch(console.error); } });
B.on('unread', () => B.paintUnread());
B.on('me', () => { if (B.me) B.renderSidebar(); });
B.on('notification', (n) => {
  B.refreshBadge();
  if (n.type !== 'ai_request') {
    B.playSound('notif');
    window.bivouac.notify('Bivouac-Tech', n.text, B.soundPrefs().notif);
    B.toast(`${esc(n.text)}${n.link ? ` <a href="${esc(n.link)}">${tr('Ouvrir')}</a>` : ''}`);
  }
});
B.on('ai_request', (req) => B.showIncomingRequest(req));

// ---------------------------------------------------------------------
// Démarrage
// ---------------------------------------------------------------------

(async () => {
  if (!B.configured) {
    showScreen('login');
    $('#email-form').classList.add('hidden');
    loginMsg(tr('Configuration manquante : remplissez src/config.js avec votre projet Supabase (voir README).'), true);
    return;
  }
  B.pendingInvite = (await window.bivouac.takeInvite?.()) || null; // app ouverte par un lien d'invitation
  B.sb.auth.onAuthStateChange((_event, session) => setTimeout(() => onSession(session), 0));
  const { data } = await B.sb.auth.getSession();
  await onSession(data.session);
})();
