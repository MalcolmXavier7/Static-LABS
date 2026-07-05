import express from 'express';
import { spawn, ChildProcess, exec } from 'child_process';
import cors from 'cors';
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import pino from 'pino';
import { nanoid } from 'nanoid';
import cron from 'node-cron';
import fs from 'fs';
import net from 'net';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const logger = pino();

const runningProcesses = new Map<string, { process: ChildProcess | null; pid: number | null; logs: string[]; startedAt: number }>();
const stopRequested = new Set<string>();          // ids stopped on purpose — don't keep-alive these
const rapidRestarts = new Map<string, number>();  // crash-loop guard per project
const scriptRuns = new Map<string, { script: string; logs: string[]; running: boolean; exitCode: number | null; startedAt: number }>();
const MAX_LOG_LINES = 200;

const PORT_MANAGER_PORT = parseInt(process.env.PORT_MANAGER_PORT || '3001', 10);
const PORT_POOL_MIN = parseInt(process.env.PORT_POOL_MIN || '3100', 10);
const PORT_POOL_MAX = parseInt(process.env.PORT_POOL_MAX || '3199', 10);
const HEALTH_CHECK_INTERVAL = process.env.HEALTH_CHECK_INTERVAL || '*/30 * * * * *';

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'static-labs.db');
let db: SqlJsDatabase;

function saveDb() {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
}

