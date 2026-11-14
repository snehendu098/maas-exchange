import { FlowDiagram, type FlowBadge, type FlowEdge, type FlowNode } from "@/shared/ui/flow-diagram";

const USDC = { src: "/tokens/usdc.svg" };
const KEEPER = "#4a6cf7";

const NODES: FlowNode[] = [
  { x: 16, y: 112, w: 128, h: 56, title: "You", sub: "USDC wallet", logo: "wallet" },
  { x: 232, y: 104, w: 160, h: 72, title: "USDC Vault", sub: "shares · NAV", logo: USDC },
  { x: 480, y: 54, w: 144, h: 52, title: "Spot long", sub: "Ref Finance" },
  { x: 480, y: 174, w: 144, h: 52, title: "Perp short", sub: "MaaS perps" },
  { x: 232, y: 12, w: 160, h: 44, title: "Keeper", sub: "watches funding" },
  { x: 16, y: 230, w: 128, h: 44, title: "Idle buffer", sub: "instant exits", logo: USDC },
];

// step = play order: deposit, keeper reads funding, sets mode, both legs, funding back, buffer, withdraw
const EDGES: FlowEdge[] = [
  { step: 0, d: "M144 140 H232", label: { x: 188, y: 130, text: "USDC" } },
  { step: 1, d: "M624 200 C636 200 636 188 636 176 V46 C636 38 630 34 622 34 H392", color: KEEPER, label: { x: 512, y: 26, text: "funding rate" } },
  { step: 2, d: "M312 56 V104", color: KEEPER, label: { x: 364, y: 84, text: "HEDGED / FLAT" } },
  { step: 3, d: "M392 128 C436 128 440 80 480 80" },
  { step: 3, d: "M392 152 C436 152 440 200 480 200" },
  { step: 4, d: "M480 214 C428 214 430 168 392 168", yield: true, label: { x: 440, y: 238, text: "funding" } },
  { step: 5, d: "M244 176 C214 236 172 252 144 252" },
  { step: 6, d: "M80 230 V168", yield: true, label: { x: 90, y: 203, text: "withdraw" } },
];

const BADGES: FlowBadge[] = [{ x: 552, y: 140, text: "Δ 0" }];

/** deposit -> hedged legs -> funding -> withdraw */
export function VaultFlow() {
  return <FlowDiagram width={640} height={290} nodes={NODES} edges={EDGES} badges={BADGES} label="Vault flow: deposit, hedged legs, funding, withdraw" />;
}
