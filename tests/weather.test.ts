import { describe, expect, test } from "bun:test";
import { getCurrentWeather, getForecast, listSupportedCities } from "../src/weather.ts";

describe("weather (pure functions)", () => {
  test("getCurrentWeather returns a coherent metric report", () => {
    const r = getCurrentWeather("Tokyo", "metric");
    expect(r.city).toBe("Tokyo");
    expect(r.units).toBe("C");
    expect(r.source).toBe("simulated");
    expect(typeof r.temperature).toBe("number");
    expect(r.humidity).toBeGreaterThanOrEqual(10);
    expect(r.humidity).toBeLessThanOrEqual(100);
    expect(r.windKph).toBeGreaterThanOrEqual(0);
    expect(new Date(r.observedAt).toString()).not.toBe("Invalid Date");
  });

  test("imperial units convert temperature to Fahrenheit", () => {
    const metric = getCurrentWeather("Singapore", "metric");
    const imperial = getCurrentWeather("Singapore", "imperial");
    expect(imperial.units).toBe("F");
    const expectedF = metric.temperature * (9 / 5) + 32;
    expect(imperial.temperature).toBeCloseTo(expectedF, 0);
  });

  test("getCurrentWeather is deterministic within the same hour", () => {
    const { observedAt: _a, ...a } = getCurrentWeather("London");
    const { observedAt: _b, ...b } = getCurrentWeather("London");
    expect(a).toEqual(b);
  });

  test("unknown cities fall back to a default profile", () => {
    const r = getCurrentWeather("Atlantis");
    expect(r.city).toBe("Atlantis");
    expect(Number.isFinite(r.temperature)).toBe(true);
  });

  test("getForecast returns the requested number of days with high >= low", () => {
    const f = getForecast("New York", 5, "metric");
    expect(f.days).toHaveLength(5);
    for (const day of f.days) {
      expect(day.high).toBeGreaterThanOrEqual(day.low);
      expect(day.precipitationChance).toBeGreaterThanOrEqual(0);
      expect(day.precipitationChance).toBeLessThanOrEqual(100);
      expect(day.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  test("listSupportedCities returns a non-empty title-cased list", () => {
    const cities = listSupportedCities();
    expect(cities.length).toBeGreaterThan(0);
    expect(cities).toContain("Tokyo");
    expect(cities).toContain("San Francisco");
  });
});
