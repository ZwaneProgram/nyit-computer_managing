export interface Series {
  name: string;
  color: string;
  data: number[];
  dashed?: boolean;
}

interface BarChartProps {
  labels: string[];
  series: Series[];
  height?: number;
  /** When true, render a legend below the chart. */
  legend?: boolean;
}

export function BarChart({ labels, series, height = 220, legend }: BarChartProps) {
  const max = Math.max(...series.flatMap((s) => s.data)) * 1.15 || 1;
  const groups = labels.length;
  const groupW = 100 / groups;
  const barW = (groupW * 0.7) / series.length;
  const gap = (groupW * 0.3) / 2;
  return (
    <div style={{ width: '100%' }}>
      <svg
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        width="100%"
        height={height}
        style={{ overflow: 'visible' }}
      >
        {[0.25, 0.5, 0.75, 1].map((p, i) => (
          <line
            key={i}
            x1="0"
            y1={height - height * p}
            x2="100"
            y2={height - height * p}
            stroke="var(--border)"
            strokeWidth="0.3"
          />
        ))}
        {labels.map((_, gi) =>
          series.map((s, si) => {
            const v = s.data[gi];
            const h = (v / max) * (height - 24);
            const x = gi * groupW + gap + si * barW;
            const y = height - 18 - h;
            return (
              <rect
                key={`${gi}-${si}`}
                x={x}
                y={y}
                width={barW * 0.92}
                height={Math.max(h, 1)}
                rx="0.6"
                fill={s.color}
              />
            );
          }),
        )}
        {labels.map((l, i) => (
          <text
            key={i}
            x={i * groupW + groupW / 2}
            y={height - 4}
            textAnchor="middle"
            fontSize="3.4"
            fill="var(--ink-3)"
            fontFamily="var(--font-ui)"
          >
            {l}
          </text>
        ))}
      </svg>
      {legend && (
        <div style={{ display: 'flex', gap: 16, marginTop: 12, justifyContent: 'flex-start', flexWrap: 'wrap' }}>
          {series.map((s) => (
            <div key={s.name} className="donut-label">
              <span className="sw" style={{ background: s.color }} />
              <span className="muted">{s.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
