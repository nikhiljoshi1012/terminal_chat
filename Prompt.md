# Product Specification

## Overview

A lightweight terminal-based chat application for interacting with local Ollama models.

The application provides a ChatGPT-like experience entirely inside the terminal while storing all conversations locally.

---

# Goals

- Learn OpenTUI
- Practice building terminal applications
- Explore state management
- Learn asynchronous UI updates
- Integrate with Ollama
- Maintain persistent conversations

---

# Target Users

Developers

Linux users

Terminal enthusiasts

Users who primarily run local LLMs

---

# Supported Models

Any model installed in Ollama.

Examples:

- llama3
- llama3.2
- mistral
- qwen
- deepseek
- gemma

The application does not care which model is installed.

---

# Main Screens

## Home

Contains:

- New Chat
- Previous Chats
- Installed Models
- Settings
- Exit

---

## New Chat

Displays installed Ollama models.

Selecting a model creates a new conversation.

---

## Chat Screen

Displays:

Conversation history

Scrollable messages

Input prompt

Current model

Streaming assistant responses

---

## Previous Chats

Displays all saved conversations.

Supports:

Open

Rename

Delete

Search (future)

---

## Installed Models

Displays locally available Ollama models.

Information shown:

- Name
- Size
- Family
- Parameter count (if available)

---

## Settings

Simple configuration.

Examples:

Theme

Default model

Auto-save

Streaming on/off

Future settings can be added here.

---

# Chat Sessions

Each conversation stores:

Unique ID

Title

Selected model

Created date

Updated date

Messages

---

# Message Format

Each message contains:

Role

Content

Timestamp

---

# Persistence

Chats automatically save after every message.

Users never manually save conversations.

---

# Conversation Titles

Initially:

New Chat

Later automatically generated from the first prompt.

Users may rename manually.

---

# Streaming

Assistant responses stream in real time.

Partial responses remain visible.

Interruptions should not lose existing conversation history.

---

# Error States

Examples:

Ollama not running

No installed models

Model deleted

Invalid response

Corrupted chat

Errors should be shown inside the interface without crashing.

---

# Future Features

Possible additions:

Search

Markdown rendering

Clipboard copy

Export

Themes

Pinned chats

Conversation statistics

These are outside the MVP.

---

# Non Goals

No cloud models

No authentication

No plugins

No agents

No tool calling

No multimodal support

No web browsing

No synchronization

No collaboration

The application intentionally remains focused on local chatting.
