import type { ReactNode } from "react";
import { CircleAlert, Info } from "lucide-react";
import { cn } from "@/shared/lib/cn";

/** blocker = why the action is dead, warning = costs money, info = explains */
export type NoticeKind = "blocker" | "warning" | "info";

const KIND: Record<NoticeKind, { text: string; icon: string }> = {
  blocker: { text: "bg-down/10 text-down", icon: "text-down" },
  warning: { text: "bg-warn/10 text-warn", icon: "text-warn" },
  info: { text: "bg-surface-raised/50 text-fg-muted", icon: "text-fg-muted" },
};

/** Quiet inline explanation card. */
export function Notice({ kind = "info", children, className }: { kind?: NoticeKind; children: ReactNode; className?: string }) {
  const { text, icon } = KIND[kind];
  const Icon = kind === "info" ? Info : CircleAlert;
  return (
    <p className={cn("flex items-start gap-2 rounded-xl px-3.5 py-3 text-[13px] leading-snug", text, className)}>
      <Icon className={cn("mt-px size-3.5 shrink-0", icon)} strokeWidth={1.8} />
      <span className="min-w-0">{children}</span>
    </p>
  );
}
