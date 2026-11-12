export type ToastTone = "success" | "error" | "info";

export interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
  /** explorer link for the tx */
  href?: string;
}

export const TOAST_TTL_MS = 5000;
const EMPTY: readonly Toast[] = [];

let toasts: readonly Toast[] = EMPTY;
let nextId = 1;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

function push(tone: ToastTone, title: string, description?: string, href?: string) {
  const id = nextId++;
  toasts = [...toasts, { id, tone, title, description, href }].slice(-4);
  emit();
  setTimeout(() => dismissToast(id), TOAST_TTL_MS);
}

export const toast = {
  success: (title: string, description?: string, href?: string) => push("success", title, description, href),
  error: (title: string, description?: string) => push("error", title, description),
  info: (title: string, description?: string) => push("info", title, description),
};

export const toastStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  get: () => toasts,
  getServer: () => EMPTY,
};
