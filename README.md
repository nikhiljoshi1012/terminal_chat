# Ollama Terminal Chat

A lightweight terminal chat app for local Ollama models, built with [OpenTUI](https://opentui.dev) and Bun.

## Requirements

- [Bun](https://bun.sh) 1.2+
- [Ollama](https://ollama.com) running locally (`ollama serve`) with at least one pulled model

## Run

```bash
bun install
bun start
```

Set `OLLAMA_HOST` to point at a non-default Ollama server.

## Navigation

| Screen        | Keys                                  |
| ------------- | ------------------------------------- |
| Home / Menus  | ↑↓ navigate · Enter select · Ctrl+C exit |
| New Chat      | ↑↓ · Enter to start                    |
| Chat          | type · Enter send · Esc back/stop      |
| Previous Chats| Enter open · R rename · D delete · Esc back |
| Settings      | Enter toggle · Esc back                |

## Architecture

```
src/
  index.ts   entry point
  app.ts     screen state machine + UI (OpenTUI)
  ollama.ts  Ollama HTTP client (streaming)
  store.ts   JSON persistence (./data/chats, settings.json)
  types.ts   shared types
  theme.ts   colors
```

Chats persist as JSON files under `data/chats/<id>.json`. No database, no cloud.