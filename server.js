require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
const port = process.env.PORT || 3000;
const sessions = new Map();
const doctorUsername = process.env.DOCTOR_USERNAME || 'doctor';
const doctorPassword = process.env.DOCTOR_PASSWORD || 'smilecare123';
const schedulerState = {
  lastRunDate: null,
  running: false
};

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files explicitly since they are in the root directory
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/styles.css', (req, res) => res.sendFile(path.join(__dirname, 'styles.css')));
app.get('/script.js', (req, res) => res.sendFile(path.join(__dirname, 'script.js')));

function parseCookies(req) {
  return (req.headers.cookie || '').split(';').reduce((cookies, cookie) => {
    const [name, ...valueParts] = cookie.trim().split('=');
    if (!name) return cookies;
    cookies[name] = decodeURIComponent(valueParts.join('='));
    return cookies;
  }, {});
}

function isAuthenticated(req) {
  const token = parseCookies(req).smilecare_session;
  return Boolean(token && sessions.has(token));
}

function requireAuth(req, res, next) {
  if (isAuthenticated(req)) return next();
  return res.status(401).json({ error: 'Authentication required.' });
}

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (username !== doctorUsername || password !== doctorPassword) {
    return res.status(401).json({ error: 'Invalid username or password.' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { username, createdAt: Date.now() });
  res.cookie('smilecare_session', token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 8
  });
  res.json({ authenticated: true, username });
});

app.post('/api/auth/logout', (req, res) => {
  const token = parseCookies(req).smilecare_session;
  if (token) sessions.delete(token);
  res.clearCookie('smilecare_session');
  res.json({ authenticated: false });
});

app.get('/api/auth/me', (req, res) => {
  if (!isAuthenticated(req)) return res.status(401).json({ authenticated: false });
  const token = parseCookies(req).smilecare_session;
  res.json({ authenticated: true, username: sessions.get(token).username });
});

app.use('/api', requireAuth);

// Vercel DB Connection Pool
// Postgres requires an SSL connection with rejectUnauthorized: false for some managed databases like Supabase/Vercel
const pool = new Pool({
  connectionString: (process.env.POSTGRES_URL || '').replace('sslmode=require', 'sslmode=no-verify'),
  ssl: {
    rejectUnauthorized: false
  }
});

