from __future__ import annotations

import asyncio
import calendar
import json
import os
import time
import urllib.parse
import urllib.request
import uuid
from dataclasses import dataclass
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect

try:
    import redis.asyncio as redis
    from redis.exceptions import WatchError
except ImportError:  # pragma: no cover - dependency is declared in pyproject
    redis = None  # type: ignore[assignment]

    class WatchError(Exception):
        pass


ROOM_EMPTY_TTL_SECONDS = 2 * 60 * 60
ROOM_CONNECTION_STALE_SECONDS = 90
DEFAULT_AVATAR_COLORS = ["#182126", "#3f6f63", "#b85c38", "#5d6f9f", "#8a5a83"]


@dataclass
class RoomConnection:
    websocket: WebSocket
    room_id: str
    member_id: str
    connection_id: str


class RoomError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


class RedisRoomStore:
    def __init__(self, redis_url: str) -> None:
        if redis is None:
            raise RuntimeError("redis package is required for room storage")
        self.client = redis.Redis.from_url(redis_url, decode_responses=True)

    async def close(self) -> None:
        await self.client.aclose()

    def state_key(self, room_id: str) -> str:
        return f"room:{room_id}:state"

    def events_channel(self, room_id: str) -> str:
        return f"room:{room_id}:events"

    def connections_key(self, room_id: str) -> str:
        return f"room:{room_id}:connections"

    async def get_state(self, room_id: str) -> dict[str, Any] | None:
        raw_state = await self.client.get(self.state_key(room_id))
        if not raw_state:
            return None
        return json.loads(raw_state)

    async def save_state(self, state: dict[str, Any], active: bool) -> None:
        key = self.state_key(state["roomId"])
        if active:
            state.pop("lastEmptyAt", None)
        payload = json.dumps(state, ensure_ascii=False, separators=(",", ":"))
        if active:
            await self.client.set(key, payload)
            await self.client.persist(key)
            return
        await self.client.set(key, payload, ex=ROOM_EMPTY_TTL_SECONDS)

    async def attach_connection(self, room_id: str, connection_id: str) -> None:
        await self.prune_connections(room_id)
        await self.client.zadd(self.connections_key(room_id), {connection_id: time.time()})
        await self.client.persist(self.state_key(room_id))

    async def touch_connection(self, room_id: str, connection_id: str) -> None:
        await self.client.zadd(self.connections_key(room_id), {connection_id: time.time()})

    async def detach_connection(self, room_id: str, connection_id: str) -> int:
        await self.client.zrem(self.connections_key(room_id), connection_id)
        await self.prune_connections(room_id)
        return int(await self.client.zcard(self.connections_key(room_id)))

    async def prune_connections(self, room_id: str) -> None:
        stale_before = time.time() - ROOM_CONNECTION_STALE_SECONDS
        await self.client.zremrangebyscore(self.connections_key(room_id), 0, stale_before)

    async def publish(self, room_id: str, message: dict[str, Any]) -> None:
        await self.client.publish(
            self.events_channel(room_id),
            json.dumps(message, ensure_ascii=False, separators=(",", ":")),
        )

    async def update_cart(
        self,
        room_id: str,
        member_id: str,
        item_id: str,
        delta: int,
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        key = self.state_key(room_id)

        for _ in range(5):
            async with self.client.pipeline() as pipe:
                try:
                    await pipe.watch(key)
                    raw_state = await pipe.get(key)
                    if not raw_state:
                        raise RoomError("ROOM_EXPIRED", "Room has expired or does not exist")

                    state = json.loads(raw_state)
                    update_message = mutate_cart(state, member_id, item_id, delta)
                    pipe.multi()
                    pipe.set(key, json.dumps(state, ensure_ascii=False, separators=(",", ":")))
                    pipe.persist(key)
                    await pipe.execute()
                    return state, update_message
                except WatchError:
                    continue

        raise RoomError("ROOM_CONFLICT", "Room update conflict, please retry")

    async def update_member_profile(
        self,
        room_id: str,
        member_id: str,
        profile: Any,
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        key = self.state_key(room_id)

        for _ in range(5):
            async with self.client.pipeline() as pipe:
                try:
                    await pipe.watch(key)
                    raw_state = await pipe.get(key)
                    if not raw_state:
                        raise RoomError("ROOM_EXPIRED", "Room has expired or does not exist")

                    state = json.loads(raw_state)
                    member = state.get("members", {}).get(member_id)
                    if not member:
                        raise RoomError("UNKNOWN_MEMBER", "Unknown room member")

                    updated_member = {
                        **member,
                        **normalize_profile(profile, member_id),
                        "updatedAt": iso_now(),
                    }
                    state["members"][member_id] = updated_member
                    state["attributions"] = {
                        item_id: attribution_from_member(updated_member)
                        if isinstance(attribution, dict) and attribution.get("memberId") == member_id
                        else attribution
                        for item_id, attribution in dict(state.get("attributions") or {}).items()
                    }
                    state["version"] = int(state.get("version") or 0) + 1
                    state["updatedAt"] = updated_member["updatedAt"]

                    pipe.multi()
                    pipe.set(key, json.dumps(state, ensure_ascii=False, separators=(",", ":")))
                    pipe.persist(key)
                    await pipe.execute()
                    return state, {
                        "type": "room_snapshot",
                        "state": to_snapshot(state),
                    }
                except WatchError:
                    continue

        raise RoomError("ROOM_CONFLICT", "Room update conflict, please retry")


class RoomHub:
    def __init__(self, store: RedisRoomStore) -> None:
        self.store = store
        self.local_connections: dict[str, dict[str, RoomConnection]] = {}
        self.subscribers: dict[str, asyncio.Task[None]] = {}

    async def close(self) -> None:
        for task in self.subscribers.values():
            task.cancel()
        if self.subscribers:
            await asyncio.gather(*self.subscribers.values(), return_exceptions=True)
        await self.store.close()

    async def handle_socket(self, websocket: WebSocket) -> None:
        await websocket.accept()
        connection: RoomConnection | None = None

        try:
            payload = await websocket.receive_json()
            message_type = payload.get("type")

            if message_type == "create_room":
                connection = await self.create_room(websocket, payload)
            elif message_type == "join_room":
                connection = await self.join_room(websocket, payload)
            else:
                await send_error(websocket, payload, "UNEXPECTED_MESSAGE", "First message must create or join a room")
                await websocket.close(code=1008)
                return

            await self.listen(connection)
        except WebSocketDisconnect:
            pass
        except RoomError as error:
            await send_error(websocket, {}, error.code, error.message)
            await websocket.close(code=1008)
        except Exception as error:
            await send_error(websocket, {}, "ROOM_ERROR", str(error) or "Room operation failed")
            await websocket.close(code=1011)
        finally:
            if connection:
                await self.detach(connection)

    async def create_room(self, websocket: WebSocket, payload: dict[str, Any]) -> RoomConnection:
        openid = await resolve_wechat_openid(str(payload.get("wechatCode") or ""))
        room_id = new_room_id()
        now = iso_now()
        menu = normalize_menu(payload.get("menu"))
        member = build_member(openid, payload.get("member"), now)
        cart = normalize_initial_cart(menu, payload.get("cart"))
        attributions = {
            item_id: attribution_from_member(member)
            for item_id in cart
        }
        state = {
            "roomId": room_id,
            "version": 1,
            "menu": menu,
            "cart": cart,
            "attributions": attributions,
            "members": {member["memberId"]: member},
            "memberOpenids": {member["memberId"]: openid},
            "openidMembers": {openid: member["memberId"]},
            "createdAt": now,
            "updatedAt": now,
        }

        await self.store.save_state(state, active=True)
        connection = await self.attach(websocket, room_id, member["memberId"])
        await send_json(websocket, {
            "type": "room_created",
            "requestId": payload.get("requestId"),
            "roomId": room_id,
            "memberId": member["memberId"],
            "state": to_snapshot(state),
        })
        return connection

    async def join_room(self, websocket: WebSocket, payload: dict[str, Any]) -> RoomConnection:
        room_id = str(payload.get("roomId") or "")
        if not room_id:
            raise RoomError("INVALID_ARGUMENT", "roomId is required")

        state = await self.store.get_state(room_id)
        if not state:
            raise RoomError("ROOM_EXPIRED", "Room has expired or does not exist")

        openid = await resolve_wechat_openid(str(payload.get("wechatCode") or ""))
        now = iso_now()
        member, updated_state, is_new_member = upsert_member(state, openid, payload.get("member"), now)
        await self.store.save_state(updated_state, active=True)
        connection = await self.attach(websocket, room_id, member["memberId"])
        await send_json(websocket, {
            "type": "room_joined",
            "requestId": payload.get("requestId"),
            "roomId": room_id,
            "memberId": member["memberId"],
            "state": to_snapshot(updated_state),
        })

        if is_new_member:
            await self.store.publish(room_id, {
                "type": "member_joined",
                "roomId": room_id,
                "version": updated_state["version"],
                "member": member,
            })

        return connection

    async def listen(self, connection: RoomConnection) -> None:
        while True:
            payload = await connection.websocket.receive_json()
            message_type = payload.get("type")

            if message_type == "heartbeat":
                await self.store.touch_connection(connection.room_id, connection.connection_id)
                await send_json(connection.websocket, {
                    "type": "pong",
                    "requestId": payload.get("requestId"),
                })
                continue

            if message_type == "adjust_item_quantity":
                delta = int(payload.get("delta") or 0)
                if delta == 0:
                    continue
                _, update_message = await self.store.update_cart(
                    connection.room_id,
                    connection.member_id,
                    str(payload.get("itemId") or ""),
                    delta,
                )
                update_message["requestId"] = payload.get("requestId")
                await self.store.publish(connection.room_id, update_message)
                continue

            if message_type == "update_member_profile":
                _, update_message = await self.store.update_member_profile(
                    connection.room_id,
                    connection.member_id,
                    payload.get("member"),
                )
                update_message["requestId"] = payload.get("requestId")
                await self.store.publish(connection.room_id, update_message)
                continue

            await send_error(
                connection.websocket,
                payload,
                "UNEXPECTED_MESSAGE",
                "Unexpected room message",
            )

    async def attach(self, websocket: WebSocket, room_id: str, member_id: str) -> RoomConnection:
        connection = RoomConnection(
            websocket=websocket,
            room_id=room_id,
            member_id=member_id,
            connection_id=f"conn_{uuid.uuid4().hex}",
        )
        self.local_connections.setdefault(room_id, {})[connection.connection_id] = connection
        await self.store.attach_connection(room_id, connection.connection_id)

        if room_id not in self.subscribers:
            self.subscribers[room_id] = asyncio.create_task(self.subscribe_room(room_id))

        return connection

    async def detach(self, connection: RoomConnection) -> None:
        room_connections = self.local_connections.get(connection.room_id)
        if room_connections:
            room_connections.pop(connection.connection_id, None)
            if not room_connections:
                self.local_connections.pop(connection.room_id, None)
                subscriber = self.subscribers.pop(connection.room_id, None)
                if subscriber:
                    subscriber.cancel()

        remaining_connections = await self.store.detach_connection(connection.room_id, connection.connection_id)
        if remaining_connections == 0:
            state = await self.store.get_state(connection.room_id)
            if state:
                state["lastEmptyAt"] = iso_now()
                await self.store.save_state(state, active=False)

    async def subscribe_room(self, room_id: str) -> None:
        pubsub = self.store.client.pubsub()
        await pubsub.subscribe(self.store.events_channel(room_id))

        try:
            async for event in pubsub.listen():
                if event.get("type") != "message":
                    continue

                try:
                    message = json.loads(event.get("data") or "{}")
                except json.JSONDecodeError:
                    continue

                await self.broadcast_local(room_id, message)
        except asyncio.CancelledError:
            pass
        finally:
            await pubsub.unsubscribe(self.store.events_channel(room_id))
            await pubsub.close()

    async def broadcast_local(self, room_id: str, message: dict[str, Any]) -> None:
        stale_connections: list[RoomConnection] = []

        for connection in list(self.local_connections.get(room_id, {}).values()):
            try:
                await send_json(connection.websocket, message)
            except Exception:
                stale_connections.append(connection)

        for connection in stale_connections:
            await self.detach(connection)


async def send_json(websocket: WebSocket, payload: dict[str, Any]) -> None:
    await websocket.send_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))


