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

const sql = process.argv.slice(2).join(' ');
if (!sql) {
  console.error('usage: node query-db.mjs <sql>');
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const password = process.env.SUPABASE_DB_PASSWORD;
if (!url || !password) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_DB_PASSWORD');
  process.exit(1);
}

const projectRef = new URL(url).hostname.split('.')[0];
const conn = `postgresql://postgres:${encodeURIComponent(password)}@db.${projectRef}.supabase.co:5432/postgres`;
const client = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });

await client.connect();
const result = await client.query(sql);
console.table(result.rows);
await client.end();
