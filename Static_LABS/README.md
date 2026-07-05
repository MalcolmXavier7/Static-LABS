# Static LABS - Port Management & Health Dashboard

**Build. Manage. Monitor.** A comprehensive local development port assignment, health monitoring, and project management system for multi-stack development environments.

---

## 🎯 What Is Static LABS?

Static LABS solves the problem of managing multiple local development services across different tech stacks. Instead of juggling ports manually, Static LABS provides:

✅ **Centralized Port Assignment** — Automatically assign or manually override ports for each project  
✅ **Health Monitoring** — Continuous health checks with hot/cold/stalled status indicators  
✅ **Visual Dashboard** — Drag-and-drop interface to manage, monitor, and launch projects  
✅ **API Integration** — Full REST API for Claude Code automation and custom workflows  
✅ **Mixed Tech Stack Support** — Works with Node.js, Python, Go, and anything else  

---

## 🏗️ Architecture

### Backend: Port Manager Service
- **Node.js + Express** — Lightweight HTTP API
- **SQLite** — Persistent project & port registry
- **Health Check Scheduler** — Automated monitoring every 30 seconds (configurable)
- **REST API** — Full CRUD for projects, ports, health, and dashboard data

### Frontend: Dashboard
- **React 18** — Modern UI framework
- **Vite** — Blazing-fast dev environment
- **TailwindCSS** — Utility-first styling
- **TanStack Query** — Server state management with auto-sync
- **dnd-kit** — Accessible drag-and-drop for future enhancements

### Integration Layer
- Claude Code scripts can automate port assignment via API
- Manual override capabilities for edge cases
- Webhooks and event streaming (planned)

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- npm or yarn

### 1. Port Manager (Backend)
```bash
cd port-manager
npm install
npm run dev
```

Port Manager API available at: **http://localhost:3001**

### 2. Dashboard (Frontend)
```bash
cd dashboard
npm install
npm run dev
```

Dashboard available at: **http://localhost:5173**

### 3. Create Your First Project
Navigate to the dashboard and register a project, or use the API:

```bash
curl -X POST http://localhost:3001/api/projects \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-awesome-app",
    "techStack": "node",
    "healthCheckUrl": "http://localhost:3100/health"
  }'
```

---

## 📊 Key Features

### 1. **Port Pool Management**
- Configurable port ranges (default: 3100-3199)
- Automatic assignment of next available port
- Manual override with preferred port selection
- Release ports to free them up for reuse

### 2. **Health Monitoring**
- Active health checks every 30 seconds (configurable)
- Response time tracking
- Status indicators: `healthy` | `slow` | `unhealthy` | `stalled`
- Historical health logs for debugging and trending

### 3. **Visual Dashboard**
- Project list with status at a glance
- Summary cards: Total, Running, Unhealthy, Stalled
- Quick-launch buttons to open services in browser
- Drag icons to desktop (planned)
- Color-coded status indicators

### 4. **REST API**
Complete API for:
- **Projects**: Create, read, update, delete
- **Ports**: Assign, release, check availability
- **Health**: Run checks, view history, get status
- **Dashboard**: Get complete overview

Full spec: `specs/PORT_MANAGER_SPEC.json`

---

## 📁 File Structure

```
Static_LABS/
├── port-manager/
│   ├── src/
│   │   └── index.ts           # Main server with all endpoints
│   ├── package.json
│   ├── tsconfig.json
│   └── .env.example
│
├── dashboard/
│   ├── src/
│   │   ├── App.tsx            # Main React app
│   │   └── components/
│   │       ├── StatusSummary.tsx
│   │       ├── ProjectGrid.tsx
│   │       └── AssignPortModal.tsx
│   ├── package.json
│   ├── vite.config.ts
│   └── tailwind.config.js
│
├── specs/
│   └── PORT_MANAGER_SPEC.json # Full API & database schema
│
├── docs/
│   ├── TECH_STACK.md          # Technology choices & rationale
│   ├── SETUP.md               # Detailed setup guide
│   └── TECH_STACK.md
│
└── README.md (this file)
```

---

## 🔧 Configuration