function initializeDatabase() {
  db.run(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      assignedPort INTEGER UNIQUE,
      techStack TEXT,
      iconUrl TEXT,
      folderPath TEXT,
      openUrl TEXT,
      status TEXT DEFAULT 'unassigned',
      lastHeartbeat DATETIME,
      healthCheckUrl TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS healthHistory (
      id TEXT PRIMARY KEY,
      projectId TEXT NOT NULL,
      status TEXT,
      responseTime INTEGER,
      error TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (projectId) REFERENCES projects(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS portPool (
      port INTEGER PRIMARY KEY,
      isAvailable INTEGER DEFAULT 1,
      assignedToProjectId TEXT,
      FOREIGN KEY (assignedToProjectId) REFERENCES projects(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS scanSources (
      id TEXT PRIMARY KEY,
      directory TEXT UNIQUE NOT NULL,
      type TEXT NOT NULL DEFAULT 'project',
      label TEXT,
      enabled INTEGER DEFAULT 1,
      lastScan DATETIME,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Columns added after v1 — ALTER fails harmlessly if they already exist
  for (const col of [
    "autoStart INTEGER DEFAULT 0",
    "deployMode TEXT DEFAULT 'dev'",
    'procPid INTEGER',
    'procStartedAt TEXT',
    'procCommand TEXT',
  ]) {
    try { db.run(`ALTER TABLE projects ADD COLUMN ${col}`); } catch {}
  }

  // Seed default scan sources
  const sourceCount = db.exec('SELECT COUNT(*) FROM scanSources');
  if ((sourceCount[0]?.values[0]?.[0] as number || 0) === 0) {
    runSql('INSERT INTO scanSources (id, directory, type, label) VALUES (?, ?, ?, ?)',
      [`src_${nanoid(8)}`, 'C:\\Users\\malco\\Documents', 'project', 'Documents']);
    runSql('INSERT INTO scanSources (id, directory, type, label) VALUES (?, ?, ?, ?)',
      [`src_${nanoid(8)}`, 'C:\\Users\\malco\\.claude\\skills', 'skill', 'Claude Skills']);
    logger.info('Default scan sources seeded');
  }

  const countResult = db.exec('SELECT COUNT(*) as count FROM portPool');
  const portCount = countResult[0]?.values[0]?.[0] as number || 0;
  if (portCount === 0) {
    const stmt = db.prepare('INSERT INTO portPool (port, isAvailable) VALUES (?, 1)');
    for (let port = PORT_POOL_MIN; port <= PORT_POOL_MAX; port++) {
      stmt.run([port]);
    }
    stmt.free();
    saveDb();
    logger.info(`Port pool initialized: ${PORT_POOL_MIN}-${PORT_POOL_MAX}`);
  }
}

function queryAll(sql: string, params: any[] = []): any[] {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const results: any[] = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function queryOne(sql: string, params: any[] = []): any | null {
  const results = queryAll(sql, params);
  return results[0] || null;
}

function runSql(sql: string, params: any[] = []) {
  db.run(sql, params);
  saveDb();
}

app.use(cors());
app.use(express.json());

// Static file serving — serves PNG icons from public/icons/
app.use('/icons', express.static(path.join(__dirname, '..', 'public', 'icons')));

// Dynamic SVG icon generation
const STACK_ICONS: Record<string, { emoji: string; bg: string; fg: string }> = {
  node:    { emoji: 'JS', bg: '#16a34a', fg: '#ffffff' },
  python:  { emoji: 'PY', bg: '#eab308', fg: '#1e1e1e' },
  golang:  { emoji: 'GO', bg: '#06b6d4', fg: '#ffffff' },
  rust:    { emoji: 'RS', bg: '#ea580c', fg: '#ffffff' },
  dotnet:  { emoji: '.N', bg: '#7c3aed', fg: '#ffffff' },
  java:    { emoji: 'JV', bg: '#dc2626', fg: '#ffffff' },
  mixed:   { emoji: 'MX', bg: '#6366f1', fg: '#ffffff' },
  static:  { emoji: 'ST', bg: '#64748b', fg: '#ffffff' },
  elixir:  { emoji: 'EX', bg: '#7c3aed', fg: '#ffffff' },
  ruby:    { emoji: 'RB', bg: '#dc2626', fg: '#ffffff' },
  other:   { emoji: '?',  bg: '#475569', fg: '#ffffff' },
};

app.get('/icons/:name.svg', (req, res) => {
  const projectName = req.params.name;
  const project = queryOne('SELECT techStack, name FROM projects WHERE name = ?', [projectName]);
  const stack = project?.techStack || 'other';
  const icon = STACK_ICONS[stack] || STACK_ICONS['other'];
  const initials = projectName
    .split('-')
    .slice(0, 2)
    .map((w: string) => w.charAt(0).toUpperCase())
    .join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" width="80" height="80">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${icon.bg};stop-opacity:1"/>
      <stop offset="100%" style="stop-color:${icon.bg};stop-opacity:0.7"/>
    </linearGradient>
  </defs>
  <rect width="80" height="80" rx="16" fill="url(#bg)"/>
  <text x="40" y="32" text-anchor="middle" fill="${icon.fg}" font-family="system-ui,sans-serif" font-size="11" font-weight="700" opacity="0.7">${icon.emoji}</text>
  <text x="40" y="56" text-anchor="middle" fill="${icon.fg}" font-family="system-ui,sans-serif" font-size="22" font-weight="800">${initials}</text>
</svg>`;

  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(svg);
});
app.use('/icons', express.static(path.join(__dirname, '..', 'public', 'icons')));

// ====================
// PROJECTS ENDPOINTS
// ====================

app.get('/api/projects', (_req, res) => {
  try {
    const projects = queryAll('SELECT * FROM projects');
    res.json({ success: true, data: projects });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ success: false, error: 'Failed to fetch projects' });
  }
});

app.get('/api/projects/:projectId', (req, res) => {
  try {
    const project = queryOne('SELECT * FROM projects WHERE id = ?', [req.params.projectId]);
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    res.json({ success: true, data: project });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ success: false, error: 'Failed to fetch project' });
  }
});

app.post('/api/projects', (req, res) => {
  try {
    const { name, techStack, iconUrl, healthCheckUrl, folderPath, openUrl } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, error: 'Project name is required' });
    }

    const projectId = `proj_${nanoid(10)}`;
    const now = new Date().toISOString();

    runSql(
      'INSERT INTO projects (id, name, techStack, iconUrl, folderPath, openUrl, healthCheckUrl, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [projectId, name, techStack || '', iconUrl || '', folderPath || '', openUrl || '', healthCheckUrl || '', now, now]
    );

    res.status(201).json({
      success: true,
      data: {
        id: projectId,
        name,
        assignedPort: null,
        status: 'unassigned',
      },
    });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ success: false, error: 'Failed to create project' });
  }
});

app.patch('/api/projects/:projectId', (req, res) => {
  try {
    const { name, techStack, iconUrl, healthCheckUrl, folderPath, openUrl } = req.body;
    const now = new Date().toISOString();

    const updates: string[] = [];
    const values: any[] = [];

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name);
    }
    if (techStack !== undefined) {
      updates.push('techStack = ?');
      values.push(techStack);
    }
    if (iconUrl !== undefined) {
      updates.push('iconUrl = ?');
      values.push(iconUrl);
    }
    if (healthCheckUrl !== undefined) {
      updates.push('healthCheckUrl = ?');
      values.push(healthCheckUrl);
    }
    if (folderPath !== undefined) {
      updates.push('folderPath = ?');
      values.push(folderPath);
    }
    if (openUrl !== undefined) {
      updates.push('openUrl = ?');
      values.push(openUrl);
    }

    updates.push('updatedAt = ?');
    values.push(now);
    values.push(req.params.projectId);

    runSql(`UPDATE projects SET ${updates.join(', ')} WHERE id = ?`, values);

    res.json({ success: true, data: {} });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ success: false, error: 'Failed to update project' });
  }
});

app.delete('/api/projects/:projectId', (req, res) => {
  try {
    const project = queryOne('SELECT * FROM projects WHERE id = ?', [req.params.projectId]);
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    if (project.assignedPort) {
      runSql('UPDATE portPool SET isAvailable = 1, assignedToProjectId = NULL WHERE port = ?', [project.assignedPort]);
    }

    runSql('DELETE FROM projects WHERE id = ?', [req.params.projectId]);
    res.status(204).send();
  } catch (error) {
    logger.error(error);
    res.status(500).json({ success: false, error: 'Failed to delete project' });
  }
});

// ====================
// PORTS ENDPOINTS
// ====================

app.post('/api/ports/assign', (req, res) => {
  try {
    const { projectId, preferredPort } = req.body;
    if (!projectId) {
      return res.status(400).json({ success: false, error: 'projectId is required' });
    }

    const project = queryOne('SELECT * FROM projects WHERE id = ?', [projectId]);
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    let assignedPort = preferredPort;

    if (preferredPort) {
      const port = queryOne('SELECT * FROM portPool WHERE port = ?', [preferredPort]);
      if (!port || !port.isAvailable) {
        return res.status(400).json({ success: false, error: 'Preferred port is not available' });
      }
    } else {
      const nextAvailable = queryOne('SELECT port FROM portPool WHERE isAvailable = 1 LIMIT 1');
      if (!nextAvailable) {
        return res.status(500).json({ success: false, error: 'No available ports' });
      }
      assignedPort = nextAvailable.port;
    }

    runSql('UPDATE portPool SET isAvailable = 0, assignedToProjectId = ? WHERE port = ?', [projectId, assignedPort]);
    runSql('UPDATE projects SET assignedPort = ?, status = ?, updatedAt = ? WHERE id = ?', [assignedPort, 'idle', new Date().toISOString(), projectId]);

    res.json({
      success: true,
      data: {
        projectId,
        assignedPort,
        message: 'Port assigned successfully',
      },
    });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ success: false, error: 'Failed to assign port' });
  }
});

app.get('/api/ports/next-available', (_req, res) => {
  try {
    const result = queryOne('SELECT port FROM portPool WHERE isAvailable = 1 LIMIT 1');
    if (!result) {
      return res.status(500).json({ success: false, error: 'No available ports' });
    }
    res.json({ success: true, data: { nextAvailablePort: result.port } });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ success: false, error: 'Failed to get next available port' });
  }
});

app.post('/api/ports/release/:port', (req, res) => {
  try {
    const port = parseInt(req.params.port, 10);
    const portInfo = queryOne('SELECT * FROM portPool WHERE port = ?', [port]);

    if (!portInfo) {
      return res.status(404).json({ success: false, error: 'Port not found' });
    }

    const projectId = portInfo.assignedToProjectId;
    runSql('UPDATE portPool SET isAvailable = 1, assignedToProjectId = NULL WHERE port = ?', [port]);
    if (projectId) {
      runSql('UPDATE projects SET assignedPort = NULL, status = ?, updatedAt = ? WHERE id = ?', ['unassigned', new Date().toISOString(), projectId]);
    }

    res.json({
      success: true,
      data: { port, releasedFrom: projectId },
    });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ success: false, error: 'Failed to release port' });
  }
});

app.get('/api/ports/:port', (req, res) => {
  try {
    const port = parseInt(req.params.port, 10);
    const portInfo = queryOne('SELECT * FROM portPool WHERE port = ?', [port]);

    if (!portInfo) {
      return res.status(404).json({ success: false, error: 'Port not found' });
    }

    let projectName = null;
    if (portInfo.assignedToProjectId) {
      const proj = queryOne('SELECT name FROM projects WHERE id = ?', [portInfo.assignedToProjectId]);
      projectName = proj?.name;
    }

    res.json({
      success: true,
      data: {
        port,
        isAvailable: portInfo.isAvailable,
        assignedToProjectId: portInfo.assignedToProjectId,
        assignedToProjectName: projectName,
      },
    });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ success: false, error: 'Failed to get port status' });
  }
});

// ====================
// BULK OPERATIONS
// ====================

app.post('/api/ports/assign-all', (_req, res) => {
  try {
    const unassigned = queryAll('SELECT * FROM projects WHERE assignedPort IS NULL');
    const results: any[] = [];
    let assigned = 0;
    let failed = 0;

    for (const project of unassigned) {
      const nextPort = queryOne('SELECT port FROM portPool WHERE isAvailable = 1 LIMIT 1');
      if (!nextPort) {
        results.push({ name: project.name, error: 'No ports available' });
        failed++;
        continue;
      }
      runSql('UPDATE portPool SET isAvailable = 0, assignedToProjectId = ? WHERE port = ?', [project.id, nextPort.port]);
      runSql('UPDATE projects SET assignedPort = ?, status = ?, updatedAt = ? WHERE id = ?', [nextPort.port, 'idle', new Date().toISOString(), project.id]);
      results.push({ name: project.name, port: nextPort.port });
      assigned++;
    }

    res.json({
      success: true,
      data: { assigned, failed, alreadyAssigned: queryAll('SELECT * FROM projects WHERE assignedPort IS NOT NULL').length - assigned, results },
    });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ success: false, error: 'Failed to assign all ports' });
  }
});

app.post('/api/ports/release-all', (_req, res) => {
  try {
    const assigned = queryAll('SELECT * FROM projects WHERE assignedPort IS NOT NULL');
    let released = 0;

    for (const project of assigned) {
      runSql('UPDATE portPool SET isAvailable = 1, assignedToProjectId = NULL WHERE port = ?', [project.assignedPort]);
      runSql('UPDATE projects SET assignedPort = NULL, status = ?, updatedAt = ? WHERE id = ?', ['unassigned', new Date().toISOString(), project.id]);
      released++;
    }

    res.json({
      success: true,
      data: { released, message: `${released} ports released` },
    });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ success: false, error: 'Failed to release all ports' });
  }
});

// ====================
// HEALTH CHECK ENDPOINTS
// ====================

interface HealthCheckResult {
  projectId: string;
  status: string;
  responseTime: number;
  isHealthy: boolean;
}

async function performHealthCheck(project: any): Promise<HealthCheckResult> {
  const startTime = Date.now();
  let status = 'healthy';
  let error = null;
  let responseTime = 0;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(project.healthCheckUrl, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    responseTime = Date.now() - startTime;

    if (!response.ok) {
      status = 'unhealthy';
      error = `HTTP ${response.status}`;
    } else if (responseTime > 3000) {
      status = 'slow';
    }
  } catch (err: any) {
    status = 'unhealthy';
    error = err.message || 'Request failed';
    responseTime = Date.now() - startTime;
  }

  const historyId = `hist_${nanoid(10)}`;
  runSql(
    'INSERT INTO healthHistory (id, projectId, status, responseTime, error) VALUES (?, ?, ?, ?, ?)',
    [historyId, project.id, status, responseTime, error]
  );

  runSql('UPDATE projects SET lastHeartbeat = ?, status = ?, updatedAt = ? WHERE id = ?', [
    new Date().toISOString(),
    status === 'healthy' ? 'running' : status,
    new Date().toISOString(),
    project.id,
  ]);

  return {
    projectId: project.id,
    status,
    responseTime,
    isHealthy: status === 'healthy',
  };
}

app.post('/api/health/check-all', async (_req, res) => {
  try {
    const projects = queryAll('SELECT * FROM projects WHERE assignedPort IS NOT NULL');
    const results: HealthCheckResult[] = [];
    let healthy = 0;
    let unhealthy = 0;

    for (const project of projects) {
      if (!project.healthCheckUrl) continue;

      const result = await performHealthCheck(project);
      results.push(result);

      if (result.status === 'healthy') {
        healthy++;
      } else {
        unhealthy++;
      }
    }

    res.json({
      success: true,
      data: { checked: projects.length, healthy, unhealthy, results },
    });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ success: false, error: 'Failed to check health' });
  }
});

app.post('/api/health/check/:projectId', async (req, res) => {
  try {
    const project = queryOne('SELECT * FROM projects WHERE id = ?', [req.params.projectId]);
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const result = await performHealthCheck(project);
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ success: false, error: 'Failed to check project health' });
  }
});

app.get('/api/health/history/:projectId', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
    const hours = parseInt(req.query.hours as string) || null;

    let query = 'SELECT * FROM healthHistory WHERE projectId = ?';
    const params: any[] = [req.params.projectId];

    if (hours) {
      query += ` AND timestamp > datetime('now', '-${hours} hours')`;
    }

    query += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(limit);

    const history = queryAll(query, params);
    res.json({ success: true, data: history });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ success: false, error: 'Failed to fetch health history' });
  }
});

// ====================
// STATIC PROJECT MANIFEST
// ====================

const MANIFEST_FILE = 'static.project.json';

function readManifest(folderPath: string): any | null {
  const manifestPath = path.join(folderPath, MANIFEST_FILE);
  if (!fs.existsSync(manifestPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  } catch { return null; }
}

function writeManifest(folderPath: string, data: any) {
  const manifestPath = path.join(folderPath, MANIFEST_FILE);
  fs.writeFileSync(manifestPath, JSON.stringify(data, null, 2), 'utf-8');
}

function createManifest(folderPath: string, projectName: string, techStack: string, assignedPort: number | null) {
  const now = new Date().toISOString();
  const displayName = projectName.split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  let framework = '';
  if (techStack === 'node') {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(folderPath, 'package.json'), 'utf-8'));
      if (pkg.dependencies?.next) framework = 'nextjs';
      else if (pkg.dependencies?.express) framework = 'express';
      else if (pkg.devDependencies?.vite || pkg.devDependencies?.['@vitejs/plugin-react']) framework = 'vite';
    } catch {}
  }

  const manifest = {
    static: { version: '1.0.0' },
    project: {
      name: projectName,
      displayName,
      description: '',
      author: 'Malcolm Xavior Seven',
      version: '0.1.0',
      created: now,
      updated: now,
    },
    stack: {
      type: techStack,
      framework,
      language: techStack === 'node' ? 'javascript' : techStack === 'python' ? 'python' : techStack,
      runtime: techStack === 'node' ? 'node' : techStack,
    },
    port: {
      assigned: assignedPort,
      preferred: null,
      openUrl: null,
      healthCheckUrl: null,
    },
    status: {
      current: assignedPort ? 'idle' : 'unassigned',
      lastHealthCheck: null,
      lastDeploy: null,
    },
    scripts: {
      dev: techStack === 'node' ? 'npm run dev' : techStack === 'python' ? 'python -m flask run' : null,
      build: techStack === 'node' ? 'npm run build' : null,
      start: techStack === 'node' ? 'npm start' : null,
      test: null,
    },
    tags: [],
    notes: '',
  };

  writeManifest(folderPath, manifest);
  return manifest;
}

function updateManifest(folderPath: string, updates: Record<string, any>) {
  const manifest = readManifest(folderPath);
  if (!manifest) return;

  if (updates.assignedPort !== undefined) manifest.port.assigned = updates.assignedPort;
  if (updates.status !== undefined) manifest.status.current = updates.status;
  if (updates.healthCheckUrl !== undefined) manifest.port.healthCheckUrl = updates.healthCheckUrl;
  if (updates.openUrl !== undefined) manifest.port.openUrl = updates.openUrl;
  if (updates.lastHealthCheck !== undefined) manifest.status.lastHealthCheck = updates.lastHealthCheck;
  manifest.project.updated = new Date().toISOString();

  writeManifest(folderPath, manifest);
}

// Register a project by folder path
app.post('/api/projects/register-folder', (req, res) => {
  try {
    const { folderPath, preferredName } = req.body;
    if (!folderPath) {
      return res.status(400).json({ success: false, error: 'folderPath is required' });
    }

    if (!fs.existsSync(folderPath)) {
      return res.status(400).json({ success: false, error: 'Folder does not exist' });
    }

    const existingByPath = queryOne('SELECT * FROM projects WHERE folderPath = ?', [folderPath]);
    if (existingByPath) {
      return res.status(400).json({ success: false, error: `Already registered as "${existingByPath.name}"` });
    }

    // Read existing manifest or detect
    let manifest = readManifest(folderPath);
    const folderName = path.basename(folderPath);
    const projectName = preferredName || manifest?.project?.name || toKebabCase(folderName);

    const existingByName = queryOne('SELECT * FROM projects WHERE name = ?', [projectName]);
    if (existingByName) {
      return res.status(400).json({ success: false, error: `Name "${projectName}" already taken` });
    }

    const techStack = manifest?.stack?.type || detectTechStack(folderPath);

    // Assign a port
    const nextPort = queryOne('SELECT port FROM portPool WHERE isAvailable = 1 LIMIT 1');
    const assignedPort = nextPort?.port || null;

    // Register in DB
    const projectId = `proj_${nanoid(10)}`;
    const now = new Date().toISOString();
    const iconUrl = `http://localhost:${PORT_MANAGER_PORT}/icons/${projectName}.svg`;
    const healthCheckUrl = manifest?.port?.healthCheckUrl || '';
    const openUrl = manifest?.port?.openUrl || '';

    runSql(
      'INSERT INTO projects (id, name, techStack, iconUrl, folderPath, openUrl, healthCheckUrl, createdAt, updatedAt, assignedPort, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [projectId, projectName, techStack, iconUrl, folderPath, openUrl, healthCheckUrl, now, now, assignedPort, assignedPort ? 'idle' : 'unassigned']
    );

    if (assignedPort) {
      runSql('UPDATE portPool SET isAvailable = 0, assignedToProjectId = ? WHERE port = ?', [projectId, assignedPort]);
    }

    // Create or update manifest in the folder
    if (!manifest) {
      manifest = createManifest(folderPath, projectName, techStack, assignedPort);
    } else {
      manifest.port.assigned = assignedPort;
      manifest.status.current = assignedPort ? 'idle' : 'unassigned';
      manifest.project.updated = now;
      writeManifest(folderPath, manifest);
    }

    logger.info(`Registered folder: ${projectName} => :${assignedPort}`);

    res.status(201).json({
      success: true,
      data: {
        id: projectId,
        name: projectName,
        techStack,
        assignedPort,
        folderPath,
        manifest,
      },
    });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ success: false, error: 'Failed to register folder' });
  }
});

// Get a project's manifest
app.get('/api/projects/:projectId/manifest', (req, res) => {
  try {
    const project = queryOne('SELECT * FROM projects WHERE id = ?', [req.params.projectId]);
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });
    if (!project.folderPath) return res.status(400).json({ success: false, error: 'No folder path set' });

    const manifest = readManifest(project.folderPath);
    res.json({ success: true, data: { manifest, hasManifest: !!manifest, folderPath: project.folderPath } });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ success: false, error: 'Failed to read manifest' });
  }
});

