import { ThreatWindsClient } from '../core/client';
import { SDKError } from '../core/errors';
import {
  AIModel,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionResult,
  EmbeddingsRequest,
  EmbeddingsResponse,
  TokenCountRequest,
  TokenCountResponse,
  ToolCall,
} from './ai-types';

const BASE = '/api/ai/v1';

/**
 * Streaming completions can run for minutes; the client's default request
 * timeout would cut them off mid-answer.
 */
const STREAM_TIMEOUT_MS = 300_000;

interface StreamChoiceDelta {
  content?: string | null;
  tool_calls?: Array<{
    index?: number;
    id?: string;
    function?: { name?: string; arguments?: string };
  }>;
}

/**
 * Client for the ThreatWinds AI API.
 *
 * Note this API is served from a different host than search/analytics, so it
 * usually needs its own `ThreatWindsClient` instance:
 *
 * ```ts
 * const ai = new AiClient(new ThreatWindsClient({
 *   baseUrl: 'https://apis.threatwinds.com',
 *   bearer: myKey,
 * }));
 * ```
 */
export class AiClient {
  constructor(private client: ThreatWindsClient) {}

  /**
   * Full model catalogue, including transcription and embedding models. Use
   * `listChatModels` when you intend to call chat completions.
   */
  async listModels(signal?: AbortSignal): Promise<AIModel[]> {
    const raw = (await this.client.request('GET', `${BASE}/models`, { signal })) as {
      data?: Array<Record<string, unknown>>;
    };
    return (raw?.data ?? [])
      .filter((m) => typeof m?.id === 'string')
      .map((m) => {
        const limits = (m.limits ?? {}) as Record<string, unknown>;
        return {
          id: m.id as string,
          object: typeof m.object === 'string' ? m.object : undefined,
          name: typeof m.name === 'string' ? m.name : undefined,
          provider: typeof m.provider === 'string' ? m.provider : undefined,
          ownedBy: typeof m.owned_by === 'string' ? m.owned_by : undefined,
          capabilities: Array.isArray(m.capabilities)
            ? m.capabilities.filter((c): c is string => typeof c === 'string')
            : [],
          limits: {
            maxInputTokens:
              typeof limits.max_input_tokens === 'number' ? limits.max_input_tokens : undefined,
            maxTotalTokens:
              typeof limits.max_total_tokens === 'number' ? limits.max_total_tokens : undefined,
          },
          params: (m.params ?? undefined) as Record<string, number> | undefined,
        };
      });
  }

  /**
   * Models that accept chat completions. Pass `requireTools` when the caller
   * runs an agent loop — a model without `tools-use` will simply ignore the
   * tool definitions and answer from memory instead of querying the API.
   */
  async listChatModels(
    opts: { requireTools?: boolean; signal?: AbortSignal } = {},
  ): Promise<AIModel[]> {
    const models = await this.listModels(opts.signal);
    return models.filter(
      (m) =>
        m.capabilities.includes('chat') &&
        (!opts.requireTools || m.capabilities.includes('tools-use')),
    );
  }

  /** Non-streaming completion. Prefer `streamChatCompletion` for interactive UI. */
  async chatCompletion(
    req: ChatCompletionRequest,
    signal?: AbortSignal,
  ): Promise<ChatCompletionResponse> {
    return (await this.client.request('POST', `${BASE}/chat/completions`, {
      body: { ...req, stream: false },
      signal,
      timeout: STREAM_TIMEOUT_MS,
    })) as ChatCompletionResponse;
  }

  /**
   * Streams a completion, invoking `onDelta` with each text fragment.
   *
   * Tool calls arrive fragmented across chunks — keyed by index, with the
   * arguments JSON split arbitrarily — so they are reassembled here and only
   * returned once complete. That matters for agent loops, which cannot execute
   * a tool until its arguments parse.
   */
  async streamChatCompletion(
    req: ChatCompletionRequest,
    onDelta?: (text: string) => void,
    signal?: AbortSignal,
  ): Promise<ChatCompletionResult> {
    let content = '';
    let finishReason = '';
    let usage: ChatCompletionResult['usage'];
    const partial = new Map<number, ToolCall>();

    const events = this.client.stream('POST', `${BASE}/chat/completions`, {
      body: { ...req, stream: true, stream_options: { include_usage: true } },
      signal,
      timeout: STREAM_TIMEOUT_MS,
    });

    for await (const payload of events) {
      let parsed: {
        choices?: Array<{ delta?: StreamChoiceDelta; finish_reason?: string | null }>;
        usage?: ChatCompletionResult['usage'];
      };
      try {
        parsed = JSON.parse(payload);
      } catch {
        // A malformed chunk should not abort an otherwise healthy stream.
        continue;
      }

      if (parsed.usage) usage = parsed.usage;

      const choice = parsed.choices?.[0];
      if (!choice) continue;
      if (typeof choice.finish_reason === 'string') finishReason = choice.finish_reason;

      const delta = choice.delta;
      if (!delta) continue;

      if (typeof delta.content === 'string' && delta.content) {
        content += delta.content;
        onDelta?.(delta.content);
      }

      for (const fragment of delta.tool_calls ?? []) {
        const index = typeof fragment.index === 'number' ? fragment.index : 0;
        const call =
          partial.get(index) ??
          ({ id: '', type: 'function', function: { name: '', arguments: '' } } as ToolCall);
        if (fragment.id) call.id = fragment.id;
        if (fragment.function?.name) call.function.name = fragment.function.name;
        if (typeof fragment.function?.arguments === 'string') {
          call.function.arguments += fragment.function.arguments;
        }
        partial.set(index, call);
      }
    }

    const toolCalls = [...partial.entries()]
      .sort(([a], [b]) => a - b)
      // Some providers omit ids on streamed fragments, but the follow-up tool
      // message must reference one, so synthesize a stable fallback.
      .map(([index, call]) => ({ ...call, id: call.id || `call_${index}` }))
      .filter((call) => call.function.name);

    return {
      content,
      toolCalls,
      finishReason: finishReason || (toolCalls.length > 0 ? 'tool_calls' : 'stop'),
      usage,
    };
  }

  async countTokens(req: TokenCountRequest, signal?: AbortSignal): Promise<TokenCountResponse> {
    const raw = (await this.client.request('POST', `${BASE}/chat/count`, {
      body: req,
      signal,
    })) as { tokens?: number; count?: number };
    const tokens = raw?.tokens ?? raw?.count;
    if (typeof tokens !== 'number') {
      throw new SDKError('token count endpoint returned no usable count');
    }
    return { tokens };
  }

  async embeddings(req: EmbeddingsRequest, signal?: AbortSignal): Promise<EmbeddingsResponse> {
    return (await this.client.request('POST', `${BASE}/embeddings`, {
      body: req,
      signal,
    })) as EmbeddingsResponse;
  }
}
