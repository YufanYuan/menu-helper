import type { ChatCompletionRequest } from '../types/api';
import type { Env } from '../types/env';
import type { RuntimeContext } from '../types/runtime';
import { resolveWeChatOpenId } from '../services/wechat';
import { callOpenRouter } from '../services/openrouter';
import { writeUsageEvent } from '../services/analytics';
import { createRequestLogger, serializeError, type RequestLogger } from '../services/logger';

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

function loggedErrorResponse(
  logger: RequestLogger,
  requestId: string,
  code: string,
  message: string,
  status: number,
): Response {
  logger.warn('response_sent', {
    success: false,
    statusCode: status,
    errorCode: code,
  });

  return errorResponse(requestId, code, message, status);
}

function getPayloadShape(payload: unknown): Record<string, unknown> {
  if (Array.isArray(payload)) {
    return {
      bodyType: 'array',
      bodyLength: payload.length,
    };
  }

  if (typeof payload === 'object' && payload !== null) {
    return {
      bodyType: 'object',
      bodyKeys: Object.keys(payload as Record<string, unknown>).sort(),
    };
  }

  return {
    bodyType: typeof payload,
  };
}

function getRequestLogMetadata(request: Request, runtimeContext: RuntimeContext): Record<string, unknown> {
  const url = new URL(request.url);

  return {
    method: request.method,
    pathname: url.pathname,
    contentType: request.headers.get('content-type') ?? 'unknown',
    contentLength: request.headers.get('content-length') ?? 'unknown',
    platform: runtimeContext.platform,
    hasAnalyticsWriter: Boolean(runtimeContext.analyticsWriter),
    country: runtimeContext.requestLocation?.country,
    region: runtimeContext.requestLocation?.region,
    colo: runtimeContext.requestLocation?.colo,
  };
}

function summarizeMessages(body: ChatCompletionRequest): Record<string, unknown> {
  const roleCounts: Record<string, number> = {};
  const contentKinds: Record<string, number> = {};

  for (const rawMessage of body.messages as unknown[]) {
    const message =
      typeof rawMessage === 'object' && rawMessage !== null
        ? (rawMessage as Record<string, unknown>)
        : undefined;
    const role = typeof message?.role === 'string' ? message.role : 'unknown';
    const content = message?.content;
    const kind = Array.isArray(content) ? 'parts' : typeof content;

    roleCounts[role] = (roleCounts[role] ?? 0) + 1;
    contentKinds[kind] = (contentKinds[kind] ?? 0) + 1;
  }

  return {
    messageCount: body.messages.length,
    messageRoles: roleCounts,
    messageContentKinds: contentKinds,
  };
}

function getChatRequestSummary(body: ChatCompletionRequest): Record<string, unknown> {
  return {
    requestedModel: getRequestedModelLabel(body),
    modelCount: body.models?.length ?? (body.model ? 1 : 0),
    clientRequestId: body.client_request_id,
    hasSessionId: Boolean(body.session_id),
    hasReasoning: Boolean(body.reasoning),
    hasResponseFormat: Boolean(body.response_format),
    hasProvider: Boolean(body.provider),
    hasStructuredOutputs: typeof body.structured_outputs === 'boolean',
    temperature: body.temperature,
    maxTokens: body.max_tokens,
    ...summarizeMessages(body),
  };
}

function getOpenRouterHost(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    return 'invalid-base-url';
  }
}

