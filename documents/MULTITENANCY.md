# Multi-Tenancy Architecture

## Approach: One Container Per Tenant

Each tenant runs as a fully isolated Yajigo container with its own subdomain, data volume, and credentials. The control plane handles provisioning, routing, and lifecycle. The core app requires no changes.

## Why this works well for Yajigo

- True data isolation — tenants never share storage, credentials, or process memory
- The app stays simple — no tenant ID threading through the codebase
- Self-hosting portability — a tenant can take their container and volume and run it anywhere
- Security blast radius is contained per tenant

---

## URL Structure

```
yajigo.com/              → Control plane (registration, directory, search)
jrbranaa.yajigo.com/     → jrbranaa's Yajigo instance
jrbranaa.yajigo.com/admin    → jrbranaa's admin panel
jrbranaa.yajigo.com/widget   → jrbranaa's embeddable widget
```

Custom domains are a future option — a tenant could CNAME `meet.jrbranaa.com` to their instance. Traefik supports this without structural changes.

---

## Architecture Overview

```
                        Internet
                           |
                        Traefik  (reverse proxy + SSL)
                           |
          ┌────────────────┼────────────────┐
          |                |                |
     [tenant-a]       [tenant-b]       [tenant-c]
   data volume       data volume       data volume
```

**Routing:** `tenant-a.yajigo.com` → tenant-a container  
**SSL:** Traefik handles Let's Encrypt certificates automatically per subdomain  
**Discovery:** Traefik watches Docker labels on containers — no config file changes when new tenants are added

---

## Components

### Core app (current)
No changes needed. Each container runs the existing `server.js` with its own `.env` and `data/` volume.

### Traefik (reverse proxy)
Handles subdomain routing and SSL termination. Each tenant container gets labels:

```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.tenant-a.rule=Host(`tenant-a.yajigo.com`)"
  - "traefik.http.routers.tenant-a.tls.certresolver=letsencrypt"
```

### Control plane (to build)
A new Node.js + Express app that is the front door for the platform. Responsibilities:

- **Tenant registration** — create an account (username, email)
- **Tenant directory / search** — find tenants by username or email
- **Container lifecycle** — spin up a Yajigo container on registration, tear it down on deletion
- **Platform admin panel** — operator-level view of all tenants and container states
- **Upgrades** — pull new image and restart tenant containers

**Stack:** Node.js + Express + SQLite (keeps the no-external-database philosophy, one level up).  
**Docker integration:** `dockerode` npm package (Docker SDK) — recommended over shelling out for reliable error handling.

---

## Data Model (Control Plane)

Stored in SQLite. One table: `tenants`.

```json
{
  "id": "uuid",
  "username": "jrbranaa",
  "email": "user@example.com",
  "containerName": "yajigo-jrbranaa",
  "containerStatus": "running | stopped | provisioning",
  "createdAt": "ISO timestamp"
}
```

---

## Data Persistence

Each tenant gets a named Docker volume mounted at `/app/data`:

```yaml
volumes:
  yajigo-data-jrbranaa:
    driver: local

services:
  yajigo-jrbranaa:
    image: yajigo:latest
    volumes:
      - yajigo-data-jrbranaa:/app/data
```

- Data survives container restarts and image upgrades
- A tenant can export their volume and self-host immediately
- Upgrades are: pull new image → restart container — data untouched

---

## Self-Hosting Exit Path

A product differentiator worth leaning into. The pitch:
> Start hosted. Own your data. Leave anytime.

Exit flow for a tenant:
1. Export their data volume:
   ```bash
   docker run --rm -v yajigo-data-jrbranaa:/data -v $(pwd):/backup alpine \
     tar czf /backup/data.tar.gz /data
   ```
2. Pull the Yajigo image: `docker pull yajigo/yajigo`
3. Run locally with their data volume
4. Point their domain at the new server

No vendor lock-in. No data conversion. One `docker run`.

---

## User Flows

### Registration
1. Tenant visits `yajigo.com` and fills out the registration form (username, email)
2. Control plane validates: username is alphanumeric/hyphens, not taken, email not taken
3. Control plane provisions the container (async — show a "provisioning" state)
4. Once healthy, redirect to `username.yajigo.com`
5. Tenant sets their schedule and config from their admin panel

### Search / Directory
1. Visitor searches by username or name on the `yajigo.com` homepage
2. Control plane queries SQLite and returns matches
3. Results link to `username.yajigo.com` for each tenant

### Accessing a Tenant's Page
1. Browser requests `jrbranaa.yajigo.com`
2. Traefik matches the `Host(jrbranaa.yajigo.com)` rule and forwards to `yajigo-jrbranaa` container
3. Container serves the schedule page as normal

---

## Upgrade Path

Since all tenants run the same image, upgrades are:
1. Build and push a new `yajigo:latest`
2. Control plane pulls and restarts each tenant container (rolling — one at a time)
3. Data volumes are untouched throughout

---

## Open Questions

- **Always-on vs on-demand containers:** Should containers always run, or spin up on first request and sleep after inactivity? Always-on is simpler; on-demand saves resources at scale but adds latency and complexity.
- **Username constraints:** Only alphanumeric + hyphens is safest. A reserved username list is needed to protect control plane routes (`www`, `api`, `admin`, `app`, etc.).
- **Custom domains:** Future consideration. Tenant CNAMEs their own domain; Traefik needs a domain verification flow.
- **Resource limits:** Docker supports CPU and memory limits per container. Define a cap per tenant to prevent noisy neighbors.
- **Container image strategy:** Build versioned images and push to a registry vs. source-mount from disk. Built image is more reliable for production.
- **Account self-service:** Can tenants delete their account and export their data? Define the data export/deletion story before building.
- **Deprovision trigger:** Explicit deletion request, inactivity timeout, or manual action?

---

## Implementation Phases

### Phase 1 — Infrastructure
Set up Traefik with wildcard subdomain routing and Let's Encrypt for `*.yajigo.com`. Manually spin up a test container to verify the routing and SSL flow end-to-end.

### Phase 2 — Control plane scaffold
Basic Express app with SQLite, registration form, and a static homepage with search. No Docker integration yet — manually create test containers to verify routing.

### Phase 3 — Docker integration
Control plane can programmatically create, start, stop, and remove Yajigo containers using `dockerode`, with correct labels and named volumes. Test the full registration → container → Traefik → working subdomain flow.

### Phase 4 — Directory and search
Build out the search endpoint and public directory page. Decide on privacy controls (opt-out of directory listing?).

### Phase 5 — Hardening
Reserved username list, rate limiting on registration, resource limits per container, health checks, logging, upgrade tooling.

---

## Current State

- Core app is container-ready as-is
- `data/` directory needs to be on a named volume (currently written inside the container)
- No control plane exists yet
- Auto-deploy via GitHub webhook is implemented (see AUTO_DEPLOY.md)