async def send_error(websocket: WebSocket, payload: dict[str, Any], code: str, message: str) -> None:
    await send_json(websocket, {
        "type": "room_error",
        "requestId": payload.get("requestId") if isinstance(payload, dict) else None,
        "code": code,
        "message": message,
    })


async def resolve_wechat_openid(code: str) -> str:
    if not code:
        raise RoomError("INVALID_ARGUMENT", "wechatCode is required")

    app_id = os.getenv("WECHAT_APP_ID", "")
    app_secret = os.getenv("WECHAT_APP_SECRET", "")
    if not app_id or not app_secret:
        raise RoomError("WECHAT_AUTH_FAILED", "WeChat credentials are not configured")

    query = urllib.parse.urlencode({
        "appid": app_id,
        "secret": app_secret,
        "js_code": code,
        "grant_type": "authorization_code",
    })
    url = f"https://api.weixin.qq.com/sns/jscode2session?{query}"

    def request_openid() -> str:
        with urllib.request.urlopen(url, timeout=8) as response:
            data = json.loads(response.read().decode("utf-8"))
        if data.get("errcode") or not data.get("openid"):
            raise RoomError("WECHAT_AUTH_FAILED", data.get("errmsg") or "WeChat code2Session failed")
        return str(data["openid"])

    return await asyncio.to_thread(request_openid)


