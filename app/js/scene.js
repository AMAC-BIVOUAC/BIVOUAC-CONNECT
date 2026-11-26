// =====================================================================
// La scène du bivouac (22/11, Apo) : fond peint + personnages détourés (animaux jusqu'au 24/11) + feu, de jour ou de nuit.
//   const scene = B.Scene(conteneur, { mode: 'jour' | 'nuit', animated: true, debug: false });
//   scene.setMode('nuit') (fondu de toute la scène) · scene.setAnimated(false) · scene.setDebug(true) · scene.destroy()
// Aucune bibliothèque : calques HTML placés en % du fond, animations Web Animations (transform et opacity seulement).
// Chaque mouvement est une boucle calculée une fois avec du hasard (durées, décalages, à-coups) : rien ne tourne en
// JavaScript image par image, sauf les étincelles (tirées au hasard à chaque envol).
// Réglages : scene-config.js ; positions : scene-positions.js. Images : src/assets/scenes/<jour|nuit>/<nom>.webp.
// Pause : scène hors de l'écran, onglet caché, « réduire les animations » (scène fixe, feu compris).
// =====================================================================
window.B = window.B || {};
(() => {
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (n) => Math.floor(Math.random() * n);
  const pct = (v, total) => `${((v / total) * 100).toFixed(3)}%`;
  const el = (tag, cls, style = {}) => { const e = document.createElement(tag); if (cls) e.className = cls; Object.assign(e.style, style); return e; };
  const LOOP = 40000; // longueur des boucles « à-coups » (hibou, écureuils, clignements)

  /** Une image facultative : appelle ok(url) si le fichier existe, rien sinon (jamais d'erreur) */
  const probe = (url, ok) => { const i = new Image(); i.onload = () => ok(url); i.src = url; };

  /** Petit point qui montre le pivot (mode debug) */
  const pivotDot = (origin) => { const [x, y] = origin.split(' '); return el('i', 'scn-pivot', { left: x, top: y }); };

  // ---------- Boucles d'animation ----------

  const breathe = (node, C) => {
    const d = rand(C.breath.minMs, C.breath.maxMs);
    return node.animate([{ transform: 'scaleY(1)' }, { transform: `scaleY(${C.breath.scaleY})` }, { transform: 'scaleY(1)' }],
      { duration: d, iterations: Infinity, easing: 'ease-in-out', delay: -rand(0, d) });
  };

  /** Rotation lente avec des pauses (tête de l'ours, renard, chamois) */
  const slowTurn = (node, { angle, minMs, maxMs }) => {
    const a = Math.min(5, angle) * (Math.random() < 0.5 ? -1 : 1), d = rand(minMs, maxMs);
    const r = (v) => ({ transform: `rotate(${v.toFixed(2)}deg)`, easing: 'ease-in-out' });
    return node.animate([{ offset: 0, ...r(0) }, { offset: 0.2, ...r(a) }, { offset: 0.42, ...r(a) }, { offset: 0.62, ...r(-a * 0.7) },
      { offset: 0.84, ...r(-a * 0.7) }, { offset: 1, ...r(0) }], { duration: d, iterations: Infinity, delay: -rand(0, d) });
  };

  /** Boucle d'événements brefs à intervalles au hasard : events(t) renvoie les images clés de chaque événement */
  const eventLoop = (node, minGap, maxGap, makeEvent, rest) => {
    const frames = [{ offset: 0, ...rest }];
    let t = rand(300, maxGap);
    while (t < LOOP - 1500) {
      const ev = makeEvent(); // [[ms depuis le début de l'événement, propriétés], …]
      ev.forEach(([dt, props]) => frames.push({ offset: (t + dt) / LOOP, ...props }));
      t += ev[ev.length - 1][0] + rand(minGap, maxGap);
    }
    frames.push({ offset: 1, ...rest });
    return node.animate(frames, { duration: LOOP, iterations: Infinity, delay: -rand(0, LOOP) });
  };

  /** Hibou : tourne la tête d'un coup (250 ms), puis ne bouge plus 2 à 5 s */
  const jerk = (node, { angle, moveMs, minStill, maxStill }) => {
    const frames = [{ offset: 0, transform: 'rotate(0deg)' }];
    let t = rand(500, maxStill), cur = 0;
    while (t < LOOP - moveMs - 1000) {
      let next; do { next = rand(-angle, angle); } while (Math.abs(next - cur) < angle / 3);
      frames.push({ offset: t / LOOP, transform: `rotate(${cur.toFixed(1)}deg)`, easing: 'ease-out' });
      frames.push({ offset: (t + moveMs) / LOOP, transform: `rotate(${next.toFixed(1)}deg)` });
      cur = next;
      t += moveMs + rand(minStill, maxStill);
    }
    frames.push({ offset: (LOOP - moveMs) / LOOP, transform: `rotate(${cur.toFixed(1)}deg)`, easing: 'ease-out' });
    frames.push({ offset: 1, transform: 'rotate(0deg)' });
    return node.animate(frames, { duration: LOOP, iterations: Infinity, delay: -rand(0, LOOP) });
  };

  const twitch = (node, { lift, angle, ms, minGap, maxGap }) => eventLoop(node, minGap, maxGap, () => {
    const a = rand(-angle, angle).toFixed(1);
    return [[0, { transform: 'translateY(0) rotate(0deg)' }], [ms / 2, { transform: `translateY(-${lift}px) rotate(${a}deg)` }], [ms, { transform: 'translateY(0) rotate(0deg)' }]];
  }, { transform: 'translateY(0) rotate(0deg)' });

  const blink = (node, B2) => eventLoop(node, B2.minGap, B2.maxGap, () => {
    const one = (t0) => [[t0, { opacity: 0 }], [t0 + B2.ms / 2, { opacity: 1 }], [t0 + B2.ms, { opacity: 0 }]];
    return Math.random() < B2.doubleChance ? [...one(0), ...one(B2.ms + 90)] : one(0);
  }, { opacity: 0 });

  // ---------- Le feu ----------

  /** Les moments où les flammes changent (300 à 500 ms), communs aux flammes et à la lueur pour qu'elles battent ensemble */
  function fireTimeline(F, count) {
    const L = 15000, times = [0];
    while (times[times.length - 1] < L - F.swapMinMs) times.push(times[times.length - 1] + rand(F.swapMinMs, F.swapMaxMs));
    times[times.length - 1] = L;
    const seq = times.map(() => pick(count));
    seq[seq.length - 1] = seq[0];
    const scale = times.map(() => rand(F.scaleMin, F.scaleMax));
    scale[scale.length - 1] = scale[0];
    return { L, times, seq, scale };
  }

  function buildFire(stage, mode, C, base) {
    const F = C.fire, P = F[mode];
    const ratio = 0.74; // largeur / hauteur des images de flammes
    const w = P.h * ratio;
    const parts = { anims: [] };
    // Lueur (nuit) : dégradé calculé, sous les animaux
    if (P.glow) {
      const r = F.glow.radius;
      parts.glow = el('div', 'scn-glow', {
        left: pct(P.x - r, base.w), top: pct(P.y - 40 - r, base.h), width: pct(2 * r, base.w), height: pct(2 * r, base.h),
        mixBlendMode: F.glow.blend, opacity: String(F.glow.base)
      });
      stage.append(parts.glow);
    }
    parts.fire = el('div', 'scn-fire', { left: pct(P.x - w / 2, base.w), top: pct(P.y - P.h, base.h), width: pct(w, base.w), height: pct(P.h, base.h), opacity: String(P.opacity) });
    parts.flicker = el('div', 'scn-flicker');
    parts.flames = F.files.map((name, i) => {
      const img = el('img', 'scn-flame', { opacity: i ? '0' : '1' });
      img.alt = ''; img.decoding = 'async';
      img.src = `${C.folder}/${mode}/${name}.webp`;
      img.onerror = () => { if (mode !== 'jour') img.src = `${C.folder}/jour/${name}.webp`; else img.remove(); }; // nuit sans flammes propres : celles du jour
      parts.flicker.append(img);
      return img;
    });
    parts.flicker.append(pivotDot('50% 100%'));
    parts.fire.append(parts.flicker);
    return parts;
  }

  function animateFire(parts, C) {
    const F = C.fire, n = parts.flames.length;
    const tl = fireTimeline(F, n);
    const at = (k) => tl.times[k] / tl.L;
    const opts = { duration: tl.L, iterations: Infinity };
    const anims = [];
    anims.push(parts.flicker.animate(tl.times.map((_, k) => ({ offset: at(k), transform: `scaleY(${tl.scale[k].toFixed(3)})`, easing: 'ease-in-out' })), opts));
    if (n > 1) {
      parts.flames.forEach((img, i) => anims.push(img.animate(tl.times.map((_, k) => ({ offset: at(k), opacity: tl.seq[k] === i ? 1 : 0 })), opts)));
    } else if (n === 1) {
      anims.push(parts.flames[0].animate(tl.times.map((_, k) => ({ offset: at(k), opacity: (0.85 + 0.15 * Math.random()).toFixed(2) })), opts));
    }
    if (parts.glow) {
      const G = F.glow;
      const v = tl.scale.map((s) => G.min + ((s - F.scaleMin) / (F.scaleMax - F.scaleMin)) * (G.max - G.min));
      const smooth = v.map((x, k) => (x + v[(k - 1 + v.length) % v.length] + v[(k + 1) % v.length]) / 3); // moins nerveux que les flammes
      smooth[smooth.length - 1] = smooth[0];
      anims.push(parts.glow.animate(tl.times.map((_, k) => ({ offset: at(k), opacity: smooth[k].toFixed(3), easing: 'ease-in-out' })), opts));
    }
    return anims;
  }

  // ---------- Une scène (jour ou nuit) ----------

  function buildSet(mode, C, POS, smallBg) {
    const base = C.base;
    const set = el('div', `scn-set scn-${mode}`);
    // Haut du dessin en miroir, flouté : seulement quand la scène rétrécie ne remplit pas l'écran en hauteur (téléphone)
    const backdrop = el('img', 'scn-backdrop');
    backdrop.alt = ''; backdrop.decoding = 'async'; backdrop.hidden = true;
    backdrop.dataset.src = `${C.folder}/${C.background[mode]}${C.background.small}.webp`;
    const stage = el('div', 'scn-stage');
    set.append(backdrop, stage);
    const bg = el('img', 'scn-bg');
    bg.alt = ''; bg.decoding = 'async';
    bg.src = `${C.folder}/${C.background[mode]}${smallBg ? C.background.small : ''}.webp`;
    stage.append(bg);

    const fire = buildFire(stage, mode, C, base); // la lueur se pose ici (sous les animaux)
    const animals = [];
    Object.entries(POS[mode] || {}).forEach(([name, p]) => {
      const A = C.animals[name] || C.animals[name.replace(/-\d+$/, '')] || {};
      const box = el('div', 'scn-a', { left: pct(p.x, base.w), top: pct(p.y, base.h), width: pct(p.w, base.w), height: pct(p.h, base.h) });
      box.dataset.name = name;
      const moveSpec = A.turn || A.jerk || A.twitch;
      const move = el('div', 'scn-move', { transformOrigin: moveSpec?.pivot || '50% 100%' });
      const breath = el('div', 'scn-breath', { transformOrigin: '50% 100%' });
      const img = el('img', 'scn-img');
      img.alt = ''; img.decoding = 'async';
      img.src = `${C.folder}/${mode}/${name}.webp`;
      img.onerror = () => box.remove(); // image absente : l'animal n'apparaît pas, rien ne casse
      if (A.flip) img.style.transform = 'scaleX(-1)'; // en miroir (le robot regarde vers le feu)
      breath.append(img, pivotDot('50% 100%'));
      move.append(breath);
      if (moveSpec) move.append(pivotDot(moveSpec.pivot));
      box.append(move);
      stage.append(box);
      const a = { name, A, box, move, breath, img, eyesHost: breath, head: null };
      animals.push(a);
    });
    stage.append(fire.fire);
    const sparks = el('div', 'scn-sparks');
    stage.append(sparks);
    return { mode, set, stage, backdrop, fire, animals, sparks, anims: [], sparkEls: [] };
  }

  /** Les images facultatives (ours en deux morceaux, yeux fermés) : ajoutées dès qu'elles sont chargées */
  function addOptional(S, C, onReady) {
    S.animals.forEach((a) => {
      const dir = `${C.folder}/${S.mode}/`;
      const sp = a.A.split;
      const withEyes = (host, name) => probe(`${dir}${name}-yeux-fermes.webp`, (url) => {
        const eyes = el('img', 'scn-eyes', { opacity: '0' });
        eyes.alt = ''; eyes.src = url;
        if (a.A.flip) eyes.style.transform = 'scaleX(-1)';
        host.append(eyes);
        a.eyes = eyes;
        onReady();
      });
      if (sp) {
        // L'ours en deux morceaux : le corps respire, la tête et les bras (au-dessus) tournent un peu
        let body = null, head = null;
        const both = () => {
          if (!body || !head) return;
          const headBox = el('div', 'scn-head', { transformOrigin: sp.pivot });
          const hi = el('img', 'scn-img'); hi.alt = ''; hi.src = head;
          headBox.append(hi, pivotDot(sp.pivot));
          a.img.src = body;
          a.breath.append(headBox);
          a.head = headBox;
          withEyes(headBox, sp.head);
          onReady();
        };
        probe(`${dir}${sp.body}.webp`, (u) => { body = u; both(); });
        probe(`${dir}${sp.head}.webp`, (u) => { head = u; both(); });
        if (!a.head) withEyes(a.breath, a.name);
      } else withEyes(a.breath, a.name);
    });
  }

  // ---------- Le composant ----------

  B.Scene = (container, opts = {}) => {
    const C = B.SCENE_CONFIG, POS = B.SCENE_POSITIONS;
    const root = el('div', 'scn');
    root.style.setProperty('--scn-fade', `${C.crossfadeMs}ms`);
    container.append(root);
    const reduce = matchMedia('(prefers-reduced-motion: reduce)');
    const sets = {};
    let mode = opts.mode === 'nuit' ? 'nuit' : 'jour';
    let animated = opts.animated !== false;
    let visible = true;
    let scale = 1;
    let dead = false;
    const running = () => animated && !reduce.matches && visible && !document.hidden && !dead;

    // Fond léger seulement s'il reste net : la scène affichée (en pixels réels de l'écran) n'est pas plus large que lui
    const smallBg = () => {
      const s = Math.max(container.clientWidth / C.base.w, container.clientHeight / C.base.h);
      return C.base.w * s * (devicePixelRatio || 1) <= C.background.smallUnder;
    };

    // Cadrage « cover » autour du point focal (le feu), sans jamais déformer
    const layout = () => {
      const W = container.clientWidth, H = container.clientHeight, b = C.base;
      if (!W || !H) return;
      const K = C.keep;
      scale = Math.max(W / b.w, H / b.h);
      // Écran étroit (téléphone en hauteur) : la scène rétrécit pour que les personnages et le feu se voient en entier
      if (K && (K.x1 - K.x0) * scale > W) scale = Math.max(W / b.w, W / (K.x1 - K.x0));
      const sw = b.w * scale, sh = b.h * scale;
      let left = W * C.focalOnScreen.x - C.focal.x * scale;
      if (K) left = Math.max(W - K.x1 * scale, Math.min(-K.x0 * scale, left));
      left = Math.min(0, Math.max(W - sw, left));
      const gap = sh < H - 0.5;
      const top = gap ? H - sh : Math.min(0, Math.max(H - sh, H * C.focalOnScreen.y - C.focal.y * scale));
      Object.values(sets).forEach((S) => {
        Object.assign(S.stage.style, { left: `${left}px`, top: `${top}px`, width: `${sw}px`, height: `${sh}px` });
        // Le haut vide reprend le haut du dessin en miroir, flouté : les couleurs se suivent sans couture
        if (gap && !S.backdrop.src) S.backdrop.src = S.backdrop.dataset.src;
        if (gap) Object.assign(S.backdrop.style, { left: `${left}px`, top: `${top - sh + 24}px`, width: `${sw}px`, height: `${sh}px` });
        S.backdrop.hidden = !gap;
        S.stage.classList.toggle('scn-fade-top', gap);
      });
    };

    // ---- étincelles (nuit) : chacune repart avec un nouveau trajet à la fin du précédent
    const launchSpark = (S, s) => {
      if (!running() || S.mode !== mode) return;
      const P = C.fire[S.mode], K = C.fire.spark;
      const dx = rand(-K.drift, K.drift) * scale, rise = rand(K.rise[0], K.rise[1]) * scale;
      const a = s.animate([
        { transform: 'translate(0, 0) scale(1)', opacity: 0 },
        { offset: 0.12, opacity: 1 },
        { offset: 0.6, transform: `translate(${(dx * 0.5).toFixed(1)}px, ${(-rise * 0.6).toFixed(1)}px) scale(0.8)`, opacity: 0.8 },
        { transform: `translate(${dx.toFixed(1)}px, ${(-rise).toFixed(1)}px) scale(0.4)`, opacity: 0 }
      ], { duration: rand(K.minMs, K.maxMs), delay: rand(0, 1600), easing: 'ease-out' });
      s.style.left = pct(P.x + rand(-P.h * 0.18, P.h * 0.18), C.base.w);
      a.onfinish = () => { S.anims = S.anims.filter((x) => x !== a); launchSpark(S, s); };
      S.anims.push(a);
    };
    const makeSparks = (S) => {
      const P = C.fire[S.mode], K = C.fire.spark;
      S.sparks.replaceChildren();
      S.sparkEls = Array.from({ length: Math.min(20, P.sparks || 0) }, () => {
        const size = rand(K.size[0], K.size[1]);
        const s = el('i', 'scn-spark', { top: pct(P.y - P.h * 0.45, C.base.h), width: pct(size, C.base.w), height: pct(size, C.base.h), opacity: '0' });
        if (S.sparkTexture) { s.classList.add('tex'); s.style.backgroundImage = `url("${S.sparkTexture}")`; }
        S.sparks.append(s);
        return s;
      });
    };

    const stopSet = (S) => { S.anims.forEach((a) => { a.onfinish = null; a.cancel(); }); S.anims = []; };
    const startSet = (S) => {
      stopSet(S);
      S.animals.forEach((a) => {
        if (a.A.breath) S.anims.push(breathe(a.breath, C));
        if (a.A.turn) S.anims.push(slowTurn(a.move, a.A.turn));
        if (a.A.jerk) S.anims.push(jerk(a.move, a.A.jerk));
        if (a.A.twitch) S.anims.push(twitch(a.move, a.A.twitch));
        if (a.head) S.anims.push(slowTurn(a.head, a.A.split));
        if (a.eyes) S.anims.push(blink(a.eyes, C.blink));
      });
      S.anims.push(...animateFire(S.fire, C));
      S.sparkEls.forEach((s) => launchSpark(S, s));
    };

    // Toutes les animations suivent l'état : en marche, en pause (hors écran / onglet caché), ou scène fixe
    const sync = () => {
      Object.values(sets).forEach((S) => {
        const active = S.mode === mode;
        if (!animated || reduce.matches) { stopSet(S); return; } // scène fixe : premier état des flammes, lueur de base
        if (!active) { setTimeout(() => { if (S.mode !== mode) S.anims.forEach((a) => a.pause()); }, C.crossfadeMs); return; } // après le fondu
        if (!S.anims.length && running()) { startSet(S); return; }
        if (running()) {
          S.anims.forEach((a) => (a.playState === 'paused' ? a.play() : null));
          if (!S.anims.some((a) => a.onfinish)) S.sparkEls.forEach((s) => launchSpark(S, s)); // relance des étincelles
        } else S.anims.forEach((a) => a.pause());
      });
    };

    const ensureSet = (m) => {
      if (sets[m]) return sets[m];
      const S = buildSet(m, C, POS, smallBg());
      sets[m] = S;
      root.append(S.set);
      makeSparks(S);
      if (C.fire.spark.texture && C.fire[m].sparks) {
        probe(`${C.folder}/${m}/${C.fire.spark.texture}.webp`, (url) => { S.sparkTexture = url; makeSparks(S); if (S.anims.length) { stopSet(S); sync(); } });
      }
      // Images facultatives arrivées après coup : on relance les boucles pour les inclure
      addOptional(S, C, () => { if (S.anims.length) { stopSet(S); sync(); } });
      layout();
      return S;
    };

    const show = () => Object.values(sets).forEach((S) => S.set.classList.toggle('on', S.mode === mode));
    ensureSet(mode);
    requestAnimationFrame(() => { show(); sync(); });
    root.classList.toggle('scn-debug', !!opts.debug);

    const ro = new ResizeObserver(layout);
    ro.observe(container);
    const io = new IntersectionObserver((entries) => { visible = entries.some((e) => e.isIntersecting); sync(); });
    io.observe(root);
    document.addEventListener('visibilitychange', sync);
    reduce.addEventListener?.('change', sync);

    return {
      el: root,
      get mode() { return mode; },
      /** Jour ↔ nuit : toute la scène passe en fondu */
      setMode(m) {
        m = m === 'nuit' ? 'nuit' : 'jour';
        if (m === mode) return;
        mode = m;
        ensureSet(m);
        requestAnimationFrame(() => { show(); sync(); });
      },
      setAnimated(on) { animated = !!on; sync(); },
      setDebug(on) { root.classList.toggle('scn-debug', !!on); },
      destroy() {
        dead = true;
        Object.values(sets).forEach(stopSet);
        ro.disconnect(); io.disconnect();
        document.removeEventListener('visibilitychange', sync);
        reduce.removeEventListener?.('change', sync);
        root.remove();
      }
    };
  };
})();
