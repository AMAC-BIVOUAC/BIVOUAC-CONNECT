// =====================================================================
// account.js — compte personnel (migration 020)
//
// Informations personnelles : prénom, nom, date de naissance (obligatoires),
// téléphone, adresse et code postal (facultatifs ; code postal : migration 046). Rangées dans `profile_private`, lisible
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
  address: $(`#${p}-address`, root).value.trim() || null,
  postal_code: $(`#${p}-postal`, root)?.value.trim().toUpperCase() || null
});

/** Message d'erreur, ou '' si tout est bon */
B.checkPersonal = (x) => {
  if (!x.first_name) return tr('Écrivez votre prénom.');
  if (!x.last_name) return tr('Écrivez votre nom.');
  if (!x.birth_date) return tr('Indiquez votre date de naissance.');
  if (x.birth_date > new Date().toISOString().slice(0, 10) || x.birth_date < '1900-01-02') return tr('Date de naissance invalide.');
  if (x.phone && !/^[0-9 +().\-]{6,30}$/.test(x.phone)) return tr('Numéro de téléphone invalide.');
  if (x.postal_code && !/^[0-9A-Z][0-9A-Z \-]{1,11}$/.test(x.postal_code)) return tr('Code postal invalide.');
  return '';
};

/** Champs du formulaire (inscription, complétion, Paramètres) */
B.personalFieldsHtml = (p, v = {}) => `
  <label for="${p}-birth">${tr('Date de naissance')}</label><input id="${p}-birth" type="date" autocomplete="bday" max="${new Date().toISOString().slice(0, 10)}" value="${esc(v.birth_date || '')}" />
  <div class="form-row">
    <div><label for="${p}-first">${tr('Prénom')}</label><input id="${p}-first" maxlength="60" autocomplete="given-name" value="${esc(v.first_name || '')}" /></div>
    <div><label for="${p}-last">${tr('Nom')}</label><input id="${p}-last" maxlength="60" autocomplete="family-name" value="${esc(v.last_name || '')}" /></div>
  </div>
  <label for="${p}-phone">${tr('Téléphone')} <span class="muted">${tr('(facultatif)')}</span></label>
  <input id="${p}-phone" type="tel" maxlength="30" autocomplete="tel" value="${esc(v.phone || '')}" />
  <div class="form-row">
    <div><label for="${p}-address">${tr('Adresse')} <span class="muted">${tr('(facultatif)')}</span></label>
      <input id="${p}-address" maxlength="300" autocomplete="street-address" placeholder="${esc(tr('ex. 12 rue des Pins'))}" value="${esc(v.address || '')}" /></div>
    <div><label for="${p}-postal">${tr('Code postal')} <span class="muted">${tr('(facultatif)')}</span></label>
      <input id="${p}-postal" maxlength="12" autocomplete="postal-code" value="${esc(v.postal_code || '')}" /></div>
  </div>
  <p class="muted small">${tr('Votre pays et votre ville se règlent dans « Mon profil » : ils servent à afficher votre heure locale à l’équipe.')}</p>`;

// ---------------------------------------------------------------------
// Âge déclaré et conditions (migration 034, document « Conditions inscription et accès mineurs »)
// Rien n'est vérifié (principe déclaratif) : la personne certifie sur l'honneur. Moins de 15 ans = déclaration
// d'accord du parent ou tuteur ; dans tous les cas, conditions d'utilisation et confidentialité acceptées.
// La base refuse les informations privées sans ces cases (private_guard).
// ---------------------------------------------------------------------
/** Version des conditions affichée et acceptée (à changer quand pages-publiques/conditions change) */
B.TERMS_VERSION = '2026-11-24'; // 24/11 : usages interdits et modération (migration 042, tout le monde réaccepte)
B.TERMS_PAGE = 'https://www.bivouac-tech.com/conditions/';

/** Âge en années révolues à une date « AAAA-MM-JJ » (null si inconnue) */
B.ageOf = (birth) => {
  if (!birth) return null;
  const b = new Date(birth + 'T00:00:00'), n = new Date();
  let a = n.getFullYear() - b.getFullYear();
  if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) a--;
  return a;
};

