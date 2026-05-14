#!/usr/bin/env bun
import { startHttp } from "./http.ts";
import { startStdio } from "./stdio.ts";

interface CliFlags {
  stdio: boolean;
  http: boolean;
  port?: number;
  host?: string;
}

function parseArgs(argv: string[]): CliFlags {
  const flags: CliFlags = { stdio: false, http: false };
  for (const arg of argv) {
    if (arg === "--stdio") flags.stdio = true;
    else if (arg === "--http") flags.http = true;
    else if (arg === "--both") {
      flags.stdio = true;
      flags.http = true;
    } else if (arg.startsWith("--port=")) flags.port = Number(arg.slice(7));
    else if (arg.startsWith("--host=")) flags.host = arg.slice(7);
  }

  // Env fallbacks.
  if (!flags.http && (process.env.MCP_HTTP === "1" || process.env.MCP_HTTP === "true")) {
    flags.http = true;
  }
  if (!flags.stdio && (process.env.MCP_STDIO === "1" || process.env.MCP_STDIO === "true")) {
    flags.stdio = true;
  }

  // Default: stdio only — keeps backward compatibility for MCP clients that
  // launch this process. Pass --http (or --both) to enable remote use.
  if (!flags.stdio && !flags.http) {
    flags.stdio = true;
  }
  return flags;
}

const flags = parseArgs(process.argv.slice(2));

if (flags.http) {
  startHttp({ port: flags.port, hostname: flags.host });
}
if (flags.stdio) {
  await startStdio();
}
