import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Subprocess } from "bun";

interface JsonRpcResponse<T = unknown> {
  jsonrpc: "2.0";
  id: number;
  result?: T;
  error?: { code: number; message: string };
}

interface ToolListResult {
  tools: { name: string; description?: string; inputSchema: unknown }[];
}

interface ToolCallResult {
  content: { type: string; text: string }[];
  isError?: boolean;
}

class McpStdioClient {
  private proc: Subprocess<"pipe", "pipe", "pipe">;
  private pending = new Map<number, (msg: JsonRpcResponse) => void>();
  private buffer = "";
  private nextId = 1;
  private readerDone: Promise<void>;
  private encoder = new TextEncoder();
  private decoder = new TextDecoder();

  constructor(entry: string) {
    this.proc = Bun.spawn({
      cmd: ["bun", "run", entry],
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    }) as Subprocess<"pipe", "pipe", "pipe">;
    this.readerDone = this.readLoop();
  }

  private async readLoop(): Promise<void> {
    for await (const chunk of this.proc.stdout) {
      this.buffer += this.decoder.decode(chunk, { stream: true });
      let nl = this.buffer.indexOf("\n");
      while (nl !== -1) {
        const line = this.buffer.slice(0, nl).trim();
        this.buffer = this.buffer.slice(nl + 1);
        if (line.length > 0) {
          try {
            const msg = JSON.parse(line) as JsonRpcResponse;
            if (typeof msg.id === "number") {
              const resolver = this.pending.get(msg.id);
              if (resolver) {
                this.pending.delete(msg.id);
                resolver(msg);
              }
            }
          } catch {
            // ignore non-JSON lines on stdout
          }
        }
        nl = this.buffer.indexOf("\n");
      }
    }
  }

  private async send(payload: object): Promise<void> {
    this.proc.stdin.write(this.encoder.encode(`${JSON.stringify(payload)}\n`));
    await this.proc.stdin.flush();
  }

  async request<T>(method: string, params?: unknown): Promise<T> {
    const id = this.nextId++;
    const promise = new Promise<JsonRpcResponse<T>>((resolve) => {
      this.pending.set(id, resolve as (msg: JsonRpcResponse) => void);
    });
    await this.send({ jsonrpc: "2.0", id, method, params });
    const response = await promise;
    if (response.error) {
      throw new Error(`MCP error ${response.error.code}: ${response.error.message}`);
    }
    return response.result as T;
  }

  async notify(method: string, params?: unknown): Promise<void> {
    await this.send({ jsonrpc: "2.0", method, params });
  }

  async initialize(): Promise<void> {
    await this.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "bun-test", version: "0" },
    });
    await this.notify("notifications/initialized");
  }

  async close(): Promise<void> {
    try {
      this.proc.stdin.end();
    } catch {
      // already closed
    }
    this.proc.kill();
    await this.proc.exited;
    await this.readerDone.catch(() => undefined);
  }
}

describe("weather MCP server (stdio)", () => {
  let client: McpStdioClient;

  beforeAll(async () => {
    client = new McpStdioClient(`${import.meta.dir}/../src/index.ts`);
    await client.initialize();
  });

  afterAll(async () => {
    await client.close();
  });

  test("tools/list exposes the three weather tools", async () => {
    const result = await client.request<ToolListResult>("tools/list");
    const names = result.tools.map((t) => t.name).sort();
    expect(names).toEqual(["get_current_weather", "get_forecast", "list_supported_cities"]);
  });

  test("get_current_weather returns parseable JSON content", async () => {
    const result = await client.request<ToolCallResult>("tools/call", {
      name: "get_current_weather",
      arguments: { city: "Tokyo", units: "metric" },
    });
    expect(result.isError).toBeFalsy();
    expect(result.content[0]?.type).toBe("text");
    const payload = JSON.parse(result.content[0]?.text ?? "");
    expect(payload.city).toBe("Tokyo");
    expect(payload.units).toBe("C");
    expect(typeof payload.temperature).toBe("number");
  });

  test("get_forecast respects the requested day count", async () => {
    const result = await client.request<ToolCallResult>("tools/call", {
      name: "get_forecast",
      arguments: { city: "Singapore", days: 4, units: "imperial" },
    });
    const payload = JSON.parse(result.content[0]?.text ?? "");
    expect(payload.units).toBe("F");
    expect(payload.days).toHaveLength(4);
    for (const day of payload.days) {
      expect(day.high).toBeGreaterThanOrEqual(day.low);
    }
  });

  test("list_supported_cities includes curated cities", async () => {
    const result = await client.request<ToolCallResult>("tools/call", {
      name: "list_supported_cities",
      arguments: {},
    });
    const payload = JSON.parse(result.content[0]?.text ?? "") as string[];
    expect(payload).toContain("Tokyo");
    expect(payload).toContain("Singapore");
  });

  test("invalid arguments surface as a tool error", async () => {
    // `days` must be 1-7; 99 should be rejected by zod validation.
    let threw = false;
    try {
      await client.request<ToolCallResult>("tools/call", {
        name: "get_forecast",
        arguments: { city: "Tokyo", days: 99 },
      });
    } catch (err) {
      threw = true;
      expect((err as Error).message).toMatch(/error|invalid/i);
    }
    if (!threw) {
      // Some SDK versions return an error result rather than throwing.
      // Re-call and assert the result shape instead.
      const result = await client.request<ToolCallResult>("tools/call", {
        name: "get_forecast",
        arguments: { city: "Tokyo", days: 99 },
      });
      expect(result.isError).toBe(true);
    }
  });
});
