// Generate a realistic Campus Pulse dataset.
// Usage: node scripts/generate-demo-data.mjs [--users 250] [--clubs 25] [--events 400]
// Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.

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
function numberArg(name, fallback, min, max) {
  const index = args.indexOf(`--${name}`);
  const value = index >= 0 ? Number(args[index + 1]) : fallback;
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`--${name} must be an integer between ${min} and ${max}`);
  return value;
}
const counts = { users: numberArg('users', 100, 1, 2000), clubs: numberArg('clubs', 15, 1, 100), events: numberArg('events', 120, 1, 2000) };
const password = process.env.DEMO_USER_PASSWORD || 'CampusDemo123!';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

let seed = 0xCA1F05E;
function random() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0x100000000; }
function pick(items) { return items[Math.floor(random() * items.length)]; }
function sample(items, count) { return [...items].sort(() => random() - 0.5).slice(0, Math.min(count, items.length)); }
function chunks(items, size = 500) { const result = []; for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size)); return result; }
async function upsertRows(table, rows, onConflict) {
  for (const group of chunks(rows)) {
    if (!group.length) continue;
    const { error } = await supabase.from(table).upsert(group, onConflict ? { onConflict } : undefined);
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}
async function getAllUsers() {
  const users = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) return users;
  }
}
function eventTime(dayOffset, hour) {
  const date = new Date(Date.now() + dayOffset * 86400000);
  date.setUTCHours(hour, Math.floor(random() * 60), 0, 0);
  return date.toISOString();
}

const firstNames = ['Aarav', 'Aisha', 'Arjun', 'Diya', 'Kabir', 'Meera', 'Neha', 'Rohan', 'Sana', 'Vihaan', 'Ishita', 'Aditya', 'Ananya', 'Karan', 'Mira', 'Rahul', 'Tara', 'Yash', 'Zoya', 'Nikhil'];
const lastNames = ['Sharma', 'Patel', 'Khan', 'Iyer', 'Reddy', 'Nair', 'Bose', 'Mehta', 'Kapoor', 'Das', 'Joshi', 'Malhotra', 'Verma', 'Singh', 'Rao'];
const clubThemes = [
  ['Computer Science', 'hackathons, coding workshops, and software projects'], ['Robotics', 'robotics builds, embedded systems, and automation'], ['Environmental Action', 'sustainability drives and campus conservation'], ['Cultural Arts', 'music, theatre, dance, and creative showcases'], ['Sports Council', 'intramural sports and inter-college competitions'], ['Photography', 'street photography and visual storytelling'], ['Entrepreneurship', 'startup ideas, pitch nights, and founder talks'], ['Literary Society', 'reading circles, writing workshops, and debates'], ['Volunteer Outreach', 'community service, fundraisers, and outreach'], ['Design Guild', 'product design, illustration, and user experience'], ['Finance Forum', 'markets, investing, and financial literacy'], ['Public Speaking', 'debates, conferences, and speaking practice'], ['Health and Wellness', 'wellness sessions, first aid, and mental health'], ['Astronomy Club', 'stargazing, astrophysics, and space science'], ['Language Exchange', 'language practice and international culture'],
];
const eventKinds = ['Workshop', 'Meetup', 'Challenge', 'Showcase', 'Drive', 'Summit', 'Open Mic', 'Tournament', 'Talk', 'Bootcamp'];
const taskKinds = ['Registration desk', 'Logistics crew', 'Photography team', 'Setup and teardown', 'Refreshments team', 'Social media team', 'Speaker support', 'Help desk'];

console.log(`Generating ${counts.users} users, ${counts.clubs} clubs, and ${counts.events} events...`);
const existingUsers = new Map((await getAllUsers()).map((user) => [user.email, user]));
const profiles = [];
const organizerCount = Math.max(5, Math.ceil(counts.users * 0.1));
for (let index = 1; index <= counts.users; index += 1) {
  const email = `demo.${String(index).padStart(4, '0')}@campus-pulse.test`;
  const fullName = `${pick(firstNames)} ${pick(lastNames)}`;
  let user = existingUsers.get(email);
  if (!user) {
    const result = await supabase.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName } });
    if (result.error) throw result.error;
    user = result.data.user;
  }
  profiles.push({ id: user.id, email, full_name: user.user_metadata?.full_name || fullName, role: index <= organizerCount ? 'organizer' : 'student', organizer_request_status: index <= organizerCount ? 'approved' : 'none' });
}
await upsertRows('profiles', profiles, 'id');
const organizers = profiles.slice(0, organizerCount);

