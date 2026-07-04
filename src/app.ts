import {
  BoxRenderable,
  InputRenderable,
  InputRenderableEvents,
  MarkdownRenderable,
  RGBA,
  ScrollBoxRenderable,
  SelectRenderable,
  SelectRenderableEvents,
  SyntaxStyle,
  TextRenderable,
  createCliRenderer,
  type CliRenderer,
  type KeyEvent,
} from "@opentui/core"
import { colors } from "./theme.ts"
import * as ollama from "./ollama.ts"
import * as store from "./store.ts"
import type { ChatSession, Message, ModelInfo, Settings } from "./types.ts"

type Screen = "home" | "models" | "chat" | "history" | "installed" | "settings" | "system"

// ponytail: one shared SyntaxStyle for all markdown renders; maps theme tokens to markup kinds
const mdStyle = SyntaxStyle.fromStyles({
  "markup.heading.1": { fg: RGBA.fromHex(colors.primary), bold: true },
  "markup.heading.2": { fg: RGBA.fromHex(colors.accent), bold: true },
  "markup.heading.3": { fg: RGBA.fromHex(colors.accent), bold: true },
  "markup.heading": { fg: RGBA.fromHex(colors.primary) },
  "markup.list": { fg: RGBA.fromHex(colors.warning) },
  "markup.raw": { fg: RGBA.fromHex(colors.warning) },
  "markup.link": { fg: RGBA.fromHex(colors.accent), italic: true },
  "markup.bold": { bold: true },
  "markup.italic": { italic: true },
  default: { fg: RGBA.fromHex(colors.text) },
})

// ponytail: faded grey style for thinking blocks so they read as reasoned-away
// scratch, not part of the answer. Italic + uniform grey across markup kinds.
const thinkStyle = SyntaxStyle.fromStyles({
  default: { fg: RGBA.fromHex(colors.dim), italic: true },
  "markup.bold": { bold: true },
  "markup.italic": { italic: true },
})

export class App {
  renderer: CliRenderer
  host: BoxRenderable
  screen: Screen = "home"
  settings: Settings
  current: ChatSession | null = null
  busy = false
  abort: AbortController | null = null
  models: ModelInfo[] = []
  status: TextRenderable | null = null
  historyList: SelectRenderable | null = null
  renamingId: string | null = null
  private streamedMd: MarkdownRenderable | null = null
  private chatScroll: ScrollBoxRenderable | null = null
  // ponytail: single global toggle for thinking blocks; per-row toggle is more UX than it's worth
  private showThinking = false
  private thinkingBlocks: MarkdownRenderable[] = []
  private thinkingToggles: TextRenderable[] = []
  private throbber: TextRenderable | null = null
  private throbberTimer: ReturnType<typeof setInterval> | null = null

  private constructor(renderer: CliRenderer) {
    this.renderer = renderer
    this.host = new BoxRenderable(renderer, {
      id: "host",
      flexDirection: "column",
      width: "100%",
      height: "100%",
      padding: 1,
    })
    this.settings = store.loadSettings()
  }

  static async create(): Promise<App> {
    const renderer = await createCliRenderer({ exitOnCtrlC: true })
    const app = new App(renderer)
    renderer.root.add(app.host)
    renderer.keyInput.on("keypress", (k: KeyEvent) => app.onKey(k))
    return app
  }

  run(): void {
    this.render()
  }

  private setStatus(msg: string, color = colors.dim): void {
    if (this.status) {
      this.status.content = msg
      this.status.fg = color
    }
  }

  private onKey(key: KeyEvent): void {
    if (key.name === "escape" && this.renamingId) {
      this.renamingId = null
      this.screen = "history"
      this.render()
      return
    }
    if (this.screen === "chat" && this.chatScroll) {
      if (key.name === "pageup") {
        this.chatScroll.scrollBy(-1, "viewport")
        return
      }
      if (key.name === "pagedown") {
        this.chatScroll.scrollBy(1, "viewport")
        return
      }
      if (key.ctrl && key.name === "t") {
        this.toggleThinking()
        return
      }
    }
    if (key.name === "escape" && this.screen !== "home") {
      if (this.busy) {
        this.abort?.abort()
        return
      }
      if (this.screen === "system") {
        this.screen = "settings"
        this.render()
        return
      }
      this.screen = "home"
      this.render()
      return
    }
    if (this.screen === "history" && this.historyList) {
      if (key.name === "r") this.renameSelected()
      if (key.name === "d") this.deleteSelected()
    }
  }

