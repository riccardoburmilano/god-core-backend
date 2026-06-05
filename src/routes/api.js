// ============================================================
// GOD API ROUTES v2.0
// Tutti gli endpoint REST del sistema GOD
// ============================================================

const express = require('express');
const router = express.Router();

const {
  stateRead, stateWrite, tasksRead, taskCreate, taskUpdate,
  creditsRead, creditTopUp, scoresRead, diagnosesRead,
  memoryRead, verdictsRead, routesRead, daemonLogRead,
  logWrite, apiCallTrack, uuid, now
} = require('../modules/state');

const { classifyIntent, autoPipelineFromText } = require('../modules/router');
const { executeTask } = require('../modules/pipeline');
const daemon = require('../daemon/valueDaemon');

// Middleware: track every API call
router.use((req, res, next) => {
  apiCallTrack(req.method, req.path);
  next();
});

// ── HEALTH ────────────────────────────────────────────────────
router.get('/health', (req, res) => {
  const s = stateRead();
  res.json({ status: 'GOD ONLINE', version: s.god_version || '2.0.0', mode: s.system?.mode, uptime: s.metrics?.uptime_start, timestamp: now() });
});

// ── STATE ─────────────────────────────────────────────────────
router.get('/state', (req, res) => {
  res.json(stateRead());
});

// ── TASKS ─────────────────────────────────────────────────────
router.get('/tasks', (req, res) => {
  let tasks = tasksRead();
  if (req.query.status) tasks = tasks.filter(t => t.status === req.query.status.toUpperCase());
  if (req.query.skill) tasks = tasks.filter(t => t.skill === req.query.skill);
  if (req.query.app_id) tasks = tasks.filter(t => t.app_id === req.query.app_id);
  const limit = parseInt(req.query.limit) || 50;
  res.json({ tasks: tasks.slice(-limit), total: tasks.length });
});

router.post('/tasks', async (req, res) => {
  const { title, skill, priority, app_id } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });

  const intent = classifyIntent(title);
  const task = taskCreate({
    title,
    skill: skill || intent.skill,
    priority: priority || 'IMPORTANTE',
    app_id: app_id || null
  });

  logWrite('API_LAYER', 'task_created', { title }, { task_id: task.task_id }, 'SUCCESS');
  res.status(201).json({ task, intent });
});

