import fs from 'node:fs';
import pg from 'pg';

function loadDotEnvLocal() {
  if (!fs.existsSync('.env.local')) return;
  const lines = fs.readFileSync('.env.local', 'utf-8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadDotEnvLocal();

const [file] = process.argv.slice(2);
if (!file) { console.error('usage: node run-migration.mjs <file.sql>'); process.exit(1); }
const sql = fs.readFileSync(file, 'utf-8');

// Use direct DB connection via project URL derived config
// Supabase direct: postgresql://postgres:PASSWORD@db.PROJECT_REF.supabase.co:5432/postgres
// Or use pooler with SNI - use REST is not enough; use direct fetch to pg_meta if available
// Alternative: use PostgREST via Supabase custom function

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) { console.error('Missing env'); process.exit(1); }

// Supabase exposes a Postgres HTTP query endpoint via the pg-meta admin - we need to use direct DB.
// Try pg direct with the project's IPv6 hostname
const projectRef = new URL(url).hostname.split('.')[0];
const password = process.env.SUPABASE_DB_PASSWORD;
if (!password) { console.error('Set SUPABASE_DB_PASSWORD env'); process.exit(1); }

const configs = [
  `postgresql://postgres:${encodeURIComponent(password)}@db.${projectRef}.supabase.co:5432/postgres`,
];
for (const conn of configs) {
  try {
    const client = new pg.Client({
      connectionString: conn,
      ssl: { rejectUnauthorized: false },
    });
    await client.connect();
    console.log('Connected via', conn.replace(/:[^:@]+@/, ':***@'));
    await client.query(sql);
    console.log('Migration applied.');
    await client.end();
    process.exit(0);
  } catch (e) {
    console.error('Failed:', e.message);
  }
}
process.exit(1);
