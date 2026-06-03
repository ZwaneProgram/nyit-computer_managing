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
  const PAD = 6;
  const allVals = series.flatMap((s) => s.data);
  const max = Math.max(...allVals) * 1.12 || 1;
  const range = max || 1;
  const step = w / Math.max(1, labels.length - 1);
  const yOf = (v: number) => h - PAD - (v / range) * (h - PAD * 2);
  return (
    <div>
      {/* preserveAspectRatio="none" stretches X, so: no <text> here (distorted)
          and vector-effect keeps the line stroke a constant width. */}
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" width="100%" height={height} style={{ overflow: 'visible', display: 'block' }}>
        {[0.25, 0.5, 0.75, 1].map((p, i) => (
          <line key={i} x1="0" y1={h - h * p} x2={w} y2={h - h * p} stroke="var(--border)" strokeWidth="0.25" />
        ))}
        {series.map((s, si) => {
          const pts = s.data.map((v, i) => [i * step, yOf(v)]);
          const d = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(2) + ' ' + p[1].toFixed(2)).join(' ');
          const area = d + ` L ${w} ${h - PAD} L 0 ${h - PAD} Z`;
          return (
            <g key={si}>
              {!s.dashed && si === 0 && <path d={area} fill={s.color} opacity="0.08" />}
              <path
                d={d}
                fill="none"
                stroke={s.color}
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={s.dashed ? '5 5' : 'none'}
              />
            </g>
          );
        })}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
        {labels.map((l, i) => (
          <span key={i} style={{ fontSize: 11, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>{l}</span>
        ))}
      </div>
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
