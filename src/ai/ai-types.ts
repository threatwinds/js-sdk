/**
 * Types for the ThreatWinds AI API (`/api/ai/v1`), an OpenAI-compatible surface
 * over OpenAI, Gemini, Claude and ThreatWinds self-hosted models.
 */

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ToolFunctionDefinition {
  name: string;
  description: string;
  /** JSON Schema describing the function's arguments. */
  parameters: Record<string, unknown>;
}

export interface ToolDefinition {
  type: 'function';
  function: ToolFunctionDefinition;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    /** JSON-encoded arguments; may need parsing before use. */
    arguments: string;
  };
}

export interface SystemMessage {
  role: 'system';
  content: string;
}

export interface UserMessage {
  role: 'user';
  content: string;
}

export interface AssistantMessage {
  role: 'assistant';
  content: string | null;
  tool_calls?: ToolCall[];
}

export interface ToolMessage {
  role: 'tool';
  content: string;
  tool_call_id: string;
}

export type ChatMessage = SystemMessage | UserMessage | AssistantMessage | ToolMessage;

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  tool_choice?: 'auto' | 'none' | 'required';
  max_completion_tokens?: number;
  reasoning_effort?: 'minimal' | 'low' | 'medium' | 'high';
  response_format?: { type: 'json_object' | 'json_schema'; json_schema?: Record<string, unknown> };
  temperature?: number;
  top_p?: number;
}

export interface Usage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

export interface ChatCompletionChoice {
  index: number;
  message: AssistantMessage;
  finish_reason: string;
}

export interface ChatCompletionResponse {
  id: string;
  object: string;
  model: string;
  choices: ChatCompletionChoice[];
  usage?: Usage;
}

/** Assembled result of a streamed completion. */
export interface ChatCompletionResult {
  content: string;
  toolCalls: ToolCall[];
  finishReason: string;
  usage?: Usage;
}

export interface ChatStreamDelta {
  /** Text fragment, empty when the chunk only carried tool-call data. */
  content: string;
  /** True once the stream has finished and `result` is populated. */
  done: boolean;
}

/**
 * Capabilities advertised per model. Sending a chat request to a model without
 * `chat` fails with HTTP 400, so callers should filter before dispatching —
 * `/models` mixes transcription, embedding and chat models in one list.
 */
export type ModelCapability =
  | 'chat'
  | 'tools-use'
  | 'reasoning'
  | 'text-generation'
  | 'code-generation'
  | 'image'
  | 'video'
  | 'audio'
  | 'transcription'
  | 'speech'
  | 'embedding'
  | (string & {});

export interface ModelLimits {
  maxInputTokens?: number;
  maxTotalTokens?: number;
}

export interface AIModel {
  id: string;
  object?: string;
  /** Human-readable label, e.g. "Silas 1.6 Pro". */
  name?: string;
  provider?: string;
  ownedBy?: string;
  capabilities: ModelCapability[];
  limits?: ModelLimits;
  /** Provider defaults and valid ranges for sampling parameters. */
  params?: Record<string, number>;
}

export interface TokenCountRequest {
  model: string;
  messages: ChatMessage[];
}

export interface TokenCountResponse {
  tokens: number;
}

export interface EmbeddingsRequest {
  model: string;
  input: string | string[];
}

export interface EmbeddingsResponse {
  data: Array<{ embedding: number[]; index: number }>;
  model: string;
  usage?: Usage;
}
