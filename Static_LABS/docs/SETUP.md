# Static LABS Setup Guide

## Prerequisites

- **Node.js** 18+ (https://nodejs.org/)
- **npm** or **yarn**
- **Git** (for version control)

## Project Structure

```
Static_LABS/
├── port-manager/          # Backend service
├── dashboard/             # React frontend
├── specs/                 # API & database specifications
└── docs/                  # Documentation
```

---

## Port Manager Setup

### 1. Navigate to port-manager directory

```bash
cd port-manager
```

### 2. Install dependencies

```bash
npm install
```

### 3. Create `.env` file

```bash
cp .env.example .env
```

Configure environment variables:

```env
# Port Manager Configuration
PORT_MANAGER_PORT=3001
PORT_POOL_MIN=3100
PORT_POOL_MAX=3199

# Health Check Configuration
HEALTH_CHECK_INTERVAL="*/30 * * * * *"  # Every 30 seconds (cron format)

# Database
DB_PATH=./data/static-labs.db
```

### 4. Create data directory

```bash
mkdir -p data
```

### 5. Build (if using TypeScript)

```bash
npm run build
```

### 6. Start the service

**Development mode (with auto-reload):**
```bash
npm run dev
```

**Production mode:**
```bash
npm start
```

The Port Manager will start on `http://localhost:3001`

---

## Dashboard Setup

### 1. Navigate to dashboard directory

```bash
cd dashboard
```

### 2. Install dependencies

```bash
npm install
```

### 3. Create `.env.local` file

```env
REACT_APP_API_BASE=http://localhost:3001
```

### 4. Start development server

```bash
npm run dev
```

The dashboard will typically run on `http://localhost:5173`

### 5. Build for production

```bash
npm run build
```

---

## Quick Start (Both Services)

From the root `Static_LABS` directory:

### Terminal 1 - Port Manager

```bash
cd port-manager
npm install
npm run dev
```

### Terminal 2 - Dashboard

```bash
cd dashboard
npm install
npm run dev
```

Both services are now running:
- **Port Manager API**: http://localhost:3001
- **Dashboard**: http://localhost:5173

---

## First Steps After Setup

### 1. Create a Project

Use the dashboard or API to register your first project:

```bash
curl -X POST http://localhost:3001/api/projects \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-first-app",
    "techStack": "node",
    "iconUrl": "/icons/my-app.png",
    "healthCheckUrl": "http://localhost:3100/health"
  }'
```

### 2. Assign a Port

```bash
curl -X POST http://localhost:3001/api/ports/assign \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "proj_YOUR_PROJECT_ID",
    "preferredPort": null
  }'
```

### 3. View Dashboard

Open http://localhost:5173 to see your projects and manage ports visually.

---

## Health Check Integration

For each project you manage, expose a `/health` endpoint:

```javascript
// Node.js/Express example
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
```

The port manager will poll this endpoint every 30 seconds (configurable) to monitor project health.

---

## Configuration Deep Dive

### Port Manager Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT_MANAGER_PORT` | 3001 | Port where the manager API listens |
| `PORT_POOL_MIN` | 3100 | Minimum port in assignment pool |
| `PORT_POOL_MAX` | 3199 | Maximum port in assignment pool |
| `HEALTH_CHECK_INTERVAL` | `*/30 * * * * *` | Cron expression for health check frequency |
| `DB_PATH` | `./data/static-labs.db` | Path to SQLite database file |

### Cron Expression Format (Health Checks)

```
┌───────────── second (0 - 59)
│ ┌───────────── minute (0 - 59)
│ │ ┌───────────── hour (0 - 23)
│ │ │ ┌───────────── day of month (1 - 31)
│ │ │ │ ┌───────────── month (0 - 11)
│ │ │ │ │ ┌───────────── day of week (0 - 6)
│ │ │ │ │ │
│ │ │ │ │ │
* * * * * *
```

Examples:
- `*/30 * * * * *` — Every 30 seconds
- `0 * * * * *` — Every minute
- `0 */5 * * * *` — Every 5 minutes
- `0 0 * * * *` — Every hour

---

## Troubleshooting

### Port Already in Use

If port 3001 is already in use:

```bash
# Find process using port 3001
lsof -i :3001

# Kill the process
kill -9 <PID>
```

Or use a different port:
```bash
PORT_MANAGER_PORT=3002 npm run dev
```

### Health Checks Not Running

1. Verify `HEALTH_CHECK_INTERVAL` is valid cron syntax
2. Check that project's `healthCheckUrl` is correct
3. Monitor logs for errors
4. Manually trigger health check:
   ```bash
   curl -X POST http://localhost:3001/api/health/check-all
   ```

### Dashboard Not Connecting

1. Verify `REACT_APP_API_BASE` matches port manager URL
2. Check CORS is enabled (it is by default)
3. Open browser DevTools (F12) → Console for network errors

### Database Issues

If database is corrupted, delete it and restart:

```bash
rm data/static-labs.db
npm run dev
```

---

## API Documentation

Full API specs are in `specs/PORT_MANAGER_SPEC.json`

Common endpoints:

- `GET /api/projects` — List all projects
- `POST /api/projects` — Create new project
- `POST /api/ports/assign` — Assign port to project
- `POST /api/health/check-all` — Run health checks on all projects
- `GET /api/dashboard` — Get dashboard data (projects + summary)

---

## Claude Code Integration

Once both services are running, Claude Code can automate port management:

```javascript
// Example: Register and assign port to a new project
const registerProject = async (name, techStack) => {
  const createRes = await fetch('http://localhost:3001/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      techStack,
      healthCheckUrl: `http://localhost:${PORT}/health`,
    }),
  });
  const { data } = await createRes.json();

  const assignRes = await fetch('http://localhost:3001/api/ports/assign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId: data.id }),
  });
  
  return assignRes.json();
};
```

---

## Next Steps

1. **Customize Dashboard** — Add your brand colors, logo, and styling
2. **Add More Health Checks** — Integrate memory/CPU monitoring
3. **Database Backups** — Set up automated SQLite backups
4. **Docker** — Containerize both services for local dev
5. **CI/CD Integration** — Deploy and manage ports in production pipelines

---

## Support & Questions

Check the specs and documentation files for detailed architecture and API details.

Happy port managing! 🚀