router.get('/tasks/:id', (req, res) => {
  const task = tasksRead().find(t => t.task_id === req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json(task);
});

router.post('/tasks/:id/run', async (req, res) => {
  const task = tasksRead().find(t => t.task_id === req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  if (task.status === 'RUNNING') return res.status(409).json({ error: 'Task already running' });

  if (!process.env.GROQ_API_KEY) {
    return res.status(503).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  // Run async, return immediately
  const result = await executeTask(task);
  const updatedTask = tasksRead().find(t => t.task_id === req.params.id);
  res.json({ task: updatedTask, result });
});

// ── SCORES ────────────────────────────────────────────────────
router.get('/scores', (req, res) => {
  const limit = parseInt(req.query.limit) || 30;
  const scores = scoresRead().slice(-limit);
  const avg = scores.length ? scores.reduce((a, s) => a + s.avg, 0) / scores.length : null;
  res.json({ scores, total: scores.length, global_avg: avg ? Math.round(avg * 10) / 10 : null });
});

// ── CREDITS ───────────────────────────────────────────────────
router.get('/credits', (req, res) => {
  const c = creditsRead();
  const limit = parseInt(req.query.limit) || 30;
  res.json({ balance: c.balance, total_spent: c.total_spent, history: c.history.slice(-limit) });
});

router.post('/credits/topup', (req, res) => {
  const { amount } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: 'amount must be > 0' });
  const credits = creditTopUp(amount);
  res.json({ balance: credits.balance, added: amount });
});

// ── LOGS ──────────────────────────────────────────────────────
router.get('/logs', (req, res) => {
  const { stateRead: sr } = require('../modules/state');
  // Logs are in module — import directly
  const { LOGS } = require('../modules/state'); // won't work — use alternative
  // Access via state module export
  const allLogs = global.__GOD_LOGS || [];
  const limit = parseInt(req.query.limit) || 50;
  const module = req.query.module;
  let logs = allLogs;
  if (module) logs = logs.filter(l => l.module === module.toUpperCase());
  res.json({ logs: logs.slice(-limit), total: logs.length });
});

// ── DIAGNOSES ─────────────────────────────────────────────────
router.get('/diagnoses', (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  res.json({ diagnoses: diagnosesRead().slice(-limit), total: diagnosesRead().length });
});

// ── MEMORY ────────────────────────────────────────────────────
router.get('/memory', (req, res) => {
  const limit = parseInt(req.query.limit) || 30;
  res.json({ records: memoryRead().slice(-limit), total: memoryRead().length });
});

// ── VERDICTS ─────────────────────────────────────────────────
router.get('/verdicts', (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  res.json({ verdicts: verdictsRead().slice(-limit), total: verdictsRead().length });
});

// ── ROUTES ────────────────────────────────────────────────────
router.get('/routes', (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  res.json({ routes: routesRead().slice(-limit), total: routesRead().length });
});

// ── PIPELINE AUTO ─────────────────────────────────────────────
router.post('/pipeline/auto', async (req, res) => {
  const { description, app_id } = req.body;
  if (!description) return res.status(400).json({ error: 'description is required' });

  const pipeline = autoPipelineFromText(description);
  const task = taskCreate({
    title: description,
    skill: pipeline.skills[0],
    priority: 'IMPORTANTE',
    app_id: app_id || null,
    pipeline: pipeline.skills,
    pipeline_type: pipeline.type
  });

  const s = stateRead();
  stateWrite('AUTO_PIPELINE', { metrics: { ...s.metrics, pipelines_generated: (s.metrics.pipelines_generated || 0) + 1 } });

  res.status(201).json({ task, pipeline, message: `Pipeline '${pipeline.type}' generata con ${pipeline.skills.length} skill` });
});

// ── DAEMON ────────────────────────────────────────────────────
router.get('/daemon/status', (req, res) => {
  const s = stateRead();
  res.json({ running: daemon.isRunning(), daemon: s.daemon, logs: daemonLogRead().slice(-10) });
});

router.post('/daemon/start', (req, res) => {
  const { rules } = req.body;
  const started = daemon.start(rules);
  res.json({ started, running: daemon.isRunning(), message: started ? 'VALUE_DAEMON avviato' : 'VALUE_DAEMON già attivo' });
});

router.post('/daemon/stop', (req, res) => {
  const stopped = daemon.stop();
  res.json({ stopped, running: daemon.isRunning(), message: stopped ? 'VALUE_DAEMON fermato' : 'VALUE_DAEMON non era attivo' });
});

router.post('/daemon/tick', async (req, res) => {
  const { rules } = req.body;
  const actions = await daemon.tick(rules);
  res.json({ actions, count: actions.length });
});

// ── APPS ─────────────────────────────────────────────────────
router.get('/apps', (req, res) => {
  const VERTICAL_APPS = {
    operantis:  { id: 'operantis',  name: 'Operantis',  domain: 'Gestione operativa PMI',       icon: '⚙' },
    notantis:   { id: 'notantis',   name: 'Notantis',   domain: 'Note e documentazione',         icon: '📝' },
    mercantis:  { id: 'mercantis',  name: 'Mercantis',  domain: 'E-commerce e vendite',          icon: '🛒' },
    creatoris:  { id: 'creatoris',  name: 'Creatoris',  domain: 'Contenuti e marketing',         icon: '✦' },
    adminis:    { id: 'adminis',    name: 'Adminis',    domain: 'Amministrazione e compliance',  icon: '⚖' },
  };
  const s = stateRead();
  res.json({ apps: Object.values(VERTICAL_APPS), active_sessions: s.apps?.active_sessions || {} });
});

// ── SYSTEM CONTROL ────────────────────────────────────────────
router.post('/system/reset', (req, res) => {
  stateWrite('SYSTEM', { system: { status: 'IDLE', mode: 'NORMAL', active_pipeline: null } });
  res.json({ message: 'System reset to IDLE/NORMAL' });
});

router.post('/system/mode', (req, res) => {
  const { mode } = req.body;
  const valid = ['NORMAL', 'SAFE', 'DIAGNOSTIC', 'RECOVERY'];
  if (!valid.includes(mode)) return res.status(400).json({ error: `mode must be one of: ${valid.join(', ')}` });
  const s = stateRead();
  stateWrite('OPERATOR', { system: { ...s.system, mode } });
  res.json({ mode, message: `Sistema impostato in modalità ${mode}` });
});

module.exports = router;

// ── SKILL FORGER ──────────────────────────────────────────────
const forger = require('../modules/skillForger');

router.get('/forger/skills', (req, res) => {
  res.json({ skills: forger.getForgedSkills(), total: forger.getForgedSkills().length });
});

router.post('/forger/analyze', async (req, res) => {
  const { task_title, assigned_skill } = req.body;
  if (!task_title) return res.status(400).json({ error: 'task_title required' });
  const analysis = await forger.shouldForge(task_title, assigned_skill || 'skill-creatore');
  res.json({ analysis });
});

router.post('/forger/forge', async (req, res) => {
  const { nome, dominio, task_esempio } = req.body;
  if (!nome || !dominio) return res.status(400).json({ error: 'nome e dominio richiesti' });
  const skill = await forger.forgeSkill(nome, dominio, task_esempio || 'task generico');
  res.json({ skill });
});

router.post('/forger/run', async (req, res) => {
  const { task_title, assigned_skill } = req.body;
  if (!task_title) return res.status(400).json({ error: 'task_title required' });
  const task = { task_id: require('../modules/state').uuid(), title: task_title };
  const result = await forger.forgeAndRun(task, assigned_skill || 'skill-creatore');
  res.json(result);
});
