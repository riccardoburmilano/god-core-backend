// ============================================================
// SKILL FORGER v1.0
// GOD crea nuove skill autonomamente quando manca la skill giusta
// ============================================================

const Groq = require('groq-sdk');
const { logWrite, memoryWrite, uuid, now } = require('./state');

const client = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = process.env.GOD_MODEL || 'llama-3.3-70b-versatile';

// Registry delle skill forgiate — persiste in memoria
const FORGED_SKILLS = {};

// Skill esistenti — Forger non le ricrea
const EXISTING_SKILLS = new Set([
  'skill-stratega','skill-architetto','skill-orchestratore','skill-creatore',
  'skill-analista','skill-ottimizzatore','skill-guardiano','skill-contabile',
  'skill-ricercatore','skill-diagnostica','skill-memoria','skill-interfaccia'
]);

// ── Analizza se serve una nuova skill ────────────────────────
async function shouldForge(taskTitle, assignedSkill) {
  const prompt = `Sei GOD Skill Analyzer. Analizza questo task e la skill assegnata.

TASK: "${taskTitle}"
SKILL ASSEGNATA: ${assignedSkill}

SKILL DISPONIBILI: stratega, architetto, orchestratore, creatore, analista, ottimizzatore, guardiano, contabile, ricercatore, diagnostica, memoria, interfaccia.

Rispondi SOLO con JSON valido, niente altro:
{
  "skill_adeguata": true/false,
  "motivo": "spiegazione breve",
  "skill_suggerita": "nome-skill-esistente o null",
  "nuova_skill_necessaria": true/false,
  "nome_nuova_skill": "skill-nome" o null,
  "dominio_nuova_skill": "descrizione del dominio specializzato"
}`;

  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 400,
    messages: [
      { role: 'system', content: 'Sei un analizzatore di skill AI. Rispondi SOLO con JSON valido.' },
      { role: 'user', content: prompt }
    ]
  });

  const text = response.choices[0]?.message?.content || '{}';
  try {
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch {
    return { skill_adeguata: true, nuova_skill_necessaria: false };
  }
}

// ── Forgia una nuova skill ────────────────────────────────────
async function forgeSkill(nome, dominio, taskEsempio) {
  const forgeId = uuid();

  const prompt = `Sei GOD Skill Forger. Crea una nuova skill AI specializzata.

NOME SKILL: ${nome}
DOMINIO: ${dominio}
TASK DI ESEMPIO: ${taskEsempio}

Genera un system prompt professionale e completo per questa skill.
Il system prompt deve:
- Definire chiaramente il ruolo e la specializzazione
- Specificare il formato dell'output atteso
- Essere ottimizzato per task nel dominio specificato
- Essere in italiano
- Essere tra 150 e 300 parole

Rispondi SOLO con il system prompt, senza introduzioni o spiegazioni.`;

  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 600,
    messages: [
      { role: 'system', content: 'Sei un esperto di prompt engineering per sistemi AI agentivi. Genera system prompt precisi e professionali.' },
      { role: 'user', content: prompt }
    ]
  });

  const systemPrompt = response.choices[0]?.message?.content || '';
  const tokens = (response.usage?.prompt_tokens || 0) + (response.usage?.completion_tokens || 0);

  const skill = {
    forge_id: forgeId,
    nome,
    dominio,
    system_prompt: systemPrompt,
    forged_at: now(),
    task_esempio: taskEsempio,
    utilizzi: 0,
    tokens_forge: tokens,
    status: 'ATTIVA'
  };

  FORGED_SKILLS[nome] = skill;

  logWrite('SKILL_FORGER', 'forge_skill', { nome, dominio }, { forge_id: forgeId, tokens }, 'SUCCESS');
  memoryWrite({
    mem_id: uuid(),
    type: 'SKILL_FORGED',
    skill_nome: nome,
    dominio,
    forged_at: now(),
    tokens
  });

  return skill;
}

