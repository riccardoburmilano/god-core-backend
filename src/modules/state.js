// ============================================================
// GOD.STATE — Shared State Engine
// In produzione: sostituire con Redis o PostgreSQL
// ============================================================

const { v4: uuidv4 } = require('uuid');

const GOD_VERSION = process.env.GOD_VERSION || '2.0.0';
const BUDGET_INITIAL = parseInt(process.env.GOD_BUDGET_INITIAL) || 10000;

const MODULES = [
  'STRATEGA','ARCHITETTO','ORCHESTRATORE','CREATORE','ANALISTA',
  'OTTIMIZZATORE','GUARDIANO','CONTABILE','RICERCATORE','DIAGNOSTICA',
  'MEMORIA','INTERFACCIA','ROUTER','VALUE_DAEMON'
];

const ALWAYS_ACTIVE = new Set([
  'ANALISTA','CONTABILE','DIAGNOSTICA','MEMORIA',
  'INTERFACCIA','ROUTER','VALUE_DAEMON','GUARDIANO','OTTIMIZZATORE'
]);

function initModules() {
  return Object.fromEntries(MODULES.map(n => [n, {
    status: ALWAYS_ACTIVE.has(n) ? 'ACTIVE' : 'STANDBY',
    last_active: null,
    health: 100,
    task_count: 0
  }]));
}

// In-memory store (Railway = ephemeral disk, use this for v2.0)
let STATE = null;
let TASKS = [];
let LOGS = [];
let SCORES = [];
let DIAGNOSES = [];
let MEMORY = [];
let VERDICTS = [];
let CREDITS = null;
let ROUTES = [];
let DAEMON_LOG = [];

function now() { return new Date().toISOString(); }
function uuid() { return 'god-' + uuidv4().replace(/-/g,'').slice(0,16); }

function initState() {
  return {
    version: 0,
    last_updated: now(),
    updated_by: 'SYSTEM',
    god_version: GOD_VERSION,
    system: { status: 'IDLE', mode: 'NORMAL', active_pipeline: null, active_app: null },
    modules: initModules(),
    context: { active_project: null, active_user: 'operator', active_app: 'GOD_CORE' },
    metrics: {
      tasks_total: 0, tasks_done: 0, tasks_failed: 0, tasks_pending: 0,
      credits_balance: BUDGET_INITIAL, credits_spent: 0,
      avg_score: null, scores_total: 0,
      daemon_ticks: 0, daemon_actions: 0, api_calls: 0,
      pipelines_generated: 0, uptime_start: now()
    },
    flags: {
      daemon_active: true, smart_routing: true, auto_repair: true,
      guardian_gate: true, scoring_active: true, api_layer: true, auto_pipeline: true
    },
    scoring: { latest_score: null, bottleneck: null, trend: [] },
    daemon: { status: 'STOPPED', last_tick: null, tick_count: 0, last_action: null, mode_history: [] },
    api: { total_calls: 0, last_call: null, endpoints_hit: {} },
    apps: { registered: ['operantis','notantis','mercantis','creatoris','adminis'], active_sessions: {} },
    snapshots: []
  };
}

function initCredits() {
  return { balance: BUDGET_INITIAL, total_spent: 0, history: [] };
}

// ── State read/write ──────────────────────────────────────────
function stateRead() {
  if (!STATE) STATE = initState();
  return STATE;
}

function deepMerge(target, source) {
  const result = { ...target };
  for (const k of Object.keys(source)) {
    if (source[k] && typeof source[k] === 'object' && !Array.isArray(source[k])) {
      result[k] = deepMerge(target[k] || {}, source[k]);
    } else {
      result[k] = source[k];
    }
  }
  return result;
}

function stateWrite(module, patch) {
  const cur = stateRead();
  const snap = { version: cur.version, timestamp: cur.last_updated, updated_by: cur.updated_by, diff_keys: Object.keys(patch) };
  const snaps = [...(cur.snapshots || []), snap].slice(-20);
  STATE = deepMerge(cur, patch);
  STATE.version = (cur.version || 0) + 1;
  STATE.last_updated = now();
  STATE.updated_by = module;
  STATE.snapshots = snaps;
  return STATE;
}

function modPing(name, healthDelta = 0) {
  const s = stateRead();
  const mod = s.modules[name] || { status: 'UNKNOWN', last_active: null, health: 100, task_count: 0 };
  const h = Math.max(0, Math.min(100, mod.health + healthDelta));
  stateWrite(name, {
    modules: {
      ...s.modules,
      [name]: { ...mod, last_active: now(), health: h, task_count: (mod.task_count || 0) + 1, status: h < 20 ? 'ERROR' : h < 35 ? 'DEGRADED' : 'ACTIVE' }
    }
  });
}

// ── Logs ─────────────────────────────────────────────────────
function logWrite(module, action, input, output, status) {
  LOGS.push({ id: uuid(), timestamp: now(), module, action, input: JSON.stringify(input).slice(0, 200), output: JSON.stringify(output).slice(0, 200), status });
  if (LOGS.length > 500) LOGS.splice(0, 100);
}

// ── Tasks ─────────────────────────────────────────────────────
function tasksRead() { return TASKS; }

