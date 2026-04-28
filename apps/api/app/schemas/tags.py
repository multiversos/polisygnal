from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

MarketTagType = Literal["manual", "system"]


class MarketTagCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    slug: str | None = Field(default=None, max_length=140)
    color: str | None = Field(default=None, max_length=32)
    tag_type: MarketTagType = "manual"


class MarketTagRead(BaseModel):
    id: int | None = None
    name: str
    slug: str
    color: str | None = None
    tag_type: MarketTagType
    created_at: datetime | None = None


class MarketTagLinkCreate(BaseModel):
    tag_id: int | None = None
    name: str | None = Field(default=None, max_length=120)
    slug: str | None = Field(default=None, max_length=140)
    color: str | None = Field(default=None, max_length=32)
    tag_type: MarketTagType = "manual"


class MarketTagsRead(BaseModel):
    market_id: int
    tags: list[MarketTagRead] = Field(default_factory=list)
    suggested_tags: list[MarketTagRead] = Field(default_factory=list)
