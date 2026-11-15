"""Выбор языка ответа на каждый запрос и JSON-ответ, подставляющий перевод.

Язык: ?lang=ru|en, иначе Accept-Language, иначе русский. Ответ помечается
Content-Language и Vary: Accept-Language, чтобы кэш не отдал чужой язык.
"""

import functools
import inspect
from collections.abc import Callable
from typing import Any
from urllib.parse import parse_qs

from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute
from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from martian_map.i18n import localize, negotiate, reset_lang, set_lang


def request_lang(scope: Scope) -> str:
    query = parse_qs(scope.get("query_string", b"").decode("latin-1"))
    header = None
    for name, value in scope.get("headers") or []:
        if name == b"accept-language":
            header = value.decode("latin-1")
            break
    return negotiate((query.get("lang") or [None])[0], header)


class LanguageMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        lang = request_lang(scope)
        token = set_lang(lang)

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                headers["Content-Language"] = lang
                headers.add_vary_header("Accept-Language")
            await send(message)

        try:
            await self.app(scope, receive, send_with_headers)
        finally:
            reset_lang(token)


class LocalizedJSONResponse(JSONResponse):
    """JSON, в котором парные тексты (Text) заменены на язык текущего запроса."""

    def render(self, content: Any) -> bytes:
        return super().render(localize(content))


def _localized(endpoint: Callable[..., Any]) -> Callable[..., Any]:
    if inspect.iscoroutinefunction(endpoint):

        @functools.wraps(endpoint)
        async def run_async(*args: Any, **kwargs: Any) -> Any:
            return localize(await endpoint(*args, **kwargs))

        return run_async

    @functools.wraps(endpoint)
    def run_sync(*args: Any, **kwargs: Any) -> Any:
        return localize(endpoint(*args, **kwargs))

    return run_sync


class LocalizedRoute(APIRoute):
    """Роут, чей ответ переводится до проверки моделью ответа: она превращает Text в str."""

    def __init__(self, path: str, endpoint: Callable[..., Any], **kwargs: Any) -> None:
        super().__init__(path, _localized(endpoint), **kwargs)
