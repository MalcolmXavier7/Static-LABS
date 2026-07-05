import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Theme } from '../theme';

interface Project {
  id: string;
  name: string;
  assignedPort: number | null;
  techStack: string;
  status: string;
}

interface Props {
  projects: Project[];
  theme: Theme;
  onClose: () => void;
  onPick: (project: Project) => void;
}

export default function CommandPalette({ projects, theme: T, onClose, onPick }: Props) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects
      .filter(p => p.name.toLowerCase().includes(q) || String(p.assignedPort || '').includes(q))
      .sort((a, b) => a.name.toLowerCase().indexOf(q) - b.name.toLowerCase().indexOf(q));
  }, [projects, query]);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { setIndex(0); }, [query]);

  useEffect(() => {
    const el = listRef.current?.children[index] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setIndex(i => Math.min(i + 1, matches.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && matches[index]) { e.preventDefault(); onPick(matches[index]); }
  };

  const statusDot = (status: string) =>
    status === 'running' ? '#1eaedb' : status === 'unhealthy' ? '#c81b3a' : status === 'slow' ? '#C4A000' : T.subtext;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.45)',
        backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
        display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
        paddingTop: '14vh',
      }}
    >
      <div
        className="banner-in"
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKey}
        style={{
          width: 560, maxWidth: 'calc(100vw - 48px)',
          background: T.panelBg,
          border: `1px solid ${T.border}`,
          borderRadius: 16,
          boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: `1px solid ${T.divider}` }}>
          <span style={{ color: T.subtext, fontSize: 15 }}>⌕</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Jump to a project…"
            style={{
              flex: 1, border: 'none', outline: 'none', background: 'transparent',
              fontFamily: 'inherit', fontSize: 16, color: T.text,
            }}
          />
          <span style={{
            padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
            border: `1px solid ${T.divider}`, color: T.subtext,
          }}>esc</span>
        </div>

        <div ref={listRef} style={{ maxHeight: 340, overflowY: 'auto', padding: 6 }}>
          {matches.length === 0 && (
            <div style={{ padding: '24px 18px', textAlign: 'center', color: T.subtext, fontSize: 14 }}>
              No project matches "{query}"
            </div>
          )}
          {matches.map((p, i) => (
            <div
              key={p.id}
              onClick={() => onPick(p)}
              onMouseEnter={() => setIndex(i)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                background: i === index ? (T.dark ? 'rgba(31,78,216,0.18)' : 'rgba(74,144,184,0.12)') : 'transparent',
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: statusDot(p.status) }} />
              <span style={{
                flex: 1, fontSize: 15, fontWeight: 500, color: T.text,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {p.name}
              </span>
              <span style={{ fontSize: 12, color: T.subtext }}>{p.techStack || 'other'}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: T.accentText, fontVariantNumeric: 'tabular-nums' }}>
                {p.assignedPort ? `:${p.assignedPort}` : '—'}
              </span>
            </div>
          ))}
        </div>

        <div style={{
          display: 'flex', gap: 14, padding: '10px 18px',
          borderTop: `1px solid ${T.divider}`, fontSize: 11.5, color: T.subtext,
        }}>
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>{matches.length} of {projects.length} projects</span>
        </div>
      </div>
    </div>
  );
}