// Initialize Database Table
const initDb = async () => {
  const patientsQuery = `
    CREATE TABLE IF NOT EXISTS patients (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      address TEXT NOT NULL,
      contact_number VARCHAR(15) NOT NULL,
      followup_date DATE,
      medications TEXT,
      notes TEXT,
      status VARCHAR(20) DEFAULT 'Pending',
      archived BOOLEAN DEFAULT FALSE,
      whatsapp_consent BOOLEAN DEFAULT FALSE,
      last_reminder_sent_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  const patientVisitsQuery = `
    CREATE TABLE IF NOT EXISTS patient_visits (
      id SERIAL PRIMARY KEY,
      patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      visit_date DATE NOT NULL DEFAULT CURRENT_DATE,
      diagnosis TEXT,
      treatment TEXT,
      medications TEXT,
      notes TEXT,
      next_followup_date DATE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  const notesQuery = `
    CREATE TABLE IF NOT EXISTS notes (
      id bigint primary key generated always as identity,
      title text not null
    );
  `;

  const categoriesQuery = `
    CREATE TABLE IF NOT EXISTS treatment_categories (
      id SERIAL PRIMARY KEY,
      name VARCHAR(80) NOT NULL UNIQUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  const activityLogQuery = `
    CREATE TABLE IF NOT EXISTS activity_logs (
      id SERIAL PRIMARY KEY,
      action VARCHAR(80) NOT NULL,
      patient_id INTEGER REFERENCES patients(id) ON DELETE SET NULL,
      patient_name VARCHAR(100),
      details TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  try {
    await pool.query(patientsQuery);
    await pool.query(patientVisitsQuery);
    await pool.query(categoriesQuery);
    await pool.query(activityLogQuery);
    await pool.query("ALTER TABLE patients ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'Pending';");
    await pool.query("ALTER TABLE patients ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT FALSE;");
    await pool.query("ALTER TABLE patients ADD COLUMN IF NOT EXISTS whatsapp_consent BOOLEAN DEFAULT FALSE;");
    await pool.query("ALTER TABLE patients ADD COLUMN IF NOT EXISTS last_reminder_sent_at TIMESTAMP;");
    await pool.query("ALTER TABLE patients ADD COLUMN IF NOT EXISTS treatment_category VARCHAR(80);");
    await pool.query("ALTER TABLE patient_visits ADD COLUMN IF NOT EXISTS treatment_category VARCHAR(80);");
    await pool.query(notesQuery);

    const checkNotes = await pool.query('SELECT COUNT(*) FROM notes;');
    if (parseInt(checkNotes.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO notes (title)
        VALUES
          ('Today I created a Supabase project.'),
          ('I added some data and queried it from Express.'),
          ('It was awesome!');
      `);
    }

    const defaultCategories = ['Cleaning', 'Root Canal', 'Extraction', 'Implant', 'Braces', 'Crown', 'Filling', 'Whitening'];
    for (const category of defaultCategories) {
      await pool.query('INSERT INTO treatment_categories (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [category]);
    }

    console.log("Database initialized successfully.");
  } catch (err) {
    console.error("Error initializing database:", err);
  }
};
initDb();

async function logActivity(action, patient, details = '') {
  try {
    await pool.query(
      'INSERT INTO activity_logs (action, patient_id, patient_name, details) VALUES ($1, $2, $3, $4)',
      [action, patient?.id || null, patient?.name || patient?.patient_name || null, details]
    );
  } catch (err) {
    console.error("Activity Log Error:", err);
  }
}

function getIndiaDateKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

// API Routes
app.post('/api/patients', async (req, res) => {
  const { name, address, contact_number, followup_date, medications, notes, status, whatsapp_consent, treatment_category } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO patients (name, address, contact_number, followup_date, medications, notes, status, whatsapp_consent, treatment_category) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
      [name, address, contact_number, followup_date, medications, notes, status || 'Pending', Boolean(whatsapp_consent), treatment_category || null]
    );
    await logActivity('Patient Created', result.rows[0], `Treatment category: ${treatment_category || 'Not selected'}`);
    res.status(201).json({ message: "Patient registered", patient: result.rows[0] });
  } catch (err) {
    console.error("Database Error:", err);
    res.status(500).json({ error: 'Failed to register patient in database.' });
  }
});

// Fetch Today's Follow-up Patients
app.get('/api/patients/today', async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM patients WHERE followup_date = CURRENT_DATE AND archived = FALSE ORDER BY created_at DESC");
    res.json(result.rows);
  } catch (err) {
    console.error("Database Error:", err);
    res.status(500).json({ error: 'Failed to fetch today\'s patients.' });
  }
});

// Fetch All Patients
app.get('/api/patients', async (req, res) => {
  try {
    const includeArchived = req.query.archived === 'true';
    const result = await pool.query(
      `SELECT * FROM patients ${includeArchived ? '' : 'WHERE archived = FALSE'} ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Database Error:", err);
    res.status(500).json({ error: 'Failed to fetch patients.' });
  }
});

// Update a Patient
app.put('/api/patients/:id', async (req, res) => {
  const { id } = req.params;
  const { name, address, contact_number, followup_date, medications, notes, status, whatsapp_consent, treatment_category } = req.body;
  try {
    const result = await pool.query(
      'UPDATE patients SET name = $1, address = $2, contact_number = $3, followup_date = $4, medications = $5, notes = $6, status = $7, whatsapp_consent = $8, treatment_category = $9 WHERE id = $10 RETURNING *',
      [name, address, contact_number, followup_date, medications, notes, status || 'Pending', Boolean(whatsapp_consent), treatment_category || null, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Patient not found' });
    await logActivity('Patient Updated', result.rows[0], `Follow-up: ${followup_date || 'N/A'}, category: ${treatment_category || 'Not selected'}`);
    res.json({ message: "Patient updated successfully", patient: result.rows[0] });
  } catch (err) {
    console.error("Database Error:", err);
    res.status(500).json({ error: 'Failed to update patient.' });
  }
});

function normalizeWhatsappNumber(contactNumber) {
  const digits = String(contactNumber || '').replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

function buildReminderMessage(patient) {
  const followupDate = patient.followup_date
    ? new Date(patient.followup_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'your scheduled date';

  return `Hello ${patient.name}, this is a reminder for your dental follow-up at SmileCare India on ${followupDate}. Please contact us if you need to reschedule.`;
}

async function sendWhapiReminder(patient) {
  const whapiToken = process.env.WHAPI_TOKEN;
  const whapiApiUrl = process.env.WHAPI_API_URL || 'https://gate.whapi.cloud';

  if (!whapiToken) {
    throw new Error('WHAPI_TOKEN is not configured.');
  }

  const to = normalizeWhatsappNumber(patient.contact_number);
  if (to.length < 11) {
    throw new Error('Contact number must include a valid country code or 10-digit Indian mobile number.');
  }

  const response = await fetch(`${whapiApiUrl.replace(/\/$/, '')}/messages/text`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${whapiToken}`
    },
    body: JSON.stringify({
      to,
      body: buildReminderMessage(patient)
    })
  });

  const responseBody = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error('Failed to send WhatsApp reminder.');
    error.details = responseBody;
    error.status = response.status;
    throw error;
  }

  const updatedPatient = await pool.query(
    'UPDATE patients SET last_reminder_sent_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *',
    [patient.id]
  );

  await logActivity('WhatsApp Reminder Sent', updatedPatient.rows[0], 'Reminder sent via Whapi.');
  return { patient: updatedPatient.rows[0], whapi: responseBody };
}

app.post('/api/patients/:id/reminder/whatsapp', async (req, res) => {
  const { id } = req.params;

  try {
    const patientResult = await pool.query('SELECT * FROM patients WHERE id = $1 AND archived = FALSE', [id]);
    if (patientResult.rows.length === 0) return res.status(404).json({ error: 'Patient not found' });

    const patient = patientResult.rows[0];
    if (!patient.whatsapp_consent) {
      return res.status(400).json({ error: 'Patient has not consented to WhatsApp reminders.' });
    }

    const result = await sendWhapiReminder(patient);

    res.json({
      message: 'WhatsApp reminder sent successfully.',
      patient: result.patient,
      whapi: result.whapi
    });
  } catch (err) {
    console.error("Reminder Error:", err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to send WhatsApp reminder.', details: err.details });
  }
});

app.patch('/api/patients/:id/archive', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('UPDATE patients SET archived = TRUE WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Patient not found' });
    await logActivity('Patient Archived', result.rows[0], 'Record archived.');
    res.json({ message: "Patient archived successfully", patient: result.rows[0] });
  } catch (err) {
    console.error("Database Error:", err);
    res.status(500).json({ error: 'Failed to archive patient.' });
  }
});

app.patch('/api/patients/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const allowedStatuses = ['Pending', 'Completed', 'Rescheduled', 'Missed'];

  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid follow-up status.' });
  }

  try {
    const result = await pool.query('UPDATE patients SET status = $1 WHERE id = $2 RETURNING *', [status, id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Patient not found' });
    await logActivity('Status Updated', result.rows[0], `Status changed to ${status}.`);
    res.json({ message: "Patient status updated successfully", patient: result.rows[0] });
  } catch (err) {
    console.error("Database Error:", err);
    res.status(500).json({ error: 'Failed to update patient status.' });
  }
});

app.get('/api/dashboard/stats', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE archived = FALSE) AS total_patients,
        COUNT(*) FILTER (WHERE archived = FALSE AND followup_date = CURRENT_DATE) AS today_followups,
        COUNT(*) FILTER (WHERE archived = FALSE AND followup_date > CURRENT_DATE) AS upcoming_followups,
        COUNT(*) FILTER (WHERE archived = FALSE AND followup_date < CURRENT_DATE AND status NOT IN ('Completed', 'Archived')) AS missed_followups
      FROM patients;
    `);
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Database Error:", err);
    res.status(500).json({ error: 'Failed to fetch dashboard stats.' });
  }
});

app.get('/api/patients/:id/visits', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      'SELECT * FROM patient_visits WHERE patient_id = $1 ORDER BY visit_date DESC, created_at DESC',
      [id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Database Error:", err);
    res.status(500).json({ error: 'Failed to fetch patient visits.' });
  }
});

app.post('/api/patients/:id/visits', async (req, res) => {
  const { id } = req.params;
  const { visit_date, diagnosis, treatment, medications, notes, next_followup_date, treatment_category } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO patient_visits (patient_id, visit_date, diagnosis, treatment, medications, notes, next_followup_date, treatment_category) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [id, visit_date, diagnosis, treatment, medications, notes, next_followup_date || null, treatment_category || null]
    );

    if (next_followup_date) {
      await pool.query('UPDATE patients SET followup_date = $1, status = $2 WHERE id = $3', [next_followup_date, 'Pending', id]);
    }

    const patient = await pool.query('SELECT * FROM patients WHERE id = $1', [id]);
    await logActivity('Visit Added', patient.rows[0], `Diagnosis: ${diagnosis || 'N/A'}, category: ${treatment_category || 'Not selected'}`);

    res.status(201).json({ message: "Visit added", visit: result.rows[0] });
  } catch (err) {
    console.error("Database Error:", err);
    res.status(500).json({ error: 'Failed to add patient visit.' });
  }
});

app.get('/api/treatment-categories', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM treatment_categories ORDER BY name ASC');
    res.json(result.rows);
  } catch (err) {
    console.error("Database Error:", err);
    res.status(500).json({ error: 'Failed to fetch treatment categories.' });
  }
});

