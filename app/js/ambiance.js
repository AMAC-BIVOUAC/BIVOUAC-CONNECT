// =====================================================================
// Ambiance d'Aujourd'hui (22/11, Apo) : la scène peinte du bivouac en fond de page, de jour ou de nuit selon l'heure
//   (scène : scene.js + scene-config.js + scene-positions.js ; jour ou nuit : B.ambianceMoment, ambiance-scene.js).
//   Son (facultatif, bouton en bas à droite, clic droit = volume) : crépitement du feu, vent dans les feuilles ;
//   oiseaux le jour, grillons et hibou la nuit. FABRIQUÉ ici par Web Audio (comme sounds.js) : aucun fichier,
//   aucun extrait d'un tiers (droits d'auteur), rien à télécharger.
// Règles : purement décoratif (aria-hidden, aucun clic sauf le bouton du son) ; « Animations » coupé (.no-anim) ou
//   « réduire les animations » : image fixe ; le son se tait en statut Occupé, pendant un vocal, quand l'onglet est
//   caché, sur téléphone et hors de la page Aujourd'hui.
// =====================================================================
(() => {
  // ---------- Le son : feu de camp et vent léger, fabriqués par Web Audio ----------

  const S = { ctx: null, master: null, sources: [], timers: [], on: false };
  /** Une note brève (oiseau, grillon, hibou) : fréquence de départ → d'arrivée, enveloppe douce */
  const tone = (ctx, { f0, f1 = f0, dur, peak, type = 'sine', at = 0 }) => {
    const t = ctx.currentTime + 0.01 + at;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + Math.min(0.03, dur / 3)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(S.master); o.start(t); o.stop(t + dur + 0.05);
  };
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

  function startSound(moment = 'day') {
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

    if (moment === 'day') {
      // Oiseaux : petites phrases de deux à cinq notes qui glissent, de temps en temps
      const bird = () => {
        if (!S.on) return;
        const n = 2 + Math.floor(Math.random() * 4), base = 2600 + Math.random() * 1800;
        for (let i = 0; i < n; i++) tone(ctx, { f0: base * (1 + Math.random() * 0.3), f1: base * (0.8 + Math.random() * 0.6), dur: 0.06 + Math.random() * 0.08, peak: 0.018, at: i * (0.1 + Math.random() * 0.08) });
        later(bird, 3500 + Math.random() * 9000);
      };
      later(bird, 2000);
    } else {
      // Grillons : trilles aigus, réguliers, très doux ; hibou de temps en temps
      const cricket = () => {
        if (!S.on) return;
        const fq = 4300 + Math.random() * 400;
        for (let i = 0; i < 3; i++) tone(ctx, { f0: fq, dur: 0.035, peak: 0.006, type: 'triangle', at: i * 0.06 });
        later(cricket, 600 + Math.random() * 900);
      };
      cricket();
      const owl = () => {
        if (!S.on) return;
        tone(ctx, { f0: 410, f1: 360, dur: 0.5, peak: 0.03 });
        tone(ctx, { f0: 400, f1: 350, dur: 0.3, peak: 0.022, at: 0.9 });
        tone(ctx, { f0: 395, f1: 340, dur: 0.45, peak: 0.026, at: 1.3 });
        later(owl, 25000 + Math.random() * 30000);
      };
      later(owl, 8000);
    }
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
    let moment = B.ambianceMoment();
    layer.className = `amb ${moment}`;
    layer.setAttribute('aria-hidden', 'true');
    view.prepend(layer);
    // Le bouton du son flotte AU-DESSUS du contenu (le calque, lui, est dessous)
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'amb-sound icon-btn';
    view.append(btn);
    view.classList.add('has-amb');
    // Téléphone : scène fixe (images seules, batterie et fluidité) ; ailleurs : réglage Animations et « réduire les animations »
    const still = () => B.isPhone?.() || !B.animationsOn() || matchMedia('(prefers-reduced-motion: reduce)').matches;
    // La scène peinte (scene.js) : fond, animaux, feu ; jour ou nuit
    const fr = (m) => (m === 'night' ? 'nuit' : 'jour');
    const scene = B.Scene(layer, { mode: fr(moment), animated: !still() });
    const syncMotion = () => scene.setAnimated(!still());

    // Le calque suit exactement la zone de la page (#view), même quand la fenêtre change de taille
    const place = () => {
      const r = view.getBoundingClientRect();
      Object.assign(layer.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${view.clientWidth}px`, height: `${r.height}px` });
      Object.assign(btn.style, { left: `${r.left + view.clientWidth - 60}px`, top: `${r.bottom - 60}px` });
      syncMotion(); // passage ordinateur ↔ téléphone : animée ou fixe
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
    const sync = () => (soundAllowed() && !B.isPhone?.() ? startSound(moment) : stopSound()); // pas de son sur téléphone
    // Jour ↔ nuit : vérifié chaque minute ; les couleurs passent en fondu (transition CSS), le son change de compagnie
    const clock = setInterval(() => {
      const now = B.ambianceMoment();
      if (now === moment) return;
      moment = now;
      layer.className = `amb ${moment}`;
      scene.setMode(fr(moment)); // toute la scène passe en fondu
      if (S.on) { stopSound(); setTimeout(sync, 950); }
    }, 60000);
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
    const kick = () => { if (soundAllowed() && !B.isPhone?.()) { stopSound(); startSound(moment); } };
    const onGesture = () => { if (S.ctx?.state === 'running' && S.on) return; kick(); };
    addEventListener('pointerdown', onGesture, { capture: true });
    addEventListener('keydown', onGesture, { capture: true });
    document.addEventListener('visibilitychange', sync);
    const offs = [B.on('status', sync), B.on('voice', sync), B.on('animations', syncMotion)];
    sync();

    B.onLeave(() => {
      stopSound();
      clearInterval(clock);
      ro.disconnect();
      removeEventListener('resize', place);
      removeEventListener('pointerdown', onGesture, { capture: true });
      removeEventListener('keydown', onGesture, { capture: true });
      document.removeEventListener('visibilitychange', sync);
      offs.forEach((off) => off?.());
      view.classList.remove('has-amb');
      scene.destroy();
      layer.remove();
      btn.remove();
    });
  };
})();
