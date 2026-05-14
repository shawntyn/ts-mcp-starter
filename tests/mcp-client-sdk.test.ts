import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { startHttp } from "../src/http.ts";

/**
 * Uses the official MCP Client SDK to drive the weather server through both
 * stdio and Streamable HTTP transports.
 */

describe("weather MCP via SDK Client (stdio)", () => {
  let transport: StdioClientTransport;
  let client: Client;

  beforeAll(async () => {
    transport = new StdioClientTransport({
      command: "bun",
      args: ["run", `${import.meta.dir}/../src/index.ts`, "--stdio"],
      stderr: "inherit",
    });

    client = new Client({ name: "bun-test-sdk-stdio", version: "0" });
    await client.connect(transport);
  });

  afterAll(async () => {
    await transport.close();
  });

  test("sdk lists all three weather tools", async () => {
    const result = await client.listTools();
    const names = result.tools.map((t) => t.name).sort();
    expect(names).toEqual(["get_current_weather", "get_forecast", "list_supported_cities"]);
  });

  test("sdk can call get_current_weather", async () => {
    const result = await client.callTool({
      name: "get_current_weather",
      arguments: { city: "Tokyo", units: "metric" },
    });

    expect(result.isError).toBeFalsy();
    const items = result.content as Array<{ type: string; text: string }>;
    const text = items[0]?.type === "text" ? items[0].text : "";
    const payload = JSON.parse(text) as {
      city: string;
      units: string;
      temperature: number;
    };
    expect(payload.city).toBe("Tokyo");
    expect(payload.units).toBe("C");
    expect(typeof payload.temperature).toBe("number");
  });

  test("sdk can call get_forecast with imperial units", async () => {
    const result = await client.callTool({
      name: "get_forecast",
      arguments: { city: "Singapore", days: 2, units: "imperial" },
    });

    expect(result.isError).toBeFalsy();
    const items = result.content as Array<{ type: string; text: string }>;
    const text = items[0]?.type === "text" ? items[0].text : "";
    const payload = JSON.parse(text) as { units: string; days: unknown[] };
    expect(payload.units).toBe("F");
    expect(payload.days).toHaveLength(2);
  });

  test("sdk ping succeeds", async () => {
    const pong = await client.ping();
    expect(pong).toBeDefined();
  });

  test("sdk rejects bad arguments as an error result", async () => {
    // `days: 99` violates the zod constraint `max: 7`
    const result = await client.callTool({
      name: "get_forecast",
      arguments: { city: "Tokyo", days: 99 },
    });
    expect(result.isError).toBe(true);
  });
});

describe("weather MCP via SDK Client (Streamable HTTP)", () => {
  let httpServer: ReturnType<typeof startHttp>;
  let transport: StreamableHTTPClientTransport;
  let client: Client;

  beforeAll(async () => {
    httpServer = startHttp({ port: 0, hostname: "127.0.0.1" });
    transport = new StreamableHTTPClientTransport(new URL(httpServer.url));

    client = new Client({ name: "bun-test-sdk-http", version: "0" });
    await client.connect(transport);
  });

  afterAll(async () => {
    await transport.close();
    httpServer.stop();
  });

  test("sdk lists tools over HTTP", async () => {
    const result = await client.listTools();
    const names = result.tools.map((t) => t.name).sort();
    expect(names).toEqual(["get_current_weather", "get_forecast", "list_supported_cities"]);
  });

  test("sdk callTool works over HTTP", async () => {
    const result = await client.callTool({
      name: "get_current_weather",
      arguments: { city: "London", units: "metric" },
    });

    expect(result.isError).toBeFalsy();
    const items = result.content as Array<{ type: string; text: string }>;
    const text = items[0]?.type === "text" ? items[0].text : "";
    const payload = JSON.parse(text) as { city: string; units: string };
    expect(payload.city).toBe("London");
    expect(payload.units).toBe("C");
  });

  test("sdk ping over HTTP succeeds", async () => {
    const pong = await client.ping();
    expect(pong).toBeDefined();
  });

  test("sdk exposes server capabilities", () => {
    const caps = client.getServerCapabilities();
    expect(caps?.tools?.listChanged).toBe(true);
  });

  test("sdk exposes server version info", () => {
    const version = client.getServerVersion();
    expect(version?.name).toBe("weather-demo");
    expect(version?.version).toBe("0.1.0");
  });
});
