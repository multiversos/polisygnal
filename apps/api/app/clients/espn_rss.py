from __future__ import annotations

from collections.abc import Generator
from dataclasses import dataclass
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from xml.etree import ElementTree

import httpx

from app.core.config import Settings, get_settings


class EspnRssClientError(Exception):
    """Raised when the ESPN RSS client cannot complete a request."""


@dataclass(slots=True)
class EspnNewsItem:
    title: str
    description: str | None
    url: str
    published_at: datetime | None
    raw_text: str
    raw_json: dict[str, object]


class EspnRssClient:
    def __init__(
        self,
        *,
        feed_url: str,
        timeout_seconds: float,
        user_agent: str,
    ) -> None:
        self._feed_url = feed_url
        self._client = httpx.Client(
            timeout=timeout_seconds,
            headers={
                "Accept": "application/rss+xml, application/xml, text/xml",
                "User-Agent": user_agent,
            },
        )

    @classmethod
    def from_settings(cls, settings: Settings) -> EspnRssClient:
        return cls(
            feed_url=settings.espn_nba_rss_url,
            timeout_seconds=settings.espn_rss_timeout_seconds,
            user_agent=settings.polymarket_user_agent,
        )

    def close(self) -> None:
        self._client.close()

    def fetch_nba_news(self) -> list[EspnNewsItem]:
        try:
            response = self._client.get(self._feed_url)
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            message = exc.response.text[:300]
            raise EspnRssClientError(
                f"ESPN RSS respondio con {exc.response.status_code}: {message}"
            ) from exc
        except httpx.RequestError as exc:
            raise EspnRssClientError(f"No se pudo conectar con ESPN RSS: {exc}") from exc

        try:
            root = ElementTree.fromstring(response.text)
        except ElementTree.ParseError as exc:
            raise EspnRssClientError("No se pudo parsear el feed RSS de ESPN.") from exc

        items: list[EspnNewsItem] = []
        for item in root.findall("./channel/item"):
            title = _get_child_text(item, "title")
            description = _get_child_text(item, "description")
            url = _get_child_text(item, "link")
            if not title or not url:
                continue

            raw_text = "\n".join(part for part in [title, description] if part)
            published_at = _parse_rss_datetime(_get_child_text(item, "pubDate"))
            raw_json = {
                "title": title,
                "description": description,
                "url": url,
                "published_at": published_at.isoformat() if published_at else None,
            }
            items.append(
                EspnNewsItem(
                    title=title,
                    description=description,
                    url=url,
                    published_at=published_at,
                    raw_text=raw_text,
                    raw_json=raw_json,
                )
            )

        return items


def get_espn_rss_client() -> Generator[EspnRssClient, None, None]:
    settings = get_settings()
    client = EspnRssClient.from_settings(settings)
    try:
        yield client
    finally:
        client.close()


def _get_child_text(node: ElementTree.Element, tag_name: str) -> str | None:
    child = node.find(tag_name)
    if child is None or child.text is None:
        return None
    stripped = child.text.strip()
    return stripped or None


def _parse_rss_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = parsedate_to_datetime(value)
    except (TypeError, ValueError):
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed
