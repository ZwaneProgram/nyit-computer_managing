import { fmtTHB } from '../../data/format';

interface DonutDatum {
  label: string;
  value: number;
  color: string;
}

interface DonutProps {
  data: DonutDatum[];
  size?: number;
  thickness?: number;
}

export function Donut({ data, size = 160, thickness = 22 }: DonutProps) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = size / 2 - thickness / 2;
  const c = 2 * Math.PI * r;
  let off = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--surface-sunk)"
        strokeWidth={thickness}
      />
      {data.map((d, i) => {
        const frac = d.value / total;
        const len = frac * c;
        const el = (
          <circle
            key={i}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={d.color}
            strokeWidth={thickness}
            strokeDasharray={`${len} ${c - len}`}
            strokeDashoffset={-off}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        );
        off += len;
        return el;
      })}
      <text
        x={size / 2}
        y={size / 2 - 2}
        textAnchor="middle"
        fontSize="14"
        fontWeight="600"
        fill="var(--ink)"
        fontFamily="var(--font-ui)"
      >
        {fmtTHB(total)}
      </text>
      <text
        x={size / 2}
        y={size / 2 + 14}
        textAnchor="middle"
        fontSize="10"
        fill="var(--ink-3)"
        fontFamily="var(--font-ui)"
      >
        รวมทั้งหมด
      </text>
    </svg>
  );
}
