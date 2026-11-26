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
// Navigation : #/home, #/projects, #/messages, #/settings, #/p/<id>/<onglet>/<sous-page>
// (#/notifications ouvre la cloche ; …/atelier = Discussion, …/calendrier = Tâches)
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
$('#remember-input').checked = B.rememberMe();
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
  ['#pass2-input', '#su-first', '#su-last', '#su-birth'].forEach((s) => ($(s).required = signupMode));
  $('#su-birth').max = new Date().toISOString().slice(0, 10);
  // Âge déclaré et conditions (migration 034) : cases sous la date de naissance, bouton actif seulement quand elles sont cochées
  const box = $('#su-consent');
  if (signupMode && !box.dataset.ready) {
    box.dataset.ready = '1';
    box.innerHTML = B.consentFieldsHtml('su');
    B.bindConsent($('#signup-fields'), 'su', (ok) => { if (signupMode) $('#auth-submit').disabled = !ok; });
  }
  $('#auth-submit').disabled = signupMode && Boolean(B.checkConsent(B.readConsent($('#signup-fields'), 'su', $('#su-birth').value)));
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
  B.setRememberMe($('#remember-input').checked); // à poser AVANT la connexion : la session est rangée selon ce choix
  loginMsg(signupMode ? tr('Création du compte…') : tr('Connexion…'));
  let personal = null;
  if (signupMode) {
    personal = B.readPersonal($('#signup-fields'), 'su');
    const consent = B.readConsent($('#signup-fields'), 'su', personal.birth_date);
    const bad = B.checkPersonal(personal) || B.checkConsent(consent) || (password !== $('#pass2-input').value ? tr('Les deux mots de passe ne sont pas identiques.') : '');
    if (bad) { e.submitter.disabled = false; return loginMsg(bad, true); }
    // La base range ces cases avec la date et l'heure du serveur (handle_new_user, migration 034)
    const { birth_date, ...cases } = consent;
    personal = { ...personal, ...cases };
  }
  const { data, error } = signupMode
    ? await B.sb.auth.signUp({ email, password, options: { data: personal, emailRedirectTo: CONFIRM_PAGE } })
    : await B.sb.auth.signInWithPassword({ email, password });
  e.submitter.disabled = false;
  if (error) return loginMsg(errText(error), true);
  if (signupMode && !data.session) {
    // Adresse déjà inscrite : Supabase répond « succès » sans rien envoyer (identities vide), il faut se connecter
    const known = Array.isArray(data.user?.identities) && data.user.identities.length === 0;
    // Retenu sur ce poste : l'app rouverte propose « Se connecter », plus jamais l'inscription (25/11)
    store.set('awaiting-confirm', { email, known, until: Date.now() + 2 * 864e5 });
    $('#auth-toggle').click(); // passe en « Se connecter » (efface le message : il est écrit APRÈS)
    $('#email-input').value = email;
    showInviteBanner();
    loginMsg(known
      ? tr('Un compte existe déjà avec {email} : connectez-vous avec votre mot de passe.', { email })
      : tr('Compte créé. Cliquez sur le lien de confirmation envoyé à {email} (pensez aux spams), puis revenez vous connecter ici.', { email }));
    return;
  }
  store.set('awaiting-confirm', null);
  loginMsg('');
});

// ---------------------------------------------------------------------
// Invitation reçue par un lien (bivouac://rejoindre/K7QM-4TPX)
// Gardée tant qu'on n'est pas connecté, puis utilisée juste après la connexion
// ou la création du compte : on arrive directement dans le projet.
// ---------------------------------------------------------------------

B.pendingInvite = null;

/**
 * Garde l'invitation sur ce poste jusqu'à son utilisation (15 jours max) : elle survit à la confirmation
 * de l'adresse e-mail (lien ouvert dans un autre onglet, app fermée puis rouverte).
 */
function keepInvite(code) {
  B.pendingInvite = code || null;
  store.set('pending-invite', code ? { code, until: Date.now() + 15 * 864e5 } : null);
}
function storedInvite() {
  const v = store.get('pending-invite');
  return v && v.code && v.until > Date.now() ? v.code : null;
}

/** Compte créé sur ce poste, en attente de la confirmation de l'adresse (2 jours max) */
function awaitingConfirm() {
  const v = store.get('awaiting-confirm');
  return v && v.email && v.until > Date.now() ? v : null;
}

function showInviteBanner() {
  const el = $('#login-invite');
  const created = awaitingConfirm();
  el.textContent = !B.pendingInvite ? ''
    : created?.known
      ? tr('Vous avez été invité dans un projet. Connectez-vous : vous y arriverez directement.')
    : created
      ? tr('Votre compte est créé. Confirmez votre adresse (lien reçu par e-mail), puis connectez-vous ici : vous arriverez directement dans le projet.')
      : tr('Vous avez été invité dans un projet. Créez votre compte (ou connectez-vous) : vous y arriverez directement.');
  el.classList.toggle('hidden', !B.pendingInvite);
  if (created) {
    // Le compte existe déjà : on reste sur « Se connecter », jamais une 2e fois l'inscription
    if (signupMode) $('#auth-toggle').click();
    if (!$('#email-input').value) $('#email-input').value = created.email;
    return;
  }
  if (B.pendingInvite && !signupMode) $('#auth-toggle').click(); // la plupart des invités n'ont pas encore de compte
}

/**
 * Adresse confirmée : la page publique /confirmation/ (même site) laisse la session ouverte par le lien
 * de l'e-mail pendant 10 minutes ; on la reprend une fois, pour arriver connecté sans retaper son mot de passe.
 */
