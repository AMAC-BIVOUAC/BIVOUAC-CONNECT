// =====================================================================
// planifier.js — rappels et messages programmés (v0.8.82, migration 049)
//   B.pickWhen({ title, person })  : fenêtre « Quand ? » (dans 1 h, ce soir, demain 9 h, lundi 9 h, à son réveil, une date)
//   B.wakeUpTime(person)           : prochain 8 h chez la personne (son fuseau), pour « Envoyer à son réveil »
//   B.addReminder({ text, link, projectId }) : « Me le rappeler » ; la base le livre dans la cloche à l'heure dite
//   B.bindScheduler(form, ta, { channelId | recipientId, person, onSent }) : bouton horloge à côté d'Envoyer
//     + liste « Messages programmés » au-dessus de la zone d'écriture (Annuler).
// Les envois se font côté serveur (pg_cron, chaque minute), au nom de l'auteur, même app fermée.
// =====================================================================

/** Prochain 8 h (heure de la personne) ; null si elle n'a pas de fuseau */
B.wakeUpTime = (person, now = new Date()) => {
  const off = B.tzOffset?.(person?.timezone, now);
  if (off == null) return null;
  const local = new Date(now.getTime() + off * 60000); // champs UTC = heure chez elle
  let target = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 8, 0) - off * 60000;
  if (target <= now.getTime() + 60000) target += 24 * 3600000;
  return new Date(target);
};

