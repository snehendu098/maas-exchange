import { getMarketByIdOrThrow } from "@/shared/config/markets";
import { cn } from "@/shared/lib/cn";
import { formatUtcTime } from "@/shared/lib/format";
import { formatUsdcRaw } from "@/shared/lib/units";
import { Table, Td, Th, Tr } from "@/shared/ui/table";
import type { FundingPayment, UserFill } from "../../api/types";
import { fmtPrice, fmtSize, formatFunding, fundingPercent } from "../../lib/market-format";
import { MarketCell } from "./market-cell";

const signedUsd = (raw: string) => {
  const v = BigInt(raw);
  return `${v < 0n ? "-" : "+"}$${formatUsdcRaw(v < 0n ? -v : v, 4)}`;
};

export function FillsTable({ fills }: { fills: UserFill[] }) {
  return (
    <Table>
      <thead>
        <tr>
          <Th>Time</Th>
          <Th>Market</Th>
          <Th>Side</Th>
          <Th className="text-right">Price</Th>
          <Th className="text-right">Size</Th>
          <Th className="text-right">Fee</Th>
          <Th className="text-right">Realized PnL</Th>
          <Th>Liquidity</Th>
        </tr>
      </thead>
      <tbody>
        {fills.map((f) => {
          const m = getMarketByIdOrThrow(f.market);
          const isBuy = f.side === "SIDE_BUY";
          const pnl = BigInt(f.realizedPnl);
          return (
            <Tr key={f.tradeId}>
              <Td className="text-fg-secondary">{formatUtcTime(new Date(f.time))}</Td>
              <Td><MarketCell market={f.market} /></Td>
              <Td className={isBuy ? "text-up" : "text-down"}>{isBuy ? "Buy" : "Sell"}</Td>
              <Td className="text-right">{fmtPrice(f.price, m)}</Td>
              <Td className="text-right">{fmtSize(f.size, m)}</Td>
              <Td className="text-right">${formatUsdcRaw(f.fee, 4)}</Td>
              <Td className={cn("text-right", pnl < 0n ? "text-down" : pnl > 0n ? "text-up" : "text-fg-muted")}>{signedUsd(f.realizedPnl)}</Td>
              <Td className="text-fg-secondary capitalize">{f.liquidity}</Td>
            </Tr>
          );
        })}
      </tbody>
    </Table>
  );
}

export function FundingTable({ payments }: { payments: FundingPayment[] }) {
  return (
    <Table>
      <thead>
        <tr>
          <Th>Time</Th>
          <Th>Market</Th>
          <Th className="text-right">Position</Th>
          <Th className="text-right">Rate</Th>
          <Th className="text-right">Payment</Th>
        </tr>
      </thead>
      <tbody>
        {payments.map((p, i) => {
          const m = getMarketByIdOrThrow(p.market);
          const paid = BigInt(p.payment ?? p.amount ?? "0");
          const size = p.positionSize ?? p.size;
          return (
            <Tr key={`${p.time ?? p.block}-${p.market}-${i}`}>
              <Td className="text-fg-secondary">{p.time ? formatUtcTime(new Date(p.time)) : p.block ? `#${p.block}` : "—"}</Td>
              <Td><MarketCell market={p.market} /></Td>
              <Td className="text-right">{size ? fmtSize(size, m) : "—"}</Td>
              <Td className="text-right">{p.rate ? formatFunding(fundingPercent(p.rate)) : "—"}</Td>
              {/* payment > 0 = paid by trader */}
              <Td className={cn("text-right", paid > 0n ? "text-down" : "text-up")}>{signedUsd((-paid).toString())}</Td>
            </Tr>
          );
        })}
      </tbody>
    </Table>
  );
}
