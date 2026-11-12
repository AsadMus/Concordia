// Creates (or re-creates) all tables from sql/schema.sql. WARNING: drops existing data.
const fs = require('fs');
const path = require('path');
const { pool } = require('./pool');

(async () => {
  const sql = fs.readFileSync(path.join(__dirname, '../../sql/schema.sql'), 'utf8');
  await pool.query(sql);
  console.log('Database schema created.');
  await pool.end();
})().catch((err) => { console.error(err); process.exit(1); });
