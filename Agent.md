# AGENT.md

# Ollama Terminal Chat - AI Coding Instructions

## Project Goal

Build a clean, lightweight terminal chat application using OpenTUI that communicates exclusively with locally installed Ollama models.

The primary objective is to learn the OpenTUI framework while building a polished terminal application.

This project intentionally avoids unnecessary complexity.

---

# Core Principles

- Keep the architecture simple.
- Prefer readability over cleverness.
- Minimize dependencies.
- Use TypeScript best practices.
- Build features incrementally.
- Every feature should be independently testable.
- Avoid premature optimization.

---

# Planning Mode

Before implementing a feature:

- Understand the requested feature completely.
- Ask clarifying questions only if requirements are ambiguous.
- Do not invent features.
- Keep implementations aligned with the project scope.
- Favor the simplest working solution.

---

# Implementation Rules

Implement one feature at a time.

Large features should be divided into logical tasks.

Avoid making unrelated changes.

Do not refactor working code unless necessary.

Always preserve backwards compatibility with saved chat data whenever possible.

---

# Project Scope

Supported:

- Local Ollama models only
- Chat conversations
- Persistent chat history
- Multiple conversations
- Model selection
- Terminal interface
- Keyboard navigation
- Streaming responses
- Simple settings

Not Supported:

- OpenAI
- Anthropic
- Gemini
- Cloud APIs
- Plugins
- Agents
- Tool calling
- Function calling
- Vision
- RAG
- Embeddings
- Authentication
- Sync
- Database servers

---

# Architecture Rules

Use clear separation between:

UI

Business Logic

Storage

Ollama Client

Application State

No file should have multiple unrelated responsibilities.

---

# Storage

Store all user data locally.

Use JSON files.

Never require SQLite or external databases.

Chat sessions must persist between launches.

Storage should be versionable for future schema migrations.

---

# Ollama

Communicate only through the Ollama HTTP API.

Never execute shell commands unless absolutely necessary.

Prefer API endpoints over parsing CLI output.

Handle gracefully:

- Ollama not running
- Missing models
- Network failures
- Invalid responses
- Streaming interruptions

---

# Code Style

Prefer:

Small functions

Meaningful names

Explicit typing

Early returns

Readable code

Avoid:

Large files

Deep nesting

Magic values

Global mutable state

Duplicate logic

---

# Error Handling

Never crash the application because of:

Missing chat files

Corrupted JSON

Missing models

Disconnected Ollama server

Display user-friendly errors inside the terminal UI.

---

# Performance

This is a desktop terminal application.

Optimize for responsiveness rather than micro-performance.

Avoid unnecessary re-renders.

Load chat history lazily when appropriate.

---

# UI

Always follow the design described in DESIGN.md.

Maintain consistent spacing.

Keep keyboard navigation intuitive.

Never require mouse interaction.

---

# Keyboard Navigation

Support keyboard-first workflows.

Esc should navigate backwards.

Enter confirms.

Arrow keys navigate lists.

Ctrl+C exits safely.

---

# Testing

After implementing a feature:

- Run type checking.
- Run linting.
- Verify the application builds successfully.
- Test the feature manually.

Fix issues before moving on.

---

# Documentation

Whenever introducing a significant feature:

Update:

- README
- DESIGN.md (if architecture changes)
- CHAT.md (if user workflows change)

Keep documentation synchronized with implementation.

---

# General Philosophy

This project values:

Simplicity

Maintainability

Consistency

Learning OpenTUI

over feature count.
