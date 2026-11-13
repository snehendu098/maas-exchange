import { Enter } from "@/shared/ui/motion/enter";
import { VaultTicket } from "./vault-ticket";

/** Right column: deposit / withdraw ticket. */
export function VaultSidebar({ className }: { className?: string }) {
  return (
    <Enter as="aside" delay={0.08} aria-label="Vault ticket" className={className}>
      <VaultTicket />
    </Enter>
  );
}
