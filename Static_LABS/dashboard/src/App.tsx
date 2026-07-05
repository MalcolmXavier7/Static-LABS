import React, { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import ProjectGrid from './components/ProjectGrid';
import AssignPortModal from './components/AssignPortModal';
import EditProjectModal from './components/EditProjectModal';
import AddProjectModal from './components/AddProjectModal';
import CommandPalette from './components/CommandPalette';
import ProjectPanel from './components/ProjectPanel';
import DockerHarbor from './components/DockerHarbor';
import { getTheme } from './theme';

interface SparkPoint {
  status: string;
  responseTime: number;
}

interface Project {
  id: string;
  name: string;
  assignedPort: number | null;
  techStack: string;
  iconUrl: string;
  folderPath: string;
  openUrl: string;
  status: string;
  lastHeartbeat: string | null;
  healthCheckUrl: string;
  createdAt: string;
  updatedAt: string;
  sparkline?: SparkPoint[];
  isRunning?: boolean;
  startedAt?: number | null;
  lastResponseTime?: number | null;
  portConflict?: boolean;
  portLive?: boolean;
  canStart?: boolean;
  deployMode?: string;
  autoStart?: number;
}

// A project counts as up if we launched it, health checks say so, or the port is really answering
const isUp = (p: Project) => p.status === 'running' || !!p.isRunning || !!p.portLive;

interface DashboardData {
  summary: {
    totalProjects: number;
    runningProjects: number;
    unhealthyProjects: number;
    stalledProjects: number;
    skillCount: number;
    scanSources: number;
  };
  projects: Project[];
}

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001';

type Filter = 'all' | 'running' | 'idle' | 'skills';

const FILTER_DEFS: { key: Filter; label: string }[] = [
  { key: 'all',     label: 'All' },
  { key: 'running', label: 'Lights on' },
  { key: 'idle',    label: 'Lights off' },
  { key: 'skills',  label: 'Skills' },
];

function timeAgo(date: Date): string {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}

function App() {
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [bulkLoading, setBulkLoading] = useState<string | null>(null);
  const [showAddProject, setShowAddProject] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [banner, setBanner] = useState<string | null>(null);
  const [lastScanTime, setLastScanTime] = useState<Date | null>(null);
  const [scanning, setScanning] = useState(false);
  const [headerH, setHeaderH] = useState(64);
  const [dark, setDark] = useState(() => localStorage.getItem('st-dark') === '1');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [panelProjectId, setPanelProjectId] = useState<string | null>(null);
  const headerRef = useRef<HTMLElement>(null);

  const T = getTheme(dark);

  useEffect(() => {
    localStorage.setItem('st-dark', dark ? '1' : '0');
    document.body.style.background = dark ? '#050810' : '#f5f7fa';
  }, [dark]);

  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeaderH(el.offsetHeight));
    ro.observe(el);
    setHeaderH(el.offsetHeight);
    return () => ro.disconnect();
  }, []);

  // Cmd+K / Ctrl+K opens the project search palette
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(open => !open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const { data, isLoading, error, refetch } = useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const response = await axios.get(`${API_BASE}/api/dashboard`);
      return response.data.data;
    },
    refetchInterval: 10000,
  });

  const handleRunAll = async () => {
    setBulkLoading('run');
    setBanner('Starting every project — this takes a moment while they boot…');
    try {
      await axios.post(`${API_BASE}/api/ports/assign-all`);
      const res = await axios.post(`${API_BASE}/api/projects/start-all`, {}, { timeout: 300000 });
      const d = res.data.data;
      setBanner(`Run all: started ${d.started}, ${d.answering} answering on their ports, ${d.alreadyLive} already live, ${d.skipped} skipped (nothing to serve).`);
      refetch();
    } catch (err) {
      console.error(err);
      setBanner('Run all hit a problem — is the port-manager reachable?');
    }
    finally { setBulkLoading(null); }
  };

  const handleStopAll = async () => {
    setBulkLoading('stop');
    try {
      const res = await axios.post(`${API_BASE}/api/projects/stop-all`);
      setBanner(`All lights out — ${res.data.data.stopped} stopped. Port assignments kept.`);
      refetch();
    } catch (err) { console.error(err); }
    finally { setBulkLoading(null); }
  };

  const handleHealth = async () => {
    setBulkLoading('health');
    try {
      await axios.post(`${API_BASE}/api/health/check-all`);
      const running = data?.projects.filter(p => p.status === 'running').length ?? 0;
      setBanner(`Health check complete — ${running} responding.`);
      refetch();
    } catch (err) { console.error(err); }
    finally { setBulkLoading(null); }
  };

  const handleScan = async () => {
    if (scanning) return;
    setScanning(true);
    setBanner(null);
    try {
      const res = await axios.post(`${API_BASE}/api/scan`);
      const d = res.data.data;
      setLastScanTime(new Date());
      if (d.added?.length > 0) {
        setBanner(`Scan complete — new buildings went up: ${d.added.join(', ')}.`);
        setTimeout(() => setBanner(null), 8000);
      } else {
        setBanner(`Scan complete — ${d.scanned ?? 0} directories checked, everything up to date.`);
        setTimeout(() => setBanner(null), 4000);
      }
      refetch();
    } catch (err) { console.error(err); }
    finally { setScanning(false); }
  };

  const filteredProjects = (data?.projects ?? []).filter(p => {
    if (filter === 'running') return isUp(p);
    if (filter === 'idle')    return !isUp(p) && p.techStack !== 'skill';
    if (filter === 'skills')  return p.techStack === 'skill';
    return true;
  });

  const portsAssigned  = data?.projects.filter(p => p.assignedPort).length ?? 0;
  const skillCount     = data?.summary.skillCount ?? 0;
  const runningCount   = data?.projects.filter(isUp).length ?? 0;
  const conflictCount  = data?.projects.filter(p => p.portConflict).length ?? 0;
  const lastScanLabel  = lastScanTime ? timeAgo(lastScanTime) : 'never';

  // Panel project stays fresh across the 10s refetch
  const panelProject = panelProjectId
    ? data?.projects.find(p => p.id === panelProjectId) ?? null
    : null;

  const pillStyle = {
    display: 'flex', alignItems: 'baseline', gap: 6,
    padding: '5px 14px', borderRadius: 999,
    background: T.pillBg, border: `1px solid ${T.pillBorder}`,
    fontSize: 14, whiteSpace: 'nowrap' as const, color: T.subtext,
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: T.pageBg,
      fontFamily: "'Barlow', Arial, Helvetica, sans-serif",
      color: T.text,
      paddingBottom: 96,
    }}>

      {/* ── Command strip ── */}
      <header ref={headerRef} style={{
        position: 'sticky', top: 0, zIndex: 40,
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px 16px',
        padding: '14px 32px',
        background: T.headerBg,
        backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
        borderBottom: `1px solid ${T.border}`,
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img
            src="/logo.png"
            alt="Static Labs"
            style={{
              width: 40, height: 40, borderRadius: 8,
              objectFit: 'cover',
              boxShadow: 'rgba(0,0,0,0.16) 0px 5px 9px 0px',
            }}
          />
          <div style={{ fontWeight: 600, fontSize: 19, letterSpacing: '0.4px', whiteSpace: 'nowrap', color: T.heading }}>
            Static Labs
          </div>
        </div>

        {/* Stat pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 8 }}>
          <div style={pillStyle}>
            <span style={{ fontWeight: 700, color: T.text }}>{portsAssigned}</span> ports
          </div>
          {skillCount > 0 && (
            <div style={pillStyle}>
              <span style={{ fontWeight: 700, color: T.text }}>{skillCount}</span> skills
            </div>
          )}
          <div style={pillStyle}>
            <span style={{ fontWeight: 700, color: T.accentText }}>{runningCount}</span> lights on
          </div>
          {conflictCount > 0 && (
            <div style={{ ...pillStyle, border: '1px solid rgba(200,27,58,0.4)' }}>
              <span style={{ fontWeight: 700, color: '#c81b3a' }}>⚠ {conflictCount}</span> port conflict{conflictCount > 1 ? 's' : ''}
            </div>
          )}
        </div>

        <div style={{ flex: 1 }} />

        {/* Action buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => setPaletteOpen(true)}
            title="Search projects (Ctrl+K)"
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 14px', borderRadius: 999,
              border: `2px solid ${T.pillBorder}`, background: T.pillBg,
              fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
              color: T.subtext, cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            ⌕ Search
            <span style={{
              padding: '1px 6px', borderRadius: 5, fontSize: 11,
              border: `1px solid ${T.pillBorder}`,
            }}>⌘K</span>
          </button>

          <button
            onClick={() => setDark(d => !d)}
            title={dark ? 'Daylight mode' : 'Batcave mode'}
            style={{
              width: 38, height: 38, borderRadius: 999,
              border: `2px solid ${T.pillBorder}`, background: T.pillBg,
              fontSize: 16, cursor: 'pointer', color: T.text,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {dark ? '☀' : '🦇'}
          </button>

          <button
            onClick={() => setShowAddProject(true)}
            style={btnYellow}
          >
            ＋ Add project
          </button>

          <button
            onClick={handleRunAll}
            disabled={bulkLoading !== null}
            style={{ ...btnBlue, opacity: bulkLoading ? 0.6 : 1 }}
          >
            {bulkLoading === 'run' ? '…' : '▶ Run all'}
          </button>

          <button
            onClick={handleStopAll}
            disabled={bulkLoading !== null}
            style={{
              ...btnOutlineDark, opacity: bulkLoading ? 0.6 : 1,
              border: `2px solid ${dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)'}`,
              background: T.pillBg, color: T.text,
            }}
          >
            {bulkLoading === 'stop' ? '…' : '■ Stop all'}
          </button>

          <button
            onClick={handleScan}
            disabled={bulkLoading !== null || scanning}
            style={{ ...btnOutlineBlue, background: T.pillBg, opacity: (bulkLoading || scanning) ? 0.6 : 1 }}
          >
            <span style={scanning ? { display: 'inline-block', animation: 'st-spin 1s linear infinite' } : {}}>◎</span>
            {scanning ? ' Scanning…' : ' Scan'}
          </button>

          <button
            onClick={handleHealth}
            disabled={bulkLoading !== null}
            style={{ ...btnOutlineBlue, background: T.pillBg, opacity: bulkLoading ? 0.6 : 1 }}
          >
            {bulkLoading === 'health' ? '…' : '↻ Health'}
          </button>
        </div>
      </header>

      {/* ── Scan banner ── */}
      {banner && (
        <div className="banner-in" style={{
          display: 'flex', alignItems: 'center', gap: 12,
          margin: '16px 32px 0',
          padding: '12px 20px',
          borderRadius: 12,
          background: T.pillBg,
          backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid rgba(74,144,184,0.4)',
          color: T.text, fontSize: 15,
          boxShadow: 'rgba(0,0,0,0.06) 0px 5px 9px 0px',
        }}>
          <span style={{ color: '#F5C800', fontSize: 12 }}>◆</span>
          <span>{banner}</span>
          <div style={{ flex: 1 }} />
          <button
            onClick={() => setBanner(null)}
            style={{ border: 'none', background: 'none', color: T.subtext, fontFamily: 'inherit', fontSize: 14, cursor: 'pointer' }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── Heading row ── */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '8px 16px',
        padding: '40px 32px 8px',
      }}>
        <h1 style={{
          margin: 0, fontWeight: 300, fontSize: 35, lineHeight: 1.25,
          letterSpacing: '0.1px', whiteSpace: 'nowrap', color: T.heading,
          fontFamily: "'Barlow', Arial, Helvetica, sans-serif",
        }}>
          The neighborhood
        </h1>
        <div style={{ fontSize: 14, fontWeight: 500, color: T.subtext }}>
          every port is a building · lights on means running · last scan {lastScanLabel}
        </div>
      </div>

      {/* ── Filter row ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '12px 32px 20px',
        position: 'sticky', top: headerH, zIndex: 30,
        background: dark ? 'rgba(5,8,16,0.35)' : 'rgba(245,247,250,0.3)',
        backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
      }}>
        {FILTER_DEFS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              padding: '6px 16px', borderRadius: 999,
              fontFamily: 'inherit', fontSize: 13, fontWeight: 500,
              whiteSpace: 'nowrap', cursor: 'pointer',
              transition: 'border-color 180ms ease',
              ...(filter === f.key
                ? { border: `2px solid ${T.accent}`, background: dark ? 'rgba(31,78,216,0.18)' : 'rgba(74,144,184,0.12)', color: T.accentText }
                : { border: `2px solid ${dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'}`, background: T.pillBg, color: T.subtext }
              ),
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* ── Grid ── */}
      {isLoading && (
        <div style={{ textAlign: 'center', padding: '64px 32px', color: T.subtext, fontSize: 15 }}>
          <div style={{ fontSize: 24, marginBottom: 12 }}>◎</div>
          Loading the neighborhood…
        </div>
      )}

      {error && (
        <div style={{
          margin: '0 32px 24px', padding: '16px 20px', borderRadius: 12,
          background: 'rgba(200,27,58,0.06)', border: '1px solid rgba(200,27,58,0.3)',
          color: '#c81b3a', fontSize: 14,
        }}>
          Can't reach the port-manager API. Is it running on :3001?
        </div>
      )}

      {data && filteredProjects.length > 0 && (
        <ProjectGrid
          projects={filteredProjects}
          theme={T}
          onAssignPort={(p) => { setSelectedProject(p); setShowAssignModal(true); }}
          onEdit={(p) => setEditProject(p)}
          onSelect={(p) => setPanelProjectId(p.id)}
          onRefresh={refetch}
        />
      )}

      {data && filteredProjects.length === 0 && !isLoading && (
        <div style={{
          margin: '0 32px', padding: '48px 32px',
          borderRadius: 19, textAlign: 'center',
          border: `1.5px dashed ${dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'}`,
          color: T.subtext, fontSize: 15,
        }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>◆</div>
          No projects here yet — add one or run a scan.
        </div>
      )}

      {/* ── Docker harbor ── */}
      <DockerHarbor apiBase={API_BASE} theme={T} />

      {/* ── Footer ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        marginTop: 64, color: T.subtext, fontSize: 13, fontWeight: 500,
      }}>
        <span style={{ color: '#F5C800', fontSize: 11 }}>◆</span>
        <span>Static LABS — built local, built fast · auto-refresh every 10s · ⌘K to search</span>
      </div>

      {/* ── Modals ── */}
      {showAssignModal && selectedProject && (
        <AssignPortModal
          project={selectedProject}
          apiBase={API_BASE}
          onClose={() => { setShowAssignModal(false); setSelectedProject(null); }}
          onSuccess={() => { setShowAssignModal(false); setSelectedProject(null); refetch(); }}
        />
      )}

      {showAddProject && (
        <AddProjectModal
          apiBase={API_BASE}
          onClose={() => setShowAddProject(false)}
          onSuccess={() => { setShowAddProject(false); refetch(); }}
        />
      )}

      {editProject && (
        <EditProjectModal
          project={editProject}
          apiBase={API_BASE}
          onClose={() => setEditProject(null)}
          onSuccess={() => { setEditProject(null); refetch(); }}
        />
      )}

      {/* ── Cmd+K palette ── */}
      {paletteOpen && data && (
        <CommandPalette
          projects={data.projects}
          theme={T}
          onClose={() => setPaletteOpen(false)}
          onPick={(p) => { setPaletteOpen(false); setPanelProjectId(p.id); }}
        />
      )}

      {/* ── Project detail panel (logs / scripts / notes / deploy) ── */}
      {panelProject && (
        <ProjectPanel
          project={panelProject}
          apiBase={API_BASE}
          theme={T}
          onClose={() => setPanelProjectId(null)}
          onRefresh={refetch}
        />
      )}
    </div>
  );
}

/* ── Button styles ── */
const btnBase: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '9px 18px', border: 'none', borderRadius: 999,
  fontFamily: "'Barlow', Arial, Helvetica, sans-serif",
  fontWeight: 700, fontSize: 14, letterSpacing: '0.324px',
  whiteSpace: 'nowrap', cursor: 'pointer',
  transition: 'background 180ms ease',
  boxShadow: 'rgba(0,0,0,0.08) 0px 5px 9px 0px',
};

const btnYellow: React.CSSProperties = { ...btnBase, background: '#F5C800', color: '#000000' };
const btnBlue:   React.CSSProperties = { ...btnBase, background: '#4A90B8', color: '#ffffff' };

const btnOutlineDark: React.CSSProperties = {
  ...btnBase, boxShadow: 'none',
  border: '2px solid rgba(0,0,0,0.35)',
  background: 'rgba(255,255,255,0.5)', color: '#1f1f1f',
  padding: '8px 17px',
};

const btnOutlineBlue: React.CSSProperties = {
  ...btnBase, boxShadow: 'none',
  border: '2px solid #4A90B8',
  background: 'rgba(255,255,255,0.5)', color: '#0068bd',
  padding: '8px 17px',
};

export default App;