// ── Esegui task con skill forgiata ───────────────────────────
async function runForgedSkill(skillNome, task, context = '') {
  const skill = FORGED_SKILLS[skillNome];
  if (!skill) throw new Error(`Skill ${skillNome} non trovata nel registry`);

  skill.utilizzi++;

  const userMsg = `TASK: ${task.title}\n\nCONTESTO: ${context || 'Nessun contesto.'}\n\nEsegui il task secondo la tua specializzazione.`;

  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: parseInt(process.env.GOD_MAX_TOKENS) || 2000,
    messages: [
      { role: 'system', content: skill.system_prompt },
      { role: 'user', content: userMsg }
    ]
  });

  const outputText = response.choices[0]?.message?.content || '';
  const tokens = (response.usage?.prompt_tokens || 0) + (response.usage?.completion_tokens || 0);

  logWrite('SKILL_FORGER', 'run_forged', { skill: skillNome, task_id: task.task_id }, { tokens, length: outputText.length }, 'SUCCESS');

  return { outputText, tokens, skill_used: skillNome, forged: true };
}

// ── Pipeline completa: analizza → forgia se serve → esegui ──
async function forgeAndRun(task, assignedSkill) {
  const forgeId = uuid();
  const log = {
    forge_session_id: forgeId,
    task_id: task.task_id,
    task_title: task.title,
    started_at: now(),
    steps: []
  };

  // Step 1: Analisi
  log.steps.push({ step: 1, action: 'ANALYZE', timestamp: now() });
  const analysis = await shouldForge(task.title, assignedSkill);
  log.steps.push({ step: 1, result: analysis });

  // Step 2: Skill esistente e adeguata → non serve niente
  const needsForge = !analysis.skill_adeguata || analysis.nuova_skill_necessaria;
  if (!needsForge) {
    return {
      forged: false,
      analysis,
      message: 'Skill esistente adeguata — nessuna nuova skill necessaria',
      log
    };
  }
  // Se skill non adeguata ma nessun nome suggerito → genera nome automatico
  if (!analysis.nome_nuova_skill && !analysis.skill_adeguata) {
    analysis.nuova_skill_necessaria = true;
    const dominio = analysis.skill_suggerita
      ? 'Skill specializzata basata su ' + analysis.skill_suggerita + ' con dominio: ' + (analysis.motivo||'contesto specifico')
      : analysis.motivo || 'Skill specializzata per task complessi';
    const slug = dominio.toLowerCase().replace(/[^a-z ]/g,'').split(' ').filter(Boolean).slice(0,3).join('-');
    analysis.nome_nuova_skill = 'skill-' + slug;
    analysis.dominio_nuova_skill = dominio;
  }

  // Step 3: Skill già forgiata in precedenza?
  const nomeNuova = analysis.nome_nuova_skill;
  if (nomeNuova && FORGED_SKILLS[nomeNuova]) {
    log.steps.push({ step: 3, action: 'USE_CACHED', skill: nomeNuova });
    const result = await runForgedSkill(nomeNuova, task);
    return { forged: true, cached: true, skill: FORGED_SKILLS[nomeNuova], result, analysis, log };
  }

  // Step 4: Forgia nuova skill
  if (analysis.nuova_skill_necessaria && nomeNuova) {
    log.steps.push({ step: 4, action: 'FORGE', skill: nomeNuova, domain: analysis.dominio_nuova_skill });
    const nuovaSkill = await forgeSkill(nomeNuova, analysis.dominio_nuova_skill, task.title);
    log.steps.push({ step: 4, result: 'FORGED', forge_id: nuovaSkill.forge_id });

    // Step 5: Esegui con la nuova skill
    log.steps.push({ step: 5, action: 'EXECUTE', skill: nomeNuova });
    const result = await runForgedSkill(nomeNuova, task);
    log.completed_at = now();

    return {
      forged: true,
      cached: false,
      skill: nuovaSkill,
      result,
      analysis,
      log
    };
  }

  return { forged: false, analysis, message: 'Nessuna azione necessaria', log };
}

// ── Getters ───────────────────────────────────────────────────
function getForgedSkills() { return Object.values(FORGED_SKILLS); }
function getForgedSkill(nome) { return FORGED_SKILLS[nome] || null; }
function getForgedSkillPrompt(nome) { return FORGED_SKILLS[nome]?.system_prompt || null; }

module.exports = {
  shouldForge, forgeSkill, runForgedSkill, forgeAndRun,
  getForgedSkills, getForgedSkill, getForgedSkillPrompt,
  FORGED_SKILLS
};
