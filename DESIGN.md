# Static LABS — Design Document

> Local dev port management and health monitoring dashboard.  
> Built for Malcolm Xavior Seven.

---

## Vision

Static LABS is the command center for your local development environment. Every project you build lives here — named, tracked, port-assigned, and health-monitored. One dashboard to see everything running on your machine.

---

## Core Design Principles

**1. Zero friction registration**  
Drop a folder path and the system figures the rest out. Stack detection, port assignment, manifest creation — all automatic.

**2. Always-on visibility**  
The dashboard auto-refreshes every 10 seconds. Health checks run every 30 seconds in the background. You never have to wonder if something is up.

**3. Manifest-first identity**  
Every project carries a `static.project.json` in its root folder. That file is the source of truth — name, stack, assigned port, scripts, status. The database is a reflection of the manifest, not the other way around.

**4. Skill-native**  
Static LABS is built to live inside Claude Code. The `/static-lab` skill lets you register any project mid-session without leaving your editor.

---

## System Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Static LABS                        │
│                                                     │
│  ┌──────────────┐         ┌───────────────────────┐ │
│  │   Dashboard  │ ──────► │   port-manager API    │ │
│  │  React + Vite│ :5173   │   Express + sql.js    │ │
│  │  TanStack Q  │ ◄────── │   :3001               │ │
│  └──────────────┘         └───────────────────────┘ │
│                                    │                │
│                           ┌────────▼────────┐       │
│                           │  static-labs.db │       │
│                           │  (sql.js WASM)  │       │
│                           └─────────────────┘       │
│                                    │                │
│                    ┌───────────────┴──────────────┐ │
│                    │         File System           │ │
│                    │  C:\Users\malco\Documents\*   │ │
│                    │  C:\Users\malco\.claude\skills│ │
│                    │  static.project.json (each)   │ │
│                    └──────────────────────────────-┘ │
└─────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Backend | Node.js + Express + TypeScript | Fast, familiar, great ecosystem |
| Database | sql.js (WASM SQLite) | Zero native compilation — works on ARM64 Windows without build tools |
| Frontend | React 18 + Vite + Tailwind CSS | Fast HMR, dark-first utility styling |
| State | TanStack Query | Auto-refresh, background refetch, no boilerplate |
| Scheduling | node-cron | Lightweight, zero-config cron in process |
| Icons | FAL.ai FLUX Pro (PNG) + dynamic SVG fallback | AI-generated 3D clay icons per project |

---

## Database Schema

