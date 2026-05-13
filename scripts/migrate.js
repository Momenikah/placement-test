require('dotenv').config();
const pool = require('../db/connection');

async function migrate() {
  console.log('Running migration...');
  try {
    await pool.query(`
      ALTER TABLE test_results
        ADD COLUMN IF NOT EXISTS cefr_level   VARCHAR(5),
        ADD COLUMN IF NOT EXISTS raw_analysis JSONB;
    `);
    console.log('✅ Migration complete: cefr_level + raw_analysis columns added.');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
