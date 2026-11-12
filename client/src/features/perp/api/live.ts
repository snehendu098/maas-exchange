import {
  GatewayError,
  type PerpApi,
  type Subscription,
  type SubscriptionHandler,
} from "./types";

interface LiveConfig {
  baseUrl: string;
  wsUrl: string;
}

async function request<T>(baseUrl: string, path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...init?.headers },
    });
  } catch (e) {
    throw new GatewayError("NETWORK", e instanceof Error ? e.message : "gateway unreachable");
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (body ?? {}) as { code?: string; message?: string };
    throw new GatewayError(err.code ?? `HTTP_${res.status}`, err.message ?? res.statusText, res.status);
  }
  return body as T;
}

const subKey = (s: Subscription) =>
  s.channel === "ticker" ? "ticker" : s.channel === "user" ? `user:${s.trader.toLowerCase()}` : `${s.channel}:${s.market}`;

interface WsMessage {
  key: string;
  data: unknown;
}

/** One shared socket, ref-counted subscriptions, auto reconnect. */
function createSocket(url: string) {
  const handlers = new Map<string, Set<(data: unknown) => void>>();
  const subs = new Map<string, Subscription>();
  let ws: WebSocket | null = null;
  let retry: ReturnType<typeof setTimeout> | undefined;

  const send = (op: "subscribe" | "unsubscribe", sub: Subscription) => {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ op, ...sub }));
  };

  const connect = () => {
    ws = new WebSocket(url);
    ws.onopen = () => subs.forEach((s) => send("subscribe", s));
    ws.onmessage = (ev) => {
      const msg = JSON.parse(String(ev.data)) as WsMessage;
      handlers.get(msg.key)?.forEach((h) => h(msg.data));
    };
    ws.onclose = () => {
      ws = null;
      if (subs.size > 0) retry = setTimeout(connect, 1500);
    };
  };

  return function subscribe(sub: Subscription, handler: (data: unknown) => void) {
    const key = subKey(sub);
    const set = handlers.get(key) ?? new Set();
    handlers.set(key, set);
    set.add(handler);
    if (!subs.has(key)) {
      subs.set(key, sub);
      if (!ws) connect();
      else send("subscribe", sub);
    }
    return () => {
      set.delete(handler);
      if (set.size > 0) return;
      handlers.delete(key);
      subs.delete(key);
      send("unsubscribe", sub);
      if (subs.size === 0) {
        clearTimeout(retry);
        ws?.close();
      }
    };
  };
}

export function createLiveApi({ baseUrl, wsUrl }: LiveConfig): PerpApi {
  const get = <T>(path: string) => request<T>(baseUrl, path);
  const socket = createSocket(wsUrl);
  const q = (trader: string) => `trader=${trader}`;

  return {
    getMarkets: () => get("/markets"),
    getMarketStats: () => get("/markets/stats"),
    getBook: (market, depth = 50) => get(`/book/${market}?depth=${depth}`),
    getTrades: (market, limit = 50) => get(`/trades/${market}?limit=${limit}`),
    getCandles: (market, interval, limit = 300) => get(`/candles/${market}?interval=${interval}&limit=${limit}`),
    getAccount: (trader) => get(`/account?${q(trader)}`),
    getPositions: (trader) => get(`/positions?${q(trader)}`),
    getOrders: (trader) => get(`/orders?${q(trader)}`),
    getFills: (trader) => get(`/fills?${q(trader)}`),
    getFunding: (trader) => get(`/funding?${q(trader)}`),
    getFundingRates: (market) => get(`/funding/${market}`),
    getLeaderboard: (window) => get(`/leaderboard?window=${window}`),
    placeOrder: (req) => request(baseUrl, "/orders", { method: "POST", body: JSON.stringify(req) }),
    cancelOrder: (orderId, trader) =>
      request(baseUrl, `/orders/${encodeURIComponent(orderId)}?${q(trader)}`, { method: "DELETE" }),
    subscribe: <S extends Subscription>(sub: S, handler: SubscriptionHandler<S>) =>
      socket(sub, (data) => handler(data as Parameters<SubscriptionHandler<S>>[0])),
  };
}
