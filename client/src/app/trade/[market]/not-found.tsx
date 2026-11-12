import { routes } from "@/shared/config/navigation";
import { NotFoundView } from "@/shared/ui/not-found-view";

export default function MarketNotFound() {
  return (
    <NotFoundView
      title="Market not found"
      body="That perp isn't listed. MaaS Exchange trades BTC, ETH and NEAR."
      action={{ label: "Back to BTC-PERP", href: routes.trade() }}
    />
  );
}