  private render(): void {
    this.historyList = null
    this.status = null
    for (const c of this.host.getChildren().slice()) {
      this.host.remove(c)
      c.destroyRecursively?.()
    }
    switch (this.screen) {
      case "home":
        this.buildHome()
        break
      case "models":
        void this.buildModels()
        break
      case "chat":
        this.buildChat()
        break
      case "history":
        this.buildHistory()
        break
      case "installed":
        void this.buildInstalled()
        break
      case "settings":
        void this.buildSettings()
        break
      case "system":
        this.buildSystemPromptEditor(this.settings.systemPrompt, (v) => {
          this.settings.systemPrompt = v
          store.saveSettings(this.settings)
          this.screen = "settings"
          this.render()
        })
        break
    }
  }

  private header(title: string, sub?: string): BoxRenderable {
    const box = new BoxRenderable(this.renderer, { id: "header", flexDirection: "column", width: "100%" })
    box.add(new TextRenderable(this.renderer, { id: "h-title", content: title, fg: colors.primary }))
    if (sub) box.add(new TextRenderable(this.renderer, { id: "h-sub", content: sub, fg: colors.dim }))
    return box
  }

  private footer(lines: string[]): BoxRenderable {
    const box = new BoxRenderable(this.renderer, {
      id: "footer",
      flexDirection: "row",
      width: "100%",
      gap: 3,
      marginTop: 1,
    })
    for (const l of lines) box.add(new TextRenderable(this.renderer, { id: `f-${l}`, content: l, fg: colors.dim }))
    return box
  }

  private newMenu(width: number, height: number): SelectRenderable {
    return new SelectRenderable(this.renderer, {
      id: `menu-${Math.random().toString(36).slice(2, 6)}`,
      width,
      height,
      textColor: colors.text,
      selectedBackgroundColor: colors.primary,
      selectedTextColor: "#FFFFFF",
      backgroundColor: colors.panel,
    })
  }

  private buildHome(): void {
    const col = new BoxRenderable(this.renderer, { id: "home", flexDirection: "column", width: 44, height: "100%", gap: 1 })
    col.add(this.header("Ollama Terminal", "Local LLM chat"))
    const status = new TextRenderable(this.renderer, { id: "home-status", content: "Checking Ollama…", fg: colors.dim })
    this.status = status
    const menu = this.newMenu(44, 8)
    menu.options = [
      { name: "New Chat", description: "Start a new conversation" },
      { name: "Previous Chats", description: "Open saved conversations" },
      { name: "Installed Models", description: "View local Ollama models" },
      { name: "Settings", description: "Configure the app" },
      { name: "Exit", description: "Quit (Ctrl+C)" },
    ]
    menu.on(SelectRenderableEvents.ITEM_SELECTED, (_i, opt) => {
      switch (opt.name) {
        case "New Chat":
          this.screen = "models"
          this.render()
          break
        case "Previous Chats":
          this.screen = "history"
          this.render()
          break
        case "Installed Models":
          this.screen = "installed"
          this.render()
          break
        case "Settings":
          this.screen = "settings"
          this.render()
          break
        case "Exit":
          this.renderer.destroy()
          break
      }
    })
    col.add(menu)
    col.add(status)
    col.add(this.footer(["↑↓ Navigate", "Enter Select", "Ctrl+C Exit"]))
    menu.focus()
    this.host.add(col)
    void this.checkConnection()
  }

  private async checkConnection(): Promise<void> {
    const ok = await ollama.checkConnection()
    if (!this.status) return
    this.setStatus(ok ? "● Ollama connected" : "● Ollama not running (start: ollama serve)", ok ? colors.accent : colors.error)
  }