// Sync all manifests (write current DB state to all project folders)
app.post('/api/projects/sync-manifests', (_req, res) => {
  try {
    const projects = queryAll('SELECT * FROM projects WHERE folderPath IS NOT NULL AND folderPath != ""');
    let created = 0;
    let updated = 0;
    let errors = 0;

    for (const project of projects) {
      if (!fs.existsSync(project.folderPath)) { errors++; continue; }

      const existing = readManifest(project.folderPath);
      if (existing) {
        updateManifest(project.folderPath, {
          assignedPort: project.assignedPort,
          status: project.status,
          healthCheckUrl: project.healthCheckUrl,
          openUrl: project.openUrl,
          lastHealthCheck: project.lastHeartbeat,
        });
        updated++;
      } else {
        createManifest(project.folderPath, project.name, project.techStack, project.assignedPort);
        created++;
      }
    }

    res.json({ success: true, data: { created, updated, errors, total: projects.length } });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ success: false, error: 'Failed to sync manifests' });
  }
});

// ====================
// AUTO-DISCOVERY SCANNER
// ====================

const TECH_DETECT: { file: string; stack: string }[] = [
  { file: 'package.json', stack: 'node' },
  { file: 'requirements.txt', stack: 'python' },
  { file: 'Pipfile', stack: 'python' },
  { file: 'pyproject.toml', stack: 'python' },
  { file: 'go.mod', stack: 'golang' },
  { file: 'Cargo.toml', stack: 'rust' },
  { file: 'pom.xml', stack: 'java' },
  { file: 'build.gradle', stack: 'java' },
  { file: 'mix.exs', stack: 'elixir' },
  { file: 'Gemfile', stack: 'ruby' },
];

function detectTechStack(dirPath: string): string {
  const found: string[] = [];
  for (const indicator of TECH_DETECT) {
    if (fs.existsSync(path.join(dirPath, indicator.file))) {
      found.push(indicator.stack);
    }
  }
  if (found.length > 1) return 'mixed';
  if (found.length === 1) return found[0];
  if (fs.existsSync(path.join(dirPath, 'index.html'))) return 'static';
  return 'other';
}

