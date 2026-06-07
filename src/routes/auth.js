// ============================================================
// routes/auth.js — Endpoint autenticazione Operantis v1.0
// ============================================================

const express = require('express');
const router = express.Router();
const db = require('../modules/db');
const { requireAdmin, requireStaff, requireRole } = require('../modules/authMiddleware');

// ── CLINIC SETUP ──────────────────────────────────────────────

// Controlla se la clinica è già registrata (per mostrare onboarding o login)
router.get('/clinic/status', async (req, res) => {
  try {
    const clinic = await db.clinicGet();
    res.json({ registered: !!clinic, clinic: clinic ? { name: clinic.name, city: clinic.city } : null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Registrazione clinica (solo la prima volta)
router.post('/clinic/register', async (req, res) => {
  try {
    const existing = await db.clinicGet();
    if (existing) return res.status(409).json({ error: 'Clinica già registrata. Usa il login.' });

    const { name, city, specialties, logo_url, admin_email, admin_password } = req.body;
    if (!name || !admin_email || !admin_password) {
      return res.status(400).json({ error: 'name, admin_email e admin_password sono obbligatori' });
    }
    if (admin_password.length < 8) {
      return res.status(400).json({ error: 'Password deve essere di almeno 8 caratteri' });
    }

    const clinic = await db.clinicCreate({ name, city, specialties, logo_url, admin_email, admin_password });
    res.status(201).json({ success: true, clinic });
  } catch (err) {
    if (err.message?.includes('unique')) return res.status(409).json({ error: 'Email già registrata' });
    res.status(500).json({ error: err.message });
  }
});

// Login admin (email + password)
router.post('/clinic/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email e password obbligatori' });

    const result = await db.clinicLogin(email, password);
    if (!result) return res.status(401).json({ error: 'Credenziali non valide' });

    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Dati clinica (admin autenticato)
router.get('/clinic', requireAdmin, async (req, res) => {
  try {
    const clinic = await db.clinicGet();
    res.json(clinic);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── STAFF ─────────────────────────────────────────────────────

// Lista staff (pubblica — serve per la griglia di selezione)
router.get('/staff', async (req, res) => {
  try {
    const clinic = await db.clinicGet();
    if (!clinic) return res.status(404).json({ error: 'Clinica non configurata' });
    const staff = await db.staffList(clinic.id);
    res.json({ staff });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Crea staff (solo admin)
router.post('/staff', requireAdmin, async (req, res) => {
  try {
    const { name, role, pin, avatar_color } = req.body;
    if (!name || !role || !pin) return res.status(400).json({ error: 'name, role e pin obbligatori' });
    if (!/^\d{4}$/.test(pin)) return res.status(400).json({ error: 'PIN deve essere di 4 cifre numeriche' });
    const valid_roles = ['CEO', 'MEDICO', 'RECEPTIONIST', 'ASSISTENTE'];
    if (!valid_roles.includes(role)) return res.status(400).json({ error: `role deve essere uno tra: ${valid_roles.join(', ')}` });

    const member = await db.staffCreate({ clinic_id: req.clinic_id, name, role, pin, avatar_color });
    res.status(201).json({ success: true, staff: member });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Aggiorna staff (solo admin)
router.put('/staff/:id', requireAdmin, async (req, res) => {
  try {
    const updated = await db.staffUpdate(req.params.id, req.clinic_id, req.body);
    if (!updated) return res.status(404).json({ error: 'Staff non trovato' });
    res.json({ success: true, staff: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Aggiorna PIN staff (solo admin)
router.put('/staff/:id/pin', requireAdmin, async (req, res) => {
  try {
    const { pin } = req.body;
    if (!/^\d{4}$/.test(pin)) return res.status(400).json({ error: 'PIN deve essere di 4 cifre numeriche' });
    await db.staffUpdatePin(req.params.id, req.clinic_id, pin);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Login staff con PIN
router.post('/staff/login', async (req, res) => {
  try {
    const { staff_id, pin } = req.body;
    if (!staff_id || !pin) return res.status(400).json({ error: 'staff_id e pin obbligatori' });
    if (!/^\d{4}$/.test(pin)) return res.status(400).json({ error: 'PIN non valido' });

    const clinic = await db.clinicGet();
    if (!clinic) return res.status(404).json({ error: 'Clinica non configurata' });

    const result = await db.staffPinLogin(clinic.id, staff_id, pin);
    if (!result) return res.status(401).json({ error: 'PIN non corretto' });

    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Logout staff
router.post('/staff/logout', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ')) {
      await db.staffLogout(auth.slice(7));
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Chi sono (staff autenticato)
router.get('/staff/me', requireStaff, (req, res) => {
  res.json({ staff_id: req.staff_id, clinic_id: req.clinic_id, role: req.staff_role, name: req.staff_name });
});

// ── PATIENTS ──────────────────────────────────────────────────

// Lista pazienti (staff autenticato)
router.get('/patients', requireStaff, async (req, res) => {
  try {
    const { limit, search } = req.query;
    const patients = await db.patientList(req.clinic_id, { limit: parseInt(limit) || 50, search });
    res.json({ patients, total: patients.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Singolo paziente
router.get('/patients/:id', requireStaff, async (req, res) => {
  try {
    const patient = await db.patientGet(req.params.id, req.clinic_id);
    if (!patient) return res.status(404).json({ error: 'Paziente non trovato' });
    res.json(patient);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Crea paziente (medico e CEO)
router.post('/patients', requireStaff, requireRole('MEDICO', 'CEO'), async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'name obbligatorio' });
    const patient = await db.patientCreate(req.clinic_id, req.body);
    res.status(201).json({ success: true, patient });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Aggiorna paziente
router.put('/patients/:id', requireStaff, requireRole('MEDICO', 'CEO'), async (req, res) => {
  try {
    const patient = await db.patientUpdate(req.params.id, req.clinic_id, req.body);
    if (!patient) return res.status(404).json({ error: 'Paziente non trovato' });
    res.json({ success: true, patient });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Elimina paziente (solo CEO)
router.delete('/patients/:id', requireStaff, requireRole('CEO'), async (req, res) => {
  try {
    await db.patientDelete(req.params.id, req.clinic_id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
