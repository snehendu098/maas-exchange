import Link from "next/link";
import { routes } from "@/shared/config/navigation";

/** Wordmark only, links home. */
export function Brand() {
  return (
    <Link href={routes.trade()} aria-label="MaaS Exchange home" className="focus-ring flex items-center rounded-md text-fg">
      <span className="text-xl leading-none font-semibold tracking-tight">maas</span>
    </Link>
  );
}
