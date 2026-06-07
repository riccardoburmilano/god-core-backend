// ============================================================
// GOD OS ROUTER — VERSIONE STABILE
// ============================================================

import { hf } from "../god/hf.js";

// INTENT MAP
const INTENT_MAP = [
  { type: 'PIANIFICAZIONE', skill: 'skill-stratega', kw: ['piano','strategia','obiettivo','organizza','roadmap'] },
  { type: 'ARCHITETTURA',   skill: 'skill-architetto', kw: ['architettura','schema','modulo','struttura'] },
  { type: 'PRODUZIONE',     skill: 'skill-creatore', kw: ['scrivi','crea','genera','produci'] },
  { type: 'ANALISI',        skill: 'skill-analista', kw: ['analizza','valuta','report','misura'] },
  { type: 'OTTIMIZZAZIONE', skill: 'skill-ottimizzatore', kw: ['ottimizza','migliora','correggi'] },
  { type: 'DIAGNOSTICA',    skill: 'skill-diagnostica', kw: ['errore','problema','debug'] },
];

// PIPELINE
const PIPELINE_TEMPLATES = {
  contenuto:   ['skill-creatore','skill-analista','skill-ottimizzatore'],
  analisi:     ['skill-analista','skill-diagnostica'],
  strategia:   ['skill-stratega','skill-architetto'],
  default:     ['skill-creatore','skill-analista'],
};

// HF BOOST
async function hfIntentBoost(text) {
  try {
    const entities = await hf("dslim/bert-base-NER", text);
    return { entities };
  } catch {
    return { entities: null };
  }
}

// CLASSIFY INTENT
async function classifyIntent(text) {
  const t = text.toLowerCase();

  for (const intent of INTENT_MAP) {
    if (intent.kw.some(k => t.includes(k))) {
      return intent;
    }
  }

  const { entities } = await hfIntentBoost(text);

  if (entities) {
    const flat = JSON.stringify(entities).toLowerCase();
    if (flat.includes("error")) return { type: 'DIAGNOSTICA', skill: 'skill-diagnostica' };
  }

  return { type: 'ESECUZIONE', skill: 'skill-creatore' };
}

// PIPELINE AUTO
async function autoPipelineFromText(text) {
  const t = text.toLowerCase();

  if (t.includes("analisi")) return { type: "analisi", skills: PIPELINE_TEMPLATES.analisi };
  if (t.includes("piano")) return { type: "strategia", skills: PIPELINE_TEMPLATES.strategia };
  if (t.includes("scrivi") || t.includes("crea")) return { type: "contenuto", skills: PIPELINE_TEMPLATES.contenuto };

  return { type: "default", skills: PIPELINE_TEMPLATES.default };
}

// EXPORT ES MODULE
export {
  classifyIntent,
  autoPipelineFromText,
  INTENT_MAP,
  PIPELINE_TEMPLATES
};
