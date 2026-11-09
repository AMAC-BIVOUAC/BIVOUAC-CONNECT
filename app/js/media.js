// Sélecteur partagé : emojis hors ligne ; GIF / mèmes recherchés explicitement sur Commons.
// Les images sélectionnées deviennent des pièces jointes privées, pas des liens externes chargés chez le destinataire.
(() => {
  const normalize = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const groups = [
    ['Visages', 'Faces', '😀 😃 😄 😁 😆 😅 😂 🤣 😊 🙂 🙃 😉 😌 😍 🥰 😘 😗 😙 😚 😋 😛 😝 😜 🤪 🤨 🧐 🤓 😎 🥸 🤩 🥳 😏 😒 😞 😔 😟 😕 🙁 ☹️ 😣 😖 😫 😩 🥺 😢 😭 😤 😠 😡 🤬 🤯 😳 🥵 🥶 😱 😨 😰 😥 😓 🤗 🤔 🫣 🤭 🫢 🫡 🤫 🫠 🤥 😶 😐 😑 😬 🙄 😯 😦 😧 😮 😲 🥱 😴 🤤 😪 😵 🤐 🥴 🤢 🤮 🤧 😷 🤒 🤕 🤑 🤠 😈 👿 👻 💀 ☠️ 👽 🤖 💩 🎃 😺 😸 😹 😻 😼 😽 🙀 😿 😾'],
    ['Gestes et cœurs', 'Hands and hearts', '👋 🤚 🖐️ ✋ 🖖 👌 🤌 🤏 ✌️ 🤞 🫰 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 🫶 👐 🤲 🤝 🙏 💪 🫵 ✍️ 💅 ❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 🩷 🩵 🩶 💔 ❤️‍🔥 💕 💞 💓 💗 💖 💘 💝 💟 💯 💢 💥 💫 💦 💤'],
    ['Nature et animaux', 'Nature and animals', '🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🐔 🐧 🐦 🐤 🦆 🦉 🦋 🐝 🐞 🐢 🐙 🐬 🐳 🐟 🦄 🐉 🌵 🎄 🌲 🌳 🌴 🌱 🌿 ☘️ 🍀 🍁 🍂 🍃 🌸 🌺 🌻 🌹 🌷 🌼 🌞 🌝 🌚 🌙 ⭐ 🌟 ✨ ⚡ 🔥 🌈 ☀️ ⛅ ☁️ 🌧️ ❄️ ☃️ 💨 💧 🌊'],
    ['Objets et activités', 'Objects and activities', '🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🍒 🍑 🍍 🥑 🥦 🥕 🌽 🥐 🍞 🧀 🥚 🍔 🍟 🍕 🌮 🍜 🍣 🍙 🍰 🎂 🍫 🍿 ☕ 🍵 🧋 🍺 🍷 🥂 🏕️ 🏠 🏢 🏔️ 🏖️ 🚗 🚲 🚂 ✈️ 🚀 🛸 ⚽ 🏀 🏈 🎾 🏓 🏸 🏆 🥇 🎮 🎲 🎯 🎸 🎵 🎶 🎤 🎧 🎬 🎨 🎁 🎈 🎉 🎊 📚 📖 ✏️ 📝 💻 📱 💡 💰 💎 🛠️ 🔑 🔒 📎 📅 📌 📍 🔔 📢 ✉️ 📦 ⏰'],
    ['Symboles', 'Symbols', '✅ ☑️ ✔️ ❌ ❎ ⚠️ ⛔ 🚫 ❓ ❗ ⁉️ ‼️ ➕ ➖ ➗ ✖️ ♻️ 🔄 🔃 ➡️ ⬅️ ⬆️ ⬇️ ↗️ ↘️ ↙️ ↖️ ▶️ ⏸️ ⏹️ 🔴 🟠 🟡 🟢 🔵 🟣 ⚫ ⚪ 🟤 🟧 🟨 🟩 🟦 🟪 🇫🇷 🇬🇧 🇺🇸 🇯🇵 🇪🇺 🏳️‍🌈 🏴‍☠️']
  ];
  const aliases = {
    '😀': 'sourire smile heureux happy', '😄': 'rire laugh heureux happy', '😂': 'rire lol mdr laugh', '🤣': 'rire lol mdr laugh',
    '😊': 'sourire smile heureux happy', '😍': 'amour love', '🥰': 'amour love', '😭': 'pleurer triste cry sad',
    '😢': 'triste sad pleurer cry', '😡': 'colere angry', '🤔': 'reflechir thinking question', '😴': 'dormir sleep fatigue tired',
    '👍': 'pouce oui ok merci thumb yes', '👎': 'pouce non thumb no', '👏': 'bravo clap', '🙏': 'merci thank prier pray',
    '❤️': 'amour love coeur heart', '🔥': 'feu fire', '🎉': 'fete party bravo', '🚀': 'fusee rocket', '✅': 'oui ok yes fait done',
    '🐱': 'chat cat', '🐶': 'chien dog', '☕': 'cafe coffee', '🏕️': 'bivouac camping', '💩': 'caca poop', '👀': 'yeux eyes'
  };
  B.emojis = groups.flatMap(([fr, en, chars], group) => chars.split(' ').map(emoji => ({ emoji, group, keywords: normalize(`${fr} ${en} ${aliases[emoji] || ''} ${emoji}`) })));
  B.insertComposerText = (ta, text) => {
    if (!ta.isConnected || ta.disabled) return false;
    const start = ta.selectionStart ?? ta.value.length, end = ta.selectionEnd ?? start;
    if (ta.maxLength > 0 && ta.value.length - (end - start) + text.length > ta.maxLength) {
      B.toast(tr('Le message est trop long.'), { type: 'error' }); return false;
    }
    ta.setRangeText(text, start, end, 'end');
    ta.dispatchEvent(new Event('input', { bubbles: true })); ta.focus(); return true;
  };
  const safeImage = url => { try { const u = new URL(url); return u.protocol === 'https:' && u.hostname === 'upload.wikimedia.org'; } catch { return false; } };
  const plain = s => { const doc = new DOMParser().parseFromString(String(s || ''), 'text/html'); return doc.body.textContent.trim(); };

  B.openMediaPicker = ({ textarea, onFiles, onEmoji, emojisOnly = false }) => {
    const m = B.modal(`<div class="media-picker"><div class="media-head"><h2>${tr('Smileys, GIF et mèmes')}</h2><button type="button" class="icon-btn" data-media-close aria-label="${tr('Fermer')}">×</button></div>
      <div class="media-tabs"><button type="button" class="pill on" data-media-tab="emoji">${tr('Smileys')}</button>${emojisOnly ? '' : `<button type="button" class="pill" data-media-tab="gif">GIF</button><button type="button" class="pill" data-media-tab="meme">${tr('Mèmes')}</button>`}</div>
      <form class="media-search"><input maxlength="100" aria-label="${tr('Rechercher')}" placeholder="${tr('Rechercher')}"/><button class="btn" type="submit">${tr('Rechercher')}</button></form>
      <div class="media-categories"></div><p class="media-source muted small"></p><div class="media-results" aria-live="polite"></div><div class="media-preview"></div>
      ${emojisOnly ? '' : `<button type="button" class="btn" data-media-upload>${tr('Importer mon GIF ou mon mème')}</button><input class="hidden media-upload" type="file" accept="image/gif,image/png,image/jpeg,image/webp" multiple />`}</div>`);
    const input = $('.media-search input', m), results = $('.media-results', m), preview = $('.media-preview', m);
    let tab = 'emoji', category = -1, seq = 0, abort;
    const alive = () => m.contains(results) && !$('#modal-backdrop').classList.contains('hidden') && (!textarea || textarea.isConnected);
    const close = () => { abort?.abort(); B.closeModal(); textarea?.focus(); };
    $('[data-media-close]', m).onclick = close;
    B.onLeave(() => { abort?.abort(); if (m.contains(results)) B.closeModal(); });
    const categories = $('.media-categories', m);
    const paintEmojis = () => {
      categories.innerHTML = [tr('Tous'), ...groups.map(g => tr(g[0]))].map((name, i) => `<button type="button" class="pill ${category === i - 1 ? 'on' : ''}" data-category="${i - 1}">${esc(name)}</button>`).join('');
      const q = normalize(input.value.trim());
      const list = B.emojis.filter(e => (category < 0 || e.group === category) && (!q || e.keywords.includes(q)));
      results.className = 'media-results emoji-grid';
      results.innerHTML = list.map(e => `<button type="button" data-emoji-pick="${e.emoji}" title="${esc(aliases[e.emoji] || (B.lang === 'en' ? groups[e.group][1] : groups[e.group][0]))}" aria-label="${esc(e.emoji + ' ' + (aliases[e.emoji] || groups[e.group][0]))}">${e.emoji}</button>`).join('') || `<p>${tr('Aucun résultat.')}</p>`;
    };
    categories.onclick = e => { const b = e.target.closest('[data-category]'); if (b) { category = Number(b.dataset.category); paintEmojis(); } };
    const search = async () => {
      if (tab === 'emoji') return paintEmojis();
      const current = ++seq; abort?.abort(); const controller = new AbortController(); abort = controller;
      const timeout = setTimeout(() => controller.abort(), 15000);
      results.className = 'media-results media-grid'; results.textContent = tr('Chargement…'); preview.innerHTML = '';
      const url = new URL('https://commons.wikimedia.org/w/api.php');
      const query = input.value.trim() || (tab === 'gif' ? 'funny cat' : 'meme');
      url.search = new URLSearchParams({ action: 'query', format: 'json', origin: '*', generator: 'search', gsrnamespace: '6',
        gsrsearch: `${query} ${tab === 'gif' ? 'filemime:image/gif' : 'meme filetype:bitmap'}`, gsrlimit: '18', prop: 'imageinfo',
        iiprop: 'url|mime|size|extmetadata', iiurlwidth: '240' });
      try {
        const response = await fetch(url, { signal: abort.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
        if (!response.ok) throw new Error('Commons');
        const data = await response.json(); if (data.error) throw new Error('Commons');
        if (!alive() || current !== seq) return;
        const items = Object.values(data.query?.pages || {}).sort((a,b) => a.index - b.index).map(p => ({ title: p.title.replace(/^File:/, ''), ...p.imageinfo?.[0] }))
          .filter(f => safeImage(f.url) && (tab === 'gif' ? f.mime === 'image/gif' : /^image\/(png|jpeg|gif|webp)$/.test(f.mime)) && f.size <= B.MAX_FILE_MB * 1024 * 1024);
        results.innerHTML = items.map((f, i) => `<button type="button" data-result="${i}"><img src="${esc(safeImage(f.thumburl) ? f.thumburl : f.url)}" alt="${esc(f.title)}" loading="lazy" referrerpolicy="no-referrer"/><span>${esc(f.title)}</span></button>`).join('') || `<p>${tr('Aucun résultat.')}</p>`;
        results.onclick = e => { const b = e.target.closest('[data-result]'); if (b) choose(items[Number(b.dataset.result)]); };
      } catch { if (alive() && current === seq) results.textContent = tr('Le catalogue est indisponible. Vous pouvez importer votre image.'); }
      finally { clearTimeout(timeout); }
    };
    const choose = f => {
      const author = plain(f.extmetadata?.Artist?.value).slice(0, 180), license = plain(f.extmetadata?.LicenseShortName?.value).slice(0, 80);
      preview.innerHTML = `<img src="${esc(f.url)}" alt="${esc(f.title)}" referrerpolicy="no-referrer"/><p>${esc(f.title)} · ${esc(author)} · ${esc(license)}</p><p><a class="ext" href="${esc(f.descriptionurl)}">Wikimedia Commons</a></p><button type="button" class="btn primary" data-use-media>${tr('Ajouter au message')}</button>`;
      $('[data-use-media]', preview).onclick = async e => {
        const btn = e.currentTarget; btn.disabled = true;
        const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 20000);
        try {
          const response = await fetch(f.url, { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
          if (!response.ok) throw new Error('Image');
          const blob = await response.blob();
          if (!/^image\/(gif|png|jpeg|webp)$/.test(blob.type) || blob.size > B.MAX_FILE_MB * 1024 * 1024) throw new Error('Image');
          if (!alive()) return;
          // L'attribution reste avec le message et est visible dans le brouillon avant l'envoi.
          const credit = `\n${f.title} — ${author} · ${license} · ${f.descriptionurl}\n`;
          if (textarea.maxLength > 0 && textarea.value.length + credit.length > textarea.maxLength) throw new Error(tr('Le message est trop long.'));
          const file = new File([blob], f.title.slice(-200), { type: blob.type });
          if (onFiles([file]) === false) return;
          textarea.setSelectionRange(textarea.value.length, textarea.value.length);
          B.insertComposerText(textarea, credit); close();
        } catch { if (alive()) B.toast(tr('Impossible de charger cette image. Réessayez ou importez un fichier.'), { type: 'error' }); }
        finally { clearTimeout(timer); btn.disabled = false; }
      };
    };
    const switchTab = next => {
      tab = next; ++seq; abort?.abort(); input.value = ''; preview.innerHTML = ''; results.onclick = null;
      $$('[data-media-tab]', m).forEach(b => b.classList.toggle('on', b.dataset.mediaTab === tab));
      categories.hidden = tab !== 'emoji';
      $('.media-source', m).textContent = tab === 'emoji' ? '' : tr('Recherche sur Wikimedia Commons : seuls vos mots de recherche sont envoyés. Les résultats sont proposés par un service externe.');
      // Aucune recherche distante à l'ouverture du sélecteur : seulement après choix GIF / Mèmes.
      search();
    };
    $$('[data-media-tab]', m).forEach(b => { b.onclick = () => switchTab(b.dataset.mediaTab); });
    results.addEventListener('click', e => { const b = e.target.closest('[data-emoji-pick]'); if (!b) return;
      if (onEmoji) { onEmoji(b.dataset.emojiPick); close(); } else if (B.insertComposerText(textarea, b.dataset.emojiPick)) close();
    });
    $('.media-search', m).onsubmit = e => { e.preventDefault(); search(); };
    input.oninput = () => { if (tab === 'emoji') paintEmojis(); };
    if (!emojisOnly) {
      $('[data-media-upload]', m).onclick = () => $('.media-upload', m).click();
      $('.media-upload', m).onchange = e => { if (onFiles([...e.target.files]) !== false) close(); };
    }
    paintEmojis();
  };

  B.bindMediaComposer = (form, ta, onFiles) => {
    const btn = h(`<button type="button" class="icon-btn media-compose" title="${tr('Smileys, GIF et mèmes')}" aria-label="${tr('Smileys, GIF et mèmes')}">${icon('smile', 20)}</button>`);
    ta.before(btn); btn.onclick = () => B.openMediaPicker({ textarea: ta, onFiles });
    const urls = new Map();
    B.onLeave(() => { urls.forEach(url => URL.revokeObjectURL(url)); urls.clear(); });
    return (container, files) => {
      for (const [file, url] of urls) if (!files.includes(file)) { URL.revokeObjectURL(url); urls.delete(file); }
      [...container.children].forEach((chip, i) => {
        const f = files[i]; if (!f || !/^image\/(gif|png|jpeg|webp)$/.test(f.type)) return;
        if (!urls.has(f)) urls.set(f, URL.createObjectURL(f));
        const img = document.createElement('img'); img.src = urls.get(f); img.alt = f.name; img.className = 'pending-image'; chip.prepend(img);
      });
    };
  };
  B.messageImage = (file, bucket) => /^image\/(gif|png|jpeg|webp)$/.test(file.mime || '')
    ? `<img class="message-image" data-media-path="${esc(file.path || file.storage_path)}" data-media-bucket="${bucket}" alt="${esc(file.name)}" loading="lazy"/>` : '';
  B.watchMessageImages = root => {
    const paint = () => $$('img[data-media-path]:not([data-loading])', root).forEach(async img => {
      img.dataset.loading = 'true';
      const { data, error } = await B.sb.storage.from(img.dataset.mediaBucket).createSignedUrl(img.dataset.mediaPath, 3600);
      if (!img.isConnected) return;
      if (error || !data?.signedUrl) img.hidden = true;
      else { img.referrerPolicy = 'no-referrer'; img.src = data.signedUrl; img.onerror = () => { img.hidden = true; }; }
    });
    const observer = new MutationObserver(paint); observer.observe(root, { subtree: true, childList: true }); paint();
    B.onLeave(() => observer.disconnect());
  };
})();
