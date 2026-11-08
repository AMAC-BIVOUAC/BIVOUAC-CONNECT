// =====================================================================
// ai.js (fenêtre) — tout ce qui concerne les IA côté interface
//   - mes IA branchées (clés stockées chiffrées sur CE PC par main.js)
//   - faire travailler mon IA dans l'Atelier
//   - recevoir / accepter / refuser les demandes des autres sur mon IA
// =====================================================================

B.myProviders = []; // [{ id, label, keyHelp, hasKey }]
B.modelCache = {};

B.loadMyProviders = async () => {
  B.myProviders = await window.bivouac.listProviders();
  // On publie seulement la LISTE des IA branchées (jamais les clés) pour que
  // les autres puissent proposer "@moi Claude".
  const ids = B.myProviders.filter((p) => p.hasKey).map((p) => p.id).sort();
  const current = [...(B.me.ai_providers || [])].sort();
  if (ids.join() !== current.join()) {
    await B.updateMe({ ai_providers: ids });
    if (B.projects.length) await B.loadProjects();
  }
  return B.myProviders;
};

B.hasProvider = (id) => B.myProviders.some((p) => p.id === id && p.hasKey);

B.models = async (provider) => {
  if (!B.modelCache[provider]) B.modelCache[provider] = await window.bivouac.listModels(provider);
  return B.modelCache[provider];
};

// ---------------------------------------------------------------------
// Choix du modèle (clés API seulement : avec le connecteur, le modèle se choisit dans l'app Claude)
// Par défaut : le MOINS CHER du fournisseur (décision du 2026-11-04). Changeable dans Paramètres.
// Les noms de modèles évoluent : listes à tenir à jour (mots-clés, du moins cher au plus cher).
// ---------------------------------------------------------------------

/** Modèles les moins chers, par fournisseur, dans l'ordre de préférence */
const CHEAPEST = {
  anthropic: [/haiku/],
  openai: [/luna/, /nano/, /(?:^|[-_.])mini(?:$|[-_.])/],
  mistral: [/ministral/, /mistral-small/, /small/, /tiny/],
  gemini: [/flash-lite/, /flash/],
  xai: [/(?:^|[-_.])mini(?:$|[-_.])/, /fast/],
  deepseek: [/^deepseek-chat$/, /chat/],
  perplexity: [/^sonar$/]
};
// « mini » seulement comme mot entier (sinon « gemini » serait classé économique)
const ECO = /(haiku|luna|nano|(?:^|[-_.\/])mini(?:$|[-_.])|lite|small|tiny|flash|ministral|deepseek-chat|^sonar$|\b\d{1,2}b\b)/i;
const TOP = /(opus|fable|astra|ultra|large|deep-research|reasoner|reasoning|\bpro\b|-pro|pro-|\bmax\b|\bo\d\b)/i;
const DATED = /(\d{4}-\d{2}-\d{2}|\d{8})/;

/** Gamme d'un modèle d'après son nom : 'eco' (économique), 'mid' (équilibré), 'top' (puissant, plus cher) */
B.modelTier = (provider, id) => {
  if ((CHEAPEST[provider] || []).some((re) => re.test(id)) || ECO.test(id)) return 'eco';
  if (TOP.test(id)) return 'top';
  return 'mid';
};
B.tierLabel = (tier) => ({ eco: tr('économique'), mid: tr('équilibré'), top: tr('puissant, plus cher') }[tier]);

/** Le modèle le moins cher d'une liste (versions sans date de préférence), sinon le premier */
B.cheapestModel = (provider, list) => {
  const pick = (re) => {
    const found = list.filter((id) => re.test(id));
    return found.find((id) => !DATED.test(id)) || found[0];
  };
  for (const re of [...(CHEAPEST[provider] || []), ECO]) {
    const m = pick(re);
    if (m) return m;
  }
  return list[0];
};

/** Modèle utilisé pour une IA : celui choisi dans Paramètres s'il existe encore, sinon le moins cher */
B.modelFor = async (provider) => {
  const saved = store.get(`model:${provider}`);
  let list;
  try { list = await B.models(provider); } catch (err) { if (saved) return saved; throw err; }
  if (saved && list.includes(saved)) return saved;
  if (saved) store.set(`model:${provider}`, null); // modèle retiré par le fournisseur : retour au moins cher
  return B.cheapestModel(provider, list);
};

/** Contexte du projet transmis à l'IA (objectifs, décisions, idées) */
async function projectContext(projectId) {
  const p = B.project(projectId);
  const { data } = await B.sb.from('items').select('type, title, done').eq('project_id', projectId).limit(60);
  const pick = (t) => (data || []).filter((i) => i.type === t).map((i) => i.title).slice(0, 15);
  return {
    projectName: p?.name || 'Projet',
    projectDescription: p?.description || '',
    objectives: pick('objective'),
    decisions: pick('decision'),
    ideas: pick('idea')
  };
}

