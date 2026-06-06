// ============================================================
// LAZARUS-9 v1.0 — Token Optimizer & Multi-Provider Router
// Mai sprecare. Mai morire. Sempre al massimo legittimo.
// ============================================================

const Groq = require('groq-sdk');
const { logWrite, uuid, now } = require('./state');

// ── PROVIDER REGISTRY ────────────────────────────────────────
// Ogni provider ha: client, modelli per tier, limiti, stato
const PROVIDERS = {
  groq_fast: {
    name: 'Groq Fast',
    model: 'llama-3.1-8b-instant',
    tier: 'FAST',        // task semplici
    cost_per_token: 0.0001,
    rpm_limit: 30,
    tpm_limit: 14400,
    rpm_used: 0,
    tpm_used: 0,
    status: 'ACTIVE',
    reset_at: null,
    total_tokens: 0,
    total_calls: 0,
    errors: 0,
  },
  groq_power: {
    name: 'Groq Power',
    model: 'llama-3.3-70b-versatile',
    tier: 'POWER',       // task complessi
    cost_per_token: 0.0003,
    rpm_limit: 30,
    tpm_limit: 6000,
    rpm_used: 0,
    tpm_used: 0,
    status: 'ACTIVE',
    reset_at: null,
    total_tokens: 0,
    total_calls: 0,
    errors: 0,
  },
  gemini_flash: {
    name: 'Gemini Flash',
    model: 'gemini-1.5-flash',
    tier: 'FAST',
    cost_per_token: 0.00001, // quasi gratis
    rpm_limit: 15,
    tpm_limit: 1000000,      // 1M token/giorno gratis
    rpm_used: 0,
    tpm_used: 0,
    status: process.env.GEMINI_API_KEY ? 'ACTIVE' : 'NO_KEY',
    reset_at: null,
    total_tokens: 0,
    total_calls: 0,
    errors: 0,
  },
  gemini_pro: {
    name: 'Gemini Pro',
    model: 'gemini-1.5-pro',
    tier: 'POWER',
    cost_per_token: 0.00005,
    rpm_limit: 2,
    tpm_limit: 32000,
    rpm_used: 0,
    tpm_used: 0,
    status: process.env.GEMINI_API_KEY ? 'ACTIVE' : 'NO_KEY',
    reset_at: null,
    total_tokens: 0,
    total_calls: 0,
    errors: 0,
  }
};

// ── CACHE ─────────────────────────────────────────────────────
const CACHE = new Map();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minuti
let cache_hits = 0;
let cache_misses = 0;

function cacheKey(system, user) {
  // Hash semplice deterministico
  const str = system.slice(0, 100) + '||' + user.slice(0, 200);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return 'lz9_' + Math.abs(hash).toString(36);
}

function cacheGet(key) {
  const entry = CACHE.get(key);
  if (!entry) { cache_misses++; return null; }
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) { CACHE.delete(key); cache_misses++; return null; }
  cache_hits++;
  return entry.value;
}

function cacheSet(key, value) {
  if (CACHE.size > 500) {
    // Evict oldest 100
    const keys = [...CACHE.keys()].slice(0, 100);
    keys.forEach(k => CACHE.delete(k));
  }
  CACHE.set(key, { value, timestamp: Date.now() });
}

// ── TASK CLASSIFIER ──────────────────────────────────────────
function classifyTask(systemPrompt, userMsg) {
  const combined = (systemPrompt + userMsg).toLowerCase();
  const totalLen = systemPrompt.length + userMsg.length;

  // Task semplici → FAST tier
  const simpleSignals = ['insight', 'breve', 'riassumi', 'elenca', 'classifica', 'semplice', 'veloce'];
  const isSimple = simpleSignals.some(s => combined.includes(s)) || totalLen < 800;

  // Task complessi → POWER tier
  const complexSignals = ['analisi approfondita', 'strategia', 'architetta', 'pianifica', 'elabora', 'skill system prompt'];
  const isComplex = complexSignals.some(s => combined.includes(s)) || totalLen > 2000;

  if (isSimple && !isComplex) return 'FAST';
  if (isComplex) return 'POWER';
  return 'FAST'; // default a risparmio
}