/** « mardi 26 novembre à 09:00 » */
B.whenText = (d) => new Date(d).toLocaleString(B.locale(), { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

const at = (days, h, m = 0) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(h, m, 0, 0); return d; };

/** Fenêtre « Quand ? » ; résout une Date (dans le futur) ou null */
B.pickWhen = ({ title, person = null } = {}) => new Promise((resolve) => {
  const now = new Date();
  const choices = [
    [tr('Dans 1 heure'), new Date(now.getTime() + 3600000)],
    [tr('Dans 3 heures'), new Date(now.getTime() + 3 * 3600000)],
    ...(now.getHours() < 17 ? [[tr('Ce soir à 18 h'), at(0, 18)]] : []),
    [tr('Demain à 9 h'), at(1, 9)],
    [tr('Lundi à 9 h'), at(((8 - now.getDay()) % 7) || 7, 9)]
  ];
  const lt = person && B.localTime?.(person);
  const wake = person && lt?.night ? B.wakeUpTime(person) : null;
  if (wake) choices.unshift([tr('À son réveil (8 h chez {name})', { name: person.display_name }), wake, true]);
  const local = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const m = B.modal(`<h2>${esc(title || tr('Quand ?'))}</h2>
    <div class="when-list">${choices.map(([label, d, star], i) => `<button type="button" class="when-opt ${star ? 'star' : ''}" data-i="${i}">
      <strong>${star ? icon('moon', 14) + ' ' : ''}${esc(label)}</strong><small>${esc(B.whenText(d))}</small></button>`).join('')}</div>
    <form class="when-custom"><label for="when-at">${tr('Ou choisir une date et une heure')}</label>
      <div class="when-row"><input id="when-at" type="datetime-local" min="${local(new Date(now.getTime() + 120000))}" value="${local(at(1, 9))}" required />
      <button class="btn primary" type="submit">${tr('Valider')}</button></div></form>
    <div class="actions"><button type="button" class="btn" data-close>${tr('Annuler')}</button></div>`);
  $('[data-close]', m).onclick = () => { B.closeModal(); resolve(null); };
  $$('.when-opt', m).forEach((b) => (b.onclick = () => { B.closeModal(); resolve(choices[Number(b.dataset.i)][1]); }));
  $('.when-custom', m).onsubmit = (e) => {
    e.preventDefault();
    const d = new Date($('#when-at', m).value);
    if (!(d > new Date())) return B.toast(tr('Choisissez un moment dans le futur.'), { type: 'error' });
    B.closeModal(); resolve(d);
  };
});

/** « Me le rappeler » : choisit le moment, puis la base le livre dans la cloche */
B.addReminder = async ({ text, link = null, projectId = null }) => {
  const when = await B.pickWhen({ title: tr('Me le rappeler…') });
  if (!when) return false;
  const { error } = await B.sb.from('reminders').insert({ text: String(text).slice(0, 500), link, project_id: projectId, remind_at: when.toISOString() });
  if (error) { B.error(error); return false; }
  B.toast(tr('Rappel prévu {when}.', { when: B.whenText(when) }), { type: 'success' });
  return true;
};

/**
 * Bouton « Programmer l'envoi » à côté d'Envoyer + la liste des messages programmés de cette conversation.
 * target = { channelId } (salon d'équipe) ou { recipientId, person } (message privé).
 */
B.bindScheduler = (form, ta, { channelId = null, recipientId = null, person = null, hasFiles = () => false, replyTo = () => null } = {}) => {
  const send = $('button[type=submit]', form);
  const btn = h(`<button type="button" class="icon-btn schedule-btn" title="${esc(tr('Programmer l’envoi'))}" aria-label="${esc(tr('Programmer l’envoi'))}">${icon('clock', 18)}</button>`);
  send.before(btn);
  const bar = h('<div class="scheduled-bar hidden"></div>');
  form.prepend(bar);
  let list = [];
  const load = async () => {
    let q = B.sb.from('scheduled_messages').select('*').is('sent_at', null).order('send_at');
    q = channelId ? q.eq('channel_id', channelId) : q.eq('recipient_id', recipientId);
    const { data, error } = await q;
    if (error) return; // migration 049 pas encore là : rien à montrer
    list = data || [];
    paint();
  };
  const paint = () => {
    if (!form.isConnected) return;
    bar.classList.toggle('hidden', !list.length);
    bar.innerHTML = list.length ? `<details><summary>${icon('clock', 14)} ${tr(list.length > 1 ? '{n} messages programmés' : '{n} message programmé', { n: list.length })}</summary>
      ${list.map((x) => `<div class="sched-row"><span class="sched-when">${esc(B.whenText(x.send_at))}</span>
        <span class="sched-text" translate="no">${esc(x.content.replace(/\s+/g, ' ').slice(0, 90))}</span>
        ${x.error ? `<span class="sched-err">${tr('Non envoyé')}</span>` : ''}
        <button type="button" class="link small" data-sched-cancel="${x.id}">${tr('Annuler')}</button></div>`).join('')}</details>` : '';
    paintIcons(bar);
  };
  bar.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-sched-cancel]');
    if (!b) return;
    const row = list.find((x) => x.id === b.dataset.schedCancel);
    const { error } = await B.sb.from('scheduled_messages').delete().eq('id', b.dataset.schedCancel);
    if (error) return B.error(error);
    list = list.filter((x) => x.id !== b.dataset.schedCancel);
    paint();
    // on rend le texte, pour le modifier ou l'envoyer tout de suite
    if (row && !ta.value.trim()) { ta.value = row.content; ta.dispatchEvent(new Event('input', { bubbles: true })); }
    B.toast(tr('Envoi programmé annulé.'), { timeout: 2500 });
  });
  btn.onclick = async () => {
    const content = ta.value.trim();
    if (!content) return B.toast(tr('Écrivez d’abord le message à programmer.'), { type: 'error' });
    if (hasFiles()) return B.toast(tr('Un message programmé ne peut pas encore contenir de fichier : envoyez les fichiers tout de suite.'), { type: 'error', timeout: 6000 });
    const when = await B.pickWhen({ title: tr('Programmer l’envoi'), person });
    if (!when) return;
    const row = { content: content.slice(0, 4000), send_at: when.toISOString(), ...(channelId ? { channel_id: channelId } : { recipient_id: recipientId }) };
    const r = replyTo();
    if (r && channelId) row.reply_to = r;
    const { data, error } = await B.sb.from('scheduled_messages').insert(row).select().single();
    if (error) return B.error(error);
    ta.value = '';
    B.grammarReset?.(ta);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    list.push(data); list.sort((a, b) => a.send_at.localeCompare(b.send_at)); paint();
    B.toast(tr('Message programmé {when}.', { when: B.whenText(when) }), { type: 'success' });
  };
  load();
  const timer = setInterval(load, 60000); // un message parti disparaît de la liste
  B.onLeave(() => clearInterval(timer));
  return { reload: load };
};
