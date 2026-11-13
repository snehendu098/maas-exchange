"use client";

import type { ReactNode } from "react";
import { Info, type LucideIcon } from "lucide-react";
import { useDisclosure } from "@/shared/hooks/use-disclosure";
import { cn } from "@/shared/lib/cn";
import { Modal } from "@/shared/ui/modal";

export interface HowStep {
  icon: LucideIcon;
  title: string;
  desc: string;
}

interface HowItWorksProps {
  title: string;
  steps: HowStep[];
  /** flow diagram shown above the steps */
  diagram: ReactNode;
  className?: string;
}

/** Whole flow at once: diagram on top, numbered steps in two columns below. */
function Explainer({ diagram, steps }: { diagram: ReactNode; steps: HowStep[] }) {
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-bg p-3 sm:p-4">{diagram}</div>
      <ol className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
        {steps.map((s, i) => (
          <li key={s.title} className="flex gap-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-raised text-fg-muted">
              <s.icon className="size-3.5" strokeWidth={1.8} />
            </span>
            <div className="space-y-0.5">
              <p className="text-[13px] font-medium text-fg">
                <span className="mr-1.5 font-mono text-[11px] text-fg-subtle">{i + 1}</span>
                {s.title}
              </p>
              <p className="text-xs leading-relaxed text-fg-muted">{s.desc}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** ⓘ "How this works" text link; opens a diagram + steps popup. */
export function HowItWorks({ title, steps, diagram, className }: HowItWorksProps) {
  const modal = useDisclosure();
  return (
    <>
      <button
        type="button"
        onClick={modal.open}
        className={cn("focus-ring inline-flex items-center gap-1.5 rounded text-sm text-fg-muted transition-colors hover:text-fg", className)}
      >
        <Info className="size-4" strokeWidth={1.75} />
        How this works
      </button>
      <Modal open={modal.isOpen} title={title} onClose={modal.close} size="xl" card={false}>
        <Explainer diagram={diagram} steps={steps} />
      </Modal>
    </>
  );
}
