// ============================================================
// GOD VALUE_DAEMON v1.9 — Autonomous Health Engine
// 10 regole autonome, auto-repair, mode switching
// ============================================================

const cron = require('node-cron');
const { stateRead, stateWrite, creditsRead, creditTopUp, tasksRead, memoryRead,
        logWrite, daemonLogWrite, uuid, now } = require('../modules/state');

const DAEMON_INTERVAL_MS   = parseInt(process.env.GOD_DAEMON_INTERVAL_MS)   || 15000;
const REPAIR_THRESHOLD     = parseFloat(process.env.GOD_REPAIR_THRESHOLD)   || 35;
const REPAIR_AMOUNT        = 12;
const ERROR_SPIKE_THRESHOLD= parseFloat(process.env.GOD_ERROR_SPIKE_THRESHOLD) || 0.40;
const BUDGET_SAFE_THRESHOLD= parseFloat(process.env.GOD_BUDGET_SAFE_THRESHOLD) || 0.15;
const SCORE_DRIFT_THRESHOLD= 5.5;
const MIN_HEALTH           = 30;
const BUDGET_RESTORE_AT    = 500; // crediti da aggiungere se il saldo va a zero

let daemonInterval = null;
let running = false;

// ── 10 Regole autonome ────────────────────────────────────────
async function tick(rules = {}) {
  const defaults = { R01:true,R02:true,R03:true,R04:true,R05:true,R06:true,R07:true,R08:true,R09:true,R10:true };
  const activeRules = { ...defaults, ...rules };

  const s = stateRead();
  const tasks = tasksRead();
  const credits = creditsRead();
  const mem = memoryRead();
  const scores = mem.map(m => m.score).filter(Boolean);
  const actions = [];

  // R01 — Auto-repair moduli degradati
  if (activeRules.R01) {
    const mods = { ...s.modules };
    let repaired = 0;
    for (const [name, mod] of Object.entries(mods)) {
      if (mod.health < REPAIR_THRESHOLD) {
        mods[name] = { ...mod, health: Math.min(100, mod.health + REPAIR_AMOUNT), status: 'ACTIVE' };
        repaired++;
      }
    }
    if (repaired > 0) {
      stateWrite('VALUE_DAEMON', { modules: mods });
      actions.push({ rule: 'R01', action: 'AUTO_REPAIR', detail: `${repaired} moduli riparati (+${REPAIR_AMOUNT}% health)` });
    }
  }

  // R02 — Budget basso → SAFE MODE
  if (activeRules.R02) {
    const ratio = credits.balance / (credits.balance + credits.total_spent + 1);
    if (ratio < BUDGET_SAFE_THRESHOLD && s.system?.mode === 'NORMAL') {
      stateWrite('VALUE_DAEMON', { system: { ...s.system, mode: 'SAFE' } });
      actions.push({ rule: 'R02', action: 'MODE_SAFE', detail: `Budget ${Math.round(ratio * 100)}% < ${BUDGET_SAFE_THRESHOLD * 100}%` });
    }
  }

  // R03 — Score drift → DIAGNOSTIC MODE
  if (activeRules.R03 && scores.length >= 3) {
    const recent = scores.slice(-5);
    const ra = recent.reduce((a, b) => a + b, 0) / recent.length;
    if (ra < SCORE_DRIFT_THRESHOLD && s.system?.mode === 'NORMAL') {
      stateWrite('VALUE_DAEMON', { system: { ...s.system, mode: 'DIAGNOSTIC' } });
      actions.push({ rule: 'R03', action: 'MODE_DIAGNOSTIC', detail: `Score medio recente ${ra.toFixed(1)} < ${SCORE_DRIFT_THRESHOLD}` });
    }
  }

  // R04 — Error spike → RECOVERY MODE
  if (activeRules.R04 && tasks.length >= 3) {
    const failRate = tasks.filter(t => t.status === 'FAILED').length / tasks.length;
    if (failRate > ERROR_SPIKE_THRESHOLD && s.system?.mode !== 'RECOVERY') {
      stateWrite('VALUE_DAEMON', { system: { ...s.system, mode: 'RECOVERY' } });
      actions.push({ rule: 'R04', action: 'MODE_RECOVERY', detail: `Errori ${Math.round(failRate * 100)}% > ${ERROR_SPIKE_THRESHOLD * 100}%` });
    }
  }

  // R05 — Memory purge se troppi record
  if (activeRules.R05 && mem.length > 500) {
    // Questo è gestito direttamente in state.js tramite slice
    actions.push({ rule: 'R05', action: 'MEMORY_PURGE', detail: `${mem.length} record → purgati i più vecchi` });
  }

  // R06 — Idle healing: ripristina health lentamente in idle
  if (activeRules.R06 && s.system?.status === 'IDLE') {
    const mods = { ...s.modules };
    let healed = 0;
    for (const [name, mod] of Object.entries(mods)) {
      if (mod.health < 80) {
        mods[name] = { ...mod, health: Math.min(100, mod.health + 2) };
        healed++;
      }
    }
    if (healed > 0) {
      stateWrite('VALUE_DAEMON', { modules: mods });
      actions.push({ rule: 'R06', action: 'IDLE_HEAL', detail: `+2% health su ${healed} moduli` });
    }
  }

  // R07 — Pattern escalation: errori ricorrenti
  if (activeRules.R07) {
    const failedTasks = tasks.filter(t => t.status === 'FAILED');
    if (failedTasks.length >= 5) {
      actions.push({ rule: 'R07', action: 'PATTERN_ESCALATION', detail: `${failedTasks.length} task falliti — escalation a Stratega` });
    }
  }

  // R08 — Budget restore se a zero
  if (activeRules.R08 && credits.balance <= 0) {
    creditTopUp(BUDGET_RESTORE_AT);
    actions.push({ rule: 'R08', action: 'BUDGET_RESTORE', detail: `Saldo 0 → +${BUDGET_RESTORE_AT} CR ripristinati` });
  }

  // R09 — Recovery → NORMAL se score torna sopra soglia
  if (activeRules.R09 && scores.length >= 3) {
    const recent = scores.slice(-5);
    const ra = recent.reduce((a, b) => a + b, 0) / recent.length;
    if (ra >= 7.0 && s.system?.mode === 'DIAGNOSTIC') {
      stateWrite('VALUE_DAEMON', { system: { ...s.system, mode: 'NORMAL' } });
      actions.push({ rule: 'R09', action: 'MODE_NORMAL', detail: `Score ${ra.toFixed(1)} ≥ 7.0 → tornato NORMAL` });
    }
  }

  // R10 — Heartbeat: daemon segnala di essere vivo
  if (activeRules.R10) {
    // Solo log, nessuna azione visibile
  }

  // ── Update daemon state ──────────────────────────────────────
  const cs = stateRead();
  const mh = [...(cs.daemon?.mode_history || [])];
  const modeActions = actions.filter(a => a.action.startsWith('MODE_'));
  if (modeActions.length > 0) {
    mh.push({ timestamp: now(), mode: cs.system?.mode, trigger: modeActions[0].rule });
    if (mh.length > 20) mh.splice(0, mh.length - 20);
  }

  stateWrite('VALUE_DAEMON', {
    daemon: {
      status: 'RUNNING',
      last_tick: now(),
      tick_count: (cs.daemon?.tick_count || 0) + 1,
      last_action: actions.length ? actions[actions.length - 1] : null,
      mode_history: mh
    },
    metrics: {
      ...cs.metrics,
      daemon_ticks: (cs.metrics.daemon_ticks || 0) + 1,
      daemon_actions: (cs.metrics.daemon_actions || 0) + actions.length
    },
    modules: {
      ...cs.modules,
      VALUE_DAEMON: { status: 'ACTIVE', last_active: now(), health: 100, task_count: (cs.modules?.VALUE_DAEMON?.task_count || 0) + 1 }
    }
  });

  const entry = { tick_id: uuid(), timestamp: now(), tick: cs.daemon?.tick_count || 0, actions_fired: actions.length, actions };
  daemonLogWrite(entry);
  logWrite('VALUE_DAEMON', 'tick', { tick: cs.daemon?.tick_count || 0 }, { actions: actions.length, fired: actions.map(a => a.rule) }, 'SUCCESS');

  return actions;
}

function start(rules) {
  if (running) return false;
  running = true;
  stateWrite('VALUE_DAEMON', { daemon: { status: 'RUNNING', last_tick: now() }, flags: { daemon_active: true } });

  daemonInterval = setInterval(async () => {
    try { await tick(rules); }
    catch (e) { logWrite('VALUE_DAEMON', 'tick_error', {}, { error: e.message }, 'ERROR'); }
  }, DAEMON_INTERVAL_MS);

  // Primo tick immediato
  tick(rules).catch(() => {});
  return true;
}

function stop() {
  if (!running) return false;
  running = false;
  if (daemonInterval) { clearInterval(daemonInterval); daemonInterval = null; }
  stateWrite('VALUE_DAEMON', { daemon: { status: 'STOPPED' }, flags: { daemon_active: false } });
  return true;
}

function isRunning() { return running; }

module.exports = { start, stop, isRunning, tick };
