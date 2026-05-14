import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createServer } from "./server.ts";

export interface HttpServerOptions {
  port?: number;
  hostname?: string;
  /** URL path the MCP endpoint is mounted at. Defaults to "/mcp". */
  path?: string;
}

const SESSION_HEADER = "mcp-session-id";

/**
 * Starts a Streamable HTTP MCP server on Bun.serve.
 *
 * Stateful mode: each `initialize` request creates a new (transport, server) pair
 * and registers them under a server-generated `Mcp-Session-Id`. Subsequent
 * requests must include that header.
 */
export function startHttp(options: HttpServerOptions = {}): {
  port: number;
  hostname: string;
  url: string;
  stop: () => void;
} {
  const port = options.port ?? Number(process.env.PORT ?? process.env.MCP_PORT ?? 3000);
  const hostname = options.hostname ?? process.env.MCP_HOST ?? "127.0.0.1";
  const path = options.path ?? "/mcp";

  const transports = new Map<string, WebStandardStreamableHTTPServerTransport>();

  const server = Bun.serve({
    port,
    hostname,
    async fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === "/health") {
        return new Response("ok", { status: 200 });
      }
      if (url.pathname !== path) {
        return new Response("Not Found", { status: 404 });
      }

      const sessionId = req.headers.get(SESSION_HEADER) ?? undefined;
      let transport = sessionId ? transports.get(sessionId) : undefined;
      let parsedBody: unknown;

      if (!transport && req.method === "POST") {
        try {
          parsedBody = await req.json();
        } catch {
          return jsonRpcError(-32700, "Parse error", 400);
        }

        if (!isInitializeRequest(parsedBody)) {
          return jsonRpcError(
            -32000,
            "Bad Request: No valid session ID provided and request is not 'initialize'.",
            400,
          );
        }

        transport = new WebStandardStreamableHTTPServerTransport({
          sessionIdGenerator: () => crypto.randomUUID(),
          onsessioninitialized: (id) => {
            transports.set(id, transport as WebStandardStreamableHTTPServerTransport);
          },
          onsessionclosed: (id) => {
            transports.delete(id);
          },
        });
        transport.onclose = () => {
          if (transport?.sessionId) transports.delete(transport.sessionId);
        };

        const mcp = createServer();
        await mcp.connect(transport);
      }

      if (!transport) {
        return jsonRpcError(-32000, "Bad Request: Unknown or missing session.", 400);
      }

      return transport.handleRequest(req, parsedBody !== undefined ? { parsedBody } : undefined);
    },
    error(err) {
      console.error("[weather-demo] http error", err);
      return new Response("Internal Server Error", { status: 500 });
    },
  });

  const url = `http://${hostname}:${server.port}${path}`;
  console.error(`[weather-demo] streamable HTTP transport listening at ${url}`);

  return {
    port: server.port ?? port,
    hostname,
    url,
    stop: () => {
      server.stop(true);
      for (const t of transports.values()) void t.close();
      transports.clear();
    },
  };
}

function jsonRpcError(code: number, message: string, status: number): Response {
  return new Response(
    JSON.stringify({ jsonrpc: "2.0", error: { code, message }, id: null }),
    { status, headers: { "content-type": "application/json" } },
  );
}
