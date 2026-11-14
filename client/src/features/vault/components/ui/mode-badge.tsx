import type { VaultMode } from "../../api/types";
import { Pill } from "./pill";

/** HEDGED / FLAT as the grey Market close pill; fixed width so both line up */
export function ModeBadge({ mode }: { mode: VaultMode }) {
  return (
    <Pill>
      {mode}
    </Pill>
  );
}
