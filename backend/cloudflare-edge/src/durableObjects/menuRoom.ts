import type { Env } from '../types/env';
import type {
  ClientRoomMessage,
  RoomAttribution,
  RoomMember,
  RoomMemberProfile,
  RoomMenuPayload,
  RoomSnapshot,
  RoomState,
  ServerRoomMessage,
} from '../types/rooms';
import { resolveWeChatOpenId } from '../services/wechat';

const ROOM_STATE_KEY = 'room_state';
const ROOM_EMPTY_TTL_MS = 2 * 60 * 60 * 1000;
const DEFAULT_AVATAR_COLORS = ['#182126', '#3f6f63', '#b85c38', '#5d6f9f', '#8a5a83'];

interface SocketAttachment {
  roomId: string;
  memberId?: string;
  authenticated?: boolean;
}

export class MenuRoomObject {
  constructor(private readonly ctx: DurableObjectState, private readonly env: Env) {}

  async fetch(request: Request): Promise<Response> {
    const upgrade = request.headers.get('Upgrade');
    if (upgrade !== 'websocket') {
      return jsonResponse({ success: false, error: 'Expected websocket upgrade' }, 426);
    }

    const roomId = new URL(request.url).searchParams.get('roomId');
    if (!roomId) {
      return jsonResponse({ success: false, error: 'roomId is required' }, 400);
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    server.serializeAttachment({ roomId, authenticated: false } satisfies SocketAttachment);
    this.ctx.acceptWebSocket(server);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const attachment = readAttachment(ws);
    const payload = parseMessage(message);

    if (!payload) {
      sendMessage(ws, {
        type: 'room_error',
        code: 'INVALID_JSON',
        message: 'Invalid room message',
      });
      return;
    }

    if (payload.type === 'heartbeat') {
      sendMessage(ws, { type: 'pong', requestId: payload.requestId });
      return;
    }

    try {
      if (!attachment.authenticated) {
        await this.handleInitialMessage(ws, attachment, payload);
        return;
      }

      if (payload.type === 'adjust_item_quantity') {
        await this.handleAdjustQuantity(ws, attachment, payload);
        return;
      }

      if (payload.type === 'update_member_profile') {
        await this.handleUpdateMemberProfile(ws, attachment, payload);
        return;
      }

      sendMessage(ws, {
        type: 'room_error',
        requestId: payload.requestId,
        code: 'UNEXPECTED_MESSAGE',
        message: 'Unexpected room message',
      });
    } catch (error) {
      sendMessage(ws, {
        type: 'room_error',
        requestId: payload.requestId,
        code: 'ROOM_ERROR',
        message: error instanceof Error ? error.message : 'Room operation failed',
      });
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    await this.scheduleExpirationIfEmpty(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.scheduleExpirationIfEmpty(ws);
  }

  async alarm(): Promise<void> {
    if (this.getAuthenticatedSockets().length > 0) {
      await this.ctx.storage.deleteAlarm();
      return;
    }

    const state = await this.getState();
    if (!state) {
      await this.ctx.storage.deleteAll();
      return;
    }

    const lastEmptyAt = state.lastEmptyAt ? Date.parse(state.lastEmptyAt) : Date.now();
    if (Date.now() - lastEmptyAt >= ROOM_EMPTY_TTL_MS) {
      await this.ctx.storage.deleteAll();
      return;
    }

    await this.ctx.storage.setAlarm(lastEmptyAt + ROOM_EMPTY_TTL_MS);
  }

  private async handleInitialMessage(
    ws: WebSocket,
    attachment: SocketAttachment,
    payload: ClientRoomMessage,
  ): Promise<void> {
    if (payload.type === 'create_room') {
      await this.handleCreateRoom(ws, attachment, payload);
      return;
    }

    if (payload.type === 'join_room') {
      await this.handleJoinRoom(ws, attachment, payload);
      return;
    }

    sendMessage(ws, {
      type: 'room_error',
      requestId: payload.requestId,
      code: 'AUTH_REQUIRED',
      message: 'Create or join the room before sending updates',
    });
  }

  private async handleCreateRoom(
    ws: WebSocket,
    attachment: SocketAttachment,
    payload: Extract<ClientRoomMessage, { type: 'create_room' }>,
  ): Promise<void> {
    const existingState = await this.getState();
    if (existingState) {
      throw new Error('Room already exists');
    }

    const menu = normalizeMenu(payload.menu);
    const now = new Date().toISOString();
    const openid = await resolveWeChatOpenId({
      code: payload.wechatCode,
      appId: this.env.WECHAT_APP_ID,
      appSecret: this.env.WECHAT_APP_SECRET,
    });
    const member = buildMember(openid, payload.member, now);
    const cart = normalizeInitialCart(menu, payload.cart);
    const attributions = buildInitialAttributions(cart, member);
    const state: RoomState = {
      roomId: attachment.roomId,
      version: 1,
      menu,
      cart,
      attributions,
      members: {
        [member.memberId]: member,
      },
      memberOpenids: {
        [member.memberId]: openid,
      },
      openidMembers: {
        [openid]: member.memberId,
      },
      createdAt: now,
      updatedAt: now,
    };

    await this.ctx.storage.put(ROOM_STATE_KEY, state);
    await this.ctx.storage.deleteAlarm();
    attachMember(ws, attachment, member.memberId);

    sendMessage(ws, {
      type: 'room_created',
      requestId: payload.requestId,
      roomId: state.roomId,
      memberId: member.memberId,
      state: toSnapshot(state),
    });
  }

  private async handleJoinRoom(
    ws: WebSocket,
    attachment: SocketAttachment,
    payload: Extract<ClientRoomMessage, { type: 'join_room' }>,
  ): Promise<void> {
    if (payload.roomId !== attachment.roomId) {
      throw new Error('Room id does not match websocket route');
    }

    const state = await this.getRequiredState();
    const openid = await resolveWeChatOpenId({
      code: payload.wechatCode,
      appId: this.env.WECHAT_APP_ID,
      appSecret: this.env.WECHAT_APP_SECRET,
    });
    const now = new Date().toISOString();
    const { member, updatedState, isNewMember } = upsertMember(state, openid, payload.member, now);
    delete updatedState.lastEmptyAt;

    await this.ctx.storage.put(ROOM_STATE_KEY, updatedState);
    await this.ctx.storage.deleteAlarm();
    attachMember(ws, attachment, member.memberId);

    sendMessage(ws, {
      type: 'room_joined',
      requestId: payload.requestId,
      roomId: updatedState.roomId,
      memberId: member.memberId,
      state: toSnapshot(updatedState),
    });

    if (isNewMember) {
      this.broadcast({
        type: 'member_joined',
        roomId: updatedState.roomId,
        version: updatedState.version,
        member,
      }, ws);
    }
  }

  private async handleAdjustQuantity(
    ws: WebSocket,
    attachment: SocketAttachment,
    payload: Extract<ClientRoomMessage, { type: 'adjust_item_quantity' }>,
  ): Promise<void> {
    if (!attachment.memberId) {
      throw new Error('Missing room member');
    }

    const state = await this.getRequiredState();
    const member = state.members[attachment.memberId];
    if (!member) {
      throw new Error('Unknown room member');
    }

    const itemExists = state.menu.items.some((item) => item.id === payload.itemId);
    if (!itemExists) {
      throw new Error('Unknown menu item');
    }

    const delta = Math.trunc(Number(payload.delta) || 0);
    if (delta === 0) {
      return;
    }

    const previousQuantity = Number(state.cart[payload.itemId] || 0);
    const nextQuantity = Math.max(0, previousQuantity + delta);
    const nextCart = { ...state.cart };
    const nextAttributions = { ...state.attributions };

    if (nextQuantity === 0) {
      delete nextCart[payload.itemId];
      delete nextAttributions[payload.itemId];
    } else {
      nextCart[payload.itemId] = nextQuantity;
      if (previousQuantity === 0) {
        nextAttributions[payload.itemId] = attributionFromMember(member);
      }
    }

    const updatedState: RoomState = {
      ...state,
      cart: nextCart,
      attributions: nextAttributions,
      version: state.version + 1,
      updatedAt: new Date().toISOString(),
    };

    await this.ctx.storage.put(ROOM_STATE_KEY, updatedState);
    this.broadcast({
      type: 'cart_updated',
      requestId: payload.requestId,
      roomId: updatedState.roomId,
      version: updatedState.version,
      cart: updatedState.cart,
      attributions: updatedState.attributions,
      changedItemId: payload.itemId,
      actorMemberId: member.memberId,
    });
  }

  private async handleUpdateMemberProfile(
    _ws: WebSocket,
    attachment: SocketAttachment,
    payload: Extract<ClientRoomMessage, { type: 'update_member_profile' }>,
  ): Promise<void> {
    if (!attachment.memberId) {
      throw new Error('Missing room member');
    }

    const state = await this.getRequiredState();
    const currentMember = state.members[attachment.memberId];
    if (!currentMember) {
      throw new Error('Unknown room member');
    }

    const member = {
      ...currentMember,
      ...normalizeProfile(payload.member, attachment.memberId),
      updatedAt: new Date().toISOString(),
    };
    const nextAttributions = { ...state.attributions };
    for (const [itemId, attribution] of Object.entries(nextAttributions)) {
      if (attribution.memberId === member.memberId) {
        nextAttributions[itemId] = attributionFromMember(member);
      }
    }

    const updatedState: RoomState = {
      ...state,
      members: {
        ...state.members,
        [member.memberId]: member,
      },
      attributions: nextAttributions,
      version: state.version + 1,
      updatedAt: member.updatedAt,
    };

    await this.ctx.storage.put(ROOM_STATE_KEY, updatedState);
    this.broadcast({
      type: 'room_snapshot',
      state: toSnapshot(updatedState),
    });
  }

  private async getState(): Promise<RoomState | undefined> {
    return this.ctx.storage.get<RoomState>(ROOM_STATE_KEY);
  }

  private async getRequiredState(): Promise<RoomState> {
    const state = await this.getState();
    if (!state) {
      throw new Error('Room has expired or does not exist');
    }
    return state;
  }

  private broadcast(message: ServerRoomMessage, except?: WebSocket): void {
    const payload = JSON.stringify(message);
    for (const socket of this.getAuthenticatedSockets()) {
      if (socket === except || socket.readyState !== WebSocket.OPEN) {
        continue;
      }
      socket.send(payload);
    }
  }

  private getAuthenticatedSockets(): WebSocket[] {
    return this.ctx.getWebSockets().filter((socket) => {
      const attachment = readAttachment(socket);
      return Boolean(attachment.authenticated);
    });
  }

  private async scheduleExpirationIfEmpty(closingSocket: WebSocket): Promise<void> {
    const hasOtherSockets = this.getAuthenticatedSockets().some((socket) => socket !== closingSocket);
    if (hasOtherSockets) {
      return;
    }

    const state = await this.getState();
    if (!state) {
      return;
    }

    const lastEmptyAt = new Date().toISOString();
    await this.ctx.storage.put(ROOM_STATE_KEY, {
      ...state,
      lastEmptyAt,
    });
    await this.ctx.storage.setAlarm(Date.parse(lastEmptyAt) + ROOM_EMPTY_TTL_MS);
  }
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

function parseMessage(message: string | ArrayBuffer): ClientRoomMessage | null {
  try {
    const text =
      typeof message === 'string'
        ? message
        : new TextDecoder().decode(message);
    const payload = JSON.parse(text) as Partial<ClientRoomMessage>;
    if (!payload || typeof payload.type !== 'string') {
      return null;
    }
    return payload as ClientRoomMessage;
  } catch {
    return null;
  }
}

function readAttachment(ws: WebSocket): SocketAttachment {
  const attachment = ws.deserializeAttachment() as SocketAttachment | null;
  return attachment ?? { roomId: '', authenticated: false };
}

function attachMember(ws: WebSocket, attachment: SocketAttachment, memberId: string): void {
  ws.serializeAttachment({
    ...attachment,
    memberId,
    authenticated: true,
  } satisfies SocketAttachment);
}

function sendMessage(ws: WebSocket, message: ServerRoomMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function normalizeMenu(menu: RoomMenuPayload): RoomMenuPayload {
  if (!menu || !Array.isArray(menu.items) || menu.items.length === 0) {
    throw new Error('Menu payload is required');
  }

  return {
    menuLanguage: String(menu.menuLanguage || ''),
    currency: String(menu.currency || ''),
    items: menu.items
      .filter((item) => item && item.id)
      .map((item) => ({
        id: String(item.id),
        translatedCategory: String(item.translatedCategory || ''),
        originalName: String(item.originalName || ''),
        translatedName: String(item.translatedName || ''),
        descriptionOriginal: String(item.descriptionOriginal || ''),
        descriptionTranslated: String(item.descriptionTranslated || ''),
        priceText: String(item.priceText || ''),
        priceValue: Number(item.priceValue) || 0,
        initialQuantity: Math.max(0, Math.trunc(Number(item.initialQuantity) || 0)),
      })),
  };
}

function normalizeInitialCart(menu: RoomMenuPayload, cart?: Record<string, number>): Record<string, number> {
  const nextCart: Record<string, number> = {};
  const source = cart && typeof cart === 'object' ? cart : {};

  for (const item of menu.items) {
    const quantity = Math.max(
      0,
      Math.trunc(Number(source[item.id] ?? item.initialQuantity ?? 0) || 0),
    );
    if (quantity > 0) {
      nextCart[item.id] = quantity;
    }
  }

  return nextCart;
}

function buildInitialAttributions(cart: Record<string, number>, member: RoomMember): Record<string, RoomAttribution> {
  const attributions: Record<string, RoomAttribution> = {};
  for (const itemId of Object.keys(cart)) {
    attributions[itemId] = attributionFromMember(member);
  }
  return attributions;
}

function upsertMember(
  state: RoomState,
  openid: string,
  profile: RoomMemberProfile | undefined,
  now: string,
): { member: RoomMember; updatedState: RoomState; isNewMember: boolean } {
  const existingMemberId = state.openidMembers[openid];
  if (existingMemberId && state.members[existingMemberId]) {
    const member = {
      ...state.members[existingMemberId],
      ...normalizeProfile(profile, existingMemberId),
      updatedAt: now,
    };
    const updatedState = {
      ...state,
      members: {
        ...state.members,
        [existingMemberId]: member,
      },
      updatedAt: now,
    };
    return { member, updatedState, isNewMember: false };
  }

  const member = buildMember(openid, profile, now);
  const updatedState: RoomState = {
    ...state,
    members: {
      ...state.members,
      [member.memberId]: member,
    },
    memberOpenids: {
      ...state.memberOpenids,
      [member.memberId]: openid,
    },
    openidMembers: {
      ...state.openidMembers,
      [openid]: member.memberId,
    },
    version: state.version + 1,
    updatedAt: now,
  };

  return { member, updatedState, isNewMember: true };
}

function buildMember(_openid: string, profile: RoomMemberProfile | undefined, now: string): RoomMember {
  const memberId = `member_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  return {
    memberId,
    ...normalizeProfile(profile, memberId),
    joinedAt: now,
    updatedAt: now,
  };
}

function normalizeProfile(profile: RoomMemberProfile | undefined, memberId: string): Pick<RoomMember, 'nickName' | 'avatarUrl' | 'avatarColor'> {
  const fallbackIndex = Math.abs(hashNumber(memberId)) % DEFAULT_AVATAR_COLORS.length;
  return {
    nickName: String(profile?.nickName || '微信用户').slice(0, 40),
    avatarUrl: String(profile?.avatarUrl || ''),
    avatarColor: String(profile?.avatarColor || DEFAULT_AVATAR_COLORS[fallbackIndex]),
  };
}

function attributionFromMember(member: RoomMember): RoomAttribution {
  return {
    memberId: member.memberId,
    avatarUrl: member.avatarUrl,
    avatarColor: member.avatarColor,
  };
}

function toSnapshot(state: RoomState): RoomSnapshot {
  return {
    roomId: state.roomId,
    version: state.version,
    menu: state.menu,
    cart: state.cart,
    attributions: state.attributions,
    members: state.members,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
    expiresAt: state.lastEmptyAt
      ? new Date(Date.parse(state.lastEmptyAt) + ROOM_EMPTY_TTL_MS).toISOString()
      : undefined,
  };
}

function hashText(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function hashNumber(value: string): number {
  return Number.parseInt(hashText(value), 16) || 0;
}
