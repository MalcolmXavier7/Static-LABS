interface SparkPoint {
  status: string;
  responseTime: number;
}

interface Props {
  data: SparkPoint[];
}

const STATUS_COLOR: Record<string, string> = {
  healthy:   '#1eaedb',
  running:   '#1eaedb',
  slow:      '#F5C800',
  unhealthy: '#c81b3a',
};

export function HealthSparkline({ data }: Props) {
  const W = 120;
  const H = 28;
  const BAR_GAP = 2;
  const SLOTS = 12;
  const barW = Math.floor((W - BAR_GAP * (SLOTS - 1)) / SLOTS);
  const maxTime = Math.max(...data.map(d => d.responseTime || 1), 1000);

  // Pad left with empty slots if fewer than SLOTS
  const padded: (SparkPoint | null)[] = [
    ...Array(Math.max(0, SLOTS - data.length)).fill(null),
    ...data.slice(-SLOTS),
  ];

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 10, fontWeight: 500, color: '#9e9e9e', letterSpacing: '0.3px' }}>
          HEALTH · LAST {data.length} CHECKS
        </span>
        {data.length > 0 && (
          <span style={{ fontSize: 10, fontWeight: 600, color: STATUS_COLOR[data[data.length - 1]?.status] || '#9e9e9e' }}>
            {data[data.length - 1]?.responseTime ?? 0}ms
          </span>
        )}
      </div>
      <svg width={W} height={H} style={{ display: 'block' }}>
        {padded.map((point, i) => {
          const x = i * (barW + BAR_GAP);
          if (!point) {
            return (
              <rect
                key={i}
                x={x} y={2} width={barW} height={H - 4}
                fill="rgba(0,0,0,0.06)" rx={2}
              />
            );
          }
          const ratio = Math.min((point.responseTime || 0) / maxTime, 1);
          const barH = Math.max(Math.round(ratio * (H - 4)), 3);
          const color = STATUS_COLOR[point.status] || '#9e9e9e';
          return (
            <rect
              key={i}
              x={x} y={H - barH - 2}
              width={barW} height={barH}
              fill={color} rx={2}
              opacity={0.85}
            />
          );
        })}
      </svg>
    </div>
  );
}
