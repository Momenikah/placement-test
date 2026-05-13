require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../db/connection');

async function setup() {
  console.log('Initializing database...');
  const sql = fs.readFileSync(path.join(__dirname, '../db/init.sql'), 'utf8');
  try {
    await pool.query(sql);
    console.log('✅ Database initialized successfully!');
  } catch (err) {
    console.error('❌ Database initialization failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

setup();
