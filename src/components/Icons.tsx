// Shared stroke-based icon set (24×24 viewBox). All icons inherit currentColor.
import type { ReactNode, SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

interface BaseProps extends Omit<IconProps, 'd'> {
  d: string | ReactNode;
  fill?: string;
}

const Ic = ({ d, fill, className, ...p }: BaseProps) => (
  <svg
    viewBox="0 0 24 24"
    fill={fill ?? 'none'}
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`icon${className ? ` ${className}` : ''}`}
    {...p}
  >
    {typeof d === 'string' ? <path d={d} /> : d}
  </svg>
);

export const Icons = {
  dashboard: (p: IconProps) => <Ic {...p} d={<><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>} />,
  box: (p: IconProps) => <Ic {...p} d={<><path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z" /><path d="M3.5 7.5 12 12l8.5-4.5" /><path d="M12 12v9" /></>} />,
  plus: (p: IconProps) => <Ic {...p} d="M12 5v14M5 12h14" />,
  layers: (p: IconProps) => <Ic {...p} d={<><path d="M12 3 3 8l9 5 9-5z" /><path d="m3 13 9 5 9-5" /><path d="m3 18 9 5 9-5" /></>} />,
  cart: (p: IconProps) => <Ic {...p} d={<><path d="M3 4h2.5l2.5 12h11l2-8H6.5" /><circle cx="9" cy="20" r="1.4" /><circle cx="17" cy="20" r="1.4" /></>} />,
  chart: (p: IconProps) => <Ic {...p} d={<><path d="M3 21h18" /><path d="M6 18V10" /><path d="M11 18V6" /><path d="M16 18v-7" /><path d="M21 18v-3" /></>} />,
  search: (p: IconProps) => <Ic {...p} d={<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>} />,
  filter: (p: IconProps) => <Ic {...p} d="M3 5h18l-7 9v6l-4-2v-4z" />,
  bell: (p: IconProps) => <Ic {...p} d={<><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6" /><path d="M10 19a2 2 0 0 0 4 0" /></>} />,
  sun: (p: IconProps) => <Ic {...p} d={<><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M5 12H3M21 12h-2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" /></>} />,
  moon: (p: IconProps) => <Ic {...p} d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />,
  more: (p: IconProps) => <Ic {...p} d={<><circle cx="5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="19" cy="12" r="1.2" /></>} />,
  edit: (p: IconProps) => <Ic {...p} d={<><path d="M4 20h4l11-11-4-4L4 16z" /><path d="m13 6 5 5" /></>} />,
  trash: (p: IconProps) => <Ic {...p} d={<><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="M6 7v13a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7" /><path d="M10 11v7M14 11v7" /></>} />,
  check: (p: IconProps) => <Ic {...p} d="m5 13 4 4L19 7" />,
  x: (p: IconProps) => <Ic {...p} d="M6 6l12 12M6 18 18 6" />,
  arrowDown: (p: IconProps) => <Ic {...p} d="M12 5v14M6 13l6 6 6-6" />,
  arrowUp: (p: IconProps) => <Ic {...p} d="M12 19V5M6 11l6-6 6 6" />,
  arrowRight: (p: IconProps) => <Ic {...p} d="M5 12h14M13 6l6 6-6 6" />,
  upload: (p: IconProps) => <Ic {...p} d={<><path d="M12 16V4M6 10l6-6 6 6" /><path d="M4 20h16" /></>} />,
  calendar: (p: IconProps) => <Ic {...p} d={<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 9h18M8 3v4M16 3v4" /></>} />,
  user: (p: IconProps) => <Ic {...p} d={<><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-7 8-7s8 3 8 7" /></>} />,
  download: (p: IconProps) => <Ic {...p} d={<><path d="M12 4v12M6 10l6 6 6-6" /><path d="M4 20h16" /></>} />,
  warning: (p: IconProps) => <Ic {...p} d={<><path d="M12 3 2 21h20Z" /><path d="M12 10v5M12 18h.01" /></>} />,
  tag: (p: IconProps) => <Ic {...p} d={<><path d="M20 12 12 20 3 11V3h8z" /><circle cx="7.5" cy="7.5" r="1.2" fill="currentColor" /></>} />,
  refresh: (p: IconProps) => <Ic {...p} d={<><path d="M3 12a9 9 0 0 1 15.5-6.3L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15.5 6.3L3 16" /><path d="M3 21v-5h5" /></>} />,
  settings: (p: IconProps) => <Ic {...p} d={<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .4 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.4 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.9.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .4-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.4-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.4H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.4l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.4 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></>} />,
  receipt: (p: IconProps) => <Ic {...p} d={<><path d="M5 3v18l3-2 2 2 2-2 2 2 2-2 3 2V3z" /><path d="M9 8h6M9 12h6M9 16h3" /></>} />,
  truck: (p: IconProps) => <Ic {...p} d={<><path d="M2 6h13v10H2zM15 9h4l3 3v4h-7" /><circle cx="6.5" cy="18" r="1.6" /><circle cx="17.5" cy="18" r="1.6" /></>} />,
  cpu: (p: IconProps) => <Ic {...p} d={<><rect x="6" y="6" width="12" height="12" rx="1.5" /><rect x="9" y="9" width="6" height="6" /><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" /></>} />,
  menu: (p: IconProps) => <Ic {...p} d="M3 6h18M3 12h18M3 18h18" />,
  qr: (p: IconProps) => <Ic {...p} d={<><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><path d="M14 14h3v3h-3zM20 14v3M14 20h7" /></>} />,
  lock: (p: IconProps) => <Ic {...p} d={<><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /><path d="M12 15v2" /></>} />,
  logout: (p: IconProps) => <Ic {...p} d={<><path d="M14 8V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-2" /><path d="M18 15l3-3-3-3" /><path d="M21 12H9" /></>} />,
} as const;

export type IconName = keyof typeof Icons;
