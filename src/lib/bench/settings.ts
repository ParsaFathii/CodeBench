// CodeBench — application settings (persisted in SQLite, key/value JSON)

import { db } from "@/lib/db";

export interface AppSettings {
  ai: {
    provider: "disabled" | "zai" | "ollama";
    model: string | null;
    ollamaUrl: string | null;
    temperature: number;
  };
  defaults: {
    warmup: number;
    repetitions: number;
    timeoutMs: number;
    seed: number;
  };
  regressionThresholdPct: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  ai: {
    provider: "zai",
    model: null,
    ollamaUrl: "http://localhost:11434",
    temperature: 0.2,
  },
  defaults: {
    warmup: 2,
    repetitions: 5,
    timeoutMs: 180_000,
    seed: 20261016,
  },
  regressionThresholdPct: 10,
};

const SETTINGS_KEY = "app";

export async function getSettings(): Promise<AppSettings> {
  const row = await db.setting.findUnique({ where: { key: SETTINGS_KEY } });
  if (!row) return DEFAULT_SETTINGS;
  try {
    const parsed = JSON.parse(row.value) as Partial<AppSettings>;
    return {
      ai: { ...DEFAULT_SETTINGS.ai, ...parsed.ai },
      defaults: { ...DEFAULT_SETTINGS.defaults, ...parsed.defaults },
      regressionThresholdPct: parsed.regressionThresholdPct ?? DEFAULT_SETTINGS.regressionThresholdPct,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(next: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getSettings();
  const merged: AppSettings = {
    ai: { ...current.ai, ...next.ai },
    defaults: { ...current.defaults, ...next.defaults },
    regressionThresholdPct: next.regressionThresholdPct ?? current.regressionThresholdPct,
  };
  if (merged.ai.provider === "ollama" && !merged.ai.ollamaUrl) {
    throw new Error("Ollama provider requires a base URL");
  }
  if (merged.defaults.warmup < 0 || merged.defaults.repetitions < 2) {
    throw new Error("Repetitions must be at least 2; warm-up must be at least 0");
  }
  await db.setting.upsert({
    where: { key: SETTINGS_KEY },
    update: { value: JSON.stringify(merged) },
    create: { key: SETTINGS_KEY, value: JSON.stringify(merged) },
  });
  return merged;
}
