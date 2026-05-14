from __future__ import annotations

from typing import Any

import uvicorn
from fastapi import FastAPI
from pydantic import BaseModel

from menu_helper_cn_backend import __version__


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str


class ConfigResponse(BaseModel):
    code: int
    message: str
    data: dict[str, Any]


app = FastAPI(
    title="Menu Helper CN Backend",
    version=__version__,
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
        },
    )


def run() -> None:
    uvicorn.run(
        "menu_helper_cn_backend.main:app",
        host="0.0.0.0",
        port=8000,
    )
