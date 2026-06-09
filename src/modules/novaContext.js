// ============================================================
// novaContext.js — BUR OS Dynamic Context Builder
// Assembla il contesto real-time per NOVA da dati clinica reali
// ============================================================

const { sql } = require('./db');

// ── KNOWLEDGE BASE ESTETICA (embedded, ~4000 token) ──────────
const KNOWLEDGE_BASE = `
=== BUR OS KNOWLEDGE BASE — MEDICINA ESTETICA ITALIANA v1.0 ===

## FILLER ACIDO IALURONICO

### Marche principali e caratteristiche
- JUVEDERM (Allergan): Ultra (labbra, rughe superficiali), Voluma (zigomi, mento), Volift (rughe medio-profonde), Volbella (labbra naturali, rughe perioculari). Crosslinking VYCROSS. Durata 12-18 mesi.
- RESTYLANE (Galderma): Kysse (labbra), Lyft (zigomi, guance), Defyne (rughe profondi), Refyne (rughe medi). Tecnologia NASHA/OBT. Durata 6-18 mesi.
- BELOTERO (Merz): Balance (rughe superficiali), Intense (rughe profonde), Volume (volumizzazione). Tecnologia CPM. Durata 6-12 mesi.
- TEOSYAL (Teoxane): Kiss (labbra), RHA (dinamico, mimica naturale), Global Action (rughe medie). Durata 9-18 mesi.
- STYLAGE (Vivacy): Special Lips, M, L, XL. Con mannitolo antiossidante. Durata 12-18 mesi.

### Protocollo filler labbra
1. Analisi morfologica labbra (proporzione 1:1.6 labbro sup/inf)
2. Consenso informato FIRMATO — obbligatorio
3. Anamnesi: farmaci anticoagulanti, FANS, Aspirina (sospendere 7gg prima), herpes labiale (profilassi Aciclovir 400mg 2x/die 3gg prima)
4. Foto pre-trattamento (frontale, laterale, 3/4)
5. Anestesia topica (EMLA o simili) 20-30 minuti
6. Disinfezione con clorexidina
7. Tecnica: tunnelling per corpo labbro, microbolus per tubercoli, serial puncture per bordo vermiglio
8. Aghi: 27-30G per retrograde injection, cannula 25G per meno traumi
9. Massaggio modellante
10. Ghiaccio 5-10 minuti post procedura
11. Istruzioni post: no rossetto 24h, no sauna/sport 48h, no FANS 24h, idratare con acqua
12. Follow-up: 2 settimane per ritocco

### Controindicazioni assolute filler
- Gravidanza e allattamento
- Allergia all'acido ialuronico o lidocaina
- Infezioni attive nella zona
- Autoimmunità attiva (lupus, AR in fase acuta)
- Trattamento con isotretinoina (Roaccutane) — attendere 6 mesi
- Coagulopatie non trattate

### Controindicazioni relative (valutare caso per caso)
- Diabete non compensato
- Herpes labialis ricorrente (profilassi antivirale)
- Terapia anticoagulante (sospendere se possibile)
- Precedenti reazioni ai filler
- Aspettative non realistiche

---

## TOSSINA BOTULINICA

### Marche disponibili in Italia
- BOTOX (Allergan/AbbVie): unità Allergan. Gold standard. 100U/flacone.
- DYSPORT (Ipsen): unità Speywood (1U Botox ≈ 2.5-3U Dysport). 300/500U/flacone.
- XEOMIN (Merz): freeform, senza proteine complesse. Meno anticorpi. 100U/flacone.
- LETYBO (Hugel): approvato EU 2022. Equivalente a Botox unit per unit.
- BOCOUTURE: nome commerciale Xeomin in alcuni paesi.

### Dosi standard (Botox units) — INDICATIVE, MAI prescrivere senza visita
- Glabella (corrugatore, procerus): 15-25U
- Fronte: 8-20U (attenzione al ptosi palpebrale)
- Zampe di gallina: 6-15U per lato
- Bunny lines (nasali): 2-5U per lato
- Labbro superiore (lip flip): 2-4U
- Mento (mentale): 4-8U
- Massetere (bruxismo/slimming): 20-30U per lato
- Iperidrosi ascellare: 50U per ascella

### Protocollo botox
1. Analisi mimica DINAMICA (non statica)
2. Consenso informato FIRMATO
3. Anamnesi: miastenia gravis (CONTROINDICAZIONE ASSOLUTA), gravidanza, allattamento, aminoglicosidi
4. Foto pre-trattamento con mimica
5. Disinfezione
6. Iniezione con ago 30-32G intradermica/sottocutanea
7. NO massaggio post (rischio diffusione)
8. Istruzioni post: no sport 24h, no sauna 48h, non coricarsi 4h, no manipolare zona
9. Onset: 3-7 giorni, effetto pieno 14 giorni
10. Follow-up: 2 settimane per valutazione e ritocco
11. Durata: 3-6 mesi

### Complicanze botox e gestione
- Ptosi palpebrale: apraclonidina 0.5% collirio (stimola Müller), attesa 8-12 settimane
- Ptosi sopracciglio: nessun antidoto, attesa
- Asimmetria: ritocco a 2 settimane
- Cefalea: transitoria, FANS
- Ematoma: compressione, arnica

---

## ANATOMIA FACCIALE — ZONE A RISCHIO VASCOLARE

### ATTENZIONE CRITICA — Zone ad alto rischio occlusione vascolare
- Glabella: arteria sopratrocleare e sopraorbitale — RISCHIO CECITÀ
- Naso: arteria dorsale del naso, angolare — RISCHIO NECROSI/CECITÀ  
- Solco naso-labiale: arteria facciale — RISCHIO NECROSI
- Regione temporale: arteria temporale superficiale
- Labbra: arteria labiale superiore e inferiore

### Protocollo emergenza occlusione vascolare
1. RICONOSCIMENTO: dolore intenso, sbiancamento, livido violaceo
2. AZIONE IMMEDIATA entro 30-60 minuti:
   - Hialuronidasi 150-1500U nella zona (dissolve HA)
   - Massaggio vigoroso
   - Calore locale
   - Aspirina 300mg subito
   - Nitroglicerina topica (vasodilatatore)
3. Chiamare PS se non risoluzione in 30 minuti
4. AVERE SEMPRE Hialuronidasi in studio

### Kit emergenza obbligatorio in studio estetico
- Hialuronidasi (Hylase, Hyalase)
- Adrenalina 1mg/ml
- Cortisone iv
- Antistaminico iv
- Sfigmomanometro
- Defibrillatore (raccomandata formazione BLS)

---

## PEELING CHIMICI

### Classificazione per profondità
- SUPERFICIALE: AHA (acido glicolico, lattico, mandelico), BHA (salicilico). Epidermide. Downtime 1-3gg.
- MEDIO: TCA 15-35%, Jessner + TCA 35%, acido retinoico. Dermide papillare. Downtime 5-7gg.
- PROFONDO: Fenolo, TCA >50%. Dermide reticolare. Downtime 2-4 settimane. Anestesia necessaria.

### Acidi principali
- ACIDO GLICOLICO: 20-70%. Antiaging, acne, macchie. Neutralizzare con bicarbonato.
- ACIDO SALICILICO: 20-30%. Acne, pori dilatati, seborrea. Auto-neutralizzante.
- ACIDO MANDELICO: 25-50%. Delicato, fototipi scuri. Anti-acne, antiaging.
- TCA: 15-50%. Rughe, cicatrici, macchie. Non neutralizzare, acqua abbondante.
- ACIDO RETINOICO: 1-5% (Obagi). Antiaging profondo. Overnight.

---

## LASER E TECNOLOGIE

### Laser principali in estetica
- CO2 FRAZIONATO: resurfacing, cicatrici, rughe profonde. Ablativo. Downtime 7-14gg.
- ERBIUM YAG: resurfacing delicato, fototipi scuri. Meno downtime CO2.
- ND:YAG 1064nm: vasi, macchie, capelli scuri, tatuaggi. Non ablativo.
- ALEXANDRITE 755nm: epilazione fototipi chiari, macchie.
- DIODO 810nm: epilazione, vasi. Versatile.
- IPL: fotoringiovanimento, macchie, vasi. Non laser ma luce pulsata.

### Controindicazioni laser/luce
- Isotretinoina: attendere 6 mesi
- Abbronzatura recente
- Fotosensibilizzanti (tetracicline, amiodarone)
- Gravidanza
- Epilessia fotosensibile (IPL/laser pulsati)
- Pacemaker (RF, HIFU vicino al torace)

---

## NORMATIVA ITALIANA — PUNTI CHIAVE

### Chi può fare cosa
- MEDICO CHIRURGO: tutte le procedure mediche e chirurgiche
- MEDICO ESTETICO (specializzazione): filler, botox, laser medici, peeling profondi
- ESTETISTA (diploma): trattamenti estetici non invasivi, peeling superficiali, laser estetici
- INFERMIERE: preparazione pazienti, assistenza, NO procedure autonome

### Consenso informato — obbligatorio per
- Qualsiasi procedura invasiva (filler, botox, peeling medio-profondi)
- Trattamenti laser
- Deve essere: scritto, specifico, firmato PRIMA del trattamento, con tempo riflessione
- Conservare minimo 10 anni (GDPR + responsabilità medica)

### GDPR in studio medico
- Dati sanitari = categoria speciale (art. 9 GDPR)
- Base giuridica: consenso esplicito o necessità medica
- DPO obbligatorio se trattamento su larga scala
- Breach notification entro 72h al Garante
- Cartella clinica: conservare 10 anni minimi

---

## PRODOTTI E FARMACI COMUNI

### Anestetico topico
- EMLA (lidocaina 2.5% + prilocaina 2.5%): applicare 30-60 min, occludere
- LMX4 (lidocaina 4%): applicare 20-30 min
- BLT cream (benzocaina+lidocaina+tetracaina): uso off-label, potente

### Hialuronidasi (antidoto filler HA)
- HYALASE 1500U/flacone: sciogliere in 1-2ml soluzione fisiologica
- Dose: 150-1500U secondo gravità
- Onset: 30-60 minuti
- Può causare reazione allergica (test cutaneo se tempo consente)

### Arnica
- Gel/crema post-procedura: riduce ematomi
- Orale 6CH: iniziare 3gg prima di procedure
- Non applicare su pelle lesa

### Post-filler/botox
- Idratazione intensa (acido ialuronico topico)
- SPF50 obbligatorio post-peeling e laser
- Vitamina C topica: antiossidante, brightening
- Retinolo: antiaging, non usare 48h pre/post procedura invasiva

=== FINE KNOWLEDGE BASE ===
`;

