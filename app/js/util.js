// =====================================================================
// util.js — petits outils utilisés partout
// =====================================================================

window.B = { pages: {}, state: {} };

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Crée un élément à partir d'un morceau de HTML */
function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

/** Échappe le texte avant de l'insérer en HTML (anti-injection) */
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Mise en forme minimale et sûre : blocs de code, `code`, **gras**, listes, liens, @mentions */
function md(text) {
  let s = esc(text);
  const blocks = [];
  s = s.replace(/```[\w-]*\n?([\s\S]*?)```/g, (_m, code) => {
    blocks.push(`<pre><code>${code}</code></pre>`);
    return `\u0000${blocks.length - 1}\u0000`;
  });
  s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/^#{1,4} (.+)$\n?/gm, '<strong class="md-h">$1</strong>');
  s = s.replace(/^[ \t]*[-*•] (.+)$\n?/gm, '<span class="md-li">$1</span>');
  s = s.replace(/^[ \t]*(\d+)[.)] (.+)$\n?/gm, '<span class="md-li num" data-n="$1">$2</span>');
  s = s.replace(/(https:\/\/[^\s<]+)/g, '<a href="$1" class="ext">$1</a>');
  s = s.replace(/(^|\s)@([a-z0-9_]{3,30})/gi, '$1<span class="mention">@$2</span>');
  s = s.replace(/\u0000(\d+)\u0000/g, (_m, i) => blocks[i]);
  return s;
}