const clubRows = [];
for (let index = 0; index < counts.clubs; index += 1) {
  const [theme, description] = clubThemes[index % clubThemes.length];
  const suffix = index < clubThemes.length ? '' : ` ${Math.floor(index / clubThemes.length) + 1}`;
  clubRows.push({ name: `Demo ${theme}${suffix}`, description: `A demo club focused on ${description}.` });
}
await upsertRows('clubs', clubRows, 'name');
const { data: clubs, error: clubsError } = await supabase.from('clubs').select('id, name').like('name', 'Demo %').order('name');
if (clubsError) throw clubsError;

const memberships = [];
for (const profile of profiles) for (const club of sample(clubs, Math.min(clubs.length, 2 + Math.floor(random() * 5)))) memberships.push({ club_id: club.id, profile_id: profile.id });
await upsertRows('club_members', memberships, 'club_id,profile_id');

const { data: oldEvents, error: oldEventsError } = await supabase.from('events').select('id, title, club_id, created_by, visibility').like('title', 'Demo Event %');
if (oldEventsError) throw oldEventsError;
const oldEventByTitle = new Map((oldEvents || []).map((event) => [event.title, event]));
const events = [];
for (let index = 1; index <= counts.events; index += 1) {
  const club = clubs[(index - 1) % clubs.length];
  const title = `Demo Event ${String(index).padStart(4, '0')} · ${pick(eventKinds)}`;
  let event = oldEventByTitle.get(title);
  if (!event) {
    const startsAt = eventTime(Math.floor(random() * 180) - 30, 9 + Math.floor(random() * 9));
    const endsAt = new Date(new Date(startsAt).getTime() + (2 + Math.floor(random() * 5)) * 3600000).toISOString();
    const result = await supabase.from('events').insert({ club_id: club.id, title, description: `A realistic demo event for the ${club.name.replace('Demo ', '')} community.`, location: pick(['Main Auditorium', 'Innovation Lab', 'Central Lawn', 'Student Center', 'Sports Complex', 'Engineering Block']), starts_at: startsAt, ends_at: endsAt, visibility: random() < 0.7 ? 'public' : 'club_only', created_by: pick(organizers).id }).select('id, title, club_id, created_by, visibility').single();
    if (result.error) throw result.error;
    event = result.data;
  }
  events.push(event);
}

const { data: existingTasks, error: tasksError } = await supabase.from('tasks').select('id, event_id, title, volunteers_needed').in('event_id', events.map((event) => event.id));
if (tasksError) throw tasksError;
const taskKeys = new Set((existingTasks || []).map((task) => `${task.event_id}:${task.title}`));
const newTasks = [];
for (const [eventIndex, event] of events.entries()) {
  for (let index = 0; index < 2 + Math.floor(random() * 4); index += 1) {
    const title = `Demo ${taskKinds[(index + eventIndex) % taskKinds.length]}`;
    if (!taskKeys.has(`${event.id}:${title}`)) newTasks.push({ event_id: event.id, title, description: 'Help make this demo event run smoothly.', volunteers_needed: 2 + Math.floor(random() * 7) });
  }
}
await upsertRows('tasks', newTasks);
const { data: tasks, error: refreshedTasksError } = await supabase.from('tasks').select('id, event_id, volunteers_needed').in('event_id', events.map((event) => event.id));
if (refreshedTasksError) throw refreshedTasksError;

const profileClubIds = new Map();
for (const membership of memberships) { if (!profileClubIds.has(membership.profile_id)) profileClubIds.set(membership.profile_id, new Set()); profileClubIds.get(membership.profile_id).add(membership.club_id); }
const eligible = (event, profile) => event.visibility === 'public' || event.created_by === profile.id || profileClubIds.get(profile.id)?.has(event.club_id);
const rsvps = [];
for (const event of events) for (const profile of sample(profiles, 8 + Math.floor(random() * 35))) if (eligible(event, profile)) rsvps.push({ event_id: event.id, profile_id: profile.id });
await upsertRows('event_rsvps', rsvps, 'event_id,profile_id');

const signups = [];
for (const task of tasks) {
  const event = events.find((item) => item.id === task.event_id);
  const candidates = profiles.filter((profile) => eligible(event, profile));
  for (const profile of sample(candidates, Math.max(1, Math.floor(task.volunteers_needed * (0.45 + random() * 0.5))))) signups.push({ task_id: task.id, event_id: task.event_id, profile_id: profile.id });
}
await upsertRows('volunteer_signups', signups, 'task_id,profile_id');

console.log('Demo data ready:');
console.log(`- ${profiles.length} accounts (${organizers.length} organizers, ${profiles.length - organizers.length} students)`);
console.log(`- ${clubs.length} clubs, ${events.length} events, ${tasks.length} volunteer tasks`);
console.log(`- ${memberships.length} club memberships, ${rsvps.length} RSVPs, ${signups.length} volunteer signups`);
console.log(`- Demo password: ${password}`);