async function takeConfirmedSession() {
  const v = store.get('confirmed-session');
  if (!v) return;
  store.set('confirmed-session', null);
  if (!v.access_token || !v.refresh_token || !(v.until > Date.now())) return;
  const { error } = await B.sb.auth.setSession({ access_token: v.access_token, refresh_token: v.refresh_token });
  if (error) console.warn('Session de confirmation refusée', error);
}

/** Utilise l'invitation en attente : renvoie l'id du projet rejoint, ou null */
async function useInvite() {
  const code = B.pendingInvite;
  if (!code || !B.me) return null;
  keepInvite(null);
  try {
    const r = await B.useInviteCode(code);
    if (r.discover) { B.discoverArrived = r.discover; return null; } // « Faire découvrir Bivouac » : pas de projet à rejoindre
    const id = r.project;
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
  keepInvite(code);
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
  B.emit('session', uid); // pwa.js : le cache hors connexion change de propriétaire (ou se vide)

  if (!uid) {
    await B.voiceLeave();
    B.me = null;
    B.leavePage();
    B.sb.removeAllChannels();
    showScreen('login');
    showInviteBanner();
    if (store.get('account-gone')) { // compte supprimé ou fermé pendant la session (B.accountGone, core.js)
      store.set('account-gone', null);
      loginMsg(errText(new Error('compte:introuvable')), true);
    }
    return;
  }

  try {
    store.set('awaiting-confirm', null); // connecté : l'adresse est confirmée
    await B.loadMe(uid);
    await B.ensurePersonal(); // anciens comptes : prénom, nom, date de naissance à compléter
    B.autoFillTimeZone?.(); // fuseau horaire vide : rempli d'après l'appareil (lieu.js, migration 046)
    if (sessionUser !== uid) return;
    showScreen('app');
    await Promise.all([B.loadProjects(), B.loadMyProviders()]);
    const joined = await useInvite(); // arrivé par un lien d'invitation : on rejoint le projet
    B.renderSidebar();
    await B.loadNotifySettings().catch(() => {});
    B.refreshPush().catch(() => {});
    setTimeout(() => B.offerPush().catch(() => {}), 4000);
    setTimeout(() => B.checkAndroidUpdate().catch(() => {}), 6000);
    B.loadUnread();
    B.loadStaff().catch(() => {});   // équipe Bivouac : entrée « Administration » (migration 042)
    B.loadNotices?.().catch(() => {}); // avis de l'équipe Bivouac dans Messages
    B.syncStatusFromProfile?.(); // statut identique sur tous mes appareils (migration 049)
    B.startGlobalLive();
    B.startDmLive();
    B.refreshBadge();
    B.refreshNotesBadge?.(); // rappels de Mes notes arrivés (migration 051)
    // Premier lancement : présentation, « Présentez-vous », niveau, puis la visite, d'un seul tenant (onboarding.js),
    // sur « Aujourd'hui » (toutes ses zones y sont visibles, téléphone compris) ; un invité finit dans son projet.
    if (!B.me.onboarded) {
      location.hash = '#/home';
      await B.route();
      setTimeout(() => B.runOnboarding({ pid: joined, then: () => {
        if (joined) location.hash = `#/p/${joined}`;
        else if (B.discoverArrived) B.welcomeDiscover(B.discoverArrived); // invité à découvrir : son premier projet
      } }), 400);
      B.refreshRequests().catch(console.error);
      return;
    }
    if (joined) location.hash = `#/p/${joined}`;
    await B.route();
    if (B.discoverArrived) B.welcomeDiscover(B.discoverArrived); // compte existant arrivé par un lien « découvrir »

    // Mes tâches du jour : une fois par jour, seulement s'il y a quelque chose d'urgent
    // (pas sur « Aujourd'hui » : la page montre déjà ces tâches)
    if (!joined && !/^(#\/home)?$/.test(location.hash)) B.showTodayTasks();

    // Demandes d'IA reçues pendant mon absence
    B.refreshRequests().catch(console.error);
  } catch (err) {
    B.error(err);
  }
}

B.on('projects', () => { if (B.me) { B.renderSidebar(); B.loadUnread(); B.syncOnline().catch(console.error); } });
B.on('unread', () => B.paintUnread());
B.on('me', () => { if (B.me) B.renderSidebar(); });
B.on('notification', (n) => {
  B.refreshBadge();
  if (n.project_id && n.type !== 'reminder' && B.projectNotifyLevel(n.project_id) === 'mute') return; // projet en sourdine : la cloche seulement
  if (n.type !== 'ai_request') {
    B.playSound('notif');
    B.pcNotify(B.project(n.project_id)?.name || 'BIVOUAC-TECH', n.text, B.soundPrefs().notif, n.link || null,
      { group: B.notifyGroup(n.project_id), tag: `n-${n.id}` });
    B.toast(`${esc(n.text)}${n.link ? ` <a href="${esc(n.link)}">${tr('Ouvrir')}</a>` : ''}`);
  }
});
B.on('ai_request', (req) => B.showIncomingRequest(req));
B.on('ai_request_update', () => B.refreshRequests().catch(console.error)); // traitée ailleurs (connecteur, autre appareil)

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
  // App ouverte par un lien d'invitation, sinon invitation gardée sur ce poste (compte en attente de confirmation)
  const fresh = (await window.bivouac.takeInvite?.()) || null;
  if (fresh) keepInvite(fresh); else B.pendingInvite = storedInvite();
  B.sb.auth.onAuthStateChange((_event, session) => setTimeout(() => onSession(session), 0));
  if (!(await B.sb.auth.getSession()).data.session) await takeConfirmedSession().catch(console.warn);
  const { data } = await B.sb.auth.getSession();
  await onSession(data.session);
})();
