// =====================================================================
// grammar.js — correcteur façon Word : orthographe, grammaire, accords, ponctuation
//
// Moteur : LanguageTool, version gratuite en ligne (appelée par le processus principal,
// canal IPC `grammar:check`). Gratuit = 20 vérifications par minute et par PC : on attend
// une courte pause dans la frappe avant de vérifier, et seulement si le texte a changé.
// Hors ligne ou quota atteint : le correcteur orthographique de base (Chromium) reprend.
//
// Affichage : un calque transparent posé sur la zone de saisie dessine les soulignements
//   rouge = orthographe · bleu = grammaire, accords · gris = ponctuation, typographie, style
// Clic droit sur un mot souligné : suggestions, explication, Ignorer, Ajouter au dictionnaire.
// Réglages de CE poste (Paramètres → Correcteur) : activé, langue, dictionnaire personnel.
// =====================================================================

const GRAMMAR_DELAY = 1200;      // pause dans la frappe avant de vérifier (ms)
const GRAMMAR_MAX = 6000;        // caractères vérifiés au plus (au-delà : le début seulement)

B.grammarPrefs = () => ({ on: true, lang: 'app', ...(store.get('grammar') || {}) });
B.setGrammarPrefs = (patch) => { store.set('grammar', { ...B.grammarPrefs(), ...patch }); B.emit('grammar'); };
const grammarDict = () => new Set(store.get('grammar:dict') || []);

/** Langue de correction : celle de l'app, ou celle choisie dans Paramètres */
function grammarLang() {
  const l = B.grammarPrefs().lang;
  if (l === 'fr' || l === 'en-US' || l === 'auto') return l;
  return B.lang === 'en' ? 'en-US' : 'fr';
}

/** Type d'erreur → couleur du soulignement */
function grammarKind(m) {
  const t = m.rule?.issueType;
  const cat = m.rule?.category?.id || '';
  if (t === 'misspelling' || cat === 'TYPOS') return 'spell';
  if (t === 'whitespace' || t === 'typographical' || t === 'style' || cat === 'TYPOGRAPHY' || cat === 'PUNCTUATION' || cat === 'STYLE') return 'style';
  return 'grammar';
}

const states = new WeakMap(); // textarea -> { layer, text, matches, timer, ignored }
let cooldownUntil = 0;        // quota gratuit atteint : on se repose sur le correcteur de base

/** Vérifie le texte d'une zone (après une pause dans la frappe) */
async function grammarCheck(ta) {
  const st = states.get(ta);
  if (!st || !B.grammarPrefs().on || !window.bivouac?.grammarCheck) return;
  const text = ta.value.slice(0, GRAMMAR_MAX);
  if (text === st.checked) return;
  if (text.trim().length < 3) { st.checked = text; st.matches = []; return paint(ta); }
  if (Date.now() < cooldownUntil) { ta.spellcheck = true; return; }
  const asked = text;
  const generation = st.generation;
  try {
    const r = await window.bivouac.grammarCheck({ text, lang: grammarLang() });
    if (st.generation !== generation || !B.grammarPrefs().on || ta.value.slice(0, GRAMMAR_MAX) !== asked) return; // on a retapé entre-temps : la vérification suivante prendra le relais
    st.checked = asked;
    st.matches = r.matches || [];
    ta.spellcheck = false; // LanguageTool souligne aussi l'orthographe : pas de double soulignement
  } catch (err) {
    if (st.generation !== generation || !B.grammarPrefs().on) return;
    // Hors ligne, quota gratuit atteint… : on garde le correcteur de base 1 minute
    cooldownUntil = Date.now() + (/429|quota|trop/i.test(err.message || '') ? 60000 : 30000);
    st.matches = [];
    ta.spellcheck = true;
  }
  paint(ta);
}

/** Erreurs encore valables (texte inchangé à cet endroit, ni ignorées, ni dans le dictionnaire) */
function liveMatches(ta) {
  const st = states.get(ta);
  if (!st?.matches?.length || !B.grammarPrefs().on) return [];
  const dict = grammarDict();
  return st.matches.filter((m) => {
    const word = st.checked.substr(m.offset, m.length);
    if (ta.value.substr(m.offset, m.length) !== word) return false; // le texte a bougé ici
    if (st.ignored.has(`${m.rule?.id}:${word}`)) return false;
    if (grammarKind(m) === 'spell' && dict.has(word.toLowerCase())) return false;
    return true;
  });
}

/** Dessine les soulignements sur le calque */
function paint(ta) {
  const st = states.get(ta);
  if (!st) return;
  const ms = liveMatches(ta).sort((a, b) => a.offset - b.offset);
  const text = ta.value;
  let html = '';
  let at = 0;
  for (const m of ms) {
    if (m.offset < at) continue;
    html += esc(text.slice(at, m.offset));
    html += `<mark class="gram-${grammarKind(m)}" data-o="${m.offset}">${esc(text.substr(m.offset, m.length))}</mark>`;
    at = m.offset + m.length;
  }
  html += `${esc(text.slice(at))}​`;
  st.layer.innerHTML = html;
  placeLayer(ta);
}

/** Le calque suit exactement la zone de saisie (position, taille, police, défilement) */
function placeLayer(ta) {
  const st = states.get(ta);
  if (!st) return;
  const cs = getComputedStyle(ta);
  const l = st.layer;
  for (const k of ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'textAlign', 'tabSize', 'boxSizing']) l.style[k] = cs[k];
  l.style.left = `${ta.offsetLeft}px`;
  l.style.top = `${ta.offsetTop}px`;
  l.style.width = `${ta.offsetWidth}px`;
  l.style.height = `${ta.offsetHeight}px`;
  l.scrollTop = ta.scrollTop;
  l.style.display = ta.offsetParent ? '' : 'none';
}

