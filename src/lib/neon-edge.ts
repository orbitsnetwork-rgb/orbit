/**
 * Cloudflare Workers Postgres access (Neon serverless driver).
 *
 * Workers forbid sharing sockets between requests, so a long-lived `pg.Pool`
 * breaks there. Instead this exposes a pool-shaped object whose clients run
 * plain queries over Neon's stateless HTTP endpoint, and only open a
 * WebSocket session for the duration of an explicit transaction.
 * Used only when running on workerd (see `isWorkersRuntime`); Node/Netlify keep `pg`.
 */
import { neon, Client, types as neonTypes } from "@neondatabase/serverless";

export const isWorkersRuntime =
  typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";

const OID_INT8 = 20;
const OID_DATE = 1082;
const OID_INTERVAL = 1186;
const identity = (v: string) => v;
neonTypes.setTypeParser(OID_INT8, Number);
neonTypes.setTypeParser(OID_DATE, identity);
neonTypes.setTypeParser(OID_INTERVAL, identity);

type QueryResultLike = { rows: Record<string, unknown>[]; rowCount: number | null; command: string };

export interface EdgeClient {
  query(text: string, params?: unknown[]): Promise<QueryResultLike>;
  release(): void;
}

const BEGIN_RE = /^\s*(begin|start\s+transaction)\b/i;
const END_RE = /^\s*(commit|rollback|end)\b/i;

export function createEdgePool(connectionString: string) {
  const http = neon(connectionString, { fullResults: true });
  const makeClient = (): EdgeClient => {
    let ws: Client | null = null;
    const close = () => {
      const c = ws;
      ws = null;
      if (c) void c.end().catch(() => undefined);
    };
    return {
      async query(text, params = []) {
        if (!ws && BEGIN_RE.test(text)) {
          ws = new Client({ connectionString });
          await ws.connect();
        }
        if (ws) {
          try {
            const r = await ws.query(text, params as unknown[]);
            return r as unknown as QueryResultLike;
          } finally {
            if (END_RE.test(text)) close();
          }
        }
        const r = await http.query(text, params as unknown[]);
        return r as unknown as QueryResultLike;
      },
      release: close,
    };
  };
  return {
    connect: async () => makeClient(),
    query: (text: string, params?: unknown[]) => makeClient().query(text, params),
    end: async () => undefined,
    on: () => undefined,
  };
}