// ── PROMPT COMPRESSOR ────────────────────────────────────────
function compressPrompt(text, maxLen = 1500) {
  if (text.length <= maxLen) return text;
  // Taglia mantenendo inizio e fine (le parti più importanti)
  const half = Math.floor(maxLen / 2);
  return text.slice(0, half) + '\n[...]\n' + text.slice(-half);
}

// ── RATE LIMIT CHECK ─────────────────────────────────────────
function canUse(providerId) {
  const p = PROVIDERS[providerId];
  if (!p || p.status !== 'ACTIVE') return false;

  // Reset contatori ogni minuto
  const now_ms = Date.now();
  if (p.reset_at && now_ms > p.reset_at) {
    p.rpm_used = 0;
    p.tpm_used = 0;
    p.reset_at = now_ms + 60000;
  }
  if (!p.reset_at) p.reset_at = now_ms + 60000;

  return p.rpm_used < p.rpm_limit * 0.85 && // margine sicurezza 15%
         p.tpm_used < p.tpm_limit * 0.85;
}

function recordUsage(providerId, tokens) {
  const p = PROVIDERS[providerId];
  if (!p) return;
  p.rpm_used++;
  p.tpm_used += tokens;
  p.total_tokens += tokens;
  p.total_calls++;
}

// ── PROVIDER SELECTOR ────────────────────────────────────────
function selectProvider(tier) {
  // Priority order per tier
  const fastOrder  = ['gemini_flash', 'groq_fast', 'groq_power', 'gemini_pro'];
  const powerOrder = ['groq_power', 'gemini_pro', 'groq_fast', 'gemini_flash'];
  const order = tier === 'FAST' ? fastOrder : powerOrder;

  for (const id of order) {
    if (canUse(id)) return id;
  }
  return null; // tutti esauriti
}

// ── GROQ CALLER ───────────────────────────────────────────────
async function callGroq(providerId, systemPrompt, userMsg, maxTokens) {
  const p = PROVIDERS[providerId];
  const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

  const response = await client.chat.completions.create({
    model: p.model,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMsg }
    ]
  });

  const text = response.choices[0]?.message?.content || '';
  const tokens = (response.usage?.prompt_tokens || 0) + (response.usage?.completion_tokens || 0);
  return { text, tokens };
}

// ── GEMINI CALLER ─────────────────────────────────────────────
async function callGemini(providerId, systemPrompt, userMsg, maxTokens) {
  const p = PROVIDERS[providerId];
  const apiKey = process.env.GEMINI_API_KEY;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${p.model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: userMsg }] }],
        generationConfig: { maxOutputTokens: maxTokens }
      })
    }
  );

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const tokens = (data.usageMetadata?.promptTokenCount || 0) + (data.usageMetadata?.candidatesTokenCount || 0);
  return { text, tokens };
}