// ── BUILD CONTEXT ─────────────────────────────────────────────
async function buildNovaContext(roleId, clinicId) {
  try {
    const today = new Date().toLocaleDateString('it-IT', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
    const todayISO = new Date().toISOString().split('T')[0];

    // 1. Dati clinica
    const clinicRows = await sql`SELECT * FROM clinic WHERE id = ${clinicId} LIMIT 1`;
    const clinic = clinicRows[0];
    if (!clinic) return null;

    // 2. Staff in sede oggi
    const staffRows = await sql`
      SELECT name, role, avatar_color FROM staff
      WHERE clinic_id = ${clinicId} AND active = TRUE
      ORDER BY role
    `;

    // 3. Pazienti di oggi
    const patientRows = await sql`
      SELECT name, age, tags, treatments, notes, next_appointment, total_spend
      FROM patients
      WHERE clinic_id = ${clinicId}
        AND DATE(next_appointment) = ${todayISO}
      ORDER BY next_appointment ASC
      LIMIT 20
    `;

    // 4. Prenotazioni in attesa
    const bookingRows = await sql`
      SELECT p.trattamento, p.note, p.data_richiesta, paz.nome, paz.cognome
      FROM prenotazioni p
      JOIN pazienti paz ON paz.id = p.paziente_id
      WHERE p.clinic_id = ${clinicId} AND p.status = 'in_attesa'
      ORDER BY p.created_at DESC
      LIMIT 10
    `.catch(() => []);

    // 5. Messaggi non letti (urgenti)
    const unreadMsgs = await sql`
      SELECT COUNT(*) as count FROM staff_messages
      WHERE clinic_id = ${clinicId} AND read = FALSE
    `.catch(() => [{count:0}]);

    // 6. Assembla context dinamico
    const clinicContext = `
=== CONTESTO CLINICA — ${today} ===

CLINICA: ${clinic.name}
SEDE: ${clinic.city || 'N/A'}
SPECIALIZZAZIONI: ${(clinic.specialties || []).join(', ') || 'N/A'}

STAFF IN SEDE OGGI (${staffRows.length} membri):
${staffRows.map(s => `- ${s.name} [${s.role}]`).join('\n') || '- Nessuno configurato'}

PAZIENTI OGGI (${patientRows.length}):
${patientRows.length === 0 ? '- Nessun appuntamento' : patientRows.map(p => {
  const ora = p.next_appointment ? new Date(p.next_appointment).toLocaleTimeString('it-IT', {hour:'2-digit', minute:'2-digit'}) : 'N/A';
  const alert = (p.tags || []).includes('ATTENZIONE') || (p.notes || '').toLowerCase().includes('farmac') || (p.notes || '').toLowerCase().includes('allergi') ? ' ⚠️ VERIFICA ANAMNESI' : '';
  return `- ${ora} | ${p.name} (${p.age || '?'} anni) | ${(p.treatments || []).join(', ') || 'N/A'}${alert}${p.notes ? ' | Note: ' + p.notes.slice(0, 100) : ''}`;
}).join('\n')}

PRENOTAZIONI IN ATTESA: ${bookingRows.length}
${bookingRows.slice(0,3).map(b => `- ${b.nome} ${b.cognome}: ${b.trattamento} (${b.data_richiesta || 'data da definire'})`).join('\n') || ''}

MESSAGGI NON LETTI: ${unreadMsgs[0]?.count || 0}

=== FINE CONTESTO ===
`;

    return { clinicContext, knowledgeBase: KNOWLEDGE_BASE };

  } catch (err) {
    console.error('[BUR OS] buildNovaContext error:', err.message);
    return null;
  }
}

// ── ROLE PROMPTS DINAMICI ─────────────────────────────────────
function buildNovaPrompt(roleId, clinicContext, knowledgeBase) {
  const rolePersonality = {
    doctor: `Sei NOVA, supervisore AI clinico per medici estetici della clinica indicata nel contesto.
Hai accesso alla knowledge base completa di medicina estetica italiana e ai dati real-time della clinica.
CARATTERE: esperto, preciso, proattivo. Non aspetti domande — avverti prima che si sbagli.
PRIORITÀ: sicurezza paziente sempre prima di tutto. Mai suggerire dosaggi senza contesto clinico completo.
STILE: professionale, conciso. Max 4 righe per risposta. Usa ⚠️ alert critici, ✅ conferme, 💡 suggerimenti.
Rispondi SEMPRE in italiano.`,

    assistant: `Sei NOVA, assistente AI per assistenti medici.
Hai accesso ai dati real-time della clinica e ai protocolli operativi.
CARATTERE: operativo, pratico, orientato ai dettagli. Dai istruzioni step-by-step.
PRIORITÀ: preparazione sala perfetta, checklist complete, supporto al medico.
STILE: diretto, usa ✅ step ok, 📋 checklist, ⏱️ timing. Max 4 righe.
Rispondi SEMPRE in italiano.`,

    nurse: `Sei NOVA, supervisore AI per infermieri in clinica estetica.
CARATTERE: rigoroso, orientato alla sicurezza. La sicurezza paziente è non negoziabile.
PRIORITÀ: sterilizzazione, farmaci, emergenze, protocolli.
STILE: preciso e diretto. Usa 🔴 emergenze, ⚠️ rischi, ✅ conformità. Max 4 righe.
Rispondi SEMPRE in italiano.`,

    ceo: `Sei NOVA, advisor strategico AI per il CEO.
Hai accesso ai KPI, allo staff, ai pazienti e ai dati finanziari della clinica.
CARATTERE: executive, orientato ai numeri e alle decisioni. Vai al punto.
PRIORITÀ: fatturato, performance staff, ottimizzazione operativa.
STILE: diretto, usa 📊 dati, ⚡ azioni urgenti, 💰 finanza. Max 5 righe.
Rispondi SEMPRE in italiano.`,

    receptionist: `Sei NOVA, assistente AI per receptionist di clinica estetica.
Hai accesso all'agenda, ai pazienti e ai pagamenti in real-time.
CARATTERE: organizzata, orientata al paziente, proattiva sulle comunicazioni.
PRIORITÀ: agenda ottimizzata, zero no-show, esperienza paziente eccellente.
STILE: caldo e professionale. Usa 📅 agenda, 📞 chiamate, 💬 messaggi. Max 4 righe.
Rispondi SEMPRE in italiano.`,

    legal: `Sei NOVA, consulente AI legale per cliniche di medicina estetica.
Conosci GDPR, normativa sanitaria italiana, responsabilità medica, consensi informati.
CARATTERE: preciso, normativo, orientato alla compliance.
PRIORITÀ: proteggere la clinica legalmente, prevenire rischi, mantenere conformità.
STILE: formale e preciso. Usa 📋 documenti, ⚠️ scadenze, ✅ conformità. Max 4 righe.
Rispondi SEMPRE in italiano.`,

    marketing: `Sei NOVA, strategist AI per il marketing di cliniche estetiche.
Conosci i trend del settore, le piattaforme social, le campagne per cliniche mediche in Italia.
CARATTERE: creativo e data-driven. Proponi azioni concrete e misurabili.
PRIORITÀ: acquisizione pazienti, retention, brand positioning.
STILE: energico. Usa 📈 crescita, 📱 social, ⭐ reputazione. Max 4 righe.
Rispondi SEMPRE in italiano.`,
  };

  const persona = rolePersonality[roleId] || rolePersonality.ceo;

  return `${persona}

${clinicContext}

KNOWLEDGE BASE MEDICINA ESTETICA:
${knowledgeBase}

ISTRUZIONI OPERATIVE:
- Usa i dati del contesto clinica per personalizzare ogni risposta
- Se un paziente oggi ha note o alert, menzionali proattivamente
- Se vedi problemi nell'agenda o nello staff, segnalali
- Impara da ogni correzione che ricevi — se l'utente dice che hai sbagliato, chiedi spiegazione e aggiornati
- Ogni informazione clinica condivisa dall'utente viene memorizzata per migliorare BUR OS`;
}

// ── FEEDBACK LEARNING ─────────────────────────────────────────
async function saveNovaFeedback(clinicId, roleId, question, novaAnswer, feedback, correction) {
  try {
    // Salva per future analisi e training
    await sql`
      INSERT INTO nova_feedback (clinic_id, role_id, question, nova_answer, feedback, correction, created_at)
      VALUES (${clinicId}, ${roleId}, ${question}, ${novaAnswer}, ${feedback}, ${correction || null}, NOW())
    `.catch(() => {
      // Tabella potrebbe non esistere ancora — log silenzioso
      console.log('[BUR OS] nova_feedback table not ready yet');
    });
  } catch {}
}

module.exports = { buildNovaContext, buildNovaPrompt, saveNovaFeedback, KNOWLEDGE_BASE };
