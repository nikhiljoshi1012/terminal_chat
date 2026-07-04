import { test, expect, describe, beforeEach, afterEach } from "bun:test"
import type { Message } from "../src/types.ts"
import { supportsThinking } from "../src/ollama.ts"

describe("ollama.supportsThinking", () => {
  test("known thinking families return true", () => {
    expect(supportsThinking("qwen3:4b")).toBe(true)
    expect(supportsThinking("qwq:32b")).toBe(true)
    expect(supportsThinking("deepseek-r1:8b")).toBe(true)
  })
  test("non-thinking models return false", () => {
    expect(supportsThinking("gemma3:4b")).toBe(false)
    expect(supportsThinking("llama3.2:3b")).toBe(false)
    expect(supportsThinking("mistral:7b")).toBe(false)
  })
})

// ponytail: mock global fetch; restore after each test
const realFetch = globalThis.fetch

function ndjsonResponse(parts: string[]): Response {
  const stream = new ReadableStream({
    start(controller) {
      for (const p of parts) controller.enqueue(new TextEncoder().encode(p))
      controller.close()
    },
  })
  return new Response(stream, { status: 200, headers: { "content-type": "application/json" } })
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

describe("ollama.checkConnection", () => {
  afterEach(() => { globalThis.fetch = realFetch })

  test("true when /api/tags returns ok", async () => {
    globalThis.fetch = (() => Promise.resolve(new Response("", { status: 200 }))) as typeof fetch
    const o = await import("../src/ollama.ts")
    expect(await o.checkConnection()).toBe(true)
  })

  test("false on network error", async () => {
    globalThis.fetch = (() => Promise.reject(new Error("net"))) as typeof fetch
    const o = await import("../src/ollama.ts")
    expect(await o.checkConnection()).toBe(false)
  })

  test("false on non-ok status", async () => {
    globalThis.fetch = (() => Promise.resolve(new Response("", { status: 500 }))) as typeof fetch
    const o = await import("../src/ollama.ts")
    expect(await o.checkConnection()).toBe(false)
  })
})

describe("ollama.listModels", () => {
  afterEach(() => { globalThis.fetch = realFetch })

  test("maps models and details with defaults for missing fields", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(
        jsonResponse({ models: [{ name: "a", size: 1000 }, { name: "b", size: 2e9, details: { family: "llama", parameter_size: "8B", quantization_level: "q4_0" } }] }),
      )) as typeof fetch
    const o = await import("../src/ollama.ts")
    const list = await o.listModels()
    expect(list.length).toBe(2)
    expect(list[0]).toEqual({ name: "a", size: 1000, family: "unknown", parameterSize: "-", quantization: "-" })
    expect(list[1].family).toBe("llama")
    expect(list[1].parameterSize).toBe("8B")
    expect(list[1].quantization).toBe("q4_0")
  })

  test("returns [] when models missing", async () => {
    globalThis.fetch = (() => Promise.resolve(jsonResponse({}))) as typeof fetch
    const o = await import("../src/ollama.ts")
    expect(await o.listModels()).toEqual([])
  })

  test("throws on non-ok status", async () => {
    globalThis.fetch = (() => Promise.resolve(new Response("", { status: 503 }))) as typeof fetch
    const o = await import("../src/ollama.ts")
    await expect(o.listModels()).rejects.toThrow(/503/)
  })
})

