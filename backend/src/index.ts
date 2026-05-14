import type { Env } from './types/env';
import { handleRequest } from './app';
import { createRuntimeContext } from './services/runtime';
import { createRequestLogger, serializeError } from './services/logger';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const requestId = crypto.randomUUID();
    const startedAt = Date.now();
    const logger = createRequestLogger({ requestId, route: 'worker_fetch', startedAt });

    try {
      return await handleRequest(request, env, createRuntimeContext(request, env));
    } catch (error) {
      const url = new URL(request.url);

      logger.error('unhandled_error', {
        method: request.method,
        pathname: url.pathname,
        error: serializeError(error),
      });

      return new Response(
        JSON.stringify({
          success: false,
          request_id: requestId,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Internal server error',
          },
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
          },
        },
      );
    }
  },
};