def mutate_cart(state: dict[str, Any], member_id: str, item_id: str, delta: int) -> dict[str, Any]:
    if not item_id:
        raise RoomError("INVALID_ARGUMENT", "itemId is required")

    member = state.get("members", {}).get(member_id)
    if not member:
        raise RoomError("UNKNOWN_MEMBER", "Unknown room member")

    item_exists = any(item.get("id") == item_id for item in state.get("menu", {}).get("items", []))
    if not item_exists:
        raise RoomError("UNKNOWN_ITEM", "Unknown menu item")

    cart = dict(state.get("cart") or {})
    attributions = dict(state.get("attributions") or {})
    previous_quantity = int(cart.get(item_id) or 0)
    next_quantity = max(0, previous_quantity + delta)

    if next_quantity == 0:
        cart.pop(item_id, None)
        attributions.pop(item_id, None)
    else:
        cart[item_id] = next_quantity
        if previous_quantity == 0:
            attributions[item_id] = attribution_from_member(member)

    state["cart"] = cart
    state["attributions"] = attributions
    state["version"] = int(state.get("version") or 0) + 1
    state["updatedAt"] = iso_now()

    return {
        "type": "cart_updated",
        "roomId": state["roomId"],
        "version": state["version"],
        "cart": cart,
        "attributions": attributions,
        "changedItemId": item_id,
        "actorMemberId": member_id,
    }


