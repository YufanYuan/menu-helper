from __future__ import annotations

import os
from contextlib import asynccontextmanager
from typing import Any

import uvicorn
from fastapi import FastAPI, WebSocket
from pydantic import BaseModel

from menu_helper_cn_backend import __version__
from menu_helper_cn_backend.rooms import RedisRoomStore, RoomHub


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str


class ConfigResponse(BaseModel):
    code: int
    message: str
    data: dict[str, Any]


@asynccontextmanager
async def lifespan(app: FastAPI):
    redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    app.state.room_hub = RoomHub(RedisRoomStore(redis_url))
    try:
        yield
    finally:
        await app.state.room_hub.close()


app = FastAPI(
    title="Menu Helper CN Backend",
    version=__version__,
    lifespan=lifespan,
)


@app.get("/healthz", response_model=HealthResponse)
async def healthz() -> HealthResponse:
    return HealthResponse(
        status="ok",
        service="menu-helper-cn-backend",
        version=__version__,
    )


@app.get("/api/config", response_model=ConfigResponse)
async def get_config() -> ConfigResponse:
    room_socket_url = os.getenv("ROOMS_SOCKET_URL", "")
    return ConfigResponse(
        code=0,
        message="ok",
        data={
            "useMockLLM": False,
            "requestTimeout": 120000,
            "cloudflare": {
                "forced": False,
                "apiUrl": "",
                "models": [],
                "thinking": "disabled",
            },
            "volcengine": {
                "forced": False,
                "baseUrl": "",
                "model": "",
                "apiKey": "",
                "thinking": "disabled",
            },
            "features": {
                "menuUploadMaxCount": 1,
            },
            "rooms": {
                "socketUrl": room_socket_url,
                "cnSocketUrl": os.getenv("ROOMS_CN_SOCKET_URL", room_socket_url),
                "cloudflareSocketUrl": os.getenv("ROOMS_CLOUDFLARE_SOCKET_URL", ""),
            },
        },
    )


@app.websocket("/ws/rooms")
async def rooms(websocket: WebSocket) -> None:
    await app.state.room_hub.handle_socket(websocket)


def run() -> None:
    uvicorn.run(
        "menu_helper_cn_backend.main:app",
        host="0.0.0.0",
        port=8000,
    )
