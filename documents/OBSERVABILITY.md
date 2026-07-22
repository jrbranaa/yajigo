# Observability

Monitoring strategy for the Yajigo multi-tenant infrastructure. Covers container health, host metrics, per-tenant HTTP metrics, and log aggregation.

---

## Layers of Observability

| Layer | What it covers | Tool |
|---|---|---|
| Container health | Is each container running and responding? | Docker HEALTHCHECK + cAdvisor |
| Host metrics | CPU, memory, disk on the host machine | Node Exporter |
| HTTP metrics | Request rates, error rates, latency per tenant | Traefik built-in + Prometheus |
| App metrics | Uptime, custom counters per container | `/health` endpoint + Prometheus |
| Logs | Centralized logs across all containers | Loki + Promtail |
| Uptime / alerting | At-a-glance status, alerts on downtime | Uptime Kuma |
| Dashboards | Visualization of all of the above | Grafana |

---

## Core App Changes

### Health endpoint
Add to `server.js`:
```javascript
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});
```

Used by Docker health checks, the control plane, and monitoring tools. No auth required — it returns no sensitive data.

### Dockerfile HEALTHCHECK
```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1
```

Docker marks a container `unhealthy` after 3 failed checks. The control plane and Traefik can both act on this status.

---

## Infrastructure Stack

### Prometheus
Scrapes metrics from:
- **cAdvisor** — container CPU, memory, network, disk I/O per container
- **Node Exporter** — host-level system metrics
- **Traefik** — per-router request counts, error rates, latency (built-in, just needs enabling)

Add to Traefik config:
```yaml
metrics:
  prometheus: {}
```

### cAdvisor
Runs as a single container on the host. Automatically discovers all running containers and exposes their resource metrics. No per-tenant configuration needed.

```yaml
services:
  cadvisor:
    image: gcr.io/cadvisor/cadvisor
    volumes:
      - /:/rootfs:ro
      - /var/run:/var/run:ro
      - /sys:/sys:ro
      - /var/lib/docker/:/var/lib/docker:ro
```

### Grafana
Connects to Prometheus and Loki as data sources. Useful pre-built dashboards:
- **cAdvisor + Docker** — per-container resource usage
- **Traefik** — HTTP metrics per tenant
- **Node Exporter** — host health

Per-tenant views are achievable by filtering on the container label (`container_name=~"yajigo-.*"`).

### Loki + Promtail
Centralized log aggregation. Promtail runs as an agent on the host, tails Docker container logs, and ships them to Loki. Grafana queries Loki alongside metrics.

Promtail config to scrape all Yajigo containers:
```yaml
scrape_configs:
  - job_name: yajigo
    docker_sd_configs:
      - host: unix:///var/run/docker.sock
        filters:
          - name: name
            values: ["yajigo-*"]
    relabel_configs:
      - source_labels: [__meta_docker_container_name]
        target_label: container
```

### Uptime Kuma
Lightweight uptime monitor. Pings each tenant's `/health` endpoint on a schedule and sends alerts (email, Slack, Discord, etc.) on downtime. Good for:
- At-a-glance status page
- Alerting when a container goes unhealthy
- Public status page for tenants

The control plane can register/deregister monitors via the Uptime Kuma API when tenants are provisioned/deprovisioned.

---

## Control Plane Integration

The control plane should:
- Check `container.State.Health.Status` via the Docker SDK when listing tenants
- Surface `healthy / unhealthy / starting` status in the operator admin panel
- Optionally restart containers that are in `unhealthy` state (auto-healing)

```javascript
// dockerode example
const container = docker.getContainer('yajigo-jrbranaa');
const info = await container.inspect();
const health = info.State.Health.Status; // 'healthy' | 'unhealthy' | 'starting'
```

---

## What You Get Per Tenant (for Free)

Once Traefik's Prometheus metrics are enabled, you get per-tenant HTTP observability with no app changes:
- Request rate (`traefik_router_requests_total` filtered by router name)
- Error rate (4xx/5xx breakdown)
- Response latency (p50, p95, p99)

Each tenant's router name maps to their subdomain, so filtering is straightforward.

---

## Implementation Order

1. Add `/health` endpoint and `HEALTHCHECK` to Dockerfile (core app — do now)
2. Add Traefik Prometheus metrics (infrastructure — do when setting up Traefik)
3. Deploy Prometheus + cAdvisor + Node Exporter (infrastructure)
4. Deploy Grafana with pre-built dashboards
5. Deploy Loki + Promtail for log aggregation
6. Deploy Uptime Kuma and wire it to the control plane provisioning flow
7. Add health status to the control plane operator panel

---

## Current State

- No observability infrastructure exists yet
- `/health` endpoint and Dockerfile HEALTHCHECK are not yet implemented
- Planned alongside the control plane build (see MULTITENANCY.md)
