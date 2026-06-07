const { lazarusCall } = require('./lazarus');
const { logWrite, now } = require('./state');

const SYSTEM_PROMPT = `Sei un consulente clinico AI per centri estetici.
Analizza il profilo paziente e rispondi ESCLUSIVAMENTE con un oggetto JSON valido.
Niente markdown, niente backtick, niente testo prima o dopo il JSON.
Inizia direttamente con { e termina con }.

Schema obbligatorio (tutti i campi richiesti):
{
  "azione_principale": "stringa max 12 parole che descrive cosa fare oggi",
  "alert": "stringa con rischio clinico oppure null se nessun rischio",
  "opportunita": "stringa con opportunita commerciale oppure null se nessuna",
  "score_paziente": numero intero da 1 a 10,
  "mood": "uno tra: POSITIVO, NEUTRO, ATTENZIONE, CRITICO"
}

Determina mood in base al profilo: POSITIVO=cliente fidelizzato senza problemi, NEUTRO=standard, ATTENZIONE=rischi o anomalie, CRITICO=controindicazioni o urgenze.`;

async function getInsightPaziente(paziente) {
  const payload = JSON.stringify(paziente);
  let lazResult;
  try {
    lazResult = await lazarusCall(
      SYSTEM_PROMPT,
      'Analizza questo paziente e restituisci solo il JSON: ' + payload,
      { maxTokens: 400, tier: 'FAST' }
    );
  } catch (callErr) {
    logWrite('INSIGHT_CLINICAL', 'call_error', { paziente: paziente?.nome }, { error: callErr.message }, 'ERROR');
    return {
      success: false,
      insight: {
        azione_principale: 'Errore chiamata AI — riprovare',
        alert: null,
        opportunita: null,
        score_paziente: 5,
        mood: 'NEUTRO',
        generated_at: now(),
        tokens: 0,
        provider: 'ERROR'
      }
    };
  }

  const raw = (lazResult.text || '').trim();
  const tokens = lazResult.tokens || 0;
  const provider = lazResult.provider || 'unknown';

  logWrite('INSIGHT_CLINICAL', 'raw_response', { provider }, { text: raw.slice(0, 300), tokens }, 'DEBUG');

  let insight = null;

  // Strategia 1: parse diretto
  try { insight = tryParse(raw); } catch { }

  // Strategia 2: strip markdown e retry
  if (!insight) {
    try { insight = tryParse(raw.replace(/```json|```/gi, '').trim()); } catch { }
  }

  // Strategia 3: estrai il primo blocco JSON completo (gestisce testo extra prima/dopo)
  if (!insight) {
    try {
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      if (start !== -1 && end !== -1 && end > start) {
        insight = tryParse(raw.slice(start, end + 1));
      }
    } catch { }
  }

  // Strategia 4: keyword fallback (ultimo resort — segnala sempre nei log)
  if (!insight) {
    logWrite('INSIGHT_CLINICAL', 'parser_fallback', { provider }, { raw: raw.slice(0, 200) }, 'WARN');
    const t = raw.toLowerCase();
    insight = {
      azione_principale: t.includes('dolore') ? 'Applicare anestetica 20 min prima'
        : t.includes('vip') ? 'Trattare con priorità massima'
        : 'Procedere con trattamento pianificato',
      alert: (t.includes('farmac') || t.includes('controindicaz')) ? 'Verificare farmaci assunti' : null,
      opportunita: (t.includes('pacchett') || t.includes('vip') || t.includes('fedeltà')) ? 'Proporre pacchetto fedeltà' : null,
      score_paziente: t.includes('vip') ? 9 : t.includes('nuovo') ? 6 : 7,
      mood: (t.includes('rischio') || t.includes('attenzione') || t.includes('critico')) ? 'ATTENZIONE' : 'NEUTRO'
    };
  }

  // Normalizzazione e validazione campi
  const VALID_MOODS = ['POSITIVO', 'NEUTRO', 'ATTENZIONE', 'CRITICO'];
  insight.mood = VALID_MOODS.includes(insight.mood) ? insight.mood : 'NEUTRO';
  insight.score_paziente = clamp(parseInt(insight.score_paziente) || 7, 1, 10);
  insight.azione_principale = (insight.azione_principale || 'Procedere con trattamento').slice(0, 120);

  insight.generated_at = now();
  insight.tokens = tokens;
  insight.provider = provider;
  insight.from_cache = lazResult.from_cache || false;

  logWrite('INSIGHT_CLINICAL', 'insight_ok', { provider }, { mood: insight.mood, score: insight.score_paziente }, 'SUCCESS');
  return { success: true, insight };
}

function tryParse(str) {
  const parsed = JSON.parse(str);
  if (!parsed || typeof parsed !== 'object') throw new Error('not object');
  if (!parsed.azione_principale) throw new Error('missing azione_principale');
  return parsed;
}

function clamp(val, min, max) {
  return Math.min(Math.max(val, min), max);
}

module.exports = { getInsightPaziente };
