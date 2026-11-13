"use client";

import { getMarketByIdOrThrow } from "@/shared/config/markets";
import { cn } from "@/shared/lib/cn";
import { formatNumber, formatSignedPercent } from "@/shared/lib/format";
import { formatUsdcRaw, mulBpsUp, notional } from "@/shared/lib/units";
import { Button } from "@/shared/ui/button";
import { Table, Td, Th, Tr } from "@/shared/ui/table";
import type { Account, MarketStats, Position } from "../../api/types";
import { usePlaceOrder } from "../../hooks/use-order-actions";
import { fmtPrice, fmtSize } from "../../lib/market-format";
import { entryPrice, liquidationPrice, roePercent, unrealizedPnl } from "../../lib/position-math";
import { MarketCell } from "./market-cell";

interface PositionsTableProps {
  positions: Position[];
  stats: Map<number, MarketStats>;
  account?: Account;
}

export function PositionsTable({ positions, stats, account }: PositionsTableProps) {
  const place = usePlaceOrder();
  const collateral = account ? BigInt(account.collateral) : 0n;

  return (
    <Table>
      <thead>
        <tr>
          <Th>Market</Th>
          <Th className="text-right">Size</Th>
          <Th className="text-right">Entry</Th>
          <Th className="text-right">Mark</Th>
          <Th className="text-right">uPnL (ROE)</Th>
          <Th className="text-right">Liq. price</Th>
          <Th className="text-right">Margin</Th>
          <Th className="text-right">Close</Th>
        </tr>
      </thead>
      <tbody>
        {positions.map((p) => {
          const m = getMarketByIdOrThrow(p.market);
          const size = BigInt(p.size);
          const entryN = BigInt(p.entryNotional);
          const s = stats.get(p.market);
          const mark = s ? BigInt(s.markPrice) : null;
          const pnl = mark ? unrealizedPnl(size, entryN, mark) : 0n;
          const liq = liquidationPrice({ size, entryNotional: entryN, mmrBps: m.mmrBps, marginBuffer: collateral });
          const isLong = size > 0n;
          return (
            <Tr key={p.market}>
              <Td><MarketCell market={p.market} isBuy={isLong} sideTag /></Td>
              <Td className={cn("text-right", isLong ? "text-up" : "text-down")}>{fmtSize(size, m)} {m.symbol}</Td>
              <Td className="text-right">{fmtPrice(entryPrice(size, entryN), m)}</Td>
              <Td className="text-right">{mark ? fmtPrice(mark, m) : "—"}</Td>
              <Td className={cn("text-right", pnl < 0n ? "text-down" : "text-up")}>
                {pnl < 0n ? "-" : "+"}${formatUsdcRaw(pnl < 0n ? -pnl : pnl)} ({formatSignedPercent(roePercent(pnl, size, entryN, m.imrBps))})
              </Td>
              <Td className="text-right">{liq ? formatNumber(liq, 2) : "—"}</Td>
              <Td className="text-right">${formatUsdcRaw(mark ? mulBpsUp(notional(size, mark), m.imrBps) : 0n)}</Td>
              <Td className="text-right">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!mark || place.isPending}
                  onClick={() =>
                    place.mutate({
                      market: m, isBuy: !isLong, kind: "market", markPrice: mark ?? undefined,
                      size: isLong ? size : -size, reduceOnly: true, tif: "TIME_IN_FORCE_IOC",
                    })
                  }
                  className="h-7 rounded-full px-3 text-xs"
                >
                  Market close
                </Button>
              </Td>
            </Tr>
          );
        })}
      </tbody>
    </Table>
  );
}
