# Auto-Deploy Setup

Automatically pull and apply changes to the production server when pushing to GitHub.

## How it works

1. You push to GitHub
2. GitHub sends a POST request to `/webhook` on the server
3. The server verifies the request signature and runs `git pull`
4. The Node process is reloaded to pick up any `server.js` changes

Static HTML/JS changes are picked up by `git pull` alone — Express reads those from disk on every request. Changes to `server.js` require a Node process restart since it is loaded into memory at startup.

---

## Step 1 — Passwordless SSH deploy key

Run on the server:

```bash
ssh-keygen -t ed25519 -C "deploy" -N "" -f ~/.ssh/deploy_key
cat ~/.ssh/deploy_key.pub
```

Add the public key to GitHub: **repo → Settings → Deploy keys → Add deploy key** (read-only).

Add to `~/.ssh/config` on the server:

```
Host github.com
  IdentityFile ~/.ssh/deploy_key
  IdentitiesOnly yes
```

---

## Step 2 — Webhook endpoint

Already implemented in `server.js`. Verifies the GitHub HMAC signature before running the deploy command.

Set `WEBHOOK_SECRET` in `.env` to a strong random string.

---

## Step 3 — Register the webhook on GitHub

**repo → Settings → Webhooks → Add webhook**

- Payload URL: `https://your-server.com/webhook`
- Content type: `application/json`
- Secret: same value as `WEBHOOK_SECRET` in `.env`
- Event: **push** only

---

## Step 4 — Auto-restart Node on server.js changes

### Recommended: PM2 inside the container

Gives the process manager control over Node without needing Docker socket access.

**Dockerfile:**
```dockerfile
RUN npm install -g pm2
CMD ["pm2-runtime", "server.js"]
```

**Webhook command in server.js:**
```javascript
exec('git pull && pm2 reload all', ...)
```

### Alternative: Docker socket access

Mount the Docker socket into the container so it can restart itself.

**docker-compose.yml:**
```yaml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock
  - /usr/bin/docker:/usr/bin/docker
```

**Webhook command in server.js:**
```javascript
exec('git pull && docker compose restart', ...)
```

> Note: giving a container access to the Docker socket is a significant privilege — it can control all containers on the host. Prefer the PM2 approach.

---

## Current state

- Webhook endpoint is implemented in `server.js`
- `WEBHOOK_SECRET` is in `.env`
- The webhook currently runs `git pull && docker compose restart`
- PM2 approach is preferred but not yet implemented
