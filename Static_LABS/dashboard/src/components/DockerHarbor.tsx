import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import type { Theme } from '../theme';

interface DockerContainer {
  name: string;
  image: string;
  state: string;
  status: string;
  ports: { host: number; container: number }[];
  openUrl: string | null;
}

interface DockerData {
  available: boolean;
  containers: DockerContainer[];
}

interface Props {
  apiBase: string;
  theme: Theme;
}

// Translate docker-speak into neighborhood-speak
function plainStatus(c: DockerContainer): string {
  if (c.state === 'running') return 'sailing — up and answering';
  if (c.state === 'exited') return 'docked — stopped';
  if (c.state === 'paused') return 'anchored — paused';
  if (c.state === 'restarting') return 'turning around — restarting';
  return c.state;
}

function ContainerCard({ container, apiBase, theme: T, onRefresh }: {
  container: DockerContainer;
  apiBase: string;
  theme: Theme;
  onRefresh: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = container.state === 'running';

  const act = async (action: 'start' | 'stop') => {
    setLoading(true);
    setError(null);
    try {
      await axios.post(`${apiBase}/api/docker/${container.name}/${action}`);
      onRefresh();
    } catch (e: any) {
      setError(e.response?.data?.error || `Could not ${action} the container`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      background: T.cardBg,
      backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
      border: `1px solid ${T.cardBorder}`,
      borderRadius: 19, padding: '16px 20px 18px',
      boxShadow: 'rgba(0,0,0,0.06) 0px 5px 9px 0px',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
          background: running ? '#1eaedb' : T.subtext,
          ...(running ? { animation: 'st-pulse 2s ease infinite' } : {}),
        }} />
        <span style={{ fontSize: 17 }}>🐳</span>
        <div style={{
          fontWeight: 600, fontSize: 16, color: T.text,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {container.name}
        </div>
      </div>

      <div style={{ fontSize: 12.5, color: T.subtext, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {container.image}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: running ? '#1eaedb' : T.subtext }}>
          {plainStatus(container)}
        </span>
        {container.ports.map(p => (
          <span key={p.host} style={{
            padding: '1px 8px', borderRadius: 999, fontSize: 11.5, fontWeight: 700,
            background: T.dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)',
            color: T.accentText, fontVariantNumeric: 'tabular-nums',
          }}>
            :{p.host}
          </span>
        ))}
      </div>

      {error && (
        <div style={{
          padding: '7px 11px', borderRadius: 9, fontSize: 12.5,
          background: 'rgba(200,27,58,0.09)', border: '1px solid rgba(200,27,58,0.35)', color: '#c81b3a',
        }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
        {running ? (
          <button
            onClick={() => act('stop')}
            disabled={loading}
            style={{
              padding: '7px 15px', border: '2px solid #c81b3a', borderRadius: 999,
              background: 'transparent', color: '#c81b3a',
              fontFamily: 'inherit', fontWeight: 700, fontSize: 12.5,
              cursor: 'pointer', opacity: loading ? 0.5 : 1,
            }}
          >
            {loading ? '…' : '■ Stop'}
          </button>
        ) : (
          <button
            onClick={() => act('start')}
            disabled={loading}
            style={{
              padding: '8px 16px', border: 'none', borderRadius: 999,
              background: '#4A90B8', color: '#ffffff',
              fontFamily: 'inherit', fontWeight: 700, fontSize: 12.5,
              cursor: 'pointer', opacity: loading ? 0.5 : 1,
            }}
          >
            {loading ? 'Starting…' : '▶ Start'}
          </button>
        )}

        {running && container.openUrl && (
          <a
            href={container.openUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: '7px 15px', borderRadius: 999,
              border: `2px solid ${T.dark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'}`,
              color: T.text, textDecoration: 'none',
              fontFamily: 'inherit', fontWeight: 700, fontSize: 12.5,
            }}
          >
            Open
          </a>
        )}
      </div>
    </div>
  );
}

export default function DockerHarbor({ apiBase, theme: T }: Props) {
  const { data, refetch } = useQuery<DockerData>({
    queryKey: ['docker'],
    queryFn: async () => (await axios.get(`${apiBase}/api/docker`)).data.data,
    refetchInterval: 15000,
  });

  if (!data) return null;

  const running = data.containers.filter(c => c.state === 'running').length;

  return (
    <div style={{ padding: '40px 32px 0' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '8px 16px', marginBottom: 16 }}>
        <h2 style={{
          margin: 0, fontWeight: 300, fontSize: 28, lineHeight: 1.25,
          color: T.heading, whiteSpace: 'nowrap',
        }}>
          The harbor
        </h2>
        <div style={{ fontSize: 14, fontWeight: 500, color: T.subtext }}>
          {data.available
            ? <>Docker containers — apps that ship with their own engine · {running} of {data.containers.length} sailing</>
            : 'Docker Desktop is off — start it to see your containers here'}
        </div>
      </div>

      {data.available && data.containers.length === 0 && (
        <div style={{
          padding: '32px', borderRadius: 19, textAlign: 'center',
          border: `1.5px dashed ${T.dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'}`,
          color: T.subtext, fontSize: 14,
        }}>
          No containers yet — projects that use Docker will show up here.
        </div>
      )}

      {data.available && data.containers.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))',
          gap: 16,
        }}>
          {data.containers.map(c => (
            <ContainerCard key={c.name} container={c} apiBase={apiBase} theme={T} onRefresh={refetch} />
          ))}
        </div>
      )}
    </div>
  );
}
