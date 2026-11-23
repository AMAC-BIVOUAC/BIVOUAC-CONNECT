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
        <p class="muted">${tr('BIVOUAC-TECH réunit votre équipe et vos IA autour de vos projets. Commençons par vous présenter.')}</p>
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
          <button class="level on" data-l="debutant">${icon('compass', 28)}<strong>${tr('Je débute')}</strong><span>${tr('Plus de conseils : BIVOUAC-TECH vous suggère la prochaine étape de vos projets.')}</span></button>
          <button class="level" data-l="habitue">${icon('rocket', 28)}<strong>${tr("J'ai l'habitude")}</strong><span>${tr('Accompagnement léger, vous avancez à votre rythme.')}</span></button>
        </div>
        <div class="actions"><span class="spacer"></span><button class="btn primary" id="o-next2">${tr('Continuer')}</button></div>
      </div>
      <div class="onb-step hidden" data-s="3">
        <h2>${tr("C'est parti !")}</h2>
        <p class="muted">${tr('Une visite de 30 secondes pour découvrir où tout se trouve ?')}</p>
        <div class="levels big">
          <button class="level" id="o-tour">${icon('compass', 28)}<strong>${tr('Découvrir BIVOUAC-TECH')}</strong><span>${tr('Visite guidée interactive.')}</span></button>
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
// Visite guidée (refaite le 23/11, Apo) : met en lumière les zones de l'écran une par une.
// Chaque étape donne la zone sur ordinateur PUIS sur téléphone (barre du bas) : la première visible est utilisée,
// une étape sans zone visible est sautée, et la numérotation compte seulement les étapes montrées.
// Textes : clés de tr() (traduits dans i18n.js). Relancer : Paramètres → Accompagnement → « Revoir la visite guidée ».
// ---------------------------------------------------------------------

const TOUR = [
  [['[data-nav="home"]', '[data-bnav="home"]'], "Aujourd'hui",
    "Ce qui vous attend dans tous vos projets : les votes et les mentions, puis votre prochain pas dans chaque projet."],
  [['[data-tour="spaces"]', '[data-bnav="projects"]'], 'Vos projets',
    "Chaque projet a son Camp de base (le chemin jusqu'au sommet), sa Discussion (salons de l'équipe et Atelier IA), ses Tâches, ses Documents et son Équipe."],
  [['[data-nav="messages"]', '[data-bnav="messages"]'], 'Messages',
    'Les messages privés, à deux, avec les personnes de vos projets.'],
  [['[data-tour="quick"]'], 'Créer',
    "Une tâche, un projet, une invitation par lien : tout se crée d'ici."],
  [['#bell-btn'], 'La cloche',
    "Mentions, tâches confiées, votes… et les demandes d'utilisation de votre IA, que vous acceptez ou refusez."],
  [['#me-gear', '[data-bnav="settings"]'], 'Vos IA et vos réglages',
    "Branchez votre IA (Claude, ChatGPT…) avec votre abonnement, réglez vos notifications, même quand l'app est fermée. Dans un projet, « Préparer pour mon IA » la met au travail sur ce projet."],
  [['[data-tour="search"]', '#search-btn'], 'Recherche',
    'Retrouvez un message, une idée, une tâche ou un projet.']
];

const visibleZone = (sels) => {
  for (const sel of sels) {
    const el = $(sel);
    const r = el?.getBoundingClientRect();
    if (r && r.width && r.height && r.right > 0 && r.left < window.innerWidth && r.bottom > 0 && r.top < window.innerHeight) return el;
  }
  return null;
};

B.startTour = () => {
  const tour = $('#tour');
  const steps = TOUR.filter(([sels]) => visibleZone(sels));
  if (!steps.length) return;
  const end = () => { tour.classList.add('hidden'); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') end(); };
  document.addEventListener('keydown', onKey);
  const show = (i) => {
    const step = steps[i];
    if (!step) return end();
    const target = visibleZone(step[0]);
    if (!target) return show(i + 1);
    const r = target.getBoundingClientRect();
    const tipW = Math.min(320, window.innerWidth - 32);
    let top, left;
    if (r.right + tipW + 30 < window.innerWidth && r.width < 300) {   // à droite de la zone
      top = Math.min(r.top, window.innerHeight - 220);
      left = r.right + 18;
    } else {                                                          // en dessous, sinon au-dessus
      top = r.bottom + 230 < window.innerHeight ? r.bottom + 14 : Math.max(r.top - 230, 16);
      left = Math.min(Math.max(r.left, 16), window.innerWidth - tipW - 16);
    }
    const last = i === steps.length - 1;
    tour.innerHTML = `
      <div class="tour-hole" style="top:${r.top - 6}px;left:${r.left - 6}px;width:${r.width + 12}px;height:${r.height + 12}px"></div>
      <div class="tour-tip" role="dialog" aria-live="polite" style="top:${top}px;left:${left}px;width:${tipW}px">
        <small>${i + 1} / ${steps.length}</small>
        <h3>${esc(tr(step[1]))}</h3><p>${esc(tr(step[2]))}</p>
        <div class="actions"><button class="btn small" data-end>${tr('Passer')}</button><span class="spacer"></span>
          ${i ? `<button class="btn small" data-prev>${tr('Retour')}</button>` : ''}
          <button class="btn small primary" data-next>${last ? tr('Terminer') : tr('Suivant')}</button></div>
      </div>`;
    tour.classList.remove('hidden');
    $('[data-end]', tour).onclick = end;
    $('[data-prev]', tour)?.addEventListener('click', () => show(i - 1));
    $('[data-next]', tour).onclick = () => (last ? end() : show(i + 1));
    $('[data-next]', tour).focus();
  };
  show(0);
};
