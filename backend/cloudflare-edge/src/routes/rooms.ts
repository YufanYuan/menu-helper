import type { Env } from '../types/env';

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

export function handleRoomsWebSocket(request: Request, env: Env): Response | Promise<Response> {
  if (request.headers.get('Upgrade') !== 'websocket') {
    return jsonResponse(
      {
        success: false,
        error: {
          code: 'WEBSOCKET_REQUIRED',
          message: 'Expected websocket upgrade',
        },
      },
      426,
    );
  }

  const url = new URL(request.url);
  const requestedRoomId = url.searchParams.get('roomId');
  let objectId: DurableObjectId;

  try {
    objectId = requestedRoomId
      ? env.MENU_ROOM_OBJECT.idFromString(requestedRoomId)
      : env.MENU_ROOM_OBJECT.newUniqueId();
  } catch {
    return jsonResponse(
      {
        success: false,
        error: {
          code: 'INVALID_ROOM_ID',
          message: 'Invalid room id',
        },
      },
      400,
    );
  }
  const roomId = objectId.toString();

  url.searchParams.set('roomId', roomId);

  return env.MENU_ROOM_OBJECT.get(objectId).fetch(new Request(url.toString(), request));
}
