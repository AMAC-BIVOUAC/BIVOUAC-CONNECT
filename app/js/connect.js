// =====================================================================
// connect.js — assistant « Brancher mon IA » (pas à pas, pour non-initiés)
// Choisir son IA (Claude ou ChatGPT, avec son abonnement) → ouvrir ses réglages → copier le nom
// et l'adresse → autoriser → l'app vérifie toute seule (le connecteur se signale, migration 012 ;
// l'IA est reconnue d'après le nom de l'app qui se connecte, voir bivouac-mcp/index.ts).
// =====================================================================

const CLAUDE_CONNECTORS = 'https://claude.ai/settings/connectors';
const CHATGPT_HOME = 'https://chatgpt.com'; // Plugins → Ajouter → Ajouter un serveur MCP personnalisé
const CONNECT_TEST_PHRASE = () => tr('Liste mes projets Bivouac');
const quote = (s) => tr('« {s} »', { s });

/** Le connecteur s'est-il déjà signalé pour cette IA ? */
B.connectorOk = (provider = 'anthropic') =>
  Boolean(B.me?.connector_seen_at) && (B.me.connector_providers || []).includes(provider);

/**
 * Ouvre l'assistant. `step` : 0 = choisir son IA, 4 = vérifier la connexion.
 * `onDone` est appelé quand on ferme l'assistant après un changement.
 */
