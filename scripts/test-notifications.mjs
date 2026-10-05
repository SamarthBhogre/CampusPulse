// Queue one user confirmation and one organizer participation notification.
// Usage: node scripts/test-notifications.mjs --user user@example.com --organizer organizer@example.com
import fs from 'node:fs';

if (fs.existsSync('.env.local')) for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const i = line.indexOf('='); if (i < 1) continue;
  const key = line.slice(0, i).trim(); let value = line.slice(i + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
  if (!process.env[key]) process.env[key] = value;
}
const args = process.argv.slice(2);
const valueFor = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : null; };
const userEmail = valueFor('user');
const organizerEmail = valueFor('organizer');
if (!userEmail || !organizerEmail) throw new Error('Provide --user and --organizer email addresses');
const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!apiUrl || !serviceKey) throw new Error('Missing Supabase environment variables');
const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };
const users = [];
for (let page = 1; ; page += 1) {
  const response = await fetch(`${apiUrl}/auth/v1/admin/users?page=${page}&per_page=1000`, { headers });
  const data = await response.json();
  if (!response.ok) throw new Error(data.msg || data.message || 'Could not list users');
  users.push(...data.users);
  if (data.users.length < 1000) break;
}
const find = (email) => users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
const user = find(userEmail);
const organizer = find(organizerEmail);
if (!user || !organizer) throw new Error('Both notification recipients must already exist');
const rows = [
  { recipient_id: user.id, type: 'rsvp_confirmation', payload: { event_title: 'Notification workflow test', test: true } },
  { recipient_id: organizer.id, type: 'rsvp_received', payload: { event_title: 'Notification workflow test', actor_name: user.user_metadata?.full_name || userEmail, test: true } },
];
const response = await fetch(`${apiUrl}/rest/v1/notification_queue?select=id,recipient_id,type,created_at`, { method: 'POST', headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify(rows) });
const data = await response.json();
if (!response.ok) throw new Error(data.message || 'Could not queue notifications');
console.log(`Queued ${data.length} notification tests: ${data.map((row) => row.type).join(', ')}`);
