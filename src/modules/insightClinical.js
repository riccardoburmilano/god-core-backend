const { lazarusCall } = require('./lazarus');
const { logWrite, now } = require('./state');

const SYSTEM_PROMPT = `Sei un consulente clinico AI per centri estetici.
Analizza il profilo paziente e rispondi ESCLUSIVAMENTE con un oggetto JSON, senza markdown, senza backtick, senza spiegazioni.
Il JSON deve avere esattamente questi campi:
{"azione_principale":"stringa max 12 parole","alert":"stringa o null","opportunita":"stringa o null","score_paziente":numero,"mood":"POSITIVO"}`;

async function getInsightPaziente(paziente) {
  const payload = JSON.stringify(paziente);
  let lazResult;
  try {
    lazResult = await lazarusCall(SYSTEM_PROMPT, 'Analizza questo paziente: ' + payload, { maxTokens: 250, tier: 'FAST' });
  } catch(callErr) {
    return { success: false, insight: { azione_principale: 'Errore chiamata AI', alert: null, opportunita: null, score_paziente: 5, mood: 'NEUTRO', generated_at: now(), tokens: 0, provider: 'ERROR' }};
  }

  const text = (lazResult.text || '').trim();
  const tokens = lazResult.tokens || 0;
  const provider = lazResult.provider || 'unknown';

  // Log raw for debugging
  logWrite('INSIGHT_CLINICAL', 'raw_response', { provider }, { text: text.slice(0,300), tokens }, 'DEBUG');

  // Multiple extraction strategies
  let insight = null;
  const strategies = [
    () => JSON.parse(text),
    () => JSON.parse(text.replace(/```json|```/gi, '').trim()),
    () => { const m = text.match(/\{[\s\S]*?\}/); return m ? JSON.parse(m[0]) : null; },
    () => {
      // Build from text keywords
      const t = text.toLowerCase();
      return {
        azione_principale: t.includes('dolore') ? 'Applicare anestetica 20 min prima' : t.includes('vip') ? 'Trattare con priorità massima' : 'Procedere con trattamento pianificato',
        alert: t.includes('farmac') || t.includes('controindicaz') ? 'Verificare farmaci assunti' : null,
        opportunita: t.includes('pacchett') || t.includes('vip') || t.includes('fedeltà') ? 'Proporre pacchetto fedeltà a fine sessione' : null,
        score_paziente: t.includes('vip') ? 9 : t.includes('nuovo') ? 6 : 7,
        mood: t.includes('rischio') || t.includes('attenzione') ? 'ATTENZIONE' : 'POSITIVO'
      };
    }
  ];

  for (const strategy of strategies) {
    try {
      const result = strategy();
      if (result && result.azione_principale) { insight = result; break; }
    } catch { continue; }
  }

  if (!insight) insight = { azione_principale: 'Procedere con trattamento pianificato', alert: null, opportunita: null, score_paziente: 7, mood: 'NEUTRO' };

  insight.generated_at = now();
  insight.tokens = tokens;
  insight.provider = provider;
  insight.from_cache = lazResult.from_cache || false;

  logWrite('INSIGHT_CLINICAL', 'insight_ok', { provider }, { mood: insight.mood, score: insight.score_paziente }, 'SUCCESS');
  return { success: true, insight };
}

module.exports = { getInsightPaziente };