  private async buildModels(): Promise<void> {
    const col = new BoxRenderable(this.renderer, { id: "models", flexDirection: "column", width: 54, height: "100%", gap: 1 })
    col.add(this.header("Select Model", "Choose a model to start a chat"))
    const loading = new TextRenderable(this.renderer, { id: "m-load", content: "Loading models…", fg: colors.dim })
    const list = this.newMenu(54, 14)
    const chosen: ModelInfo[] = []
    list.on(SelectRenderableEvents.ITEM_SELECTED, () => {
      const idx = list.getSelectedIndex()
      const m = chosen[idx]
      if (m) this.startChat(m.name)
    })
    col.add(loading)
    col.add(list)
    col.add(this.footer(["↑↓ Navigate", "Enter Select", "Esc Back"]))
    list.focus()
    this.host.add(col)
    try {
      const models = await ollama.listModels()
      this.models = models
      this.host.remove(loading)
      loading.destroyRecursively?.()
      if (models.length === 0) {
        list.options = [{ name: "(no models installed)", description: "Run: ollama pull <model>" }]
        return
      }
      chosen.push(...models)
      list.options = models.map((m) => ({
        name: m.name,
        description: `${m.family} · ${m.parameterSize} · ${fmtSize(m.size)}`,
      }))
      list.focus()
    } catch {
      this.host.remove(loading)
      loading.destroyRecursively?.()
      list.options = [{ name: "(cannot reach Ollama)", description: "Ensure: ollama serve is running" }]
    }
  }

  private startChat(model: string): void {
    const s: ChatSession = {
      id: store.newId(),
      title: "New Chat",
      model,
      created: Date.now(),
      updated: Date.now(),
      messages: [],
    }
    store.saveSession(s)
    this.current = s
    this.screen = "chat"
    this.render()
  }

  private buildChat(): void {
    if (!this.current) {
      this.screen = "home"
      this.render()
      return
    }
    const s = this.current
    const frame = new BoxRenderable(this.renderer, { id: "chat", flexDirection: "column", width: "100%", height: "100%" })
    const top = new BoxRenderable(this.renderer, {
      id: "chat-top",
      flexDirection: "row",
      width: "100%",
      justifyContent: "space-between",
      marginBottom: 1,
    })
    top.add(new TextRenderable(this.renderer, { id: "c-title", content: s.title, fg: colors.primary }))
    top.add(new TextRenderable(this.renderer, { id: "c-model", content: `Model: ${s.model}`, fg: colors.dim }))
    frame.add(top)

    const scroll = new ScrollBoxRenderable(this.renderer, {
      id: "messages",
      width: "100%",
      flexGrow: 1,
      stickyScroll: true,
      stickyStart: "bottom",
      viewportCulling: true,
      gap: 1,
    })
    this.chatScroll = scroll
    this.thinkingBlocks = []
    this.thinkingToggles = []
    frame.add(scroll)
    for (const m of s.messages) scroll.add(this.messageRow(m))

    const input = new InputRenderable(this.renderer, {
      id: "chat-input",
      width: "100%",
      placeholder: "Type a message and press Enter…",
      backgroundColor: colors.panel,
      focusedBackgroundColor: "#2A2D2E",
      textColor: colors.text,
      cursorColor: colors.accent,
      marginTop: 1,
    })
    input.on(InputRenderableEvents.ENTER, (value: string) => {
      if (this.busy) return
      const text = value.trim()
      if (!text) return
      input.value = ""
      void this.send(text)
    })
    frame.add(input)
    const hints = ["Enter Send", "PgUp/PgDn Scroll"]
    if (ollama.supportsThinking(s.model)) hints.push("Ctrl+T Thinking")
    hints.push("Esc Back/Stop", "Ctrl+C Exit")
    frame.add(this.footer(hints))
    input.focus()
    this.host.add(frame)
  }

  private messageRow(m: Message): BoxRenderable {
    const row = new BoxRenderable(this.renderer, {
      id: `msg-${m.timestamp}-${Math.random().toString(36).slice(2, 5)}`,
      flexDirection: "column",
      width: "100%",
    })
    const who = m.role === "user" ? "You" : "Assistant"
    row.add(new TextRenderable(this.renderer, { id: "m-who", content: who, fg: m.role === "user" ? colors.accent : colors.primary }))
    if (m.role === "assistant") {
      if (m.thinking && this.current && ollama.supportsThinking(this.current.model)) {
        const toggle = new TextRenderable(this.renderer, {
          id: "m-think-toggle",
          content: this.showThinking ? "▼ Thinking" : "▶ Thinking",
          fg: colors.dim,
        })
        this.thinkingToggles.push(toggle)
        row.add(toggle)
        const thinkMd = new MarkdownRenderable(this.renderer, {
          id: "m-think-md",
          width: "100%",
          content: m.thinking,
          syntaxStyle: thinkStyle,
        })
        thinkMd.visible = this.showThinking
        this.thinkingBlocks.push(thinkMd)
        row.add(thinkMd)
      }
      row.add(new MarkdownRenderable(this.renderer, {
        id: "m-md",
        width: "100%",
        content: m.content,
        syntaxStyle: mdStyle,
      }))
    } else {
      row.add(new TextRenderable(this.renderer, { id: "m-content", content: m.content, fg: colors.text }))
    }
    return row
  }

