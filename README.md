# Yaji — Open Hours Availability Tool

A lightweight server that lets you communicate when you're available for ad-hoc discussions — in person or in an online meeting room. Embed a live status widget on any existing HTML site via `<iframe>`.

## Features

- **Live presence indicator** — a pulsing green dot when you're available, updated in real time via Server-Sent Events
- **Schedule page** — lists your upcoming open-hours sessions by date
- **Admin page** — password-protected; toggle presence and manage the schedule from a browser
- **Stream Deck integration** — go live or offline instantly with a button press (via the API Ninja plugin)
- **Web Push notifications** — visitors subscribe once and get a browser notification when you go live
- **Discord webhook** — posts to a channel automatically when you go live
- **No database** — all data stored in plain JSON files

---

## Requirements

- Node.js 18 or later
- A server that can run Node.js (see [Hosting](#hosting))

---

## Local Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in the values:

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | Port to listen on (default: `3000`) |
| `SITE_NAME` | Yes | Your name or page title — shown in notifications |
| `SITE_URL` | Yes | Full URL where Yaji is hosted (e.g. `https://yaji.example.com`) |
| `ADMIN_PASSWORD` | Yes | Password for the `/admin` page |
| `API_KEY` | Yes | Secret key used by the Stream Deck webhook |
| `DISCORD_WEBHOOK_URL` | No | Discord channel webhook URL |
| `VAPID_PUBLIC_KEY` | No | Required for Web Push notifications |
| `VAPID_PRIVATE_KEY` | No | Required for Web Push notifications |
| `VAPID_EMAIL` | No | Contact email sent with VAPID headers |

### 3. Generate VAPID keys (Web Push)

If you want Web Push notifications, generate a key pair once and paste the output into `.env`:

```bash
npm run generate-keys
```

Skip this step if you don't need push notifications.

### 4. Start the server

```bash
npm start
```

Visit `http://localhost:3000` — it redirects to the public schedule page.

---

## Pages

| URL | Description |
|---|---|
| `/schedule` | Public schedule and status page |
| `/widget` | Minimal iframe-embeddable status widget |
| `/admin` | Password-protected admin panel |

---

## Embedding the Widget

Add this snippet to any HTML page on your existing site:

```html
<iframe
  src="https://your-server.com/widget"
  width="320"
  height="50"
  frameborder="0"
  style="border:none;"
></iframe>
```

The widget shows a live dot (green when present, gray when not) and a "View schedule →" link. It updates in real time without a page refresh.

---

## Stream Deck Setup

Install the free [API Ninja plugin](https://apps.elgato.com/plugins/com.cre8or.api-ninja) from the Elgato Marketplace.

Create two buttons:

**Go Live**
- Method: `POST`
- URL: `https://your-server.com/presence`
- Header: `x-api-key: your-api-key-from-env`
- Body: `{"present": true}`

**Go Offline**
- Method: `POST`
- URL: `https://your-server.com/presence`
- Header: `x-api-key: your-api-key-from-env`
- Body: `{"present": false}`

---

## Discord Webhook Setup

1. Open Discord and go to the channel where you want notifications posted
2. Click **Edit Channel → Integrations → Webhooks → New Webhook**
3. Copy the webhook URL
4. Paste it into `.env` as `DISCORD_WEBHOOK_URL`

Yaji posts to that channel automatically whenever you go live.

---

## Hosting

Yaji needs a server that can run Node.js persistently. The JSON files are stored on disk, so a platform with a persistent filesystem is required (not serverless functions).

### Option A — Railway (recommended for simplicity)

1. Push this repo to GitHub
2. Go to [railway.app](https://railway.app) and create a new project from your GitHub repo
3. Add all `.env` values under **Variables** in the Railway dashboard
4. Railway detects `npm start` automatically and deploys

Railway's free tier includes enough resources for this workload.

### Option B — Render

1. Push this repo to GitHub
2. Go to [render.com](https://render.com) and create a **New Web Service** from your repo
3. Set **Build Command** to `npm install` and **Start Command** to `npm start`
4. Add environment variables under **Environment**

> **Note:** Render's free tier spins down after inactivity. Upgrade to a paid instance ($7/mo) for always-on availability.

### Option C — VPS (DigitalOcean, Linode, etc.)

1. SSH into your server and clone the repo
2. Copy `.env.example` to `.env` and fill in values
3. Run `npm install`
4. Use [PM2](https://pm2.keymetrics.io/) to keep the process alive:

```bash
npm install -g pm2
pm2 start server.js --name yaji
pm2 save
pm2 startup
```

5. Point a domain at your server and use [Caddy](https://caddyserver.com/) or nginx to proxy the port and handle HTTPS. Example Caddy config:

```
yaji.example.com {
    reverse_proxy localhost:3000
}
```

HTTPS is required for Web Push notifications to work.

---

## Data Files

All state is stored in the `data/` directory as plain JSON. You can inspect or edit them directly.

| File | Contents |
|---|---|
| `data/state.json` | Current presence status and last-updated timestamp |
| `data/schedule.json` | Array of upcoming sessions |
| `data/subscriptions.json` | Web Push subscriber objects (excluded from git) |

---

## API Reference

| Method | Route | Auth | Description |
|---|---|---|---|
| `GET` | `/api/state` | None | Current presence state |
| `GET` | `/api/schedule` | None | All schedule entries |
| `GET` | `/events` | None | SSE stream for live presence updates |
| `GET` | `/vapid-public-key` | None | VAPID public key for Web Push |
| `POST` | `/subscribe` | None | Register a Web Push subscription |
| `POST` | `/presence` | `x-api-key` header | Set presence on/off (Stream Deck) |
| `POST` | `/admin/login` | Password in body | Validate admin password |
| `POST` | `/admin/presence` | `x-admin-password` header | Set presence from admin UI |
| `POST` | `/admin/schedule` | `x-admin-password` header | Add a schedule entry |
| `DELETE` | `/admin/schedule/:id` | `x-admin-password` header | Remove a schedule entry |

### Schedule entry shape

```json
{
  "id": "1716000000000",
  "date": "2026-05-10",
  "time": "14:00",
  "label": "Open Office Hours",
  "link": "https://meet.google.com/abc-def-ghi",
  "duration": 60
}
```

`link` and `duration` are optional.
