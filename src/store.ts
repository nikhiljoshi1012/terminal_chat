import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import type { ChatSession, ChatSummary, Settings } from "./types.ts"
import { DEFAULT_SETTINGS } from "./types.ts"

// ponytail: resolve from cwd lazily so tests (and any cwd at runtime) get the right dir
function dataDir(): string {
  return resolve("data")
}
function chatsDir(): string {
  return resolve(dataDir(), "chats")
}
function settingsFile(): string {
  return resolve(dataDir(), "settings.json")
}

export function ensureDirs(): void {
  if (!existsSync(dataDir())) mkdirSync(dataDir(), { recursive: true })
  if (!existsSync(chatsDir())) mkdirSync(chatsDir(), { recursive: true })
}

export function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export function loadSettings(): Settings {
  if (!existsSync(settingsFile())) return { ...DEFAULT_SETTINGS }
  try {
    const raw = JSON.parse(readFileSync(settingsFile(), "utf8"))
    return { ...DEFAULT_SETTINGS, ...raw }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(s: Settings): void {
  writeFileSync(settingsFile(), JSON.stringify(s, null, 2))
}

export function listSessions(): ChatSummary[] {
  if (!existsSync(chatsDir())) return []
  const out: ChatSummary[] = []
  for (const f of readdirSync(chatsDir())) {
    if (!f.endsWith(".json")) continue
    try {
      const s: ChatSession = JSON.parse(readFileSync(resolve(chatsDir(), f), "utf8"))
      out.push({
        id: s.id,
        title: s.title,
        model: s.model,
        created: s.created,
        updated: s.updated,
        messageCount: s.messages.length,
      })
    } catch {
      // corrupted chat; skip
    }
  }
  return out.sort((a, b) => b.updated - a.updated)
}

export function loadSession(id: string): ChatSession | null {
  const p = resolve(chatsDir(), `${id}.json`)
  if (!existsSync(p)) return null
  try {
    return JSON.parse(readFileSync(p, "utf8"))
  } catch {
    return null
  }
}

export function saveSession(s: ChatSession): void {
  s.updated = Date.now()
  writeFileSync(resolve(chatsDir(), `${s.id}.json`), JSON.stringify(s, null, 2))
}

export function deleteSession(id: string): void {
  const p = resolve(chatsDir(), `${id}.json`)
  if (existsSync(p)) unlinkSync(p)
}

export function renameSession(id: string, title: string, updatedAt?: number): void {
  const s = loadSession(id)
  if (!s) return
  s.title = title
  if (updatedAt) s.updated = updatedAt
  saveSession(s)
}