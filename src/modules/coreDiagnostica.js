// ============================================================
// CORE_DIAGNOSTICA v1.0
// Monitora GOD, rileva problemi, propone fix — tu approvi
// ============================================================

const Groq = require('groq-sdk');
const { stateRead, stateWrite, scoresRead, diagnosesRead,
        memoryRead, tasksRead, logWrite, uuid, now } = require('./state');

const client = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = process.env.GOD_MODEL || 'llama-3.3-70b-versatile';

// Registry proposte in attesa di approvazione
const PENDING_FIXES = {};
const APPLIED_FIXES = [];
const DIAGNOSTIC_LOG = [];

// ── Classificazione problemi ─────────────────────────────────
const PROBLEM_TYPES = {
  SKILL_DEBOLE:    { severity: 'MEDIA',   icon: '⚠️',  desc: 'Skill produce output sotto soglia' },
  ERRORE_LOGICO:   { severity: 'ALTA',    icon: '🔴',  desc: 'Contraddizione o incoerenza logica' },
  ANOMALIA_SCORE:  { severity: 'MEDIA',   icon: '📉',  desc: 'Score in calo anomalo' },
  SKILL_MANCANTE:  { severity: 'ALTA',    icon: '🕳️',  desc: 'Nessuna skill adeguata per dominio' },
  ERRORE_RIPETUTO: { severity: 'CRITICA', icon: '🚨',  desc: 'Stesso errore >3 volte' },
  PERFORMANCE:     { severity: 'BASSA',   icon: '🐢',  desc: 'Latenza o token eccessivi' },
  RIDONDANZA:      { severity: 'BASSA',   icon: '♻️',  desc: 'Due skill fanno la stessa cosa' },
};

// ── Scan completo del sistema ────────────────────────────────
async function scanSystem() {
  const s = stateRead();
  const scores = scoresRead().slice(-20);
  const tasks = tasksRead().slice(-50);
  const diagnoses = diagnosesRead().slice(-20);
  const problems = [];

  // 1. Score in calo
  if (scores.length >= 5) {
    const recent = scores.slice(-5).map(s => s.avg);
    const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const trend = recent[recent.length-1] - recent[0];
    if (avg < 6.5) problems.push({ type: 'ANOMALIA_SCORE', data: { avg: avg.toFixed(1), trend: trend.toFixed(1), scores: recent } });
  }

  // 2. Task falliti ripetuti
  const failed = tasks.filter(t => t.status === 'FAILED');
  const failRate = tasks.length > 0 ? failed.length / tasks.length : 0;
  if (failRate > 0.3) problems.push({ type: 'ERRORE_RIPETUTO', data: { fail_rate: Math.round(failRate*100)+'%', count: failed.length } });

  // 3. Moduli degradati
  const degraded = Object.entries(s.modules || {}).filter(([,m]) => m.health < 40);
  if (degraded.length > 0) problems.push({ type: 'SKILL_DEBOLE', data: { modules: degraded.map(([n,m]) => ({ name: n, health: m.health })) } });

  // 4. Skill con score basso ripetuto
  const skillScores = {};
  scores.forEach(s => {
    if (!skillScores[s.skill]) skillScores[s.skill] = [];
    skillScores[s.skill].push(s.avg);
  });
  Object.entries(skillScores).forEach(([skill, avgs]) => {
    if (avgs.length >= 3) {
      const avg = avgs.reduce((a,b) => a+b, 0) / avgs.length;
      if (avg < 6.0) problems.push({ type: 'SKILL_DEBOLE', data: { skill, avg: avg.toFixed(1), samples: avgs.length } });
    }
  });

  // 5. Budget critico
  const budget = s.metrics?.credits_balance || 0;
  const spent = s.metrics?.credits_spent || 0;
  if (spent > 0 && budget / (budget + spent) < 0.1) {
    problems.push({ type: 'PERFORMANCE', data: { budget_residuo: budget.toFixed(0), alert: 'Budget sotto 10%' } });
  }

  logWrite('CORE_DIAGNOSTICA', 'scan', { problems_found: problems.length }, { types: problems.map(p=>p.type) }, 'SUCCESS');
  DIAGNOSTIC_LOG.push({ scan_id: uuid(), timestamp: now(), problems_found: problems.length, problems });

  return { problems, scanned_at: now(), metrics: { scores: scores.length, tasks: tasks.length, failed_rate: Math.round(failRate*100)+'%' } };
}

// ── Genera proposta di fix via Groq ─────────────────────────
async function generateFix(problem) {
  const ptype = PROBLEM_TYPES[problem.type] || { severity: 'MEDIA', desc: problem.type };

  const prompt = `Sei CORE_DIAGNOSTICA del sistema GOD. Analizza questo problema e proponi UN fix concreto.

PROBLEMA: ${problem.type}
SEVERITÀ: ${ptype.severity}
DESCRIZIONE: ${ptype.desc}
DATI: ${JSON.stringify(problem.data, null, 2)}

Rispondi SOLO con JSON valido:
{
  "problema_summary": "Descrizione breve del problema in 1 frase",
  "causa_root": "Causa principale identificata",
  "fix_proposto": "Azione concreta da eseguire — specifica e realizzabile",
  "impatto_atteso": "Risultato atteso dopo il fix",
  "priorita": "CRITICA|ALTA|MEDIA|BASSA",
  "auto_applicabile": true/false,
  "richiede_operatore": true/false,
  "comando_fix": "endpoint o azione tecnica da eseguire"
}`;

  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 500,
    messages: [
      { role: 'system', content: 'Sei un sistema di diagnostica AI. Rispondi SOLO con JSON valido.' },
      { role: 'user', content: prompt }
    ]
  });

  const text = response.choices[0]?.message?.content || '{}';
  try {
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch {
    return { problema_summary: problem.type, fix_proposto: 'Analisi manuale richiesta', priorita: 'MEDIA', auto_applicabile: false, richiede_operatore: true };
  }
}

