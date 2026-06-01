import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './db';

const here = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(here, 'schema.sql'), 'utf8');

async function run() {
  await pool.query(sql);
  console.log('✅ schema applied');
  await pool.end();
}

run().catch((err) => {
  console.error('❌ migrate failed:', err);
  process.exit(1);
});
