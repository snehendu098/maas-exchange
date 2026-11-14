import { RPC_URL } from "@/shared/config/near";

interface RpcError {
  message?: string;
  data?: unknown;
  cause?: { name?: string; info?: { error_message?: string } };
}

/** JSON-RPC view call; contract result parsed as JSON. */
export async function view<T>(contractId: string, method: string, args: object = {}): Promise<T> {
  if (!contractId) throw new Error(`contract for ${method} not configured`);
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "view",
      method: "query",
      params: {
        request_type: "call_function",
        finality: "final",
        account_id: contractId,
        method_name: method,
        args_base64: btoa(JSON.stringify(args)),
      },
    }),
  });
  const body = (await res.json()) as { result?: { result?: number[]; error?: string }; error?: RpcError };
  const err = body.error?.cause?.info?.error_message ?? body.error?.message ?? body.result?.error;
  if (err || !body.result?.result) throw new Error(`${method}: ${err ?? "empty result"}`);
  return JSON.parse(new TextDecoder().decode(new Uint8Array(body.result.result))) as T;
}
