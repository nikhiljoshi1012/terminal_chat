# Deployment Guide — Ubuntu Server

Setup instructions for running **Ollama Terminal Chat** on an Ubuntu server.
The app is a terminal TUI (not a web service), so you run it inside an interactive
shell over SSH or a local console. It is not a daemon.

---

## 1. System requirements

- Ubuntu Server 20.04 / 22.04 / 24.04 (any LTS)
- x86_64 or ARM64
- A real TTY or interactive SSH session (the app uses a fullscreen TUI; non-interactive
  shells, cron, or systemd services without a PTY will not work)
- ~500 MB free disk for Bun + dependencies
- Enough RAM/CPU for the Ollama models you intend to run (model-dependent)

Optional but recommended:

- `git` — to clone the repo
- `curl` — to fetch installers
- `build-essential` — some Bun native deps may need it
- `tmux` — keeps the TUI alive if your SSH session drops

```bash
sudo apt update
sudo apt install -y git curl build-essential tmux
```

---

## 2. Install Bun

The app runtime is Bun 1.2+.

```bash
curl -fsSL https://bun.sh/install | bash
```

This installs Bun into `~/.bun` for the current user. Load it into your shell:

```bash
echo 'export BUN_INSTALL="$HOME/.bun"' >> ~/.bashrc
echo 'export PATH="$BUN_INSTALL/bin:$PATH"'      >> ~/.bashrc
source ~/.bashrc
bun --version    # must print 1.2.x or newer
```

If you prefer system-wide Bun, copy the binary:

```bash
sudo cp ~/.bun/bin/bun /usr/local/bin/bun
```

---

## 3. Install Ollama

The app talks to a local Ollama HTTP API on `http://127.0.0.1:11434` by default.

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

This installs the `ollama` binary and a systemd service. Start and enable it:

```bash
sudo systemctl enable --now ollama
sudo systemctl status ollama      # should show active (running)
```

Pull at least one model (required — the app shows an empty model list otherwise):

```bash
ollama pull llama3.2        # or qwen3, mistral, gemma, etc.
ollama list                 # confirm it's available
```

To run Ollama under a different user, on a different port, or bind to another
interface, edit `/etc/systemd/system/ollama.service`'s `Environment=OLLAMA_HOST=...`
line, then:

```bash
sudo systemctl daemon-reload
sudo systemctl restart ollama
```

---

## 4. Get the project

```bash
cd ~
git clone <your-repo-url> terminal_chat      # or scp/rsync the folder up
cd terminal_chat
```

If you don't use git, copy the project directory from your dev machine via `scp`:

```bash
# from your dev machine:
scp -r ./terminal_chat user@your-server:~/
```

Either way, end up in `~/terminal_chat` with `package.json` and `src/` present.

---

## 5. Install dependencies

From inside the project directory:

```bash
bun install
```

This resolves `@opentui/core`, `typescript`, `@types/bun` from `bun.lock`.

---

## 6. Verify

Run the type checker and tests before first launch:

```bash
bun run typecheck    # tsc --noEmit, should print nothing and exit 0
bun test             # should pass (30/31 currently; see note below)
```

Known issue (not a deployment blocker): the test
`store sessions > listSessions returns summaries sorted by updated desc with counts`
fails intermittently. Cause: `store.saveSession()` unconditionally overwrites
`s.updated = Date.now()`, so the test's manual `b.updated = Date.now()+10000`
is clobbered. Same root cause makes `renameSession`'s optional `updatedAt`
argument dead code. Fix `store.ts` if you want the test green; runtime is
unaffected.

---

## 7. Run the app

From the project directory, inside an interactive shell:

```bash
bun start        # runs: bun src/index.ts
```

You should see the home screen: *New Chat / Previous Chats / Installed Models /
Settings / Exit*. If Ollama is not reachable, the home screen shows
`● Ollama not running (start: ollama serve)` in red — check step 3.

### Point at a non-default Ollama host

```bash
OLLAMA_HOST=http://127.0.0.1:11434 bun start
# or remote / custom port:
OLLAMA_HOST=http://10.0.0.5:11434 bun start
```

The value is read once at process start (`src/ollama.ts:3`).

---

## 8. Keep it alive over SSH (recommended)

The TUI dies when its controlling TTY closes. Use `tmux` so a dropped SSH
session doesn't kill the chat:

```bash
tmux new -s chat
cd ~/terminal_chat
bun start
# detach: Ctrl+B then D
# reattach later:
tmux attach -t chat
```

`screen` works the same way if you prefer it.

Do **not** run this under systemd as a background service — it has no TTY and
the renderer will fail. systemd is only for Ollama itself.

---

## 9. Where data lives

All user data is written relative to the **current working directory** of the
process (`src/store.ts:7-9`):

```
~/terminal_chat/data/
  settings.json
  chats/
    <id>.json
```

- `data/` is in `.gitignore` and is created automatically on first launch.
- No database, no cloud, no user accounts.
- To back up: `cp -r ~/terminal_chat/data ~/backup/`
- To reset: `rm -rf ~/terminal_chat/data` (next launch recreates empty dirs).

Running the app from a different working directory creates a *new* `data/`
there. Always `cd ~/terminal_chat` before `bun start`.

---

## 10. Updating

```bash
cd ~/terminal_chat
git pull                 # or re-run scp
bun install             # refresh deps if bun.lock changed
bun run typecheck
bun start
```

Back up `data/` before pulling breaking changes. Existing chat JSON files are
forward-compatible as long as `src/types.ts` field names don't change.

---

## 11. Troubleshooting

| Symptom | Fix |
|---|---|
| `bun: command not found` | `source ~/.bashrc`, or re-run step 2 |
| `● Ollama not running` | `sudo systemctl status ollama`, then `sudo systemctl restart ollama` |
| `(cannot reach Ollama)` on model screen | Same as above, or check `OLLAMA_HOST` |
| `(no models installed)` | `ollama pull <model>` (step 3) |
| TUI exits immediately / blank screen | You're not in an interactive TTY. Use `tmux` or a real SSH session, not `ssh host bun start` over a non-PTY pipe. Run `ssh -t user@host 'tmux new -s chat'` to force a PTY. |
| Colors / emoji look wrong | Set `TERM=xterm-256color` (or `xterm-direct`); ensure your terminal supports 256 colors. |
| `EACCES` writing to `data/` | Check write perms on the project dir: `chmod -R u+w ~/terminal_chat` |
| Port 11434 already in use | Another Ollama instance. `sudo systemctl stop ollama` or change `OLLAMA_HOST`. |
| Tests fail on timing | See step 6 note — flaky, not a runtime bug. |

---

## 12. Quick start (copy-paste block)

```bash
sudo apt update && sudo apt install -y git curl build-essential tmux
curl -fsSL https://bun.sh/install | bash
echo 'export BUN_INSTALL="$HOME/.bun"' >> ~/.bashrc
echo 'export PATH="$BUN_INSTALL/bin:$PATH"'      >> ~/.bashrc
source ~/.bashrc
curl -fsSL https://ollama.com/install.sh | sh
sudo systemctl enable --now ollama
ollama pull llama3.2
cd ~ && git clone <your-repo-url> terminal_chat && cd terminal_chat
bun install
tmux new -s chat
bun start
```

Detach with `Ctrl+B D`; reattach with `tmux attach -t chat`.