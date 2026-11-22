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

  /** Grand sapin du premier plan : tronc qui monte hors du cadre, branches tombantes sur la partie haute */
  function bigTree(x, w, groundY, rnd, side) {
    const trunk = `M${f(x - w / 2)},-20 L${f(x - w * 0.62)},${f(groundY - 30)} C${f(x - w * 0.9)},${f(groundY - 6)} ${f(x - w * 1.3)},${f(groundY)} ${f(x - w * 1.5)},${f(groundY + 6)}
      L${f(x + w * 1.5)},${f(groundY + 6)} C${f(x + w * 1.3)},${f(groundY)} ${f(x + w * 0.9)},${f(groundY - 6)} ${f(x + w * 0.62)},${f(groundY - 30)} L${f(x + w / 2)},-20 Z`;
    // l'écorce : quelques fentes verticales
    let bark = '';
    for (let i = 0; i < 5; i++) {
      const bx = x - w * 0.35 + (w * 0.7 * i) / 4 + (rnd() - 0.5) * 4;
      const y0 = rnd() * 200, y1 = y0 + 120 + rnd() * 260;
      bark += `M${f(bx)},${f(y0)} C${f(bx + 3)},${f(y0 + (y1 - y0) / 3)} ${f(bx - 3)},${f(y0 + (2 * (y1 - y0)) / 3)} ${f(bx + 1)},${f(y1)} `;
    }
    // branches : de chaque côté, de plus en plus longues vers le bas
    let br = '', brLight = '';
    const nb = 9;
    for (let i = 0; i < nb; i++) {
      const by = -10 + i * 42 + rnd() * 14;
      for (const s of [-1, 1]) {
        if (rnd() < 0.18) continue;
        const L = (70 + i * 16 + rnd() * 40) * (s === side ? 1.25 : 0.8);
        const x0 = x + (s * w) / 2, tipX = x0 + s * L, tipY = by + 26 + rnd() * 16;
        let fringe = '';
        const k = 6;
        for (let j = k; j >= 0; j--) {
          const px = x0 + (s * L * j) / k, py = by + 8 + (tipY - by - 8) * (j / k) ** 1.3;
          fringe += ` L${f(px)},${f(py + 9 + rnd() * 7)} L${f(px - s * (L / k) * 0.5)},${f(py + 2)}`;
        }
        br += `M${f(x0)},${f(by)} C${f(x0 + s * L * 0.4)},${f(by - 14)} ${f(x0 + s * L * 0.8)},${f(by - 4)} ${f(tipX)},${f(tipY)}${fringe} Z `;
        brLight += `M${f(x0 + s * 6)},${f(by - 2)} C${f(x0 + s * L * 0.4)},${f(by - 15)} ${f(x0 + s * L * 0.8)},${f(by - 5)} ${f(tipX)},${f(tipY)} C${f(x0 + s * L * 0.7)},${f(by + 2)} ${f(x0 + s * L * 0.35)},${f(by - 3)} ${f(x0 + s * 6)},${f(by + 5)} Z `;
      }
    }
    return `<g class="amb-bigtree">
      <path class="amb-trunk" d="${trunk}"/>
      <path class="amb-trunk-shade" d="M${f(x + w * 0.1)},-20 L${f(x + w / 2)},-20 L${f(x + w * 0.62)},${f(groundY - 30)} C${f(x + w * 0.9)},${f(groundY - 6)} ${f(x + w * 1.3)},${f(groundY)} ${f(x + w * 1.5)},${f(groundY + 6)} L${f(x + w * 0.3)},${f(groundY + 6)} Z"/>
      <path class="amb-bark" d="${bark}"/>
      <g class="amb-sway slow" style="--d:${f(8 + rnd() * 4)}s;--dl:-${f(rnd() * 6)}s"><path class="amb-pine" d="${br}"/><path class="amb-pine-light" d="${brLight}"/></g>
    </g>`;
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

  /** Tente canadienne (ouverture vers nous), pied du centre en 0,0 */
  const tent = (w = 130) => `
    <g class="amb-tent">
      <ellipse class="amb-shadow" cx="20" cy="4" rx="${w * 1.2}" ry="12"/>
      <path class="amb-tent-side" d="M0,${-w * 1.15} L${w * 0.5},${-w * 1.32} L${w * 1.65},${-w * 0.1} L${w},0 Z"/>
      <path class="amb-tent-front" d="M${-w},0 L0,${-w * 1.15} L${w},0 Z"/>
      <path class="amb-tent-seam" d="M0,${-w * 1.15} L0,${-w * 0.25} M${-w * 0.5},${-w * 0.56} L${-w * 0.4},${-w * 0.52}"/>
      <path class="amb-tent-in" d="M0,${-w * 0.95} C${-w * 0.18},${-w * 0.6} ${-w * 0.36},${-w * 0.3} ${-w * 0.42},0 L${w * 0.42},0 C${w * 0.36},${-w * 0.3} ${w * 0.18},${-w * 0.6} 0,${-w * 0.95} Z"/>
      <path class="amb-tent-glow" d="M0,${-w * 0.95} C${-w * 0.18},${-w * 0.6} ${-w * 0.36},${-w * 0.3} ${-w * 0.42},0 L${w * 0.42},0 C${w * 0.36},${-w * 0.3} ${w * 0.18},${-w * 0.6} 0,${-w * 0.95} Z"/>
      <path class="amb-tent-flap" d="M0,${-w * 0.95} C${w * 0.1},${-w * 0.6} ${w * 0.3},${-w * 0.3} ${w * 0.5},${-w * 0.02} L${w * 0.62},0 C${w * 0.44},${-w * 0.4} ${w * 0.22},${-w * 0.72} 0,${-w * 0.95} Z"/>
      <path class="amb-rope" d="M0,${-w * 1.15} L${-w * 1.4},${-6} M${w * 0.5},${-w * 1.32} L${w * 2},${-w * 0.05}"/>
    </g>`;

  /** Lanterne posée au sol, pied en 0,0 */
  const lantern = `
    <g class="amb-lantern">
      <circle class="amb-lantern-glow" cx="0" cy="-30" r="70"/>
      <rect class="amb-metal" x="-15" y="-6" width="30" height="6" rx="2"/>
      <rect class="amb-glass" x="-11" y="-46" width="22" height="40" rx="5"/>
      <path class="amb-flame-small" d="M0,-16 C-5,-22 -3,-30 0,-34 C3,-30 5,-22 0,-16 Z"/>
      <path class="amb-metal-line" d="M-12,-46 v40 M12,-46 v40 M0,-46 v40"/>
      <path class="amb-metal" d="M-14,-46 L14,-46 L8,-56 L-8,-56 Z"/>
      <path class="amb-metal-line" d="M-10,-58 C-10,-74 10,-74 10,-58"/>
    </g>`;

  /** Rondin couché (vu un peu de côté) de x0 à x1, axe à la hauteur y */
  const log = (x0, x1, y, r = 22) => `
    <g class="amb-log">
      <ellipse class="amb-shadow" cx="${(x0 + x1) / 2}" cy="${y + r}" rx="${(x1 - x0) / 2 + 20}" ry="9"/>
      <rect class="amb-log-bark" x="${x0}" y="${y - r}" width="${x1 - x0}" height="${2 * r}" rx="6"/>
      <rect class="amb-log-shade" x="${x0}" y="${y + r * 0.2}" width="${x1 - x0}" height="${r * 0.8}" rx="5"/>
      <path class="amb-log-line" d="M${x0 + 20},${y - r * 0.4} h${(x1 - x0) * 0.4} M${x0 + (x1 - x0) * 0.5},${y + r * 0.1} h${(x1 - x0) * 0.35}"/>
      <ellipse class="amb-log-end" cx="${x0}" cy="${y}" rx="${r * 0.55}" ry="${r}"/>
      <ellipse class="amb-log-ring" cx="${x0}" cy="${y}" rx="${r * 0.3}" ry="${r * 0.55}"/>
    </g>`;

  /** Le feu de camp, centre du foyer en 0,0 */
  const fire = () => {
    const stones = [[-62, -2, 20], [-40, 10, 18], [-12, 16, 19], [18, 15, 18], [46, 9, 19], [64, -4, 17], [-50, -16, 14], [52, -18, 14]]
      .map(([x, y, r]) => `<ellipse class="amb-stone" cx="${x}" cy="${y}" rx="${r}" ry="${r * 0.62}"/><ellipse class="amb-stone-light" cx="${x - r * 0.25}" cy="${y - r * 0.25}" rx="${r * 0.45}" ry="${r * 0.22}"/>`).join('');
    const sparks = Array.from({ length: 14 }, (_, i) => `<circle class="amb-spark" cx="${(i % 5) * 10 - 20}" cy="-60" r="${1.6 + (i % 3) * 0.6}" style="--dl:-${(i * 0.37).toFixed(2)}s;--dx:${((i * 29) % 70) - 35}px;--dur:${(2 + (i % 4) * 0.4).toFixed(1)}s"/>`).join('');
    const smoke = Array.from({ length: 5 }, (_, i) => `<circle class="amb-smoke" cx="0" cy="-140" r="${18 + i * 3}" style="--dl:-${i * 1.8}s"/>`).join('');
    return `
      <g class="amb-fire">
        <ellipse class="amb-ground-light" cx="0" cy="0" rx="300" ry="80"/>
        <circle class="amb-glow" cx="0" cy="-50" r="300"/>
        <g class="amb-smokes">${smoke}</g>
        <ellipse class="amb-embers" cx="0" cy="0" rx="46" ry="12"/>
        <rect class="amb-wood" x="-50" y="-12" width="100" height="14" rx="6" transform="rotate(-16)"/>
        <rect class="amb-wood" x="-50" y="-12" width="100" height="14" rx="6" transform="rotate(14)"/>
        <rect class="amb-wood-end" x="44" y="-20" width="10" height="14" rx="4" transform="rotate(14)"/>
        <g class="amb-flames">
          <path class="amb-flame f1" d="M-46,0 C-62,-40 -34,-66 -28,-104 C-12,-78 -6,-136 6,-170 C14,-122 32,-110 34,-142 C52,-92 64,-40 46,0 Z"/>
          <path class="amb-flame f2" d="M-32,0 C-42,-30 -18,-52 -14,-88 C-2,-62 4,-110 12,-126 C20,-92 36,-70 30,0 Z"/>
          <path class="amb-flame f3" d="M-17,0 C-22,-20 -8,-38 -4,-64 C6,-42 18,-30 16,0 Z"/>
          <path class="amb-flame f4" d="M-30,-60 C-36,-80 -26,-96 -22,-112 C-14,-96 -12,-80 -18,-62 Z"/>
          <path class="amb-flame f5" d="M28,-70 C24,-90 32,-104 36,-118 C42,-100 42,-84 36,-70 Z"/>
        </g>
        ${stones}
        <g class="amb-sparks">${sparks}</g>
      </g>`;
  };

  // ---------- La scène complète ----------

  B.ambianceScene = () => {
    const rnd = seeded(1123);
    // étoiles (nuit) : beaucoup, quelques-unes qui scintillent
    const stars = Array.from({ length: 150 }, (_, i) => {
      const x = rnd() * 1600, y = rnd() * 470, r = rnd() < 0.12 ? 1.9 : 0.7 + rnd() * 0.9;
      return `<circle class="amb-star${i % 5 === 0 ? ' tw' : ''}" cx="${f(x)}" cy="${f(y)}" r="${f(r)}" style="--dl:-${f(rnd() * 4)}s"/>`;
    }).join('');
    // forêt du fond (deux rangées, la plus lointaine plus claire)
    let far1 = '', far2 = '';
    for (let x = -20; x < 1640; x += 16 + rnd() * 18) far1 += pine(x, 540 + rnd() * 8, 50 + rnd() * 50, rnd, 'far');
    for (let x = -10; x < 1640; x += 22 + rnd() * 22) far2 += pine(x, 566 + rnd() * 6, 70 + rnd() * 70, rnd, 'far');
    // sapins moyens sur les rives
    let mid = '';
    for (const [x, h] of [[90, 260], [170, 210], [460, 180], [520, 230], [1120, 200], [1180, 250], [1330, 190], [1500, 240]]) mid += pine(x, 640 + rnd() * 10, h, rnd);
    // touffes d'herbe et fougères du premier plan
    const tufts = [];
    for (let i = 0, x = 20; x < 1600; i++, x += 46 + rnd() * 60) {
      const y = 810 + rnd() * 80;
      if (x > 900 && x < 1420 && y < 870) continue; // place libre autour du feu
      const s = 0.8 + rnd() * 0.7;
      tufts.push(`<g class="amb-sway" style="--d:${f(4 + rnd() * 3)}s;--dl:-${f(rnd() * 5)}s" transform="translate(${f(x)} ${f(y)}) scale(${f(s)})">
        <path class="amb-grass" d="M0,0 Q-8,-16 -16,-24 M0,0 Q-2,-20 -4,-34 M0,0 Q3,-18 9,-30 M0,0 Q8,-12 18,-18 M0,0 Q-5,-9 -20,-11"/></g>`);
    }
    const pebbles = Array.from({ length: 26 }, () => {
      const x = rnd() * 1600, y = 720 + rnd() * 170, r = 3 + rnd() * 8;
      return `<ellipse class="amb-pebble" cx="${f(x)}" cy="${f(y)}" rx="${f(r)}" ry="${f(r * 0.55)}"/>`;
    }).join('');
    const flies = Array.from({ length: 18 }, (_, i) => `<circle class="amb-fly" cx="${f(120 + rnd() * 1360)}" cy="${f(560 + rnd() * 300)}" r="2.6" style="--d:${f(4 + rnd() * 5)}s;--dl:-${f(rnd() * 6)}s;--fx:${f(rnd() * 60 - 30)}px;--fy:${f(-rnd() * 40)}px"/>`).join('');
    const ripples = Array.from({ length: 16 }, () => `<path class="amb-ripple" d="M${f(240 + rnd() * 1100)},${f(575 + rnd() * 60)} h${f(20 + rnd() * 50)}" style="--d:${f(5 + rnd() * 5)}s;--dl:-${f(rnd() * 6)}s"/>`).join('');

    const mountain = `
      <path class="amb-mtn" d="M520,570 L610,470 L650,430 L700,360 L745,300 L775,250 L800,196 L826,240 L862,280 L900,330 L955,400 L1010,470 L1090,570 Z"/>
      <path class="amb-mtn-shade" d="M800,196 L826,240 L862,280 L900,330 L955,400 L1010,470 L1090,570 L880,570 L850,470 L830,360 L812,260 Z"/>
      <path class="amb-snow" d="M800,196 L775,250 L752,290 L764,288 L770,306 L784,292 L792,322 L806,300 L818,330 L830,300 L846,322 L858,296 L874,312 L862,280 L826,240 Z"/>
      <path class="amb-snow-shade" d="M800,196 L826,240 L862,280 L874,312 L858,296 L846,322 L830,300 L818,330 L812,260 Z"/>
      <path class="amb-snow-line" d="M760,330 L742,380 M790,350 L780,410 M840,350 L850,420 M880,340 L905,390 M720,380 L700,420"/>`;

    return `<svg class="amb-svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="amb-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="amb-s-sky1"/><stop offset=".55" class="amb-s-sky2"/><stop offset="1" class="amb-s-sky3"/></linearGradient>
    <radialGradient id="amb-sun-g"><stop offset="0" class="amb-s-sun" stop-opacity=".95"/><stop offset=".25" class="amb-s-sun" stop-opacity=".45"/><stop offset="1" class="amb-s-sun" stop-opacity="0"/></radialGradient>
    <linearGradient id="amb-ray-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="amb-s-ray" stop-opacity=".55"/><stop offset="1" class="amb-s-ray" stop-opacity="0"/></linearGradient>
    <linearGradient id="amb-mtn-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="amb-s-mtn1"/><stop offset="1" class="amb-s-mtn2"/></linearGradient>
    <linearGradient id="amb-far-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="amb-s-far1"/><stop offset="1" class="amb-s-far2"/></linearGradient>
    <linearGradient id="amb-lake-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="amb-s-lake1"/><stop offset="1" class="amb-s-lake2"/></linearGradient>
    <linearGradient id="amb-ground-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="amb-s-ground1"/><stop offset="1" class="amb-s-ground2"/></linearGradient>
    <radialGradient id="amb-glow-g"><stop offset="0" class="amb-s-glow" stop-opacity=".6"/><stop offset=".35" class="amb-s-glow" stop-opacity=".22"/><stop offset="1" class="amb-s-glow" stop-opacity="0"/></radialGradient>
    <radialGradient id="amb-moon-g"><stop offset="0" class="amb-s-moon" stop-opacity=".5"/><stop offset="1" class="amb-s-moon" stop-opacity="0"/></radialGradient>
    <radialGradient id="amb-smoke-g"><stop offset="0" class="amb-s-smoke" stop-opacity=".5"/><stop offset="1" class="amb-s-smoke" stop-opacity="0"/></radialGradient>
    <radialGradient id="amb-mist-g"><stop offset="0" class="amb-s-mist" stop-opacity=".55"/><stop offset="1" class="amb-s-mist" stop-opacity="0"/></radialGradient>
    <radialGradient id="amb-fly-g"><stop offset="0" class="amb-s-fly"/><stop offset="1" class="amb-s-fly" stop-opacity="0"/></radialGradient>
    <linearGradient id="amb-flame1-g" x1="0" y1="1" x2="0" y2="0"><stop offset="0" class="amb-s-fire2"/><stop offset="1" class="amb-s-fire1"/></linearGradient>
    <linearGradient id="amb-flame2-g" x1="0" y1="1" x2="0" y2="0"><stop offset="0" class="amb-s-fire3"/><stop offset="1" class="amb-s-fire2"/></linearGradient>
    <linearGradient id="amb-rim-g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" class="amb-s-glow" stop-opacity=".75"/><stop offset="1" class="amb-s-glow" stop-opacity="0"/></linearGradient>
    <filter id="amb-blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="22"/></filter>
    <radialGradient id="amb-clear-g"><stop offset="0" class="amb-s-clearing" stop-opacity=".75"/><stop offset=".7" class="amb-s-clearing" stop-opacity=".3"/><stop offset="1" class="amb-s-clearing" stop-opacity="0"/></radialGradient>
    <clipPath id="amb-lake-clip"><rect x="0" y="560" width="1600" height="110"/></clipPath>
  </defs>

  <!-- Ciel -->
  <rect class="amb-sky" width="1600" height="900"/>
  <g class="amb-night-only">
    <g filter="url(#amb-blur)"><ellipse class="amb-milky" cx="820" cy="170" rx="560" ry="80" transform="rotate(-24 820 170)"/>
    <ellipse class="amb-milky core" cx="820" cy="170" rx="360" ry="30" transform="rotate(-24 820 170)"/></g>
    ${stars}
    <path class="amb-shooting" d="M560,60 l-150,60"/>
    <circle class="amb-moon-halo" cx="1300" cy="140" r="120"/>
    <circle class="amb-moon" cx="1300" cy="140" r="34"/>
    <circle class="amb-crater" cx="1290" cy="132" r="7"/><circle class="amb-crater" cx="1312" cy="152" r="5"/><circle class="amb-crater" cx="1304" cy="124" r="3"/>
  </g>
  <g class="amb-day-only">
    <circle class="amb-sun-halo" cx="1380" cy="250" r="300"/>
    <circle class="amb-sun" cx="1380" cy="250" r="42"/>
    <g class="amb-birds">
      <path class="amb-bird" d="M0,0 q8,-8 16,0 q8,-8 16,0"/>
      <path class="amb-bird" d="M30,14 q6,-6 12,0 q6,-6 12,0"/>
      <path class="amb-bird" d="M-22,18 q6,-6 12,0 q6,-6 12,0"/>
    </g>
  </g>

  <!-- Montagnes et forêt du fond -->
  <path class="amb-far" d="M0,560 L0,470 L90,430 L170,452 L260,392 L340,428 L430,380 L520,430 L600,452 L1040,452 L1120,400 L1200,430 L1290,372 L1380,418 L1470,388 L1600,430 L1600,560 Z"/>
  <path class="amb-far-snow" d="M260,392 L280,404 L270,402 L262,410 L250,400 Z M430,380 L452,394 L440,392 L432,400 L418,390 Z M1290,372 L1312,388 L1298,384 L1290,394 L1276,384 Z"/>
  ${mountain}
  <g class="amb-forest-1">${far1}</g>
  <g class="amb-forest-2">${far2}</g>

  <!-- Le lac, avec le reflet du sommet -->
  <rect class="amb-lake" x="0" y="560" width="1600" height="110"/>
  <g class="amb-reflect" clip-path="url(#amb-lake-clip)"><g transform="translate(0 1136) scale(1 -1)">${mountain}</g></g>
  <g class="amb-ripples">${ripples}</g>
  <g class="amb-mists">
    <ellipse class="amb-mist" cx="500" cy="572" rx="320" ry="26" style="--d:70s;--dl:-10s"/>
    <ellipse class="amb-mist" cx="1100" cy="590" rx="380" ry="30" style="--d:90s;--dl:-40s"/>
  </g>

  <!-- Rives, sapins moyens, clairière -->
  <path class="amb-shore" d="M0,640 C120,624 260,632 380,640 C520,650 640,628 760,636 C900,646 1040,630 1180,640 C1320,650 1460,632 1600,640 L1600,660 L0,660 Z"/>
  <g class="amb-mid-pines">${mid}</g>
  <path class="amb-ground" d="M0,668 C200,650 420,660 600,676 C780,690 1000,664 1200,672 C1380,680 1500,664 1600,670 L1600,900 L0,900 Z"/>
  <ellipse class="amb-clearing" cx="1060" cy="810" rx="420" ry="80"/>
  <path class="amb-path" d="M720,900 C760,840 860,800 960,790 C1010,786 1040,790 1060,796 C980,800 860,830 820,900 Z"/>
  ${pebbles}

  <!-- Rayons de soleil (jour), entre les arbres -->
  <g class="amb-day-only amb-rays">
    <path class="amb-ray" d="M1380,250 L1060,820 L1160,820 Z" style="--dl:0s"/>
    <path class="amb-ray" d="M1380,250 L1200,860 L1260,860 Z" style="--dl:-2s"/>
    <path class="amb-ray" d="M1380,250 L1300,820 L1390,820 Z" style="--dl:-4s"/>
    <path class="amb-ray" d="M1380,250 L960,700 L1010,720 Z" style="--dl:-6s"/>
  </g>

  <!-- Le chamois sur son rocher, le renard dans son buisson -->
  <g transform="translate(640 646)">
    <path class="amb-rock" d="M-80,40 C-90,10 -70,-14 -30,-18 C10,-24 60,-14 76,8 C90,24 84,40 70,46 Z"/>
    <path class="amb-rock-shade" d="M20,-20 C56,-14 80,4 82,26 C84,38 78,44 70,46 L10,46 C40,20 40,-4 20,-20 Z"/>
    <g transform="translate(-6 -16)">${chamois}</g>
  </g>
  <g transform="translate(340 716) scale(.85)">
    <circle class="amb-bush" cx="-50" cy="-20" r="44"/><circle class="amb-bush" cx="30" cy="-26" r="50"/><circle class="amb-bush" cx="-6" cy="-50" r="44"/>
    <g transform="translate(0 -22)">${fox}</g>
    <circle class="amb-bush-light" cx="-60" cy="-6" r="34"/><circle class="amb-bush-light" cx="44" cy="-8" r="36"/>
  </g>

  <!-- Grands sapins qui encadrent la scène -->
  ${bigTree(70, 50, 760, rnd, 1)}${bigTree(250, 36, 720, rnd, 1)}
  ${bigTree(1270, 40, 720, rnd, -1)}${bigTree(1470, 60, 770, rnd, -1)}
  <g transform="translate(1252 430)">${squirrel}</g>
  <g transform="translate(1420 300)"><path class="amb-trunk" d="M-80,6 L50,-6 L50,6 L-80,14 Z"/><g transform="translate(-20 4)">${owl}</g></g>

  <!-- La tente, la lanterne, la marmotte -->
  <g transform="translate(500 800)">${tent(118)}</g>
  <g transform="translate(680 814)">${lantern}</g>
  <g transform="translate(300 872)">${marmot}</g>

  <!-- Le campement : feu, rondins, ours (déplacé vers le centre sur téléphone) -->
  <g class="amb-camp">
    <g transform="translate(1330 742) scale(.55)">${tent(128)}</g>
    ${log(860, 1000, 806, 20)}
    ${log(1130, 1350, 826, 24)}
    <g transform="translate(1240 812)">${bear}</g>
    <g transform="translate(1070 800)">${fire()}</g>
  </g>

  <!-- Premier plan -->
  <path class="amb-fore" d="M0,900 L0,840 C40,820 90,830 130,850 C170,868 200,890 230,900 Z"/>
  <path class="amb-fore" d="M1600,900 L1600,830 C1560,814 1510,826 1480,846 C1450,866 1430,886 1420,900 Z"/>
  <g class="amb-tufts">${tufts.join('')}</g>
  <g class="amb-night-only">${flies}</g>
</svg>`;
  };
})();
