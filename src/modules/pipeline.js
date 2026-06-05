// ============================================================
// GOD PIPELINE EXECUTOR v2.0
// Groq API — gratis, niente carta di credito
// ============================================================

const Groq = require('groq-sdk');
const { stateRead, stateWrite, modPing, logWrite, taskUpdate, creditSpend,
        scoreWrite, diagnoseWrite, verdictWrite, memoryWrite, routeWrite, uuid, now } = require('./state');
const { classifyIntent, autoPipelineFromText } = require('./router');
const { computeScoreFromOutput, guardianVerdict } = require('./scoring');

const client = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = process.env.GOD_MODEL || 'llama-3.3-70b-versatile';
const MAX_TOKENS = parseInt(process.env.GOD_MAX_TOKENS) || 2000;

// ── Skill system prompts ──────────────────────────────────────
const SKILL_PROMPTS = {
  'skill-stratega': `Sei Skill Stratega del sistema GOD. Il tuo ruolo è pianificare e definire obiettivi.
Analizza il task e produci un piano strutturato con: obiettivo principale, step operativi (3-5), rischi identificati, metriche di successo.
Rispondi in italiano. Sii conciso e operativo. Formato: sezioni chiare con titoli.`,

  'skill-architetto': `Sei Skill Architetto del sistema GOD. Il tuo ruolo è progettare architetture e blueprint.
Analizza il task e produci: schema architetturale, moduli coinvolti, dipendenze, flusso dati, contratti inter-modulo.
Rispondi in italiano. Usa diagrammi testuali quando utile (ASCII). Sii preciso e tecnico.`,

  'skill-orchestratore': `Sei Skill Orchestratore del sistema GOD. Il tuo ruolo è coordinare l'esecuzione di pipeline.
Analizza il task e produci: sequenza di esecuzione, skill coinvolte, dipendenze, gestione errori, piano di rollback.
Rispondi in italiano. Formato strutturato con priorità chiare.`,

  'skill-creatore': `Sei Skill Creatore del sistema GOD. Il tuo ruolo è produrre contenuti e output operativi.
Analizza il task e produci l'output richiesto: testo, documento, contenuto, scheda prodotto o qualsiasi artefatto richiesto.
Rispondi in italiano. Produci output pronto all'uso, non bozze. Qualità professionale.`,

  'skill-analista': `Sei Skill Analista del sistema GOD. Il tuo ruolo è valutare qualità e performance.
Analizza il task e produci: punteggio su 4 assi (qualità 0-10, coerenza 0-10, tempo 0-10, accuratezza 0-10), problemi identificati, raccomandazioni.
Rispondi in italiano. Sii oggettivo e basati su criteri misurabili.`,

  'skill-ottimizzatore': `Sei Skill Ottimizzatore del sistema GOD. Il tuo ruolo è migliorare output esistenti.
Analizza il task e produci: versione migliorata dell'output, lista delle modifiche apportate, motivazione di ogni miglioramento.
Rispondi in italiano. Non creare da zero: migliora ciò che esiste.`,

  'skill-guardiano': `Sei Skill Guardiano del sistema GOD. Il tuo ruolo è approvare o bloccare output.
Analizza il task e produci: verdetto APPROVATO o NON APPROVATO, checklist di validazione (integrità, conformità, compliance, efficacia), azioni richieste se bloccato.
Rispondi in italiano. Sii rigoroso. Il verdetto deve essere binario e motivato.`,

  'skill-contabile': `Sei Skill Contabile del sistema GOD. Il tuo ruolo è gestire costi ed efficienza.
Analizza il task e produci: stima costi, analisi efficienza, anomalie economiche, raccomandazioni di ottimizzazione budget.
Rispondi in italiano. Ogni costo deve essere numerico. Sii preciso.`,

  'skill-ricercatore': `Sei Skill Ricercatore del sistema GOD. Il tuo ruolo è trovare dati e insight.
Analizza il task e produci: dati rilevanti trovati, fonti classificate (primaria/secondaria/dubbia), trend identificati, gap informativi.
Rispondi in italiano. Classifica ogni affermazione per confidenza (alta/media/bassa).`,

  'skill-diagnostica': `Sei Skill Diagnostica del sistema GOD. Il tuo ruolo è identificare problemi e root cause.
Analizza il task e produci: classificazione errore (E1-E10), analisi 5 Perché, root cause identificata, fix proposti con livello di confidenza.
Rispondi in italiano. Tassonomia errori: E1=input, E2=routing, E3=contesto, E4=qualità, E5=costo, E6=tempo, E7=sicurezza, E8=dipendenze, E9=memoria, E10=sistema.`,

  'skill-memoria': `Sei Skill Memoria del sistema GOD. Il tuo ruolo è conservare e recuperare pattern.
Analizza il task e produci: pattern identificati, connessioni con dati storici, trend emergenti, raccomandazioni basate su storico.
Rispondi in italiano. Ogni pattern deve avere frequenza e impatto.`,

  'skill-interfaccia': `Sei Skill Interfaccia del sistema GOD. Il tuo ruolo è comunicare con l'utente.
Analizza il task e produci: risposta chiara e leggibile per l'utente finale, traduzione di output tecnici in linguaggio comprensibile.
Rispondi in italiano. Tono professionale ma accessibile.`,
};