/** Cases de l'inscription (sous la date de naissance) : 15 ans ou plus, ou accord du parent ; conditions */
B.consentFieldsHtml = (p) => `
  <div class="consent" id="${p}-consent">
    <p class="muted small" id="${p}-age-hint">${tr('Indiquez votre date de naissance : les cases à cocher apparaissent dessous.')}</p>
    <label class="check hidden" id="${p}-age15-wrap"><input type="checkbox" id="${p}-age15" /> ${tr('Je certifie avoir 15 ans ou plus.')}</label>
    <div class="parent-box hidden" id="${p}-parent-wrap">
      <p class="small">${tr('Vous avez moins de 15 ans : votre parent ou tuteur légal doit accepter votre inscription.')}</p>
      <blockquote class="small">${tr('« Je soussigné(e), représentant légal de l’utilisateur mineur, déclare avoir pris connaissance des conditions d’utilisation de BIVOUAC-TECH et autorise mon enfant à créer un compte et à participer à des projets sur l’application. Je reconnais être responsable de l’utilisation qu’il en fait. »')}</blockquote>
      <label class="check"><input type="checkbox" id="${p}-parent" /> ${tr('Je certifie que mon parent ou tuteur légal a lu ces conditions et accepte mon inscription.')}</label>
      <label for="${p}-parent-email">${tr('E-mail du parent')} <span class="muted">${tr('(facultatif, pour information)')}</span></label>
      <input id="${p}-parent-email" type="email" maxlength="200" autocomplete="off" />
    </div>
    <label class="check"><input type="checkbox" id="${p}-terms" /> <span>${tr('J’ai lu et j’accepte les {terms} et la {privacy}.', {
      terms: `<a href="${B.TERMS_PAGE}" target="_blank" rel="noopener">${tr('conditions d’utilisation')}</a>`,
      privacy: `<a href="${B.PRIVACY_PAGE}" target="_blank" rel="noopener">${tr('politique de confidentialité')}</a>` })}</span></label>
  </div>`;

/** Montre la bonne case selon l'âge ; `onChange` est rappelé à chaque changement (bouton actif ou non) */
B.bindConsent = (root, p, onChange = () => {}) => {
  const birth = $(`#${p}-birth`, root);
  const sync = () => {
    const age = B.ageOf(birth.value);
    $(`#${p}-age-hint`, root).classList.toggle('hidden', age != null);
    $(`#${p}-age15-wrap`, root).classList.toggle('hidden', age == null || age < 15);
    $(`#${p}-parent-wrap`, root).classList.toggle('hidden', age == null || age >= 15);
    onChange(!B.checkConsent(B.readConsent(root, p, birth.value)));
  };
  root.addEventListener('input', sync);
  root.addEventListener('change', sync);
  sync();
};

/** Ce qui a été coché */
B.readConsent = (root, p, birth) => {
  const age = B.ageOf(birth);
  const under15 = age != null && age < 15;
  return {
    birth_date: birth,
    age_certified: !under15 && $(`#${p}-age15`, root).checked,
    parental_consent: under15 && $(`#${p}-parent`, root).checked,
    parent_email: under15 ? ($(`#${p}-parent-email`, root).value.trim() || null) : null,
    terms_version: $(`#${p}-terms`, root).checked ? B.TERMS_VERSION : null
  };
};

/** Message d'erreur, ou '' si les cases requises sont cochées */
B.checkConsent = (c) => {
  const age = B.ageOf(c.birth_date);
  if (age == null) return tr('Indiquez votre date de naissance.');
  if (age < 15 && !c.parental_consent) return tr('Il faut l’accord de votre parent ou tuteur légal (case à cocher).');
  if (age >= 15 && !c.age_certified) return tr('Cochez « Je certifie avoir 15 ans ou plus ».');
  if (c.parent_email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.parent_email)) return tr('E-mail du parent invalide.');
  if (!c.terms_version) return tr('Acceptez les conditions d’utilisation et la politique de confidentialité.');
  return '';
};

