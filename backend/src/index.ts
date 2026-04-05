import type { Env } from './types/env';
import { handleChatCompletions } from './routes/chatCompletions';

function jsonNotFound(): Response {
  return new Response(
    JSON.stringify({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Route not found',
      },
    }),
    {
      status: 404,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
    },
  );
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/api/chat/completions') {
      return handleChatCompletions(request, env);
    }

    return jsonNotFound();
  },
};