function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-zA-Z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function isProjectDir(dirPath: string): boolean {
  const skip = ['node_modules', '.git', 'dist', 'build', '__pycache__', '.next', 'WindowsPowerShell', 'Rainmeter', 'Zoom', 'Colors', 'New folder', 'New folder (2)'];
  const dirName = path.basename(dirPath);
  if (skip.includes(dirName)) return false;
  const indicators = [...TECH_DETECT.map(t => t.file), 'index.html', 'SKILL.md', 'README.md', '.git'];
  return indicators.some(f => fs.existsSync(path.join(dirPath, f)));
}

function isSkillDir(dirPath: string): boolean {
  return fs.existsSync(path.join(dirPath, 'SKILL.md'));
}

interface ScanResult {
  scanned: number;
  added: string[];
  skipped: string[];
  existing: string[];
  errors: string[];
}

function runScan(): ScanResult {
  const sources = queryAll('SELECT * FROM scanSources WHERE enabled = 1');
  const result: ScanResult = { scanned: 0, added: [], skipped: [], existing: [], errors: [] };

  for (const source of sources) {
    if (!fs.existsSync(source.directory)) {
      result.errors.push(`Directory not found: ${source.directory}`);
      continue;
    }

    let entries: string[];
    try {
      entries = fs.readdirSync(source.directory);
    } catch (err: any) {
      result.errors.push(`Cannot read ${source.directory}: ${err.message}`);
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(source.directory, entry);
      let stat;
      try { stat = fs.statSync(fullPath); } catch { continue; }
      if (!stat.isDirectory()) continue;

      result.scanned++;

      if (source.type === 'skill') {
        if (!isSkillDir(fullPath)) { result.skipped.push(entry); continue; }
      } else {
        if (!isProjectDir(fullPath)) { result.skipped.push(entry); continue; }
      }

      const projectName = toKebabCase(entry);
      const existing = queryOne('SELECT id FROM projects WHERE name = ? OR folderPath = ?', [projectName, fullPath]);
      if (existing) {
        result.existing.push(projectName);
        continue;
      }

      const manifest = readManifest(fullPath);
      const techStack = manifest?.stack?.type || (source.type === 'skill' ? 'other' : detectTechStack(fullPath));
      const projectId = `proj_${nanoid(10)}`;
      const now = new Date().toISOString();
      const iconUrl = `http://localhost:${PORT_MANAGER_PORT}/icons/${projectName}.svg`;
      const healthCheckUrl = manifest?.port?.healthCheckUrl || '';
      const openUrl = manifest?.port?.openUrl || '';
      const description = manifest?.project?.description || '';

      try {
        // Auto-assign a port immediately on discovery
        const nextPort = queryOne('SELECT port FROM portPool WHERE isAvailable = 1 LIMIT 1');
        const autoPort = nextPort?.port || null;

        runSql(
          'INSERT INTO projects (id, name, techStack, iconUrl, folderPath, openUrl, healthCheckUrl, createdAt, updatedAt, assignedPort, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [projectId, projectName, techStack, iconUrl, fullPath, openUrl, healthCheckUrl, now, now, autoPort, autoPort ? 'idle' : 'unassigned']
        );

        if (autoPort) {
          runSql('UPDATE portPool SET isAvailable = 0, assignedToProjectId = ? WHERE port = ?', [projectId, autoPort]);
        }

        // Write port into manifest
        if (autoPort) {
          if (!manifest) {
            createManifest(fullPath, projectName, techStack, autoPort);
          } else {
            manifest.port.assigned = autoPort;
            manifest.project.updated = now;
            writeManifest(fullPath, manifest);
          }
        }

        result.added.push(projectName);
      } catch (err: any) {
        result.errors.push(`Failed to register ${projectName}: ${err.message}`);
      }
    }

    runSql('UPDATE scanSources SET lastScan = ? WHERE id = ?', [new Date().toISOString(), source.id]);
  }

  return result;
}

// Scan endpoints
app.get('/api/scan/sources', (_req, res) => {
  try {
    const sources = queryAll('SELECT * FROM scanSources');
    res.json({ success: true, data: sources });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ success: false, error: 'Failed to fetch scan sources' });
  }
});

app.post('/api/scan/sources', (req, res) => {
  try {
    const { directory, type, label } = req.body;
    if (!directory) return res.status(400).json({ success: false, error: 'directory is required' });

    const id = `src_${nanoid(8)}`;
    runSql('INSERT INTO scanSources (id, directory, type, label) VALUES (?, ?, ?, ?)',
      [id, directory, type || 'project', label || path.basename(directory)]);

    res.status(201).json({ success: true, data: { id, directory, type: type || 'project', label } });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ success: false, error: 'Failed to add scan source' });
  }
});

app.post('/api/scan', (_req, res) => {
  try {
    const result = runScan();
    logger.info(`Scan complete: ${result.added.length} added, ${result.existing.length} existing, ${result.scanned} scanned`);
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ success: false, error: 'Failed to run scan' });
  }
});

// ====================
// PROCESS MANAGEMENT
// ====================

// Figure out how to actually serve this folder on the assigned port.
// Returns null when there is genuinely nothing to start (docs folder, skill, etc.)
// — better to say so than to blindly run `npm start` and watch it die.
function detectDevCommand(folderPath: string, port: number): string | null {
  const manifest = readManifest(folderPath);
  if (manifest?.scripts?.dev) return manifest.scripts.dev;

  const pkgPath = path.join(folderPath, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      // Frameworks that ignore the PORT env var need the port passed explicitly
      if (deps.next) return `npx next dev -p ${port}`;
      if (deps.vite) return `npx vite --port ${port} --strictPort --host`;
      if (pkg.scripts?.dev) return 'npm run dev';
      if (pkg.scripts?.start) return 'npm start';
    } catch {}
  }

  if (fs.existsSync(path.join(folderPath, 'requirements.txt')) || fs.existsSync(path.join(folderPath, 'Pipfile'))) {
    return `python -m flask run --port ${port}`;
  }
  if (fs.existsSync(path.join(folderPath, 'go.mod'))) return 'go run .';
  if (fs.existsSync(path.join(folderPath, 'Cargo.toml'))) return 'cargo run';

  // Plain static site — spin up a file server for it
  if (fs.existsSync(path.join(folderPath, 'index.html'))) {
    return `npx --yes http-server -p ${port} -c-1`;
  }

  return null;
}

