import type { CSSProperties } from 'react';
import type { Series } from './BarChart';

interface AreaChartProps {
  labels: string[];
  series: Series[];
  height?: number;
}

export function AreaChart({ labels, series, height = 260 }: AreaChartProps) {
  const w = 100;
  const h = height;
  const allVals = series.flatMap((s) => s.data);
  const max = Math.max(...allVals) * 1.12 || 1;
  const min = 0;
  const range = max - min || 1;
  const step = w / (labels.length - 1);
  return (
    <div>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        width="100%"
        height={height}
        style={{ overflow: 'visible' }}
      >
        {[0.25, 0.5, 0.75, 1].map((p, i) => (
          <line
            key={i}
            x1="0"
            y1={h - h * p}
            x2={w}
            y2={h - h * p}
            stroke="var(--border)"
            strokeWidth="0.25"
          />
        ))}
        {series.map((s, si) => {
          const pts = s.data.map((v, i) => [
            i * step,
            h - 18 - ((v - min) / range) * (h - 28),
          ]);
          const d = pts
            .map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(2) + ' ' + p[1].toFixed(2))
            .join(' ');
          const area = d + ` L ${w} ${h - 18} L 0 ${h - 18} Z`;
          return (
            <g key={si}>
              {!s.dashed && si === 0 && <path d={area} fill={s.color} opacity="0.08" />}
              <path
                d={d}
                fill="none"
                stroke={s.color}
                strokeWidth="0.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={s.dashed ? '1.4 1.4' : 'none'}
              />
            </g>
          );
        })}
        {labels.map((l, i) => (
          <text
            key={i}
            x={i * step}
            y={h - 4}
            textAnchor={i === 0 ? 'start' : i === labels.length - 1 ? 'end' : 'middle'}
            fontSize="3"
            fill="var(--ink-3)"
            fontFamily="var(--font-ui)"
          >
            {l}
          </text>
        ))}
      </svg>
      <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
        {series.map((s) => {
          const swStyle: CSSProperties = s.dashed
            ? { background: 'transparent', border: `1px dashed ${s.color}` }
            : { background: s.color };
          return (
            <div key={s.name} className="donut-label">
              <span className="sw" style={swStyle} />
              <span className="muted">{s.name}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