function initials(name) {
  return (name || '?').trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

const PALETTE = ['#12809A', '#F28C28', '#5ECDB5', '#0E2A3B', '#7C6FE0', '#E0607E', '#3D9BE9', '#8BAE3F'];
function colorFor(id) {
  let n = 0;
  for (const c of String(id)) n = (n * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[n % PALETTE.length];
}

/** "de Paul" / "d'Amaury" */
function de(name) {
  return /^[aeiouyhàâéèêëîïôûù]/i.test(name || '') ? `d'${name}` : `de ${name}`;
}

function fmtTime(iso) {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString(B.locale(), { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleString(B.locale(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function timeAgo(iso) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return tr("à l'instant");
  if (s < 3600) return tr('il y a {n} min', { n: Math.round(s / 60) });
  if (s < 86400) return tr('il y a {n} h', { n: Math.round(s / 3600) });
  if (s < 86400 * 7) return tr('il y a {n} j', { n: Math.round(s / 86400) });
  return new Date(iso).toLocaleDateString(B.locale());
}

function fmtDate(d) {
  if (!d) return '';
  return new Date(d + 'T00:00:00').toLocaleDateString(B.locale(), { day: 'numeric', month: 'short' });
}

function fmtSize(n) {
  const en = B.lang === 'en';
  if (n < 1024) return `${n} ${en ? 'B' : 'o'}`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} ${en ? 'KB' : 'Ko'}`;
  const mb = (n / 1024 / 1024).toFixed(1);
  return en ? `${mb} MB` : `${mb.replace('.', ',')} Mo`;
}

function debounce(fn, ms) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

/** Stockage local (préférences de CE poste uniquement) */
const store = {
  get(k, fallback = null) {
    try {
      const v = localStorage.getItem('bivouac:' + k);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(k, v) {
    try { localStorage.setItem('bivouac:' + k, JSON.stringify(v)); } catch { /* ignoré */ }
  }
};

/** Les IA connues. Les couleurs servent aux avatars (pas de logos de marque). */
const PROVIDERS = {
  anthropic: { label: 'Claude', word: 'claude', color: '#D97757' },
  openai: { label: 'ChatGPT', word: 'chatgpt', color: '#10A37F' },
  mistral: { label: 'Mistral', word: 'mistral', color: '#FA6A1E' },
  perplexity: { label: 'Perplexity', word: 'perplexity', color: '#1F8A9A' },
  gemini: { label: 'Gemini', word: 'gemini', color: '#4C7BE8' },
  xai: { label: 'Grok', word: 'grok', color: '#3A3F47' },
  deepseek: { label: 'DeepSeek', word: 'deepseek', color: '#6B5BD6' }
};
/** Toutes les IA d'une personne : par clé API et/ou via son abonnement (connecteur) */
function aisOf(person) {
  const api = person?.ai_providers || [];
  const con = person?.connector_providers || [];
  return [...new Set([...api, ...con])].map((id) => ({ id, api: api.includes(id), connector: con.includes(id) }));
}
/** Surnom donné par son propriétaire à une de ses IA (Paramètres → Mes IA), sinon '' */
function aiNickname(owner, provider) {
  const n = owner?.ai_nicknames?.[provider];
  return typeof n === 'string' ? n.trim().slice(0, 24) : '';
}
/**
 * Nom d'une IA, toujours avec son propriétaire : « Claude d'Apo », « Nova · Claude d'Apo » ;
 * en anglais « Apo's Claude ». Sans propriétaire : « Claude ».
 */
function aiName(provider, owner, { nick = true } = {}) {
  const label = PROVIDERS[provider]?.label || tr('IA');
  const base = owner ? tr('{ai} {de}', { ai: label, de: de(owner.display_name), name: owner.display_name }) : label;
  const n = nick && owner ? aiNickname(owner, provider) : '';
  return n ? `${n} · ${base}` : base;
}
// Numéro de la liste d'outils du connecteur : même valeur que TOOLS_VERSION (supabase/functions/bivouac-mcp/tools.js).
// Une IA qui a chargé une liste plus ancienne (profiles.connector_tools, migration 023) doit actualiser le connecteur.
const CONNECTOR_TOOLS_VERSION = 3;
const CONNECTOR_URL = () => `${(window.BIVOUAC_CONFIG || {}).SUPABASE_URL}/functions/v1/bivouac-mcp`;

/** Statuts dans l'équipe d'un projet */
const ROLE_LABEL = () => ({ owner: tr('Créateur'), admin: tr('Administrateur'), member: tr('Membre') });

/** Adresse de la page « Rejoindre » (site public du dépôt BIVOUAC-CONNECT ; GitHub Pages respecte les majuscules) : le code suit le # */
const INVITE_PAGE = 'https://amac-bivouac.github.io/BIVOUAC-CONNECT/rejoindre/';
/** Page publique « Nouveau mot de passe » (lien de l'e-mail « mot de passe oublié ») */
const RESET_PAGE = 'https://amac-bivouac.github.io/BIVOUAC-CONNECT/mot-de-passe/';

/** Retrouve un code d'invitation (K7QM-4TPX) dans un code tapé à la main ou un lien collé */
function inviteCodeFrom(text) {
  const m = String(text || '').toUpperCase().match(/(?:^|[^A-Z0-9])([A-HJ-NP-Z2-9]{4})-?([A-HJ-NP-Z2-9]{4})(?:$|[^A-Z0-9])/);
  return m ? `${m[1]}-${m[2]}` : String(text || '').trim();
}

const PROVIDER_BY_WORD = Object.fromEntries(Object.entries(PROVIDERS).map(([id, p]) => [p.word, id]));

/** Message d'erreur lisible */
function errText(err) {
  const m = (err?.message || String(err)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
  if (/rate limit|security purposes/i.test(m)) return tr('Trop de demandes. Patientez quelques minutes.');
  if (/invalid login credentials/i.test(m)) return tr('E-mail ou mot de passe incorrect.');
  if (/email not confirmed/i.test(m)) return tr('Adresse pas encore confirmée : cliquez sur le lien reçu par e-mail.');
  if (/already registered|already exists/i.test(m)) return tr('Un compte existe déjà avec cet e-mail : connectez-vous.');
  if (/password should be|weak password/i.test(m)) return tr('Mot de passe trop faible : 8 caractères minimum.');
  // Invitations et équipe (codes renvoyés par les fonctions de la base, migration 008)
  const team = {
    'invite:invalide': "Ce code d'invitation n'existe pas. Vérifiez-le, ou demandez une nouvelle invitation.",
    'invite:utilise': 'Cette invitation a déjà servi : elle ne vaut que pour une personne. Demandez-en une nouvelle.',
    'invite:expire': 'Cette invitation a expiré (15 jours). Demandez-en une nouvelle.',
    'invite:annule': 'Cette invitation a été annulée. Demandez-en une nouvelle.',
    'invite:interdit': 'Seuls le créateur et les administrateurs du projet peuvent inviter.',
    'invite:trop': "Trop d'invitations en attente (20). Annulez-en avant d'en créer d'autres.",
    'equipe:interdit': "Vous n'avez pas le droit de faire ça dans cette équipe.",
    'equipe:introuvable': 'Cette personne ne fait plus partie du projet.'
  };
  const key = Object.keys(team).find((k) => m.includes(k));
  if (key) return tr(team[key]);
  if (/expired|invalid.*(otp|token)/i.test(m)) return tr('Code invalide ou expiré. Redemandez un code.');
  if (/Failed to fetch|NetworkError/i.test(m)) return tr('Pas de connexion au serveur. Vérifiez internet et src/config.js.');
  if (/duplicate key.*handle/i.test(m)) return tr('Ce pseudo est déjà pris.');
  if (/violates check constraint.*handle/i.test(m)) return tr('Pseudo : 3 à 30 caractères, minuscules, chiffres ou _ uniquement.');
  return tr(m); // traduit aussi les erreurs connues du processus principal (main.js, ai.js)
}
