// =====================================================================
// Ambiance d'Aujourd'hui (22/11, demande d'Apo) : un vrai fond de page animé, en boucle de 5 minutes.
//   Montagnes au fond, soleil qui se couche puis revient (étoiles et lucioles à la nuit tombée), aigle qui tourne,
//   oiseaux qui passent, petits chamois qui traversent les crêtes en sautant, bouquetin sur un rocher, renard qui
//   passe au premier plan, sapins et herbes qui bougent dans le vent ; en bas, un feu de camp (flammes, braises,
//   fumée) entouré de rondins, avec la mascotte : une petite marmotte qui respire, cligne des yeux, se lève pour
//   regarder autour d'elle et se réchauffe les pattes.
//   Son (facultatif, bouton en bas à droite) : crépitement du feu et vent léger dans les feuilles, FABRIQUÉS ici par
//   Web Audio (comme sounds.js) : aucun fichier, aucun extrait de vidéo (droits d'auteur), rien à télécharger.
// Règles : purement décoratif (aria-hidden, aucun clic sauf le bouton du son) ; couleurs = jetons --amb-* / --land-*
//   (classes .amb-* de styles.css) ; « Animations » coupé (.no-anim) ou « réduire les animations » : image fixe ;
//   le son se tait en statut Occupé, pendant un vocal, quand l'onglet est caché et hors de la page Aujourd'hui.
// =====================================================================
(() => {
  const LOOP = '300s'; // la boucle de 5 minutes (toutes les apparitions sont calées dessus)

  // ---------- Petits dessins réutilisés ----------

  /** Chamois (pieds en 0,0, tourné vers la droite) */
  const chamois = `
    <g class="amb-hop">
      <path class="amb-ink" d="M-11,-14 C-11,-20 -4,-21 3,-20 C7,-20 9,-19 10,-17 L13,-24 C14,-27 18,-28 19,-26 L20,-23 L15,-20 L11,-12 C9,-9 -8,-8 -10,-11 Z"/>
      <path class="amb-horn" d="M15,-27 C14,-32 17,-34 19,-31"/>
      <path class="amb-leg" d="M-8,-10 L-9,0 M-5,-10 L-4,0 M5,-10 L4,0 M8,-11 L9,0"/>
    </g>`;
  /** Bouquetin, plus grand, cornes en arc (silhouette posée sur un rocher) */
  const ibex = `
    <path class="amb-ink" d="M-16,-20 C-16,-28 -6,-30 4,-29 C9,-29 12,-27 13,-25 L17,-35 C18,-38 23,-39 24,-36 L25,-32 L19,-28 L15,-17 C12,-12 -11,-11 -14,-15 Z"/>
    <g class="amb-ibex-head"><path class="amb-horn wide" d="M19,-38 C14,-50 4,-50 2,-42"/></g>
    <path class="amb-leg" d="M-12,-14 L-13,0 M-8,-14 L-7,0 M7,-14 L6,0 M11,-15 L12,0"/>`;
  /** Renard (ombre), pieds en 0,0, tourné vers la droite */
  const fox = `
    <g class="amb-trot">
      <path class="amb-ink" d="M-16,-12 C-14,-19 4,-20 14,-17 L22,-22 L23,-17 L31,-13 L20,-9 C12,-6 -10,-5 -15,-8 Z"/>
      <path class="amb-ink" d="M-16,-12 C-30,-15 -40,-8 -33,-3 C-28,-7 -22,-8 -16,-9 Z"/>
      <path class="amb-leg" d="M-10,-8 L-12,0 M-5,-8 L-4,0 M8,-9 L7,0 M12,-9 L14,0"/>
    </g>`;
  /** Touffe d'herbe qui bouge (x, y = pied ; s = taille) */
  const tuft = (x, y, s, i) => `<g class="amb-sway" style="--d:${(4 + (i % 5) * 0.7).toFixed(1)}s;--dl:-${(i * 0.9) % 5}s" transform="translate(${x} ${y}) scale(${s})">
      <path class="amb-grass" d="M0,0 Q-6,-14 -12,-22 M0,0 Q-1,-18 -3,-30 M0,0 Q3,-16 8,-26 M0,0 Q6,-10 14,-16 M0,0 Q-4,-8 -16,-10"/></g>`;
  /** Sapin qui oscille un peu */
  const pine = (x, y, s, i) => `<g class="amb-sway slow" style="--d:${(7 + (i % 4)).toFixed(1)}s;--dl:-${i * 1.3}s" transform="translate(${x} ${y}) scale(${s})">
      <path class="amb-pine" d="M0,-62 L13,-34 L7,-34 L18,-12 L4,-12 L4,0 L-4,0 L-4,-12 L-18,-12 L-7,-34 L-13,-34 Z"/></g>`;

  /** Un mouvement le long d'un chemin, calé sur la boucle de 5 min (keyTimes / keyPoints de 0 à 1) */
  const move = (path, times, points, extra = '') => `<animateMotion dur="${LOOP}" repeatCount="indefinite" calcMode="linear"
      path="${path}" keyTimes="${times}" keyPoints="${points}" ${extra}/>`;
  /** Apparaît / disparaît selon la boucle */
  const fade = (times, values) => `<animate attributeName="opacity" dur="${LOOP}" repeatCount="indefinite" keyTimes="${times}" values="${values}"/>`;

  // Chemins des animaux (coordonnées du dessin : 1600 × 900, bas calé sur le bas de l'écran)
  const RIDGE = 'M1420,596 C1340,566 1260,540 1200,542 C1090,528 1010,578 860,590 C720,600 620,548 470,571 C380,584 300,600 220,612';
  const ROCKS = 'M1060,600 Q1085,560 1110,585 Q1135,545 1160,568 Q1185,528 1210,552 Q1232,518 1252,540';
  const LOW = 'M260,640 C420,626 560,650 700,640 C820,632 940,648 1080,636';
  const FOXWAY = 'M-80,792 C300,778 600,800 900,786 C1200,774 1450,792 1700,780';

  const svg = () => {
    const tufts = [];
    for (let i = 0, x = 30; x < 1590; i++, x += 70 + ((i * 37) % 45)) {
      const y = 800 + Math.sin(x / 160) * 12 + ((i * 13) % 20);
      if (x > 960 && x < 1400 && y < 860) continue; // place libre autour du feu (ordinateur)
      tufts.push(tuft(x, y, 0.8 + ((i * 7) % 6) / 10, i));
    }
    const stars = Array.from({ length: 34 }, (_, i) => {
      const x = (i * 211) % 1600, y = 40 + ((i * 97) % 300);
      return `<circle class="amb-star ${i % 3 ? '' : 'tw'}" style="--dl:-${(i % 7) * 0.8}s" cx="${x}" cy="${y}" r="${i % 4 ? 1.4 : 2.2}"/>`;
    }).join('');
    const flies = Array.from({ length: 12 }, (_, i) => {
      const x = 120 + ((i * 137) % 1360), y = 660 + ((i * 53) % 160);
      return `<circle class="amb-fly" style="--d:${5 + (i % 4)}s;--dl:-${i * 0.7}s" cx="${x}" cy="${y}" r="2.4"/>`;
    }).join('');
    const sparks = Array.from({ length: 10 }, (_, i) =>
      `<circle class="amb-spark" style="--dl:-${(i * 0.37).toFixed(2)}s;--dx:${((i % 5) - 2) * 9}px" cx="${-10 + (i % 4) * 7}" cy="-40" r="${i % 3 ? 1.6 : 2.2}"/>`).join('');
    const smoke = [0, 1, 2, 3].map((i) => `<circle class="amb-smoke" style="--dl:-${i * 2}s" cx="${(i % 2) * 8 - 4}" cy="-80" r="11"/>`).join('');
    const stones = [[-46, 6], [-34, 14], [-14, 18], [10, 18], [30, 14], [44, 6], [-40, -2], [40, -2]]
      .map(([x, y]) => `<ellipse class="amb-stone" cx="${x}" cy="${y}" rx="11" ry="7"/>`).join('');

    return `<svg class="amb-svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="amb-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="amb-stop-bg"/><stop offset="1" class="amb-stop-sky"/></linearGradient>
    <linearGradient id="amb-dusk-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="amb-stop-clear"/><stop offset="1" class="amb-stop-dusk"/></linearGradient>
    <radialGradient id="amb-glow-g"><stop offset="0" class="amb-stop-fire"/><stop offset="1" class="amb-stop-fire0"/></radialGradient>
  </defs>
  <rect class="amb-sky" width="1600" height="900"/>
  <g class="amb-stars">${stars}</g>
  <g class="amb-sun"><circle class="amb-sun-halo" cx="980" cy="470" r="110"/><circle class="amb-sun-disc" cx="980" cy="470" r="52"/></g>
  <rect class="amb-dusk" width="1600" height="900"/>

  <!-- Montagnes du fond, neige -->
  <path class="amb-far" d="M0,560 L120,470 L220,520 L360,400 L480,500 L600,430 L720,520 L860,380 L980,480 L1100,420 L1220,500 L1340,410 L1460,490 L1600,440 V900 H0 Z"/>
  <path class="amb-snow" d="M330,425 L360,400 L392,428 L372,421 L360,433 L347,421 Z M832,403 L860,380 L890,404 L871,398 L860,410 L848,399 Z M1312,433 L1340,410 L1368,436 L1350,429 L1340,440 L1328,430 Z"/>
  <!-- Aigle qui tourne, oiseaux qui passent -->
  <g class="amb-bird-g"><path class="amb-eagle" d="M-20,0 Q-10,-7 0,0 Q10,-7 20,0 Q10,-2 0,3 Q-10,-2 -20,0 Z"/>
    <animateMotion dur="46s" repeatCount="indefinite" path="M300,170 a150,55 0 1 0 300,0 a150,55 0 1 0 -300,0"/></g>
  <g class="amb-flock" opacity="0">${[0, 1, 2, 3].map((i) => `<path class="amb-bird" style="--dl:-${i * 0.15}s" transform="translate(${i * 26} ${(i % 2) * 12})" d="M0,0 q6,-6 12,0 q6,-6 12,0"/>`).join('')}
    ${move('M-120,230 C300,180 900,250 1720,170', '0;0.12;0.21;0.62;0.72;1', '0;0;1;0;1;1')}
    ${fade('0;0.12;0.125;0.205;0.21;0.62;0.625;0.715;0.72;1', '0;0;1;1;0;0;1;1;0;0')}</g>

  <!-- Le grand sommet et le bouquetin sur son rocher -->
  <path class="amb-peak" d="M1080,640 L1250,300 L1300,360 L1340,330 L1520,640 Z"/>
  <path class="amb-snow" d="M1205,390 L1250,300 L1300,360 L1281,352 L1263,381 L1242,361 L1224,392 Z"/>
  <g class="amb-ibex" transform="translate(1190 421)">${ibex}</g>

  <!-- Collines vertes, chamois sur la crête -->
  <path class="amb-mid" d="M0,640 C200,560 330,600 470,570 C620,540 700,600 860,590 C1000,580 1080,520 1200,540 C1340,560 1450,600 1600,580 V900 H0 Z"/>
  ${[[1080, 590], [1135, 572], [1185, 556], [1232, 540]].map(([x, y]) => `<ellipse class="amb-rock" cx="${x + 22}" cy="${y + 6}" rx="18" ry="8"/>`).join('')}
  ${[0, 1, 2].map((i) => `<g class="amb-animal" opacity="0">
      <g transform="scale(-1 1)"><g style="--dl:-${i * 0.2}s">${chamois}</g></g>
      ${move(RIDGE, `0;${0.05 + i * 0.008};${0.27 + i * 0.008};1`, '0;0;1;1')}
      ${fade(`0;${0.05 + i * 0.008};${0.055 + i * 0.008};${0.265 + i * 0.008};${0.27 + i * 0.008};1`, '0;0;1;1;0;0')}</g>`).join('')}
  <g class="amb-animal" opacity="0"><g class="amb-big-hop">${chamois}</g>
    ${move(ROCKS, '0;0.45;0.58;1', '0;0;1;1')}
    ${fade('0;0.45;0.455;0.575;0.58;1', '0;0;1;1;0;0')}</g>
  ${[0, 1].map((i) => `<g class="amb-animal" opacity="0"><g transform="scale(-1 1)"><g style="--dl:-${i * 0.3}s">${chamois}</g></g>
      ${move(LOW, `0;${0.75 + i * 0.012};${0.92 + i * 0.012};1`, '1;1;0;0')}
      ${fade(`0;${0.75 + i * 0.012};${0.755 + i * 0.012};${0.915 + i * 0.012};${0.92 + i * 0.012};1`, '0;0;1;1;0;0')}</g>`).join('')}
  ${[[140, 640, 0.9], [176, 636, 0.7], [520, 600, 0.8], [556, 596, 0.65], [1440, 610, 0.9], [1476, 606, 0.7], [1512, 612, 0.85]].map(([x, y, s], i) => pine(x, y, s, i)).join('')}

  <!-- Premier plan : la prairie, le renard qui passe -->
  <path class="amb-hill" d="M0,760 C300,735 600,775 900,760 C1200,745 1400,770 1600,755 V900 H0 Z"/>
  <path class="amb-hill-2" d="M0,846 C400,826 800,856 1600,836 V900 H0 Z"/>
  <g class="amb-animal" opacity="0">${fox}
    ${move(FOXWAY, '0;0.33;0.44;1', '0;0;1;1')}
    ${fade('0;0.33;0.335;0.435;0.44;1', '0;0;1;1;0;0')}</g>
  ${[[90, 790], [1500, 786]].map(([x, y], i) => `<g class="amb-sway slow" style="--d:${9 + i}s;--dl:-${i * 2}s" transform="translate(${x} ${y})">
      <ellipse class="amb-bush" cx="0" cy="-16" rx="46" ry="24"/><ellipse class="amb-bush-2" cx="26" cy="-10" rx="30" ry="17"/><ellipse class="amb-bush-2" cx="-30" cy="-8" rx="24" ry="14"/></g>`).join('')}
  ${tufts.join('')}

  <!-- La nuit tombe (puis le jour revient) -->
  <rect class="amb-night" width="1600" height="900"/>
  <g class="amb-flies">${flies}</g>

  <!-- Le feu de camp, les rondins et la marmotte -->
  <g class="amb-camp">
    <ellipse class="amb-glow" cx="0" cy="-40" rx="250" ry="200"/>
    <ellipse class="amb-ground-light" cx="0" cy="8" rx="190" ry="30"/>
    <g transform="translate(-150 -2)"><rect class="amb-log" x="-62" y="-14" width="124" height="22" rx="11"/><ellipse class="amb-log-end" cx="62" cy="-3" rx="7" ry="11"/></g>
    <g transform="translate(160 6) rotate(-6)"><rect class="amb-log" x="-56" y="-14" width="112" height="22" rx="11"/><ellipse class="amb-log-end" cx="-56" cy="-3" rx="7" ry="11"/></g>
    ${stones}
    <path class="amb-wood" d="M-38,6 L30,-16 L36,-6 L-32,16 Z M38,6 L-30,-16 L-36,-6 L32,16 Z"/>
    <g class="amb-smokes">${smoke}</g>
    <g class="amb-fire">
      <path class="amb-flame f1" d="M0,0 C-34,-6 -38,-40 -14,-72 C-12,-52 -3,-48 0,-62 C6,-84 3,-104 12,-118 C17,-84 40,-62 33,-30 C30,-12 20,0 0,0 Z"/>
      <path class="amb-flame f2" d="M0,0 C-22,-4 -26,-28 -10,-52 C-8,-38 -2,-34 0,-44 C4,-60 2,-74 9,-84 C12,-60 28,-44 23,-22 C21,-9 14,0 0,0 Z"/>
      <path class="amb-flame f3" d="M0,0 C-11,-3 -13,-16 -4,-30 C-2,-22 2,-22 3,-30 C6,-40 13,-28 12,-14 C11,-5 7,0 0,0 Z"/>
    </g>
    <g class="amb-sparks">${sparks}</g>
    <g transform="translate(-168 -14) scale(1.35)"><g class="amb-marmot">
      <path class="amb-m-dark amb-tail" d="M-15,-3 C-29,-1 -33,-13 -25,-19 C-23,-11 -19,-8 -13,-8 Z"/>
      <path class="amb-m-body" d="M-18,0 C-22,-22 -14,-44 0,-46 C14,-44 20,-22 16,0 Z"/>
      <ellipse class="amb-m-belly" cx="3" cy="-18" rx="9" ry="14"/>
      <g class="amb-m-paws"><ellipse class="amb-m-body" cx="12" cy="-24" rx="4" ry="7"/><ellipse class="amb-m-body" cx="6" cy="-23" rx="4" ry="7"/></g>
      <g class="amb-m-head">
        <circle class="amb-m-dark" cx="-7" cy="-63" r="3.6"/><circle class="amb-m-dark" cx="10" cy="-64" r="3.4"/>
        <ellipse class="amb-m-body" cx="2" cy="-54" rx="13" ry="11"/>
        <ellipse class="amb-m-belly" cx="9" cy="-50" rx="7.5" ry="5.5"/>
        <rect class="amb-m-tooth" x="9.5" y="-46.5" width="3" height="3" rx="0.6"/>
        <ellipse class="amb-m-dark" cx="15.5" cy="-53" rx="2.4" ry="1.8"/>
        <g class="amb-m-eyes"><circle class="amb-m-dark" cx="3" cy="-57" r="2"/><circle class="amb-m-dark" cx="11" cy="-58" r="1.8"/></g>
      </g>
      <ellipse class="amb-m-dark" cx="-8" cy="0" rx="7" ry="3"/><ellipse class="amb-m-dark" cx="10" cy="0" rx="7" ry="3"/>
    </g></g>
  </g>
</svg>`;
  };

  // ---------- Le son : feu de camp et vent léger, fabriqués par Web Audio ----------

  const S = { ctx: null, master: null, sources: [], timers: [], on: false };
  const VOLUME = 0.35; // 100 % du réglage
  /** Réglage du volume (clic droit sur le bouton du son) : 0 à 1, retenu sur ce poste ; 1 = volume prévu */
  const level = () => Math.min(1, Math.max(0, Number(store.get('ambiance:volume', 1)) || 0));

  const noise = (ctx, seconds) => {
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  };
  const loop = (ctx, buf, ...chain) => {
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    chain.reduce((a, b) => (a.connect(b), b), src).connect(S.master);
    src.start(); S.sources.push(src);
    return src;
  };
  const filter = (ctx, type, freq, q = 0.7) => {
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; return f;
  };
  const gainNode = (ctx, v) => { const g = ctx.createGain(); g.gain.value = v; return g; };
  const later = (fn, ms) => S.timers.push(setTimeout(fn, ms));

  function startSound() {
    if (S.on) return;
    try { S.ctx ||= new AudioContext(); } catch { return; }
    const ctx = S.ctx;
    ctx.resume?.().catch(() => {});
    S.on = true;
    S.master = gainNode(ctx, 0);
    S.master.connect(ctx.destination);
    S.master.gain.setTargetAtTime(VOLUME * level(), ctx.currentTime, 1.2); // arrive doucement
    const buf = noise(ctx, 3);

    // Feu : un grondement grave qui respire
    const roar = gainNode(ctx, 0.32);
    loop(ctx, buf, filter(ctx, 'lowpass', 380), roar);
    const breathe = () => { if (!S.on) return; roar.gain.setTargetAtTime(0.2 + Math.random() * 0.25, ctx.currentTime, 0.25); later(breathe, 250 + Math.random() * 500); };
    breathe();

    // Vent léger : souffle large qui va et vient très lentement
    const wind = gainNode(ctx, 0.04);
    const windF = filter(ctx, 'bandpass', 480, 0.5);
    loop(ctx, buf, windF, wind);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.05;
    const lfoAmt = gainNode(ctx, 0.03); lfo.connect(lfoAmt).connect(wind.gain); lfo.start(); S.sources.push(lfo);
    // Feuilles : bruissement aigu, par bouffées
    const leaves = gainNode(ctx, 0);
    loop(ctx, buf, filter(ctx, 'highpass', 2600), filter(ctx, 'lowpass', 7000), leaves);
    const gust = () => {
      if (!S.on) return;
      const t = ctx.currentTime, up = 1.5 + Math.random() * 2.5;
      leaves.gain.setTargetAtTime(0.012 + Math.random() * 0.03, t, up / 3);
      leaves.gain.setTargetAtTime(0.002, t + up, 1.2);
      windF.frequency.setTargetAtTime(380 + Math.random() * 260, t, 2);
      later(gust, 4000 + Math.random() * 7000);
    };
    later(gust, 1500);

    // Crépitements : petits craquements, parfois en grappe, parfois un « pop » plus fort
    const crack = gainNode(ctx, 1); crack.connect(S.master);
    const burst = noise(ctx, 0.2);
    const one = (strong) => {
      const t = ctx.currentTime + 0.01;
      const src = ctx.createBufferSource(); src.buffer = burst;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = strong ? 1.2 : 2;
      f.frequency.value = strong ? 600 + Math.random() * 700 : 1400 + Math.random() * 4200;
      const g = ctx.createGain(); const peak = strong ? 0.7 : 0.08 + Math.random() * 0.35; const dur = strong ? 0.14 : 0.02 + Math.random() * 0.06;
      g.gain.setValueAtTime(peak, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      src.connect(f).connect(g).connect(crack);
      src.start(t, Math.random() * 0.1, dur + 0.02);
    };
    const crackle = () => {
      if (!S.on) return;
      const strong = Math.random() < 0.06;
      one(strong);
      if (Math.random() < 0.22) for (let i = 1; i <= 2 + Math.floor(Math.random() * 3); i++) later(() => S.on && one(false), i * (15 + Math.random() * 40));
      later(crackle, 40 + Math.random() * 280);
    };
    crackle();
  }

  function stopSound() {
    if (!S.on) return;
    S.on = false;
    S.timers.forEach(clearTimeout); S.timers = [];
    const ctx = S.ctx, master = S.master, sources = S.sources;
    S.sources = []; S.master = null;
    master.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
    setTimeout(() => { sources.forEach((s) => { try { s.stop(); } catch {} }); master.disconnect(); }, 900);
  }

  // ---------- Montage sur la page Aujourd'hui ----------

  const soundWanted = () => store.get('ambiance:sound', true) !== false;
  const soundAllowed = () => soundWanted() && !document.hidden && B.myStatus?.().state !== 'busy' && !B.voice;

  /**
   * Pose l'ambiance derrière la page (calque fixé sur la zone de la page, sous le contenu) et le bouton du son.
   * Tout est retiré quand on quitte la page (le contenu de la page est remplacé, B.onLeave coupe le son).
   */
  B.mountAmbiance = (view) => {
    const layer = document.createElement('div');
    layer.className = 'amb';
    layer.innerHTML = svg();
    view.prepend(layer);
    // Le bouton du son flotte AU-DESSUS du contenu (le calque, lui, est dessous)
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'amb-sound icon-btn';
    view.append(btn);
    view.classList.add('has-amb');
    const still = () => !B.animationsOn() || matchMedia('(prefers-reduced-motion: reduce)').matches;
    const svgEl = $('.amb-svg', layer);
    const syncMotion = () => (still() ? svgEl.pauseAnimations?.() : svgEl.unpauseAnimations?.());
    syncMotion();

    // Le calque suit exactement la zone de la page (#view), même quand la fenêtre change de taille
    const place = () => {
      const r = view.getBoundingClientRect();
      Object.assign(layer.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${view.clientWidth}px`, height: `${r.height}px` });
      Object.assign(btn.style, { left: `${r.left + view.clientWidth - 60}px`, top: `${r.bottom - 60}px` });
    };
    place();
    const ro = new ResizeObserver(place); ro.observe(view);
    addEventListener('resize', place);

    const paintBtn = () => {
      const on = soundWanted();
      btn.setAttribute('aria-pressed', String(on));
      const label = (on ? tr("Couper le son d'ambiance") : tr("Activer le son d'ambiance (feu de camp, vent)")) + ` · ${tr('clic droit : volume')}`;
      btn.title = label; btn.setAttribute('aria-label', label);
      btn.innerHTML = icon(on ? 'volume' : 'volumeoff', 18);
    };
    const sync = () => (soundAllowed() && !B.isPhone?.() ? startSound() : stopSound()); // pas de son sur téléphone
    btn.onclick = () => { store.set('ambiance:sound', !soundWanted()); paintBtn(); sync(); };
    // Clic droit : régler le volume (comme pour le vocal)
    btn.oncontextmenu = (e) => {
      e.preventDefault();
      const menu = B.popMenu(e.clientX, e.clientY, `
        <div class="pop-title">${icon('volume', 15)} ${tr("Son d'ambiance")}</div>
        <label class="pop-label" for="amb-vol">${tr('Volume')}</label>
        <div class="pop-range"><input id="amb-vol" type="range" min="0" max="100" step="5" value="${Math.round(level() * 100)}" /><span></span></div>
        <button class="pop-item" data-reset>${tr('Volume normal (100 %)')}</button>`);
      const range = $('input', menu);
      const show = () => { $('.pop-range span', menu).textContent = `${range.value} %`; };
      range.oninput = () => {
        const v = Number(range.value) / 100;
        store.set('ambiance:volume', v);
        if (v > 0 && !soundWanted()) { store.set('ambiance:sound', true); paintBtn(); sync(); }
        if (S.master) S.master.gain.setTargetAtTime(VOLUME * v, S.ctx.currentTime, 0.08);
        show();
      };
      $('[data-reset]', menu).onclick = () => { range.value = 100; range.oninput(); };
      show();
    };
    paintBtn();

    // Le navigateur n'autorise le son qu'après un geste : on (re)lance au premier clic ou touche si besoin
    const kick = () => { if (soundAllowed() && !B.isPhone?.()) { stopSound(); startSound(); } };
    const onGesture = () => { if (S.ctx?.state === 'running' && S.on) return; kick(); };
    addEventListener('pointerdown', onGesture, { capture: true });
    addEventListener('keydown', onGesture, { capture: true });
    document.addEventListener('visibilitychange', sync);
    const offs = [B.on('status', sync), B.on('voice', sync), B.on('animations', syncMotion)];
    sync();

    B.onLeave(() => {
      stopSound();
      ro.disconnect();
      removeEventListener('resize', place);
      removeEventListener('pointerdown', onGesture, { capture: true });
      removeEventListener('keydown', onGesture, { capture: true });
      document.removeEventListener('visibilitychange', sync);
      offs.forEach((off) => off?.());
      view.classList.remove('has-amb');
      layer.remove();
      btn.remove();
    });
  };
})();