function canStartProject(folderPath: string): boolean {
  if (!folderPath || !fs.existsSync(folderPath)) return false;
  const manifest = readManifest(folderPath);
  if (manifest?.scripts?.dev) return true;
  return ['package.json', 'requirements.txt', 'Pipfile', 'go.mod', 'Cargo.toml', 'index.html']
    .some(f => fs.existsSync(path.join(folderPath, f)));
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

interface LaunchResult {
  ok: boolean;
  verified: boolean;        // true = something is actually listening on the assigned port
  command?: string;
  error?: string;
  logTail?: string[];
}

const LAUNCH_VERIFY_TIMEOUT_MS = 20000;

function pidAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function killPid(pid: number) {
  if (process.platform === 'win32') {
    exec(`taskkill /pid ${pid} /T /F`, (err) => {
      if (err) logger.warn(`taskkill failed for pid ${pid}: ${err.message}`);
    });
  } else {
    try { process.kill(pid, 'SIGTERM'); } catch {}
  }
}

// Core spawn: registers the process, persists the PID so the manager can
// re-adopt it after a restart, and keep-alives projects deployed live.
function spawnManaged(project: any, commandLine: string): { child: ChildProcess; logs: string[] } {
  const child = spawn(commandLine, [], {
    cwd: project.folderPath,
    env: { ...process.env, PORT: String(project.assignedPort) },
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const logs: string[] = [`[run] ${commandLine}`];
  const startedAt = Date.now();
  runningProcesses.set(project.id, { process: child, pid: child.pid ?? null, logs, startedAt });
  runSql(
    'UPDATE projects SET procPid = ?, procStartedAt = ?, procCommand = ?, status = ?, updatedAt = ? WHERE id = ?',
    [child.pid ?? null, new Date(startedAt).toISOString(), commandLine, 'running', new Date().toISOString(), project.id]
  );
  if (project.folderPath && fs.existsSync(project.folderPath)) {
    updateManifest(project.folderPath, { status: 'running' });
  }

  const capture = (prefix: string) => (data: Buffer) => {
    const lines = data.toString().split('\n').filter(Boolean);
    for (const line of lines) {
      logs.push(`[${prefix}] ${line}`);
      if (logs.length > MAX_LOG_LINES) logs.shift();
    }
  };
  child.stdout?.on('data', capture('stdout'));
  child.stderr?.on('data', capture('stderr'));

  child.on('exit', (code) => {
    logger.info(`Process exited for ${project.id} with code ${code}`);
    runningProcesses.delete(project.id);
    runSql('UPDATE projects SET status = ?, procPid = NULL, updatedAt = ? WHERE id = ?', ['idle', new Date().toISOString(), project.id]);
    if (project.folderPath && fs.existsSync(project.folderPath)) {
      updateManifest(project.folderPath, { status: 'idle' });
    }

    const wasIntentional = stopRequested.delete(project.id);
    const fresh = queryOne('SELECT * FROM projects WHERE id = ?', [project.id]);
    if (wasIntentional || !fresh?.autoStart) return;

    // Keep-alive for live deployments — with a crash-loop brake
    const ranForMs = Date.now() - startedAt;
    const strikes = ranForMs < 15000 ? (rapidRestarts.get(project.id) || 0) + 1 : 0;
    rapidRestarts.set(project.id, strikes);
    if (strikes >= 3) {
      logger.warn(`${fresh.name} crashed ${strikes} times in a row — giving up until manually restarted`);
      // Surface the give-up on the dashboard instead of only in the server log
      runSql('UPDATE projects SET status = ?, updatedAt = ? WHERE id = ?', ['stalled', new Date().toISOString(), project.id]);
      return;
    }
    logger.info(`Keep-alive: relaunching ${fresh.name} in 2s (crash code ${code})`);
    setTimeout(() => {
      if (!runningProcesses.has(project.id)) {
        spawnManaged(fresh, fresh.procCommand || commandLine);
      }
    }, 2000);
  });

  logger.info(`Started process for ${project.name} on port ${project.assignedPort}: ${commandLine}`);
  return { child, logs };
}

async function verifyLaunch(project: any, commandLine: string, logs: string[], timeoutMs = LAUNCH_VERIFY_TIMEOUT_MS): Promise<LaunchResult> {
  // Don't declare victory until the port actually answers — or the process dies trying.
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!runningProcesses.has(project.id)) {
      return {
        ok: false, verified: false, command: commandLine,
        error: 'Process exited right away. Check the log tail — usually a missing script or missing dependencies.',
        logTail: logs.slice(-15),
      };
    }
    if (await isPortListening(project.assignedPort)) {
      rapidRestarts.delete(project.id);
      return { ok: true, verified: true, command: commandLine };
    }
    await sleep(500);
  }

  // Still alive but not listening on the assigned port yet — could be a slow
  // cold build, or the app picked its own port. Leave it running, but say so.
  return {
    ok: true, verified: false, command: commandLine,
    error: `Started, but nothing is answering on :${project.assignedPort} yet. It may still be building — or the app is using its own port. Check the logs.`,
    logTail: logs.slice(-15),
  };
}

function needsInstall(folderPath: string): boolean {
  return fs.existsSync(path.join(folderPath, 'package.json')) && !fs.existsSync(path.join(folderPath, 'node_modules'));
}

async function launchProject(project: any): Promise<LaunchResult> {
  let commandLine = detectDevCommand(project.folderPath, project.assignedPort);
  if (!commandLine) {
    return {
      ok: false, verified: false,
      error: 'Nothing to start here — no dev script, package.json, or index.html in this folder.',
    };
  }

  // Docker-based projects need the Docker engine up — fail with a clear message
  // instead of crash-looping into the brake.
  if (/docker/i.test(commandLine)) {
    const dockerUp = await new Promise<boolean>((resolve) => {
      exec('docker info', { timeout: 4000 }, (err) => resolve(!err));
    });
    if (!dockerUp) {
      return {
        ok: false, verified: false, command: commandLine,
        error: 'This project runs on Docker (its dev script is docker-compose). Start Docker Desktop first, then hit Start again.',
      };
    }
  }

  // First run on a fresh clone dies instantly without dependencies — install them
  let timeout = LAUNCH_VERIFY_TIMEOUT_MS;
  if (needsInstall(project.folderPath)) {
    commandLine = `npm install && ${commandLine}`;
    timeout = 180000;
  }

  rapidRestarts.delete(project.id); // manual start resets the crash-loop brake
  const { logs } = spawnManaged(project, commandLine);
  return verifyLaunch(project, commandLine, logs, timeout);
}

app.post('/api/projects/:projectId/start', async (req, res) => {
  try {
    const project = queryOne('SELECT * FROM projects WHERE id = ?', [req.params.projectId]);
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    if (!project.folderPath) {
      return res.status(400).json({ success: false, error: 'Project has no folder path' });
    }
    if (!project.assignedPort) {
      return res.status(400).json({ success: false, error: 'Project has no assigned port' });
    }

    if (runningProcesses.has(req.params.projectId)) {
      return res.json({ success: true, data: { projectId: req.params.projectId, port: project.assignedPort, status: 'already running' } });
    }

    // Warn before we even try if something else is squatting on the port
    if (await isPortListening(project.assignedPort)) {
      return res.status(409).json({
        success: false,
        error: `Port ${project.assignedPort} is already in use by another process. Free it or assign a different port.`,
      });
    }

    const result = await launchProject(project);
    if (!result.ok) {
      return res.status(400).json({ success: false, error: result.error, logTail: result.logTail });
    }

    res.json({
      success: true,
      data: {
        projectId: req.params.projectId,
        port: project.assignedPort,
        command: result.command,
        status: result.verified ? 'running' : 'starting',
        warning: result.verified ? undefined : result.error,
      },
    });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ success: false, error: 'Failed to start project' });
  }
});

app.post('/api/projects/:projectId/stop', (req, res) => {
  try {
    const entry = runningProcesses.get(req.params.projectId);
    if (!entry) {
      return res.status(400).json({ success: false, error: 'Project is not running' });
    }

    // Manual stop = take it offline for real: no keep-alive relaunch, no boot autostart
    stopRequested.add(req.params.projectId);
    rapidRestarts.delete(req.params.projectId);

    const pid = entry.pid ?? entry.process?.pid;
    entry.process?.kill();
    if (pid) killPid(pid);

    runningProcesses.delete(req.params.projectId);
    runSql(
      "UPDATE projects SET status = ?, autoStart = 0, deployMode = 'dev', procPid = NULL, updatedAt = ? WHERE id = ?",
      ['idle', new Date().toISOString(), req.params.projectId]
    );

    const project = queryOne('SELECT folderPath FROM projects WHERE id = ?', [req.params.projectId]);
    if (project?.folderPath && fs.existsSync(project.folderPath)) {
      updateManifest(project.folderPath, { status: 'idle' });
    }

    logger.info(`Stopped process for ${req.params.projectId}`);

    res.json({ success: true, data: { projectId: req.params.projectId, status: 'stopped' } });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ success: false, error: 'Failed to stop project' });
  }
});

app.post('/api/projects/:projectId/open', async (req, res) => {
  try {
    const project = queryOne('SELECT * FROM projects WHERE id = ?', [req.params.projectId]);
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    if (!project.assignedPort) {
      return res.status(400).json({ success: false, error: 'Project has no assigned port' });
    }

    const url = `http://localhost:${project.assignedPort}`;
    const openBrowser = () => {
      if (process.platform === 'win32') exec(`start ${url}`);
      else exec(`open ${url}`);
    };

    // Already managed by us and answering? Just open it.
    if (runningProcesses.has(req.params.projectId)) {
      openBrowser();
      return res.json({ success: true, data: { projectId: req.params.projectId, url, status: 'opened' } });
    }

    if (!project.folderPath) {
      return res.status(400).json({ success: false, error: 'Project has no folder path' });
    }

    // Something already listening on the port that we didn't start —
    // probably the app running in another terminal. Just open it.
    if (await isPortListening(project.assignedPort)) {
      openBrowser();
      return res.json({ success: true, data: { projectId: req.params.projectId, url, status: 'opened (external process)' } });
    }

    const result = await launchProject(project);
    if (!result.ok) {
      return res.status(400).json({ success: false, error: result.error, logTail: result.logTail });
    }

    // Only open the browser once the app is actually answering —
    // opening a dead tab is what made Start feel broken.
    if (result.verified) {
      openBrowser();
      return res.json({ success: true, data: { projectId: req.params.projectId, url, status: 'opened' } });
    }

    res.json({
      success: true,
      data: {
        projectId: req.params.projectId,
        url,
        status: 'starting',
        warning: result.error,
        logTail: result.logTail,
      },
    });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ success: false, error: 'Failed to open project' });
  }
});

app.get('/api/projects/:projectId/logs', (req, res) => {
  try {
    const entry = runningProcesses.get(req.params.projectId);
    const logs = entry ? entry.logs : [];
    res.json({ success: true, data: { projectId: req.params.projectId, logs, count: logs.length } });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ success: false, error: 'Failed to fetch logs' });
  }
});

app.get('/api/projects/:projectId/status', (req, res) => {
  try {
    const project = queryOne('SELECT * FROM projects WHERE id = ?', [req.params.projectId]);
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const entry = runningProcesses.get(req.params.projectId);
    const isRunning = !!entry;

    res.json({
      success: true,
      data: {
        projectId: req.params.projectId,
        isRunning,
        port: project.assignedPort,
        logCount: entry ? entry.logs.length : 0,
      },
    });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ success: false, error: 'Failed to fetch project status' });
  }
});

