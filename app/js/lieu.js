// =====================================================================
// lieu.js — lieu de résidence, fuseau horaire et heure locale des membres (v0.8.76, migration 046)
//
// Tâche « Lieu de résidence » d'Apo, choix d'Amaury du 25/11 :
// - pays, ville et fuseau dans le profil PUBLIC (profiles.country / city / timezone), visibles des coéquipiers et des IA ;
//   adresse et code postal restent PRIVÉS (profile_private, account.js) ;
// - fuseau « mixte » : celui de l'appareil s'il correspond au pays, sinon le fuseau du pays ; corrigeable dans
//   Paramètres → Mon profil ; rempli tout seul à la connexion s'il est vide (B.autoFillTimeZone) ;
// - affichage : l'heure qu'il est chez un membre, à côté de son nom (« En ligne », Équipe, messages privés), seulement
//   quand elle diffère de la mienne (sauf dans l'onglet Équipe) ; lune la nuit chez lui (22 h - 7 h).
// Table pays → fuseaux : B.TZ_BY_COUNTRY (fuseaux.js). Tout affichage de l'heure d'un membre passe par B.localTimeHtml.
// =====================================================================

/** Fuseau de l'appareil (Europe/Paris…) ; null si le navigateur ne le donne pas */
B.deviceTimeZone = () => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch { return null; }
};

const ZONE_COUNTRY = (() => {
  const map = {};
  for (const [cc, zones] of Object.entries(B.TZ_BY_COUNTRY || {})) for (const z of zones) map[z] = map[z] || cc;
  return map;
})();

/** Pays d'un fuseau (« Europe/Paris » → « FR ») ; null si inconnu */
B.countryOfZone = (tz) => ZONE_COUNTRY[tz] || null;

/** Le navigateur connaît-il ce fuseau ? */
B.zoneOk = (tz) => {
  if (!tz) return false;
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; }
};

/** Décalage avec UTC en minutes (Paris l'hiver : 60) ; null si fuseau inconnu */
B.tzOffset = (tz, d = new Date()) => {
  if (!B.zoneOk(tz)) return null;
  try {
    const s = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' })
      .formatToParts(d).find((p) => p.type === 'timeZoneName')?.value || '';
    const m = s.match(/GMT(?:([+-])(\d{1,2}):?(\d{2})?)?/);
    if (m) return m[1] ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0)) : 0;
  } catch { /* navigateur ancien : calcul à la main */ }
  const here = new Date(d.toLocaleString('en-US', { timeZone: 'UTC' }));
  const there = new Date(d.toLocaleString('en-US', { timeZone: tz }));
  return Math.round((there - here) / 60000);
};

/** « UTC+1 », « UTC−3:30 » */
B.tzOffsetText = (tz) => {
  const o = B.tzOffset(tz);
  if (o == null) return '';
  const a = Math.abs(o);
  return `UTC${o < 0 ? '−' : '+'}${Math.floor(a / 60)}${a % 60 ? ':' + String(a % 60).padStart(2, '0') : ''}`;
};

/** Ville du fuseau (« America/New_York » → « New York ») */
B.zoneCity = (tz) => String(tz || '').split('/').pop().replace(/_/g, ' ');

/**
 * Fuseau choisi automatiquement (mixte) : celui de l'appareil s'il appartient au pays (ou a le même décalage qu'un
 * fuseau du pays : noms anciens comme Asia/Calcutta) ; sinon le fuseau du pays (le premier s'il y en a plusieurs) ;
 * sans pays, celui de l'appareil.
 */
B.autoTimeZone = (country, device = B.deviceTimeZone()) => {
  const zones = (country && B.TZ_BY_COUNTRY?.[country]) || [];
  if (!zones.length) return device;
  if (device && zones.includes(device)) return device;
  const off = device ? B.tzOffset(device) : null;
  if (off != null) { const same = zones.find((z) => B.tzOffset(z) === off); if (same) return same; }
  return zones[0];
};

/** Nom du pays dans la langue de l'app (« FR » → « France ») */
B.countryName = (cc) => {
  if (!cc) return '';
  try { return new Intl.DisplayNames([B.lang === 'en' ? 'en' : 'fr'], { type: 'region' }).of(cc) || cc; } catch { return cc; }
};

/** Options du menu des pays, triés par nom */
B.countryOptionsHtml = (sel) => {
  const list = Object.keys(B.TZ_BY_COUNTRY || {}).map((cc) => [cc, B.countryName(cc)])
    .sort((a, b) => a[1].localeCompare(b[1], B.locale()));
  return `<option value="">${tr('— Choisir —')}</option>`
    + list.map(([cc, n]) => `<option value="${cc}"${cc === sel ? ' selected' : ''}>${esc(n)}</option>`).join('');
};