def normalize_menu(menu: Any) -> dict[str, Any]:
    if not isinstance(menu, dict) or not isinstance(menu.get("items"), list) or not menu["items"]:
        raise RoomError("INVALID_ARGUMENT", "Menu payload is required")

    return {
        "menuLanguage": str(menu.get("menuLanguage") or ""),
        "currency": str(menu.get("currency") or ""),
        "items": [
            {
                "id": str(item.get("id") or ""),
                "translatedCategory": str(item.get("translatedCategory") or ""),
                "originalName": str(item.get("originalName") or ""),
                "translatedName": str(item.get("translatedName") or ""),
                "descriptionOriginal": str(item.get("descriptionOriginal") or ""),
                "descriptionTranslated": str(item.get("descriptionTranslated") or ""),
                "priceText": str(item.get("priceText") or ""),
                "priceValue": float(item.get("priceValue") or 0),
                "initialQuantity": max(0, int(item.get("initialQuantity") or 0)),
            }
            for item in menu["items"]
            if isinstance(item, dict) and item.get("id")
        ],
    }


def normalize_initial_cart(menu: dict[str, Any], cart: Any) -> dict[str, int]:
    source = cart if isinstance(cart, dict) else {}
    result: dict[str, int] = {}

    for item in menu["items"]:
        quantity = max(0, int(source.get(item["id"], item.get("initialQuantity") or 0) or 0))
        if quantity > 0:
            result[item["id"]] = quantity

    return result


