import type { Side } from "../api/types";

export type TradeSide = "buy" | "sell";

export const toTradeSide = (s: Side): TradeSide => (s === "SIDE_BUY" ? "buy" : "sell");
export const isBuySide = (s: Side) => s === "SIDE_BUY";
