// Assign existing demo clubs to demo/real accounts after migration 017.
// Usage: node scripts/assign-club-managers.mjs
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

if (fs.existsSync('.env.local')) for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const i = line.indexOf('='); if (i < 1) continue;
  const key = line.slice(0, i).trim(); let value = line.slice(i + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
  if (!process.env[key]) process.env[key] = value;
}
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const targetEmails = [
  { email: 'smbhogre@gmail.com', count: 2, role: 'student', organizer_request_status: 'none' },
  { email: 'd24dce154@charusat.edu.in', count: 4, role: 'organizer', organizer_request_status: 'approved' },
];
const users = [];
for (let page = 1; ; page += 1) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) throw error;
  users.push(...data.users);
  if (data.users.length < 1000) break;
}
const { data: clubs, error: clubsError } = await supabase.from('clubs').select('id, name').like('name', 'Demo %').order('name');
if (clubsError) throw clubsError;
const { data: assigned, error: assignedError } = await supabase.from('club_managers').select('club_id, profile_id');
if (assignedError) throw assignedError;
const assignedClubIds = new Set((assigned || []).map((row) => row.club_id));
let available = clubs.filter((club) => !assignedClubIds.has(club.id));
for (const target of targetEmails) {
  const user = users.find((item) => item.email?.toLowerCase() === target.email);
  if (!user) throw new Error(`No Auth user found for ${target.email}`);
  const selected = available.splice(0, target.count);
  if (selected.length < target.count) throw new Error(`Only ${selected.length} unassigned demo clubs remain for ${target.email}`);
  const { error: profileError } = await supabase.from('profiles').update({ role: target.role, organizer_request_status: target.organizer_request_status }).eq('id', user.id);
  if (profileError) throw profileError;
  const { error: managerError } = await supabase.from('club_managers').upsert(selected.map((club) => ({ club_id: club.id, profile_id: user.id })), { onConflict: 'club_id,profile_id' });
  if (managerError) throw managerError;
  const { error: memberError } = await supabase.from('club_members').upsert(selected.map((club) => ({ club_id: club.id, profile_id: user.id })), { onConflict: 'club_id,profile_id' });
  if (memberError) throw memberError;
  console.log(`${target.email}: ${selected.map((club) => club.name).join(', ')}`);
}
