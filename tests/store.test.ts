import { test, expect, describe, afterAll, beforeEach, afterEach } from "bun:test"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { mkdirSync, rmSync, existsSync, writeFileSync } from "node:fs"
import * as store from "../src/store.ts"
import { DEFAULT_SETTINGS } from "../src/types.ts"

// ponytail: store resolves ./data lazily from cwd, so chdir to a tmp dir for isolation
const root = join(tmpdir(), `otc-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
mkdirSync(root, { recursive: true })
const cwd = process.cwd()
process.chdir(root)

function wipeData(): void {
  const dataDir = resolve(root, "data")
  rmSync(dataDir, { recursive: true, force: true })
  store.ensureDirs()
}

beforeEach(wipeData)
afterEach(wipeData)

afterAll(() => {
  process.chdir(cwd)
  rmSync(root, { recursive: true, force: true })
})

describe("store.newId", () => {
  test("produces unique-ish ids of sane shape", () => {
    const a = store.newId()
    const b = store.newId()
    expect(a).not.toBe(b)
    expect(a.length).toBeGreaterThan(8)
    expect(/^[0-9a-z]+$/.test(a)).toBe(true)
  })
})

describe("store settings", () => {
  test("loadSettings returns defaults when missing", () => {
    expect(store.loadSettings()).toEqual(DEFAULT_SETTINGS)
  })

  test("save then load round-trips", () => {
    store.saveSettings({ theme: "dark", defaultModel: "llama3", autoSave: false, streaming: false, systemPrompt: "bot", maxContextMessages: 10 })
    const s = store.loadSettings()
    expect(s.theme).toBe("dark")
    expect(s.defaultModel).toBe("llama3")
    expect(s.autoSave).toBe(false)
    expect(s.streaming).toBe(false)
    expect(s.systemPrompt).toBe("bot")
    expect(s.maxContextMessages).toBe(10)
  })

  test("loadSettings returns defaults when file is corrupt JSON", async () => {
    writeFileSync(resolve(root, "data", "settings.json"), "{ broken")
    const s = store.loadSettings()
    expect(s).toEqual(DEFAULT_SETTINGS)
  })
})

describe("store sessions", () => {
  function mk(title: string, msgs: number) {
    const s = {
      id: store.newId(),
      title,
      model: "test-model",
      created: Date.now(),
      updated: Date.now(),
      messages: Array.from({ length: msgs }, (_, i) => ({
        role: "user" as const,
        content: `m${i}`,
        timestamp: Date.now(),
      })),
    }
    store.saveSession(s)
    return s
  }

  test("save then load round-trips", () => {
    const s = mk("hello", 2)
    const got = store.loadSession(s.id)
    expect(got).not.toBeNull()
    expect(got!.title).toBe("hello")
    expect(got!.messages.length).toBe(2)
  })

  test("loadSession returns null for unknown id", () => {
    expect(store.loadSession("does-not-exist")).toBeNull()
  })

  test("saveSession bumps updated to now", () => {
    const s = mk("bump", 1)
    s.updated = 0
    store.saveSession(s)
    const got = store.loadSession(s.id)
    expect(got!.updated).toBeGreaterThan(0)
  })

  test("listSessions returns summaries sorted by updated desc with counts", () => {
    const a = mk("a", 1)
    const b = mk("b", 3)
    // make b newer
    b.updated = Date.now() + 10000
    store.saveSession(b)
    const list = store.listSessions()
    const titles = list.map((x) => x.title)
    expect(titles).toContain("a")
    expect(titles).toContain("b")
    expect(list[0].title).toBe("b")
    const bSummary = list.find((x) => x.id === b.id)!
    expect(bSummary.messageCount).toBe(3)
    expect(bSummary.model).toBe("test-model")
  })

  test("renameSession updates title and persists", () => {
    const s = mk("old", 1)
    store.renameSession(s.id, "new title")
    const got = store.loadSession(s.id)
    expect(got!.title).toBe("new title")
  })

  test("renameSession no-op for missing id", () => {
    expect(() => store.renameSession("missing", "x")).not.toThrow()
  })

  test("deleteSession removes file", () => {
    const s = mk("killme", 1)
    store.deleteSession(s.id)
    expect(store.loadSession(s.id)).toBeNull()
    expect(existsSync(join(root, "data", "chats", `${s.id}.json`))).toBe(false)
  })

  test("listSessions skips corrupted json without throwing", async () => {
    writeFileSync(resolve(root, "data", "chats", "broken.json"), "{ not json")
    const list = store.listSessions()
    expect(list.find((x) => x.id === "broken")).toBeUndefined()
  })
})