# Yaji — Open Hours Availability Tool

A lightweight tool for communicating when you're available for ad-hoc discussions, either at a physical location or in an online meeting room.

## Goals

- Let visitors know your upcoming open hours (dates, times, location or meeting link)
- Show a live "Currently Present" indicator when you're actually there
- Embed easily into an existing plain HTML/CSS site via `<iframe>`

## Architecture

**Runtime:** Node.js + Express  
**Storage:** JSON files (no database)  
**Real-time:** Server-Sent Events (SSE)

### Data Files

| File | Purpose |
|------|---------|
| `data/schedule.json` | Array of upcoming slots `[{ date, time, label, link }]` |
| `data/state.json` | Current presence status `{ present: true/false }` |

### Endpoints

| Route | Description |
|-------|-------------|
| `GET /widget` | Minimal iframe-embeddable HTML — status badge + "View Schedule" link |
| `GET /schedule` | Full public schedule page |
| `GET /admin` | Password-protected admin page — toggle presence, manage schedule |
| `GET /events` | SSE stream — pushes presence changes to open widget/schedule pages in real time |
| `POST /presence` | Webhook — sets presence on/off, secured with a secret key header |

## Embedding

Drop this into your existing HTML site wherever you want the status widget to appear:

```html
<iframe src="https://your-server/widget" width="300" height="60" frameborder="0"></iframe>
```

## File Structure

```
yaji/
├── data/
│   ├── schedule.json
│   └── state.json
├── public/
│   ├── schedule.html
│   ├── widget.html
│   └── admin.html
├── server.js
├── package.json
└── PLAN.md
```

## Tech Decisions

- **No framework** — plain HTML/CSS for pages, vanilla JS for admin interactions
- **JSON files over a DB** — simple, portable, no setup overhead; easy to inspect or edit manually
- **SSE over WebSockets** — one-directional push is sufficient; simpler to implement and proxy
- **Express** — minimal server to read/write JSON files and serve the SSE stream
- **web-push** — handles VAPID key generation and Web Push fan-out to subscribers
- **Discord webhook** — outbound HTTP POST to Discord; no bot or OAuth setup required

## Hosting

Requires a server that can run Node.js (the presence toggle needs something to write the JSON file). Options:

- Small VPS (DigitalOcean, Linode, etc.)
- [Railway](https://railway.app) — free tier available
- [Render](https://render.com) — free tier available

## Notifications

### Web Push
Visitors click "Notify Me" on the widget or schedule page. The browser prompts for permission, then the subscription is saved to `data/subscriptions.json`. When presence is toggled to available, the server fans out a push notification to all subscribers using the `web-push` npm package.

- No third-party account needed
- Subscriptions stored in `data/subscriptions.json` alongside other JSON files
- Notification includes your name/label and a link to the schedule page

New endpoint:

| Route | Description |
|-------|-------------|
| `POST /subscribe` | Accepts a browser push subscription object and appends it to `subscriptions.json` |

### Discord Webhook
When presence is toggled to available, the server posts a message to a configured Discord channel via a webhook URL. No bot or OAuth needed — just a webhook URL from Discord's channel settings.

- Configure once: paste the Discord webhook URL into a `.env` file as `DISCORD_WEBHOOK_URL`
- Message includes status change, any active schedule entries, and a link to the schedule page
- Fires on the same event that triggers Web Push — no separate endpoint needed

Updated data files:

| File | Purpose |
|------|---------|
| `data/schedule.json` | Array of upcoming slots `[{ date, time, label, link }]` |
| `data/state.json` | Current presence status `{ present: true/false }` |
| `data/subscriptions.json` | Web Push subscription objects |

## Stream Deck Integration

Uses the [API Ninja plugin](https://apps.elgato.com/plugins/com.cre8or.api-ninja) (free, no browser tab opens).

Configure two Stream Deck buttons:

**Go Available**
- Action: API Ninja → HTTP Request
- Method: `POST`
- URL: `https://your-server/presence`
- Header: `x-api-key: your-secret-key`
- Body: `{ "present": true }`

**Go Unavailable**
- Action: API Ninja → HTTP Request
- Method: `POST`
- URL: `https://your-server/presence`
- Header: `x-api-key: your-secret-key`
- Body: `{ "present": false }`

The server validates `x-api-key` against an environment variable (`API_KEY`) and rejects requests that don't match.

## Future Ideas

- Multiple locations/rooms per slot
- iCal feed of the schedule
- Simple link-based presence toggle (no admin UI needed — visit a secret URL to go live)
- Configurable "auto-off" timer (mark yourself absent after N minutes)
- Allow me to mark the event "full".  This allows me to prevent too many people joining a session.  
- Require participants to have an account to join a session.  This reinforces a true community vs a bunch of annonymous participants.  
