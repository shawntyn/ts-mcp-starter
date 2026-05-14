# ts-mcp-starter

A minimal **Bun + TypeScript + Biome** starter that ships a working **MCP (Model Context Protocol)** server simulating weather queries. No external API calls — responses are deterministic mock data seeded by city + date.

## Stack

- **Runtime**: [Bun](https://bun.com) 1.x (TypeScript natively, no build step required)
- **Language**: TypeScript (strict)
- **Lint/format**: [Biome](https://biomejs.dev)
- **MCP**: [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk) over stdio

## Setup

```bash
bun install
```

## Tools exposed by the server

| Tool | Description |
| --- | --- |
| `get_current_weather` | Simulated current conditions for any city. Args: `city`, `units` (`metric` / `imperial`). |
| `get_forecast` | 1–7 day simulated forecast. Args: `city`, `days`, `units`. |
| `list_supported_cities` | Cities with curated baseline climate (others fall back to a default profile). |

All output is JSON text. Values are deterministic per `(city, hour)` for current weather and per `(city, date)` for forecasts.

## Run locally

The same server supports **two MCP transports simultaneously**:

| Transport | When to use | How to start |
| --- | --- | --- |
| **stdio** | Local MCP clients that launch the process (Cursor, Claude Desktop, etc.) | `bun run start` |
| **Streamable HTTP** | Remote use — any MCP client that speaks the [Streamable HTTP transport](https://modelcontextprotocol.io/docs/concepts/transports) | `bun run start:http` |
| **Both at once** | Single process exposes stdio *and* HTTP | `bun run start:both` |

Useful scripts:

```bash
bun run start          # stdio only
bun run start:http     # Streamable HTTP on http://127.0.0.1:3000/mcp
bun run start:both     # stdio + HTTP in one process
bun run dev            # stdio, watch mode
bun run dev:http       # HTTP, watch mode
bun run test           # bun test (stdio + HTTP + unit)
bun run typecheck      # tsc --noEmit
bun run check          # biome lint + format
```

CLI flags (also work in any combination): `--stdio`, `--http`, `--both`, `--port=4000`, `--host=0.0.0.0`.
Env vars: `MCP_HTTP=1`, `MCP_STDIO=1`, `PORT` / `MCP_PORT`, `MCP_HOST`.

### Streamable HTTP details

- Endpoint: `POST/GET/DELETE /mcp` on the configured port (default `3000`).
- Health check: `GET /health` → `ok`.
- Stateful sessions: the server issues an `Mcp-Session-Id` header on `initialize`; clients must echo it on every subsequent request. Each session gets its own `McpServer` instance.
- Supports both SSE streaming responses and JSON responses (negotiated by the client's `Accept` header).
- DELETE `/mcp` with a valid `Mcp-Session-Id` terminates that session.

## Quick smoke test (no client needed)

```bash
{
  printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}'
  printf '%s\n' '{"jsonrpc":"2.0","method":"notifications/initialized"}'
  printf '%s\n' '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
  printf '%s\n' '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_current_weather","arguments":{"city":"Tokyo"}}}'
} | bun run src/index.ts
```

## Wire it into an MCP client

**Local (stdio)** — Cursor / Claude Desktop `mcp.json`:

```json
{
  "mcpServers": {
    "weather-demo": {
      "command": "bun",
      "args": ["run", "/absolute/path/to/ts-mcp-starter/src/index.ts"]
    }
  }
}
```

**Remote (Streamable HTTP)** — run `bun run start:http` on the host, then point a Streamable-HTTP-capable MCP client at:

```
http://your-host:3000/mcp
```

## Project layout

```
src/
  index.ts     CLI dispatcher (--stdio / --http / --both)
  server.ts    createServer() factory: McpServer with the three weather tools
  stdio.ts     stdio transport bootstrap
  http.ts     Streamable HTTP transport on Bun.serve (stateful sessions)
  weather.ts   Pure functions that generate simulated weather data
tests/
  weather.test.ts          unit tests for the simulation functions
  mcp-server.test.ts       end-to-end JSON-RPC over stdio (hand-written client)
  mcp-http.test.ts         end-to-end JSON-RPC over Streamable HTTP (hand-written client)
  mcp-client-sdk.test.ts   end-to-end tests via the official MCP Client SDK (stdio + HTTP)
biome.json     Lint + format config
bunfig.toml    Bun config
tsconfig.json  Strict TS for editor / typecheck
```