/** Branche le correcteur sur une zone de saisie (une fois) */
function attach(ta) {
  if (states.has(ta) || ta.dataset.grammar === 'off') return;
  const layer = document.createElement('div');
  layer.className = 'gram-layer';
  layer.setAttribute('aria-hidden', 'true');
  const parent = ta.parentElement;
  if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
  ta.insertAdjacentElement('afterend', layer);
  const st = { layer, checked: '', matches: [], timer: null, generation: 0, ignored: new Set() };
  states.set(ta, st);
  ta.addEventListener('input', () => {
    if (!ta.value) return B.grammarReset(ta);
    st.generation++;
    paint(ta);
    clearTimeout(st.timer);
    st.timer = setTimeout(() => grammarCheck(ta), GRAMMAR_DELAY);
  });
  ta.addEventListener('scroll', () => { layer.scrollTop = ta.scrollTop; });
  new ResizeObserver(() => placeLayer(ta)).observe(ta);
  if (ta.value.trim()) st.timer = setTimeout(() => grammarCheck(ta), 300);
}

// Toutes les zones de texte de l'app, dès qu'on y entre
document.addEventListener('focusin', (e) => {
  if (e.target.matches?.('textarea') && B.grammarPrefs().on) attach(e.target);
});
/** Après un effacement par le code : annuler les vérifications et vider immédiatement le calque.
 * Appeler au moment réel de l'effacement, notamment après le succès d'un envoi asynchrone.
 */
B.grammarReset = (ta) => {
  const st = states.get(ta);
  if (!st) return;
  clearTimeout(st.timer);
  st.timer = null;
  st.generation++;
  st.checked = null; // le même texte retapé doit être vérifié à nouveau
  st.matches = [];
  st.ignored.clear();
  paint(ta);
};

// Repli pour les autres formulaires dont les champs sont vidés de façon synchrone.
document.addEventListener('submit', () => setTimeout(() => {
  document.querySelectorAll('textarea').forEach((ta) => { if (!ta.value) B.grammarReset(ta); });
}, 0), true);

// Réglage changé : tout redessiner (ou tout effacer)
B.on('grammar', () => document.querySelectorAll('textarea').forEach((ta) => {
  const st = states.get(ta);
  if (!st) return;
  if (!B.grammarPrefs().on) { st.matches = []; ta.spellcheck = true; }
  clearTimeout(st.timer);
  st.generation++;
  st.checked = null;
  paint(ta);
  if (B.grammarPrefs().on) grammarCheck(ta);
}));

/** Quelle erreur est sous la souris ? */
function matchAt(ta, x, y) {
  const st = states.get(ta);
  if (!st) return null;
  for (const mark of st.layer.querySelectorAll('mark')) {
    for (const r of mark.getClientRects()) {
      if (x >= r.left && x <= r.right && y >= r.top - 2 && y <= r.bottom + 2) {
        return liveMatches(ta).find((m) => m.offset === Number(mark.dataset.o)) || null;
      }
    }
  }
  return null;
}

/** Remplace l'erreur par une suggestion, comme si on l'avait tapée */
function applyFix(ta, m, value) {
  const before = ta.value;
  ta.focus();
  ta.setSelectionRange(m.offset, m.offset + m.length);
  // execCommand garde l'annulation (Ctrl+Z) ; à défaut, remplacement direct
  if (!document.execCommand('insertText', false, value)) {
    ta.value = before.slice(0, m.offset) + value + before.slice(m.offset + m.length);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

// Clic droit sur un mot souligné : notre menu (sinon le menu habituel de l'app)
document.addEventListener('contextmenu', (e) => {
  const ta = e.target.closest?.('textarea');
  if (!ta || !states.has(ta)) return;
  const m = matchAt(ta, e.clientX, e.clientY);
  if (!m) return;
  e.preventDefault();
  const st = states.get(ta);
  const word = st.checked.substr(m.offset, m.length);
  const kind = grammarKind(m);
  const label = { spell: tr('Orthographe'), grammar: tr('Grammaire'), style: tr('Ponctuation et typographie') }[kind];
  const menu = B.popMenu(e.clientX, e.clientY, `
    <div class="pop-title gram-title"><span class="gram-dot gram-${kind}"></span> ${label}</div>
    <p class="pop-note gram-msg">${esc(m.message)}</p>
    ${(m.replacements || []).slice(0, 5).map((r, i) => `<button class="pop-item gram-fix" data-fix="${i}"><strong>${esc(r.value) || `<em>${tr('(supprimer)')}</em>`}</strong></button>`).join('')}
    ${m.replacements?.length ? '' : `<p class="pop-note">${tr('Pas de suggestion.')}</p>`}
    <div class="pop-sep"></div>
    <button class="pop-item" data-ignore>${tr('Ignorer')}</button>
    ${kind === 'spell' ? `<button class="pop-item" data-learn>${tr('Ajouter « {word} » au dictionnaire', { word: esc(word) })}</button>` : ''}`);
  menu.addEventListener('click', (ev) => {
    const fix = ev.target.closest('[data-fix]');
    if (fix) applyFix(ta, m, m.replacements[Number(fix.dataset.fix)].value);
    else if (ev.target.closest('[data-ignore]')) st.ignored.add(`${m.rule?.id}:${word}`);
    else if (ev.target.closest('[data-learn]')) store.set('grammar:dict', [...grammarDict(), word.toLowerCase()].slice(-2000));
    else return;
    B.closePopMenu();
    paint(ta);
  });
});

B.grammarAttach = attach; // pour les tests
