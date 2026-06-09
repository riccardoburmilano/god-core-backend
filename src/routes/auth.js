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
    const valid_roles = ['CEO', 'MEDICO', 'RECEPTIONIST', 'ASSISTENTE', 'INFERMIERE', 'LEGALE', 'MARKETING'];
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
// ── MESSAGGI STAFF ────────────────────────────────────────────

// Invia messaggio
router.post('/messages', requireStaff, async (req, res) => {
  try {
    const { to_staff_id, message } = req.body;
    if (!to_staff_id || !message?.trim()) {
      return res.status(400).json({ error: 'to_staff_id e message obbligatori' });
    }
    const rows = await db.sql`
      INSERT INTO staff_messages (clinic_id, from_staff, to_staff, message)
      VALUES (${req.clinic_id}, ${req.staff_id}, ${to_staff_id}, ${message.trim()})
      RETURNING id, from_staff, to_staff, message, read, created_at
    `;
    res.status(201).json({ success: true, message: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Polling: messaggi non letti per lo staff loggato
router.get('/messages/unread', requireStaff, async (req, res) => {
  try {
    const rows = await db.sql`
      SELECT 
        m.id, m.message, m.created_at, m.from_staff,
        s.name as from_name, s.avatar_color, s.role as from_role
      FROM staff_messages m
      JOIN staff s ON s.id = m.from_staff
      WHERE m.to_staff = ${req.staff_id}
        AND m.clinic_id = ${req.clinic_id}
        AND m.read = FALSE
      ORDER BY m.created_at ASC
    `;
    res.json({ messages: rows, count: rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Segna come letti
router.post('/messages/read', requireStaff, async (req, res) => {
  try {
    const { message_ids } = req.body;
    if (!message_ids?.length) return res.json({ success: true });
    await db.sql`
      UPDATE staff_messages 
      SET read = TRUE 
      WHERE id = ANY(${message_ids}::uuid[])
        AND to_staff = ${req.staff_id}
    `;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cronologia chat tra due staff
router.get('/messages/thread/:other_staff_id', requireStaff, async (req, res) => {
  try {
    const { other_staff_id } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    const rows = await db.sql`
      SELECT 
        m.id, m.message, m.created_at, m.read,
        m.from_staff, m.to_staff,
        s.name as from_name, s.avatar_color, s.role as from_role
      FROM staff_messages m
      JOIN staff s ON s.id = m.from_staff
      WHERE m.clinic_id = ${req.clinic_id}
        AND (
          (m.from_staff = ${req.staff_id} AND m.to_staff = ${other_staff_id})
          OR
          (m.from_staff = ${other_staff_id} AND m.to_staff = ${req.staff_id})
        )
      ORDER BY m.created_at DESC
      LIMIT ${limit}
    `;
    // Segna come letti i messaggi ricevuti
    const unread = rows.filter(r => r.to_staff === req.staff_id && !r.read).map(r => r.id);
    if (unread.length) {
      await db.sql`UPDATE staff_messages SET read = TRUE WHERE id = ANY(${unread}::uuid[])`;
    }
    res.json({ messages: rows.reverse() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// ── STRIPE PAYMENT ────────────────────────────────────────────
// Aggiungi in fondo a src/routes/auth.js prima di module.exports = router;

const stripe = process.env.STRIPE_SECRET_KEY
  ? require('stripe')(process.env.STRIPE_SECRET_KEY)
  : null;

// BUR Society fee: 0.8% su ogni transazione
const BUR_FEE_RATE = 0.008;

// ── PAYMENT LINK (usato sia per cassa QR che per link remoto) ──
router.post('/payments/link', requireStaff, async (req, res) => {
  try {
    if (!stripe) return res.status(503).json({ error: 'Stripe non configurato — aggiungi STRIPE_SECRET_KEY su Render' });

    const { amount, description, patient_name, patient_email } = req.body;
    if (!amount || amount < 1) return res.status(400).json({ error: 'Importo obbligatorio (minimo €1)' });

    const amountCents = Math.round(parseFloat(amount) * 100);
    const burFeeCents = Math.round(amountCents * BUR_FEE_RATE);

    // Crea il Payment Link con fee BUR Society automatica
    const price = await stripe.prices.create({
      currency: 'eur',
      unit_amount: amountCents,
      product_data: {
        name: description || 'Trattamento estetico',
        metadata: { clinic_id: req.clinic_id }
      }
    });

    const paymentLinkParams = {
      line_items: [{ price: price.id, quantity: 1 }],
      metadata: {
        clinic_id: req.clinic_id,
        staff_id: req.staff_id,
        patient_name: patient_name || '',
        patient_email: patient_email || ''
      },
      after_completion: {
        type: 'hosted_confirmation',
        hosted_confirmation: {
          custom_message: `Grazie ${patient_name || ''}! Pagamento confermato. I tuoi punti 🜁 verranno accreditati a breve.`
        }
      }
    };

    // Aggiungi fee automatica se la clinica ha un account Stripe Connect
    // Per ora calcoliamo la fee ma non la detriamo automaticamente
    // (richiede onboarding clinica su Stripe Connect)
    const paymentLink = await stripe.paymentLinks.create(paymentLinkParams);

    const burFee = Math.round(amount * BUR_FEE_RATE * 100) / 100;
    const stripeFee = Math.round((amount * 0.015 + 0.25) * 100) / 100;
    const nettoClinica = Math.round((amount - burFee - stripeFee) * 100) / 100;

    res.json({
      success: true,
      payment_link: paymentLink.url,
      payment_link_id: paymentLink.id,
      amount: parseFloat(amount),
      bur_fee: burFee,
      stripe_fee: stripeFee,
      netto_clinica: nettoClinica
    });

  } catch (err) {
    console.error('[BUR OS] Stripe error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── STORICO PAGAMENTI ──────────────────────────────────────────
router.get('/payments/history', requireStaff, async (req, res) => {
  try {
    if (!stripe) return res.json({ payments: [], total: 0 });

    const limit = parseInt(req.query.limit) || 20;
    const paymentIntents = await stripe.paymentIntents.list({ limit: 100 });

    const payments = paymentIntents.data
      .filter(p => p.metadata?.clinic_id === req.clinic_id)
      .slice(0, limit)
      .map(p => ({
        id: p.id,
        amount: p.amount / 100,
        status: p.status,
        description: p.description,
        patient: p.metadata?.patient_name || 'Paziente',
        created: new Date(p.created * 1000).toISOString(),
        bur_fee: Math.round(p.amount * BUR_FEE_RATE) / 100
      }));

    const total = payments
      .filter(p => p.status === 'succeeded')
      .reduce((sum, p) => sum + p.amount, 0);

    res.json({ payments, total: Math.round(total * 100) / 100, count: payments.length });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── WEBHOOK STRIPE ─────────────────────────────────────────────
router.post('/payments/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  try {
    let event;
    if (webhookSecret && stripe) {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } else {
      event = req.body;
    }

    if (event.type === 'payment_intent.succeeded') {
      const pi = event.data.object;
      const amount = pi.amount / 100;
      const burFee = Math.round(amount * BUR_FEE_RATE * 100) / 100;
      console.log(`[BUR OS] ✓ Pagamento: €${amount} | Fee BUR: €${burFee} | Paziente: ${pi.metadata?.patient_name || 'N/A'}`);
      // TODO: accredita punti 🜁 al paziente
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      console.log(`[BUR OS] ✓ Checkout completato: ${session.id}`);
    }

    res.json({ received: true });
  } catch (err) {
    console.error('[BUR OS] Webhook error:', err.message);
    res.status(400).json({ error: err.message });
  }
});
// ── PAZIENTE AUTH ─────────────────────────────────────────────

// Registrazione paziente
router.post('/paziente/register', async (req, res) => {
  try {
    const { nome, cognome, email, telefono } = req.body;
    if (!nome || !email) return res.status(400).json({ error: 'Nome ed email obbligatori' });

    // Controlla se esiste già
    const existing = await db.sql`SELECT id FROM pazienti WHERE email = ${email}`;
    if (existing[0]) return res.status(409).json({ error: 'Email già registrata — accedi' });

    const rows = await db.sql`
      INSERT INTO pazienti (nome, cognome, email, telefono, punti)
      VALUES (${nome}, ${cognome||''}, ${email}, ${telefono||''}, 500)
      RETURNING id, nome, cognome, email, telefono, punti, created_at
    `;
    res.status(201).json({ success: true, paziente: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Login paziente (email only — magic link style)
router.post('/paziente/login', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email obbligatoria' });

    const rows = await db.sql`SELECT * FROM pazienti WHERE email = ${email}`;
    if (!rows[0]) return res.status(404).json({ error: 'Email non trovata — registrati prima' });

    res.json({ success: true, paziente: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Aggiorna push token paziente
router.post('/paziente/push-token', async (req, res) => {
  try {
    const { paziente_id, push_token } = req.body;
    if (!paziente_id || !push_token) return res.status(400).json({ error: 'paziente_id e push_token obbligatori' });

    await db.sql`UPDATE pazienti SET push_token = ${push_token} WHERE id = ${paziente_id}`;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── CLINICHE (autocomplete) ────────────────────────────────────

router.get('/cliniche', async (req, res) => {
  try {
    const { q } = req.query;
    let cliniche;
    if (q && q.length > 1) {
      cliniche = await db.sql`
        SELECT id, name, city, specialties
        FROM clinic
        WHERE name ILIKE ${'%' + q + '%'} OR city ILIKE ${'%' + q + '%'}
        LIMIT 10
      `;
    } else {
      cliniche = await db.sql`SELECT id, name, city, specialties FROM clinic LIMIT 20`;
    }
    res.json({ cliniche });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PRENOTAZIONI ──────────────────────────────────────────────

// Richiesta prenotazione da paziente
router.post('/prenotazioni', async (req, res) => {
  try {
    const { clinic_id, paziente_id, trattamento, note, data_richiesta } = req.body;
    if (!clinic_id || !paziente_id) return res.status(400).json({ error: 'clinic_id e paziente_id obbligatori' });

    const rows = await db.sql`
      INSERT INTO prenotazioni (clinic_id, paziente_id, trattamento, note, data_richiesta, status)
      VALUES (${clinic_id}, ${paziente_id}, ${trattamento||''}, ${note||''}, ${data_richiesta||''}, 'in_attesa')
      RETURNING *
    `;

    // Log per la receptionist
    console.log(`[BUR OS] Nuova prenotazione: ${trattamento} — clinic ${clinic_id}`);

    res.status(201).json({ success: true, prenotazione: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Lista prenotazioni per clinica (receptionist)
router.get('/prenotazioni', requireStaff, async (req, res) => {
  try {
    const rows = await db.sql`
      SELECT p.*, paz.nome, paz.cognome, paz.email, paz.telefono
      FROM prenotazioni p
      JOIN pazienti paz ON paz.id = p.paziente_id
      WHERE p.clinic_id = ${req.clinic_id}
      ORDER BY p.created_at DESC
      LIMIT 50
    `;
    res.json({ prenotazioni: rows, total: rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Aggiorna status prenotazione
router.put('/prenotazioni/:id', requireStaff, async (req, res) => {
  try {
    const { status } = req.body;
    const rows = await db.sql`
      UPDATE prenotazioni SET status = ${status}
      WHERE id = ${req.params.id} AND clinic_id = ${req.clinic_id}
      RETURNING *
    `;
    if (!rows[0]) return res.status(404).json({ error: 'Prenotazione non trovata' });
    res.json({ success: true, prenotazione: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── NOTIFICHE PAZIENTE ────────────────────────────────────────

// Invia notifica al paziente (da receptionist)
router.post('/paziente/notifica', requireStaff, async (req, res) => {
  try {
    const { paziente_email, titolo, messaggio, tipo, payment_link } = req.body;
    if (!paziente_email || !messaggio) return res.status(400).json({ error: 'paziente_email e messaggio obbligatori' });

    // Recupera push token del paziente
    const rows = await db.sql`SELECT id, push_token, nome FROM pazienti WHERE email = ${paziente_email}`;
    const paziente = rows[0];

    if (!paziente) return res.status(404).json({ error: 'Paziente non trovato' });

    // Log notifica
    console.log(`[BUR OS] Notifica → ${paziente.nome}: ${messaggio}`);

    // Se ha push token, invia Web Push (richiede VAPID keys in futuro)
    // Per ora restituiamo successo — l'app paziente fa polling
    res.json({
      success: true,
      paziente_nome: paziente.nome,
      push_sent: !!paziente.push_token,
      messaggio,
      tipo: tipo || 'info',
      payment_link: payment_link || null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Polling notifiche paziente (app paziente lo chiama ogni 10s)
router.get('/paziente/notifiche/:paziente_id', async (req, res) => {
  try {
    // Per ora restituisce mock — in futuro da tabella notifiche
    const rows = await db.sql`SELECT id, nome FROM pazienti WHERE id = ${req.params.paziente_id}`;
    if (!rows[0]) return res.status(404).json({ error: 'Paziente non trovato' });

    res.json({
      notifiche: [],
      paziente: rows[0]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
module.exports = router;
