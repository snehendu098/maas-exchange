"use client";

import { getMarketByIdOrThrow } from "@/shared/config/markets";
import { formatUtcTime } from "@/shared/lib/format";
import { Table, Td, Th, Tr } from "@/shared/ui/table";
import type { Order } from "../../api/types";
import { useCancelOrder } from "../../hooks/use-order-actions";
import { fmtPrice, fmtSize } from "../../lib/market-format";
import { stateText } from "../../lib/order-request";
import { MarketCell } from "./market-cell";

const TIF: Record<Order["tif"], string> = {
  TIME_IN_FORCE_GTC: "GTC",
  TIME_IN_FORCE_IOC: "IOC",
  TIME_IN_FORCE_POST_ONLY: "Post",
};

export function OpenOrdersTable({ orders }: { orders: Order[] }) {
  const cancel = useCancelOrder();

  return (
    <Table>
      <thead>
        <tr>
          <Th>Time</Th>
          <Th>Market</Th>
          <Th>Side</Th>
          <Th className="text-right">Price</Th>
          <Th className="text-right">Size</Th>
          <Th className="text-right">Filled</Th>
          <Th>Type</Th>
          <Th>Status</Th>
          <Th className="text-right">Cancel</Th>
        </tr>
      </thead>
      <tbody>
        {orders.map((o) => {
          const m = getMarketByIdOrThrow(o.market);
          const isBuy = o.side === "SIDE_BUY";
          return (
            <Tr key={o.orderId}>
              <Td className="text-fg-secondary">{formatUtcTime(new Date(o.createdAt))}</Td>
              <Td><MarketCell market={o.market} /></Td>
              <Td className={isBuy ? "text-up" : "text-down"}>{isBuy ? "Long" : "Short"}{o.reduceOnly ? " · RO" : ""}</Td>
              <Td className="text-right">{fmtPrice(o.price, m)}</Td>
              <Td className="text-right">{fmtSize(o.size, m)}</Td>
              <Td className="text-right">{fmtSize(o.filled, m)}</Td>
              <Td>Limit · {TIF[o.tif]}</Td>
              <Td className="text-fg-secondary first-letter:uppercase">{stateText(o)}</Td>
              <Td className="text-right">
                <button
                  type="button"
                  disabled={cancel.isPending}
                  onClick={() => cancel.mutate(o)}
                  className="text-brand underline underline-offset-4 transition-opacity hover:opacity-80 disabled:opacity-40"
                >
                  Cancel
                </button>
              </Td>
            </Tr>
          );
        })}
      </tbody>
    </Table>
  );
}