// ====================
// QUICK SCRIPTS & DEPLOY
// ====================

function resolveScriptCommand(project: any, script: string): string | null {
  const manifest = readManifest(project.folderPath);
  if (manifest?.scripts?.[script]) return manifest.scripts[script];
  const pkgPath = path.join(project.folderPath, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      if (pkg.scripts?.[script]) return `npm run ${script}`;
    } catch {}
  }
  return null;
}

function runScriptProcess(project: any, script: string, commandLine: string) {
  const logs: string[] = [];
  const entry = { script, logs, running: true, exitCode: null as number | null, startedAt: Date.now() };
  scriptRuns.set(project.id, entry);

  logs.push(`[run] ${commandLine}`);
  const child = spawn(commandLine, [], {
    cwd: project.folderPath,
    env: { ...process.env, PORT: String(project.assignedPort || '') },
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const capture = (prefix: string) => (data: Buffer) => {
    for (const line of data.toString().split('\n').filter(Boolean)) {
      logs.push(`[${prefix}] ${line}`);
      if (logs.length > MAX_LOG_LINES) logs.shift();
    }
  };
  child.stdout?.on('data', capture('stdout'));
  child.stderr?.on('data', capture('stderr'));
  child.on('exit', (code) => {
    entry.running = false;
    entry.exitCode = code;
    logs.push(`[exit] ${script} finished with code ${code}`);
    logger.info(`Script ${script} for ${project.name} exited with code ${code}`);
  });

  logger.info(`Running script "${script}" for ${project.name}: ${commandLine}`);
}

app.post('/api/projects/:projectId/run-script', async (req, res) => {
  try {
    const { script } = req.body;
    if (!script || !['dev', 'build', 'test', 'start'].includes(script)) {
      return res.status(400).json({ success: false, error: 'script must be one of: dev, build, test, start' });
    }

    const project = queryOne('SELECT * FROM projects WHERE id = ?', [req.params.projectId]);
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });
    if (!project.folderPath || !fs.existsSync(project.folderPath)) {
      return res.status(400).json({ success: false, error: 'Project has no valid folder path' });
    }

    // "dev" is the long-running server — route through the managed process lifecycle
    if (script === 'dev') {
      if (runningProcesses.has(project.id)) {
        return res.json({ success: true, data: { projectId: project.id, script, status: 'already running' } });
      }
      const result = await launchProject(project);
      if (!result.ok) {
        return res.status(400).json({ success: false, error: result.error, logTail: result.logTail });
      }
      return res.json({
        success: true,
        data: { projectId: project.id, script, command: result.command, status: result.verified ? 'running' : 'starting', warning: result.error },
      });
    }

    const existing = scriptRuns.get(project.id);
    if (existing?.running) {
      return res.status(409).json({ success: false, error: `"${existing.script}" is already running for this project` });
    }

    const commandLine = resolveScriptCommand(project, script);
    if (!commandLine) {
      return res.status(400).json({ success: false, error: `No "${script}" script defined in manifest or package.json` });
    }

    runScriptProcess(project, script, commandLine);
    res.json({ success: true, data: { projectId: project.id, script, command: commandLine, status: 'running' } });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ success: false, error: 'Failed to run script' });
  }
});

app.get('/api/projects/:projectId/script-logs', (req, res) => {
  try {
    const entry = scriptRuns.get(req.params.projectId);
    if (!entry) {
      return res.json({ success: true, data: { script: null, logs: [], running: false, exitCode: null } });
    }
    res.json({
      success: true,
      data: { script: entry.script, logs: entry.logs, running: entry.running, exitCode: entry.exitCode, startedAt: entry.startedAt },
    });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ success: false, error: 'Failed to fetch script logs' });
  }
});

app.post('/api/projects/:projectId/deploy', (req, res) => {
  try {
    const target = req.body?.target === 'netlify' ? 'netlify' : 'vercel';
    const project = queryOne('SELECT * FROM projects WHERE id = ?', [req.params.projectId]);
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });
    if (!project.folderPath || !fs.existsSync(project.folderPath)) {
      return res.status(400).json({ success: false, error: 'Project has no valid folder path' });
    }

    const existing = scriptRuns.get(project.id);
    if (existing?.running) {
      return res.status(409).json({ success: false, error: `"${existing.script}" is already running for this project` });
    }

    const commandLine = target === 'netlify' ? 'npx netlify deploy --prod' : 'npx vercel --prod --yes';
    runScriptProcess(project, `deploy:${target}`, commandLine);

    if (fs.existsSync(project.folderPath)) {
      const manifest = readManifest(project.folderPath);
      if (manifest) {
        manifest.status.lastDeploy = new Date().toISOString();
        manifest.project.updated = new Date().toISOString();
        writeManifest(project.folderPath, manifest);
      }
    }

    res.json({ success: true, data: { projectId: project.id, target, command: commandLine, status: 'deploying' } });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ success: false, error: 'Failed to start deploy' });
  }
});

// ====================
// START ALL / STOP ALL — actually launch and kill processes, keep port assignments
// ====================

app.post('/api/projects/start-all', async (_req, res) => {
  try {
    const projects = queryAll('SELECT * FROM projects WHERE assignedPort IS NOT NULL');
    let started = 0, alreadyLive = 0, skipped = 0;
    const startedNames: string[] = [];

    for (const p of projects) {
      if (runningProcesses.has(p.id)) { alreadyLive++; continue; }
      if (!p.folderPath || !fs.existsSync(p.folderPath) || !canStartProject(p.folderPath)) { skipped++; continue; }
      if (await isPortListening(p.assignedPort)) { alreadyLive++; continue; }

      let cmd = detectDevCommand(p.folderPath, p.assignedPort);
      if (!cmd) { skipped++; continue; }
      if (needsInstall(p.folderPath)) cmd = `npm install && ${cmd}`;

      rapidRestarts.delete(p.id);
      spawnManaged(p, cmd);
      startedNames.push(p.name);
      started++;
      await sleep(400); // stagger the spawns so a dozen npm processes don't slam the CPU at once
    }

    // Give everything a moment to boot, then report who is actually answering
    await sleep(6000);
    let answering = 0;
    for (const p of projects) {
      if (p.assignedPort && await isPortListening(p.assignedPort)) answering++;
    }
    portScanCache.at = 0; // dashboard rescan on next fetch

    res.json({ success: true, data: { started, alreadyLive, skipped, answering, startedNames } });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ success: false, error: 'Failed to start all projects' });
  }
});

app.post('/api/projects/stop-all', (_req, res) => {
  try {
    let stopped = 0;
    for (const [projectId, entry] of runningProcesses) {
      stopRequested.add(projectId);
      rapidRestarts.delete(projectId);
      const pid = entry.pid ?? entry.process?.pid;
      entry.process?.kill();
      if (pid) killPid(pid);
      runningProcesses.delete(projectId);
      runSql(
        "UPDATE projects SET status = 'idle', autoStart = 0, deployMode = 'dev', procPid = NULL, updatedAt = ? WHERE id = ?",
        [new Date().toISOString(), projectId]
      );
      stopped++;
    }
    portScanCache.at = 0;
    res.json({ success: true, data: { stopped } });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ success: false, error: 'Failed to stop all projects' });
  }
});

// ====================
// LOCAL LIVE DEPLOY — promote a demo project to a permanent local app
// ====================

// How to serve the *production* version of this folder (after a build).
function detectLiveCommand(folderPath: string, port: number): string | null {
  const manifest = readManifest(folderPath);
  if (manifest?.scripts?.serve) return manifest.scripts.serve;

  const pkgPath = path.join(folderPath, 'package.json');
  let pkg: any = null;
  if (fs.existsSync(pkgPath)) {
    try { pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')); } catch {}
  }
  const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };

  if (deps.next) return `npx next start -p ${port}`;

  // Built bundle (Vite/CRA/etc.) — serve the output folder
  for (const dir of ['dist', 'build', 'out']) {
    if (fs.existsSync(path.join(folderPath, dir, 'index.html'))) {
      return `npx --yes http-server ${dir} -p ${port} -c-1`;
    }
  }

  if (pkg?.scripts?.start) return 'npm start';
  if (fs.existsSync(path.join(folderPath, 'index.html'))) {
    return `npx --yes http-server -p ${port} -c-1`;
  }

  // Last resort: live = whatever dev mode we can find
  return detectDevCommand(folderPath, port);
}