### `projects`
| Column | Type | Notes |
|---|---|---|
| id | TEXT | nanoid |
| name | TEXT | kebab-case slug |
| techStack | TEXT | node / python / golang / rust / dotnet / java / static / other |
| assignedPort | INTEGER | null until assigned |
| folderPath | TEXT | absolute path on disk |
| openUrl | TEXT | overrides the Open button URL |
| healthCheckUrl | TEXT | URL polled for health |
| iconUrl | TEXT | served from /icons/*.png |
| status | TEXT | running / unhealthy / slow / idle |
| lastHeartbeat | TEXT | ISO timestamp |

### `healthHistory`
Stores last N health check results per project for trend tracking.

### `portPool`
Tracks which ports are reserved vs. available in the assigned range.

### `scanSources`
Directories that the auto-scanner watches. Seeded on startup with Documents and .claude/skills.

---

## Auto-Discovery

The scanner runs on boot and every 5 minutes via cron:

1. Reads all `scanSources` directories
2. Lists immediate subdirectories
3. For each dir: reads `static.project.json` if present, otherwise detects stack from file signatures (`package.json` → node, `requirements.txt` → python, `go.mod` → golang, etc.)
4. Skips dirs already registered by folder path
5. Creates a DB record + assigns a port + writes a `static.project.json` to the folder

Skills under `.claude/skills` are discovered the same way and flagged as `type: skill`.

---

## Manifest Format — `static.project.json`

Every project folder registered with Static LABS gets this file:

```json
{
  "static": { "version": "1.0.0" },
  "project": {
    "name": "my-project",
    "displayName": "My Project",
    "description": "",
    "author": "Malcolm Xavior Seven",
    "version": "0.1.0",
    "created": "<ISO>",
    "updated": "<ISO>"
  },
  "stack": {
    "type": "node",
    "framework": "vite",
    "language": "typescript",
    "runtime": "node"
  },
  "port": {
    "assigned": 3050,
    "preferred": null,
    "openUrl": null,
    "healthCheckUrl": null
  },
  "status": {
    "current": "idle",
    "lastHealthCheck": null,
    "lastDeploy": null
  },
  "scripts": {
    "dev": "npm run dev",
    "build": "npm run build",
    "start": "npm start",
    "test": "npm test"
  },
  "tags": [],
  "notes": ""
}
```

---

## Icon System

Icons are loaded in priority order:

```
1. iconUrl in DB → /icons/<name>.png  (FAL.ai FLUX Pro 3D clay render)
2. Fallback       → /icons/<name>.svg  (dynamic, generated from tech stack color)
```

The PNG icons are generated offline via `generate_logos.js` using the FAL.ai FLUX Pro API, then copied into `port-manager/public/icons/` via `copy_icons.js`. URLs are batch-updated via `update_icons_http.js`.

---

## Dashboard UI

### Top Toolbar
```
[ ⚡ Static LABS ]  [ X / Y ports ]  [ N skills ]  |  [+ Add]  |  [▶ Run All]  [■ Stop All]  |  [◎ Scan]  [↻ Health]
```

- **+ Add** — paste a folder path to register instantly
- **Run All** — assigns ports to all unassigned projects + runs health check
- **Stop All** — releases all port assignments
- **Scan** — triggers manual auto-discovery scan, shows banner with results
- **Health** — runs health checks on all projects right now

### Project Cards
Each card shows:
- 3D clay icon (PNG or SVG fallback)
- Project name + tech stack badge
- Assigned port (mono, blue)
- Folder path (truncated)
- Status badge (running / idle / unhealthy)
- Last health check timestamp
- Actions: **Open** · **Start & Open** · **Stop** · **Edit** · **Assign Port** · **Delete**

The **Open** button respects `openUrl` — if a project's dev server lives on a different port than its assigned Static LABS port, it opens the right one.

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/dashboard` | All projects + summary stats |
| GET | `/api/projects` | List all projects |
| POST | `/api/projects` | Create project |
| PATCH | `/api/projects/:id` | Update project fields |
| DELETE | `/api/projects/:id` | Remove project |
| POST | `/api/projects/:id/open` | Start dev server + open browser |
| POST | `/api/projects/:id/stop` | Stop dev server |
| POST | `/api/projects/register-folder` | Register by folder path |
| POST | `/api/projects/sync-manifests` | Write manifests to all project folders |
| GET | `/api/projects/:id/manifest` | Read project manifest |
| POST | `/api/ports/assign` | Assign port to project |
| POST | `/api/ports/assign-all` | Assign ports to all |
| POST | `/api/ports/release-all` | Release all ports |
| POST | `/api/health/check-all` | Run health checks now |
| POST | `/api/scan` | Trigger auto-discovery |
| GET | `/api/scan/sources` | List scan directories |
| POST | `/api/scan/sources` | Add scan directory |
| GET | `/icons/:name.svg` | Dynamic SVG icon |
| GET | `/icons/:name.png` | Static PNG icon |

---

## Claude Code Skill — `/static-lab`

Installed at `C:\Users\malco\.claude\skills\static-lab\SKILL.md`.

Trigger phrases:
- "add to static"
- "register project"
- "add to lab"
- "static lab"
- "give this a port"
- "put this in the dashboard"

When triggered, the skill:
1. Detects the current project's tech stack
2. Kebab-cases the folder name as the project slug
3. Calls `POST /api/projects/register-folder` on the Static LABS API
4. Confirms the name, stack, and assigned port back in chat

---

## Port Range

Static LABS assigns ports from `3050` upward by default, incrementing per project. The range avoids common dev server defaults (3000, 5173, 8080, etc.).

---

## Notes

<!-- Add your notes here -->

---

*Static LABS — built local, built fast.*