// ── Scan + genera fix per tutti i problemi ───────────────────
async function fullDiagnostic() {
  const scan = await scanSystem();

  if (scan.problems.length === 0) {
    return { status: 'SISTEMA_OK', message: 'Nessun problema rilevato', scanned_at: scan.scanned_at, metrics: scan.metrics };
  }

  // Genera fix per ogni problema
  const proposals = [];
  for (const problem of scan.problems) {
    const fix = await generateFix(problem);
    const proposalId = uuid();
    const proposal = {
      proposal_id: proposalId,
      problem_type: problem.type,
      severity: PROBLEM_TYPES[problem.type]?.severity || 'MEDIA',
      icon: PROBLEM_TYPES[problem.type]?.icon || '⚠️',
      problem_data: problem.data,
      fix,
      status: 'IN_ATTESA',
      created_at: now(),
      approved_at: null,
      applied_at: null
    };
    PENDING_FIXES[proposalId] = proposal;
    proposals.push(proposal);
  }

  logWrite('CORE_DIAGNOSTICA', 'full_diagnostic', { problems: scan.problems.length }, { proposals: proposals.length }, 'SUCCESS');

  return {
    status: 'PROBLEMI_RILEVATI',
    problems_count: scan.problems.length,
    proposals,
    message: `${scan.problems.length} problemi rilevati. Approva i fix per applicarli.`,
    scanned_at: scan.scanned_at,
    metrics: scan.metrics
  };
}

// ── Approva e applica un fix ─────────────────────────────────
async function approveFix(proposalId) {
  const proposal = PENDING_FIXES[proposalId];
  if (!proposal) return { error: 'Proposta non trovata' };
  if (proposal.status !== 'IN_ATTESA') return { error: 'Proposta già processata' };

  proposal.status = 'APPROVATA';
  proposal.approved_at = now();

  // Applica fix automatici
  let applied = false;
  if (proposal.fix.auto_applicabile) {
    applied = await applyAutoFix(proposal);
  }

  proposal.status = applied ? 'APPLICATA' : 'APPROVATA_MANUALE';
  proposal.applied_at = now();

  APPLIED_FIXES.push({ ...proposal });
  delete PENDING_FIXES[proposalId];

  logWrite('CORE_DIAGNOSTICA', 'fix_approved', { proposal_id: proposalId }, { applied }, 'SUCCESS');

  return { approved: true, applied, proposal };
}

// ── Rifiuta un fix ───────────────────────────────────────────
function rejectFix(proposalId) {
  const proposal = PENDING_FIXES[proposalId];
  if (!proposal) return { error: 'Proposta non trovata' };
  proposal.status = 'RIFIUTATA';
  delete PENDING_FIXES[proposalId];
  logWrite('CORE_DIAGNOSTICA', 'fix_rejected', { proposal_id: proposalId }, {}, 'SUCCESS');
  return { rejected: true, proposal_id: proposalId };
}

// ── Applica fix automatici sicuri ───────────────────────────
async function applyAutoFix(proposal) {
  try {
    const s = stateRead();
    switch(proposal.problem_type) {
      case 'SKILL_DEBOLE': {
        // Ripara health moduli degradati
        const mods = { ...s.modules };
        let fixed = 0;
        Object.entries(mods).forEach(([name, mod]) => {
          if (mod.health < 40) { mods[name] = { ...mod, health: 75, status: 'ACTIVE' }; fixed++; }
        });
        if (fixed > 0) stateWrite('CORE_DIAGNOSTICA', { modules: mods });
        return fixed > 0;
      }
      case 'ANOMALIA_SCORE': {
        // Passa in DIAGNOSTIC mode
        stateWrite('CORE_DIAGNOSTICA', { system: { ...s.system, mode: 'DIAGNOSTIC' } });
        return true;
      }
      case 'ERRORE_RIPETUTO': {
        // Reset sistema a IDLE
        stateWrite('CORE_DIAGNOSTICA', { system: { ...s.system, status: 'IDLE', mode: 'RECOVERY' } });
        return true;
      }
      default:
        return false;
    }
  } catch {
    return false;
  }
}

// ── Getters ──────────────────────────────────────────────────
function getPendingFixes() { return Object.values(PENDING_FIXES); }
function getAppliedFixes() { return APPLIED_FIXES.slice(-20); }
function getDiagnosticLog() { return DIAGNOSTIC_LOG.slice(-10); }

module.exports = {
  scanSystem, generateFix, fullDiagnostic,
  approveFix, rejectFix,
  getPendingFixes, getAppliedFixes, getDiagnosticLog
};
