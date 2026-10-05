// Assign a portion of generated Demo Event records to an existing account.
// Usage: node scripts/assign-demo-events.mjs --email d24dce154@charusat.edu.in --count 20

import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

function loadDotEnvLocal() {
  if (!fs.existsSync('.env.local')) return;
  for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index < 0) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!process.env[key]) process.env[key] = value;
  }
}
loadDotEnvLocal();

const args = process.argv.slice(2);
const emailIndex = args.indexOf('--email');
const countIndex = args.indexOf('--count');
const email = emailIndex >= 0 ? args[emailIndex + 1] : 'd24dce154@charusat.edu.in';
const count = countIndex >= 0 ? Number(args[countIndex + 1]) : 20;
if (!email || !Number.isInteger(count) || count < 1 || count > 1000) throw new Error('Use --email <address> and --count 1-1000');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

const users = [];
for (let page = 1; ; page += 1) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) throw error;
  users.push(...data.users);
  if (data.users.length < 1000) break;
}
const target = users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
if (!target) throw new Error(`No Auth user found for ${email}`);

const { error: profileError } = await supabase.from('profiles').update({ role: 'organizer', organizer_request_status: 'approved' }).eq('id', target.id);
if (profileError) throw profileError;

const { data: events, error: eventsError } = await supabase.from('events').select('id, title, created_by').like('title', 'Demo Event %').neq('created_by', target.id).order('title');
if (eventsError) throw eventsError;
if (!events?.length) throw new Error('No unassigned Demo Event records found');

// Select evenly through the generated set so ownership is spread across clubs
// and dates instead of taking one contiguous block.
const selected = [];
const step = events.length / Math.min(count, events.length);
for (let index = 0; index < Math.min(count, events.length); index += 1) selected.push(events[Math.floor(index * step)]);
for (const event of selected) {
  const { error } = await supabase.from('events').update({ created_by: target.id }).eq('id', event.id);
  if (error) throw error;
}

console.log(`Assigned ${selected.length} demo events to ${email}.`);
console.log(`Organizer access confirmed for ${target.id}.`);