B.connectWizard = ({ step = 0, ai: aiStart = null, onDone = null } = {}) => {
  let current = step;
  // IA choisie : 'anthropic' (Claude) ou 'openai' (ChatGPT). « Vérifier » reprend celle déjà branchée.
  let ai = aiStart || ((B.me?.connector_providers || []).includes('openai') && !(B.me?.connector_providers || []).includes('anthropic') ? 'openai' : 'anthropic');
  const label = () => PROVIDERS[ai].label;
  const gpt = () => ai === 'openai';
  let changed = false;
  let timer = null;
  const openedAt = Date.now() - 60000; // une connexion pendant l'assistant compte (1 min de marge d'horloge)

  const dots = () => `<div class="cw-dots">${[1, 2, 3, 4].map((n) =>
    `<span class="${n < current ? 'done' : n === current ? 'on' : ''}">${n}</span>`).join('')}</div>`;

  // Petites « captures » dessinées (pas d'images : elles restent justes en français comme en anglais)
  const shot = (title, body) => `<div class="cw-shot" aria-hidden="true">
      <div class="cw-shot-bar"><i></i><i></i><i></i><span>${title}</span></div>
      <div class="cw-shot-body">${body}</div></div>`;

  const copyField = (label, value, id) => `<div class="cw-copy"><label>${label}</label>
      <div class="row"><code id="${id}">${esc(value)}</code>
      <button class="btn small" data-copy="${id}">${icon('copy', 14)} ${tr('Copier')}</button></div></div>`;

  const steps = {
    // 0. Quelle IA ?
    0: () => `
      <h2>${tr('Brancher mon IA')}</h2>
      <p class="muted">${tr('Votre IA pourra lire vos projets, répondre dans l\'Atelier et créer des tâches. Quelle IA utilisez-vous ?')}</p>
      <div class="cw-choices">
        <button class="cw-choice" data-ai="anthropic">${aiAvatar('anthropic', 34)}
          <span><strong>${tr('Claude, avec mon abonnement')}</strong>
          <span class="muted small">${tr('Gratuit, Pro ou Max. Rien à payer en plus, aucune clé à créer. Recommandé.')}</span></span>
          ${icon('chevron', 16)}</button>
        <button class="cw-choice" data-ai="openai">${aiAvatar('openai', 34)}
          <span><strong>${tr('ChatGPT, avec mon abonnement')}</strong>
          <span class="muted small">${tr('Avec votre compte ChatGPT. Rien à payer en plus, aucune clé à créer.')}</span></span>
          ${icon('chevron', 16)}</button>
${window.BIVOUAC_WEB ? '' : `        <button class="cw-choice" data-advanced>${aiAvatar('mistral', 34)}
          <span><strong>${tr('Une autre IA (Mistral, Gemini, Grok…)')}</strong>
          <span class="muted small">${tr('Avec une clé API, payée à l\'usage chez le fournisseur. Pour les habitués.')}</span></span>
          ${icon('chevron', 16)}</button>`}
      </div>
      <div class="actions"><span class="spacer"></span><button class="btn" data-close>${tr('Plus tard')}</button></div>`,

    // 1. Ouvrir les réglages de l'IA
    1: () => gpt() ? `${dots()}
      <h2>${tr('Ouvrez les plugins de ChatGPT')}</h2>
      <p>${tr('Le bouton ci-dessous ouvre ChatGPT. Connectez-vous si on vous le demande. Dans le menu de gauche, cliquez sur <strong>Plugins</strong>, puis sur <strong>Ajouter</strong> en haut à droite, et choisissez <strong>Ajouter un serveur MCP personnalisé</strong>.')}</p>
      ${shot('chatgpt.com', `
        <div class="cw-shot-side"><span>${tr('Nouvelle conversation')}</span><span class="on">${tr('Plugins')}</span></div>
        <div class="cw-shot-main"><b>${tr('Plugins')}</b><span class="cw-line"></span>
          <span class="cw-shot-btn pulse">+ ${tr('Ajouter')} → ${tr('Ajouter un serveur MCP personnalisé')}</span></div>`)}
      <p class="muted small">${tr('Vous ne voyez pas « Plugins » ? Vérifiez que vous êtes connecté à votre compte ChatGPT : selon l\'offre ou le compte (entreprise), la fonction peut ne pas être proposée.')}</p>
      <div class="actions"><button class="btn" data-go="0">${tr('Retour')}</button><span class="spacer"></span>
        <button class="btn" id="cw-open">${icon('arrow', 14)} ${tr('Ouvrir ChatGPT')}</button>
        <button class="btn primary" data-go="2">${tr('Suivant')}</button></div>` : `${dots()}
      <h2>${tr('Ouvrez les connecteurs de Claude')}</h2>
      <p>${tr('Le bouton ci-dessous ouvre la bonne page de Claude. Connectez-vous à votre compte Claude si on vous le demande, puis cliquez sur <strong>Ajouter un connecteur personnalisé</strong>.')}</p>
      ${shot('claude.ai', `
        <div class="cw-shot-side"><span>${tr('Paramètres')}</span><span class="on">${tr('Connecteurs')}</span></div>
        <div class="cw-shot-main"><b>${tr('Connecteurs')}</b><span class="cw-line"></span><span class="cw-line short"></span>
          <span class="cw-shot-btn pulse">+ ${tr('Ajouter un connecteur personnalisé')}</span></div>`)}
      <p class="muted small">${tr('Vous préférez l\'application de bureau Claude ? Même chemin : Paramètres → Connecteurs. Le connecteur s\'ajoute une fois et marche partout (ordinateur, site, téléphone).')}</p>
      <div class="actions"><button class="btn" data-go="0">${tr('Retour')}</button><span class="spacer"></span>
        <button class="btn" id="cw-open">${icon('arrow', 14)} ${tr('Ouvrir Claude')}</button>
        <button class="btn primary" data-go="2">${tr('Suivant')}</button></div>`,

    // 2. Nom + adresse à copier
    2: () => gpt() ? `${dots()}
      <h2>${tr('Ajoutez le serveur BIVOUAC-TECH')}</h2>
      <p>${tr('Dans la fenêtre « Ajouter un serveur MCP personnalisé », collez le nom et l\'adresse. Si ChatGPT demande une authentification, choisissez <strong>OAuth</strong>. Puis validez.')}</p>
      ${copyField(tr('Nom'), 'BIVOUAC-TECH', 'cw-name')}
      ${copyField(tr('Adresse du serveur MCP (URL)'), CONNECTOR_URL(), 'cw-url')}
      ${shot(tr('Ajouter un serveur MCP personnalisé'), `
        <div class="cw-shot-main"><span class="cw-field">BIVOUAC-TECH</span><span class="cw-field">${esc(CONNECTOR_URL().replace(/^https:\/\//, ''))}</span>
          <span class="cw-field">${tr('Authentification')} : OAuth</span>
          <span class="cw-shot-btn pulse">${tr('Valider')}</span></div>`)}
      <div class="actions"><button class="btn" data-go="1">${tr('Retour')}</button><span class="spacer"></span>
        <button class="btn primary" data-go="3">${tr('Suivant')}</button></div>` : `${dots()}
      <h2>${tr('Collez le nom et l\'adresse')}</h2>
      <p>${tr('Dans la fenêtre « Ajouter un connecteur personnalisé » de Claude, remplissez les deux cases, puis cliquez sur <strong>Ajouter</strong>.')}</p>
      ${copyField(tr('Nom'), 'BIVOUAC-TECH', 'cw-name')}
      ${copyField(tr('Adresse (URL)'), CONNECTOR_URL(), 'cw-url')}
      ${shot(tr('Ajouter un connecteur personnalisé'), `
        <div class="cw-shot-main"><span class="cw-field">BIVOUAC-TECH</span><span class="cw-field">${esc(CONNECTOR_URL().replace(/^https:\/\//, ''))}</span>
          <span class="cw-shot-btn pulse">${tr('Ajouter')}</span></div>`)}
      <div class="actions"><button class="btn" data-go="1">${tr('Retour')}</button><span class="spacer"></span>
        <button class="btn primary" data-go="3">${tr('Suivant')}</button></div>`,

    // 3. Se connecter et autoriser
    3: () => `${dots()}
      <h2>${tr('Connectez-vous et autorisez')}</h2>
      <p>${gpt()
        ? tr('ChatGPT ouvre une page BIVOUAC-TECH (sinon, cliquez sur <strong>Se connecter</strong> sur le plugin BIVOUAC-TECH). Entrez <strong>le même e-mail et le même mot de passe qu\'ici</strong>, puis cliquez sur <strong>Autoriser</strong>.')
        : tr('Dans Claude, cliquez sur <strong>Se connecter</strong> à côté de BIVOUAC-TECH. Une page BIVOUAC-TECH s\'ouvre : entrez <strong>le même e-mail et le même mot de passe qu\'ici</strong>, puis cliquez sur <strong>Autoriser</strong>.')}</p>
      ${shot('BIVOUAC-TECH', `
        <div class="cw-shot-main center"><b>${tr('{ai} demande l\'accès à vos projets', { ai: label() })}</b>
          <span class="cw-line"></span><span class="cw-shot-btn pulse">${tr('Autoriser')}</span></div>`)}
      <p class="info small">${tr('Votre mot de passe reste chez BIVOUAC-TECH : {ai} ne le voit jamais. Vous pourrez retirer l\'accès à tout moment dans {ai}.', { ai: label() })}</p>
      <div class="actions"><button class="btn" data-go="2">${tr('Retour')}</button><span class="spacer"></span>
        <button class="btn primary" data-go="4">${tr('C\'est fait')}</button></div>`,

    // 4. Vérification automatique
    4: () => `${dots()}
      <h2>${tr('Vérification de la connexion')}</h2>
      <div class="cw-wait"><span class="spinner"></span><span>${tr('En attente de {ai}…', { ai: label() })}</span></div>
      <p>${tr('Pour terminer, dites à {ai} une première phrase, par exemple :', { ai: label() })} <strong>${quote(esc(CONNECT_TEST_PHRASE()))}</strong>.
        ${tr('Dès que {ai} se connecte, cette fenêtre le voit toute seule.', { ai: label() })}</p>
      ${gpt() ? `<p class="info small">${tr('Dans ChatGPT, vérifiez que les outils de BIVOUAC-TECH sont accessibles (plugin activé). S\'il n\'est pas proposé dans la conversation, ajoutez-le avec le bouton <strong>+</strong> avant d\'écrire.')}</p>` : ''}
      <div class="actions"><button class="btn" data-go="3">${tr('Retour')}</button><span class="spacer"></span>
        <button class="btn" id="cw-check">${tr('Vérifier maintenant')}</button>
        <button class="btn primary" id="cw-try">${icon('arrow', 14)} ${tr('Ouvrir {ai} avec cette phrase', { ai: label() })}</button></div>
      <p class="muted small cw-help">${gpt()
        ? tr('Rien ne se passe après quelques minutes ? Vérifiez que BIVOUAC-TECH apparaît dans les Plugins de ChatGPT et qu\'il est activé dans la conversation.')
        : tr('Rien ne se passe après quelques minutes ? Vérifiez que BIVOUAC-TECH apparaît bien comme « connecté » dans les connecteurs de Claude.')}
        <button class="link small" id="cw-manual">${tr('Je l\'ai branché, continuer sans vérifier')}</button></p>`,

    // 5. C'est branché
    5: () => `
      <div class="cw-success">${icon('check', 28)}</div>
      <h2>${tr('C\'est branché !')}</h2>
      <p>${tr('Votre {ai} peut maintenant travailler dans vos projets, avec votre abonnement. Vos coéquipiers voient que vous avez {ai} et peuvent vous le demander.', { ai: label() })}</p>
      <p class="muted">${tr('À dire à {ai}, par exemple :', { ai: label() })}</p>
      <ul class="cw-examples">
        <li>${quote(tr('Qu\'est-ce que j\'ai raté sur Bivouac ?'))}</li>
        <li>${quote(tr('Dans Bivouac, lis l\'Atelier de mon projet et propose un plan en 5 étapes'))}</li>
        <li>${quote(tr('Traite mes demandes Bivouac'))}</li>
      </ul>
      <div class="actions"><span class="spacer"></span><button class="btn primary" data-close>${tr('Terminer')}</button></div>`
  };

  const close = () => { clearInterval(timer); B.closeModal(); }; // la suite : voir l'observateur en bas

  const check = async () => {
    if (!$('#cw-wait-mark')) return clearInterval(timer); // fenêtre fermée ou autre étape
    await B.loadMe(B.me.id).catch(() => {});
    if (!$('#cw-wait-mark')) return;
    const seenNow = B.me.connector_seen_at && new Date(B.me.connector_seen_at).getTime() >= openedAt;
    if (!B.connectorOk(ai) && !seenNow) return;
    // Connexion vue mais app non reconnue par le connecteur : c'est bien l'IA qu'on vient de brancher
    if (!B.connectorOk(ai)) await B.updateMe({ connector_providers: [...new Set([...(B.me.connector_providers || []), ai])] }).catch(B.error);
    changed = true;
    show(5);
  };

  const show = (n) => {
    current = n;
    clearInterval(timer);
    const m = B.modal(`<div id="cw">${steps[n]()}${n === 4 ? '<i id="cw-wait-mark" hidden></i>' : ''}</div>`, { wide: true });
    $$('[data-go]', m).forEach((b) => (b.onclick = () => show(Number(b.dataset.go))));
    $$('[data-close]', m).forEach((b) => (b.onclick = close));
    $$('[data-copy]', m).forEach((b) => (b.onclick = async () => {
      const code = $(`#${b.dataset.copy}`, m);
      try {
        await navigator.clipboard.writeText(code.textContent);
        b.innerHTML = `${icon('check', 14)} ${tr('Copié !')}`;
        b.classList.add('ok');
      } catch {
        // Presse-papiers refusé : on sélectionne le texte, il reste Ctrl+C
        getSelection().selectAllChildren(code);
        b.textContent = tr('Faites Ctrl+C');
      }
    }));
    $('[data-advanced]', m)?.addEventListener('click', () => {
      close();
      if (!location.hash.startsWith('#/settings')) location.hash = '#/settings';
      setTimeout(() => {
        const adv = $('#ai-advanced');
        if (adv) { adv.open = true; adv.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      }, 300);
    });
    $$('[data-ai]', m).forEach((b) => (b.onclick = () => { ai = b.dataset.ai; show(1); }));
    $('#cw-open', m)?.addEventListener('click', () => window.bivouac.openExternal(gpt() ? CHATGPT_HOME : CLAUDE_CONNECTORS));
    $('#cw-try', m)?.addEventListener('click', () => window.bivouac.openAssistant(ai, CONNECT_TEST_PHRASE()).catch(B.error));
    $('#cw-check', m)?.addEventListener('click', check);
    $('#cw-manual', m)?.addEventListener('click', async () => {
      const ids = [...new Set([...(B.me.connector_providers || []), ai])];
      await B.updateMe({ connector_providers: ids }).catch(B.error);
      changed = true;
      show(5);
    });
    if (n === 4) {
      check();
      timer = setInterval(check, 4000);
    }
  };

  // Échap ou clic à côté : on arrête la vérification et on rafraîchit si besoin
  const obs = new MutationObserver(() => {
    if (!$('#cw')) { obs.disconnect(); clearInterval(timer); if (changed && onDone) onDone(); }
  });
  show(current);
  obs.observe($('#modal'), { childList: true });
};

// ---------------------------------------------------------------------
// « Actualiser le connecteur » : Claude et ChatGPT gardent la liste des outils vue au branchement.
// Quand le connecteur gagne des outils (TOOLS_VERSION), l'IA ne les voit qu'après une actualisation
// faite DANS son app (on ne peut pas la forcer d'ici). Le connecteur note la liste chargée par chaque IA
// (profiles.connector_tools, migration 023) : l'app sait quand c'est nécessaire et quand c'est fait.
// ---------------------------------------------------------------------

/** Cette IA a-t-elle chargé la dernière liste d'outils ? (réponse « faite à la main » retenue sur ce poste) */
B.connectorStale = (provider) =>
  (Number(B.me?.connector_tools?.[provider]) || 0) < CONNECTOR_TOOLS_VERSION
  && store.get(`connector-refreshed:${provider}`, 0) < CONNECTOR_TOOLS_VERSION;

B.connectorRefresh = (provider, onDone = null) => {
  const gpt = provider === 'openai';
  const claude = provider === 'anthropic';
  const label = PROVIDERS[provider]?.label || tr('votre IA');
  const steps = gpt ? [
    tr('Ouvrez ChatGPT (bouton ci-dessous), puis <strong>Plugins</strong> dans le menu de gauche.'),
    tr('Cliquez sur <strong>BIVOUAC-TECH</strong>, puis sur <strong>Actualiser</strong>.'),
    tr('Pas de bouton « Actualiser » ? <strong>Retirez</strong> BIVOUAC-TECH, puis ajoutez-le de nouveau : Ajouter → Ajouter un serveur MCP personnalisé, même nom, même adresse (ci-dessous), puis autorisez.'),
    tr('Ouvrez une <strong>nouvelle conversation</strong> : les nouveaux outils y sont.')
  ] : claude ? [
    tr('Ouvrez une <strong>nouvelle conversation</strong> dans Claude : le plus souvent, cela suffit.'),
    tr('Sinon : ouvrez les connecteurs de Claude (bouton ci-dessous), cliquez sur <strong>BIVOUAC-TECH</strong>, puis <strong>Déconnecter</strong> et <strong>Connecter</strong> (autorisez de nouveau).'),
    tr('Ouvrez une nouvelle conversation.')
  ] : [
    tr('Dans les réglages de {ai}, actualisez le connecteur BIVOUAC-TECH (ou retirez-le puis ajoutez-le de nouveau avec la même adresse).', { ai: label }),
    tr('Ouvrez une nouvelle conversation.')
  ];
  const stale = B.connectorStale(provider);
  const m = B.modal(`
    <h2>${tr('Actualiser le connecteur dans {ai}', { ai: esc(label) })}</h2>
    <p>${stale
      ? tr('BIVOUAC-TECH a de <strong>nouveaux outils</strong> (envoyer un document, ranger dans des dossiers…). {ai} garde en mémoire l\'ancienne liste : actualisez-la une fois pour qu\'il les voie.', { ai: esc(label) })
      : tr('{ai} voit déjà les derniers outils de BIVOUAC-TECH. Actualisez seulement s\'il dit qu\'un outil n\'existe pas.', { ai: esc(label) })}</p>
    <ol class="cr-steps">${steps.map((s) => `<li>${s}</li>`).join('')}</ol>
    <div class="cw-copy"><label>${tr('Adresse du serveur MCP (URL)')}</label>
      <div class="row"><code id="cr-url">${esc(CONNECTOR_URL())}</code>
      <button class="btn small" id="cr-copy">${icon('copy', 14)} ${tr('Copier')}</button></div></div>
    <p class="muted small">${tr('Une fois fait, cette page le voit toute seule dès que {ai} recharge les outils.', { ai: esc(label) })}</p>
    <div class="actions">
      ${gpt || claude ? `<button class="btn" id="cr-open">${icon('arrow', 14)} ${gpt ? tr('Ouvrir ChatGPT') : tr('Ouvrir les connecteurs de Claude')}</button>` : ''}
      <span class="spacer"></span>
      <button class="btn" data-close>${tr('Plus tard')}</button>
      <button class="btn primary" id="cr-done">${tr('C\'est fait')}</button></div>`);
  $('[data-close]', m).onclick = B.closeModal;
  $('#cr-open', m)?.addEventListener('click', () => window.bivouac.openExternal(gpt ? CHATGPT_HOME : CLAUDE_CONNECTORS));
  $('#cr-copy', m).onclick = async (e) => {
    const code = $('#cr-url', m);
    try { await navigator.clipboard.writeText(code.textContent); e.currentTarget.innerHTML = `${icon('check', 14)} ${tr('Copié !')}`; }
    catch { getSelection().selectAllChildren(code); e.currentTarget.textContent = tr('Faites Ctrl+C'); }
  };
  $('#cr-done', m).onclick = () => {
    // L'IA ne s'est peut-être pas fait reconnaître : on la croit sur parole, sur ce poste
    store.set(`connector-refreshed:${provider}`, CONNECTOR_TOOLS_VERSION);
    B.closeModal();
    B.toast(tr('Merci ! Dites par exemple à {ai} : « Liste les documents de mon projet Bivouac ».', { ai: esc(label) }), { type: 'success', timeout: 7000 });
    if (onDone) onDone();
  };
};
