import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { IsometricBuilding } from './IsometricBuilding';
import { HealthSparkline } from './HealthSparkline';
import type { Theme } from '../theme';

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

interface ProjectGridProps {
  projects: Project[];
  theme: Theme;
  onAssignPort: (project: Project) => void;
  onEdit: (project: Project) => void;
  onSelect: (project: Project) => void;
  onRefresh: () => void;
}

const STACK_COLORS: Record<string, string> = {
  node:   '#4A90B8',
  python: '#F5C800',
  golang: '#1eaedb',
  rust:   '#C4A000',
  static: '#9aa7b5',
  skill:  '#2E6A8E',
  dotnet: '#7B4FD8',
  java:   '#E05A2B',
  other:  '#6b6b6b',
  mixed:  '#6b6b6b',
};

const STATUS_META: Record<string, { color: string; anim: string; label: string }> = {
  running:   { color: '#1eaedb', anim: 'st-pulse 2s ease infinite',       label: 'lights on' },
  unhealthy: { color: '#c81b3a', anim: 'st-pulse-red 0.9s ease infinite', label: 'alarm — unhealthy' },
  slow:      { color: '#C4A000', anim: 'st-pulse-amber 3s ease infinite', label: 'flickering — slow' },
  stalled:   { color: '#c81b3a', anim: 'none',                            label: 'crashed — keep-alive gave up, hit Start to retry' },
  idle:      { color: '#6b6b6b', anim: 'none',                            label: 'lights off' },
};

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001';

