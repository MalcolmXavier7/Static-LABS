# Static LABS - Port Manager Tech Stack

## Overview
Static LABS is a comprehensive local development port management system with health monitoring, manual override capabilities, and a visual dashboard for multi-stack project coordination.

---

## Backend: Port Manager Service

### Runtime & Framework
- **Node.js** v18+ (LTS recommended)
- **Express.js** v4.18+ — lightweight HTTP server
- **TypeScript** — type safety and better IDE support

### Database & Storage
- **SQLite** (via `better-sqlite3` or `sqlite3`) — lightweight, file-based persistence
  - Alternative: JSON file storage for ultra-lightweight setup
- **Drizzle ORM** — type-safe database queries

### Health Monitoring
- **node-fetch** — HTTP client for health checks
- **node-cron** — scheduled health check polling

### Utilities
- **dotenv** — environment configuration
- **nanoid** — unique ID generation for projects
- **pino** — logging

### Development
- **tsx** or **ts-node** — run TypeScript directly
- **nodemon** — auto-restart on file changes
- **jest** — unit testing

---

## Frontend: Dashboard

### UI Framework
- **React** 18+
- **Next.js** 14+ (optional, adds routing/SSR if needed)
- **TypeScript**

### Styling & Components
- **TailwindCSS** v3+ — utility-first styling
- **Headless UI** or **Radix UI** — unstyled accessible components
- **Lucide React** — icon library

### State Management & API
- **TanStack Query** (react-query) — server state management
- **Axios** or native `fetch` — HTTP client

### Drag & Drop
- **dnd-kit** or **react-beautiful-dnd** — drag-and-drop functionality
- **zustand** — lightweight client state for drag state

### Development
- **Vite** — blazing fast dev server
- **ESLint** + **Prettier** — code quality

---

## Shared / DevOps

### Environment & Configuration
- **.env.local** files per service
- Docker (optional for containerized local dev)

### Version Control & Deployment
- Git (obviously)
- GitHub Actions for CI/CD (optional)

### Claude Code Integration
- Port Manager API exposed at `http://localhost:[MANAGER_PORT]`
- Claude Code scripts can query and manage ports via REST calls

---

## Architecture Summary

```
Static LABS
├── Port Manager Service (Node.js + Express + SQLite)
│   ├── REST API (/api/projects, /api/health, /api/assign, etc.)
│   ├── Health Check Scheduler (polls all projects periodically)
│   └── Database (projects, ports, status history)
│
├── Dashboard (React + Vite + TailwindCSS)
│   ├── Project List View (with drag icons)
│   ├── Health Status Indicators (hot/cold/stalled)
│   ├── Port Assignment UI (manual override)
│   └── Quick Launch Buttons
│
└── Claude Code Integration Layer
    └── Scripts can hit Port Manager API for automation
```

---

## Port Manager API Ports
- **Port Manager itself**: 3001 (configurable)
- **Managed projects**: 3100-3199 (configurable pool)
- **Dashboard**: 5173 or 5174 (Vite default)

---

## File Structure
```
Static_LABS/
├── port-manager/
│   ├── src/
│   │   ├── index.ts
│   │   ├── api/
│   │   ├── health/
│   │   ├── database/
│   │   └── types.ts
│   ├── package.json
│   ├── tsconfig.json
│   └── .env.example
│
├── dashboard/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/
│   │   ├── pages/
│   │   └── api/
│   ├── package.json
│   ├── vite.config.ts
│   └── tailwind.config.js
│
├── specs/
│   ├── PORT_MANAGER_SPEC.json
│   ├── API_SCHEMA.md
│   └── DATABASE_SCHEMA.json
│
├── docs/
│   ├── TECH_STACK.md (this file)
│   ├── SETUP.md
│   └── API_DOCUMENTATION.md
│
└── README.md
```

---

## Why These Choices?

1. **Node.js + Express** — Fast setup, excellent npm ecosystem, perfect for services
2. **TypeScript** — Catches errors early, better for team collaboration
3. **SQLite** — Zero setup, file-based, scales well for local dev use
4. **React + Vite** — Modern, fast, great DX
5. **TailwindCSS** — Rapid UI development, consistent styling
6. **dnd-kit** — Lightweight, accessible drag-and-drop
7. **TanStack Query** — Handles caching, refetching, sync automatically

---

## Next Steps
1. Review and tweak this stack with your team
2. Bootstrap each service from starter templates
3. Define exact API contracts in PORT_MANAGER_SPEC.json
4. Hand off to Claude Code for implementation
