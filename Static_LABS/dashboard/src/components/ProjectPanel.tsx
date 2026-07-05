import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import type { Theme } from '../theme';

interface Project {
  id: string;
  name: string;
  assignedPort: number | null;
  techStack: string;
  folderPath: string;
  status: string;
  isRunning?: boolean;
  startedAt?: number | null;
  lastResponseTime?: number | null;
}

interface Props {
  project: Project;
  apiBase: string;
  theme: Theme;
  onClose: () => void;
  onRefresh: () => void;
}

type Tab = 'logs' | 'scripts' | 'notes';

function formatUptime(startedAt: number): string {
  const secs = Math.floor((Date.now() - startedAt) / 1000);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return '<1m';
}

export default function ProjectPanel({ project, apiBase, theme: T, onClose, onRefresh }: Props) {
  const [tab, setTab] = useState<Tab>('logs');
  const [logs, setLogs] = useState<string[]>([]);
  const [scriptState, setScriptState] = useState<{ script: string | null; logs: string[]; running: boolean; exitCode: number | null }>({
    script: null, logs: [], running: false, exitCode: null,
  });
  const [notes, setNotes] = useState('');
  const [notesDirty, setNotesDirty] = useState(false);
  const [notesSaving, setNotesSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const scriptEndRef = useRef<HTMLDivElement>(null);

  // Live process logs — poll every 2s while the panel is open
  useEffect(() => {
    let alive = true;
    const fetchLogs = async () => {
      try {
        const res = await axios.get(`${apiBase}/api/projects/${project.id}/logs`);
        if (alive) setLogs(res.data.data.logs || []);
      } catch { /* server unreachable — keep last logs */ }
    };
    fetchLogs();
    const t = setInterval(fetchLogs, 2000);
    return () => { alive = false; clearInterval(t); };
  }, [project.id, apiBase]);

  // Script run output — poll every 2s
  useEffect(() => {
    let alive = true;
    const fetchScript = async () => {
      try {
        const res = await axios.get(`${apiBase}/api/projects/${project.id}/script-logs`);
        if (alive) setScriptState(res.data.data);
      } catch { /* ignore */ }
    };
    fetchScript();
    const t = setInterval(fetchScript, 2000);
    return () => { alive = false; clearInterval(t); };
  }, [project.id, apiBase]);

  // Notes — load once per project
  useEffect(() => {
    let alive = true;
    axios.get(`${apiBase}/api/projects/${project.id}/notes`)
      .then(res => { if (alive) { setNotes(res.data.data.notes || ''); setNotesDirty(false); } })
      .catch(() => {});
    return () => { alive = false; };
  }, [project.id, apiBase]);

  useEffect(() => { logEndRef.current?.scrollIntoView({ block: 'end' }); }, [logs, tab]);
  useEffect(() => { scriptEndRef.current?.scrollIntoView({ block: 'end' }); }, [scriptState.logs, tab]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const runScript = async (script: string) => {
    setActionError(null);
    try {
      await axios.post(`${apiBase}/api/projects/${project.id}/run-script`, { script });
      if (script === 'dev') onRefresh();
    } catch (e: any) {
      setActionError(e.response?.data?.error || `Failed to run ${script}`);
    }
  };

  const deploy = async (target: 'vercel' | 'netlify') => {
    setActionError(null);
    try {
      await axios.post(`${apiBase}/api/projects/${project.id}/deploy`, { target });
    } catch (e: any) {
      setActionError(e.response?.data?.error || `Failed to deploy to ${target}`);
    }
  };

  const saveNotes = async () => {
    setNotesSaving(true);
    setActionError(null);
    try {
      await axios.put(`${apiBase}/api/projects/${project.id}/notes`, { notes });
      setNotesDirty(false);
    } catch (e: any) {
      setActionError(e.response?.data?.error || 'Failed to save notes');
    } finally {
      setNotesSaving(false);
    }
  };

  const tabBtn = (key: Tab): React.CSSProperties => ({
    padding: '7px 16px', borderRadius: 999, cursor: 'pointer',
    fontFamily: 'inherit', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
    ...(tab === key
      ? { border: `2px solid ${T.accent}`, background: T.dark ? 'rgba(31,78,216,0.18)' : 'rgba(74,144,184,0.12)', color: T.accentText }
      : { border: `2px solid ${T.divider}`, background: 'transparent', color: T.subtext }),
  });

  const logBox: React.CSSProperties = {
    flex: 1, overflowY: 'auto', borderRadius: 12,
    background: T.logBg, border: `1px solid ${T.dark ? '#1E2D45' : 'rgba(0,0,0,0.4)'}`,
    padding: '12px 14px',
    fontFamily: "'Cascadia Code', 'Consolas', monospace",
    fontSize: 12, lineHeight: 1.55, color: '#c9d6e8',
    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
  };

  const scriptButton: React.CSSProperties = {
    padding: '8px 16px', border: `2px solid ${T.accent}`, borderRadius: 999,
    background: 'transparent', color: T.accentText,
    fontFamily: 'inherit', fontWeight: 700, fontSize: 13, cursor: 'pointer',
  };

  const running = project.isRunning || project.status === 'running';

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.35)' }} />
      <div
        className="panel-in"
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 70,
          width: 500, maxWidth: '92vw',
          background: T.panelBg,
          backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          borderLeft: `1px solid ${T.border}`,
          boxShadow: '-16px 0 48px rgba(0,0,0,0.3)',
          display: 'flex', flexDirection: 'column',
          fontFamily: "'Barlow', Arial, Helvetica, sans-serif",
        }}
      >
        {/* Header */}
        <div style={{ padding: '20px 24px 14px', borderBottom: `1px solid ${T.divider}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              width: 10, height: 10, borderRadius: '50%',
              background: running ? '#1eaedb' : T.subtext,
              ...(running ? { animation: 'st-pulse 2s ease infinite' } : {}),
            }} />
            <div style={{ flex: 1, fontWeight: 600, fontSize: 20, color: T.heading, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {project.name}
            </div>
            <button
              onClick={onClose}
              style={{
                width: 32, height: 32, border: 'none', borderRadius: 999, cursor: 'pointer',
                background: T.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)', color: T.subtext, fontSize: 14,
              }}
            >✕</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, fontSize: 13, color: T.subtext }}>
            <span style={{ fontWeight: 700, color: T.accentText, fontVariantNumeric: 'tabular-nums' }}>
              {project.assignedPort ? `:${project.assignedPort}` : 'no port'}
            </span>
            <span>{project.techStack || 'other'}</span>
            {project.startedAt && <span style={{ color: '#1eaedb', fontWeight: 600 }}>↑ {formatUptime(project.startedAt)}</span>}
            {running && project.lastResponseTime != null && <span>{project.lastResponseTime}ms</span>}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, padding: '14px 24px 0' }}>
          <button style={tabBtn('logs')} onClick={() => setTab('logs')}>Logs</button>
          <button style={tabBtn('scripts')} onClick={() => setTab('scripts')}>Scripts</button>
          <button style={tabBtn('notes')} onClick={() => setTab('notes')}>Notes</button>
        </div>

        {actionError && (
          <div style={{
            margin: '12px 24px 0', padding: '10px 14px', borderRadius: 10, fontSize: 13,
            background: 'rgba(200,27,58,0.08)', border: '1px solid rgba(200,27,58,0.35)', color: '#c81b3a',
          }}>
            {actionError}
          </div>
        )}

        {/* Body */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '14px 24px 24px', minHeight: 0 }}>
          {tab === 'logs' && (
            <div style={logBox}>
              {logs.length === 0
                ? <span style={{ opacity: 0.55 }}>{running ? 'No output captured yet…' : 'Not running — start the project to see live output. The last 200 lines of stdout/stderr appear here.'}</span>
                : logs.map((line, i) => (
                    <div key={i} style={{ color: line.startsWith('[stderr]') ? '#ff9db0' : '#c9d6e8' }}>{line}</div>
                  ))}
              <div ref={logEndRef} />
            </div>
          )}

          {tab === 'scripts' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minHeight: 0 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {['dev', 'build', 'test'].map(s => (
                  <button key={s} style={scriptButton} onClick={() => runScript(s)} disabled={scriptState.running}>
                    ▶ {s}
                  </button>
                ))}
                <div style={{ flex: 1 }} />
                <button
                  style={{ ...scriptButton, border: 'none', background: '#000000', color: '#ffffff' }}
                  onClick={() => deploy('vercel')}
                  disabled={scriptState.running}
                >▲ Vercel</button>
                <button
                  style={{ ...scriptButton, border: 'none', background: '#0e8a8a', color: '#ffffff' }}
                  onClick={() => deploy('netlify')}
                  disabled={scriptState.running}
                >◆ Netlify</button>
              </div>

              <div style={{ fontSize: 12.5, color: T.subtext }}>
                {scriptState.running
                  ? <>Running <b style={{ color: T.accentText }}>{scriptState.script}</b>…</>
                  : scriptState.script
                    ? <>Last run: <b>{scriptState.script}</b> — exit code {scriptState.exitCode ?? '?'}</>
                    : 'Run a script from the manifest, or deploy straight from this card.'}
              </div>

              <div style={logBox}>
                {scriptState.logs.length === 0
                  ? <span style={{ opacity: 0.55 }}>Script output will appear here.</span>
                  : scriptState.logs.map((line, i) => (
                      <div key={i} style={{ color: line.startsWith('[stderr]') ? '#ff9db0' : '#c9d6e8' }}>{line}</div>
                    ))}
                <div ref={scriptEndRef} />
              </div>
            </div>
          )}

          {tab === 'notes' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minHeight: 0 }}>
              <textarea
                value={notes}
                onChange={e => { setNotes(e.target.value); setNotesDirty(true); }}
                placeholder="Scratchpad for this project — saved to static.project.json"
                style={{
                  flex: 1, resize: 'none', borderRadius: 12, padding: '14px 16px',
                  border: `1px solid ${T.divider}`, outline: 'none',
                  background: T.inputBg, color: T.text,
                  fontFamily: 'inherit', fontSize: 14, lineHeight: 1.6,
                }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 12, color: T.subtext }}>
                  {notesDirty ? 'Unsaved changes' : 'Saved to static.project.json'}
                </span>
                <div style={{ flex: 1 }} />
                <button
                  onClick={saveNotes}
                  disabled={!notesDirty || notesSaving}
                  style={{
                    padding: '9px 22px', border: 'none', borderRadius: 999,
                    background: notesDirty ? '#F5C800' : T.divider,
                    color: notesDirty ? '#000000' : T.subtext,
                    fontFamily: 'inherit', fontWeight: 700, fontSize: 13,
                    cursor: notesDirty ? 'pointer' : 'default',
                  }}
                >
                  {notesSaving ? 'Saving…' : 'Save notes'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