describe("ollama.chatStream", () => {
  afterEach(() => { globalThis.fetch = realFetch })

  test("streams tokens and returns concatenated full text", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(
        ndjsonResponse([
          JSON.stringify({ message: { content: "Hel" } }) + "\n",
          JSON.stringify({ message: { content: "lo" } }) + "\n",
          JSON.stringify({ message: { content: "!" } }) + "\n",
          JSON.stringify({ done: true }) + "\n",
        ]),
      )) as typeof fetch
    const o = await import("../src/ollama.ts")
    const tokens: string[] = []
    const res = await o.chatStream("m", [], (c) => tokens.push(c))
    expect(tokens).toEqual(["Hel", "lo", "!"])
    expect(res.content).toBe("Hello!")
    expect(res.thinking).toBe("")
  })

  test("streams thinking tokens separately via onThinking", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(
        ndjsonResponse([
          JSON.stringify({ message: { thinking: "Hmm" } }) + "\n",
          JSON.stringify({ message: { thinking: "…" } }) + "\n",
          JSON.stringify({ message: { content: "OK" } }) + "\n",
          JSON.stringify({ done: true }) + "\n",
        ]),
      )) as typeof fetch
    const o = await import("../src/ollama.ts")
    const th: string[] = []
    const res = await o.chatStream("m", [], () => {}, undefined, undefined, (c) => th.push(c))
    expect(th).toEqual(["Hmm", "…"])
    expect(res.content).toBe("OK")
    expect(res.thinking).toBe("Hmm…")
  })

  test("throws on error chunk from server", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(ndjsonResponse([JSON.stringify({ error: "model not found" }) + "\n"]))) as typeof fetch
    const o = await import("../src/ollama.ts")
    await expect(o.chatStream("m", [], () => {})).rejects.toThrow("model not found")
  })

  test("ignores malformed lines", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(
        ndjsonResponse([
          "garbage line\n",
          JSON.stringify({ message: { content: "ok" } }) + "\n",
        ]),
      )) as typeof fetch
    const o = await import("../src/ollama.ts")
    const res = await o.chatStream("m", [], () => {})
    expect(res.content).toBe("ok")
  })

  test("throws when response status not ok", async () => {
    globalThis.fetch = (() => Promise.resolve(new Response("", { status: 500 }))) as typeof fetch
    const o = await import("../src/ollama.ts")
    await expect(o.chatStream("m", [], () => {})).rejects.toThrow(/500/)
  })
})

describe("ollama.generateTitle", () => {
  afterEach(() => { globalThis.fetch = realFetch })

  test("uses model response, stripped of quotes/newlines/dots, capped at 60", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(jsonResponse({ message: { content: '"Hello World Title"' } }))) as typeof fetch
    const o = await import("../src/ollama.ts")
    expect(await o.generateTitle("hi", "m")).toBe("Hello World Title")
  })

  test("falls back to truncated prompt on non-ok", async () => {
    globalThis.fetch = (() => Promise.resolve(new Response("", { status: 500 }))) as typeof fetch
    const o = await import("../src/ollama.ts")
    expect(await o.generateTitle("hi there", "m")).toBe("hi there")
  })

  test("falls back when model returns empty", async () => {
    globalThis.fetch = (() => Promise.resolve(jsonResponse({ message: { content: "   " } }))) as typeof fetch
    const o = await import("../src/ollama.ts")
    expect(await o.generateTitle("hello world", "m")).toBe("hello world")
  })

  test("falls back on network error", async () => {
    globalThis.fetch = (() => Promise.reject(new Error("net"))) as typeof fetch
    const o = await import("../src/ollama.ts")
    expect(await o.generateTitle("hello world", "m")).toBe("hello world")
  })
})

import { prepareContext } from "../src/ollama.ts"

describe("ollama.prepareContext", () => {
  const m = (i: number): Message => ({ role: i % 2 === 0 ? "user" : "assistant", content: `m${i}`, timestamp: i })

  test("no truncation under limit", () => {
    const msgs = [m(0), m(1), m(2)]
    const c = prepareContext(msgs, 20, "sys")
    expect(c.dropped).toBe(0)
    expect(c.messages).toHaveLength(3)
    expect(c.system).toBe("sys")
  })

  test("drops oldest, keeps tail of size max", () => {
    const msgs = Array.from({ length: 25 }, (_, i) => m(i))
    const c = prepareContext(msgs, 20, undefined)
    expect(c.dropped).toBe(5)
    expect(c.messages).toHaveLength(20)
    expect(c.messages[0].content).toBe("m5")
    expect(c.messages[19].content).toBe("m24")
    expect(c.system).toBeUndefined()
  })

  test("max=0 disables truncation", () => {
    const msgs = Array.from({ length: 5 }, (_, i) => m(i))
    const c = prepareContext(msgs, 0, undefined)
    expect(c.dropped).toBe(0)
    expect(c.messages).toHaveLength(5)
  })
})

describe("sanity: all modules import without throwing", () => {
  test("imports", async () => {
    await import("../src/types.ts")
    await import("../src/theme.ts")
    await import("../src/store.ts")
    await import("../src/ollama.ts")
    await import("../src/app.ts")
    expect(true).toBe(true)
  })
})