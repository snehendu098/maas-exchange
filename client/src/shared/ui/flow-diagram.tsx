/** Static money-flow diagram: grey nodes with logos, dashed edges streaming dots. Callers pass layout data only. */

export type FlowLogo = { src: string } | "wallet";

export interface FlowNode {
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  sub: string;
  /** omit = text-only node */
  logo?: FlowLogo;
}

export interface FlowEdge {
  d: string;
  /** play order; equal steps run together. Defaults to array index */
  step?: number;
  /** green = value flowing back to the user */
  yield?: boolean;
  /** dot + label color override, e.g. partner brand */
  color?: string;
  label?: { x: number; y: number; text: string };
}

/** small pill on the canvas, e.g. "Δ 0" */
export interface FlowBadge {
  x: number;
  y: number;
  text: string;
}

interface FlowDiagramProps {
  width: number;
  height: number;
  nodes: readonly FlowNode[];
  edges: readonly FlowEdge[];
  badges?: readonly FlowBadge[];
  label: string;
}

const GREY = "var(--color-fg-subtle)";
const GREEN = "var(--color-up)";
/** seconds one dot takes to cross an edge */
const STEP_SEC = 2.2;
const EPS = 0.001;

/** Dot crosses the edge in its slot of the loop, hidden otherwise; slots run in step order. */
function Edge({ e, step, steps }: { e: FlowEdge; step: number; steps: number }) {
  const color = e.color ?? (e.yield ? GREEN : GREY);
  const cycle = `${steps * STEP_SEC}s`;
  const [start, end] = [step / steps, (step + 1) / steps];
  const t = (...xs: number[]) => xs.map((x) => Math.min(1, Math.max(0, x)).toFixed(4)).join(";");
  return (
    <g>
      <path d={e.d} fill="none" stroke="var(--color-border-strong)" strokeWidth={1.25} strokeDasharray="4 5" strokeLinecap="round" />
      <circle r={3} fill={color} opacity={0}>
        <animateMotion dur={cycle} repeatCount="indefinite" path={e.d} calcMode="linear" keyPoints="0;0;1;1" keyTimes={t(0, start + EPS, end - EPS, 1)} />
        <animate attributeName="opacity" dur={cycle} repeatCount="indefinite" values="0;0;1;1;0;0" keyTimes={t(0, start, start + 2 * EPS, end - 2 * EPS, end, 1)} />
      </circle>
      {e.label && (
        <text x={e.label.x} y={e.label.y} textAnchor={e.label.x < 100 ? "start" : "middle"} fontSize={10} fill={e.color ?? (e.yield ? GREEN : "var(--color-fg-muted)")} className="font-mono">
          {e.label.text}
        </text>
      )}
    </g>
  );
}

function NodeLogo({ logo, x, y }: { logo: FlowLogo; x: number; y: number }) {
  if (logo === "wallet")
    return (
      <g transform={`translate(${x} ${y})`} fill="none" stroke="var(--color-fg-muted)" strokeWidth={1.4} strokeLinejoin="round">
        <rect x={1} y={3.5} width={16} height={12} rx={2.5} />
        <path d="M12.5 9.5h2" strokeLinecap="round" />
      </g>
    );
  return <image href={logo.src} x={x} y={y} width={18} height={18} />;
}

function Node({ n }: { n: FlowNode }) {
  const cy = n.y + n.h / 2;
  const tx = n.x + (n.logo ? 40 : 16);
  return (
    <g>
      <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={12} fill="var(--color-surface-raised)" stroke="var(--color-border-strong)" strokeWidth={1} />
      {n.logo && <NodeLogo logo={n.logo} x={n.x + 12} y={cy - 9} />}
      <text x={tx} y={cy - 2} fontSize={12.5} fontWeight={500} fill="var(--color-fg)">
        {n.title}
      </text>
      <text x={tx} y={cy + 12} fontSize={9.5} fill="var(--color-fg-muted)" className="font-mono">
        {n.sub}
      </text>
    </g>
  );
}

function Badge({ b }: { b: FlowBadge }) {
  const w = Math.max(48, 20 + b.text.length * 7);
  return (
    <g>
      <rect x={b.x - w / 2} y={b.y - 12} width={w} height={24} rx={12} fill="var(--color-bg)" stroke="var(--color-border-strong)" />
      <text x={b.x} y={b.y + 4} textAnchor="middle" fontSize={11} fill="var(--color-fg-muted)" className="font-mono">
        {b.text}
      </text>
    </g>
  );
}

export function FlowDiagram({ width, height, nodes, edges, badges = [], label }: FlowDiagramProps) {
  const stepOf = (e: FlowEdge, i: number) => e.step ?? i;
  const steps = Math.max(0, ...edges.map(stepOf)) + 1;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} className="h-auto w-full">
      {edges.map((e, i) => (
        <Edge key={e.d} e={e} step={stepOf(e, i)} steps={steps} />
      ))}
      {nodes.map((n) => (
        <Node key={n.title} n={n} />
      ))}
      {badges.map((b) => (
        <Badge key={b.text} b={b} />
      ))}
    </svg>
  );
}
