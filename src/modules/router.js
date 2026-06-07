// ============================================================
// GOD OS ROUTER v1.9
// Intent classification + semantic HF analysis + pipeline generation
// Runtime logging included
// ============================================================

import { hf } from "../../god/hf.js";

// Log di avvio runtime
console.log("🚀 GOD OS RUNTIME AVVIATO — Engine: Copilot + HuggingFace");

// ─────────────────────────────────────────────────────────────
// 1) INTENT MAP
// ─────────────────────────────────────────────────────────────
const INTENT_MAP = [
  { type: 'PIANIFICAZIONE', skill: 'skill-stratega',      kw: ['piano','strategia','obiettivo','organizza','scope','roadmap','pianifica'] },
  { type: 'ARCHITETTURA',   skill: 'skill-architetto',    kw: ['architettura','blueprint','pipeline','dipendenz','modulo','struttura','flusso','schema'] },
  { type: 'PRODUZIONE',     skill: 'skill-creatore',      kw: ['scrivi','crea','genera','produci','testo','contenuto','documento','articolo','post','scheda'] },
  { type: 'ANALISI',        skill: 'skill-analista',      kw: ['analizza','valuta','punteggio','misura','performance','report','qualità'] },
  { type: 'OTTIMIZZAZIONE', skill: 'skill-ottimizzatore', kw: ['ottimizza','migliora','raffina','perfeziona','correggi','fix'] },
  { type: 'VALIDAZIONE',    skill: 'skill-guardiano',     kw: ['valida','approva','blocca','verifica','controlla','pubblica','gate'] },
  { type: 'ECONOMIA',       skill: 'skill-contabile',     kw: ['costo','budget','crediti','spesa','efficienza','consumi'] },
  { type: 'RICERCA',        skill: 'skill-ricercatore',   kw: ['cerca','trova','ricerca','dati','fonti','trend','benchmark'] },
  { type: 'DIAGNOSTICA',    skill: 'skill-diagnostica',   kw: ['errore','problema','blocco','fallito','debug','perché','root cause','anomalia'] },
  { type: 'MEMORIA',        skill: 'skill-memoria',       kw: ['storico','ricorda','archivia','pattern','precedente','recupera'] },
];

// ─────────────────────────────────────────────────────────────
// 2) PIPELINE TEMPLATES
// ─────────────────────────────────────────────────────────────
const PIPELINE_TEMPLATES = {
  contenuto:   ['skill-ricercatore','skill-creatore','skill-analista','skill-ottimizzatore','skill-guardiano'],
  analisi:     ['skill-ricercatore','skill-analista','skill-diagnostica','skill-ottimizzatore'],
  strategia:   ['skill-stratega','skill-architetto','skill-orchestratore','skill-analista'],
  produzione:  ['skill-creatore','skill-analista','skill-ottimizzatore','skill-guardiano'],
  diagnostica: ['skill-diagnostica','skill-analista','skill-ottimizzatore'],
  default:     ['skill-stratega','skill-creatore','skill-analista','skill-guardiano'],
};

// ─────────────────────────────────────────────────────────────
// 3) HF-POWERED ANALYSIS
// ─────────────────────────────────────────────────────────────
async function hfIntentBoost(text) {
  try {
    const entities = await hf("dslim/bert-base-NER", text);
    const emb = await hf("sentence-transformers/all-MiniLM-L6-v2", text);

    console.log("🔬 HF Entities:", entities);
    console.log("🧩 HF Embeddings:", emb ? "OK" : "N/A");

    return { entities, emb };
  } catch (e) {
    console.log("⚠️ HF Error:", e.message);
    return { entities: null, emb: null };
  }
}

// ─────────────────────────────────────────────────────────────
// 4) CLASSIFY INTENT (keyword + HF)
// ─────────────────────────────────────────────────────────────
async function classifyIntent(text) {
  console.log("🧠 GOD OS — Input:", text);

  const t = text.toLowerCase();

  // 1) Keyword match
  for (const intent of INTENT_MAP) {
    if (intent.kw.some(k => t.includes(k))) {
      console.log("🎯 Intent rilevato (keyword):", intent.type);
      return intent;
    }
  }

  // 2) HF semantic boost
  const { entities } = await hfIntentBoost(text);

  if (entities) {
    const flat = JSON.stringify(entities).toLowerCase();

    if (flat.includes("error") || flat.includes("bug")) {
      console.log("🎯 Intent rilevato (HF): DIAGNOSTICA");
      return { type: 'DIAGNOSTICA', skill: 'skill-diagnostica' };
    }

    if (flat.includes("budget") || flat.includes("money")) {
      console.log("🎯 Intent rilevato (HF): ECONOMIA");
      return { type: 'ECONOMIA', skill: 'skill-contabile' };
    }

    if (flat.includes("project") || flat.includes("plan")) {
      console.log("🎯 Intent rilevato (HF): PIANIFICAZIONE");
      return { type: 'PIANIFICAZIONE', skill: 'skill-stratega' };
    }
  }

  // 3) Default
  console.log("🎯 Intent rilevato (default): ESECUZIONE");
  return { type: 'ESECUZIONE', skill: 'skill-orchestratore' };
}

// ─────────────────────────────────────────────────────────────
// 5) AUTO PIPELINE (keyword + HF)
// ─────────────────────────────────────────────────────────────
async function autoPipelineFromText(text) {
  const t = text.toLowerCase();

  // Keyword rules
  if (t.includes('contenuto') || t.includes('articolo') || t.includes('post') || t.includes('scrivi'))
    return logPipeline('contenuto');

  if (t.includes('analisi') || t.includes('report') || t.includes('valuta') || t.includes('misura'))
    return logPipeline('analisi');

  if (t.includes('strateg') || t.includes('piano') || t.includes('architettura'))
    return logPipeline('strategia');

  if (t.includes('errore') || t.includes('problema') || t.includes('debug'))
    return logPipeline('diagnostica');

  if (t.includes('crea') || t.includes('genera') || t.includes('produci'))
    return logPipeline('produzione');

  // HF fallback
  const { entities } = await hfIntentBoost(text);

  if (entities) {
    const flat = JSON.stringify(entities).toLowerCase();

    if (flat.includes("error") || flat.includes("bug"))
      return logPipeline('diagnostica');

    if (flat.includes("project") || flat.includes("plan"))
      return logPipeline('strategia');
  }

  return logPipeline('default');
}

// Helper per log pipeline
function logPipeline(type) {
  console.log("🔧 Pipeline generata:", PIPELINE_TEMPLATES[type]);
  return { type, skills: PIPELINE_TEMPLATES[type] };
}

// ─────────────────────────────────────────────────────────────
// 6) EXPORT
// ─────────────────────────────────────────────────────────────
module.exports = {
  classifyIntent,
  autoPipelineFromText,
  INTENT_MAP,
  PIPELINE_TEMPLATES
};
