// =====================================================================
// Décor d'Aujourd'hui (22/11, Apo) : une clairière de montagne au bord d'un lac, dessinée en SVG, style « cartoon »
// détaillé (d'après les images de référence d'Apo). DE JOUR ou DE NUIT selon l'heure du lever / coucher du soleil.
//   Plans : ciel (soleil et rayons / lune, voie lactée, étoiles), chaîne lointaine, grand sommet enneigé, forêt du fond,
//   lac (reflets, brume), grands sapins qui encadrent, clairière ; tente et lanterne, chamois sur son rocher, renard
//   dans un buisson, hibou et écureuil dans les arbres, marmotte (la mascotte), et au centre le feu de camp avec l'ours
//   assis sur un rondin qui se réchauffe les pattes.
//   Toutes les couleurs sont des jetons (--amb-d-* le jour, --amb-n-* la nuit) appliqués par des classes de styles.css.
//   Les animations sont en CSS (styles.css) : coupées par .no-anim et « réduire les animations ».
// Repère du dessin : 1600 × 900, calé en bas (preserveAspectRatio xMidYMax slice).
// =====================================================================
(() => {
  // Hasard reproductible : le décor est le même à chaque ouverture
  const seeded = (seed) => () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const f = (n) => n.toFixed(1);

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

  // ---------- Sapins ----------

  /** Sapin en étages (pointes qui tombent, côté éclairé plus clair). x, y = pied ; h = hauteur ; tone = far | mid */
  function pine(x, y, h, rnd, tone = 'mid') {
    const n = Math.max(4, Math.min(9, Math.round(h / 26)));
    const top = y - h;
    let dark = '', light = '';
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = Math.min(1, (i + 1.35) / n);
      const yt = top + h * 0.9 * t0, yb = top + h * 0.9 * t1;
      const w = h * (0.07 + 0.27 * t1) * (0.9 + rnd() * 0.2);
      const d = yb - yt;
      const tips = 3 + Math.floor(rnd() * 2);
      let bottom = '';
      for (let k = 1; k <= tips; k++) {
        const bx = x - w + (2 * w * k) / (tips + 1);
        bottom += ` L${f(bx - w / (tips + 1) / 2)},${f(yb - d * 0.12)} L${f(bx)},${f(yb + 2 + rnd() * 3)}`;
      }
      dark += `M${f(x)},${f(yt)} C${f(x - w * 0.3)},${f(yt + d * 0.45)} ${f(x - w * 0.75)},${f(yb - d * 0.2)} ${f(x - w)},${f(yb)}${bottom} L${f(x + w)},${f(yb)} C${f(x + w * 0.75)},${f(yb - d * 0.2)} ${f(x + w * 0.3)},${f(yt + d * 0.45)} ${f(x)},${f(yt)} Z `;
      light += `M${f(x)},${f(yt + 2)} C${f(x + w * 0.3)},${f(yt + d * 0.45)} ${f(x + w * 0.7)},${f(yb - d * 0.22)} ${f(x + w * 0.95)},${f(yb - 1)} L${f(x + w * 0.35)},${f(yb - d * 0.08)} C${f(x + w * 0.25)},${f(yb - d * 0.4)} ${f(x + w * 0.1)},${f(yt + d * 0.5)} ${f(x)},${f(yt + 2)} Z `;
    }
    const trunk = `<rect class="amb-trunk" x="${f(x - h * 0.025)}" y="${f(y - h * 0.12)}" width="${f(h * 0.05)}" height="${f(h * 0.12)}"/>`;
    return tone === 'far'
      ? `<path class="amb-forest-far" d="${dark}"/>`
      : `${trunk}<path class="amb-pine" d="${dark}"/><path class="amb-pine-light" d="${light}"/>`;
  }

  /** Sapin réutilisable ailleurs (paysage du Camp de base) : mêmes formes, hasard reproductible */
  B.scenePine = (x, y, h, seed = 1, tone = 'mid') => pine(x, y, h, seeded(seed), tone);
  B.sceneSeeded = seeded;

  // ---------- Les personnages ----------

  /** L'ours, assis sur son rondin, pattes tendues vers le feu (à sa gauche). Pied du corps en 0,0 */
  const bear = `
    <g class="amb-bear">
      <ellipse class="amb-shadow" cx="0" cy="8" rx="118" ry="14"/>
      <g class="amb-bear-body">
        <path class="amb-fur" d="M-80,-6 C-98,-58 -94,-124 -62,-162 C-38,-188 30,-190 58,-162 C90,-126 98,-60 82,-6 C50,6 -48,6 -80,-6 Z"/>
        <path class="amb-fur-shade" d="M34,-178 C72,-158 98,-112 94,-52 C92,-28 88,-14 82,-6 C70,0 58,2 46,2 C76,-50 74,-124 34,-178 Z"/>
        <path class="amb-rim" d="M-80,-6 C-98,-58 -94,-124 -62,-162 C-70,-124 -80,-62 -66,-4 Z"/>
        <path class="amb-fur-light" d="M-40,-132 C-62,-100 -60,-46 -36,-22 C-14,-4 22,-6 38,-30 C54,-62 40,-114 10,-136 C-6,-146 -28,-144 -40,-132 Z"/>
        <path class="amb-fur-line" d="M-84,-50 l-9,5 M-88,-92 l-9,2 M86,-70 l9,4 M74,-128 l8,0 M-62,-150 l-6,-6 M50,-160 l6,-6"/>
        <!-- jambes tendues, plantes des pieds vers nous -->
        <path class="amb-limb" d="M-40,-30 C-56,-20 -64,-14 -70,-12"/>
        <path class="amb-limb shade" d="M40,-28 C54,-18 62,-12 68,-10"/>
        <ellipse class="amb-fur-dark" cx="-78" cy="-18" rx="24" ry="30" transform="rotate(-14 -78 -18)"/>
        <ellipse class="amb-fur-dark" cx="76" cy="-16" rx="24" ry="30" transform="rotate(14 76 -16)"/>
        <ellipse class="amb-pad" cx="-79" cy="-12" rx="13" ry="15" transform="rotate(-14 -79 -12)"/>
        <ellipse class="amb-pad" cx="77" cy="-10" rx="13" ry="15" transform="rotate(14 77 -10)"/>
        <circle class="amb-pad" cx="-94" cy="-36" r="5"/><circle class="amb-pad" cx="-84" cy="-42" r="5"/><circle class="amb-pad" cx="-72" cy="-42" r="5"/>
        <circle class="amb-pad" cx="70" cy="-40" r="5"/><circle class="amb-pad" cx="82" cy="-40" r="5"/><circle class="amb-pad" cx="92" cy="-34" r="5"/>
      </g>
      <g class="amb-bear-arms">
        <path class="amb-limb shade" d="M36,-140 C10,-128 -34,-116 -70,-112"/>
        <path class="amb-limb" d="M-44,-146 C-64,-140 -80,-128 -90,-116"/>
        <circle class="amb-fur-dark" cx="-94" cy="-112" r="15"/><circle class="amb-fur-dark" cx="-74" cy="-108" r="14"/>
        <ellipse class="amb-pad" cx="-100" cy="-112" rx="7" ry="9"/><ellipse class="amb-pad" cx="-80" cy="-106" rx="6" ry="8"/>
        <path class="amb-rim" d="M-44,-160 C-66,-154 -88,-140 -104,-122 C-108,-114 -104,-104 -98,-102 C-88,-124 -66,-142 -44,-150 Z"/>
      </g>
      <g class="amb-bear-head">
        <circle class="amb-fur" cx="-38" cy="-254" r="18"/><circle class="amb-pad" cx="-38" cy="-254" r="9"/>
        <circle class="amb-fur" cx="34" cy="-258" r="18"/><circle class="amb-pad" cx="34" cy="-258" r="9"/>
        <path class="amb-fur" d="M-56,-198 C-62,-246 -32,-276 -2,-276 C30,-276 58,-248 52,-202 C48,-170 -50,-166 -56,-198 Z"/>
        <path class="amb-fur-shade" d="M22,-272 C46,-262 58,-240 52,-202 C50,-186 36,-176 20,-174 C40,-196 42,-244 22,-272 Z"/>
        <path class="amb-rim" d="M-56,-198 C-62,-246 -32,-276 -2,-276 C-32,-266 -52,-238 -48,-194 Z"/>
        <ellipse class="amb-muzzle" cx="-18" cy="-204" rx="28" ry="20"/>
        <ellipse class="amb-ink" cx="-32" cy="-214" rx="10" ry="7"/>
        <ellipse class="amb-glint" cx="-35" cy="-217" rx="3" ry="2"/>
        <path class="amb-ink-line" d="M-32,-207 v7 M-44,-194 C-34,-186 -22,-188 -14,-196"/>
        <path class="amb-ink-line thick" d="M-38,-236 c4,-5 10,-5 14,0 M-4,-238 c4,-5 10,-5 14,0"/>
        <ellipse class="amb-cheek" cx="-46" cy="-220" rx="8" ry="5"/><ellipse class="amb-cheek" cx="18" cy="-222" rx="7" ry="4"/>
      </g>
    </g>`;

  /** La marmotte (mascotte), pied en 0,0 */
  const marmot = `
    <g class="amb-marmot">
      <ellipse class="amb-shadow" cx="0" cy="3" rx="34" ry="7"/>
      <path class="amb-m-tail" d="M18,-6 C40,-4 50,-20 44,-34 C40,-22 30,-16 16,-16 Z"/>
      <path class="amb-m-body" d="M-24,0 C-32,-30 -26,-62 -8,-76 C4,-84 16,-80 24,-68 C34,-50 34,-20 26,0 Z"/>
      <path class="amb-m-belly" d="M-12,-4 C-18,-24 -14,-50 -2,-60 C8,-52 14,-26 10,-4 Z"/>
      <g class="amb-m-head">
        <circle class="amb-m-body" cx="-14" cy="-92" r="6"/><circle class="amb-m-body" cx="12" cy="-94" r="6"/>
        <circle class="amb-m-dark" cx="-14" cy="-92" r="3"/><circle class="amb-m-dark" cx="12" cy="-94" r="3"/>
        <path class="amb-m-body" d="M-24,-74 C-28,-98 -12,-108 0,-108 C14,-108 26,-96 22,-74 C18,-62 -20,-60 -24,-74 Z"/>
        <ellipse class="amb-m-belly" cx="-2" cy="-74" rx="12" ry="8"/>
        <g class="amb-m-eyes"><circle class="amb-ink" cx="-11" cy="-88" r="3.2"/><circle class="amb-ink" cx="8" cy="-89" r="3.2"/>
          <circle class="amb-glint" cx="-10" cy="-89" r="1"/><circle class="amb-glint" cx="9" cy="-90" r="1"/></g>
        <ellipse class="amb-ink" cx="-2" cy="-79" rx="4" ry="3"/>
        <rect class="amb-tooth" x="-5" y="-72" width="6" height="5" rx="1"/>
      </g>
      <g class="amb-m-paws"><ellipse class="amb-m-dark" cx="-12" cy="-46" rx="7" ry="5"/><ellipse class="amb-m-dark" cx="8" cy="-46" rx="7" ry="5"/></g>
    </g>`;

  /** Chamois debout sur son rocher, tourné vers la droite, pied en 0,0 */
  const chamois = `
    <g class="amb-chamois">
      <g transform="translate(0 28)">
      <path class="amb-ch-body" d="M-46,-62 C-48,-82 -30,-92 0,-90 C22,-89 34,-86 40,-78 L52,-104 C56,-114 70,-116 74,-106 L76,-96 L62,-86 L50,-64 C44,-54 -40,-48 -46,-62 Z"/>
      <path class="amb-ch-dark" d="M-46,-62 C-48,-74 -42,-82 -32,-86 C-36,-74 -34,-62 -20,-54 C-34,-52 -44,-54 -46,-62 Z"/>

      <g class="amb-ch-head">
        <path class="amb-ch-body" d="M52,-104 C54,-118 66,-124 76,-118 L86,-104 C88,-98 82,-94 76,-96 L62,-92 Z"/>
        <path class="amb-ch-face" d="M60,-114 L82,-102 L80,-98 L60,-106 Z"/>
        <path class="amb-ch-horn" d="M64,-118 C62,-132 66,-142 74,-140 M72,-120 C72,-134 78,-142 84,-138"/>
        <path class="amb-ch-body" d="M58,-116 l-10,-8 l2,10 Z"/>
        <circle class="amb-ink" cx="72" cy="-110" r="2.2"/>
      </g>
      <path class="amb-ch-tail" d="M-46,-70 l-8,6"/>
      </g>
      <path class="amb-ch-leg" d="M-36,-28 L-38,0 M-24,-26 L-22,0 M30,-30 L29,0 M42,-34 L45,0"/>
    </g>`;

  /** Renard qui regarde depuis un buisson */
  const fox = `
    <g class="amb-fox">
      <g class="amb-fox-head">
        <path class="amb-fox-ear l" d="M-26,-40 L-30,-74 L-8,-50 Z"/><path class="amb-fox-ear r" d="M14,-50 L28,-76 L30,-42 Z"/>
        <path class="amb-fox-fur" d="M-30,-40 C-34,-64 -12,-68 2,-66 C22,-66 36,-58 32,-38 C28,-18 12,-6 0,0 C-12,-6 -28,-18 -30,-40 Z"/>
        <path class="amb-fox-white" d="M-30,-34 C-24,-22 -12,-10 0,0 C12,-10 26,-22 32,-34 C20,-26 10,-22 0,-12 C-10,-22 -20,-26 -30,-34 Z"/>
        <g class="amb-fox-eyes"><ellipse class="amb-ink" cx="-12" cy="-40" rx="3" ry="3.6"/><ellipse class="amb-ink" cx="14" cy="-40" rx="3" ry="3.6"/></g>
        <ellipse class="amb-ink" cx="0" cy="-6" rx="5" ry="4"/>
      </g>
    </g>`;

  /** Hibou sur sa branche, pied en 0,0 */
  const owl = `
    <g class="amb-owl">
      <path class="amb-owl-body" d="M-26,0 C-34,-30 -28,-62 0,-66 C28,-62 34,-30 26,0 Z"/>
      <path class="amb-owl-wing" d="M-26,-4 C-34,-24 -30,-44 -18,-52 C-22,-34 -18,-16 -10,-2 Z M26,-4 C34,-24 30,-44 18,-52 C22,-34 18,-16 10,-2 Z"/>
      <path class="amb-owl-chest" d="M-12,-6 C-16,-24 -12,-36 0,-40 C12,-36 16,-24 12,-6 Z"/>
      <g class="amb-owl-head">
        <path class="amb-owl-body" d="M-28,-58 L-30,-84 L-16,-72 C-6,-76 6,-76 16,-72 L30,-84 L28,-58 C26,-44 -26,-44 -28,-58 Z"/>
        <circle class="amb-owl-face" cx="-11" cy="-62" r="11"/><circle class="amb-owl-face" cx="11" cy="-62" r="11"/>
        <g class="amb-owl-eyes"><circle class="amb-owl-eye" cx="-11" cy="-62" r="6"/><circle class="amb-owl-eye" cx="11" cy="-62" r="6"/>
          <circle class="amb-ink" cx="-11" cy="-62" r="3"/><circle class="amb-ink" cx="11" cy="-62" r="3"/></g>
        <path class="amb-owl-beak" d="M-3,-56 L3,-56 L0,-48 Z"/>
      </g>
      <path class="amb-ink-line" d="M-8,0 v5 M8,0 v5"/>
    </g>`;

  /** Écureuil accroché au tronc (tête en haut), pied en 0,0 */
  const squirrel = `
    <g class="amb-squirrel">
      <path class="amb-sq-tail" d="M6,-6 C30,-6 40,-30 30,-52 C24,-66 8,-66 6,-54 C18,-50 20,-36 10,-26 C6,-20 2,-14 6,-6 Z"/>
      <path class="amb-sq-body" d="M-6,0 C-12,-16 -10,-34 0,-40 C10,-34 12,-16 6,0 Z"/>
      <path class="amb-sq-body" d="M-8,-38 C-10,-52 0,-58 6,-54 L10,-60 L10,-50 C14,-44 8,-36 -2,-36 Z"/>
      <circle class="amb-ink" cx="2" cy="-48" r="1.8"/>
    </g>`;

  /** Le feu de camp, centre du foyer en 0,0 */
  const fire = () => {
    const sparks = Array.from({ length: 14 }, (_, i) => `<circle class="amb-spark" cx="${(i % 5) * 10 - 20}" cy="-60" r="${1.6 + (i % 3) * 0.6}" style="--dl:-${(i * 0.37).toFixed(2)}s;--dx:${((i * 29) % 70) - 35}px;--dur:${(2 + (i % 4) * 0.4).toFixed(1)}s"/>`).join('');
    const smoke = Array.from({ length: 5 }, (_, i) => `<circle class="amb-smoke" cx="0" cy="-140" r="${18 + i * 3}" style="--dl:-${i * 1.8}s"/>`).join('');
    return `
      <g class="amb-fire">
        <ellipse class="amb-ground-light" cx="0" cy="0" rx="300" ry="80"/>
        <circle class="amb-glow" cx="0" cy="-50" r="300"/>
        <g class="amb-smokes">${smoke}</g>
        <g class="amb-flames">
          <path class="amb-flame f1" d="M-46,0 C-62,-40 -34,-66 -28,-104 C-12,-78 -6,-136 6,-170 C14,-122 32,-110 34,-142 C52,-92 64,-40 46,0 Z"/>
          <path class="amb-flame f2" d="M-32,0 C-42,-30 -18,-52 -14,-88 C-2,-62 4,-110 12,-126 C20,-92 36,-70 30,0 Z"/>
          <path class="amb-flame f3" d="M-17,0 C-22,-20 -8,-38 -4,-64 C6,-42 18,-30 16,0 Z"/>
          <path class="amb-flame f4" d="M-30,-60 C-36,-80 -26,-96 -22,-112 C-14,-96 -12,-80 -18,-62 Z"/>
          <path class="amb-flame f5" d="M28,-70 C24,-90 32,-104 36,-118 C42,-100 42,-84 36,-70 Z"/>
        </g>
        <g class="amb-sparks">${sparks}</g>
      </g>`;
  };

  // ---------- La scène complète ----------

  // ---------- La scène : le campement peint d'Apo + nos personnages et le feu animés ----------
  // Images : src/assets/scenes/camp-jour.webp / camp-nuit.webp (2000 × 1116). En attendant les animaux détourés
  // (même style que les images), les personnages sont nos dessins. Coordonnées = pixels de l'image.
  const PLACES = {
    day: {
      img: 'camp-jour', fire: [1135, 905], bear: [1392, 858, 0.95], marmot: [600, 992, 1.25], chamois: [688, 730, 0.85],
      fox: [270, 850, 1], owl: [1262, 438, 0.9], squirrel: [322, 600, 1.2], lantern: null,
      rays: [1660, 250], lake: [700, 690, 1280, 790], sky: null,
      photos: [
        { file: 'jour-chamois', x: 716, y: 744, h: 150, ratio: 135 / 171, cls: 'pic-chamois' },
        { file: 'jour-hibou', x: 1262, y: 452, h: 96, ratio: 79 / 111, cls: 'pic-owl' },
        { file: 'jour-renard', x: 318, y: 866, h: 96, ratio: 119 / 105, cls: 'pic-fox' },
        { file: 'jour-ecureuil', x: 880, y: 846, h: 62, ratio: 59 / 71, cls: 'pic-squirrel' },
        { file: 'nuit-marmotte', x: 760, y: 852, h: 72, ratio: 56 / 63, cls: 'pic-marmot', clip: 0 },
        { file: 'nuit-ours', x: 1400, y: 872, h: 330, ratio: 341 / 553, cls: 'pic-bear' } // en attendant l'ours de jour
      ]
    },
    night: {
      img: 'camp-nuit', fire: [1160, 905], bear: [1612, 852, 0.95], marmot: [470, 995, 1.25], chamois: [692, 690, 0.85],
      fox: [275, 790, 1], owl: [1262, 438, 0.9], squirrel: [322, 600, 1.2], lantern: [285, 905],
      rays: null, lake: [800, 680, 1250, 780], sky: [660, 10, 1220, 250],
      photos: [
        { file: 'nuit-chamois', x: 690, y: 674, h: 150, ratio: 137 / 164, cls: 'pic-chamois' },
        { file: 'nuit-hibou', x: 1262, y: 452, h: 96, ratio: 78 / 107, cls: 'pic-owl' },
        { file: 'nuit-ecureuil', x: 610, y: 868, h: 70, ratio: 86 / 76, cls: 'pic-squirrel' },
        { file: 'nuit-marmotte', x: 772, y: 832, h: 72, ratio: 56 / 63, cls: 'pic-marmot', clip: 0 },
        { file: 'nuit-ours', x: 1615, y: 866, h: 330, ratio: 341 / 553, cls: 'pic-bear' }
      ]
    }
  };

  /**
   * Animaux détourés d'Apo (images, même style que le fond) : chacun posé par son pied (x au milieu, y en bas),
   * à la hauteur voulue, dans les pixels de l'image du fond. `clip` = ligne sous laquelle l'animal est caché
   * (la marmotte se cache derrière le rondin).
   */
  function photoAnimals(list) {
    return list.map(({ file, x, y, h, ratio, cls, clip }) => {
      const w = h * ratio;
      const img = `<image class="amb-pic ${cls}" href="assets/scenes/${file}.webp" x="${f(x - w / 2)}" y="${f(y - h)}" width="${f(w)}" height="${f(h)}" preserveAspectRatio="none"/>`;
      return clip ? `<clipPath id="amb-clip-${cls}"><rect x="${f(x - w)}" y="${f(y - h * 1.6)}" width="${f(w * 2)}" height="${f(h * 1.6 + clip)}"/></clipPath><g clip-path="url(#amb-clip-${cls})">${img}</g>` : img;
    }).join('');
  }

  B.ambianceScene = (moment = 'day') => {
    const P = PLACES[moment === 'night' ? 'night' : 'day'];
    const rnd = seeded(1123);
    const at = ([x, y, k = 1], inner) => `<g transform="translate(${x} ${y}) scale(${k})">${inner}</g>`;
    const stars = P.sky ? Array.from({ length: 70 }, (_, i) => {
      const x = P.sky[0] + rnd() * (P.sky[2] - P.sky[0]), y = P.sky[1] + rnd() * (P.sky[3] - P.sky[1]);
      return `<circle class="amb-star tw" cx="${f(x)}" cy="${f(y)}" r="${f(1 + rnd() * 1.4)}" style="--dl:-${f(rnd() * 4)}s"/>`;
    }).join('') : '';
    const flies = moment === 'night' ? Array.from({ length: 22 }, () => `<circle class="amb-fly" cx="${f(200 + rnd() * 1650)}" cy="${f(640 + rnd() * 380)}" r="3.4" style="--d:${f(4 + rnd() * 5)}s;--dl:-${f(rnd() * 6)}s;--fx:${f(rnd() * 70 - 35)}px;--fy:${f(-rnd() * 50)}px"/>`).join('') : '';
    const ripples = Array.from({ length: 14 }, () => `<path class="amb-ripple" d="M${f(P.lake[0] + rnd() * (P.lake[2] - P.lake[0] - 60))},${f(P.lake[1] + rnd() * (P.lake[3] - P.lake[1]))} h${f(20 + rnd() * 50)}" style="--d:${f(5 + rnd() * 5)}s;--dl:-${f(rnd() * 6)}s"/>`).join('');
    const [rx, ry] = P.rays || [0, 0];
    const src = `assets/scenes/${P.img}`;

    return `<svg class="amb-svg photo" viewBox="0 0 2000 1116" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="amb-ray-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="amb-s-ray" stop-opacity=".5"/><stop offset="1" class="amb-s-ray" stop-opacity="0"/></linearGradient>
    <radialGradient id="amb-glow-g"><stop offset="0" class="amb-s-glow" stop-opacity=".6"/><stop offset=".35" class="amb-s-glow" stop-opacity=".22"/><stop offset="1" class="amb-s-glow" stop-opacity="0"/></radialGradient>
    <radialGradient id="amb-smoke-g"><stop offset="0" class="amb-s-smoke" stop-opacity=".5"/><stop offset="1" class="amb-s-smoke" stop-opacity="0"/></radialGradient>
    <radialGradient id="amb-mist-g"><stop offset="0" class="amb-s-mist" stop-opacity=".5"/><stop offset="1" class="amb-s-mist" stop-opacity="0"/></radialGradient>
    <radialGradient id="amb-fly-g"><stop offset="0" class="amb-s-fly"/><stop offset="1" class="amb-s-fly" stop-opacity="0"/></radialGradient>
    <linearGradient id="amb-flame1-g" x1="0" y1="1" x2="0" y2="0"><stop offset="0" class="amb-s-fire2"/><stop offset="1" class="amb-s-fire1"/></linearGradient>
    <linearGradient id="amb-flame2-g" x1="0" y1="1" x2="0" y2="0"><stop offset="0" class="amb-s-fire3"/><stop offset="1" class="amb-s-fire2"/></linearGradient>
    <linearGradient id="amb-rim-g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" class="amb-s-glow" stop-opacity=".75"/><stop offset="1" class="amb-s-glow" stop-opacity="0"/></linearGradient>
  </defs>
  <image class="amb-photo" href="${src}.webp" x="0" y="0" width="2000" height="1116" preserveAspectRatio="none"/>

  ${stars}
  ${P.rays ? `<g class="amb-rays">
    <path class="amb-ray" d="M${rx},${ry} L${rx - 520},880 L${rx - 400},880 Z" style="--dl:0s"/>
    <path class="amb-ray" d="M${rx},${ry} L${rx - 300},900 L${rx - 220},900 Z" style="--dl:-3s"/>
    <path class="amb-ray" d="M${rx},${ry} L${rx - 120},860 L${rx - 40},860 Z" style="--dl:-6s"/>
  </g>
  <g class="amb-mists"><ellipse class="amb-mist" cx="900" cy="680" rx="380" ry="34" style="--d:70s;--dl:-10s"/><ellipse class="amb-mist" cx="1300" cy="700" rx="320" ry="28" style="--d:90s;--dl:-40s"/></g>` : ''}
  <g class="amb-ripples">${ripples}</g>
  ${P.lantern ? `<circle class="amb-lantern-glow on" cx="${P.lantern[0]}" cy="${P.lantern[1] - 30}" r="110"/>` : ''}

  ${P.photos ? photoAnimals(P.photos) : `${at(P.chamois, chamois)}
  ${at(P.fox, `<circle class="amb-bush" cx="-50" cy="-18" r="44"/><circle class="amb-bush" cx="34" cy="-24" r="48"/><g transform="translate(0 -22)">${fox}</g><circle class="amb-bush-light" cx="-58" cy="-4" r="32"/><circle class="amb-bush-light" cx="46" cy="-6" r="34"/>`)}
  ${at(P.squirrel, squirrel)}
  ${at(P.owl, `<path class="amb-trunk" d="M-60,4 L40,-6 L40,6 L-60,12 Z"/><g transform="translate(-14 4)">${owl}</g>`)}
  ${at(P.marmot, marmot)}
  ${at(P.bear, bear)}`}
  ${at([P.fire[0], P.fire[1], 0.95], fire())}
  <g class="amb-flies">${flies}</g>
</svg>`;
  };
})();
