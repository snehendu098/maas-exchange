type P = { className?: string };
const s = { fill: "none", stroke: "currentColor" } as const;

export const Logo = ({ className }: P) => (
  <svg className={className} viewBox="0 0 32 32" aria-hidden="true">
    <g stroke="currentColor" strokeWidth="4.2" strokeLinecap="square">
      <path d="M16 2.5v27M2.5 16h27M6.5 6.5l19 19M25.5 6.5l-19 19" />
    </g>
  </svg>
);

export const Search = ({ className }: P) => (
  <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
    <circle cx="7" cy="7" r="4.8" {...s} strokeWidth="1.4" />
    <path d="M10.6 10.6L14 14" {...s} strokeWidth="1.4" />
  </svg>
);

export const Wallet = ({ className }: P) => (
  <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
    <rect x="2" y="3" width="12" height="10.5" rx="1.2" {...s} strokeWidth="1.3" />
    <path d="M2 6h12M10.5 9.5h1.5" {...s} strokeWidth="1.3" />
  </svg>
);

export const Bell = ({ className }: P) => (
  <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
    <path d="M4 11.5V7.2a4 4 0 018 0v4.3l1.2 1.3H2.8z" {...s} strokeWidth="1.2" />
    <path d="M6.6 14.3h2.8" {...s} strokeWidth="1.2" />
  </svg>
);

export const Avatar = ({ className }: P) => (
  <svg className={className} viewBox="0 0 16 16" aria-hidden="true" shapeRendering="crispEdges">
    <path
      fill="currentColor"
      d="M5 1h6v1h1v1h1v3h-1v1h1v2h-1v1h-1v1h-1v2H9v-1H8v-1H6v-1H5V9H4V3h1zm1 4v2h2V5zm4 0v2h1V5z"
    />
  </svg>
);

export const Trend = ({ className }: P) => (
  <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
    <path d="M1.5 11.5l4.5-4.5 3 3 5.5-5.5M10.5 4.5h4v4" {...s} strokeWidth="1.6" />
  </svg>
);

export const Bolt = ({ className }: P) => (
  <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
    <path d="M9.5 1.5L3.5 9h4l-1 5.5 6-7.5h-4z" {...s} strokeWidth="1.2" strokeLinejoin="round" />
  </svg>
);

export const Target = ({ className }: P) => (
  <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
    <circle cx="8" cy="8" r="6" {...s} strokeWidth="1.2" />
    <circle cx="8" cy="8" r="2.8" {...s} strokeWidth="1.2" />
    <path d="M8 8l5.5-5.5M11 2.5h2.5V5" {...s} strokeWidth="1.2" />
  </svg>
);

export const Chevron = ({ className, dir = "down" }: P & { dir?: "down" | "left" | "right" }) => {
  const d = { down: "M4 6l4 4 4-4", left: "M10 3L5 8l5 5", right: "M6 3l5 5-5 5" }[dir];
  return (
    <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
      <path d={d} {...s} strokeWidth="1.4" />
    </svg>
  );
};

export const Arrow = ({ className }: P) => (
  <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
    <path d="M1.5 8h12.5M9 3l5 5-5 5" {...s} strokeWidth="1.3" />
  </svg>
);

export const ArrowUpRight = ({ className }: P) => (
  <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
    <path d="M2.5 13.5l11-11M5 2.5h8.5V11" {...s} strokeWidth="0.9" />
  </svg>
);