function getSkillPrompt(skill) {
  return SKILL_PROMPTS[skill] || SKILL_PROMPTS['skill-creatore'];
}

// ── Core pipeline executor ────────────────────────────────────
async function runSkill(task, skillName, context = '') {
  const systemPrompt = getSkillPrompt(skillName);
  const userMsg = `TASK: ${task.title}\n\nCONTESTO: ${context || 'Nessun contesto aggiuntivo.'}\n\nEsegui il task secondo il tuo ruolo.`;

  modPing(skillName.replace('skill-', '').toUpperCase(), 0);

  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMsg }
    ]
  });

  const outputText = response.choices[0]?.message?.content || '';
  const tokens = (response.usage?.prompt_tokens || 0) + (response.usage?.completion_tokens || 0);

  modPing(skillName.replace('skill-', '').toUpperCase(), 5);
  logWrite(skillName.toUpperCase().replace('SKILL-',''), 'execute', { task_id: task.task_id }, { tokens, length: outputText.length }, 'SUCCESS');

  return { outputText, tokens };
}

async function executeTask(task) {
  const s = stateRead();

  // Route classification
  const intent = classifyIntent(task.title);
  routeWrite({ route_id: uuid(), task_id: task.task_id, task_title: task.title, intent_type: intent.type, skill_assigned: task.skill || intent.skill, timestamp: now() });

  // Update task status
  taskUpdate(task.task_id, { status: 'RUNNING', attempts: (task.attempts || 0) + 1 });
  stateWrite('ORCHESTRATORE', { system: { ...s.system, status: 'RUNNING', active_pipeline: task.task_id } });

  try {
    const skill = task.skill || intent.skill;
    let outputText = '';
    let totalTokens = 0;
    let context = '';

    // If task has a pipeline, run each skill in sequence
    if (task.pipeline && task.pipeline.length > 0) {
      for (const pipeSkill of task.pipeline) {
        const result = await runSkill(task, pipeSkill, context);
        context = result.outputText; // chain output as context for next skill
        totalTokens += result.tokens;
        outputText = result.outputText; // final output is last skill's output
      }
    } else {
      // Single skill execution
      const result = await runSkill(task, skill, context);
      outputText = result.outputText;
      totalTokens = result.tokens;
    }

    // Compute score from real output
    const updatedTask = { ...task, status: 'DONE', attempts: (task.attempts || 0) + 1, output: outputText };
    const score = computeScoreFromOutput(updatedTask, outputText);
    scoreWrite(score);

    // Credit spend
    const creditTx = creditSpend(task.task_id, totalTokens, updatedTask.attempts, task.title);

    // Guardian verdict
    const verdict = guardianVerdict(score, updatedTask);
    verdictWrite(verdict);

    // Memory write
    memoryWrite({
      mem_id: uuid(), task_id: task.task_id, task_title: task.title,
      skill, score: score.avg, verdict: verdict.verdict,
      pattern: intent.type, tokens: totalTokens, timestamp: now()
    });

    // Update task final state
    taskUpdate(task.task_id, { status: 'DONE', done_at: now(), output: outputText, error: null });

    // Update system state
    const cs = stateRead();
    stateWrite('ORCHESTRATORE', {
      system: { ...cs.system, status: 'IDLE', active_pipeline: null },
      metrics: {
        ...cs.metrics,
        tasks_done: (cs.metrics.tasks_done || 0) + 1,
        tasks_pending: Math.max(0, (cs.metrics.tasks_pending || 0) - 1)
      },
      scoring: {
        latest_score: score,
        bottleneck: score.avg < 7 ? { task_id: task.task_id, title: task.title, avg: score.avg } : cs.scoring?.bottleneck,
        trend: [...(cs.scoring?.trend || []).slice(-11), { avg: score.avg }]
      }
    });

    logWrite('ORCHESTRATORE', 'task_complete', { task_id: task.task_id }, { score: score.avg, verdict: verdict.verdict, tokens: totalTokens }, 'SUCCESS');

    return { success: true, output: outputText, score, verdict, creditTx, tokens: totalTokens };

  } catch (err) {
    // Diagnostics on failure
    const errorCode = err.status === 429 ? 'E5' : err.status === 401 ? 'E7' : 'E10';
    diagnoseWrite({
      diag_id: uuid(), task_id: task.task_id, task_title: task.title,
      error_code: errorCode, error_name: err.name || 'UnknownError',
      message: err.message?.slice(0, 300) || 'Unknown error',
      urgency: 'CRITICA', auto_repair_triggered: false, timestamp: now()
    });

    taskUpdate(task.task_id, { status: 'FAILED', error: err.message?.slice(0, 300) });

    const cs = stateRead();
    stateWrite('DIAGNOSTICA', {
      system: { ...cs.system, status: 'IDLE', active_pipeline: null },
      metrics: {
        ...cs.metrics,
        tasks_failed: (cs.metrics.tasks_failed || 0) + 1,
        tasks_pending: Math.max(0, (cs.metrics.tasks_pending || 0) - 1)
      }
    });

    logWrite('DIAGNOSTICA', 'task_failed', { task_id: task.task_id }, { error: err.message }, 'ERROR');

    return { success: false, error: err.message, errorCode };
  }
}

module.exports = { executeTask, runSkill };