function Uptime({ startedAt }: { startedAt: number }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 30000);
    return () => clearInterval(t);
  }, []);
  const secs = Math.floor((Date.now() - startedAt) / 1000);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const label = h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m` : '<1m';
  return <>↑ {label}</>;
}

// Live scaled-down iframe of the running project — the actual UI as the card thumbnail.
function LiveThumbnail({ url, name, theme: T }: { url: string; name: string; theme: Theme }) {
  const SCALE = 0.25;
  return (
    <div style={{
      width: 132, height: 138, flexShrink: 0,
      borderRadius: 12, overflow: 'hidden', position: 'relative',
      border: `1px solid ${T.divider}`,
      background: '#ffffff',
    }}>
      <iframe
        src={url}
        title={`${name} preview`}
        tabIndex={-1}
        sandbox="allow-scripts allow-same-origin"
        style={{
          width: 132 / SCALE, height: 138 / SCALE, border: 'none',
          transform: `scale(${SCALE})`, transformOrigin: '0 0',
          pointerEvents: 'none',
        }}
      />
      <div style={{
        position: 'absolute', right: 5, bottom: 5,
        padding: '1px 7px', borderRadius: 999,
        background: 'rgba(0,0,0,0.65)', color: '#7ee3ff',
        fontSize: 9.5, fontWeight: 700, letterSpacing: '0.5px',
      }}>LIVE</div>
    </div>
  );
}

function ProjectCard({ project, theme: T, onAssignPort, onEdit, onSelect, onRefresh }: {
  project: Project;
  theme: Theme;
  onAssignPort: (p: Project) => void;
  onEdit: (p: Project) => void;
  onSelect: (p: Project) => void;
  onRefresh: () => void;
}) {
  const [loading, setLoading] = useState<string | null>(null);
  const [hovered, setHovered] = useState(false);
  const [startMessage, setStartMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);

  const sm = STATUS_META[project.status] || STATUS_META.idle;
  const sc = STACK_COLORS[project.techStack] || STACK_COLORS.other;
  // Trust the real port scan, not just the DB status
  const running = project.status === 'running' || !!project.isRunning || !!project.portLive;

  const handleStart = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setLoading('start');
    setStartMessage(null);
    try {
      const res = await axios.post(`${API_BASE}/api/projects/${project.id}/open`);
      const d = res.data.data;
      if (d.warning) {
        setStartMessage({ kind: 'info', text: d.warning });
      }
      onRefresh();
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Could not start — is the port-manager running?';
      setStartMessage({ kind: 'error', text: msg });
    }
    finally { setLoading(null); }
  };

  const handleStop = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setLoading('stop');
    try {
      await axios.post(`${API_BASE}/api/projects/${project.id}/stop`);
      onRefresh();
    } catch (e) { console.error(e); }
    finally { setLoading(null); }
  };

  const handleGoLive = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setLoading('golive');
    setStartMessage(null);
    try {
      await axios.post(`${API_BASE}/api/projects/${project.id}/go-live`);
      setStartMessage({ kind: 'info', text: 'Building & deploying — click the card and watch the Scripts tab. When it flips to LIVE it will auto-restart on crash and come back after reboot.' });
      onRefresh();
    } catch (err: any) {
      setStartMessage({ kind: 'error', text: err.response?.data?.error || 'Could not start the live deploy.' });
    }
    finally { setLoading(null); }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Remove ${project.name} from Static LABS?`)) return;
    try {
      await axios.delete(`${API_BASE}/api/projects/${project.id}`);
      onRefresh();
    } catch (e) { console.error(e); }
  };

  const openHref = project.openUrl || (project.assignedPort ? `http://localhost:${project.assignedPort}` : null);

  const chip: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '2px 9px', borderRadius: 999,
    fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap',
    fontVariantNumeric: 'tabular-nums',
  };

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onSelect(project)}
      style={{
        background: T.cardBg,
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
        border: hovered ? `1px solid ${T.cardBorderHover}` : `1px solid ${T.cardBorder}`,
        borderRadius: 19,
        padding: '18px 22px 20px',
        boxShadow: hovered
          ? `0 0 0 2px ${T.cardGlow}, rgba(0,0,0,0.08) 0px 5px 9px 0px`
          : 'rgba(0,0,0,0.06) 0px 5px 9px 0px',
        transform: hovered ? 'scale(1.015)' : 'scale(1)',
        transition: 'box-shadow 200ms ease, transform 200ms ease, border-color 200ms ease',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Top: live thumbnail (running) or building + info */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        {running && openHref
          ? <LiveThumbnail url={openHref} name={project.name} theme={T} />
          : <IsometricBuilding stack={project.techStack} status={project.status} />}

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Name row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 10, height: 10, flexShrink: 0, borderRadius: '50%',
              background: sm.color,
              ...(sm.anim !== 'none' ? { animation: sm.anim } : {}),
            }} />
            <div style={{
              fontWeight: 600, fontSize: 18, color: T.text,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {project.name}
            </div>
          </div>

          {/* Stack badge + status label */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
            <span style={{
              padding: '2px 10px', borderRadius: 999,
              fontSize: 12, fontWeight: 500,
              color: project.techStack === 'python' ? '#000000' : '#ffffff',
              background: sc,
            }}>
              {project.techStack || 'other'}
            </span>
            <span style={{ fontSize: 13, fontWeight: 500, color: T.subtext }}>
              {sm.label}
            </span>
          </div>

          {/* Uptime / response time / conflict / live chips */}
          {(project.startedAt || (running && project.lastResponseTime != null) || project.portConflict || (project.deployMode === 'live' && running)) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {project.startedAt && (
                <span style={{ ...chip, background: 'rgba(30,174,219,0.13)', color: '#1eaedb' }}>
                  <Uptime startedAt={project.startedAt} />
                </span>
              )}
              {running && project.lastResponseTime != null && (
                <span style={{
                  ...chip,
                  background: project.lastResponseTime > 3000 ? 'rgba(196,160,0,0.15)' : (T.dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)'),
                  color: project.lastResponseTime > 3000 ? '#C4A000' : T.subtext,
                }}>
                  {project.lastResponseTime}ms
                </span>
              )}
              {project.deployMode === 'live' && running && (
                <span style={{ ...chip, background: 'rgba(245,200,0,0.16)', color: '#8a7300', border: '1px solid rgba(245,200,0,0.5)' }}>
                  ◆ LIVE deploy
                </span>
              )}
              {project.portConflict && (
                <span
                  title={`Another process is already listening on port ${project.assignedPort} — this project won't start until it's freed.`}
                  style={{ ...chip, background: 'rgba(200,27,58,0.12)', color: '#c81b3a' }}
                >
                  ⚠ port in use
                </span>
              )}
            </div>
          )}

          {/* Port number */}
          <div style={{
            marginTop: 10,
            fontWeight: 300, fontSize: 32, lineHeight: 1,
            letterSpacing: '0.1px', color: T.accentText,
            fontVariantNumeric: 'tabular-nums',
          }}>
            {project.assignedPort ? `:${project.assignedPort}` : 'no port'}
          </div>
        </div>
      </div>

      {/* Path */}
      {project.folderPath && (
        <div style={{
          marginTop: 10, paddingTop: 12,
          borderTop: `1px solid ${T.divider}`,
          fontSize: 12.5, color: T.subtext,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {project.folderPath}
        </div>
      )}

      {/* Health sparkline */}
      {project.sparkline && project.sparkline.length > 0 && (
        <HealthSparkline data={project.sparkline} />
      )}

      {/* Start feedback — why did it fail / what is it doing */}
      {startMessage && (
        <div style={{
          marginTop: 10, padding: '8px 12px', borderRadius: 10,
          fontSize: 12.5, lineHeight: 1.45,
          background: startMessage.kind === 'error' ? 'rgba(200,27,58,0.09)' : 'rgba(196,160,0,0.10)',
          border: `1px solid ${startMessage.kind === 'error' ? 'rgba(200,27,58,0.35)' : 'rgba(196,160,0,0.35)'}`,
          color: startMessage.kind === 'error' ? '#c81b3a' : '#8a7300',
        }}>
          {startMessage.text}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 }}>
        {project.folderPath && project.canStart === false && !running && (
          <span style={{ fontSize: 12.5, color: T.subtext, fontStyle: 'italic' }}>
            nothing to serve here
          </span>
        )}
        {project.folderPath && project.canStart !== false && (
          running ? (
            <button
              onClick={handleStop}
              disabled={!!loading}
              style={{
                flexShrink: 0, padding: '8px 16px',
                border: '2px solid #c81b3a', borderRadius: 999,
                background: 'transparent', color: '#c81b3a',
                fontFamily: 'inherit', fontWeight: 700, fontSize: 13,
                letterSpacing: '0.324px', whiteSpace: 'nowrap',
                cursor: 'pointer', opacity: loading ? 0.5 : 1,
              }}
            >
              {loading === 'stop' ? '…' : '■ Stop'}
            </button>
          ) : (
            <button
              onClick={handleStart}
              disabled={!!loading}
              style={{
                flexShrink: 0, padding: '10px 18px',
                border: 'none', borderRadius: 999,
                background: '#4A90B8', color: '#ffffff',
                fontFamily: 'inherit', fontWeight: 700, fontSize: 13,
                letterSpacing: '0.324px', whiteSpace: 'nowrap',
                cursor: 'pointer', transition: 'background 180ms ease',
                opacity: loading ? 0.5 : 1,
              }}
            >
              {loading === 'start' ? 'Starting…' : '▶ Start'}
            </button>
          )
        )}

        {project.folderPath && project.canStart !== false && !(project.deployMode === 'live' && running) && (
          <button
            onClick={handleGoLive}
            disabled={!!loading}
            title="Build this project and deploy it as a permanent local app — keeps running, restarts on crash, comes back after reboot"
            style={{
              flexShrink: 0, padding: '8px 16px',
              border: '2px solid #C4A000', borderRadius: 999,
              background: 'transparent', color: '#8a7300',
              fontFamily: 'inherit', fontWeight: 700, fontSize: 13,
              letterSpacing: '0.324px', whiteSpace: 'nowrap',
              cursor: 'pointer', opacity: loading ? 0.5 : 1,
            }}
          >
            {loading === 'golive' ? 'Deploying…' : '◆ Go live'}
          </button>
        )}

        {openHref && running && (
          <a
            href={openHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            style={{
              flexShrink: 0, padding: '8px 16px',
              border: `2px solid ${T.dark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'}`, borderRadius: 999,
              background: 'transparent', color: T.text,
              fontFamily: 'inherit', fontWeight: 700, fontSize: 13,
              letterSpacing: '0.324px', whiteSpace: 'nowrap',
              cursor: 'pointer', textDecoration: 'none',
              display: 'inline-flex', alignItems: 'center',
            }}
          >
            Open
          </a>
        )}

        <div style={{ flex: 1 }} />

        <button
          onClick={(e) => { e.stopPropagation(); onEdit(project); }}
          title="Edit"
          style={iconBtn(T)}
          onMouseEnter={e => Object.assign((e.currentTarget as HTMLElement).style, iconBtnHover(T))}
          onMouseLeave={e => Object.assign((e.currentTarget as HTMLElement).style, iconBtn(T))}
        >✎</button>

        <button
          onClick={(e) => { e.stopPropagation(); onAssignPort(project); }}
          title="Assign port"
          style={iconBtn(T)}
          onMouseEnter={e => Object.assign((e.currentTarget as HTMLElement).style, iconBtnHover(T))}
          onMouseLeave={e => Object.assign((e.currentTarget as HTMLElement).style, iconBtn(T))}
        >⚙</button>

        <button
          onClick={handleDelete}
          title="Remove"
          style={iconBtn(T)}
          onMouseEnter={e => Object.assign((e.currentTarget as HTMLElement).style, { background: 'rgba(200,27,58,0.15)', color: '#c81b3a' })}
          onMouseLeave={e => Object.assign((e.currentTarget as HTMLElement).style, iconBtn(T))}
        >🗑</button>
      </div>
    </div>
  );
}

const iconBtn = (T: Theme): React.CSSProperties => ({
  width: 34, height: 34, border: 'none', borderRadius: 999,
  background: T.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)', color: T.subtext,
  fontFamily: 'inherit', fontSize: 14, cursor: 'pointer',
  transition: 'color 180ms ease, background 180ms ease',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
});

const iconBtnHover = (T: Theme): React.CSSProperties => ({
  ...iconBtn(T),
  background: T.dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)',
  color: T.heading,
});

function ProjectGrid({ projects, theme, onAssignPort, onEdit, onSelect, onRefresh }: ProjectGridProps) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
      gap: 20,
      padding: '4px 32px',
    }}>
      {projects.map(project => (
        <ProjectCard
          key={project.id}
          project={project}
          theme={theme}
          onAssignPort={onAssignPort}
          onEdit={onEdit}
          onSelect={onSelect}
          onRefresh={onRefresh}
        />
      ))}
    </div>
  );
}

export default ProjectGrid;