/** Options du menu des fuseaux : ceux du pays (tous s'il n'y a pas de pays), avec le décalage */
B.zoneOptionsHtml = (country, sel) => {
  let zones = (country && B.TZ_BY_COUNTRY?.[country]) || [];
  if (!zones.length) zones = [...new Set(Object.values(B.TZ_BY_COUNTRY || {}).flat())].sort();
  if (sel && !zones.includes(sel) && B.zoneOk(sel)) zones = [sel, ...zones];
  return zones.map((z) => `<option value="${esc(z)}"${z === sel ? ' selected' : ''}>${esc(B.zoneCity(z))} (${B.tzOffsetText(z)})</option>`).join('');
};

/** « Clermont-Ferrand, France » (ce que la personne a rempli) */
B.placeText = (person) => [person?.city, B.countryName(person?.country)].filter(Boolean).join(', ');

/** Mon fuseau : celui du profil, sinon celui de l'appareil */
B.myTimeZone = () => (B.zoneOk(B.me?.timezone) ? B.me.timezone : B.deviceTimeZone());

/** Heure chez une personne : { time: '15:32', night } ; null si elle n'a pas de fuseau */
B.localTime = (person, d = new Date()) => {
  const tz = person?.timezone;
  if (!B.zoneOk(tz)) return null;
  const time = new Intl.DateTimeFormat(B.locale(), { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(d);
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(d));
  return { time, night: h >= 22 || h < 7 };
};

/** Même heure que moi ? (alors inutile de l'afficher) */
B.sameTimeAsMe = (person) => B.tzOffset(person?.timezone) === B.tzOffset(B.myTimeZone());

function ltimeInner(el) {
  const person = { timezone: el.dataset.ltz, city: el.dataset.lcity, country: el.dataset.lcountry };
  const lt = B.localTime(person);
  if (!lt) return '';
  const name = el.dataset.lname || '';
  const place = B.placeText(person) || B.zoneCity(person.timezone);
  el.classList.toggle('night', lt.night);
  el.title = lt.night
    ? tr('Il fait nuit chez {name} : {time} ({place})', { name, time: lt.time, place })
    : tr('Heure locale de {name} : {time} ({place})', { name, time: lt.time, place });
  el.setAttribute('aria-label', el.title);
  const label = el.dataset.lmode === 'chez' ? tr('{time} chez {name}', { time: lt.time, name })
    : el.dataset.lmode === 'place' ? `${place} · ${lt.time}` : lt.time;
  return `${icon(lt.night ? 'moon' : 'clock', 12)} <span>${esc(label)}</span>`;
}

/**
 * Heure locale d'une personne, à poser à côté de son nom. Rien si elle n'a pas de fuseau, ou si elle est à la même
 * heure que moi (sauf `always`). mode : 'short' (« 15:32 »), 'chez' (« 15:32 chez Apo »), 'place' (« Clermont-Ferrand,
 * France · 15:32 »). Mis à jour chaque minute.
 */
B.localTimeHtml = (person, { mode = 'short', always = false } = {}) => {
  if (!person || !B.zoneOk(person.timezone)) return '';
  if (!always && B.sameTimeAsMe(person)) return '';
  const tmp = document.createElement('span');
  tmp.className = 'ltime';
  Object.assign(tmp.dataset, { ltz: person.timezone, lcity: person.city || '', lcountry: person.country || '',
    lname: person.display_name || '', lmode: mode });
  tmp.innerHTML = ltimeInner(tmp);
  return tmp.outerHTML;
};

// Chaque minute, l'heure affichée avance (une seule minuterie pour toute l'app)
setInterval(() => {
  for (const el of document.querySelectorAll('.ltime[data-ltz]')) el.innerHTML = ltimeInner(el);
}, 60000);

/**
 * À la connexion : si mon fuseau n'est pas encore rempli, on le remplit tout seul (appareil, vérifié avec mon pays).
 * Le pays n'est jamais deviné : c'est la personne qui le donne. Sans la migration 046, on ne fait rien.
 */
B.autoFillTimeZone = async () => {
  if (!B.me || !('timezone' in B.me) || B.me.timezone) return;
  const tz = B.autoTimeZone(B.me.country || null);
  if (!B.zoneOk(tz)) return;
  try { await B.updateMe({ timezone: tz }); } catch { /* sans gravité : réessayé à la prochaine connexion */ }
};
