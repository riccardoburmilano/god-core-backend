// ============================================================
// INSIGHT CLINICAL v1.0
// Endpoint dedicato per insight paziente — output compatto
// ============================================================

const Groq = require('groq-sdk');
const { logWrite, uuid, now } = require('./state');

const client = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = process.env.GOD_MODEL || 'llama-3.3-70b-versatile';

const SYSTEM_PROMPT = `Sei un consulente clinico AI per centri estetici e cliniche.
Ricevi il profilo di un paziente e devi rispondere SOLO con JSON valido, niente altro.

Analizza il profilo e restituisci esattamente questo JSON:
{
  "azione_principale": "Una frase breve — cosa fare OGGI con questo paziente",
  "alert": "Un alert critico se esiste, altrimenti null",
  "opportunita": "Una opportunità commerciale o clinica se esiste, altrimenti null",
  "score_paziente": numero da 1 a 10 che rappresenta il valore/priorità del paziente,
  "mood": "POSITIVO|NEUTRO|ATTENZIONE|CRITICO"
}

Regole:
- azione_principale: max 12 parole, concreta e operativa
- alert: solo se c'è un rischio reale (farmaci, reclami, controindicazioni)
- opportunita: solo se c'è una vendita o fidelizzazione possibile oggi
- Rispondi SOLO con il JSON, zero testo prima o dopo`;

async function getInsightPaziente(paziente) {
  const payload = typeof paziente === 'string' ? paziente : JSON.stringify(paziente, null, 2);

  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 300,
    temperature: 0.3,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `PROFILO PAZIENTE:\n${payload}` }
    ]
  });

  const text = response.choices[0]?.message?.content || '{}';
  const tokens = (response.usage?.prompt_tokens || 0) + (response.usage?.completion_tokens || 0);

  try {
    const clean = text.replace(/```json|```/g, '').trim();
    const insight = JSON.parse(clean);
    insight.generated_at = now();
    insight.tokens = tokens;
    logWrite('INSIGHT_CLINICAL', 'paziente_insight', { paziente: paziente?.nome || 'unknown' }, { mood: insight.mood, score: insight.score_paziente }, 'SUCCESS');
    return { success: true, insight };
  } catch {
    logWrite('INSIGHT_CLINICAL', 'parse_error', {}, { raw: text.slice(0,100) }, 'ERROR');
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
