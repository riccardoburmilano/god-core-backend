// ============================================================
// authMiddleware.js — JWT middleware per endpoint protetti
// ============================================================

const { clinicVerifyToken, staffVerifyToken } = require('./db');

// Verifica token admin (clinic login)
function requireAdmin(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token mancante' });
  }
  const token = auth.slice(7);
  const payload = clinicVerifyToken(token);
  if (!payload || payload.role !== 'ADMIN') {
    return res.status(401).json({ error: 'Token non valido o scaduto' });
  }
  req.clinic_id = payload.clinic_id;
  req.admin = true;
  next();
}

// Verifica token staff (PIN login) — async perché controlla DB
async function requireStaff(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token mancante' });
  }
  const token = auth.slice(7);
  try {
    const payload = await staffVerifyToken(token);
    if (!payload) {
      return res.status(401).json({ error: 'Sessione scaduta — effettua di nuovo il login' });
    }
    req.staff_id = payload.staff_id;
    req.clinic_id = payload.clinic_id;
    req.staff_role = payload.role;
    req.staff_name = payload.name;
    next();
  } catch {
    return res.status(401).json({ error: 'Token non valido' });
  }
}

// Verifica ruolo specifico (es. solo CEO)
function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.staff_role)) {
      return res.status(403).json({ error: `Accesso riservato a: ${roles.join(', ')}` });
    }
    next();
  };
}

module.exports = { requireAdmin, requireStaff, requireRole };
