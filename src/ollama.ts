import type { Message, ModelInfo } from "./types.ts";

const BASE = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";

export async function checkConnection(): Promise<boolean> {
  try {
    const r = await fetch(`${BASE}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    return r.ok;
  } catch {
    return false;
  }
}

export async function listModels(): Promise<ModelInfo[]> {
  const r = await fetch(`${BASE}/api/tags`);
  if (!r.ok) throw new Error(`Ollama returned ${r.status}`);
  const data = (await r.json()) as {
    models?: Array<{
      name: string;
      size: number;
      details?: {
        family?: string;
        parameter_size?: string;
        quantization_level?: string;
      };
    }>;
  };
  const models = data.models ?? [];
  return models.map((m) => ({
    name: m.name,
    size: m.size,
    family: m.details?.family ?? "unknown",
    parameterSize: m.details?.parameter_size ?? "-",
    quantization: m.details?.quantization_level ?? "-",
  }));
}

interface ChatChunk {
  message?: { content?: string; thinking?: string };
  done?: boolean;
  error?: string;
}

export interface PreparedContext {
  system?: string;
  messages: Message[];
  dropped: number;
}

// ponytail: tail truncation by message count; respects turn boundary by slicing
// at a message boundary, never mid-message. Tier 1 (auto-summary) deferred.
export function prepareContext(
  messages: Message[],
  max: number,
  system?: string,
): PreparedContext {
  const limited =
    max > 0 && messages.length > max
      ? messages.slice(messages.length - max)
      : messages;
  return {
    system,
    messages: limited,
    dropped: messages.length - limited.length,
  };
}

export async function chatStream(
  model: string,
  messages: Message[],
  onToken: (chunk: string) => void,
  signal?: AbortSignal,
  system?: string,
  onThinking?: (chunk: string) => void,
): Promise<{ content: string; thinking: string }> {
  const payload: Message[] = system
    ? [{ role: "system", content: system, timestamp: 0 }, ...messages]
    : messages;
  const res = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model,
      stream: true,
      think: true,
      messages: payload.map(toApi),
    }),
    signal,
  });
  if (!res.ok || !res.body) {
    let detail = "";
    try {
      detail = (await res.text()).slice(0, 200);
    } catch {
      // ignore
    }
    throw new Error(
      `Ollama chat failed (${res.status})${detail ? ": " + detail : ""}`,
    );
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let full = "";
  let thought = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let chunk: ChatChunk;
        try {
          chunk = JSON.parse(trimmed);
        } catch {
          continue;
        }
        if (chunk.error) throw new Error(chunk.error);
        const piece = chunk.message?.content ?? "";
        if (piece) {
          full += piece;
          onToken(piece);
        }
        const th = chunk.message?.thinking ?? "";
        if (th && onThinking) {
          thought += th;
          onThinking(th);
        }
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return { content: full, thinking: thought };
}

function toApi(m: Message) {
  return { role: m.role, content: m.content };
}

export async function generateTitle(
  prompt: string,
  model: string,
): Promise<string> {
  const instr = [
    {
      role: "system" as const,
      content:
        "Generate a concise title (3-5 words, no quotes, no punctuation) summarizing the user's request.",
    },
    { role: "user" as const, content: prompt },
  ];
  try {
    const res = await fetch(`${BASE}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        messages: instr,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return truncate(prompt);
    const data = (await res.json()) as { message?: { content?: string } };
    const title = (data.message?.content ?? "").trim().replace(/["'\n.]/g, "");
    return title ? title.slice(0, 60) : truncate(prompt);
  } catch {
    return truncate(prompt);
  }
}

function truncate(s: string, n = 40): string {
  const t = s.trim().replace(/\s+/g, " ");
  return t.length > n ? t.slice(0, n) + "…" : t || "New Chat";
}
