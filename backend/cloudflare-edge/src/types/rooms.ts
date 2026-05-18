export interface RoomMemberProfile {
  nickName?: string;
  avatarUrl?: string;
  avatarColor?: string;
}

export interface RoomMember {
  memberId: string;
  nickName: string;
  avatarUrl: string;
  avatarColor: string;
  joinedAt: string;
  updatedAt: string;
}

export interface RoomMenuItem {
  id: string;
  translatedCategory?: string;
  originalName?: string;
  translatedName?: string;
  descriptionOriginal?: string;
  descriptionTranslated?: string;
  priceText?: string;
  priceValue?: number;
  initialQuantity?: number;
}

export interface RoomMenuPayload {
  menuLanguage: string;
  currency: string;
  items: RoomMenuItem[];
}

export interface RoomAttribution {
  memberId: string;
  avatarUrl: string;
  avatarColor: string;
}

export interface RoomSnapshot {
  roomId: string;
  version: number;
  menu: RoomMenuPayload;
  cart: Record<string, number>;
  attributions: Record<string, RoomAttribution>;
  members: Record<string, RoomMember>;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
}

export interface RoomState extends RoomSnapshot {
  memberOpenids: Record<string, string>;
  openidMembers: Record<string, string>;
  lastEmptyAt?: string;
}

export type ClientRoomMessage =
  | {
      type: 'create_room';
      requestId?: string;
      wechatCode: string;
      member?: RoomMemberProfile;
      menu: RoomMenuPayload;
      cart?: Record<string, number>;
    }
  | {
      type: 'join_room';
      requestId?: string;
      roomId: string;
      wechatCode: string;
      member?: RoomMemberProfile;
    }
  | {
      type: 'adjust_item_quantity';
      requestId?: string;
      itemId: string;
      delta: number;
    }
  | {
      type: 'update_member_profile';
      requestId?: string;
      member?: RoomMemberProfile;
    }
  | {
      type: 'heartbeat';
      requestId?: string;
    };

export type ServerRoomMessage =
  | {
      type: 'room_created' | 'room_joined';
      requestId?: string;
      roomId: string;
      memberId: string;
      state: RoomSnapshot;
    }
  | {
      type: 'room_snapshot';
      state: RoomSnapshot;
    }
  | {
      type: 'cart_updated';
      requestId?: string;
      roomId: string;
      version: number;
      cart: Record<string, number>;
      attributions: Record<string, RoomAttribution>;
      changedItemId: string;
      actorMemberId: string;
    }
  | {
      type: 'member_joined';
      roomId: string;
      version: number;
      member: RoomMember;
    }
  | {
      type: 'pong';
      requestId?: string;
    }
  | {
      type: 'room_error';
      requestId?: string;
      code: string;
      message: string;
    };