// Run a one-shot command (like a build) to completion, streaming into logs.
function runOnce(cwd: string, commandLine: string, logs: string[]): Promise<number | null> {
  return new Promise((resolve) => {
    logs.push(`[run] ${commandLine}`);
    const child = spawn(commandLine, [], { cwd, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const capture = (prefix: string) => (data: Buffer) => {
      for (const line of data.toString().split('\n').filter(Boolean)) {
        logs.push(`[${prefix}] ${line}`);
        if (logs.length > MAX_LOG_LINES) logs.shift();
      }
    };
    child.stdout?.on('data', capture('stdout'));
    child.stderr?.on('data', capture('stderr'));
    child.on('exit', (code) => resolve(code));
    child.on('error', () => resolve(1));
  });
}

app.post('/api/projects/:projectId/go-live', async (req, res) => {
  try {
    const project = queryOne('SELECT * FROM projects WHERE id = ?', [req.params.projectId]);
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });
    if (!project.folderPath || !fs.existsSync(project.folderPath)) {
      return res.status(400).json({ success: false, error: 'Project has no valid folder path' });
    }
    if (!project.assignedPort) {
      return res.status(400).json({ success: false, error: 'Project has no assigned port' });
    }

    const existing = scriptRuns.get(project.id);
    if (existing?.running) {
      return res.status(409).json({ success: false, error: `"${existing.script}" is already running for this project` });
    }

    const logs: string[] = [];
    const entry = { script: 'deploy:live', logs, running: true, exitCode: null as number | null, startedAt: Date.now() };
    scriptRuns.set(project.id, entry);

    // Long build — answer now, deploy in the background; progress lands in the Scripts tab
    res.json({
      success: true,
      data: { projectId: project.id, status: 'deploying', message: 'Building and deploying — open the card and watch the Scripts tab.' },
    });

    (async () => {
      try {
        // 1. Production build, if the project has one
        let hasBuild = false;
        const pkgPath = path.join(project.folderPath, 'package.json');
        if (fs.existsSync(pkgPath)) {
          try { hasBuild = !!JSON.parse(fs.readFileSync(pkgPath, 'utf-8')).scripts?.build; } catch {}
        }
        if (hasBuild) {
          logs.push('[deploy] Building production bundle…');
          const code = await runOnce(project.folderPath, 'npm run build', logs);
          if (code !== 0) {
            logs.push(`[deploy] ✗ Build failed (code ${code}) — project stays in dev mode.`);
            entry.running = false;
            entry.exitCode = code;
            return;
          }
          logs.push('[deploy] ✓ Build complete');
        }

        // 2. Swap out the dev process if one is running
        if (runningProcesses.has(project.id)) {
          logs.push('[deploy] Stopping dev process…');
          stopRequested.add(project.id);
          const rp = runningProcesses.get(project.id)!;
          const pid = rp.pid ?? rp.process?.pid;
          rp.process?.kill();
          if (pid) killPid(pid);
          const until = Date.now() + 10000;
          while (runningProcesses.has(project.id) && Date.now() < until) await sleep(300);
        }

        // 3. Serve the real thing, with keep-alive + boot autostart
        const serveCmd = detectLiveCommand(project.folderPath, project.assignedPort);
        if (!serveCmd) {
          logs.push('[deploy] ✗ Nothing to serve in this folder.');
          entry.running = false;
          entry.exitCode = 1;
          return;
        }

        runSql("UPDATE projects SET deployMode = 'live', autoStart = 1, updatedAt = ? WHERE id = ?", [new Date().toISOString(), project.id]);
        const fresh = queryOne('SELECT * FROM projects WHERE id = ?', [project.id]);
        logs.push(`[deploy] Going live: ${serveCmd}`);
        const { logs: procLogs } = spawnManaged(fresh, serveCmd);
        const result = await verifyLaunch(fresh, serveCmd, procLogs, 30000);

        if (result.verified) {
          logs.push(`[deploy] ✓ LIVE at http://localhost:${project.assignedPort} — auto-restarts on crash, comes back after reboot.`);
          // Wire up health monitoring so response-time badges and sparklines work for live apps
          if (!fresh.healthCheckUrl) {
            runSql('UPDATE projects SET healthCheckUrl = ?, updatedAt = ? WHERE id = ?',
              [`http://localhost:${project.assignedPort}/`, new Date().toISOString(), project.id]);
            updateManifest(project.folderPath, { healthCheckUrl: `http://localhost:${project.assignedPort}/` });
          }
          const manifest = readManifest(project.folderPath);
          if (manifest) {
            manifest.status.lastDeploy = new Date().toISOString();
            manifest.project.updated = new Date().toISOString();
            writeManifest(project.folderPath, manifest);
          }
          entry.exitCode = 0;
        } else {
          logs.push(`[deploy] ⚠ ${result.error}`);
          entry.exitCode = result.ok ? 0 : 1;
        }
        entry.running = false;
      } catch (err: any) {
        logs.push(`[deploy] ✗ ${err.message}`);
        entry.running = false;
        entry.exitCode = 1;
      }
    })();
  } catch (error) {
    logger.error(error);
    res.status(500).json({ success: false, error: 'Failed to start live deploy' });
  }
});

// ====================
// PROJECT NOTES (manifest-backed)
// ====================

app.get('/api/projects/:projectId/notes', (req, res) => {
  try {
    const project = queryOne('SELECT * FROM projects WHERE id = ?', [req.params.projectId]);
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });
    if (!project.folderPath) return res.json({ success: true, data: { notes: '', hasManifest: false } });

    const manifest = readManifest(project.folderPath);
    res.json({ success: true, data: { notes: manifest?.notes || '', hasManifest: !!manifest } });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ success: false, error: 'Failed to read notes' });
  }
});

app.put('/api/projects/:projectId/notes', (req, res) => {
  try {
    const { notes } = req.body;
    if (typeof notes !== 'string') {
      return res.status(400).json({ success: false, error: 'notes must be a string' });
    }

    const project = queryOne('SELECT * FROM projects WHERE id = ?', [req.params.projectId]);
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });
    if (!project.folderPath || !fs.existsSync(project.folderPath)) {
      return res.status(400).json({ success: false, error: 'Project has no valid folder path' });
    }

    let manifest = readManifest(project.folderPath);
    if (!manifest) {
      manifest = createManifest(project.folderPath, project.name, project.techStack || 'other', project.assignedPort);
    }
    manifest.notes = notes;
    manifest.project.updated = new Date().toISOString();
    writeManifest(project.folderPath, manifest);

    res.json({ success: true, data: { notes } });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ success: false, error: 'Failed to save notes' });
  }
});

// ====================
// PORT CONFLICT DETECTION
// ====================

function isPortListening(port: number, timeoutMs = 400): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const done = (result: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
    socket.connect(port, '127.0.0.1');
  });
}

// Scan every assigned port for what is ACTUALLY listening — this is the source
// of truth for "is it really running", regardless of what the DB thinks.
let portScanCache: { at: number; live: Set<number> } = { at: 0, live: new Set() };

async function getLivePorts(projects: any[]): Promise<Set<number>> {
  if (Date.now() - portScanCache.at < 15000) return portScanCache.live;

  const ports = projects.filter((p: any) => p.assignedPort).map((p: any) => p.assignedPort);
  const results = await Promise.all(
    ports.map(async (port: number) => ({ port, busy: await isPortListening(port) }))
  );
  portScanCache = { at: Date.now(), live: new Set(results.filter(r => r.busy).map(r => r.port)) };
  return portScanCache.live;
}

// ====================
// DOCKER — containers as first-class lab citizens
// ====================

function dockerExec(args: string, timeoutMs = 8000): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => {
    exec(`docker ${args}`, { timeout: timeoutMs }, (err, stdout) => {
      resolve({ ok: !err, out: stdout || '' });
    });
  });
}

interface DockerContainer {
  name: string;
  image: string;
  state: string;      // running | exited | ...
  status: string;     // human string from docker
  ports: { host: number; container: number }[];
  openUrl: string | null;
}

let dockerCache: { at: number; available: boolean; containers: DockerContainer[] } = { at: 0, available: false, containers: [] };

async function getDockerContainers(): Promise<{ available: boolean; containers: DockerContainer[] }> {
  if (Date.now() - dockerCache.at < 10000) return dockerCache;

  const res = await dockerExec('ps -a --format "{{json .}}"');
  if (!res.ok) {
    dockerCache = { at: Date.now(), available: false, containers: [] };
    return dockerCache;
  }

  const containers: DockerContainer[] = [];
  for (const line of res.out.split('\n').filter(Boolean)) {
    try {
      const c = JSON.parse(line);
      // Ports look like: "0.0.0.0:5173->5173/tcp, [::]:5173->5173/tcp"
      const ports: { host: number; container: number }[] = [];
      const seen = new Set<number>();
      for (const m of String(c.Ports || '').matchAll(/0\.0\.0\.0:(\d+)->(\d+)/g)) {
        const host = parseInt(m[1], 10);
        if (!seen.has(host)) { seen.add(host); ports.push({ host, container: parseInt(m[2], 10) }); }
      }
      // Best guess at the web UI: prefer common web ports, else the first published one
      const web = ports.find(p => [80, 443, 3000, 5173, 8080, 8081, 8000].includes(p.container)) || ports[0];
      containers.push({
        name: c.Names,
        image: c.Image,
        state: c.State,
        status: c.Status,
        ports,
        openUrl: web ? `http://localhost:${web.host}` : null,
      });
    } catch {}
  }

  dockerCache = { at: Date.now(), available: true, containers };
  return dockerCache;
}