app.post('/api/treatment-categories', async (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Category name is required.' });

  try {
    const result = await pool.query(
      'INSERT INTO treatment_categories (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING *',
      [name]
    );
    await logActivity('Treatment Category Added', null, `Category: ${name}`);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Database Error:", err);
    res.status(500).json({ error: 'Failed to save treatment category.' });
  }
});

app.get('/api/activity-logs', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 80');
    res.json(result.rows);
  } catch (err) {
    console.error("Database Error:", err);
    res.status(500).json({ error: 'Failed to fetch activity logs.' });
  }
});

async function runAutomaticReminders(force = false) {
  const todayKey = getIndiaDateKey();
  if (!force && schedulerState.lastRunDate === todayKey) {
    return { skipped: true, reason: 'Already ran today.', sent: 0, failed: 0 };
  }

  if (schedulerState.running) {
    return { skipped: true, reason: 'Scheduler already running.', sent: 0, failed: 0 };
  }

  schedulerState.running = true;
  let sent = 0;
  let failed = 0;

  try {
    const result = await pool.query(`
      SELECT *
      FROM patients
      WHERE archived = FALSE
        AND whatsapp_consent = TRUE
        AND followup_date = CURRENT_DATE
        AND (last_reminder_sent_at IS NULL OR last_reminder_sent_at::date < CURRENT_DATE)
      ORDER BY created_at ASC
    `);

    for (const patient of result.rows) {
      try {
        await sendWhapiReminder(patient);
        sent += 1;
      } catch (err) {
        failed += 1;
        await logActivity('WhatsApp Reminder Failed', patient, err.message || 'Automatic reminder failed.');
      }
    }

    schedulerState.lastRunDate = todayKey;
    return { skipped: false, sent, failed };
  } finally {
    schedulerState.running = false;
  }
}

app.post('/api/reminders/automatic/run', async (req, res) => {
  try {
    const result = await runAutomaticReminders(true);
    await logActivity('Automatic Reminders Run', null, `Sent: ${result.sent}, Failed: ${result.failed}`);
    res.json(result);
  } catch (err) {
    console.error("Automatic Reminder Error:", err);
    res.status(500).json({ error: 'Failed to run automatic reminders.' });
  }
});

app.get('/api/reminders/automatic/status', (req, res) => {
  res.json({
    lastRunDate: schedulerState.lastRunDate,
    running: schedulerState.running
  });
});

// Fetch Notes API (Equivalent to Supabase Next.js snippet)
app.get('/api/notes', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM notes');
    res.json(result.rows);
  } catch (err) {
    console.error("Database Error:", err);
    res.status(500).json({ error: 'Failed to fetch notes.' });
  }
});

// Start Server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

setInterval(() => {
  runAutomaticReminders(false).catch((err) => {
    console.error("Automatic Reminder Scheduler Error:", err);
  });
}, 1000 * 60 * 30);
