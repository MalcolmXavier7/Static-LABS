<div align="center">

# Static LABS

### An always-on control plane for local development.

**Build. Deploy. Monitor.** One dashboard to run every project on your machine — assign ports, launch and health-check services across any stack, promote a demo to a permanent local deployment, and command your Docker containers, without ever touching a terminal.

[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![Express](https://img.shields.io/badge/Express-4-000000?logo=express&logoColor=white)](https://expressjs.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-F5C800.svg)](LICENSE)

</div>

---

## The problem

Anyone running more than a handful of local projects hits the same wall: which port was that on, is it even running, why won't it start, and what's still holding `:3000` hostage. The answer is usually a graveyard of terminal tabs and a mental map that falls apart the moment you step away.

**Static LABS replaces that with a single source of truth.** It discovers your projects, assigns and tracks ports, launches them the right way for their stack, verifies they're actually serving, and shows the real state of every service at a glance — plus a one-click path to promote any of them from "demo" to a permanent, self-healing local deployment.

---

## What it does

| Capability | Detail |
| --- | --- |
| **Auto-discovery** | Scans configured directories, detects the tech stack per project, generates a clean name, and assigns a port from a managed pool. |
| **Framework-aware launch** | Knows how to actually serve each stack — Vite, Next.js, Flask, static sites, Go, Rust — passing the assigned port correctly instead of a one-size-fits-all guess. |
| **Verified starts** | Waits for the port to genuinely answer before declaring success or opening the browser. Failures surface the real reason and a log tail, not a dead tab. |
| **True status** | Live TCP scanning of every assigned port — a service reads as "running" only when it's actually responding, regardless of what the registry believes. |
| **Health monitoring** | Scheduled health checks with response-time tracking and per-project sparklines; healthy / slow / unhealthy / stalled states. |
| **One-click Go-Live** | Builds a project's production bundle, serves it on its port, and keeps it alive — auto-restart on crash (with a crash-loop brake) and auto-relaunch after reboot. |
| **Docker harbor** | Lists, starts, and stops your containers in plain English — no Docker CLI required. Maps container ports to the right web UI automatically. |
| **Resilient by design** | Persists PIDs so the manager re-adopts running processes across its own restarts; single-instance guard prevents port fights at boot. |
| **Always on** | The manager serves the built dashboard from a single URL and boots with the OS — the lab is simply *there*. |

Plus the quality-of-life layer: `⌘K` project search, a dark "Batcave" theme, a slide-in panel with live logs / quick scripts / per-project notes, uptime and response-time badges, and live thumbnails of running apps.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Dashboard (React 18 + Vite + TanStack Query)                │
│  Served as static assets from the port-manager — one URL     │
└───────────────────────────────┬─────────────────────────────┘
                                 │  REST · 38 endpoints
┌───────────────────────────────▼─────────────────────────────┐
│  Port Manager (Node + Express + TypeScript)                  │
│                                                              │
│   Port pool   Process supervisor   Health scheduler          │
│   Live TCP scanner   Manifest sync   Docker bridge           │
└───────────────────────────────┬─────────────────────────────┘
                                 │
        ┌────────────────────────┼────────────────────────┐
        ▼                        ▼                         ▼
   SQLite registry      Managed child processes      Docker engine
   (projects, ports,    (dev servers + live          (containers via
    health history)      deployments, keep-alive)     docker CLI bridge)
```

**Backend** — a single supervisory service (~1,850 LOC of TypeScript) owning the port pool, a process supervisor with keep-alive and crash-loop protection, a cron-driven health scheduler, a live port scanner as the source of truth, manifest read/write for per-project config, and a thin bridge to the Docker engine. State persists to SQLite (`sql.js`).

**Frontend** — a React SPA with server-state managed by TanStack Query and a themeable design system. Ships as a production build the backend serves directly, so the entire lab runs as one process on one port.

**Contract** — every project carries a `static.project.json` manifest (name, stack, ports, scripts, notes), making the file system the source of truth and keeping the registry reproducible.

---

## Engineering highlights

- **Correctness over optimism.** A service is "up" only when its port answers a real TCP probe — the UI never lies because the database is stale.
- **Self-healing deployments.** Go-Live processes are supervised: crashes trigger a throttled relaunch, a 3-strike brake stops crash loops, and boot re-adoption brings everything back after a restart.
- **Graceful failure.** Docker-off, missing dependencies, hardcoded ports, and name collisions each produce a specific, actionable message instead of a silent dead end.
- **Zero-terminal operation.** First-run `npm install`, framework detection, browser orchestration, and container control are all handled for you.
- **Single-process footprint.** Dashboard + API + supervisor collapse into one always-on service — no orchestration overhead for a personal lab.

---

## Quick start

```bash
# Backend — the whole lab
cd Static_LABS/port-manager
npm install
npm run dev            # http://localhost:3001  (serves the dashboard too)

# Dashboard — only needed for UI development
cd ../dashboard
npm install
npm run build          # production build the backend serves
npm run dev            # or hot-reload dev server on :5173
```

Open **http://localhost:3001**, run a scan, and the neighborhood populates itself.

---

## Tech stack

**Backend** · Node.js · Express · TypeScript · SQLite (sql.js) · node-cron · pino
**Frontend** · React 18 · Vite · TanStack Query · TailwindCSS
**Integrations** · Docker CLI bridge · OS process supervision · Windows autostart

---

## Roadmap

Name-based routing (`project.localhost` → assigned port via reverse proxy) · WebSocket/SSE live updates · on-disk log retention · remote access via Tailscale · one-click Netlify/Vercel deploy.

---

<div align="center">

## About the builder

**Malcolm Xavier** — Head of Ops & Technology · systems builder · engineer

I build the internal tooling and operational infrastructure that lets teams move fast without losing the plot. Static LABS is a working example of how I think: find the friction people have quietly accepted, then engineer it out of existence — end to end, from the supervisor process to the pixel.

I care about correctness, resilience, and interfaces that tell the truth. I design the system, write the code, and own the outcome.

[**GitHub** ›](https://github.com/MalcolmXavier7) &nbsp;·&nbsp; Open to conversations about ops, platform, and internal tooling leadership.

</div>

---

<div align="center">
<sub>MIT Licensed · Built local, built fast.</sub>
</div>