  private toggleThinking(): void {
    this.showThinking = !this.showThinking
    for (const md of this.thinkingBlocks) md.visible = this.showThinking
    for (const t of this.thinkingToggles) t.content = this.showThinking ? "▼ Thinking" : "▶ Thinking"
  }

  private startThrobber(): void {
    if (this.throbberTimer) return
    const frames = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏"
    let i = 0
    this.throbberTimer = setInterval(() => {
      if (this.throbber) this.throbber.content = `${frames[i % frames.length]} responding…`
      i++
    }, 80)
  }

  private stopThrobber(): void {
    if (this.throbberTimer) {
      clearInterval(this.throbberTimer)
      this.throbberTimer = null
    }
    if (this.throbber) {
      this.throbber.content = ""
    }
  }

  private async send(text: string): Promise<void> {
    if (!this.current) return
    const s = this.current
    const userMsg: Message = { role: "user", content: text, timestamp: Date.now() }
    s.messages.push(userMsg)

    const scroll = this.chatScroll
    if (scroll) scroll.add(this.messageRow(userMsg))

    if (s.title === "New Chat" && s.messages.length === 1) {
      void ollama.generateTitle(text, s.model).then((t) => {
        s.title = t
        if (this.settings.autoSave) store.saveSession(s)
        const chatTop = this.host.getRenderable("chat")?.getRenderable("chat-top")
        const titleEl = chatTop?.getRenderable("c-title") as TextRenderable | undefined
        if (titleEl) titleEl.content = t
      })
    }

    const ctx = ollama.prepareContext(s.messages, this.settings.maxContextMessages, this.settings.systemPrompt)
    if (scroll && ctx.dropped > 0) {
      scroll.add(new TextRenderable(this.renderer, {
        id: "ctx-dropped",
        content: `… ${ctx.dropped} older message${ctx.dropped === 1 ? "" : "s"} not sent …`,
        fg: colors.dim,
      }))
    }

    const busyRow = new BoxRenderable(this.renderer, { id: "busy-row", flexDirection: "column", width: "100%" })
    busyRow.add(new TextRenderable(this.renderer, { id: "busy-who", content: "Assistant", fg: colors.primary }))
    const throbber = new TextRenderable(this.renderer, { id: "throbber", content: "", fg: colors.dim })
    busyRow.add(throbber)
    this.throbber = throbber
    this.startThrobber()

    const canThink = ollama.supportsThinking(s.model)
    const thinkToggle = canThink
      ? new TextRenderable(this.renderer, {
        id: "streamed-think-toggle",
        content: this.showThinking ? "▼ Thinking" : "▶ Thinking",
        fg: colors.dim,
      })
      : null
    const streamedThink = canThink
      ? new MarkdownRenderable(this.renderer, {
        id: "streamed-think",
        width: "100%",
        content: "",
        syntaxStyle: thinkStyle,
        streaming: true,
      })
      : null
    if (streamedThink) streamedThink.visible = false
    if (thinkToggle) this.thinkingToggles.push(thinkToggle)
    if (streamedThink) this.thinkingBlocks.push(streamedThink)

    const streamed = new MarkdownRenderable(this.renderer, {
      id: "streamed",
      width: "100%",
      content: "",
      syntaxStyle: mdStyle,
      streaming: true,
    })
    if (thinkToggle) busyRow.add(thinkToggle)
    if (streamedThink) busyRow.add(streamedThink)
    busyRow.add(streamed)
    if (scroll) scroll.add(busyRow)
    this.streamedMd = streamed

    this.busy = true
    this.abort = new AbortController()
    const assistantMsg: Message = { role: "assistant", content: "", timestamp: Date.now() }
    try {
      const res = await ollama.chatStream(
        s.model,
        ctx.messages,
        (chunk) => {
          assistantMsg.content += chunk
          if (this.streamedMd) this.streamedMd.content = assistantMsg.content
        },
        this.abort.signal,
        ctx.system,
        canThink
          ? (chunk) => {
              assistantMsg.thinking = (assistantMsg.thinking ?? "") + chunk
              if (streamedThink) streamedThink.content = assistantMsg.thinking
              if (streamedThink) streamedThink.visible = this.showThinking
            }
          : undefined,
      )
      assistantMsg.content = res.content
      if (res.thinking) assistantMsg.thinking = res.thinking
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        // ponytail: keep already-streamed tokens, just append a marker
        assistantMsg.content = (assistantMsg.content ? assistantMsg.content + " " : "") + "[stopped]"
      } else {
        assistantMsg.content = assistantMsg.content
          ? `${assistantMsg.content}\n[error] ${(e as Error).message}`
          : `[error] ${(e as Error).message}`
      }
      if (this.streamedMd) this.streamedMd.content = assistantMsg.content
    } finally {
      this.stopThrobber()
      this.throbber = null
      if (this.streamedMd) this.streamedMd.streaming = false
      if (streamedThink) streamedThink.streaming = false
      if (!assistantMsg.thinking) {
        if (streamedThink) streamedThink.visible = false
        if (thinkToggle) thinkToggle.content = ""
      }
      if (assistantMsg.content) s.messages.push(assistantMsg)
      if (this.settings.autoSave) store.saveSession(s)
      this.busy = false
      this.abort = null
      this.streamedMd = null
    }
  }

  private buildHistory(): void {
    const col = new BoxRenderable(this.renderer, { id: "history", flexDirection: "column", width: 54, height: "100%", gap: 1 })
    col.add(this.header("Previous Chats", "Open, rename, or delete"))
    const sessions = store.listSessions()
    const list = this.newMenu(54, 14)
    if (sessions.length === 0) {
      list.options = [{ name: "(no conversations yet)", description: "Start a New Chat" }]
    } else {
      list.options = sessions.map((s) => ({
        name: s.title,
        description: `${s.model} · ${s.messageCount} msgs · ${new Date(s.updated).toLocaleDateString()}`,
        value: s.id,
      }))
    }
    list.on(SelectRenderableEvents.ITEM_SELECTED, (_i, opt) => {
      const id = opt.value as string | undefined
      if (!id) return
      const s = store.loadSession(id)
      if (!s) {
        this.render()
        return
      }
      this.current = s
      this.screen = "chat"
      this.render()
    })
    col.add(list)
    col.add(this.footer(["Enter Open", "R Rename", "D Delete", "Esc Back"]))
    list.focus()
    this.historyList = list
    this.host.add(col)
  }

  private renameSelected(): void {
    if (!this.historyList) return
    const opt = this.historyList.getSelectedOption()
    const id = opt?.value as string | undefined
    if (!id) return
    this.renamingId = id
    const current = store.loadSession(id)
    const col = new BoxRenderable(this.renderer, { id: "rename", flexDirection: "column", width: 50, height: "100%", gap: 1 })
    col.add(this.header("Rename Chat", current?.title ?? ""))
    const input = new InputRenderable(this.renderer, {
      id: "rename-input",
      width: 50,
      value: current?.title ?? "",
      backgroundColor: colors.panel,
      focusedBackgroundColor: "#2A2D2E",
      textColor: colors.text,
      cursorColor: colors.accent,
    })
    input.on(InputRenderableEvents.ENTER, (v: string) => {
      const t = v.trim()
      if (t) store.renameSession(id, t)
      this.renamingId = null
      this.screen = "history"
      this.render()
    })
    col.add(input)
    col.add(this.footer(["Enter Confirm", "Esc Cancel"]))
    this.historyList = null
    for (const c of this.host.getChildren().slice()) {
      this.host.remove(c)
      c.destroyRecursively?.()
    }
    input.focus()
    this.host.add(col)
  }

  private deleteSelected(): void {
    if (!this.historyList) return
    const opt = this.historyList.getSelectedOption()
    const id = opt?.value as string | undefined
    if (!id) return
    store.deleteSession(id)
    this.render()
  }

  private async buildInstalled(): Promise<void> {
    const col = new BoxRenderable(this.renderer, { id: "installed", flexDirection: "column", width: 60, height: "100%", gap: 1 })
    col.add(this.header("Installed Models", "Models available in your Ollama"))
    const scroll = new ScrollBoxRenderable(this.renderer, { id: "model-scroll", width: "100%", flexGrow: 1, viewportCulling: true })

    const loading = new TextRenderable(this.renderer, { id: "imp-load", content: "Loading models…", fg: colors.dim })
    col.add(loading)
    col.add(scroll)
    col.add(this.footer(["↑↓ Scroll", "Esc Back"]))
    this.host.add(col)
    try {
      const models = await ollama.listModels()
      this.models = models
      this.host.remove(loading)
      loading.destroyRecursively?.()
      if (models.length === 0) {
        scroll.add(new TextRenderable(this.renderer, { id: "empty", content: "No Ollama models installed.", fg: colors.warning }))
        return
      }
      for (const m of models) {
        const row = new BoxRenderable(this.renderer, { id: `m-${m.name}`, flexDirection: "column", width: "100%", marginBottom: 1 })
        row.add(new TextRenderable(this.renderer, { id: "n", content: m.name, fg: colors.primary }))
        row.add(
          new TextRenderable(this.renderer, {
            id: "d",
            content: `  ${m.family} · ${m.parameterSize} · ${m.quantization} · ${fmtSize(m.size)}`,
            fg: colors.dim,
          }),
        )
        scroll.add(row)
      }
    } catch {
      this.host.remove(loading)
      loading.destroyRecursively?.()
      scroll.add(new TextRenderable(this.renderer, { id: "err", content: "Cannot reach Ollama.", fg: colors.error }))
    }
  }

  private async buildSettings(): Promise<void> {
    const col = new BoxRenderable(this.renderer, { id: "settings", flexDirection: "column", width: 50, height: "100%", gap: 1 })
    col.add(this.header("Settings", "Configure the app"))
    const flick = this.settings.streaming ? "on" : "off"
    const auto = this.settings.autoSave ? "on" : "off"
    const list = this.newMenu(50, 8)
    const sysPromptPreview = this.settings.systemPrompt.length > 32
      ? this.settings.systemPrompt.slice(0, 32) + "…"
      : this.settings.systemPrompt || "(empty)"
    const maxCtx = this.settings.maxContextMessages
    list.options = [
      { name: "Streaming", description: `Responses stream in real time (${flick})` },
      { name: "Auto-save", description: `Save chats after each message (${auto})` },
      { name: "System prompt", description: `Default for new chats: ${sysPromptPreview}` },
      { name: "Max context", description: `Max messages sent to model (${maxCtx})` },
      { name: "Back", description: "Return to home" },
    ]
    list.on(SelectRenderableEvents.ITEM_SELECTED, (_i, opt) => {
      switch (opt.name) {
        case "Streaming":
          this.settings.streaming = !this.settings.streaming
          store.saveSettings(this.settings)
          this.render()
          break
        case "Auto-save":
          this.settings.autoSave = !this.settings.autoSave
          store.saveSettings(this.settings)
          this.render()
          break
        case "System prompt":
          this.screen = "system"
          this.render()
          break
        case "Max context": {
          // ponytail: cycle through preset steps; full text entry of a number is more UX than it's worth
          const steps = [10, 20, 50, 100, 200]
          const next = steps.find((n) => n > maxCtx) ?? steps[0]
          this.settings.maxContextMessages = next
          store.saveSettings(this.settings)
          this.render()
          break
        }
        case "Back":
          this.screen = "home"
          this.render()
          break
      }
    })
    col.add(list)
    col.add(this.footer(["↑↓ Navigate", "Enter Toggle", "Esc Back"]))
    list.focus()
    this.host.add(col)
  }

  private buildSystemPromptEditor(initial: string, onSave: (v: string) => void): void {
    const col = new BoxRenderable(this.renderer, { id: "sysprompt", flexDirection: "column", width: "100%", height: "100%", gap: 1 })
    col.add(this.header("System prompt (default)", "Applied to all chats. Saved to settings.json."))
    const input = new InputRenderable(this.renderer, {
      id: "sysprompt-input",
      width: "100%",
      value: initial,
      backgroundColor: colors.panel,
      focusedBackgroundColor: "#2A2D2E",
      textColor: colors.text,
      cursorColor: colors.accent,
    } as object)
    input.on(InputRenderableEvents.ENTER, (v: string) => {
      const trimmed = v.trim()
      onSave(trimmed.length ? trimmed : "")
    })
    col.add(input)
    col.add(this.footer(["Enter Save", "Esc Cancel"]))
    input.focus()
    this.host.add(col)
  }
}

function fmtSize(bytes: number): string {
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + " GB"
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + " MB"
  return (bytes / 1e3).toFixed(1) + " KB"
}