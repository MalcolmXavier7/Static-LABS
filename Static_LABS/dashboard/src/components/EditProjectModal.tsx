import { useState } from 'react';
import axios from 'axios';

interface Project {
  id: string;
  name: string;
  assignedPort: number | null;
  techStack: string;
  iconUrl: string;
  folderPath: string;
  openUrl: string;
  status: string;
  healthCheckUrl: string;
}

interface EditProjectModalProps {
  project: Project;
  apiBase: string;
  onClose: () => void;
  onSuccess: () => void;
}

const STACKS = ['node', 'python', 'golang', 'rust', 'static', 'skill', 'dotnet', 'java', 'mixed', 'other'];

function EditProjectModal({ project, apiBase, onClose, onSuccess }: EditProjectModalProps) {
  const [name, setName] = useState(project.name);
  const [techStack, setTechStack] = useState(project.techStack || 'other');
  const [folderPath, setFolderPath] = useState(project.folderPath || '');
  const [openUrl, setOpenUrl] = useState(project.openUrl || '');
  const [healthCheckUrl, setHealthCheckUrl] = useState(project.healthCheckUrl || '');
  const [iconUrl] = useState(project.iconUrl || '');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setError(null);
    if (!name.trim()) { setError('A project name is required.'); return; }
    setIsLoading(true);
    try {
      await axios.patch(`${apiBase}/api/projects/${project.id}`, {
        name: name.trim(), techStack,
        folderPath: folderPath.trim(),
        openUrl: openUrl.trim(),
        healthCheckUrl: healthCheckUrl.trim(),
        iconUrl: iconUrl.trim(),
      });
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update project.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(31,31,31,0.25)',
        backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
        display: 'grid', placeItems: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 460, maxWidth: 'calc(100vw - 48px)',
          maxHeight: '90vh', overflowY: 'auto',
          background: 'rgba(255,255,255,0.88)',
          backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.9)',
          borderRadius: 24, padding: 32,
          boxShadow: 'rgba(0,0,0,0.16) 0px 5px 9px 0px',
          animation: 'st-card-in 200ms ease-out',
          fontFamily: "'Barlow', Arial, Helvetica, sans-serif",
        }}
      >
        <h5 style={{ margin: '0 0 4px', fontWeight: 300, fontSize: 22, lineHeight: 1.25, color: '#000000' }}>
          Edit project
        </h5>
        <p style={{ margin: '0 0 24px', fontSize: 14, lineHeight: 1.5, color: '#6b6b6b' }}>
          Changes are written back to static.project.json.
        </p>

        {error && (
          <div style={{ marginBottom: 16, fontSize: 13, fontWeight: 500, color: '#c81b3a' }}>
            {error}
          </div>
        )}

        <label style={labelStyle}>Project name</label>
        <input
          value={name}
          onChange={e => { setName(e.target.value); setError(null); }}
          placeholder="my-project"
          style={inputStyle}
          onFocus={e => Object.assign(e.currentTarget.style, inputFocusStyle)}
          onBlur={e => Object.assign(e.currentTarget.style, inputStyle)}
        />

        <label style={labelStyle}>Stack</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {STACKS.map(k => (
            <button
              key={k}
              onClick={() => setTechStack(k)}
              style={{
                padding: '5px 14px', borderRadius: 999,
                fontFamily: 'inherit', fontSize: 13, fontWeight: 500,
                whiteSpace: 'nowrap', cursor: 'pointer',
                transition: 'border-color 180ms ease',
                ...(techStack === k
                  ? { border: '2px solid #4A90B8', background: 'rgba(74,144,184,0.12)', color: '#0068bd' }
                  : { border: '2px solid rgba(0,0,0,0.15)', background: 'transparent', color: '#6b6b6b' }
                ),
              }}
            >
              {k}
            </button>
          ))}
        </div>

        <label style={labelStyle}>Folder path</label>
        <input
          value={folderPath}
          onChange={e => setFolderPath(e.target.value)}
          placeholder={String.raw`C:\Users\malco\Documents\my-project`}
          style={{ ...inputStyle, fontFamily: 'monospace' }}
          onFocus={e => Object.assign(e.currentTarget.style, { ...inputFocusStyle, fontFamily: 'monospace' })}
          onBlur={e => Object.assign(e.currentTarget.style, { ...inputStyle, fontFamily: 'monospace' })}
        />

        <label style={labelStyle}>Open URL <span style={{ fontWeight: 400, color: '#9e9e9e' }}>(overrides port for Open button)</span></label>
        <input
          value={openUrl}
          onChange={e => setOpenUrl(e.target.value)}
          placeholder="http://localhost:3000"
          style={{ ...inputStyle, fontFamily: 'monospace' }}
          onFocus={e => Object.assign(e.currentTarget.style, { ...inputFocusStyle, fontFamily: 'monospace' })}
          onBlur={e => Object.assign(e.currentTarget.style, { ...inputStyle, fontFamily: 'monospace' })}
        />

        <label style={labelStyle}>Health check URL</label>
        <input
          value={healthCheckUrl}
          onChange={e => setHealthCheckUrl(e.target.value)}
          placeholder="http://localhost:3100/health"
          style={{ ...inputStyle, fontFamily: 'monospace' }}
          onFocus={e => Object.assign(e.currentTarget.style, { ...inputFocusStyle, fontFamily: 'monospace' })}
          onBlur={e => Object.assign(e.currentTarget.style, { ...inputStyle, fontFamily: 'monospace' })}
        />

        {/* Read-only info */}
        <div style={{
          background: 'rgba(0,0,0,0.04)', borderRadius: 12,
          padding: '12px 16px', marginBottom: 24,
          display: 'flex', flexDirection: 'column', gap: 6,
          fontSize: 12, color: '#6b6b6b',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Port</span>
            <span style={{ fontFamily: 'monospace', color: '#0068bd', fontWeight: 700 }}>
              {project.assignedPort ? `:${project.assignedPort}` : 'none'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Status</span>
            <span style={{ fontWeight: 600 }}>{project.status}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>ID</span>
            <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{project.id}</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={btnCancel}>Cancel</button>
          <button
            onClick={handleSave}
            disabled={isLoading || !name.trim()}
            style={{ ...btnPrimary, opacity: (isLoading || !name.trim()) ? 0.5 : 1 }}
          >
            {isLoading ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 500,
  letterSpacing: '0.4px', color: '#6b6b6b', marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  padding: '10px 14px', marginBottom: 16,
  border: '1px solid #cccccc', borderRadius: 6,
  background: '#ffffff', color: '#1f1f1f',
  fontFamily: "'Barlow', Arial, Helvetica, sans-serif",
  fontSize: 15, outline: 'none',
};

const inputFocusStyle: React.CSSProperties = {
  ...inputStyle,
  borderColor: '#4A90B8',
  boxShadow: '0 0 0 2px rgba(74,144,184,0.25)',
};

const btnCancel: React.CSSProperties = {
  padding: '9px 20px', border: '2px solid rgba(0,0,0,0.3)', borderRadius: 999,
  background: 'transparent', color: '#1f1f1f',
  fontFamily: "'Barlow', Arial, Helvetica, sans-serif",
  fontWeight: 700, fontSize: 14, letterSpacing: '0.324px',
  whiteSpace: 'nowrap', cursor: 'pointer',
};

const btnPrimary: React.CSSProperties = {
  padding: '9px 20px', border: 'none', borderRadius: 999,
  background: '#F5C800', color: '#000000',
  fontFamily: "'Barlow', Arial, Helvetica, sans-serif",
  fontWeight: 700, fontSize: 14, letterSpacing: '0.324px',
  whiteSpace: 'nowrap', cursor: 'pointer',
  transition: 'background 180ms ease',
};

import React from 'react';

export default EditProjectModal;
