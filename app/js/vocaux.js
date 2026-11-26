// Messages vocaux façon WhatsApp (v0.8.86, Apo) : enregistrement et lecteur réutilisables.
//
//   B.recordVoiceNote(conteneur, onDone)  barre d'enregistrement posée dans le conteneur (supprimer, point rouge + minuteur,
//                                         onde en direct, pause → aperçu à réécouter, micro pour reprendre, envoyer).
//                                         onDone(File) au clic sur Envoyer : file.voiceSeconds, file.voicePeaks (0 à 1).
//   B.voicePlayerHtml(source, options)    bulle de lecture : source = { path, bucket } (stockage) ou { url } (fichier local).
//                                         options : seconds, peaks, person (avatar avec badge micro), time (heure affichée).
//   B.bindVoicePlayers()                  à appeler une fois (idempotent) : lecture SUR PLACE, un seul vocal à la fois,
//                                         chargement quand la bulle devient visible, vitesse 1x / 1.5x / 2x pendant la lecture.
//   B.isVoiceNote(f)                      un fichier joint est-il un message vocal ?
//
// Jamais de nouvelle fenêtre ni de lecteur du système : le son est téléchargé (adresse signée), décodé une fois pour
// dessiner l'onde et connaître la vraie durée (les fichiers webm de MediaRecorder n'en donnent pas), puis lu par un
// élément <audio> gardé en mémoire (la lecture continue si la bulle est redessinée).
(() => {
  const BARS = 36;          // barres de l'onde dans une bulle
  const LIVE_BARS = 32;     // barres de l'onde pendant l'enregistrement
  const SAMPLE_MS = 100;    // un niveau de micro tous les 1/10 s
  const RATES = [1, 1.5, 2];

  B.isVoiceNote = (f) => /^message-vocal-/.test(f?.name || '') || f?.voiceSeconds != null;
  /** Texte posé automatiquement à l'envoi d'un vocal seul (« 🎤 Message vocal (0:12) ») : la bulle le remplace */
  B.isVoiceOnlyText = (content, files) => Boolean(files?.length && files.every(B.isVoiceNote)
    && String(content || '').split('\n').every((l) => /^🎤 /.test(l)));
  const rateLabel = (r) => `${String(r).replace('.', B.lang === 'fr' ? ',' : '.')}x`;
  const fmt = (s) => B.fmtDuration(Math.max(0, Math.round(s || 0)));

  /** Ramène une liste de niveaux à n barres (maximum de chaque tranche), normalisée entre 0,08 et 1 */
  const resample = (levels, n) => {
    if (!levels?.length) return Array(n).fill(0.08);
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = Math.floor(i * levels.length / n), b = Math.max(a + 1, Math.floor((i + 1) * levels.length / n));
      out.push(Math.max(...levels.slice(a, b)));
    }
    const top = Math.max(...out) || 1;
    return out.map((v) => Math.max(0.08, Math.min(1, v / top)));
  };
  const barsHtml = (peaks, n) => resample(peaks, n).map((v) => `<i style="--h:${Math.round(v * 100)}%"></i>`).join('');

  // ---------- Lecteur ----------
  const states = new Map(); // clé (chemin ou adresse locale) -> { audio, peaks, duration, loading, ready }
  let ctx = null;          // un seul AudioContext, seulement pour décoder
  let current = null;      // clé du vocal en cours de lecture

  B.voicePlayerHtml = (src, o = {}) => {
    const key = src.url || `${src.bucket}:${src.path}`;
    const st = states.get(key);
    const peaks = st?.peaks || o.peaks;
    const seconds = st?.duration ?? o.seconds;
    const side = o.person ? `<span class="vnote-av">${avatar(o.person, 44)}<span class="vnote-mic">${icon('mic', 13)}</span></span>`
      : `<span class="vnote-av plain">${icon('mic', 20)}</span>`;
    return `<div class="vnote${peaks ? ' has-wave' : ''}" data-vn-key="${esc(key)}" ${src.url ? `data-vn-url="${esc(src.url)}"` : `data-vn-path="${esc(src.path)}" data-vn-bucket="${esc(src.bucket)}"`}
      ${seconds != null ? `data-vn-seconds="${seconds}"` : ''} translate="no">
      <span class="vnote-side">${side}<button type="button" class="vnote-rate" data-vn-rate hidden aria-label="${tr('Vitesse de lecture')}">${rateLabel(store.get('voice-note:rate', 1))}</button></span>
      <button type="button" class="vnote-play" data-vn-play aria-label="${tr('Écouter le message vocal')}">${icon('play', 22)}</button>
      <span class="vnote-body">
        <span class="vnote-wave" data-vn-wave role="slider" tabindex="0" aria-label="${tr('Position dans le message vocal')}" aria-valuemin="0" aria-valuemax="${Math.round(seconds || 0)}" aria-valuenow="0">
          <span class="vnote-bars">${barsHtml(peaks, BARS)}</span><span class="vnote-knob"></span></span>
        <span class="vnote-meta"><span class="vnote-time">${seconds != null ? fmt(seconds) : '–:––'}</span>${o.time ? `<span class="vnote-clock">${esc(o.time)}</span>` : ''}</span>
      </span></div>`;
  };

  const els = (key) => $$(`.vnote[data-vn-key="${CSS.escape(key)}"]`);

  /** Met toutes les bulles de ce vocal à jour (il peut y en avoir deux : message + fil) */
  const paint = (key) => {
    const st = states.get(key); if (!st) return;
    const a = st.audio, dur = st.duration || 0;
    const pos = a ? a.currentTime : 0, playing = a && !a.paused;
    const started = playing || pos > 0.05;
    const pct = dur ? Math.min(1, pos / dur) : 0;
    els(key).forEach((el) => {
      el.classList.toggle('playing', Boolean(playing));
      el.classList.toggle('started', started);
      el.classList.toggle('loading', Boolean(st.loading));
      if (st.failed) { el.classList.add('failed'); $('.vnote-time', el).textContent = tr('Indisponible'); return; }
      if (st.peaks && !el.classList.contains('has-wave')) { $('.vnote-bars', el).innerHTML = barsHtml(st.peaks, BARS); el.classList.add('has-wave'); }
      const btn = $('[data-vn-play]', el);
      btn.innerHTML = icon(playing ? 'pause' : 'play', 22);
      btn.setAttribute('aria-label', playing ? tr('Mettre en pause') : tr('Écouter le message vocal'));
      $('[data-vn-rate]', el).hidden = !started;
      $('[data-vn-rate]', el).textContent = rateLabel(store.get('voice-note:rate', 1));
      el.style.setProperty('--p', pct);
      const n = Math.round(pct * BARS);
      $$('.vnote-bars i', el).forEach((b, i) => b.classList.toggle('on', i < n));
      $('.vnote-time', el).textContent = started ? fmt(pos) : (dur ? fmt(dur) : $('.vnote-time', el).textContent);
      const w = $('[data-vn-wave]', el);
      w.setAttribute('aria-valuemax', Math.round(dur)); w.setAttribute('aria-valuenow', Math.round(pos));
      w.setAttribute('aria-valuetext', `${fmt(pos)} / ${fmt(dur)}`);
    });
  };

  /** Télécharge et décode un vocal (une seule fois) : onde, vraie durée, adresse locale pour la lecture */
  const load = (el) => {
    const key = el.dataset.vnKey;
    let st = states.get(key);
    if (st) return st.ready;
    st = { loading: true, duration: el.dataset.vnSeconds ? Number(el.dataset.vnSeconds) : null };
    states.set(key, st);
    st.ready = (async () => {
      let url = el.dataset.vnUrl;
      if (!url) {
        const { data, error } = await B.sb.storage.from(el.dataset.vnBucket).createSignedUrl(el.dataset.vnPath, 3600);
        if (error || !data?.signedUrl) throw new Error('signed');
        url = data.signedUrl;
      }
      const res = await fetch(url, { referrerPolicy: 'no-referrer' });
      if (!res.ok) throw new Error('fetch');
      const buf = await res.arrayBuffer();
      const blob = new Blob([buf], { type: res.headers.get('content-type') || 'audio/webm' });
      st.blobUrl = el.dataset.vnUrl ? url : URL.createObjectURL(blob);
      try {
        ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
        const audio = await ctx.decodeAudioData(buf.slice(0));
        st.duration = audio.duration;
        const ch = audio.getChannelData(0), step = Math.max(1, Math.floor(ch.length / 120)), levels = [];
        for (let i = 0; i < ch.length; i += step) {
          let sum = 0; const end = Math.min(ch.length, i + step);
          for (let j = i; j < end; j += 4) sum += ch[j] * ch[j];
          levels.push(Math.sqrt(sum / Math.max(1, (end - i) / 4)));
        }
        st.peaks = levels;
      } catch { /* format que l'appareil ne sait pas décoder : on lira quand même, onde plate */ }
      const a = new Audio();
      a.preload = 'auto'; a.src = st.blobUrl;
      a.playbackRate = store.get('voice-note:rate', 1);
      a.ontimeupdate = () => paint(key);
      a.onplay = a.onpause = () => paint(key);
      a.onloadedmetadata = () => { if (!st.duration && Number.isFinite(a.duration)) { st.duration = a.duration; paint(key); } };
      a.onended = () => { a.currentTime = 0; if (current === key) current = null; paint(key); };
      st.audio = a;
      st.loading = false;
      paint(key);
    })().catch((e) => {
      st.loading = false; st.failed = true; st.error = String(e);
      paint(key);
    });
    paint(key);
    return st.ready;
  };

  const toggle = async (el) => {
    const key = el.dataset.vnKey;
    await load(el);
    const st = states.get(key);
    if (!st?.audio) return;
    if (!st.audio.paused) { st.audio.pause(); return; }
    if (current && current !== key) states.get(current)?.audio?.pause(); // un seul vocal à la fois
    current = key;
    st.audio.playbackRate = store.get('voice-note:rate', 1);
    try { await st.audio.play(); } catch { B.toast(tr('Lecture impossible sur cet appareil.'), { type: 'error' }); }
  };

  const seek = async (el, ratio) => {
    const key = el.dataset.vnKey;
    await load(el);
    const st = states.get(key);
    if (!st?.audio || !st.duration) return;
    st.audio.currentTime = Math.max(0, Math.min(st.duration - 0.05, ratio * st.duration));
    paint(key);
  };

  let bound = false;
  B.bindVoicePlayers = () => {
    if (bound) return; bound = true;
    document.addEventListener('click', (e) => {
      const el = e.target.closest?.('.vnote'); if (!el) return;
      if (e.target.closest('[data-vn-play]')) { e.preventDefault(); toggle(el); }
      else if (e.target.closest('[data-vn-rate]')) {
        e.preventDefault();
        const r = RATES[(RATES.indexOf(store.get('voice-note:rate', 1)) + 1) % RATES.length];
        store.set('voice-note:rate', r);
        states.forEach((s) => { if (s.audio) s.audio.playbackRate = r; });
        paint(el.dataset.vnKey);
      }
    });
    // Glisser sur l'onde (souris ou doigt) pour avancer / reculer
    document.addEventListener('pointerdown', (e) => {
      const w = e.target.closest?.('[data-vn-wave]'); if (!w) return;
      const el = w.closest('.vnote');
      const at = (ev) => { const r = w.getBoundingClientRect(); return (ev.clientX - r.left) / r.width; };
      seek(el, at(e));
      const move = (ev) => seek(el, at(ev));
      const up = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); };
      document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
    });
    document.addEventListener('keydown', (e) => {
      const w = e.target.closest?.('[data-vn-wave]'); if (!w) return;
      const st = states.get(w.closest('.vnote').dataset.vnKey);
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); return toggle(w.closest('.vnote')); }
      if (!st?.audio || !st.duration || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      e.preventDefault();
      seek(w.closest('.vnote'), (st.audio.currentTime + (e.key === 'ArrowRight' ? 5 : -5)) / st.duration);
    });
    // Chargement quand la bulle devient visible (onde et durée prêtes avant d'appuyer sur lecture)
    const io = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => entries.forEach((en) => {
      if (en.isIntersecting) { io.unobserve(en.target); load(en.target); }
    }), { rootMargin: '200px' }) : null;
    const scan = () => $$('.vnote:not([data-vn-seen])').forEach((el) => {
      el.dataset.vnSeen = '1';
      if (states.has(el.dataset.vnKey)) paint(el.dataset.vnKey); // bulle redessinée : on reprend l'état
      else if (io) io.observe(el);
    });
    new MutationObserver(scan).observe(document.body, { subtree: true, childList: true });
    scan();
    // On change de page : le son s'arrête (comme WhatsApp quand on quitte la conversation)
    window.addEventListener('hashchange', () => { if (current) states.get(current)?.audio?.pause(); });
  };

  /** Oublie un vocal local (aperçu avant envoi) */
  B.forgetVoiceNote = (url) => { const st = states.get(url); st?.audio?.pause(); states.delete(url); };

  // ---------- Enregistrement ----------
  B.recordVoiceNote = async (container, onDone) => {
    if ($('.vrec', container)) return;
    const stream = await (B.openMic?.() || navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null));
    if (!stream) return B.toast(tr('Micro introuvable ou refusé. Autorisez le micro pour enregistrer un message vocal.'), { type: 'error', timeout: 8000 });
    const type = B.audioRecordType();
    let rec;
    try { rec = new MediaRecorder(stream, type.mime ? { mimeType: type.mime, audioBitsPerSecond: 32000 } : {}); }
    catch { stream.getTracks().forEach((t) => t.stop()); return B.toast(tr('Cet appareil ne sait pas enregistrer le son.'), { type: 'error' }); }
    B.bindVoicePlayers();

    // Niveau du micro pour l'onde en direct
    let ac = null, analyser = null, buf = null;
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      analyser = ac.createAnalyser(); analyser.fftSize = 1024;
      ac.createMediaStreamSource(stream).connect(analyser);
      buf = new Float32Array(analyser.fftSize);
    } catch { analyser = null; }
    const level = () => {
      if (!analyser) return 0.1 + Math.random() * 0.2;
      analyser.getFloatTimeDomainData(buf);
      let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
      return Math.min(1, Math.sqrt(s / buf.length) * 5);
    };

    const chunks = [], peaks = [];
    let elapsed = 0, segStart = Date.now(), paused = false, keep = true, previewUrl = null;
    const seconds = () => elapsed + (paused ? 0 : (Date.now() - segStart) / 1000);

    const bar = h(`<div class="vrec" role="group" aria-label="${tr('Message vocal')}">
      <button type="button" class="icon-btn vrec-del" data-vr-del title="${tr('Supprimer')}" aria-label="${tr('Supprimer le message vocal')}">${icon('trash', 20)}</button>
      <span class="vrec-live" role="status"><span class="rec-dot" aria-hidden="true"></span><span class="vrec-time">0:00</span>
        <span class="vrec-wave" aria-hidden="true">${'<i></i>'.repeat(LIVE_BARS)}</span></span>
      <span class="vrec-review" hidden></span>
      <button type="button" class="icon-btn vrec-pause" data-vr-pause title="${tr('Pause')}" aria-label="${tr('Mettre l’enregistrement en pause')}">${icon('pause', 20)}</button>
      <button type="button" class="vrec-send" data-vr-send title="${tr('Envoyer')}" aria-label="${tr('Envoyer le message vocal')}">${icon('send', 20)}</button></div>`);
    container.classList.add('vrec-on');
    container.prepend(bar);
    const liveBars = $$('.vrec-wave i', bar);

    const tick = setInterval(() => {
      if (paused) return;
      peaks.push(level());
      const last = peaks.slice(-LIVE_BARS), pad = LIVE_BARS - last.length;
      liveBars.forEach((b, i) => { const v = i < pad ? 0 : last[i - pad]; b.style.setProperty('--h', `${Math.round(Math.max(0.08, v) * 100)}%`); b.classList.toggle('off', i < pad); });
      $('.vrec-time', bar).textContent = fmt(seconds());
      if (seconds() >= B.VOICE_NOTE_MAX_S) send();
    }, SAMPLE_MS);

    const cleanup = () => {
      clearInterval(tick);
      if (previewUrl) { B.forgetVoiceNote(previewUrl); URL.revokeObjectURL(previewUrl); }
      bar.remove(); container.classList.remove('vrec-on');
      stream.getTracks().forEach((t) => t.stop());
      ac?.close?.().catch(() => {});
    };
    const pause = () => {
      if (paused || rec.state !== 'recording') return;
      rec.pause(); paused = true; elapsed += (Date.now() - segStart) / 1000;
      rec.requestData(); // les morceaux arrivent dans ondataavailable, puis on montre l'aperçu
      setTimeout(showReview, 120);
    };
    const showReview = () => {
      if (!paused || !bar.isConnected) return;
      if (previewUrl) { B.forgetVoiceNote(previewUrl); URL.revokeObjectURL(previewUrl); }
      previewUrl = URL.createObjectURL(new Blob(chunks, { type: type.base }));
      const review = $('.vrec-review', bar);
      review.innerHTML = B.voicePlayerHtml({ url: previewUrl }, { seconds: Math.round(elapsed), peaks });
      review.hidden = false; $('.vrec-live', bar).hidden = true;
      const p = $('[data-vr-pause]', bar);
      p.innerHTML = icon('mic', 20); p.classList.add('resume');
      p.title = tr('Reprendre'); p.setAttribute('aria-label', tr('Reprendre l’enregistrement'));
    };
    const resume = () => {
      if (!paused) return;
      if (previewUrl) states.get(previewUrl)?.audio?.pause();
      rec.resume(); paused = false; segStart = Date.now();
      $('.vrec-review', bar).hidden = true; $('.vrec-live', bar).hidden = false;
      const p = $('[data-vr-pause]', bar);
      p.innerHTML = icon('pause', 20); p.classList.remove('resume');
      p.title = tr('Pause'); p.setAttribute('aria-label', tr('Mettre l’enregistrement en pause'));
    };
    const send = () => { keep = true; if (!paused) elapsed += (Date.now() - segStart) / 1000; paused = true; if (rec.state !== 'inactive') rec.stop(); };
    const drop = () => { keep = false; if (rec.state !== 'inactive') rec.stop(); else cleanup(); };

    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      const total = Math.round(elapsed);
      cleanup();
      if (!keep || !chunks.length || total < 1) return;
      const d = new Date(), z = (n) => String(n).padStart(2, '0');
      const file = new File(chunks, `message-vocal-${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}-${z(d.getHours())}h${z(d.getMinutes())}.${type.ext}`, { type: type.base });
      file.voiceSeconds = total;
      file.voicePeaks = peaks;
      onDone(file);
    };
    $('[data-vr-del]', bar).onclick = drop;
    $('[data-vr-pause]', bar).onclick = () => (paused ? resume() : pause());
    $('[data-vr-send]', bar).onclick = send;
    B.onLeave(drop);
    rec.start(1000);
  };
})();