/** 30 derniers messages de l'Atelier, pour que l'IA suive la conversation */
async function atelierHistory(channelId) {
  const { data } = await B.sb.from('messages')
    .select('author_id, content, is_ai, ai_provider')
    .eq('channel_id', channelId)
    .order('created_at', { ascending: false })
    .limit(30);
  return (data || []).reverse().map((m) => {
    const author = B.person(m.author_id).display_name;
    return {
      author,
      isAi: m.is_ai,
      label: m.is_ai ? `${PROVIDERS[m.ai_provider]?.label || 'IA'} (${author})` : author,
      content: m.content.slice(0, 2000)
    };
  });
}

/**
 * Fait répondre MON IA dans l'Atelier d'un projet (avec MA clé).
 * askedById = la personne qui a posé la question (moi, ou quelqu'un dont j'ai accepté la demande)
 */
B.runMyAi = async ({ provider, projectId, channelId, question, askedById }) => {
  const model = await B.modelFor(provider);
  const [context, history] = await Promise.all([projectContext(projectId), atelierHistory(channelId)]);
  const answer = await window.bivouac.askAi({
    provider,
    model,
    ownerName: B.me.display_name,
    context,
    history,
    askedBy: B.person(askedById).display_name,
    question
  });
  const { data, error } = await B.sb.from('messages').insert({
    channel_id: channelId,
    content: answer,
    is_ai: true,
    ai_provider: provider,
    ai_model: model,
    via: 'api',
    requested_by: askedById
  }).select().single();
  if (error) throw error;
  return data;
};

// ---------------------------------------------------------------------
// Demandes sur l'IA de quelqu'un d'autre
// ---------------------------------------------------------------------

/** J'envoie une demande : "@amaury Claude trouve-moi…" */
B.requestAi = async ({ targetId, provider, projectId, channelId, prompt }) => {
  const { data, error } = await B.sb.from('ai_requests').insert({
    project_id: projectId, channel_id: channelId, target_id: targetId, provider, prompt
  }).select().single();
  if (error) throw error;
  await B.notify(targetId, {
    projectId,
    type: 'ai_request',
    text: tr('{who} veut utiliser ton {ai} : « {prompt} »', { who: B.me.display_name, ai: PROVIDERS[provider].label, prompt: prompt.slice(0, 160) }),
    link: `#/p/${projectId}/atelier`,
    refId: data.id
  });
  return data;
};

/** J'accepte une demande : MON application appelle MON IA avec MA clé */
B.acceptRequest = async (req) => {
  if (!B.hasProvider(req.provider)) {
    throw new Error(tr("Vous n'avez plus de clé {ai} branchée (Paramètres).", { ai: PROVIDERS[req.provider].label }));
  }
  await B.sb.from('ai_requests').update({ status: 'accepted', updated_at: new Date().toISOString() }).eq('id', req.id);
  try {
    const msg = await B.runMyAi({
      provider: req.provider, projectId: req.project_id, channelId: req.channel_id,
      question: req.prompt, askedById: req.requester_id
    });
    await B.sb.from('ai_requests').update({ status: 'done', result_message_id: msg.id, updated_at: new Date().toISOString() }).eq('id', req.id);
    await B.notify(req.requester_id, {
      projectId: req.project_id, type: 'ai_answer',
      text: tr('{ai} ({who}) a répondu à ta demande.', { ai: PROVIDERS[req.provider].label, who: B.me.display_name }),
      link: `#/p/${req.project_id}/atelier`, refId: req.id
    });
  } catch (err) {
    await B.sb.from('ai_requests').update({ status: 'error', error: errText(err).slice(0, 300), updated_at: new Date().toISOString() }).eq('id', req.id);
    throw err;
  }
};

B.refuseRequest = async (req) => {
  await B.sb.from('ai_requests').update({ status: 'refused', updated_at: new Date().toISOString() }).eq('id', req.id);
  await B.notify(req.requester_id, {
    projectId: req.project_id, type: 'ai_answer',
    text: tr("{who} a refusé d'utiliser son {ai} pour ta demande.", { who: B.me.display_name, ai: PROVIDERS[req.provider].label }),
    link: `#/p/${req.project_id}/atelier`, refId: req.id
  });
};

/** Demandes en attente qui me sont adressées (affichées au démarrage) */
B.pendingRequestsForMe = async () => {
  const { data } = await B.sb.from('ai_requests').select('*')
    .eq('target_id', B.me.id).eq('status', 'pending').order('created_at');
  return data || [];
};
