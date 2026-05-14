import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startHttp } from "../src/http.ts";

interface JsonRpcResponse<T = unknown> {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: T;
  error?: { code: number; message: string };
}

interface ToolListResult {
  tools: { name: string }[];
}
interface ToolCallResult {
  content: { type: string; text: string }[];
  isError?: boolean;
}

class StreamableHttpClient {
  private nextId = 1;
  private sessionId: string | undefined;
  constructor(private readonly url: string) {}

  private async post(payload: unknown): Promise<Response> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      // The transport requires this Accept set; SSE is its preferred streaming mode.
      accept: "application/json, text/event-stream",
    };
    if (this.sessionId) headers["mcp-session-id"] = this.sessionId;
    return fetch(this.url, { method: "POST", headers, body: JSON.stringify(payload) });
  }

  /** Parses a JSON-RPC response from either application/json or text/event-stream. */
  private async parseResponse<T>(res: Response): Promise<JsonRpcResponse<T>> {
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      return (await res.json()) as JsonRpcResponse<T>;
    }
    if (ct.includes("text/event-stream")) {
      const text = await res.text();
      // SSE frames: lines starting with `data: ` separated by blank lines.
      for (const block of text.split(/\r?\n\r?\n/)) {
        const dataLines = block
          .split(/\r?\n/)
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).trimStart());
        if (dataLines.length === 0) continue;
        const data = dataLines.join("\n");
        if (!data) continue;
        try {
          const parsed = JSON.parse(data) as JsonRpcResponse<T>;
          // Skip transport-internal "priming"/keepalive frames lacking id+result+error.
          if (parsed.id !== undefined || parsed.result || parsed.error) return parsed;
        } catch {
          // ignore non-JSON SSE comments
        }
      }
      throw new Error("No JSON-RPC frame found in SSE stream");
    }
    throw new Error(`Unexpected content-type: ${ct}`);
  }

  async request<T>(method: string, params?: unknown): Promise<T> {
    const id = this.nextId++;
    const res = await this.post({ jsonrpc: "2.0", id, method, params });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    }
    const sid = res.headers.get("mcp-session-id");
    if (sid) this.sessionId = sid;
    const body = await this.parseResponse<T>(res);
    if (body.error) throw new Error(`MCP error ${body.error.code}: ${body.error.message}`);
    return body.result as T;
  }

  async notify(method: string, params?: unknown): Promise<void> {
    const res = await this.post({ jsonrpc: "2.0", method, params });
    // Notifications return 202 Accepted with no body.
    if (!res.ok && res.status !== 202) {
      throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    }
    await res.body?.cancel();
  }

  async initialize(): Promise<void> {
    await this.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "bun-test-http", version: "0" },
    });
    await this.notify("notifications/initialized");
  }

  async terminate(): Promise<void> {
    if (!this.sessionId) return;
    await fetch(this.url, {
      method: "DELETE",
      headers: { "mcp-session-id": this.sessionId },
    });
  }

  getSessionId(): string | undefined {
    return this.sessionId;
  }
}

describe("weather MCP server (Streamable HTTP)", () => {
  let httpServer: ReturnType<typeof startHttp>;
  let client: StreamableHttpClient;

  beforeAll(async () => {
    // Port 0 → let the OS assign a free port.
    httpServer = startHttp({ port: 0, hostname: "127.0.0.1" });
    client = new StreamableHttpClient(httpServer.url);
    await client.initialize();
  });

  afterAll(async () => {
    await client.terminate();
    httpServer.stop();
  });

  test("issues a session ID on initialize", () => {
    expect(client.getSessionId()).toBeTruthy();
    expect(client.getSessionId()).toMatch(/[0-9a-f-]{36}/i);
  });

  test("tools/list returns all three weather tools", async () => {
    const result = await client.request<ToolListResult>("tools/list");
    const names = result.tools.map((t) => t.name).sort();
    expect(names).toEqual(["get_current_weather", "get_forecast", "list_supported_cities"]);
  });

  test("get_current_weather works end-to-end over HTTP", async () => {
    const result = await client.request<ToolCallResult>("tools/call", {
      name: "get_current_weather",
      arguments: { city: "Tokyo", units: "metric" },
    });
    const payload = JSON.parse(result.content[0]?.text ?? "");
    expect(payload.city).toBe("Tokyo");
    expect(payload.units).toBe("C");
    expect(typeof payload.temperature).toBe("number");
  });

  test("get_forecast works end-to-end over HTTP", async () => {
    const result = await client.request<ToolCallResult>("tools/call", {
      name: "get_forecast",
      arguments: { city: "Singapore", days: 2, units: "imperial" },
    });
    const payload = JSON.parse(result.content[0]?.text ?? "");
    expect(payload.units).toBe("F");
    expect(payload.days).toHaveLength(2);
  });

  test("rejects non-initialize requests without a session id", async () => {
    const res = await fetch(httpServer.url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 99, method: "tools/list" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as JsonRpcResponse;
    expect(body.error?.code).toBe(-32000);
  });

  test("rejects requests with an unknown session id", async () => {
    const res = await fetch(httpServer.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-session-id": "00000000-0000-0000-0000-000000000000",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect([400, 404]).toContain(res.status);
  });

  test("health endpoint responds with ok", async () => {
    const baseUrl = httpServer.url.replace(/\/mcp$/, "");
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    expect((await res.text()).trim()).toBe("ok");
  });
});
