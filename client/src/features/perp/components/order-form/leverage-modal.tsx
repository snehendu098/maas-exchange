"use client";

import { useState } from "react";
import { Button } from "@/shared/ui/button";
import { Modal } from "@/shared/ui/modal";
import { Slider } from "@/shared/ui/slider";
import { leverageMarks } from "../../lib/leverage";

interface LeverageModalProps {
  open: boolean;
  symbol: string;
  value: number;
  max: number;
  onConfirm: (value: number) => void;
  onClose: () => void;
}

/** Centered leverage picker; draft applies on confirm only. */
export function LeverageModal({ open, onClose, ...form }: LeverageModalProps) {
  return (
    <Modal open={open} title="Adjust leverage" onClose={onClose} card={false}>
      <LeverageForm {...form} onClose={onClose} />
    </Modal>
  );
}

// mounts per open, so the draft resets to the live value
function LeverageForm({ symbol, value, max, onConfirm, onClose }: Omit<LeverageModalProps, "open">) {
  const [draft, setDraft] = useState(value);
  // raw text while typing so the box can be cleared; null = show draft
  const [typed, setTyped] = useState<string | null>(null);
  const clamp = (v: number) => Math.min(max, Math.max(1, Math.round(v) || 1));

  return (
    <div className="flex flex-col gap-5 px-3 pt-2 pb-3">
      <p className="text-center text-sm leading-relaxed text-fg-muted">
        Control the leverage used for {symbol} positions. The maximum leverage is {max}x.
      </p>

      <div className="flex items-center gap-4">
        <Slider
          bare
          label="Leverage"
          value={draft}
          min={1}
          max={max}
          marks={leverageMarks(max)}
          onChange={(v) => {
            setDraft(v);
            setTyped(null);
          }}
          tone="brand"
          formatMark={(m) => `${m}x`}
          className="flex-1"
        />
        <label className="flex h-11 w-20 shrink-0 items-center gap-1 rounded-xl border border-border bg-surface-raised/50 px-3 focus-within:border-border-strong">
          <input
            inputMode="numeric"
            aria-label="Leverage value"
            value={typed ?? draft}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, "");
              setTyped(digits);
              if (digits) setDraft(clamp(Number(digits)));
            }}
            onBlur={() => setTyped(null)}
            className="min-w-0 flex-1 bg-transparent text-right text-base font-semibold text-fg tabular-nums outline-none"
          />
          <span className="text-sm text-fg-muted">x</span>
        </label>
      </div>

      <Button
        size="lg"
        onClick={() => {
          onConfirm(draft);
          onClose();
        }}
      >
        Confirm {draft}x
      </Button>

      <p className="text-center text-[13px] text-fg-muted">
        Higher leverage increases the risk of liquidation.
      </p>
    </div>
  );
}
