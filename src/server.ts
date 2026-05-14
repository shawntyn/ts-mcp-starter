import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getCurrentWeather, getForecast, listSupportedCities } from "./weather.ts";

/**
 * Builds a fresh McpServer instance with the weather tools registered.
 * A new server is created per HTTP session (per the Streamable HTTP guidance)
 * and a single instance is reused for stdio.
 */
export function createServer(): McpServer {
  const server = new McpServer({
    name: "weather-demo",
    version: "0.1.0",
  });

  server.registerTool(
    "get_current_weather",
    {
      title: "Get current weather",
      description:
        "Returns simulated current weather for a city. Use this for any 'what is the weather right now' style question.",
      inputSchema: {
        city: z.string().describe("City name, e.g. 'Tokyo', 'San Francisco', 'Singapore'."),
        units: z
          .enum(["metric", "imperial"])
          .default("metric")
          .describe("Temperature units. 'metric' = Celsius, 'imperial' = Fahrenheit."),
      },
    },
    async ({ city, units }) => ({
      content: [{ type: "text", text: JSON.stringify(getCurrentWeather(city, units), null, 2) }],
    }),
  );

  server.registerTool(
    "get_forecast",
    {
      title: "Get multi-day forecast",
      description: "Returns a simulated N-day forecast for a city (1-7 days).",
      inputSchema: {
        city: z.string().describe("City name."),
        days: z.number().int().min(1).max(7).default(3).describe("Number of forecast days (1-7)."),
        units: z.enum(["metric", "imperial"]).default("metric"),
      },
    },
    async ({ city, days, units }) => ({
      content: [{ type: "text", text: JSON.stringify(getForecast(city, days, units), null, 2) }],
    }),
  );

  server.registerTool(
    "list_supported_cities",
    {
      title: "List supported cities",
      description:
        "Lists cities with curated baseline climate data. Other cities still work via fallback.",
      inputSchema: {},
    },
    async () => ({
      content: [{ type: "text", text: JSON.stringify(listSupportedCities(), null, 2) }],
    }),
  );

  return server;
}
