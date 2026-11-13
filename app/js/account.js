// =====================================================================
// account.js — compte personnel (migration 020)
//
// Informations personnelles : prénom, nom, date de naissance (obligatoires),
// téléphone et adresse (facultatifs). Rangées dans `profile_private`, lisible
// UNIQUEMENT par la personne elle-même (ni les autres membres, ni les IA du connecteur).
// Les autres voient seulement le profil public : nom affiché, pseudo, photo.
// E-mail et mot de passe : Supabase Auth.
// =====================================================================

// Le sexe n'est plus demandé ni gardé (décision du 11/11, minimisation des données, migration 031).

/** Mes informations personnelles ; null si pas encore remplies ; { missing: true } si la table n'existe pas encore */
B.loadPersonal = async () => {
  const { data, error } = await B.sb.from('profile_private').select('*').eq('id', B.me.id).maybeSingle();
  if (error) return /profile_private|does not exist|schema cache/i.test(error.message || '') ? { missing: true } : null;
  return data;
};

/** Lit les champs d'un formulaire (préfixe des identifiants : su-, pp-…) */
B.readPersonal = (root, p) => ({
  first_name: $(`#${p}-first`, root).value.trim(),
  last_name: $(`#${p}-last`, root).value.trim(),
  birth_date: $(`#${p}-birth`, root).value,
  phone: $(`#${p}-phone`, root).value.trim() || null,
  address: $(`#${p}-address`, root).value.trim() || null
});

/** Message d'erreur, ou '' si tout est bon */
B.checkPersonal = (x) => {
  if (!x.first_name) return tr('Écrivez votre prénom.');
  if (!x.last_name) return tr('Écrivez votre nom.');
  if (!x.birth_date) return tr('Indiquez votre date de naissance.');
  if (x.birth_date > new Date().toISOString().slice(0, 10) || x.birth_date < '1900-01-02') return tr('Date de naissance invalide.');
  if (x.phone && !/^[0-9 +().\-]{6,30}$/.test(x.phone)) return tr('Numéro de téléphone invalide.');
  return '';
};

/** Champs du formulaire (inscription, complétion, Paramètres) */
B.personalFieldsHtml = (p, v = {}) => `
  <div class="form-row">
    <div><label for="${p}-first">${tr('Prénom')}</label><input id="${p}-first" maxlength="60" autocomplete="given-name" value="${esc(v.first_name || '')}" /></div>
    <div><label for="${p}-last">${tr('Nom')}</label><input id="${p}-last" maxlength="60" autocomplete="family-name" value="${esc(v.last_name || '')}" /></div>
  </div>
  <label for="${p}-birth">${tr('Date de naissance')}</label><input id="${p}-birth" type="date" max="${new Date().toISOString().slice(0, 10)}" value="${esc(v.birth_date || '')}" />
  <label for="${p}-phone">${tr('Téléphone')} <span class="muted">${tr('(facultatif)')}</span></label>
  <input id="${p}-phone" type="tel" maxlength="30" autocomplete="tel" value="${esc(v.phone || '')}" />
  <label for="${p}-address">${tr('Adresse')} <span class="muted">${tr('(facultatif)')}</span></label>
  <input id="${p}-address" maxlength="300" autocomplete="street-address" value="${esc(v.address || '')}" />`;

/** Enregistre mes informations personnelles */
B.savePersonal = async (x) => {
  const { gender, ...clean } = x; // jamais de sexe (migration 031)
  const { error } = await B.sb.from('profile_private').upsert({ id: B.me.id, ...clean }, { onConflict: 'id' });
  if (error) throw new Error(/naissance/i.test(error.message || '') ? tr('Date de naissance invalide.') : errText(error));
};

/**
 * Comptes créés avant la v0.8.9 (ou inscription incomplète) : écran « Complétez votre compte »
 * juste après la connexion. On ne peut pas entrer dans l'app sans (sauf se déconnecter).
 */
