/**
 * MySQL connection pool.
 *
 * Uses mysql2/promise so every route handler can `await db.query(...)`.
 * Credentials are read from the .env file (see .env.example).
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'cspc_reservation',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  // Return TIME columns as plain "HH:MM:SS" strings and DATE columns as
  // "YYYY-MM-DD" strings so the frontend never has to wrestle with JS Date
  // objects shifted by the local timezone.
  dateStrings: true,
  timezone: 'Z'
});

/** Quick connectivity probe used at boot so misconfiguration fails loudly. */
async function testConnection() {
  const conn = await pool.getConnection();
  try {
    await conn.query('SELECT 1 AS ok');
  } finally {
    conn.release();
  }
}

module.exports = { pool, testConnection };