### Port Manager Environment Variables

```env
PORT_MANAGER_PORT=3001              # Manager API port
PORT_POOL_MIN=3100                  # Min port in pool
PORT_POOL_MAX=3199                  # Max port in pool
HEALTH_CHECK_INTERVAL="*/30 * * * * *"  # Cron: every 30 seconds
DB_PATH=./data/static-labs.db       # Database file location
```

### Dashboard Environment Variables

```env
REACT_APP_API_BASE=http://localhost:3001  # Port Manager API URL
```

---

## 📚 API Examples

### List All Projects
```bash
curl http://localhost:3001/api/projects
```

### Create a Project
```bash
curl -X POST http://localhost:3001/api/projects \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-project",
    "techStack": "node",
    "healthCheckUrl": "http://localhost:3100/health"
  }'
```

### Assign a Port
```bash
curl -X POST http://localhost:3001/api/ports/assign \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "proj_abc123xyz",
    "preferredPort": null  # null = auto-assign next available
  }'
```

### Get Dashboard Data
```bash
curl http://localhost:3001/api/dashboard
```

### Run Health Checks
```bash
curl -X POST http://localhost:3001/api/health/check-all
```

---

## 💻 Health Check Integration

Each project needs a `/health` endpoint that returns 200 OK:

### Node.js / Express
```javascript
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
```

### Python / Flask
```python
@app.route('/health')
def health():
    return {'status': 'ok', 'timestamp': datetime.now().isoformat()}
```

### Go / Gin
```go
router.GET("/health", func(c *gin.Context) {
    c.JSON(200, gin.H{"status": "ok"})
})
```

---

## 🤖 Claude Code Integration

Automate port management with Claude Code:

```javascript
// Register project and assign port
const result = await fetch('http://localhost:3001/api/ports/assign', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    projectId: 'proj_xyz',
    preferredPort: null  // Auto-assign
  })
});

const { data } = await result.json();
console.log(`Project assigned to port: ${data.assignedPort}`);
```

---

## 🛠️ Development

### Modify Port Manager
1. Edit `port-manager/src/index.ts`
2. The service auto-reloads in dev mode
3. Test with curl or the dashboard

### Modify Dashboard
1. Edit components in `dashboard/src/components/`
2. Vite provides hot module replacement
3. Changes appear instantly in browser

### Add New Endpoints
1. Follow the pattern in `index.ts`
2. Update `PORT_MANAGER_SPEC.json` with new API details
3. Update dashboard components to consume new endpoints

---

## 📖 Documentation

- **SETUP.md** — Detailed installation and configuration
- **TECH_STACK.md** — Technology choices and architecture rationale
- **PORT_MANAGER_SPEC.json** — Complete API reference with request/response examples

---

## 🚧 Planned Features

See [ROADMAP.md](ROADMAP.md) for the prioritized feature roadmap — the best next additions.

- [ ] WebSocket support for real-time health updates
- [ ] Project grouping and filtering
- [ ] Advanced metrics (memory, CPU, uptime)
- [ ] Database backups and snapshots
- [ ] Docker Compose for containerized dev
- [ ] Import/export project configurations
- [ ] Custom health check thresholds
- [ ] Slack/Discord notifications
- [ ] GraphQL API option

---

## 🐛 Troubleshooting

**Port Already in Use?**
```bash
lsof -i :3001  # Find the process
kill -9 <PID>  # Kill it
```

**Health Checks Not Running?**
- Verify `HEALTH_CHECK_INTERVAL` is valid cron syntax
- Check project's health endpoint is accessible
- Run manual check: `curl -X POST http://localhost:3001/api/health/check-all`

**Dashboard Can't Connect?**
- Verify `REACT_APP_API_BASE` matches Port Manager URL
- Check CORS is enabled (it is by default)
- Open browser DevTools (F12) for network errors

---

## 📄 License

MIT

---

## 🙌 Built with

- Express.js
- React
- TailwindCSS
- SQLite
- TypeScript
- Vite

---

**Static LABS** — Build. Move. Connect. 🚀

For detailed setup instructions, see [SETUP.md](docs/SETUP.md)
