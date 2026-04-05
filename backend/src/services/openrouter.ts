export interface OpenRouterUsage {
  prompt_tokens: number;
  completion_tokens: number;
  reasoning_tokens: number;
  total_tokens: number;
  cost_usd_estimate: number;
}

export interface OpenRouterResponse {
  id?: string;
  model?: string;
  choices?: unknown[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    reasoning_tokens?: number;
    cost?: number;
    cost_usd?: number;
    completion_tokens_details?: {
      reasoning_tokens?: number;
    };
  };
  [key: string]: unknown;
}

function normalizeUsage(payload: OpenRouterResponse): OpenRouterUsage {
  const usage = payload.usage ?? {};
  const reasoningTokens =
    usage.reasoning_tokens ?? usage.completion_tokens_details?.reasoning_tokens ?? 0;

  return {
    prompt_tokens: usage.prompt_tokens ?? 0,
    completion_tokens: usage.completion_tokens ?? 0,
    reasoning_tokens: reasoningTokens,
    total_tokens: usage.total_tokens ?? 0,
    cost_usd_estimate: usage.cost_usd ?? usage.cost ?? 0,
  };
}

export async function callOpenRouter(params: {
  baseUrl: string;
  apiKey: string;
  body: Record<string, unknown>;
  requestId: string;
}): Promise<{ payload: OpenRouterResponse; status: number; usage: OpenRouterUsage }> {
  const response = await fetch(`${params.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      'Content-Type': 'application/json',
      'X-Request-Id': params.requestId,
    },
    body: JSON.stringify(params.body),
  });

  const payload = (await response.json()) as OpenRouterResponse;

  if (!response.ok) {
    throw new Error(`OpenRouter error (${response.status}): ${JSON.stringify(payload)}`);
  }

  return {
    payload,
    status: response.status,
    usage: normalizeUsage(payload),
  };
}
