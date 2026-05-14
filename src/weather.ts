export type Units = "metric" | "imperial";

export interface WeatherReport {
  city: string;
  observedAt: string;
  conditions: string;
  temperature: number;
  feelsLike: number;
  units: "C" | "F";
  humidity: number;
  windKph: number;
  source: "simulated";
}

export interface ForecastDay {
  date: string;
  conditions: string;
  high: number;
  low: number;
  precipitationChance: number;
}

export interface Forecast {
  city: string;
  units: "C" | "F";
  days: ForecastDay[];
  source: "simulated";
}

interface CityProfile {
  baseTempC: number;
  variance: number;
  humidity: number;
  windKph: number;
  conditions: readonly string[];
}

const CITY_PROFILES: Record<string, CityProfile> = {
  tokyo: {
    baseTempC: 18,
    variance: 8,
    humidity: 65,
    windKph: 12,
    conditions: ["Clear", "Partly Cloudy", "Light Rain", "Cloudy"],
  },
  "san francisco": {
    baseTempC: 16,
    variance: 5,
    humidity: 72,
    windKph: 18,
    conditions: ["Foggy", "Partly Cloudy", "Clear", "Windy"],
  },
  singapore: {
    baseTempC: 29,
    variance: 3,
    humidity: 84,
    windKph: 8,
    conditions: ["Thunderstorms", "Humid", "Partly Cloudy", "Light Rain"],
  },
  london: {
    baseTempC: 12,
    variance: 6,
    humidity: 78,
    windKph: 16,
    conditions: ["Overcast", "Light Rain", "Drizzle", "Cloudy"],
  },
  "new york": {
    baseTempC: 15,
    variance: 10,
    humidity: 60,
    windKph: 14,
    conditions: ["Clear", "Partly Cloudy", "Rain", "Snow"],
  },
  sydney: {
    baseTempC: 22,
    variance: 6,
    humidity: 68,
    windKph: 20,
    conditions: ["Sunny", "Clear", "Partly Cloudy", "Showers"],
  },
};

const DEFAULT_PROFILE: CityProfile = {
  baseTempC: 20,
  variance: 8,
  humidity: 60,
  windKph: 12,
  conditions: ["Clear", "Partly Cloudy", "Cloudy", "Light Rain"],
};

function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state = Math.imul(state ^ (state >>> 15), 2246822507);
    state = Math.imul(state ^ (state >>> 13), 3266489909);
    state ^= state >>> 16;
    return (state >>> 0) / 4294967296;
  };
}

function profileFor(city: string): CityProfile {
  return CITY_PROFILES[city.trim().toLowerCase()] ?? DEFAULT_PROFILE;
}

function cToF(c: number): number {
  return c * (9 / 5) + 32;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function pick<T>(rng: () => number, items: readonly T[]): T {
  const idx = Math.floor(rng() * items.length);
  return items[Math.min(idx, items.length - 1)] as T;
}

export function getCurrentWeather(city: string, units: Units = "metric"): WeatherReport {
  const profile = profileFor(city);
  const dayKey = new Date().toISOString().slice(0, 13);
  const rng = seededRandom(hashString(`${city.toLowerCase()}|${dayKey}`));

  const tempC = profile.baseTempC + (rng() - 0.5) * 2 * profile.variance;
  const feelsLikeC = tempC - rng() * 2;
  const humidity = Math.min(100, Math.max(10, profile.humidity + (rng() - 0.5) * 20));
  const windKph = Math.max(0, profile.windKph + (rng() - 0.5) * 10);
  const conditions = pick(rng, profile.conditions);

  const isMetric = units === "metric";
  return {
    city,
    observedAt: new Date().toISOString(),
    conditions,
    temperature: round1(isMetric ? tempC : cToF(tempC)),
    feelsLike: round1(isMetric ? feelsLikeC : cToF(feelsLikeC)),
    units: isMetric ? "C" : "F",
    humidity: Math.round(humidity),
    windKph: round1(windKph),
    source: "simulated",
  };
}

export function getForecast(city: string, days: number, units: Units = "metric"): Forecast {
  const profile = profileFor(city);
  const isMetric = units === "metric";
  const today = new Date();
  const result: ForecastDay[] = [];

  for (let i = 0; i < days; i++) {
    const date = new Date(today);
    date.setUTCDate(today.getUTCDate() + i);
    const dateStr = date.toISOString().slice(0, 10);
    const rng = seededRandom(hashString(`${city.toLowerCase()}|${dateStr}|forecast`));

    const midC = profile.baseTempC + (rng() - 0.5) * 2 * profile.variance;
    const highC = midC + 2 + rng() * 4;
    const lowC = midC - 2 - rng() * 4;
    const precip = Math.round(rng() * 100);

    result.push({
      date: dateStr,
      conditions: pick(rng, profile.conditions),
      high: round1(isMetric ? highC : cToF(highC)),
      low: round1(isMetric ? lowC : cToF(lowC)),
      precipitationChance: precip,
    });
  }

  return {
    city,
    units: isMetric ? "C" : "F",
    days: result,
    source: "simulated",
  };
}

export function listSupportedCities(): string[] {
  return Object.keys(CITY_PROFILES).map((name) => name.replace(/\b\w/g, (c) => c.toUpperCase()));
}