B.ensurePersonal = async () => {
  const cur = await B.loadPersonal().catch(() => ({ missing: true }));
  if (cur) return; // déjà rempli, ou table pas encore installée sur le serveur
  const [first, ...rest] = (B.me.display_name || '').trim().split(/\s+/);
  await new Promise((resolve) => {
    const screen = document.createElement('div');
    screen.className = 'complete-screen';
    screen.innerHTML = `<div class="complete-card">
      <img src="assets/mark.svg" alt="" width="54" height="54" />
      <h1>${tr('Complétez votre compte')}</h1>
      <p class="muted">${tr('Votre compte BIVOUAC-TECH est un compte personnel. Ces informations restent privées : vous seul y avez accès.')}</p>
      <form id="cp-form">${B.personalFieldsHtml('cp', { first_name: first || '', last_name: rest.join(' ') })}
        <p class="msg" id="cp-msg"></p>
        <div class="actions"><button type="button" class="btn link" id="cp-out">${tr('Se déconnecter')}</button><span class="spacer"></span>
          <button class="btn primary">${tr('Continuer')}</button></div></form></div>`;
    document.body.appendChild(screen);
    $('#cp-first', screen).focus();
    $('#cp-out', screen).onclick = async () => { screen.remove(); resolve(); await B.sb.auth.signOut(); };
    $('#cp-form', screen).onsubmit = async (e) => {
      e.preventDefault();
      const x = B.readPersonal(screen, 'cp');
      const bad = B.checkPersonal(x);
      if (bad) return ($('#cp-msg', screen).textContent = bad);
      try {
        await B.savePersonal(x);
        screen.remove();
        resolve();
      } catch (err) { $('#cp-msg', screen).textContent = errText(err); }
    };
  });
};

/** Changer son mot de passe : on vérifie d'abord l'actuel */
B.changePassword = async (current, next) => {
  if (next.length < 8) throw new Error(tr('Le nouveau mot de passe doit faire au moins 8 caractères.'));
  const { data: u } = await B.sb.auth.getUser();
  const email = u?.user?.email;
  const check = await B.sb.auth.signInWithPassword({ email, password: current });
  if (check.error) throw new Error(tr('Mot de passe actuel incorrect.'));
  const { error } = await B.sb.auth.updateUser({ password: next });
  if (error) throw new Error(/same|different/i.test(error.message || '') ? tr('Le nouveau mot de passe doit être différent de l\'actuel.') : errText(error));
};

// ---------------------------------------------------------------------
// Mes données (RGPD, migration 031) : télécharger, supprimer mon compte
// ---------------------------------------------------------------------
/** Page publique de la politique de confidentialité */
B.PRIVACY_PAGE = 'https://amac-bivouac.github.io/BIVOUAC-CONNECT/confidentialite/';

/** Télécharge toutes mes données dans un fichier JSON */
B.exportMyData = async () => {
  const { data, error } = await B.sb.rpc('export_my_data');
  if (error) throw new Error(errText(error));
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bivouac-mes-donnees-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
};

/**
 * Supprime mon compte, en trois temps :
 * 1. la base dit ce qui va se passer et quels fichiers effacer (et détache mes pièces jointes privées) ;
 * 2. on efface ces fichiers du stockage (une requête SQL ne le peut pas) ;
 * 3. la base transmet mes projets partagés, supprime les autres, puis supprime le compte.
 */
B.deleteMyAccount = async (confirmWord, onStep = () => {}) => {
  if (confirmWord !== 'SUPPRIMER') throw new Error(tr('Écrivez SUPPRIMER pour confirmer.'));
  onStep(tr('Préparation…'));
  const { data: plan, error } = await B.sb.rpc('begin_account_deletion');
  if (error) throw new Error(errText(error));
  onStep(tr('Effacement des fichiers…'));
  for (const [bucket, list] of [['project-files', plan?.fichiers_projets || []], ['dm-files', plan?.fichiers_prives || []]]) {
    for (let i = 0; i < list.length; i += 100) {
      await B.sb.storage.from(bucket).remove(list.slice(i, i + 100)).catch(() => {}); // au mieux : on continue
    }
  }
  onStep(tr('Suppression du compte…'));
  const res = await B.sb.rpc('delete_my_account', { p_confirm: confirmWord });
  if (res.error) throw new Error(errText(res.error));
  await B.sb.auth.signOut().catch(() => {});
  return plan;
};

/** Ce que la suppression va faire, en phrases simples (avant de confirmer) */
B.accountDeletionSummary = (plan) => {
  const lines = [];
  (plan?.projets_transmis || []).forEach((p) => lines.push(tr('« {p} » sera confié à {who}.', { p: p.nom, who: p.a })));
  (plan?.projets_supprimes || []).forEach((p) => lines.push(tr('« {p} » sera supprimé (vous en êtes le seul membre).', { p: p.nom })));
  return lines;
};