/** Les cases cochées, en colonnes de profile_private (horodatées) */
const consentColumns = (c) => {
  const now = new Date().toISOString();
  return {
    age_certified_at: c.age_certified ? now : null,
    parental_consent_declared_at: c.parental_consent ? now : null,
    parent_email: c.parent_email || null,
    terms_version: c.terms_version,
    terms_accepted_at: c.terms_version ? now : null
  };
};

/** Enregistre mes informations personnelles (et, s'il y en a, les cases de l'inscription) */
B.savePersonal = async (x, consent = null) => {
  const { gender, ...clean } = x; // jamais de sexe (migration 031)
  const { error } = await B.sb.from('profile_private').upsert({ id: B.me.id, ...clean, ...(consent ? consentColumns(consent) : {}) }, { onConflict: 'id' });
  if (error) throw new Error(/naissance/i.test(error.message || '') ? tr('Date de naissance invalide.') : errText(error));
};

/**
 * Comptes créés avant la v0.8.9 (ou inscription incomplète) : écran « Complétez votre compte »
 * juste après la connexion. On ne peut pas entrer dans l'app sans (sauf se déconnecter).
 */
B.ensurePersonal = async () => {
  const cur = await B.loadPersonal().catch(() => ({ missing: true }));
  if (cur?.missing) return; // table pas encore installée sur le serveur
  // Déjà rempli ET conditions de la version en cours acceptées (ou migration 034 pas encore passée) : rien à demander.
  // Conditions changées (B.TERMS_VERSION) : on redemande l'âge et l'accord, à la connexion suivante.
  if (cur && (!('terms_accepted_at' in cur) || (cur.terms_accepted_at && cur.terms_version === B.TERMS_VERSION))) return;
  const [first, ...rest] = (B.me.display_name || '').trim().split(/\s+/);
  await new Promise((resolve) => {
    const screen = document.createElement('div');
    screen.className = 'complete-screen';
    screen.innerHTML = `<div class="complete-card">
      <img src="assets/mark.svg" alt="" width="54" height="54" />
      <h1>${cur ? tr('Nouvelles conditions d’utilisation') : tr('Complétez votre compte')}</h1>
      <p class="muted">${cur ? tr('Pour continuer, confirmez votre âge et acceptez les conditions d’utilisation. Rien d’autre ne change.')
        : tr('Votre compte BIVOUAC-TECH est un compte personnel. Ces informations restent privées : vous seul y avez accès.')}</p>
      <form id="cp-form">${B.personalFieldsHtml('cp', cur || { first_name: first || '', last_name: rest.join(' ') })}${B.consentFieldsHtml('cp')}
        <p class="msg" id="cp-msg"></p>
        <div class="actions"><button type="button" class="btn link" id="cp-out">${tr('Se déconnecter')}</button><span class="spacer"></span>
          <button class="btn primary">${tr('Continuer')}</button></div></form></div>`;
    document.body.appendChild(screen);
    $('#cp-birth', screen).focus();
    B.bindConsent(screen, 'cp', (ok) => { $('#cp-form button.primary', screen).disabled = !ok; });
    $('#cp-out', screen).onclick = async () => { screen.remove(); resolve(); await B.sb.auth.signOut(); };
    $('#cp-form', screen).onsubmit = async (e) => {
      e.preventDefault();
      const x = B.readPersonal(screen, 'cp');
      const consent = B.readConsent(screen, 'cp', x.birth_date);
      const bad = B.checkPersonal(x) || B.checkConsent(consent);
      if (bad) return ($('#cp-msg', screen).textContent = bad);
      try {
        await B.savePersonal(x, consent);
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
B.PRIVACY_PAGE = 'https://www.bivouac-tech.com/confidentialite/';
/** Site public (FAQ, contact) et adresse de contact de l'équipe (22/11, Apo) */
B.SITE = 'https://www.bivouac-tech.com';
B.CONTACT_EMAIL = 'contact@bivouac-tech.com';

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
