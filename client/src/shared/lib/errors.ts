interface Coded {
  code?: unknown;
  message?: unknown;
}

/** Human message for gateway / rpc / wallet errors. */
export function errorMessage(error: unknown): string {
  if (!error || typeof error !== "object") return String(error ?? "Unknown error");
  const e = error as Coded;
  const msg = typeof e.message === "string" ? e.message : "Unknown error";
  return typeof e.code === "string" ? `${e.code}: ${msg}` : msg;
}
