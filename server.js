require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files explicitly since they are in the root directory
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/styles.css', (req, res) => res.sendFile(path.join(__dirname, 'styles.css')));
app.get('/script.js', (req, res) => res.sendFile(path.join(__dirname, 'script.js')));

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
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  const notesQuery = `
    CREATE TABLE IF NOT EXISTS notes (
      id bigint primary key generated always as identity,
      title text not null
    );
  `;

  try {
    await pool.query(patientsQuery);
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

    console.log("Database initialized successfully.");
  } catch (err) {
    console.error("Error initializing database:", err);
  }
};
initDb();

// API Routes
app.post('/api/patients', async (req, res) => {
  const { name, address, contact_number, followup_date, medications, notes } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO patients (name, address, contact_number, followup_date, medications, notes) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [name, address, contact_number, followup_date, medications, notes]
    );
    res.status(201).json({ message: "Patient registered", patient: result.rows[0] });
  } catch (err) {
    console.error("Database Error:", err);
    res.status(500).json({ error: 'Failed to register patient in database.' });
  }
});

// Fetch Today's Follow-up Patients
app.get('/api/patients/today', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM patients WHERE followup_date = CURRENT_DATE ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error("Database Error:", err);
    res.status(500).json({ error: 'Failed to fetch today\'s patients.' });
  }
});

// Fetch All Patients
app.get('/api/patients', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM patients ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error("Database Error:", err);
    res.status(500).json({ error: 'Failed to fetch patients.' });
  }
});

// Update a Patient
app.put('/api/patients/:id', async (req, res) => {
  const { id } = req.params;
  const { name, address, contact_number, followup_date, medications, notes } = req.body;
  try {
    const result = await pool.query(
      'UPDATE patients SET name = $1, address = $2, contact_number = $3, followup_date = $4, medications = $5, notes = $6 WHERE id = $7 RETURNING *',
      [name, address, contact_number, followup_date, medications, notes, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Patient not found' });
    res.json({ message: "Patient updated successfully", patient: result.rows[0] });
  } catch (err) {
    console.error("Database Error:", err);
    res.status(500).json({ error: 'Failed to update patient.' });
  }
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