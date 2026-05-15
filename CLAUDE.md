# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Model Context Protocol (MCP) server built with Bun + TypeScript. It exposes three weather simulation tools (`get_current_weather`, `get_forecast`, `list_supported_cities`) over two transport protocols: stdio (local MCP clients) and Streamable HTTP (remote clients).

## Commands

```bash
bun install            # install dependencies
bun run start          # run stdio transport (default)
bun run start:http     # run HTTP transport on :3000/mcp
bun run start:both     # run both transports in one process
bun run dev            # stdio with --watch
bun run dev:http       # HTTP with --watch
bun run test           # run all tests (bun test)
bun run typecheck      # tsc --noEmit
bun run check          # biome lint + format (fixes)
bun run lint           # biome lint only
bun run format         # biome format --write
```

Running a single test file: `bun test tests/weather.test.ts`

CLI flags on `src/index.ts`: `--stdio`, `--http`, `--both`, `--port=4000`, `--host=0.0.0.0`.
Env vars: `MCP_HTTP=1`, `MCP_STDIO=1`, `PORT`/`MCP_PORT`, `MCP_HOST`.

## Architecture

**Entry point** — [src/index.ts](src/index.ts) parses CLI flags/env vars and bootstraps one or both transports. Default (no flags) is stdio only.

**Server factory** — [src/server.ts](src/server.ts) exports `createServer()` which constructs an `McpServer` instance with three tools registered via Zod schemas. Call this once per transport session.

**Transports:**
- [src/stdio.ts](src/stdio.ts) — wraps `StdioServerTransport` from the MCP SDK. Single server instance for the lifetime of the process.
- [src/http.ts](src/http.ts) — `Bun.serve` on `POST/GET/DELETE /mcp`. Stateful sessions: `initialize` creates a new `McpServer` + transport pair keyed by `Mcp-Session-Id` header. `GET /health` returns `ok`.

**Simulation** — [src/weather.ts](src/weather.ts) — pure functions. Deterministic output seeded by `(city, date)` via a hash-based PRNG. City profiles define base temperature, variance, humidity, wind, and conditions. Unknown cities fall back to a default profile.

**Tests:**
- [tests/weather.test.ts](tests/weather.test.ts) — unit tests for pure simulation functions
- [tests/mcp-server.test.ts](tests/mcp-server.test.ts) — hand-written stdio JSON-RPC client, spawns the server as a subprocess
- [tests/mcp-http.test.ts](tests/mcp-http.test.ts) — hand-written HTTP JSON-RPC client, starts `startHttp()` directly
- [tests/mcp-client-sdk.test.ts](tests/mcp-client-sdk.test.ts) — official MCP Client SDK over both transports

## Tech Stack

- **Runtime**: Bun 1.x (native TypeScript, no build step)
- **MCP SDK**: `@modelcontextprotocol/sdk` ^1.29.0
- **Validation**: Zod ^4
- **Lint/format**: Biome
- **TS config**: `module: Preserve`, `verbatimModuleSyntax`, strict, `noEmit`
