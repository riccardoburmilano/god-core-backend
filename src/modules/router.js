// ============================================================
// GOD ROUTER v1.7 + AUTO-PIPELINE v2.0
// Intent classification + pipeline generation from natural language
// ============================================================

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

const PIPELINE_TEMPLATES = {
  contenuto:   ['skill-ricercatore','skill-creatore','skill-analista','skill-ottimizzatore','skill-guardiano'],
  analisi:     ['skill-ricercatore','skill-analista','skill-diagnostica','skill-ottimizzatore'],
  strategia:   ['skill-stratega','skill-architetto','skill-orchestratore','skill-analista'],
  produzione:  ['skill-creatore','skill-analista','skill-ottimizzatore','skill-guardiano'],
  diagnostica: ['skill-diagnostica','skill-analista','skill-ottimizzatore'],
  default:     ['skill-stratega','skill-creatore','skill-analista','skill-guardiano'],
};

function classifyIntent(title) {
  const t = title.toLowerCase();
  for (const intent of INTENT_MAP) {
    if (intent.kw.some(k => t.includes(k))) return intent;
  }
  return { type: 'ESECUZIONE', skill: 'skill-orchestratore' };
}

function autoPipelineFromText(text) {
  const t = text.toLowerCase();
  if (t.includes('contenuto') || t.includes('articolo') || t.includes('post') || t.includes('scrivi')) return { type: 'contenuto', skills: PIPELINE_TEMPLATES.contenuto };
  if (t.includes('analisi') || t.includes('report') || t.includes('valuta') || t.includes('misura'))    return { type: 'analisi',   skills: PIPELINE_TEMPLATES.analisi };
  if (t.includes('strateg') || t.includes('piano') || t.includes('architettura'))                        return { type: 'strategia', skills: PIPELINE_TEMPLATES.strategia };
  if (t.includes('errore') || t.includes('problema') || t.includes('debug'))                             return { type: 'diagnostica', skills: PIPELINE_TEMPLATES.diagnostica };
  if (t.includes('crea') || t.includes('genera') || t.includes('produci'))                               return { type: 'produzione', skills: PIPELINE_TEMPLATES.produzione };
  return { type: 'default', skills: PIPELINE_TEMPLATES.default };
}

module.exports = { classifyIntent, autoPipelineFromText, INTENT_MAP, PIPELINE_TEMPLATES };
