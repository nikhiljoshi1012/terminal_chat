# DESIGN.md

# Design Philosophy

The application should feel like a modern terminal application rather than a traditional command-line program.

Design priorities:

1. Simplicity
2. Clarity
3. Keyboard-first
4. Minimal distractions
5. Fast interaction

---

# Layout

The application consists of four primary views.

Home

Model Selection

Chat

History

Only one screen is visible at a time.

---

# Home Screen

--------------------------------------------------

Ollama Terminal

> New Chat

  Previous Chats

  Installed Models

  Settings

  Exit

--------------------------------------------------

Navigation:

Arrow Keys

Enter

Esc

---

# Model Selection

--------------------------------------------------

Select Model

> llama3.2

  qwen3

  mistral

  gemma

--------------------------------------------------

Selecting a model immediately creates a new chat.

---

# Chat Layout

--------------------------------------------------

Model: llama3.2

────────────────────────────────────

You

Explain TCP.

Assistant

TCP is...

...

────────────────────────────────────

>

--------------------------------------------------

Requirements:

Messages scroll vertically.

Input always remains visible.

Streaming updates without flicker.

---

# Chat History

--------------------------------------------------

Previous Chats

> Linux Questions

  Rust Notes

  Networking

  AI Research

--------------------------------------------------

Actions:

Enter → Open

R → Rename

D → Delete

Esc → Back

---

# Colors

Use terminal default colors whenever possible.

Minimal highlighting.

Suggested palette:

Primary

Blue

Success

Green

Warning

Yellow

Error

Red

Selection

Reverse video or accent color

Avoid excessive color usage.

---

# Typography

Terminal-native fonts only.

No ASCII art.

No decorative borders beyond simple separators.

Readable spacing is preferred.

---

# Icons

Optional.

Prefer Unicode.

Examples:

💬

📁

⚙

🤖

Fallback gracefully on terminals that lack emoji support.

---

# Spacing

Maintain consistent padding.

Avoid cramped layouts.

Every screen should breathe.

---

# Status Bar

Optional bottom status bar.

Example:

Model: llama3.2

Messages: 12

Ctrl+C Exit

Esc Back

---

# Loading States

Examples:

Loading models...

Connecting to Ollama...

Generating response...

Saving chat...

Use subtle indicators.

---

# Empty States

History:

"No conversations yet."

Models:

"No Ollama models installed."

Errors should clearly explain how to resolve the issue.

---

# Responsive Behaviour

The interface should adapt to terminal resizing.

Panels resize automatically.

Scrolling remains functional.

No fixed-width assumptions.

---

# Accessibility

Every action must be available via keyboard.

Do not rely on colors alone.

Maintain high contrast.

Support narrow terminal widths where practical.

---

# User Experience Principles

The application should feel:

Predictable

Responsive

Calm

Minimal

Reliable

Every interaction should require the fewest possible keystrokes while remaining obvious to the user.