function taskCreate(data) {
  const task = {
    task_id: uuid(),
    title: data.title,
    skill: data.skill || 'skill-creatore',
    priority: data.priority || 'IMPORTANTE',
    app_id: data.app_id || null,
    status: 'PENDING',
    attempts: 0,
    created_at: now(),
    done_at: null,
    output: null,
    pipeline: data.pipeline || null,
    pipeline_type: data.pipeline_type || null,
    error: null
  };
  TASKS.push(task);
  if (TASKS.length > 500) TASKS.splice(0, 100);
  const s = stateRead();
  stateWrite('ORCHESTRATORE', { metrics: { ...s.metrics, tasks_total: (s.metrics.tasks_total || 0) + 1, tasks_pending: (s.metrics.tasks_pending || 0) + 1 } });
  logWrite('ORCHESTRATORE', 'task_create', { task_id: task.task_id, title: task.title }, { status: 'PENDING' }, 'SUCCESS');
  return task;
}

function taskUpdate(task_id, patch) {
  const idx = TASKS.findIndex(t => t.task_id === task_id);
  if (idx === -1) return null;
  TASKS[idx] = { ...TASKS[idx], ...patch };
  return TASKS[idx];
}

// ── Credits ───────────────────────────────────────────────────
function creditsRead() {
  if (!CREDITS) CREDITS = initCredits();
  return CREDITS;
}

function creditSpend(task_id, tokens, attempts, label) {
  const p = creditsRead();
  const COST_PER_TOKEN = 0.001;
  const COST_OVERHEAD = 0.5;
  const ct = tokens * COST_PER_TOKEN;
  const ca = Math.max(0, attempts - 1) * 1.0;
  const total = ct + ca + COST_OVERHEAD;
  const alert = p.balance - total < p.balance * 0.1 ? 'BLOCCO' : total > 30 ? 'CRITICO' : total > 24 ? 'ATTENZIONE' : 'NORMALE';
  const tx = { tx_id: uuid(), task_id, label, tokens, attempts, cost_tokens: ct, cost_attempts: ca, overhead: COST_OVERHEAD, cost_total: total, alert, timestamp: now(), balance_after: p.balance - total };
  p.balance -= total;
  p.total_spent += total;
  p.history.push(tx);
  if (p.history.length > 300) p.history.splice(0, 50);
  const s = stateRead();
  stateWrite('CONTABILE', { metrics: { ...s.metrics, credits_balance: p.balance, credits_spent: p.total_spent } });
  return tx;
}

function creditTopUp(amount) {
  const p = creditsRead();
  p.balance += amount;
  const s = stateRead();
  stateWrite('CONTABILE', { metrics: { ...s.metrics, credits_balance: p.balance } });
  return p;
}

// ── Scores ────────────────────────────────────────────────────
function scoreWrite(score) {
  SCORES.push(score);
  if (SCORES.length > 400) SCORES.splice(0, 50);
}
function scoresRead() { return SCORES; }

// ── Diagnoses ─────────────────────────────────────────────────
function diagnoseWrite(d) {
  DIAGNOSES.push(d);
  if (DIAGNOSES.length > 200) DIAGNOSES.splice(0, 50);
}
function diagnosesRead() { return DIAGNOSES; }

// ── Memory ────────────────────────────────────────────────────
function memoryWrite(record) {
  MEMORY.push(record);
  if (MEMORY.length > 600) MEMORY.splice(0, 100);
}
function memoryRead() { return MEMORY; }

// ── Verdicts ─────────────────────────────────────────────────
function verdictWrite(v) {
  VERDICTS.push(v);
  if (VERDICTS.length > 200) VERDICTS.splice(0, 50);
}
function verdictsRead() { return VERDICTS; }

// ── Routes ────────────────────────────────────────────────────
function routeWrite(r) {
  ROUTES.push(r);
  if (ROUTES.length > 200) ROUTES.splice(0, 50);
}
function routesRead() { return ROUTES; }

// ── Daemon Log ────────────────────────────────────────────────
function daemonLogWrite(entry) {
  DAEMON_LOG.push(entry);
  if (DAEMON_LOG.length > 200) DAEMON_LOG.splice(0, 50);
}
function daemonLogRead() { return DAEMON_LOG; }

// ── API call tracker ─────────────────────────────────────────
function apiCallTrack(method, path) {
  const s = stateRead();
  const ep = { ...(s.api?.endpoints_hit || {}) };
  ep[path] = (ep[path] || 0) + 1;
  stateWrite('API_LAYER', {
    api: { total_calls: (s.api?.total_calls || 0) + 1, last_call: { method, path, timestamp: now() }, endpoints_hit: ep },
    metrics: { ...s.metrics, api_calls: (s.metrics.api_calls || 0) + 1 }
  });
}

module.exports = {
  stateRead, stateWrite, modPing, logWrite,
  tasksRead, taskCreate, taskUpdate,
  creditsRead, creditSpend, creditTopUp,
  scoreWrite, scoresRead,
  diagnoseWrite, diagnosesRead,
  memoryWrite, memoryRead,
  verdictWrite, verdictsRead,
  routeWrite, routesRead,
  daemonLogWrite, daemonLogRead,
  apiCallTrack,
  now, uuid
};
