import type { ChatCompletionRequest } from '../types/api';
import type { Env } from '../types/env';
import { resolveWeChatOpenId } from '../services/wechat';
import { callOpenRouter } from '../services/openrouter';
import { writeUsageEvent } from '../services/analytics';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

function errorResponse(requestId: string, code: string, message: string, status: number): Response {
  return jsonResponse(
    {
      success: false,
      request_id: requestId,
      error: {
        code,
        message,
      },
    },
    status,
  );
}

function validateBody(payload: unknown): { valid: true; data: ChatCompletionRequest } | { valid: false; message: string } {
  if (typeof payload !== 'object' || payload === null) {
    return { valid: false, message: 'Request body must be a JSON object' };
  }

  const data = payload as Partial<ChatCompletionRequest>;

  if (!data.wechat_code || typeof data.wechat_code !== 'string') {
    return { valid: false, message: 'wechat_code is required and must be a string' };
  }

  if (data.model !== undefined && typeof data.model !== 'string') {
    return { valid: false, message: 'model must be a string' };
  }

  if (
    data.models !== undefined &&
    (!Array.isArray(data.models) ||
      data.models.length === 0 ||
      data.models.some((model) => typeof model !== 'string' || model.length === 0))
  ) {
    return { valid: false, message: 'models must be a non-empty array of strings' };
  }

  if (!data.model && !data.models) {
    return { valid: false, message: 'model or models is required' };
  }

  if (!Array.isArray(data.messages) || data.messages.length === 0) {
    return { valid: false, message: 'messages is required and must be a non-empty array' };
  }

  if (data.stream === true) {
    return { valid: false, message: 'stream=true is not supported in v1' };
  }

  return { valid: true, data: data as ChatCompletionRequest };
}

function getRequestedModelLabel(body: ChatCompletionRequest): string {
  if (body.model) {
    return body.model;
  }

  if (body.models && body.models.length > 0) {
    return body.models.join(',');
  }

  return 'unknown';
}

export async function handleChatCompletions(request: Request, env: Env): Promise<Response> {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return errorResponse(requestId, 'INVALID_ARGUMENT', 'Invalid JSON body', 400);
  }

  const validation = validateBody(payload);
  if (!validation.valid) {
    return errorResponse(requestId, 'INVALID_ARGUMENT', validation.message, 400);
  }

  const body = validation.data;
  const requestedModelLabel = getRequestedModelLabel(body);

  let openid: string;
  try {
    openid = await resolveWeChatOpenId({
      code: body.wechat_code,
      appId: env.WECHAT_APP_ID,
      appSecret: env.WECHAT_APP_SECRET,
    });
  } catch (error) {
    return errorResponse(
      requestId,
      'WECHAT_AUTH_FAILED',
      error instanceof Error ? error.message : 'Failed to verify WeChat user',
      401,
    );
  }

  const upstreamBody: Record<string, unknown> = {
    messages: body.messages,
    stream: false,
    user: openid,
  };

  if (body.models && body.models.length > 0) {
    upstreamBody.models = body.models;
  } else if (body.model) {
    upstreamBody.model = body.model;
  }

  if (typeof body.temperature === 'number') {
    upstreamBody.temperature = body.temperature;
  }
  if (typeof body.max_tokens === 'number') {
    upstreamBody.max_tokens = body.max_tokens;
  }
  if (body.response_format && typeof body.response_format === 'object') {
    upstreamBody.response_format = body.response_format;
  }
  if (body.provider && typeof body.provider === 'object') {
    upstreamBody.provider = body.provider;
  }
  if (typeof body.structured_outputs === 'boolean') {
    upstreamBody.structured_outputs = body.structured_outputs;
  }

  try {
    const baseUrl = env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1';
    const { payload: upstreamPayload, usage } = await callOpenRouter({
      baseUrl,
      apiKey: env.OPENROUTER_API_KEY,
      body: upstreamBody,
      requestId,
    });

    const latencyMs = Date.now() - startedAt;
    const createdAt = new Date().toISOString();

    try {
      writeUsageEvent(env.USAGE_DATASET, {
        eventType: 'chat_completion',
        openid,
        model: upstreamPayload.model ?? requestedModelLabel,
        stream: false,
        statusCode: 200,
        latencyMs,
        usage,
        cf: request.cf,
        createdAt,
        requestId,
      });
    } catch (analyticsError) {
      console.error('ANALYTICS_WRITE_FAILED', {
        requestId,
        error: analyticsError,
      });
    }

    return jsonResponse({
      success: true,
      request_id: requestId,
      data: {
        id: upstreamPayload.id,
        model: upstreamPayload.model ?? requestedModelLabel,
        choices: upstreamPayload.choices ?? [],
        usage,
      },
    });
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    const createdAt = new Date().toISOString();

    try {
      writeUsageEvent(env.USAGE_DATASET, {
        eventType: 'chat_completion',
        openid,
        model: requestedModelLabel,
        stream: false,
        statusCode: 502,
        latencyMs,
        usage: {
          prompt_tokens: 0,
          completion_tokens: 0,
          reasoning_tokens: 0,
          total_tokens: 0,
          cost_usd_estimate: 0,
        },
        cf: request.cf,
        createdAt,
        requestId,
      });
    } catch (analyticsError) {
      console.error('ANALYTICS_WRITE_FAILED', {
        requestId,
        error: analyticsError,
      });
    }

    return errorResponse(
      requestId,
      'OPENROUTER_UPSTREAM_FAILED',
      error instanceof Error ? error.message : 'OpenRouter upstream request failed',
      502,
    );
  }
}