// ── LAZARUS CORE CALL ─────────────────────────────────────────
async function lazarusCall(systemPrompt, userMsg, options = {}) {
  const maxTokens = options.maxTokens || 1000;
  const forceTier = options.tier || null;
  const skipCache = options.skipCache || false;

  // 1. CACHE CHECK
  const ck = cacheKey(systemPrompt, userMsg);
  if (!skipCache) {
    const cached = cacheGet(ck);
    if (cached) {
      logWrite('LAZARUS-9', 'cache_hit', {}, { key: ck }, 'SUCCESS');
      return { ...cached, from_cache: true, provider: 'CACHE', tokens: 0, cost: 0 };
    }
  }

  // 2. COMPRESS PROMPTS
  const compSystem = compressPrompt(systemPrompt, 1200);
  const compUser   = compressPrompt(userMsg, 1500);

  // 3. CLASSIFY + SELECT PROVIDER
  const tier = forceTier || classifyTask(systemPrompt, userMsg);
  const providerId = selectProvider(tier);

  if (!providerId) {
    // STATO ASCESI — tutti i provider esauriti
    logWrite('LAZARUS-9', 'ascesi', {}, { tier }, 'ERROR');
    throw new Error('LAZARUS-9 ASCESI: tutti i provider temporaneamente esauriti. Riprova tra 60 secondi.');
  }

  const p = PROVIDERS[providerId];

  // 4. CALL
  let text, tokens;
  try {
    if (providerId.startsWith('gemini')) {
      ({ text, tokens } = await callGemini(providerId, compSystem, compUser, maxTokens));
    } else {
      ({ text, tokens } = await callGroq(providerId, compSystem, compUser, maxTokens));
    }
    p.errors = Math.max(0, p.errors - 1); // reset graduale errori
  } catch (err) {
    p.errors++;
    if (p.errors > 3) { p.status = 'PAUSED'; setTimeout(() => { p.status = 'ACTIVE'; p.errors = 0; }, 60000); }

    // FALLBACK automatico su altro provider
    const fallbackId = selectProvider(tier === 'FAST' ? 'POWER' : 'FAST');
    if (fallbackId && fallbackId !== providerId) {
      logWrite('LAZARUS-9', 'fallback', { from: providerId, to: fallbackId }, {}, 'WARN');
      if (fallbackId.startsWith('gemini')) {
        ({ text, tokens } = await callGemini(fallbackId, compSystem, compUser, maxTokens));
      } else {
        ({ text, tokens } = await callGroq(fallbackId, compSystem, compUser, maxTokens));
      }
      recordUsage(fallbackId, tokens);
    } else {
      throw err;
    }
  }

  recordUsage(providerId, tokens);

  // 5. CACHE RESULT
  const result = { text, tokens, provider: p.name, model: p.model, tier, cost: tokens * p.cost_per_token };
  if (!skipCache && text.length > 50) cacheSet(ck, result);

  logWrite('LAZARUS-9', 'call', { provider: providerId, tier }, { tokens, cost: result.cost.toFixed(4) }, 'SUCCESS');

  return { ...result, from_cache: false };
}

// ── STATUS & STATS ────────────────────────────────────────────
function getStatus() {
  const totalTokens = Object.values(PROVIDERS).reduce((a, p) => a + p.total_tokens, 0);
  const totalCost   = Object.values(PROVIDERS).reduce((a, p) => a + p.total_tokens * p.cost_per_token, 0);
  const efficiency  = cache_hits + cache_misses > 0 ? Math.round(cache_hits / (cache_hits + cache_misses) * 100) : 0;

  return {
    lazarus_state: Object.values(PROVIDERS).every(p => p.status === 'ACTIVE') ? 'VESPRO' :
                   Object.values(PROVIDERS).some(p => p.status === 'ACTIVE') ? 'DOGMA' : 'ASCESI',
    providers: Object.entries(PROVIDERS).map(([id, p]) => ({
      id, name: p.name, model: p.model, tier: p.tier,
      status: p.status, can_use: canUse(id),
      rpm_used: p.rpm_used, rpm_limit: p.rpm_limit,
      total_calls: p.total_calls, total_tokens: p.total_tokens,
      errors: p.errors
    })),
    cache: { hits: cache_hits, misses: cache_misses, size: CACHE.size, efficiency_pct: efficiency },
    totals: { tokens: totalTokens, cost_estimated: totalCost.toFixed(4), savings_from_cache: cache_hits },
    timestamp: now()
  };
}

function clearCache() { CACHE.clear(); cache_hits = 0; cache_misses = 0; }

module.exports = { lazarusCall, getStatus, clearCache, PROVIDERS, classifyTask };