def upsert_member(
    state: dict[str, Any],
    openid: str,
    profile: Any,
    now: str,
) -> tuple[dict[str, Any], dict[str, Any], bool]:
    existing_member_id = state.get("openidMembers", {}).get(openid)
    if existing_member_id and existing_member_id in state.get("members", {}):
        member = {
            **state["members"][existing_member_id],
            **normalize_profile(profile, existing_member_id),
            "updatedAt": now,
        }
        state["members"][existing_member_id] = member
        state["updatedAt"] = now
        return member, state, False

    member = build_member(openid, profile, now)
    state.setdefault("members", {})[member["memberId"]] = member
    state.setdefault("memberOpenids", {})[member["memberId"]] = openid
    state.setdefault("openidMembers", {})[openid] = member["memberId"]
    state["version"] = int(state.get("version") or 0) + 1
    state["updatedAt"] = now
    return member, state, True


def build_member(openid: str, profile: Any, now: str) -> dict[str, Any]:
    del openid
    member_id = f"member_{uuid.uuid4().hex[:16]}"
    return {
        "memberId": member_id,
        **normalize_profile(profile, member_id),
        "joinedAt": now,
        "updatedAt": now,
    }


def normalize_profile(profile: Any, member_id: str) -> dict[str, str]:
    data = profile if isinstance(profile, dict) else {}
    fallback_index = abs(hash_number(member_id)) % len(DEFAULT_AVATAR_COLORS)
    return {
        "nickName": str(data.get("nickName") or "微信用户")[:40],
        "avatarUrl": str(data.get("avatarUrl") or ""),
        "avatarColor": str(data.get("avatarColor") or DEFAULT_AVATAR_COLORS[fallback_index]),
    }


def attribution_from_member(member: dict[str, Any]) -> dict[str, str]:
    return {
        "memberId": str(member["memberId"]),
        "avatarUrl": str(member.get("avatarUrl") or ""),
        "avatarColor": str(member.get("avatarColor") or DEFAULT_AVATAR_COLORS[0]),
    }


def to_snapshot(state: dict[str, Any]) -> dict[str, Any]:
    snapshot = {
        "roomId": state["roomId"],
        "version": state["version"],
        "menu": state["menu"],
        "cart": state["cart"],
        "attributions": state["attributions"],
        "members": state["members"],
        "createdAt": state["createdAt"],
        "updatedAt": state["updatedAt"],
    }
    if state.get("lastEmptyAt"):
        snapshot["expiresAt"] = iso_from_epoch(epoch_from_iso(state["lastEmptyAt"]) + ROOM_EMPTY_TTL_SECONDS)
    return snapshot


def new_room_id() -> str:
    return f"room_{uuid.uuid4().hex}"


def iso_now() -> str:
    return iso_from_epoch(time.time())


def iso_from_epoch(value: float) -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(value))


def epoch_from_iso(value: str) -> float:
    try:
        return calendar.timegm(time.strptime(value, "%Y-%m-%dT%H:%M:%SZ"))
    except ValueError:
        return time.time()


def hash_text(value: str) -> str:
    current = 2166136261
    for char in value:
        current ^= ord(char)
        current = (current * 16777619) & 0xFFFFFFFF
    return f"{current:08x}"


def hash_number(value: str) -> int:
    return int(hash_text(value), 16)
