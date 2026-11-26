// =====================================================================
// Mes notes (v0.8.86, 26/11, Apo ; migration 051, table personal_notes, bucket note-files)
//
// Une note pour plus tard, écrite ou vocale, PRIVÉE (personne d'autre ne la voit, ni l'équipe ni les IA).
//   B.quickNote()          : fenêtre « Note rapide » (bouton + de la barre du haut)
//   B.pages.notes          : page « Mes notes » (#/notes, #/notes/<id>), sous Messages dans le menu
//   B.dueNotes()           : notes dont le rappel est passé et pas encore traitées (Aujourd'hui → « On vous attend »)
// Vocal : enregistrement par B.recordVoiceNote (media.js) ; transcription par la reconnaissance vocale du navigateur quand
// il en a une (Chrome, Edge, Android ; pas l'app Windows) : le texte reconnu va dans la note, modifiable.
// Lecture sur place : B.voicePlayerHtml / B.bindVoicePlayers (lecteur des messages vocaux) s'ils existent, sinon <audio>.
// Une note se convertit en idée, tâche, décision soumise au vote, événement, ou part dans l'Atelier IA d'un projet :
// elle passe alors en « Traitée », avec un lien vers ce qu'elle est devenue (converted_kind / _project / _id).
// =====================================================================
(() => {
  const BUCKET = 'note-files';
  const KINDS = [
    ['task', 'checksq', 'Une tâche'],
    ['idea', 'bulb', 'Une idée'],
    ['decision', 'decision', 'Une décision au vote'],
    ['event', 'calendar', 'Un événement'],
    ['atelier', 'bot', 'Un message à l’Atelier IA']
  ];
  const BECAME = {
    task: 'Devenue une tâche dans « {p} »', idea: 'Devenue une idée dans « {p} »', decision: 'Devenue un vote dans « {p} »',
    event: 'Devenue un événement dans « {p} »', atelier: 'Envoyée à l’Atelier IA de « {p} »'
  };
  const becameLink = (n) => {
    const pid = n.converted_project;
    if (!pid) return null;
    return { task: `#/p/${pid}/taches`, idea: `#/p/${pid}/projet/tout`, decision: `#/p/${pid}/projet/tout`,
      event: `#/p/${pid}/taches/calendrier`, atelier: `#/p/${pid}/atelier` }[n.converted_kind] || `#/p/${pid}`;
  };
  const firstLine = (s) => String(s || '').trim().split('\n')[0].slice(0, 200);
  const rest = (s) => String(s || '').trim().split('\n').slice(1).join('\n').trim();
  const noteText = (n) => n.content?.trim() || (n.audio_path ? tr('Note vocale') : '');

  // ---------- Données ----------
  const load = async () => {
    const { data, error } = await B.sb.from('personal_notes').select('*').eq('user_id', B.me.id).order('created_at', { ascending: false }).limit(1000);
    if (error) throw error;
    return data || [];
  };
  B.dueNotes = async () => {
    const { data } = await B.sb.from('personal_notes').select('*').eq('user_id', B.me.id).is('done_at', null)
      .lte('remind_at', new Date().toISOString()).order('remind_at').limit(10);
    return (data || []).filter((n) => n.remind_at && !n.done_at && new Date(n.remind_at) <= new Date());
  };

  /** Pastille « Mes notes » du menu : nombre de rappels passés à traiter */
  B.refreshNotesBadge = async () => {
    const el = $('#notes-badge');
    if (!el || !B.me) return;
    const n = (await B.dueNotes().catch(() => [])).length;
    el.textContent = n ? String(n) : '';
    el.classList.toggle('hidden', !n);
  };
  setInterval(() => B.refreshNotesBadge(), 5 * 60 * 1000);

  /** Enregistre une nouvelle note (texte et/ou fichier vocal) */
  const saveNote = async ({ content, audio }) => {
    let audio_path = null;
    if (audio) {
      const ext = (audio.name.split('.').pop() || 'webm').replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'webm';
      audio_path = `${B.me.id}/${crypto.randomUUID()}.${ext}`;
      const { error } = await B.sb.storage.from(BUCKET).upload(audio_path, audio, { contentType: audio.type || 'audio/webm' });
      if (error) throw error;
    }
    const row = { content: String(content || '').slice(0, 10000), audio_path,
      audio_seconds: audio?.voiceSeconds ?? null,
      audio_peaks: Array.isArray(audio?.voicePeaks) ? audio.voicePeaks.slice(0, 200).map((x) => Math.round(Math.max(0, Math.min(1, x)) * 100) / 100) : null };
    const { data, error } = await B.sb.from('personal_notes').insert(row).select().single();
    if (error) {
      if (audio_path) B.sb.storage.from(BUCKET).remove([audio_path]).catch(() => {});
      throw error;
    }
    return data;
  };

  const dropReminders = (id) => B.sb.from('reminders').delete().eq('link', `#/notes/${id}`).is('sent_at', null).then(() => {}, () => {});

  const deleteNote = async (n) => {
    if (!(await B.confirm(tr('Supprimer cette note ?'), tr('Supprimer')))) return false;
    await dropReminders(n.id);
    try { await B.deleteRow('personal_notes', n.id); } catch (err) { B.error(err); return false; }
    if (n.audio_path) B.sb.storage.from(BUCKET).remove([n.audio_path]).catch(() => {});
    return true;
  };

  const setReminder = async (n) => {
    const when = await B.pickWhen({ title: tr('Me rappeler cette note…') });
    if (!when) return false;
    await dropReminders(n.id);
    const { error } = await B.sb.from('personal_notes').update({ remind_at: when.toISOString() }).eq('id', n.id);
    if (error) { B.error(error); return false; }
    // La cloche (et la notification) à l'heure dite : livrée par la base (deliver_due, migration 049)
    await B.sb.from('reminders').insert({ text: tr('Note : {t}', { t: noteText(n).slice(0, 400) }), link: `#/notes/${n.id}`, remind_at: when.toISOString() });
    B.toast(tr('Rappel prévu {when}.', { when: when.toLocaleString(B.locale(), { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) }), { type: 'success' });
    return true;
  };
  const clearReminder = async (n) => {
    await dropReminders(n.id);
    await B.sb.from('personal_notes').update({ remind_at: null }).eq('id', n.id);
  };

  // ---------- Vocal : enregistrer (+ transcription si le navigateur sait faire) ----------
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const canTranscribe = () => Boolean(Recognition) && window.BIVOUAC_WEB !== false; // l'app Windows (Electron) n'a pas le service de Google

  /** Lance l'enregistrement dans `box` ; onDone({ file, transcript }) quand la personne a fini */
  const record = (box, onDone) => {
    let transcript = '', rec = null;
    if (canTranscribe() && store.get('notes:transcribe', true) !== false) {
      try {
        rec = new Recognition();
        rec.lang = B.lang === 'en' ? 'en-US' : 'fr-FR';
        rec.continuous = true; rec.interimResults = false;
        rec.onresult = (e) => { for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) transcript += (transcript ? ' ' : '') + e.results[i][0].transcript.trim(); };
        rec.onerror = () => {}; // pas de réseau, micro déjà pris… : la note vocale reste, sans texte
        rec.start();
        setTimeout(() => { try { rec?.stop(); } catch { /* déjà arrêtée */ } }, 6 * 60 * 1000);
      } catch { rec = null; }
    }
    const stopRec = () => new Promise((res) => {
      if (!rec) return res();
      rec.onend = () => res();
      try { rec.stop(); } catch { res(); }
      setTimeout(res, 1500);
    });
    B.recordVoiceNote(box, async (file) => {
      await stopRec();
      onDone({ file, transcript: transcript.trim() });
    });
    B.onLeave(() => { try { rec?.abort(); } catch { /* rien */ } });
  };

  // ---------- Lecture d'une note vocale, sur place ----------
  const playerHtml = (n) => {
    if (!n.audio_path) return '';
    if (B.voicePlayerHtml) {
      return B.voicePlayerHtml({ path: n.audio_path, bucket: BUCKET }, { seconds: n.audio_seconds, person: B.me, peaks: n.audio_peaks });
    }
    return `<audio class="note-audio" controls preload="none" data-note-audio="${esc(n.audio_path)}"></audio>`;
  };
  const bindPlayers = (root) => {
    if (B.bindVoicePlayers) B.bindVoicePlayers(root);
    $$('audio[data-note-audio]', root).forEach((a) => {
      if (a.dataset.ready) return;
      a.dataset.ready = '1';
      const go = async () => {
        if (a.src) return;
        const { data } = await B.sb.storage.from(BUCKET).createSignedUrl(a.dataset.noteAudio, 3600);
        if (data?.signedUrl) { a.src = data.signedUrl; a.play().catch(() => {}); }
      };
      a.addEventListener('play', go, { once: true });
      a.addEventListener('click', go, { once: true });
      a.parentElement?.addEventListener('pointerdown', go, { once: true });
    });
  };

  // ---------- Zone d'écriture (fenêtre « Note rapide » et haut de la page) ----------
  /** Pose la zone d'écriture dans `el` ; onSaved(note) après l'enregistrement */
  const composer = (el, { onSaved, autofocus = false } = {}) => {
    el.innerHTML = `
      <div class="note-compose">
        <textarea id="nc-text" rows="3" maxlength="10000" placeholder="${tr('Notez une idée, un truc à faire, un rappel…')}"></textarea>
        <div class="nc-voice" id="nc-voice"></div>
        <div class="nc-pending hidden" id="nc-pending"></div>
        <div class="nc-actions">
          ${B.canRecordAudio?.() ? `<button type="button" class="btn" id="nc-mic">${icon('mic', 16)} ${tr('Note vocale')}</button>` : ''}
          ${B.canRecordAudio?.() && canTranscribe() ? `<label class="check small nc-tr" title="${tr('La transcription est faite par le service de reconnaissance vocale de votre navigateur (chez Google pour Chrome) : le son lui est envoyé.')}">
            <input type="checkbox" id="nc-tr" ${store.get('notes:transcribe', true) !== false ? 'checked' : ''} /> ${tr('Transcrire')}</label>` : ''}
          <span class="spacer"></span>
          <button type="button" class="btn primary" id="nc-save">${icon('check', 15)} ${tr('Enregistrer')}</button>
        </div>
        <p class="muted small nc-hint">${tr('Privée : vous seul la voyez. Vous pourrez la transformer en tâche, idée, décision ou événement.')}</p>
      </div>`;
    const ta = $('#nc-text', el);
    let audio = null;
    const showPending = () => {
      const p = $('#nc-pending', el);
      p.classList.toggle('hidden', !audio);
      p.innerHTML = audio ? `${icon('mic', 15)} <span>${tr('Note vocale de {d}', { d: B.fmtDuration(audio.voiceSeconds || 0) })}</span>
        <button type="button" class="link small" id="nc-drop">${tr('Retirer')}</button>` : '';
      paintIcons(p);
      $('#nc-drop', el)?.addEventListener('click', () => { audio = null; showPending(); });
    };
    $('#nc-tr', el)?.addEventListener('change', (e) => store.set('notes:transcribe', e.target.checked));
    $('#nc-mic', el)?.addEventListener('click', () => {
      record($('#nc-voice', el), ({ file, transcript }) => {
        audio = file;
        if (transcript) ta.value = (ta.value.trim() ? ta.value.trim() + '\n' : '') + transcript;
        else if (!canTranscribe() && !store.get('notes:no-tr-told')) { // dit une seule fois sur ce poste
          store.set('notes:no-tr-told', true);
          B.toast(tr('Note vocale prête. La transcription n’est pas disponible sur cet appareil.'), { timeout: 5000 });
        }
        showPending();
      });
    });
    $('#nc-save', el).onclick = async (e) => {
      const content = ta.value.trim();
      if (!content && !audio) return ta.focus();
      e.currentTarget.disabled = true;
      try {
        const n = await saveNote({ content, audio });
        ta.value = ''; audio = null; showPending();
        onSaved?.(n);
      } catch (err) { B.error(err); }
      finally { if ($('#nc-save', el)) $('#nc-save', el).disabled = false; }
    };
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) $('#nc-save', el).click(); });
    if (autofocus) setTimeout(() => ta.focus(), 30);
    paintIcons(el);
  };

  B.quickNote = () => {
    const m = B.modal(`<h2>${tr('Note rapide')}</h2><div id="qn-box"></div>
      <div class="actions"><a class="link small" href="#/notes" id="qn-all">${tr('Voir toutes mes notes')}</a><span class="spacer"></span>
        <button class="btn" data-close>${tr('Fermer')}</button></div>`);
    m.classList.add('quick-note');
    $('[data-close]', m).onclick = B.closeModal;
    $('#qn-all', m).onclick = () => B.closeModal();
    composer($('#qn-box', m), { autofocus: true, onSaved: () => {
      B.closeModal();
      B.toast(tr('Note enregistrée dans Mes notes.'), { type: 'success' });
      B.emit?.('notes');
    } });
  };

  // ---------- Convertir une note ----------
  const convert = (n, kind0 = 'task', after = () => {}) => {
    const projects = B.projects.filter((p) => !B.isGuest?.(p.id));
    if (!projects.length) return B.toast(tr('Créez ou rejoignez d’abord un projet.'), { type: 'error' });
    const here = B.lastProjectId && projects.some((p) => p.id === B.lastProjectId) ? B.lastProjectId : projects[0].id;
    const text = n.content?.trim() || '';
    const d = new Date(Date.now() + 864e5 * 2); d.setHours(18, 0, 0, 0);
    const local = new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
    const m = B.modal(`
      <h2>${tr('Transformer la note')}</h2>
      ${text ? `<blockquote class="nv-quote" translate="no">${esc(text.slice(0, 400))}${text.length > 400 ? '…' : ''}</blockquote>` : ''}
      <label>${tr('En…')}</label>
      <div class="nv-kinds" role="radiogroup">${KINDS.map(([k, ic, label]) => `<button type="button" class="nv-kind ${k === kind0 ? 'on' : ''}" data-k="${k}" role="radio" aria-checked="${k === kind0}">${icon(ic, 16)}<span>${tr(label)}</span></button>`).join('')}</div>
      <label for="nv-proj">${tr('Dans le projet')}</label>
      <select id="nv-proj">${projects.map((p) => `<option value="${esc(p.id)}" ${p.id === here ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
      <div id="nv-fields"></div>
      <p class="msg" id="nv-msg"></p>
      <div class="actions"><button class="btn" data-close>${tr('Annuler')}</button><span class="spacer"></span>
        <button class="btn primary" id="nv-go">${tr('Créer')}</button></div>`, { wide: true });
    m.classList.add('note-convert');
    $('[data-close]', m).onclick = B.closeModal;
    let kind = kind0;
    const fields = () => {
      const pid = $('#nv-proj', m).value;
      const who = B.projectMembers(pid);
      const t = esc(firstLine(text)), body = esc(rest(text));
      $('#nv-fields', m).innerHTML = {
        task: `<label>${tr('Titre')}</label><input id="nv-title" maxlength="200" value="${t}" />
          <label>${tr('Description')}</label><textarea id="nv-desc" rows="4" maxlength="5000">${body}</textarea>
          <div class="form-row"><div><label>${tr('Responsable')}</label><select id="nv-who"><option value="">${tr('— Personne —')}</option>
            ${who.map((p) => `<option value="${p.id}" ${p.id === B.me.id ? 'selected' : ''}>${esc(p.display_name)}</option>`).join('')}</select></div>
            <div><label>${tr('Échéance')}</label><input id="nv-due" type="date" /></div></div>`,
        idea: `<label>${tr('L’idée')}</label><input id="nv-title" maxlength="200" value="${t}" />
          <label>${tr('Détails (facultatif)')}</label><textarea id="nv-desc" rows="4" maxlength="5000">${body}</textarea>`,
        decision: `<label>${tr('La question')}</label><input id="nv-title" maxlength="200" value="${t}" />
          <label>${tr('Les choix (2 à 6)')}</label>
          <div class="vote-inputs">${[1, 2, 3, 4, 5, 6].map((k) => `<input class="nv-opt" maxlength="80" placeholder="${tr('Choix {n}', { n: k })}" value="${k === 1 ? esc(tr('Oui')) : k === 2 ? esc(tr('Non')) : ''}" ${k > 3 ? 'hidden' : ''} />`).join('')}</div>
          <label>${tr('Clôture du vote')}</label><input id="nv-until" type="datetime-local" value="${local}" />`,
        event: `<label>${tr('Titre')}</label><input id="nv-title" maxlength="200" value="${t}" />
          <div class="form-row"><div><label>${tr('Date')}</label><input id="nv-day" type="date" value="${isoDay()}" /></div>
            <div><label>${tr('Début (facultatif)')}</label><input id="nv-start" type="time" /></div>
            <div><label>${tr('Fin (facultatif)')}</label><input id="nv-end" type="time" /></div></div>
          <label>${tr('Détails')}</label><textarea id="nv-desc" rows="3" maxlength="5000">${body}</textarea>`,
        atelier: `<label>${tr('Le message')}</label><textarea id="nv-desc" rows="5" maxlength="4000">${esc(text)}</textarea>
          <p class="muted small">${tr('Il part dans l’Atelier IA du projet, à votre nom. Mentionnez une IA (@claude…) pour la solliciter.')}</p>`
      }[kind];
      $('#nv-go', m).textContent = kind === 'atelier' ? tr('Envoyer') : tr('Créer');
    };
    $$('.nv-kind', m).forEach((b) => (b.onclick = () => {
      kind = b.dataset.k;
      $$('.nv-kind', m).forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', String(x === b)); });
      fields();
    }));
    $('#nv-proj', m).onchange = fields;
    fields();

    $('#nv-go', m).onclick = async (e) => {
      const pid = $('#nv-proj', m).value, p = B.project(pid);
      const msg = $('#nv-msg', m);
      const title = $('#nv-title', m)?.value.trim() || '';
      const desc = $('#nv-desc', m)?.value.trim() || '';
      if (kind !== 'atelier' && !title) return (msg.textContent = tr('Il faut un titre.'));
      if (kind === 'atelier' && !desc) return (msg.textContent = tr('Le message est vide.'));
      e.currentTarget.disabled = true;
      try {
        let id = null;
        if (kind === 'task') {
          const assignee = $('#nv-who', m).value || null;
          const { data, error } = await B.sb.from('tasks').insert({ project_id: pid, title, description: desc || null, assignee_id: assignee,
            due_date: $('#nv-due', m).value || null, status: 'todo' }).select().single();
          if (error) throw error;
          id = data?.id;
          if (assignee && assignee !== B.me.id) B.notify(assignee, { projectId: pid, type: 'task', link: `#/p/${pid}/taches`,
            text: tr("{who} t'a confié la tâche « {title} » ({project})", { who: B.me.display_name, title, project: p?.name }) });
          B.loadProjects();
        } else if (kind === 'idea') {
          const { data, error } = await B.sb.from('items').insert({ project_id: pid, type: 'idea', title, body: desc || null }).select().single();
          if (error) throw error;
          id = data?.id;
        } else if (kind === 'decision') {
          const options = $$('.nv-opt', m).map((x) => x.value.trim()).filter(Boolean);
          const until = $('#nv-until', m).value ? new Date($('#nv-until', m).value) : null;
          if (options.length < 2) throw new Error(tr('Il faut au moins deux choix.'));
          if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) throw new Error(tr('Deux choix sont identiques.'));
          if (!until || until <= new Date()) throw new Error(tr('La clôture doit être dans le futur.'));
          const { data, error } = await B.sb.from('items').insert({ project_id: pid, type: 'decision', title, vote_options: options, vote_until: until.toISOString() }).select().single();
          if (error) throw error;
          id = data?.id;
          for (const mem of B.projectMembers(pid)) {
            B.notify(mem.id, { projectId: pid, type: 'vote', refId: id, link: `#/p/${pid}/projet`,
              text: tr('{who} lance un vote dans « {project} » : {title}', { who: B.me.display_name, project: p?.name, title }) });
          }
        } else if (kind === 'event') {
          const day = $('#nv-day', m).value;
          if (!day) throw new Error(tr('Il faut au moins un titre et une date.'));
          const { data, error } = await B.sb.from('events').insert({ project_id: pid, title, day, start_time: $('#nv-start', m).value || null,
            end_time: $('#nv-end', m).value || null, description: desc || null }).select().single();
          if (error) throw error;
          id = data?.id;
        } else if (kind === 'atelier') {
          const { data: ch } = await B.sb.from('channels').select('id').eq('project_id', pid).eq('kind', 'ai').limit(1);
          if (!ch?.[0]) throw new Error(tr('Ce projet n’a pas d’Atelier IA.'));
          const { data, error } = await B.sb.from('messages').insert({ channel_id: ch[0].id, content: desc }).select().single();
          if (error) throw error;
          id = data?.id;
          B.sendPush?.('message', id);
        }
        await dropReminders(n.id);
        const { error } = await B.sb.from('personal_notes').update({ done_at: new Date().toISOString(), converted_kind: kind,
          converted_project: pid, converted_id: id, remind_at: null }).eq('id', n.id);
        if (error) throw error;
        B.closeModal();
        B.toast(tr(BECAME[kind], { p: p?.name || '' }), { type: 'success' });
        after();
      } catch (err) {
        msg.textContent = errText(err);
        if ($('#nv-go', m)) $('#nv-go', m).disabled = false;
      }
    };
  };

  const editNote = (n, after) => {
    const m = B.modal(`<h2>${tr('Modifier la note')}</h2>
      <textarea id="ne-text" rows="6" maxlength="10000">${esc(n.content || '')}</textarea>
      <div class="actions"><button class="btn" data-close>${tr('Annuler')}</button><span class="spacer"></span>
        <button class="btn primary" id="ne-save">${tr('Enregistrer')}</button></div>`);
    $('[data-close]', m).onclick = B.closeModal;
    $('#ne-save', m).onclick = async () => {
      const content = $('#ne-text', m).value.trim();
      if (!content && !n.audio_path) return;
      const { error } = await B.sb.from('personal_notes').update({ content }).eq('id', n.id);
      if (error) return B.error(error);
      B.closeModal(); after();
    };
  };

  // ---------- La page « Mes notes » ----------
  B.pages.notes = async (view, [openId]) => {
    const filter0 = store.get('notes-filter', 'todo');
    view.innerHTML = `
      <div class="page notes-page">
        <div class="page-head"><h1>${tr('Mes notes')}</h1>
          <p class="muted">${tr('Vos idées et rappels pour plus tard, écrits ou à voix haute. Privées : vous seul les voyez.')}</p></div>
        <section class="card" id="notes-new"></section>
        <div class="notes-tools">
          <div class="search-mini">${icon('search', 16)}<input id="notes-q" type="search" placeholder="${tr('Rechercher dans mes notes')}" /></div>
          <div class="seg" role="tablist">${[['todo', 'À traiter'], ['done', 'Traitées'], ['all', 'Toutes']].map(([k, l]) =>
            `<button class="${k === filter0 ? 'on' : ''}" data-f="${k}" role="tab" aria-selected="${k === filter0}">${tr(l)}</button>`).join('')}</div>
        </div>
        <div id="notes-list"><div class="loading">${tr('Chargement…')}</div></div>
      </div>`;
    let notes = [], filter = filter0;
    const list = $('#notes-list', view);

    const card = (n) => {
      const due = n.remind_at && !n.done_at;
      const late = due && new Date(n.remind_at) <= new Date();
      const link = becameLink(n);
      const proj = n.converted_project && B.project(n.converted_project);
      return `<article class="note-card ${n.done_at ? 'done' : ''} ${late ? 'late' : ''}" data-id="${n.id}" id="note-${n.id}">
        ${playerHtml(n)}
        ${n.content?.trim() ? `<div class="note-text" translate="no">${esc(n.content)}</div>` : ''}
        <div class="note-meta muted small">
          <span>${timeAgo(n.created_at)}</span>
          ${due ? `<span class="chip-date ${late ? 'late' : ''}">${icon('clock', 12)} ${esc(new Date(n.remind_at).toLocaleString(B.locale(), { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}</span>` : ''}
          ${n.done_at && n.converted_kind ? `<a class="note-became" href="${link || '#/notes'}">${icon('check', 12)} ${esc(tr(BECAME[n.converted_kind], { p: proj?.name || tr('un projet') }))}</a>`
            : n.done_at ? `<span>${icon('check', 12)} ${tr('Traitée')}</span>` : ''}
        </div>
        <div class="note-actions">
          ${n.done_at ? `<button class="btn small" data-a="reopen">${tr('Remettre à traiter')}</button>` : `
            <button class="btn small primary" data-a="convert">${icon('spark', 14)} ${tr('Transformer')}</button>
            <button class="btn small" data-a="remind">${icon('clock', 14)} ${due ? tr('Changer le rappel') : tr('Me la rappeler')}</button>
            ${due ? `<button class="link small" data-a="unremind">${tr('Sans rappel')}</button>` : ''}
            <button class="btn small" data-a="done">${icon('check', 14)} ${tr('Traitée')}</button>`}
          <span class="spacer"></span>
          ${n.done_at ? '' : `<button class="icon-btn" data-a="edit" title="${tr('Modifier')}" aria-label="${tr('Modifier')}">${icon('edit', 16)}</button>`}
          <button class="icon-btn" data-a="delete" title="${tr('Supprimer')}" aria-label="${tr('Supprimer')}">${icon('trash', 16)}</button>
        </div>
      </article>`;
    };

    const render = () => {
      if (!$('#notes-list', view)) return;
      const q = ($('#notes-q', view).value || '').trim().toLowerCase();
      const shown = notes.filter((n) => (filter === 'all' || (filter === 'done' ? n.done_at : !n.done_at))
        && (!q || (n.content || '').toLowerCase().includes(q)));
      // À traiter : les rappels passés d'abord, puis les plus récentes
      if (filter !== 'done') shown.sort((a, b) => {
        const late = (n) => Number(Boolean(n.remind_at && !n.done_at && new Date(n.remind_at) <= new Date()));
        return (late(b) - late(a)) || String(b.created_at).localeCompare(String(a.created_at));
      });
      list.innerHTML = shown.length ? shown.map(card).join('')
        : `<div class="empty">${icon('edit', 28)}<p>${q ? tr('Aucune note ne correspond.') : filter === 'done' ? tr('Aucune note traitée pour l’instant.') : tr('Rien à traiter. Notez ici ce qui vous passe par la tête : vous le transformerez plus tard.')}</p></div>`;
      paintIcons(list);
      bindPlayers(list);
      if (openId) {
        const el = $(`#note-${CSS.escape(openId)}`, list);
        if (el) { el.classList.add('flash'); el.scrollIntoView({ block: 'center' }); }
        openId = null;
      }
    };
    const reload = async () => { try { notes = await load(); } catch (err) { return B.error(err); } render(); B.refreshNotesBadge(); };

    composer($('#notes-new', view), { onSaved: (n) => { notes.unshift(n); if (filter === 'done') filter = 'todo'; render(); } });
    $('#notes-q', view).addEventListener('input', debounce(render, 150));
    $$('.seg [data-f]', view).forEach((b) => (b.onclick = () => {
      filter = b.dataset.f; store.set('notes-filter', filter);
      $$('.seg [data-f]', view).forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', String(x === b)); });
      render();
    }));
    list.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-a]');
      if (!b) return;
      const n = notes.find((x) => x.id === b.closest('[data-id]')?.dataset.id);
      if (!n) return;
      const a = b.dataset.a;
      if (a === 'convert') return convert(n, 'task', reload);
      if (a === 'remind') { if (await setReminder(n)) reload(); return; }
      if (a === 'unremind') { await clearReminder(n); return reload(); }
      if (a === 'edit') return editNote(n, reload);
      if (a === 'delete') { if (await deleteNote(n)) { notes = notes.filter((x) => x.id !== n.id); render(); } return; }
      if (a === 'done' || a === 'reopen') {
        if (a === 'done') await dropReminders(n.id);
        const { error } = await B.sb.from('personal_notes').update(a === 'done' ? { done_at: new Date().toISOString(), remind_at: null } : { done_at: null }).eq('id', n.id);
        if (error) return B.error(error);
        reload();
      }
    });
    await reload();
  };
})();
