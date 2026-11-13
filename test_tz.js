require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

pool.on('connect', (client) => {
  client.query("SET TIME ZONE 'Asia/Manila'").catch(() => {
    client.query("SET TIME ZONE '+08:00'").catch(() => {});
  });
});

async function testPoolTz() {
  const client = await pool.connect();
  try {
    const res = await client.query('SHOW TIME ZONE');
    console.log('Pool connection timezone:', res.rows[0]);
  } finally {
    client.release();
    pool.end();
  }
}

testPoolTz();
