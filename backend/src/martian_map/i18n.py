"""Язык ответа API: русский по умолчанию, английский по запросу.

Язык выбирается один раз на запрос (middleware в api/main.py):
параметр ?lang=ru|en, иначе заголовок Accept-Language, иначе русский.

Тексты пишутся парой рядом с кодом: Text("Мощность", "Power"). Text — это str с русским
значением, поэтому кэши, сравнения и старые тесты видят русский текст; английский
подставляется при сериализации ответа (localize). Где текст собирается во время запроса
и уходит через Pydantic-модель, берётся сразу нужный вариант: t("…", "…").
"""

from contextvars import ContextVar
from typing import Any, Literal

Lang = Literal["ru", "en"]
LANGS: tuple[Lang, ...] = ("ru", "en")
DEFAULT_LANG: Lang = "ru"

_current: ContextVar[Lang] = ContextVar("martian_map_lang", default=DEFAULT_LANG)


class Text(str):
    """Строка с русским значением и английским вариантом в .en."""

    en: str

    def __new__(cls, ru: str, en: str) -> "Text":
        obj = super().__new__(cls, ru)
        obj.en = en
        return obj

    def __getnewargs__(self) -> tuple[str, str]:  # type: ignore[override]
        return (str.__str__(self), self.en)

    def pick(self, lang: Lang | None = None) -> str:
        return self.en if (lang or _current.get()) == "en" else str.__str__(self)


def get_lang() -> Lang:
    return _current.get()


def set_lang(lang: Lang):
    return _current.set(lang)


def reset_lang(token) -> None:
    _current.reset(token)


def t(ru: str, en: str) -> str:
    """Перевод сразу, по языку текущего запроса."""
    return en if _current.get() == "en" else ru


def localize(value: Any, lang: Lang | None = None) -> Any:
    """Заменить все Text в ответе на текст нужного языка (вложенные dict/list/tuple)."""
    lang = lang or _current.get()
    if isinstance(value, Text):
        return value.pick(lang)
    if isinstance(value, dict):
        return {key: localize(item, lang) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [localize(item, lang) for item in value]
    return value


def _normalize(tag: str) -> Lang | None:
    primary = tag.strip().lower().replace("_", "-").split("-", 1)[0]
    return primary if primary in LANGS else None  # type: ignore[return-value]


def parse_accept_language(header: str | None) -> Lang | None:
    """Самый предпочтительный из ru/en по q-весам; None, если ни один не назван."""
    best: tuple[float, int, Lang] | None = None
    for index, part in enumerate((header or "").split(",")):
        tag, _, params = part.partition(";")
        lang = _normalize(tag)
        if lang is None:
            continue
        weight = 1.0
        for param in params.split(";"):
            key, _, raw = param.strip().partition("=")
            if key == "q":
                try:
                    weight = float(raw)
                except ValueError:
                    weight = 0.0
        if weight <= 0:
            continue
        candidate = (weight, -index, lang)
        if best is None or candidate[:2] > best[:2]:
            best = candidate
    return best[2] if best else None


def negotiate(query_lang: str | None, accept_language: str | None) -> Lang:
    """?lang= важнее заголовка; непонятное значение параметра игнорируется."""
    if query_lang and (lang := _normalize(query_lang)):
        return lang
    return parse_accept_language(accept_language) or DEFAULT_LANG
