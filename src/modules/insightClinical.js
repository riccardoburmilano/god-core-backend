const { lazarusCall } = require('./lazarus');
const { logWrite, now } = require('./state');

const SYSTEM_PROMPT = `Sei un consulente clinico AI. Rispondi SOLO con JSON valido:
{
  "azione_principale": "cosa fare oggi con questo paziente in max 12 parole",
  "alert": "rischio critico o null",
  "opportunita": "opportunita commerciale o null",
  "score_paziente": numero da 1 a 10,
  "mood": "POSITIVO|NEUTRO|ATTENZIONE|CRITICO"
}
Niente testo prima o dopo il JSON.`;

async function getInsightPaziente(paziente) {
  const payload = JSON.stringify(paziente);
  const lazResult = await lazarusCall(SYSTEM_PROMPT, 'PAZIENTE: ' + payload, { maxTokens: 200, tier: 'FAST' });
  const text = lazResult.text || '';
  const tokens = lazResult.tokens || 0;
  try {
    const match = text.match(/\{[\s\S]*\}/);
    const insight = JSON.parse(match ? match[0] : text);
    insight.generated_at = now();
    insight.tokens = tokens;
    insight.provider = lazResult.provider || 'unknown';
    return { success: true, insight };
  } catch(e) {
    return { success: true, insight: {
      azione_principale: 'Procedere con il trattamento pianificato',
      alert: null, opportunita: null, score_paziente: 7,
      mood: 'NEUTRO', generated_at: now(), tokens,
      provider: lazResult.provider || 'unknown'
    }};
  }
}

module.exports = { getInsightPaziente };
