// ============================================================
// INSIGHT CLINICAL v1.1 — powered by LAZARUS-9
// ============================================================

const { lazarusCall } = require('./lazarus');
const { logWrite, now } = require('./state');

const SYSTEM_PROMPT = `Sei un consulente clinico AI per centri estetici e cliniche.
Ricevi il profilo di un paziente e devi rispondere SOLO con JSON valido, niente altro.

Analizza il profilo e restituisci esattamente questo JSON:
{
  "azione_principale": "Una frase breve — cosa fare OGGI con questo paziente",
  "alert": "Un alert critico se esiste, altrimenti null",
  "opportunita": "Una opportunità commerciale o clinica se esiste, altrimenti null",
  "score_paziente": numero da 1 a 10,
  "mood": "POSITIVO|NEUTRO|ATTENZIONE|CRITICO"
}

Regole:
- azione_principale: max 12 parole, concreta e operativa
- alert: solo se c'è un rischio reale
- opportunita: solo se c'è una vendita possibile oggi
- Rispondi SOLO con il JSON, zero testo prima o dopo`;

async function getInsightPaziente(paziente) {
  const payload = typeof paziente === 'string' ? paziente : JSON.stringify(paziente, null, 2);

  const lazResult = await lazarusCall(SYSTEM_PROMPT, `PROFILO PAZIENTE:\n${payload}`, { maxTokens: 300, tier: 'FAST' });
  const text = lazResult.text || '';
  const tokens = lazResult.tokens || 0;

  try {
    const clean = text.replace(/```json|```/g, '').trim();
    const insight = JSON.parse(clean);
    insight.generated_at = now();
    insight.tokens = tokens;
    insight.provider = lazResult.provider;
    logWrite('INSIGHT_CLINICAL', 'paziente_insight', { paziente: paziente?.nome || 'unknown' }, { mood: insight.mood, score: insight.score_paziente }, 'SUCCESS');
    return { success: true, insight };
  } catch {
    return {
      success: false,
      insight: {
        azione_principale: 'Analisi non disponibile — riprova',
        alert: null, opportunita: null,
        score_paziente: 5, mood: 'NEUTRO',
        generated_at: now(), tokens
      }
    };
  }
}

module.exports = { getInsightPaziente };
