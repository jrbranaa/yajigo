require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const webpush = require('web-push');

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, 'data');
const SCHEDULE_FILE = path.join(DATA_DIR, 'schedule.json');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const SUBS_FILE = path.join(DATA_DIR, 'subscriptions.json');

fs.mkdirSync(DATA_DIR, { recursive: true });

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    `mailto:${process.env.VAPID_EMAIL || 'admin@example.com'}`,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

// ── Helpers ──────────────────────────────────────────────────────────────────

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ── SSE ───────────────────────────────────────────────────────────────────────

let clients = [];

function broadcast(state) {
  clients.forEach(res => res.write(`data: ${JSON.stringify(state)}\n\n`));
}

app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  res.write(`data: ${JSON.stringify(readJSON(STATE_FILE, { present: false }))}\n\n`);
  clients.push(res);
  req.on('close', () => { clients = clients.filter(c => c !== res); });
});

// ── Auth ──────────────────────────────────────────────────────────────────────

function requireApiKey(req, res, next) {
  if (!process.env.API_KEY || req.headers['x-api-key'] !== process.env.API_KEY)
    return res.status(401).json({ error: 'Unauthorized' });
  next();
}

function requireAdmin(req, res, next) {
  if (!process.env.ADMIN_PASSWORD || req.headers['x-admin-password'] !== process.env.ADMIN_PASSWORD)
    return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// ── Public API ────────────────────────────────────────────────────────────────

app.get('/api/state', (req, res) => res.json(readJSON(STATE_FILE, { present: false })));
app.get('/api/schedule', (req, res) => res.json(readJSON(SCHEDULE_FILE, [])));
app.get('/vapid-public-key', (req, res) => res.send(process.env.VAPID_PUBLIC_KEY || ''));

app.post('/subscribe', (req, res) => {
  const sub = req.body;
  if (!sub || !sub.endpoint) return res.status(400).json({ error: 'Invalid subscription' });
  const subs = readJSON(SUBS_FILE, []);
  if (!subs.find(s => s.endpoint === sub.endpoint)) {
    subs.push(sub);
    writeJSON(SUBS_FILE, subs);
  }
  res.status(201).json({ ok: true });
});

// ── Stream Deck webhook ───────────────────────────────────────────────────────

app.post('/presence', requireApiKey, async (req, res) => {
  await setPresence(!!req.body.present);
  res.json({ ok: true, state: readJSON(STATE_FILE, { present: false }) });
});

// ── Admin endpoints ───────────────────────────────────────────────────────────

app.post('/admin/login', (req, res) => {
  if (req.body.password !== process.env.ADMIN_PASSWORD)
    return res.status(401).json({ error: 'Wrong password' });
  res.json({ ok: true });
});

app.post('/admin/presence', requireAdmin, async (req, res) => {
  await setPresence(!!req.body.present);
  res.json({ ok: true, state: readJSON(STATE_FILE, { present: false }) });
});

app.post('/admin/schedule', requireAdmin, (req, res) => {
  const { date, time, label, link, duration } = req.body;
  if (!date || !time || !label)
    return res.status(400).json({ error: 'date, time, and label are required' });
  const schedule = readJSON(SCHEDULE_FILE, []);
  const entry = {
    id: Date.now().toString(),
    date,
    time,
    label,
    link: link || null,
    duration: duration ? parseInt(duration) : null
  };
  schedule.push(entry);
  schedule.sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
  writeJSON(SCHEDULE_FILE, schedule);
  res.status(201).json(entry);
});

app.delete('/admin/schedule/:id', requireAdmin, (req, res) => {
  const schedule = readJSON(SCHEDULE_FILE, []).filter(e => e.id !== req.params.id);
  writeJSON(SCHEDULE_FILE, schedule);
  res.json({ ok: true });
});

// ── Presence logic ────────────────────────────────────────────────────────────

async function setPresence(present) {
  const state = { present, updatedAt: new Date().toISOString() };
  writeJSON(STATE_FILE, state);
  broadcast(state);
  if (present) {
    await Promise.all([notifySubscribers(), notifyDiscord()]);
  }
}

async function notifySubscribers() {
  if (!process.env.VAPID_PUBLIC_KEY) return;
  const subs = readJSON(SUBS_FILE, []);
  if (!subs.length) return;

  const schedule = readJSON(SCHEDULE_FILE, []);
  const today = new Date().toISOString().split('T')[0];
  const entry = schedule.find(e => e.date === today);
  const siteName = process.env.SITE_NAME || 'Open Hours';

  const payload = JSON.stringify({
    title: `${siteName} — Now Available`,
    body: entry ? entry.label : 'Available now for drop-in discussions',
    url: '/schedule'
  });

  const results = await Promise.allSettled(subs.map(s => webpush.sendNotification(s, payload)));
  const valid = subs.filter((_, i) => results[i].status === 'fulfilled');
  if (valid.length !== subs.length) writeJSON(SUBS_FILE, valid);
}

async function notifyDiscord() {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  const schedule = readJSON(SCHEDULE_FILE, []);
  const today = new Date().toISOString().split('T')[0];
  const entries = schedule.filter(e => e.date === today);
  const siteName = process.env.SITE_NAME || 'Open Hours';
  const siteUrl = process.env.SITE_URL || '';

  let content = `🟢 **${siteName} — Now Available for Drop-ins**`;
  if (entries.length) {
    content += '\n' + entries.map(e =>
      `• ${e.time}${e.duration ? ` (${e.duration}m)` : ''} — ${e.label}${e.link ? ` | [Join](${e.link})` : ''}`
    ).join('\n');
  }
  if (siteUrl) content += `\n\n👉 [View Full Schedule](${siteUrl}/schedule)`;

  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content })
  });
}

// ── Page routes ───────────────────────────────────────────────────────────────

app.get('/', (req, res) => res.redirect('/schedule'));

app.listen(PORT, () => console.log(`Yaji running on http://localhost:${PORT}`));