function getOpenRouterRequestSummary(
  baseUrl: string,
  upstreamBody: Record<string, unknown>,
): Record<string, unknown> {
  return {
    upstreamHost: getOpenRouterHost(baseUrl),
    hasModel: typeof upstreamBody.model === 'string',
    modelCount: Array.isArray(upstreamBody.models) ? upstreamBody.models.length : 1,
    messageCount: Array.isArray(upstreamBody.messages) ? upstreamBody.messages.length : 0,
    hasReasoning: Boolean(upstreamBody.reasoning),
    hasResponseFormat: Boolean(upstreamBody.response_format),
    hasProvider: Boolean(upstreamBody.provider),
    stream: upstreamBody.stream,
  };
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

  if (data.client_request_id !== undefined && typeof data.client_request_id !== 'string') {
    return { valid: false, message: 'client_request_id must be a string' };
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

  if (data.session_id !== undefined && typeof data.session_id !== 'string') {
    return { valid: false, message: 'session_id must be a string' };
  }

  if (data.stream === true) {
    return { valid: false, message: 'stream=true is not supported in v1' };
  }

  if (
    data.reasoning !== undefined &&
    (typeof data.reasoning !== 'object' || data.reasoning === null || Array.isArray(data.reasoning))
  ) {
    return { valid: false, message: 'reasoning must be an object' };
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

export async function handleChatCompletions(
  request: Request,
  env: Env,
  runtimeContext: RuntimeContext,
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  const route = 'POST /api/chat/completions';
  const logger = createRequestLogger({ requestId, route, startedAt });

  logger.info('request_received', getRequestLogMetadata(request, runtimeContext));

  let payload: unknown;

  try {
    const jsonParseStartedAt = Date.now();
    payload = await request.json();
    logger.info('request_json_parsed', {
      stageMs: Date.now() - jsonParseStartedAt,
      ...getPayloadShape(payload),
    });
  } catch (error) {
    logger.warn('request_json_invalid', {
      error: serializeError(error),
    });
    return loggedErrorResponse(logger, requestId, 'INVALID_ARGUMENT', 'Invalid JSON body', 400);
  }

  const validation = validateBody(payload);
  if (!validation.valid) {
    logger.warn('request_validation_failed', {
      message: validation.message,
      ...getPayloadShape(payload),
    });
    return loggedErrorResponse(logger, requestId, 'INVALID_ARGUMENT', validation.message, 400);
  }

  const body = validation.data;
  const requestedModelLabel = getRequestedModelLabel(body);
  logger.info('request_validated', getChatRequestSummary(body));

  let openid: string;
  const wechatStartedAt = Date.now();
  logger.info('wechat_auth_started', {
    codeLength: body.wechat_code.length,
  });

  try {
    openid = await resolveWeChatOpenId({
      code: body.wechat_code,
      appId: env.WECHAT_APP_ID,
      appSecret: env.WECHAT_APP_SECRET,
    });
    logger.info('wechat_auth_success', {
      stageMs: Date.now() - wechatStartedAt,
      openidReceived: Boolean(openid),
    });
  } catch (error) {
    logger.warn('wechat_auth_failed', {
      stageMs: Date.now() - wechatStartedAt,
      error: serializeError(error),
    });
    return loggedErrorResponse(
      logger,
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
  if (body.reasoning && typeof body.reasoning === 'object') {
    upstreamBody.reasoning = body.reasoning;
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

  const openRouterBaseUrl = env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1';
  logger.info('openrouter_request_prepared', getOpenRouterRequestSummary(openRouterBaseUrl, upstreamBody));

  const openRouterStartedAt = Date.now();
  try {
    logger.info('openrouter_request_started', {
      requestedModel: requestedModelLabel,
    });
    const { payload: upstreamPayload, status, usage } = await callOpenRouter({
      baseUrl: openRouterBaseUrl,
      apiKey: env.OPENROUTER_API_KEY,
      body: upstreamBody,
      requestId,
    });
    logger.info('openrouter_request_success', {
      stageMs: Date.now() - openRouterStartedAt,
      statusCode: status,
      upstreamId: upstreamPayload.id,
      upstreamModel: upstreamPayload.model,
      choiceCount: upstreamPayload.choices?.length ?? 0,
      usage,
    });

    const latencyMs = Date.now() - startedAt;
    const createdAt = new Date().toISOString();
    const eventType = 'backend_chat_completion_success';

    try {
      writeUsageEvent(runtimeContext.analyticsWriter, {
        clientRequestId: body.client_request_id,
        createdAt,
        eventType,
        isSuccess: true,
        latencyMs,
        location: runtimeContext.requestLocation,
        openid,
        model: upstreamPayload.model ?? requestedModelLabel,
        requestId,
        sessionId: body.session_id,
        stream: false,
        statusCode: 200,
        usage,
      });
      logger.info(runtimeContext.analyticsWriter ? 'analytics_write_success' : 'analytics_write_skipped', {
        eventType,
        hasAnalyticsWriter: Boolean(runtimeContext.analyticsWriter),
      });
    } catch (analyticsError) {
      logger.error('analytics_write_failed', {
        eventType,
        error: serializeError(analyticsError),
      });
    }

    logger.info('response_sent', {
      success: true,
      statusCode: 200,
      upstreamId: upstreamPayload.id,
      upstreamModel: upstreamPayload.model ?? requestedModelLabel,
      choiceCount: upstreamPayload.choices?.length ?? 0,
    });

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
    logger.error('openrouter_request_failed', {
      stageMs: Date.now() - openRouterStartedAt,
      error: serializeError(error),
    });

    const latencyMs = Date.now() - startedAt;
    const createdAt = new Date().toISOString();
    const eventType = 'backend_chat_completion_fail';

    try {
      const errorMessage =
        error instanceof Error ? error.message : 'OpenRouter upstream request failed';

      writeUsageEvent(runtimeContext.analyticsWriter, {
        clientRequestId: body.client_request_id,
        createdAt,
        errorMessage,
        eventType,
        failedStage: 'openrouter_upstream',
        isSuccess: false,
        latencyMs,
        location: runtimeContext.requestLocation,
        openid,
        model: requestedModelLabel,
        requestId,
        sessionId: body.session_id,
        stream: false,
        statusCode: 502,
        usage: {
          prompt_tokens: 0,
          completion_tokens: 0,
          reasoning_tokens: 0,
          total_tokens: 0,
          cost_usd_estimate: 0,
        },
      });
      logger.info(runtimeContext.analyticsWriter ? 'analytics_write_success' : 'analytics_write_skipped', {
        eventType,
        hasAnalyticsWriter: Boolean(runtimeContext.analyticsWriter),
      });
    } catch (analyticsError) {
      logger.error('analytics_write_failed', {
        eventType,
        error: serializeError(analyticsError),
      });
    }

    return loggedErrorResponse(
      logger,
      requestId,
      'OPENROUTER_UPSTREAM_FAILED',
      error instanceof Error ? error.message : 'OpenRouter upstream request failed',
      502,
    );
  }
}
