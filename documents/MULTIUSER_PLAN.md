# Yaji — Multi-User Architecture Plan

## Overview

Transform Yaji from a single-user tool into a multi-tenant platform where each user gets a fully isolated instance. A top-level manager app handles user registration, search, and container lifecycle. Traffic is routed by Traefik based on username path prefix.

---

## URL Structure

```
donatermater.com/             → Manager app (registration, search, directory)
donatermater.com/jrbranaa     → jrbranaa's Yaji instance
donatermater.com/jrbranaa/admin    → jrbranaa's admin panel
donatermater.com/jrbranaa/widget   → jrbranaa's embeddable widget
```

---

## Components

### 1. Manager App (new)

A new Node.js app that becomes the front door for the platform. Responsibilities:

- **User registration** — create an account (username, email, password)
- **User directory / search** — find users by username or email
- **Container lifecycle** — spin up a Yaji container when a user registers, tear it down on account deletion
- **Platform admin panel** — operator-level view of all users and container states

Stack suggestion: Node.js + Express + SQLite (keeps the no-external-database philosophy, just one level up).

### 2. Yaji changes — BASE_PATH support

Yaji currently assumes it lives at the root of a domain. When serving at `/jrbranaa`, every redirect and internal link breaks because `res.redirect('/schedule')` sends the browser to `donatermater.com/schedule` instead of `donatermater.com/jrbranaa/schedule`.

Yaji needs a `BASE_PATH` environment variable (e.g. `BASE_PATH=/jrbranaa`) that:

- Prepends the base path to all `res.redirect()` calls
- Prepends it to any absolute URLs embedded in rendered HTML
- Is exposed to the frontend so JavaScript-side navigation works correctly

Traefik's `StripPrefix` middleware handles removing the prefix before the request reaches the container, so Yaji's route handlers (`/schedule`, `/admin`, etc.) don't need to change — only outbound links and redirects do.

### 3. Docker orchestration

The manager app needs access to the Docker socket (`/var/run/docker.sock`) so it can programmatically create and destroy containers.

When a user registers, the manager:

1. Pulls / reuses the Yaji image
2. Creates a named container: `yaji-{username}`
3. Attaches it to the `web` network so Traefik discovers it
4. Sets Traefik labels for routing (see below)
5. Creates a named volume for user data: `yaji-data-{username}`
6. Sets environment variables: `BASE_PATH=/{username}`, user-specific `ADMIN_PASSWORD`, `API_KEY`, optional VAPID keys

On account deletion, the manager stops and removes the container and optionally the volume.

**Two approaches for container management:**

| Approach | Pros | Cons |
|---|---|---|
| Docker SDK directly (e.g. `dockerode` npm package) | Fine-grained control, no subprocess | More code |
| Shell out to `docker run` / `docker rm` | Simple, familiar | Harder to handle errors cleanly |

Docker SDK is recommended for production reliability.

### 4. Traefik routing

Each user container gets labels that tell Traefik to match on both the host and the username path prefix:

```
Host(`donatermater.com`) && PathPrefix(`/jrbranaa`)
```

Combined with a `StripPrefix` middleware that removes `/{username}` before forwarding to the container. Traefik auto-discovers containers on the `web` network, so no config file changes are needed when new users are added.

Router priority matters here: Traefik resolves more specific rules first, so `/jrbranaa` will win over the manager app's catch-all `Host()` rule. The manager app's router needs a lower priority explicitly set, or the user routers need a higher one.

---

## Data Model (Manager App)

```json
{
  "id": "uuid",
  "username": "jrbranaa",
  "email": "user@example.com",
  "passwordHash": "bcrypt hash",
  "containerName": "yaji-jrbranaa",
  "containerStatus": "running | stopped | provisioning",
  "createdAt": "ISO timestamp"
}
```

Stored in SQLite. One table: `users`.

---

## User Flows

### Registration
1. User visits `donatermater.com` and fills out a form (username, email, password)
2. Manager validates: username is alphanumeric, not taken, email not taken
3. Manager creates the container (async — show a "provisioning" state)
4. Once the container is healthy, redirect the user to `donatermater.com/{username}`
5. User sets their schedule from their admin panel at `/{username}/admin`

### Search / Discovery
1. Visitor types a username or email into the search box on the manager app homepage
2. Manager queries SQLite and returns matching users
3. Results link to `donatermater.com/{username}` for each match

### Accessing a User's Page
1. Browser requests `donatermater.com/jrbranaa`
2. Traefik matches the `PathPrefix(/jrbranaa)` rule, strips the prefix, forwards to the `yaji-jrbranaa` container
3. Container serves the schedule page as normal

---

## Open Questions / Decisions to Make

1. **Always-on vs on-demand containers** — should containers always run, or spin up on first request and sleep after inactivity? Always-on is simpler; on-demand saves resources at scale but adds latency and complexity.

2. **Username constraints** — what characters are allowed? Only alphanumeric + hyphens/underscores is safest to avoid path collisions with manager app routes (`/login`, `/register`, `/search`, etc.). Reserved usernames list needed.

3. **Per-user admin password** — set at registration and stored as a Yaji env var on the container. If a user wants to change it, the manager app must recreate the container (or you add a password-change API to Yaji).

4. **VAPID keys** — generate once per user at registration time, or let users opt in later. Generating at registration is simplest.

5. **Custom domains** — future consideration. A user might want `jrbranaa.com` to point to their instance. Traefik supports this but the manager app would need a domain verification flow.

6. **Resource limits** — Docker supports CPU and memory limits per container. Define a reasonable cap per user to prevent one instance starving others.

7. **Container image strategy** — build a versioned Yaji Docker image and push it to a registry, or mount source from disk. A built image is more reliable; source-mount means updates are instant but couples all users to the same code version simultaneously.

8. **Account self-service** — can users delete their own account and reclaim their data? Define the data export / deletion story before building.

---

## Rough Implementation Phases

### Phase 1 — Yaji BASE_PATH support
Update Yaji to accept and respect a `BASE_PATH` env var. Verify a single instance works correctly when served at a sub-path via Traefik `StripPrefix`.

### Phase 2 — Manager App scaffold
Basic Express app with SQLite, registration form, login, and a static homepage with search. No Docker integration yet — manually create test containers to verify routing.

### Phase 3 — Docker integration
Manager app can programmatically create, start, stop, and remove Yaji containers with correct labels and volumes. Test the full registration → container → Traefik → working URL flow.

### Phase 4 — Search and directory
Build out the search endpoint and a public directory page. Decide on privacy controls (opt-out of directory listing?).

### Phase 5 — Hardening
Reserved username list, rate limiting on registration, resource limits on containers, health checks, logging.
