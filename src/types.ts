export type Role = "user" | "assistant" | "system"

export interface Message {
  role: Role
  content: string
  timestamp: number
  thinking?: string
}

export interface ChatSession {
  id: string
  title: string
  model: string
  created: number
  updated: number
  messages: Message[]
}

export interface ChatSummary {
  id: string
  title: string
  model: string
  created: number
  updated: number
  messageCount: number
}

export interface ModelInfo {
  name: string
  size: number
  family: string
  parameterSize: string
  quantization: string
}

export interface Settings {
  theme: "default" | "dark" | "light"
  defaultModel: string
  autoSave: boolean
  streaming: boolean
  systemPrompt: string
  maxContextMessages: number
}

export const DEFAULT_SYSTEM_PROMPT = "You are a helpful, concise assistant. Respond in markdown when structured output helps."

export const DEFAULT_SETTINGS: Settings = {
  theme: "default",
  defaultModel: "",
  autoSave: true,
  streaming: true,
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  maxContextMessages: 20,
}