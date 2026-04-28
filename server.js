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
app.use(express.static(path.join(__dirname, 'public')));

// Vercel DB Connection Pool
// Vercel Postgres requires an SSL connection
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL + "?sslmode=require",
});

// Initialize Database Table
const initDb = async () => {
  const query = `
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
  try {
    await pool.query(query);
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

// Start Server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});