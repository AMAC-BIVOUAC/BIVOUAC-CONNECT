// =====================================================================
// onboarding.js — l'accueil au premier lancement + la visite guidée
// =====================================================================

B.runOnboarding = () => new Promise((resolve) => {
  const me = B.me;
  let level = 'debutant';
  const m = B.modal(`
    <div class="onb">
      <div class="onb-step" data-s="1">
        <img src="assets/mark.svg" width="64" height="64" alt="" />
        <h2>${tr('Bienvenue au camp de base !')}</h2>
        <p class="muted">${tr('Bivouac-Tech réunit votre équipe et vos IA autour de vos projets. Commençons par vous présenter.')}</p>
        <label>${tr("Comment voulez-vous qu'on vous appelle ?")}</label><input id="o-name" maxlength="40" value="${esc(me.display_name)}" />
        <label>${tr('Votre pseudo (pour les @mentions)')}</label><input id="o-handle" maxlength="30" value="${esc(me.handle)}" />
        <label>${tr('Votre rôle (facultatif)')}</label><input id="o-title" maxlength="60" placeholder="${tr('ex. Product designer')}" />
        <p class="msg" id="o-msg"></p>
        <div class="actions"><span class="spacer"></span><button class="btn primary" id="o-next">${tr('Continuer')}</button></div>
      </div>
      <div class="onb-step hidden" data-s="2">
        <h2>${tr('Choisissez votre niveau')}</h2>
        <p class="muted">${tr('Vous pourrez le changer à tout moment dans Paramètres.')}</p>
        <div class="levels big">
          <button class="level on" data-l="debutant">${icon('compass', 28)}<strong>${tr('Je débute')}</strong><span>${tr('Plus de conseils : Bivouac-Tech vous suggère la prochaine étape de vos projets.')}</span></button>
          <button class="level" data-l="habitue">${icon('rocket', 28)}<strong>${tr("J'ai l'habitude")}</strong><span>${tr('Accompagnement léger, vous avancez à votre rythme.')}</span></button>
        </div>
        <div class="actions"><span class="spacer"></span><button class="btn primary" id="o-next2">${tr('Continuer')}</button></div>
      </div>
      <div class="onb-step hidden" data-s="3">
        <h2>${tr("C'est parti !")}</h2>
        <p class="muted">${tr('Une visite de 30 secondes pour découvrir où tout se trouve ?')}</p>
        <div class="levels big">
          <button class="level" id="o-tour">${icon('compass', 28)}<strong>${tr('Découvrir Bivouac-Tech')}</strong><span>${tr('Visite guidée interactive.')}</span></button>
          <button class="level" id="o-go">${icon('arrow', 28)}<strong>${tr('Commencer directement')}</strong><span>${tr('Je me débrouille.')}</span></button>
        </div>
      </div>
    </div>`, { wide: true });

  const show = (n) => $$('.onb-step', m).forEach((s) => s.classList.toggle('hidden', s.dataset.s !== String(n)));

  $('#o-next', m).onclick = async () => {
    try {
      await B.updateMe({
        display_name: $('#o-name', m).value.trim() || me.display_name,
        handle: $('#o-handle', m).value.trim().toLowerCase(),
        title: $('#o-title', m).value.trim() || null
      });
      show(2);
    } catch (err) { $('#o-msg', m).textContent = errText(err); }
  };
  $$('[data-l]', m).forEach((b) => (b.onclick = () => {
    level = b.dataset.l;
    $$('[data-l]', m).forEach((x) => x.classList.toggle('on', x === b));
  }));
  $('#o-next2', m).onclick = () => show(3);

  const finish = async (tour) => {
    await B.updateMe({ level, onboarded: true }).catch(B.error);
    B.closeModal();
    B.renderSidebar();
    resolve();
    if (tour) setTimeout(B.startTour, 300);
  };
  $('#o-tour', m).onclick = () => finish(true);
  $('#o-go', m).onclick = () => finish(false);
});

// ---------------------------------------------------------------------
// Visite guidée : met en lumière les zones de l'écran une par une
// ---------------------------------------------------------------------

const TOUR = [
  ['[data-tour="spaces"]', 'Vos espaces', "Chaque projet a son espace : une discussion d'équipe, un Atelier IA, ses idées, tâches et documents."],
  ['[data-tour="quick"]', 'Actions rapides', 'Créez un projet, invitez un ami avec un lien, branchez une IA ou ajoutez une tâche.'],
  ['[data-nav="notifications"]', 'Notifications', "Mentions, tâches confiées… et demandes d'utilisation de votre IA : vous acceptez ou refusez, c'est votre clé."],
  ['[data-nav="settings"]', 'Vos IA', 'Dans Paramètres, collez vos clés API (Claude, ChatGPT, Gemini, Mistral…). Elles restent chiffrées sur votre PC.'],
  ['[data-tour="search"]', 'Recherche', 'Retrouvez un message, une idée, une tâche ou un projet.']
];

B.startTour = (i = 0) => {
  const tour = $('#tour');
  const step = TOUR[i];
  const target = step && $(step[0]);
  if (!step) return tour.classList.add('hidden');
  if (!target) return B.startTour(i + 1);
  const r = target.getBoundingClientRect();
  let top, left;
  if (r.right + 350 < window.innerWidth && r.width < 300) {   // à droite de la zone
    top = Math.min(r.top, window.innerHeight - 200);
    left = r.right + 18;
  } else {                                                    // en dessous, sinon au-dessus
    top = r.bottom + 190 < window.innerHeight ? r.bottom + 14 : Math.max(r.top - 190, 16);
    left = Math.min(Math.max(r.left, 16), window.innerWidth - 336);
  }
  tour.innerHTML = `
    <div class="tour-hole" style="top:${r.top - 6}px;left:${r.left - 6}px;width:${r.width + 12}px;height:${r.height + 12}px"></div>
    <div class="tour-tip" style="top:${top}px;left:${left}px">
      <small>${i + 1} / ${TOUR.length}</small>
      <h3>${esc(tr(step[1]))}</h3><p>${esc(tr(step[2]))}</p>
      <div class="actions"><button class="btn small" data-end>${tr('Passer')}</button><span class="spacer"></span>
        <button class="btn small primary" data-next>${i === TOUR.length - 1 ? tr('Terminer') : tr('Suivant')}</button></div>
    </div>`;
  tour.classList.remove('hidden');
  $('[data-end]', tour).onclick = () => tour.classList.add('hidden');
  $('[data-next]', tour).onclick = () => B.startTour(i + 1);
};
