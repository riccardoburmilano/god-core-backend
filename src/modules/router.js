// ============================================================
// GOD ROUTER v1.8 + AUTO-PIPELINE v2.5
// Intent classification + semantic HF analysis + pipeline generation
// ============================================================

import { hf } from "../../god/hf.js";

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
// 3) HF-POWERED INTENT BOOSTER
// ─────────────────────────────────────────────────────────────
async function hfIntentBoost(text) {
  try {
    const entities = await hf("dslim/bert-base-NER", text);
    const emb = await hf("sentence-transformers/all-MiniLM-L6-v2", text);

    return { entities, emb };
  } catch (e) {
    return { entities: null, emb: null };
  }
}

// ─────────────────────────────────────────────────────────────
// 4) CLASSIFY INTENT (HF + keyword)
// ─────────────────────────────────────────────────────────────
async function classifyIntent(text) {
