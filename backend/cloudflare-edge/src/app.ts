import type { Env } from './types/env';
import type { RuntimeContext } from './types/runtime';
import { handleChatCompletions } from './routes/chatCompletions';
import { handleRoomsWebSocket } from './routes/rooms';
import { createRuntimeContext } from './services/runtime';

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

export async function handleRequest(
  request: Request,
  env: Env,
  runtimeContext: RuntimeContext = createRuntimeContext(request, env),
): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === 'GET' && url.pathname === '/ws/rooms') {
    return handleRoomsWebSocket(request, env);
  }

  if (request.method === 'POST' && url.pathname === '/api/chat/completions') {
    return handleChatCompletions(request, env, runtimeContext);
  }

  return jsonNotFound();
}
