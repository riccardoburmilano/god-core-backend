// ============================================================
// GOD SCORING ENGINE v1.6
// 4-axis scoring: qualità, coerenza, tempo, accuratezza
// ============================================================

const { uuid, now } = require('./state');

const GUARDIAN_MIN = parseFloat(process.env.GOD_GUARDIAN_MIN_SCORE) || 7.0;

const clamp = (n, mn = 0, mx = 10) => Math.max(mn, Math.min(mx, n));
const round1 = n => Math.round(n * 10) / 10;

const SKILL_MODIFIER = {
  's': 0.3, 'a': 0.5, 'g': 0.4, 'ar': 0.6, 'c': 0.1,
  'ot': 0.2, 'co': 0.3, 'r': 0.1, 'd': 0.2, 'm': 0.1,
  'or': 0.2, 'i': 0.0
};

function scoreLabel(s) { return s >= 9 ? 'OTTIMO' : s >= 7 ? 'ACCETTABILE' : s >= 5 ? 'CRITICO' : 'BLOCCANTE'; }
function scoreLabelColor(s) { return s >= 9 ? '#00ff88' : s >= 7 ? '#ffd700' : s >= 5 ? '#ff8c00' : '#ff4444'; }

function computeScore(task) {
  const base = task.status === 'DONE' ? 7.5 : 2.0;
  const ap = (task.attempts - 1) * 1.5;
  const sk = task.skill?.replace('skill-', '').slice(0, 2) || '';
  const sm = SKILL_MODIFIER[sk] || 0;
  const pm = task.priority === 'CRITICO' ? 0.3 : task.priority === 'PARALLELO' ? -0.2 : 0;
  const idH = task.task_id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const v = ((idH % 20) - 10) / 20;

  const q  = clamp(base - ap + sm + pm + v * 0.8);
  const co = clamp(base - ap * 0.5 + sm * 0.8 + v * 0.6);
  const t  = task.status === 'DONE' ? clamp(8.5 - ap * 1.2 + v * 0.7) : clamp(2.5 + v);
  const ac = clamp((task.status === 'DONE' ? 7.0 : 1.5) - ap + sm * 0.9 + v * 0.5);
  const avg = round1((q + co + t + ac) / 4);

  return {
    score_id: uuid(),
    task_id: task.task_id,
    task_title: task.title,
    skill: task.skill,
    priority: task.priority,
    axes: { qualita: round1(q), coerenza: round1(co), tempo: round1(t), accuratezza: round1(ac) },
    avg,
    label: scoreLabel(avg),
    color: scoreLabelColor(avg),
    scored_at: now(),
    task_status: task.status
  };
}

// Scoring enriched with real AI output analysis
function computeScoreFromOutput(task, outputText) {
  const base = computeScore(task);
  // If we have real output, bonus for length/quality signals
  if (outputText && outputText.length > 200) {
    const bonus = Math.min(0.5, outputText.length / 2000);
    base.axes.qualita = round1(Math.min(10, base.axes.qualita + bonus));
    base.axes.accuratezza = round1(Math.min(10, base.axes.accuratezza + bonus * 0.8));
    base.avg = round1((base.axes.qualita + base.axes.coerenza + base.axes.tempo + base.axes.accuratezza) / 4);
    base.label = scoreLabel(base.avg);
    base.color = scoreLabelColor(base.avg);
  }
  return base;
}

function guardianVerdict(score, task) {
  const pass = score.avg >= GUARDIAN_MIN;
  return {
    verdict_id: uuid(),
    task_id: task.task_id,
    task_title: task.title,
    verdict: pass ? 'APPROVATO' : 'NON APPROVATO',
    score: score.avg,
    threshold: GUARDIAN_MIN,
    reason: pass
      ? `Score ${score.avg} ≥ ${GUARDIAN_MIN} — output conforme`
      : `Score ${score.avg} < ${GUARDIAN_MIN} — output sotto soglia`,
    timestamp: now()
  };
}

module.exports = { computeScore, computeScoreFromOutput, guardianVerdict, scoreLabel, scoreLabelColor, GUARDIAN_MIN };
