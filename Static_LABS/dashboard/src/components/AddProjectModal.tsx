import { useState } from 'react';
import axios from 'axios';

interface AddProjectModalProps {
  apiBase: string;
  onClose: () => void;
  onSuccess: () => void;
}

interface RegisterResult {
  id: string;
  name: string;
  techStack: string;
  assignedPort: number | null;
  folderPath: string;
}

function AddProjectModal({ apiBase, onClose, onSuccess }: AddProjectModalProps) {
  const [folderPath, setFolderPath] = useState('');
  const [preferredName, setPreferredName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RegisterResult | null>(null);

  const handleRegister = async () => {
    setError(null);
    if (!folderPath.trim()) { setError('Paste a folder path.'); return; }
    setIsLoading(true);
    try {
      const res = await axios.post(`${apiBase}/api/projects/register-folder`, {
        folderPath: folderPath.trim(),
        preferredName: preferredName.trim() || undefined,
      });
      setResult(res.data.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to register project.');
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
          background: 'rgba(255,255,255,0.88)',
          backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.9)',
          borderRadius: 24, padding: 32,
          boxShadow: 'rgba(0,0,0,0.16) 0px 5px 9px 0px',
          animation: 'st-card-in 200ms ease-out',
          fontFamily: "'Barlow', Arial, Helvetica, sans-serif",
        }}
      >
        {!result ? (
          <>
            <h5 style={{ margin: '0 0 4px', fontWeight: 300, fontSize: 22, lineHeight: 1.25, color: '#000000' }}>
              Add a project
            </h5>
            <p style={{ margin: '0 0 24px', fontSize: 14, lineHeight: 1.5, color: '#6b6b6b' }}>
              Drop a folder path — stack detection and port assignment are automatic.
            </p>

            {error && (
              <div style={{ marginBottom: 16, fontSize: 13, fontWeight: 500, color: '#c81b3a' }}>
                {error}
              </div>
            )}

            <label style={labelStyle}>Project name <span style={{ fontWeight: 400, color: '#9e9e9e' }}>(optional)</span></label>
            <input
              value={preferredName}
              onChange={e => setPreferredName(e.target.value)}
              placeholder="auto-generated from folder name"
              style={inputStyle}
              onFocus={e => Object.assign(e.currentTarget.style, inputFocusStyle)}
              onBlur={e => Object.assign(e.currentTarget.style, inputStyle)}
            />

            <label style={labelStyle}>Folder path</label>
            <input
              value={folderPath}
              onChange={e => setFolderPath(e.target.value)}
              onPaste={e => { const v = e.clipboardData.getData('text').trim(); setFolderPath(v); e.preventDefault(); }}
              placeholder={String.raw`C:\Users\malco\Documents\my-project`}
              style={{ ...inputStyle, fontFamily: 'monospace', marginBottom: 24 }}
              onFocus={e => Object.assign(e.currentTarget.style, { ...inputFocusStyle, fontFamily: 'monospace' })}
              onBlur={e => Object.assign(e.currentTarget.style, { ...inputStyle, fontFamily: 'monospace' })}
              autoFocus
            />

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={btnCancel}>Cancel</button>
              <button
                onClick={handleRegister}
                disabled={isLoading || !folderPath.trim()}
                style={{ ...btnPrimary, opacity: (isLoading || !folderPath.trim()) ? 0.5 : 1 }}
              >
                {isLoading ? 'Registering…' : 'Register project'}
              </button>
            </div>
          </>
        ) : (
          <>
            <h5 style={{ margin: '0 0 4px', fontWeight: 300, fontSize: 22, lineHeight: 1.25, color: '#000000' }}>
              Building registered ◆
            </h5>
            <p style={{ margin: '0 0 24px', fontSize: 14, lineHeight: 1.5, color: '#6b6b6b' }}>
              {result.name} is on the block.
            </p>

            <div style={{
              background: 'rgba(0,0,0,0.04)', borderRadius: 12,
              padding: '16px 20px', marginBottom: 24,
              display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              {[
                ['Name',  result.name],
                ['Stack', result.techStack],
                ['Port',  result.assignedPort ? `:${result.assignedPort}` : 'none'],
                ['Manifest', 'static.project.json ✓'],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                  <span style={{ color: '#6b6b6b' }}>{k}</span>
                  <span style={{ fontWeight: 600, color: k === 'Port' ? '#0068bd' : '#1f1f1f' }}>{v}</span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={onSuccess} style={btnPrimary}>Done</button>
            </div>
          </>
        )}
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

export default AddProjectModal;