app.get('/api/docker', async (_req, res) => {
  try {
    const data = await getDockerContainers();
    res.json({ success: true, data });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ success: false, error: 'Failed to list Docker containers' });
  }
});

app.post('/api/docker/:name/:action', async (req, res) => {
  try {
    const { name, action } = req.params;
    if (!['start', 'stop', 'restart'].includes(action)) {
      return res.status(400).json({ success: false, error: 'action must be start, stop, or restart' });
    }
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(name)) {
      return res.status(400).json({ success: false, error: 'Invalid container name' });
    }
    const result = await dockerExec(`${action} ${name}`, 30000);
    if (!result.ok) {
      return res.status(500).json({ success: false, error: `docker ${action} failed — is Docker Desktop running?` });
    }
    dockerCache.at = 0;
    res.json({ success: true, data: { name, action, done: true } });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ success: false, error: 'Docker command failed' });
  }
});

// ====================
// DASHBOARD ENDPOINT
// ====================

app.get('/api/dashboard', async (_req, res) => {
  try {
    const projects = queryAll('SELECT * FROM projects');

    const sources = queryAll('SELECT * FROM scanSources');
    const skillCount = projects.filter((p: any) => {
      const src = sources.find((s: any) => s.type === 'skill' && p.folderPath && p.folderPath.startsWith(s.directory));
      return !!src;
    }).length;

    const livePorts = await getLivePorts(projects);

    // Attach last 12 health checks as sparkline per project, plus live process info
    const projectsWithSparklines = projects.map((p: any) => {
      const history = queryAll(
        'SELECT status, responseTime FROM healthHistory WHERE projectId = ? ORDER BY timestamp DESC LIMIT 12',
        [p.id]
      );
      const latest = history[0] || null;
      const proc = runningProcesses.get(p.id);
      return {
        ...p,
        sparkline: history.reverse(),
        isRunning: !!proc,
        startedAt: proc ? proc.startedAt : null,
        lastResponseTime: latest ? latest.responseTime : null,
        canStart: canStartProject(p.folderPath),
        portLive: !!(p.assignedPort && livePorts.has(p.assignedPort)),
        portConflict: !!(p.assignedPort && !proc && p.status !== 'running' && livePorts.has(p.assignedPort)),
      };
    });

    const summary = {
      totalProjects: projects.length,
      runningProjects: projects.filter((p: any) => p.status === 'running').length,
      unhealthyProjects: projects.filter((p: any) => p.status === 'unhealthy').length,
      stalledProjects: projects.filter((p: any) => p.status === 'stalled').length,
      skillCount,
      scanSources: sources.length,
    };

    res.json({
      success: true,
      data: { summary, projects: projectsWithSparklines, scanSources: sources },
    });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ success: false, error: 'Failed to fetch dashboard data' });
  }
});

// ====================
// SCHEDULED HEALTH CHECKS
// ====================

cron.schedule(HEALTH_CHECK_INTERVAL, async () => {
  const projects = queryAll('SELECT * FROM projects WHERE assignedPort IS NOT NULL');

  for (const project of projects) {
    if (project.healthCheckUrl) {
      await performHealthCheck(project);
    }
  }

  logger.info(`Health check completed for ${projects.length} projects`);
});

// Watchdog for adopted processes — they have no exit event, so poll their PIDs.
// If a live-deployed one died, bring it back.
cron.schedule('*/45 * * * * *', async () => {
  for (const [projectId, entry] of runningProcesses) {
    if (entry.process !== null || !entry.pid) continue; // only adopted ones
    if (pidAlive(entry.pid)) continue;

    logger.info(`Adopted process for ${projectId} (pid ${entry.pid}) is gone`);
    runningProcesses.delete(projectId);
    runSql('UPDATE projects SET status = ?, procPid = NULL, updatedAt = ? WHERE id = ?', ['idle', new Date().toISOString(), projectId]);

    const p = queryOne('SELECT * FROM projects WHERE id = ?', [projectId]);
    if (p?.autoStart && p.folderPath && fs.existsSync(p.folderPath) && p.assignedPort) {
      const cmd = p.procCommand || detectLiveCommand(p.folderPath, p.assignedPort);
      if (cmd && !(await isPortListening(p.assignedPort))) {
        logger.info(`Keep-alive: restarting adopted live app ${p.name}`);
        spawnManaged(p, cmd);
      }
    }
  }
});

// Scan for new projects every 5 minutes
cron.schedule('0 */5 * * * *', () => {
  const result = runScan();
  if (result.added.length > 0) {
    logger.info(`Auto-scan found ${result.added.length} new projects: ${result.added.join(', ')}`);
  }
});

// ====================
// SERVER START
// ====================

async function main() {
  const dataDir = path.dirname(dbPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Single-instance guard — the boot autostart and a dev terminal must not fight over the port
  if (await isPortListening(PORT_MANAGER_PORT)) {
    logger.info(`Another Static LABS instance already owns :${PORT_MANAGER_PORT} — exiting quietly.`);
    process.exit(0);
  }

  const SQL = await initSqlJs();

  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  initializeDatabase();

  // Run initial scan on startup
  const initialScan = runScan();
  if (initialScan.added.length > 0) {
    logger.info(`Startup scan registered ${initialScan.added.length} projects: ${initialScan.added.join(', ')}`);
  }

  // Auto-assign ports to any existing projects that still have none
  const portless = queryAll('SELECT * FROM projects WHERE assignedPort IS NULL');
  let autoAssigned = 0;
  for (const project of portless) {
    const nextPort = queryOne('SELECT port FROM portPool WHERE isAvailable = 1 LIMIT 1');
    if (!nextPort) break;
    runSql('UPDATE portPool SET isAvailable = 0, assignedToProjectId = ? WHERE port = ?', [project.id, nextPort.port]);
    runSql('UPDATE projects SET assignedPort = ?, status = ?, updatedAt = ? WHERE id = ?', [nextPort.port, 'idle', new Date().toISOString(), project.id]);
    if (project.folderPath && fs.existsSync(project.folderPath)) {
      updateManifest(project.folderPath, { assignedPort: nextPort.port, status: 'idle' });
    }
    autoAssigned++;
  }
  if (autoAssigned > 0) {
    logger.info(`Auto-assigned ports to ${autoAssigned} existing projects`);
  }

  // ── Re-adopt processes that survived a manager restart ──
  const withPids = queryAll('SELECT * FROM projects WHERE procPid IS NOT NULL');
  for (const p of withPids) {
    const alive = pidAlive(p.procPid) && p.assignedPort && await isPortListening(p.assignedPort);
    if (alive) {
      runningProcesses.set(p.id, {
        process: null,
        pid: p.procPid,
        logs: [`[adopted] Re-adopted running process (pid ${p.procPid}) after manager restart — new output is not captured until the next restart of this app.`],
        startedAt: p.procStartedAt ? Date.parse(p.procStartedAt) : Date.now(),
      });
      logger.info(`Adopted ${p.name} (pid ${p.procPid}) on :${p.assignedPort}`);
    } else {
      runSql('UPDATE projects SET procPid = NULL, status = ?, updatedAt = ? WHERE id = ?', ['idle', new Date().toISOString(), p.id]);
    }
  }

  // ── Bring live deployments back up ──
  const liveOnes = queryAll('SELECT * FROM projects WHERE autoStart = 1');
  for (const p of liveOnes) {
    if (runningProcesses.has(p.id)) continue;
    const cmd = p.procCommand || detectLiveCommand(p.folderPath, p.assignedPort);
    if (!cmd || !p.folderPath || !fs.existsSync(p.folderPath) || !p.assignedPort) continue;
    if (await isPortListening(p.assignedPort)) continue; // something already serving it
    logger.info(`Autostart: bringing ${p.name} back live on :${p.assignedPort}`);
    spawnManaged(p, cmd);
  }

  // ── Serve the built dashboard from this same port — one URL for the whole lab ──
  const dashDist = path.join(__dirname, '..', '..', 'dashboard', 'dist');
  if (fs.existsSync(dashDist)) {
    app.use(express.static(dashDist));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/icons')) return next();
      res.sendFile(path.join(dashDist, 'index.html'));
    });
    logger.info(`Dashboard served at http://localhost:${PORT_MANAGER_PORT}`);
  }

  app.listen(PORT_MANAGER_PORT, () => {
    logger.info(`Static LABS Port Manager listening on port ${PORT_MANAGER_PORT}`);
    logger.info(`Port pool range: ${PORT_POOL_MIN}-${PORT_POOL_MAX}`);
  });
}

main().catch((err) => {
  logger.error(err);
  process.exit(1);
});
