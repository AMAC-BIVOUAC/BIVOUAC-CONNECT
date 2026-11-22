// =====================================================================
// Jour ou nuit pour les décors (Aujourd'hui et le chemin du Camp de base), selon l'heure du lever / coucher du soleil.
// La scène d'Aujourd'hui elle-même est dans scene.js (réglages scene-config.js, positions scene-positions.js).
// =====================================================================
(() => {
  // ---------- Jour ou nuit : lever / coucher approximatifs en France (sans réseau ni localisation) ----------
  // Lever : 5 h 50 en juin → 8 h 40 en décembre ; coucher : 21 h 55 → 17 h 00.
  const sunTimes = (d) => {
    const doy = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 864e5);
    const c = Math.cos((2 * Math.PI * (doy - 172)) / 365);
    return { rise: 7.25 - 1.45 * c, set: 19.45 + 2.45 * c };
  };
  /** 'day' ou 'night' maintenant ; store 'ambiance:moment' = 'day' | 'night' l'impose (tests, démonstration) */
  B.ambianceMoment = (d = new Date()) => {
    const forced = store.get('ambiance:moment');
    if (forced === 'day' || forced === 'night') return forced;
    const h = d.getHours() + d.getMinutes() / 60;
    const { rise, set } = sunTimes(d);
    return h >= rise && h < set ? 'day' : 'night';
  };
})();
