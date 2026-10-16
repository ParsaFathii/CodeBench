// CodeBench — AI provider abstraction
//
// The AI layer is strictly optional: the benchmark engine never depends on
// it. Providers:
//   zai     — built-in z-ai-web-dev-sdk backend (server-side only)
//   ollama  — locally hosted models via OLLAMA base URL (privacy-preserving default for self-hosting)
//   disabled— AI features off; everything else keeps working

import type { AppSettings } from "@/lib/bench/settings";

export interface ProviderStatus {
  provider: "zai" | "ollama" | "disabled";
  available: boolean;
  model: string | null;
  detail: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ProviderAdapter {
  status(): Promise<ProviderStatus>;
  complete(messages: ChatMessage[], temperature: number, timeoutMs: number): Promise<string>;
}

// ---------------------------------------------------------------------------
// z-ai provider (server-side SDK)
// ---------------------------------------------------------------------------

class ZaiProvider implements ProviderAdapter {
  async status(): Promise<ProviderStatus> {
    try {
      const { default: ZAI } = await import("z-ai-web-dev-sdk");
      const zai = await ZAI.create();
      const completion = await zai.chat.completions.create({
        messages: [{ role: "user", content: "ping" }],
        thinking: { type: "disabled" },
      });
      const ok = Boolean(completion.choices?.[0]?.message?.content);
      return {
        provider: "zai",
        available: ok,
        model: "z-ai (server-side SDK)",
        detail: ok ? "reachable" : "empty response",
      };
    } catch (e) {
      return {
        provider: "zai",
        available: false,
        model: null,
        detail: `unavailable: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  async complete(messages: ChatMessage[], temperature: number, timeoutMs: number): Promise<string> {
    const { default: ZAI } = await import("z-ai-web-dev-sdk");
    const zai = await ZAI.create();
    const completion = await Promise.race([
      zai.chat.completions.create({
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        thinking: { type: "disabled" },
        temperature,
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("AI provider timeout")), timeoutMs)),
    ]);
    const content = completion.choices?.[0]?.message?.content;
    if (!content) throw new Error("empty response from z-ai provider");
    return content;
  }
}

// ---------------------------------------------------------------------------
// Ollama provider (local models)
// ---------------------------------------------------------------------------

class OllamaProvider implements ProviderAdapter {
  constructor(private baseUrl: string, private model: string | null) {}

  async status(): Promise<ProviderStatus> {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 3000);
      const res = await fetch(`${this.baseUrl}/api/tags`, { signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) return { provider: "ollama", available: false, model: null, detail: `HTTP ${res.status}` };
      const data = (await res.json()) as { models?: Array<{ name: string }> };
      const models = data.models?.map((m) => m.name) ?? [];
      const model = this.model ?? models[0] ?? null;
      return {
        provider: "ollama",
        available: models.length > 0,
        model,
        detail: models.length > 0 ? `local models: ${models.slice(0, 5).join(", ")}` : "no models installed",
      };
    } catch (e) {
      return {
        provider: "ollama",
        available: false,
        model: null,
        detail: `unreachable at ${this.baseUrl}: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  async complete(messages: ChatMessage[], temperature: number, timeoutMs: number): Promise<string> {
    const model = this.model ?? (await this.status()).model;
    if (!model) throw new Error("no Ollama model configured/installed");
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages,
          stream: false,
          format: "json",
          options: { temperature },
        }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
      const data = (await res.json()) as { message?: { content?: string } };
      const content = data.message?.content;
      if (!content) throw new Error("empty response from Ollama");
      return content;
    } finally {
      clearTimeout(t);
    }
  }
}

class DisabledProvider implements ProviderAdapter {
  async status(): Promise<ProviderStatus> {
    return { provider: "disabled", available: false, model: null, detail: "AI insights disabled in settings" };
  }
  async complete(): Promise<string> {
    throw new Error("AI insights are disabled");
  }
}

export function getProvider(settings: AppSettings): ProviderAdapter {
  switch (settings.ai.provider) {
    case "zai":
      return new ZaiProvider();
    case "ollama":
      return new OllamaProvider(settings.ai.ollamaUrl ?? "http://localhost:11434", settings.ai.model);
    default:
      return new DisabledProvider();
  }
}
