// =====================================================================
// Paramètres — mon profil, mes IA (clés API), accompagnement, déconnexion
// =====================================================================

B.pages.settings = async (view) => {
  await B.loadMyProviders();
  await B.loadMe(B.me.id).catch(() => {}); // le connecteur a pu se signaler entre-temps
  const me = B.me;
  const myAis = aisOf(me).filter((a) => PROVIDERS[a.id]);

  view.innerHTML = `
    <div class="page narrow">
      <div class="page-head"><h1>${tr('Paramètres')}</h1></div>

      <section class="card">
        <div class="card-head"><h2>${tr('Mon profil')}</h2></div>
        <div class="photo-row">
          <span id="s-avatar">${avatar(me, 64)}</span>
          <div>
            <button class="btn small" id="s-photo">${icon('image', 14)} ${me.avatar ? tr('Changer la photo') : tr('Ajouter une photo')}</button>
            ${me.avatar ? `<button class="link small danger" id="s-photo-del">${tr('Retirer')}</button>` : ''}
            <p class="muted small">${tr('Visible par les membres de vos projets. Elle est recadrée en carré, au centre.')}</p>
          </div>
          <input type="file" id="s-photo-input" accept="image/*" class="hidden" />
        </div>
        <div class="form-row">
          <div><label>${tr('Nom affiché')}</label><input id="s-name" maxlength="40" value="${esc(me.display_name)}" /></div>
          <div><label>${tr('Pseudo (pour les @mentions)')}</label><input id="s-handle" maxlength="30" value="${esc(me.handle)}" /></div>
        </div>
        <label>${tr("Rôle / métier (affiché dans l'équipe)")}</label>
        <input id="s-title" maxlength="60" value="${esc(me.title || '')}" placeholder="${tr('ex. Product designer, Chef de projet…')}" />
        <div class="actions"><span class="msg" id="s-msg"></span><span class="spacer"></span><button class="btn primary" id="s-save">${tr('Enregistrer')}</button></div>
      </section>

      <section class="card" id="pp-card">
        <div class="card-head"><h2>${tr('Mes informations personnelles')}</h2></div>
        <p class="muted small">${icon('key', 13)} ${tr('Privées : vous seul y avez accès. Ni les autres membres ni les IA n\'y ont accès.')}</p>
        <div id="pp-body" class="loading">${tr('Chargement…')}</div>
      </section>

      <section class="card">
        <div class="card-head"><h2>${tr('Connexion')}</h2></div>
        <label>${tr('Adresse e-mail')}</label><input id="pw-email" disabled />
        <h3 class="sub-h">${tr('Changer de mot de passe')}</h3>
        <form id="pw-form" autocomplete="off">
          <label for="pw-cur">${tr('Mot de passe actuel')}</label><input id="pw-cur" type="password" autocomplete="current-password" required />
          <div class="form-row">
            <div><label for="pw-new">${tr('Nouveau mot de passe')}</label><input id="pw-new" type="password" minlength="8" autocomplete="new-password" required placeholder="${tr('8 caractères minimum')}" /></div>
            <div><label for="pw-new2">${tr('Confirmer le nouveau mot de passe')}</label><input id="pw-new2" type="password" minlength="8" autocomplete="new-password" required /></div>
          </div>
          <div class="actions"><span class="msg" id="pw-msg"></span><span class="spacer"></span><button class="btn primary">${tr('Changer le mot de passe')}</button></div>
        </form>
      </section>

      <section class="card">
        <div class="card-head"><h2>${tr('Langue')}</h2></div>
        <div class="levels">
          <label class="level ${B.lang === 'fr' ? 'on' : ''}"><input type="radio" name="lang" value="fr" ${B.lang === 'fr' ? 'checked' : ''} />
            <strong>Français</strong><span>Interface en français.</span></label>
          <label class="level ${B.lang === 'en' ? 'on' : ''}"><input type="radio" name="lang" value="en" ${B.lang === 'en' ? 'checked' : ''} />
            <strong>English</strong><span>English interface.</span></label>
        </div>
        <p class="muted small">${tr('Réglage de ce poste. Les messages et notifications déjà écrits ne sont pas traduits.')}</p>
      </section>

      <section class="card" data-tour="ai-keys">
        <div class="card-head"><h2>${tr('Mes IA')}</h2></div>
        <p class="muted">${tr('Branchez votre IA pour la faire travailler dans vos projets. Le plus simple : votre <strong>abonnement Claude ou ChatGPT</strong>, sans clé à créer et sans rien payer en plus.')}</p>
        ${myAis.length ? `<div class="ai-status">
          ${myAis.map((a) => `<div class="ai-status-row">${aiAvatar(a.id, 30, me)}
            <span class="ai-status-info"><strong translate="no">${esc(aiName(a.id, me))}</strong>
              <span class="muted small">${a.api && a.connector ? tr('par clé API') + ' · ' : ''}${a.connector
                ? tr('via votre abonnement') + (me.connector_seen_at ? ` · ${tr('dernière connexion {when}', { when: timeAgo(me.connector_seen_at) })}` : '')
                : tr('par clé API')}</span>
              <span class="ai-nick" data-nick-box="${a.id}">
                <button type="button" class="link small" data-nick-edit title="${tr('Le surnom s\'affiche devant le nom de votre IA, pour toute l\'équipe et dans le connecteur.')}">${icon('edit', 12)} ${aiNickname(me, a.id) ? tr('Changer le surnom') : tr('Donner un surnom')}</button>
                <span class="ai-nick-form" hidden>
                  <input id="nick-${a.id}" maxlength="24" value="${esc(aiNickname(me, a.id))}" placeholder="${tr('ex. Nova')}" aria-label="${tr('Surnom')}" />
                  <button type="button" class="btn tiny primary" data-nick-save>${tr('Enregistrer')}</button>
                  <button type="button" class="btn tiny" data-nick-cancel>${tr('Annuler')}</button>
                </span>
              </span>
              ${a.connector && B.connectorStale(a.id)
                ? `<span class="con-refresh stale">${icon('spark', 13)} ${tr('Nouveaux outils disponibles')} ·
                    <button type="button" class="link small" data-refresh="${a.id}">${tr('Actualiser le connecteur')}</button></span>`
                : ''}</span>
            <span class="state ok">${icon('check', 14)} ${tr('Branchée')}</span>
            ${a.connector ? `<button class="link small danger con-del" data-p="${a.id}">${tr('Retirer')}</button>` : ''}
          </div>`).join('')}
        </div>` : ''}
        <div class="actions">
          <button class="btn primary" id="cw-start">${icon('spark', 15)} ${myAis.length ? tr('Brancher une autre IA') : tr('Brancher mon IA')}</button>
          ${(me.connector_providers || []).length ? `<button class="btn" id="cw-verify">${tr('Vérifier la connexion')}</button>` : ''}
        </div>
        ${(me.connector_providers || []).filter((x) => PROVIDERS[x]).map((x) => `<p class="muted small">${tr("Les demandes « @{handle} {ai} … » de vos coéquipiers vous seront notifiées : traitez-les depuis l'application {ai} en disant « Traite mes demandes Bivouac ».", { handle: esc(me.handle), ai: PROVIDERS[x].label })}</p>`).join('')}

        <details class="advanced" id="ai-advanced" ${B.myProviders.some((p) => p.hasKey) ? 'open' : ''}>
        <summary>${tr('Avancé : brancher une IA avec une clé API')}</summary>
        <p class="muted">${tr('Branchez vos IA avec une <strong>clé API</strong>. Les clés restent sur ce PC, chiffrées par Windows : elles ne partent jamais sur le serveur ni chez les autres membres. Les autres voient seulement quelles IA vous avez, pour pouvoir vous les demander (vous acceptez ou refusez à chaque fois).')}</p>
        <div class="providers">
          ${B.myProviders.map((p) => `
            <div class="provider" data-p="${p.id}">
              <div class="provider-head">${aiAvatar(p.id, 30)}<strong>${esc(p.label)}</strong>
                <span class="state ${p.hasKey ? 'ok' : ''}">${p.hasKey ? tr('Branchée') : tr('Non branchée')}</span></div>
              ${p.hasKey ? `<div class="form-row"><div><label>${tr('Modèle utilisé')}</label><select class="model"><option>${tr('Chargement…')}</option></select>
                <p class="muted small model-hint">${tr('Par défaut, le modèle le moins cher. Choisissez-en un plus puissant si vous en avez besoin : chaque réponse coûtera plus cher sur votre clé.')}</p></div></div>` : ''}
              <div class="row">
                <input type="password" class="key" placeholder="${p.hasKey ? tr('Remplacer la clé…') : tr('Coller votre clé API')}" />
                <button class="btn small primary save">${tr('Enregistrer')}</button>
                ${p.hasKey ? `<button class="btn small danger-ghost del">${tr('Retirer')}</button>` : ''}
              </div>
              <button class="link small help" data-url="${esc(p.keyHelp)}">${tr('Où trouver ma clé {ai} ?', { ai: esc(p.label) })}</button>
            </div>`).join('')}
        </div>
        <p class="msg" id="k-msg"></p>
        </details>
      </section>

      <section class="card">
        <div class="card-head"><h2>${tr('Vocal et vidéo')}</h2></div>
        <p class="muted">${tr('Le micro et le haut-parleur (ou casque) utilisés pour le vocal, sur ce PC. Sans micro, vous pouvez quand même rejoindre un vocal pour écouter.')}</p>
        <div class="form-row">
          <div><label for="v-mic">${tr('Micro')}</label><select id="v-mic"><option>${tr('Chargement…')}</option></select></div>
          <div><label for="v-speaker">${tr('Haut-parleur / casque')}</label><select id="v-speaker"><option>${tr('Chargement…')}</option></select></div>
        </div>
        <div class="form-row cam-row">
          <div><label for="v-cam">${tr('Caméra')}</label><select id="v-cam"><option>${tr('Chargement…')}</option></select>
            <button class="btn small" id="v-cam-test">${icon('video', 14)} ${tr('Tester la caméra')}</button></div>
          <div class="cam-preview hidden"><video id="v-cam-video" autoplay muted playsinline class="mirror"></video></div>
        </div>
        <label for="v-volume">${tr('Volume du vocal')}</label>
        <div class="sound-vol"><input type="range" id="v-volume" min="0" max="100" step="5" value="${Math.round(B.voiceOutVolume() * 100)}" /><span id="v-volume-v">${Math.round(B.voiceOutVolume() * 100)} %</span></div>
        <p class="muted small">${tr('En vocal : clic droit sur le micro, le casque ou la caméra pour changer d\'appareil, clic droit sur une personne pour régler son volume.')}</p>
        <p class="muted small" id="v-msg"></p>
      </section>

      <section class="card">
        <div class="card-head"><h2>${tr('Correcteur')}</h2></div>
        <label class="check"><input type="checkbox" id="gr-on" ${B.grammarPrefs().on ? 'checked' : ''} />
          <strong>${tr('Corriger l\'orthographe, la grammaire et la ponctuation')}</strong></label>
        <p class="muted small">${tr('Comme dans Word : rouge = orthographe, bleu = grammaire et accords, gris = ponctuation et typographie. Clic droit sur un mot souligné pour les suggestions.')}</p>
        <div class="form-row"><div><label for="gr-lang">${tr('Langue de correction')}</label>
          <select id="gr-lang">
            ${[['app', tr('Celle de l\'application')], ['fr', 'Français'], ['en-US', 'English'], ['auto', tr('Détection automatique (français / anglais)')]]
              .map(([v, l]) => `<option value="${v}" ${B.grammarPrefs().lang === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select></div>
          <div><label>${tr('Mon dictionnaire')}</label>
            <p class="muted small" id="gr-dict"></p></div></div>
        <p class="muted small">${tr('Service gratuit LanguageTool : le texte que vous tapez est envoyé à leurs serveurs (Allemagne, RGPD) pour être vérifié, sans être conservé. Hors ligne, le correcteur de base prend le relais.')}</p>
      </section>

      <section class="card">
        <div class="card-head"><h2>${tr('Sons')}</h2></div>
        <p class="muted">${tr('Choisissez les sons que vous voulez entendre sur ce PC.')}</p>
        <div class="sound-list">
          ${[['notif', tr('Notifications'), tr('mention, demande d\'IA, réponse…'), 'notif'],
             ['presence', tr('Connexions de l\'équipe'), tr('un coéquipier ouvre ou ferme l\'application'), 'online'],
             ['voice', tr('Vocal'), tr('quelqu\'un entre ou sort du vocal'), 'voiceIn']].map(([k, label, hint, demo]) => `
            <div class="sound-row"><label class="check"><input type="checkbox" data-sound="${k}" ${B.soundPrefs()[k] ? 'checked' : ''} />
              <strong>${label}</strong> <span class="muted small">· ${hint}</span></label>
              <button class="link small" data-demo="${demo}">${icon('volume', 13)} ${tr('Écouter')}</button></div>`).join('')}
        </div>
        <label for="snd-vol">${tr('Volume')}</label>
        <div class="sound-vol"><input type="range" id="snd-vol" min="0" max="100" step="5" value="${Math.round(B.soundPrefs().volume * 100)}" /><span id="snd-vol-v">${Math.round(B.soundPrefs().volume * 100)} %</span></div>
      </section>

      <section class="card">
        <div class="card-head"><h2>${tr("Résumé « Qu'est-ce que j'ai raté ? »")}</h2></div>
        <p class="muted">${tr('Choisissez qui rédige vos résumés : sans IA (gratuit, instantané), une IA branchée par clé API (dans l\'app, sur votre clé) ou une IA de votre abonnement (elle s\'ouvre avec la demande prête).')}</p>
        <div class="summary-options">
          ${B.summaryOptions().map((o) => `<label class="summary-option ${B.summaryPref() === o.id ? 'on' : ''}">
            <input type="radio" name="summary" value="${o.id}" ${B.summaryPref() === o.id ? 'checked' : ''} />
            ${o.provider ? aiAvatar(o.provider, 22) : `<span class="summary-none">${icon('list', 14)}</span>`}
            <strong>${esc(o.label)}</strong><span class="muted small">· ${esc(o.hint)}</span></label>`).join('')}
        </div>
      </section>

      <section class="card">
        <div class="card-head"><h2>${tr('Accompagnement')}</h2></div>
        <div class="levels">
          <label class="level ${me.level === 'debutant' ? 'on' : ''}"><input type="radio" name="lvl" value="debutant" ${me.level === 'debutant' ? 'checked' : ''} />
            <strong>${tr('Je débute')}</strong><span>${tr('Bivouac-Tech vous suggère la prochaine étape de chaque projet.')}</span></label>
          <label class="level ${me.level === 'habitue' ? 'on' : ''}"><input type="radio" name="lvl" value="habitue" ${me.level === 'habitue' ? 'checked' : ''} />
            <strong>${tr("J'ai l'habitude")}</strong><span>${tr('Accompagnement discret, pas de suggestions.')}</span></label>
        </div>
        <label class="check"><input type="checkbox" id="s-today" ${B.todayTasksEnabled() ? 'checked' : ''} /> ${tr("Afficher « Mes tâches du jour » à l'ouverture de l'app")}</label>
        <div class="actions"><button class="btn" id="s-tour">${icon('compass', 15)} ${tr('Revoir la visite guidée')}</button></div>
      </section>

      <section class="card">
        <div class="card-head"><h2>${tr('Mises à jour')}</h2></div>
        <div class="actions"><span class="muted small" id="up-text">${esc(B.updateText(B.update))}</span><span class="spacer"></span>
          <button class="btn" id="up-check">${tr('Rechercher une mise à jour')}</button>
          <button class="btn primary hidden" id="up-install">${tr('Redémarrer maintenant')}</button></div>
        <hr />
        <div class="actions"><span class="muted small">BIVOUAC-TECH v<span id="app-version">${esc(B.update.current || '')}</span> · ${tr('une création AMAC')} (Apollonius MANDON & Amaury CHARRIER)</span><span class="spacer"></span>
          <button class="btn danger-ghost" id="s-logout">${icon('logout', 15)} ${tr('Se déconnecter')}</button></div>
      </section>
    </div>`;

  // Photo de profil : recadrée au centre, réduite à 160 px, JPEG (quelques Ko)
  const photoInput = $('#s-photo-input', view);
  $('#s-photo', view).onclick = () => photoInput.click();
  photoInput.onchange = async () => {
    const f = photoInput.files[0];
    photoInput.value = '';
    if (!f) return;
    try {
      await B.updateMe({ avatar: await B.squarePhoto(f) });
      B.toast(tr('Photo enregistrée.'), { type: 'success' });
      B.route();
    } catch (err) {
      B.error(new Error(/avatar/.test(err.message || '') ? tr('La photo de profil n\'est pas encore installée sur le serveur (migration 017).') : errText(err)));
    }
  };
  $('#s-photo-del', view)?.addEventListener('click', async () => {
    await B.updateMe({ avatar: null }).catch(B.error);
    B.route();
  });

  // Informations personnelles (privées)
  (async () => {
    const box = $('#pp-body', view);
    const cur = await B.loadPersonal().catch(() => ({ missing: true }));
    if (!box) return;
    box.classList.remove('loading');
    if (cur?.missing) { box.innerHTML = `<p class="muted small">${tr('Pas encore disponible sur le serveur (migration 020).')}</p>`; return; }
    box.innerHTML = `${B.personalFieldsHtml('pp', cur || {})}
      <div class="actions"><span class="msg" id="pp-msg"></span><span class="spacer"></span><button class="btn primary" id="pp-save">${tr('Enregistrer')}</button></div>`;
    $('#pp-save', view).onclick = async () => {
      const x = B.readPersonal(view, 'pp');
      const bad = B.checkPersonal(x);
      const msg = $('#pp-msg', view);
      if (bad) { msg.textContent = bad; msg.classList.add('error'); return; }
      try { await B.savePersonal(x); msg.classList.remove('error'); msg.textContent = tr('Enregistré.'); } catch (err) { msg.classList.add('error'); msg.textContent = errText(err); }
    };
  })();

  // Connexion : e-mail, changer de mot de passe (l'actuel est vérifié d'abord)
  B.sb.auth.getUser().then(({ data }) => { const el = $('#pw-email', view); if (el) el.value = data?.user?.email || ''; });
  $('#pw-form', view).onsubmit = async (e) => {
    e.preventDefault();
    const msg = $('#pw-msg', view);
    const next = $('#pw-new', view).value;
    msg.classList.add('error');
    if (next !== $('#pw-new2', view).value) return (msg.textContent = tr('Les deux mots de passe ne sont pas identiques.'));
    e.submitter.disabled = true;
    msg.classList.remove('error');
    msg.textContent = tr('Vérification…');
    try {
      await B.changePassword($('#pw-cur', view).value, next);
      e.target.reset();
      msg.textContent = tr('Mot de passe changé.');
    } catch (err) { msg.classList.add('error'); msg.textContent = errText(err); }
    e.submitter.disabled = false;
  };

  // Profil
  $('#s-save', view).onclick = async () => {
    try {
      await B.updateMe({
        display_name: $('#s-name', view).value.trim() || me.display_name,
        handle: $('#s-handle', view).value.trim().toLowerCase(),
        title: $('#s-title', view).value.trim() || null
      });
      B.renderSidebar();
      $('#s-msg', view).textContent = tr('Enregistré.');
    } catch (err) { $('#s-msg', view).textContent = errText(err); }
  };

  // Brancher mon IA (assistant pas à pas, connect.js)
  // Version web : pas de clé API (elles ne quittent jamais le PC) ni de mise à jour à installer
  if (window.BIVOUAC_WEB) {
    const adv = $('#ai-advanced', view);
    if (adv) adv.outerHTML = `<p class="muted small">${tr('Version web : les IA se branchent avec le connecteur (votre abonnement). Les clés API restent réservées à l\'app Windows.')}</p>`;
    $('#up-check', view)?.classList.add('hidden'); // masqué (pas supprimé : la section Mises à jour s'en sert)
  }
  const refresh = () => { B.loadProjects(); B.pages.settings(view); };
  $('#cw-start', view).onclick = () => B.connectWizard({ onDone: refresh });
  $('#cw-verify', view)?.addEventListener('click', () => B.connectWizard({ step: 4, onDone: refresh }));
  // Surnom d'une IA : « ✎ Donner un surnom » ouvre une petite saisie sous le nom ; vide = pas de surnom
  $$('[data-nick-box]', view).forEach((box) => {
    const id = box.dataset.nickBox;
    const btn = $('[data-nick-edit]', box);
    const form = $('.ai-nick-form', box);
    const inp = $('input', form);
    const open = (yes) => { form.hidden = !yes; btn.hidden = yes; if (yes) { inp.value = aiNickname(B.me, id); inp.focus(); inp.select(); } };
    const save = async () => {
      const value = inp.value.trim().slice(0, 24);
      if (value === aiNickname(B.me, id)) return open(false);
      const next = { ...(B.me.ai_nicknames || {}) };
      if (value) next[id] = value; else delete next[id];
      try {
        await B.updateMe({ ai_nicknames: next });
        B.toast(value ? tr('Surnom enregistré : {n}', { n: esc(value) }) : tr('Surnom retiré'));
        refresh();
      } catch (err) { B.error(err); }
    };
    btn.onclick = () => open(true);
    $('[data-nick-save]', form).onclick = save;
    $('[data-nick-cancel]', form).onclick = () => open(false);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') open(false); });
  });
  $$('[data-refresh]', view).forEach((b) => (b.onclick = () => B.connectorRefresh(b.dataset.refresh, refresh)));
  $$('.con-del', view).forEach((b) => (b.onclick = async () => {
    const ok = await B.confirm(tr("Ne plus proposer {ai} à l'équipe ? Pour couper vraiment l'accès, retirez aussi le connecteur BIVOUAC-TECH dans les réglages de {ai}.", { ai: PROVIDERS[b.dataset.p].label }), tr('Retirer'));
    if (!ok) return;
    await B.updateMe({ connector_providers: (me.connector_providers || []).filter((x) => x !== b.dataset.p) }).catch(B.error);
    refresh();
  }));

  // Correcteur (réglage de ce poste)
  $('#gr-on', view).onchange = (e) => B.setGrammarPrefs({ on: e.target.checked });
  $('#gr-lang', view).onchange = (e) => B.setGrammarPrefs({ lang: e.target.value });
  const showDict = () => {
    const words = store.get('grammar:dict') || [];
    $('#gr-dict', view).innerHTML = words.length
      ? `${tr(words.length > 1 ? '{n} mots ajoutés' : '{n} mot ajouté', { n: words.length })} · <button class="link small" id="gr-clear">${tr('Vider')}</button>`
      : tr('Vide : clic droit sur un mot souligné → « Ajouter au dictionnaire ».');
    $('#gr-clear', view)?.addEventListener('click', () => { store.set('grammar:dict', []); showDict(); B.emit('grammar'); });
  };
  showDict();

  // Sons : activés par type, volume (réglage de ce poste)
  $$('[data-sound]', view).forEach((c) => c.onchange = () => B.setSoundPrefs({ [c.dataset.sound]: c.checked }));
  $$('[data-demo]', view).forEach((b) => b.onclick = () => B.playSound(b.dataset.demo, { force: true }));
  const vol = $('#snd-vol', view);
  vol.oninput = () => { $('#snd-vol-v', view).textContent = `${vol.value} %`; B.setSoundPrefs({ volume: Number(vol.value) / 100 }); };
  vol.onchange = () => B.playSound('notif', { force: true });

  // Vocal : choix du micro et du haut-parleur (réglage de ce poste)
  const fillDevices = async () => {
    const micSel = $('#v-mic', view);
    if (!micSel) return;
    const spkSel = $('#v-speaker', view);
    const { mics, speakers } = await B.listAudioDevices().catch(() => ({ mics: [], speakers: [] }));
    if (!micSel.isConnected) return; // on a quitté les Paramètres pendant la recherche des appareils
    const cur = B.voiceDevices();
    const opts = (list, current, none) => [`<option value="">${tr('Par défaut (Windows)')}</option>`]
      .concat(list.map((d, i) => `<option value="${esc(d.deviceId)}" ${d.deviceId === current ? 'selected' : ''}>${esc(d.label || `${none} ${i + 1}`)}</option>`)).join('');
    micSel.innerHTML = mics.length ? opts(mics, cur.mic, tr('Micro')) : `<option value="">${tr('Aucun micro détecté')}</option>`;
    spkSel.innerHTML = opts(speakers, cur.speaker, tr('Sortie'));
    micSel.disabled = !mics.length;
    $('#v-msg', view).textContent = !mics.length
      ? tr('Aucun micro détecté ou micro désactivé : vous pourrez écouter un vocal, mais personne ne vous entendra. Vérifiez qu\'il est branché et autorisé dans Windows (Paramètres → Confidentialité → Microphone).')
      : B.voice ? tr('Le nouveau micro sera utilisé au prochain vocal ; le haut-parleur change tout de suite.') : '';
  };
  fillDevices();
  $('#v-mic', view).onchange = (e) => { B.voiceSetMic(e.target.value); fillDevices(); };
  $('#v-speaker', view).onchange = (e) => B.voiceSetSpeaker(e.target.value);
  // Caméra : choix + aperçu à la demande (coupé en quittant la page)
  let camTest = null;
  const stopCamTest = () => { camTest?.getTracks().forEach((t) => t.stop()); camTest = null; $('.cam-preview', view)?.classList.add('hidden'); const b = $('#v-cam-test', view); if (b) b.innerHTML = `${icon('video', 14)} ${tr('Tester la caméra')}`; };
  const fillCams = async () => {
    const sel = $('#v-cam', view);
    if (!sel) return;
    const cams = await B.listVideoDevices().catch(() => []);
    const cur = B.voiceDevices().cam;
    sel.innerHTML = cams.length
      ? [`<option value="">${tr('Par défaut (Windows)')}</option>`].concat(cams.map((d, i) => `<option value="${esc(d.deviceId)}" ${d.deviceId === cur ? 'selected' : ''}>${esc(d.label || `${tr('Caméra')} ${i + 1}`)}</option>`)).join('')
      : `<option value="">${tr('Aucune caméra détectée')}</option>`;
    sel.disabled = !cams.length;
    $('#v-cam-test', view).disabled = !cams.length;
  };
  fillCams();
  $('#v-cam', view).onchange = async (e) => {
    if (B.voice?.cam) await B.voiceSwitchCamera(e.target.value).catch(B.error); else B.voiceSetCam(e.target.value);
    if (camTest) { stopCamTest(); $('#v-cam-test', view).click(); }
  };
  $('#v-cam-test', view).onclick = async () => {
    if (camTest) return stopCamTest();
    camTest = await B.openCamera();
    if (!camTest) return B.toast(tr('Aucune caméra détectée ou caméra refusée. Vérifiez-la dans Paramètres → Vocal et vidéo.'), { type: 'error' });
    $('#v-cam-video', view).srcObject = camTest;
    $('.cam-preview', view).classList.remove('hidden');
    $('#v-cam-test', view).innerHTML = `${icon('videooff', 14)} ${tr('Arrêter l\'aperçu')}`;
  };
  B.onLeave(stopCamTest);
  navigator.mediaDevices.addEventListener?.('devicechange', fillCams);
  B.onLeave(() => navigator.mediaDevices.removeEventListener?.('devicechange', fillCams));
  const vv = $('#v-volume', view);
  vv.oninput = () => { $('#v-volume-v', view).textContent = `${vv.value} %`; B.voiceSetOutVolume(Number(vv.value) / 100); };
  navigator.mediaDevices.addEventListener?.('devicechange', fillDevices);
  B.onLeave(() => navigator.mediaDevices.removeEventListener?.('devicechange', fillDevices));

  // Résumé « Qu'est-ce que j'ai raté ? » : un seul choix, enregistré sur ce poste
  $$('input[name=summary]', view).forEach((r) => (r.onchange = () => {
    store.set('summary', r.value);
    $$('.summary-option', view).forEach((x) => x.classList.toggle('on', $('input', x).checked));
  }));

  // Langue (réglage local : l'application se recharge dans la nouvelle langue)
  $$('input[name=lang]', view).forEach((r) => (r.onchange = () => B.setLang(r.value)));

  // Niveau
  $$('input[name=lvl]', view).forEach((r) => (r.onchange = async () => {
    await B.updateMe({ level: r.value }).catch(B.error);
    $$('input[name=lvl]', view).forEach((x) => x.closest('.level').classList.toggle('on', x.checked));
  }));
  $('#s-today', view).onchange = (e) => B.setTodayTasksEnabled(e.target.checked);
  $('#s-tour', view).onclick = () => { location.hash = '#/home'; setTimeout(B.startTour, 400); };

  // Mises à jour
  const showUpdate = (u) => {
    if (!$('#up-text', view)) return;
    $('#up-text', view).textContent = B.updateText(u);
    $('#app-version', view).textContent = u.current || '';
    $('#up-check', view).disabled = !u.packaged || u.state === 'checking' || u.state === 'downloading';
    $('#up-install', view).classList.toggle('hidden', u.state !== 'ready');
  };
  showUpdate(B.update);
  B.onLeave(B.on('update', showUpdate));
  $('#up-check', view).onclick = async () => {
    showUpdate({ ...B.update, state: 'checking' });
    const u = await window.bivouac.checkUpdate();
    B.update = { ...B.update, ...u };
    showUpdate(B.update);
  };
  $('#up-install', view).onclick = () => window.bivouac.installUpdate();
  $('#s-logout', view).onclick = () => B.sb.auth.signOut();

  // IA
  $$('.provider', view).forEach(async (card) => {
    const id = card.dataset.p;
    $('.help', card).onclick = (e) => window.bivouac.openExternal(e.target.dataset.url);
    $('.save', card).onclick = async () => {
      const key = $('.key', card).value.trim();
      if (!key) return;
      $('#k-msg', view).textContent = tr('Vérification de la clé…');
      try {
        await window.bivouac.setKey(id, key);
        delete B.modelCache[id];
        await B.models(id); // test immédiat
        await B.loadMyProviders();
        B.pages.settings(view);
      } catch (err) {
        await window.bivouac.deleteKey(id);
        $('#k-msg', view).textContent = tr('Clé refusée : {err}', { err: errText(err) });
      }
    };
    $('.del', card)?.addEventListener('click', async () => {
      await window.bivouac.deleteKey(id);
      delete B.modelCache[id];
      await B.loadMyProviders();
      B.pages.settings(view);
    });
    const sel = $('.model', card);
    if (sel) {
      try {
        const models = await B.models(id);
        const cheapest = B.cheapestModel(id, models);
        const current = await B.modelFor(id);
        // ordre d'affichage : économique, équilibré, puissant
        const rank = { eco: 0, mid: 1, top: 2 };
        const sorted = [...models].sort((a, b) => rank[B.modelTier(id, a)] - rank[B.modelTier(id, b)]);
        sel.innerHTML = sorted.map((m) => `<option value="${esc(m)}" ${m === current ? 'selected' : ''}>${esc(m)} · ${esc(B.tierLabel(B.modelTier(id, m)))}${m === cheapest ? ` (${esc(tr('par défaut'))})` : ''}</option>`).join('');
        // revenir au modèle par défaut = ne plus rien retenir (il suivra le moins cher s'il change)
        sel.onchange = () => store.set(`model:${id}`, sel.value === cheapest ? null : sel.value);
      } catch (err) { sel.innerHTML = `<option>${esc(errText(err))}</option>`; }
    }
  });
};
