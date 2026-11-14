# Деплой Martian Map на Railway — только веб-интерфейс, без CLI

Весь деплой выполняется мышкой в кабинете Railway. Командная строка не нужна:
сборку делают Dockerfile'ы, а контейнер backend при каждом старте сам запускает
проверку окружения, миграции Alembic (включая установку PostGIS и марсианского
SRID) и сиды данных (`backend/start.sh`). Настройки сборки и healthcheck'и уже
зашиты в `backend/railway.json` и `frontend/railway.json`.

Создаются три сервиса, порядок: **postgis → api → web**.

## 1. Сервис `postgis` — база данных

Стандартный Postgres Railway не подходит: миграциям нужно расширение PostGIS.

1. **+ New → Docker Image** → образ `postgis/postgis:16-3.4` (тот же, что в CI).
2. В Settings переименуйте сервис в `postgis` — на имя ссылаются переменные ниже.
3. Вкладка **Variables**:

   | Переменная | Значение |
   |---|---|
   | `POSTGRES_USER` | `martian` |
   | `POSTGRES_PASSWORD` | нажмите «Generate» — Railway создаст случайный |
   | `POSTGRES_DB` | `martian_map` |
   | `PGDATA` | `/var/lib/postgresql/data/pgdata` |

4. Правый клик по сервису → **Attach Volume**, mount path `/var/lib/postgresql/data`
   (без volume база сотрётся при редеплое).

## 2. Сервис `api` — backend

1. **+ New → GitHub Repo** → `Goslinuly/nasa-hackathon`.
2. В Settings: **Root Directory** = `backend`, имя сервиса — `api`.
   Railway дальше сам найдёт `backend/railway.json` и Dockerfile.
3. Вкладка **Variables** (значения копируются как есть):

   | Переменная | Значение |
   |---|---|
   | `DATABASE_URL` | `postgresql://martian:${{postgis.POSTGRES_PASSWORD}}@${{postgis.RAILWAY_PRIVATE_DOMAIN}}:5432/martian_map` |
   | `PORT` | `8000` |
   | `MARTIAN_ENV` | `prod` |

   `PORT=8000` обязателен: по приватной сети frontend ходит именно на этот порт.
4. Публичный домен сервису `api` **не нужен**. Healthcheck `/api/v1/health`
   уже задан в `railway.json`.
5. Успешный деплой в логах выглядит так: `check_env` → `alembic upgrade head` →
   `seed_registry` → `seed_research` → старт gunicorn.

Redis, MinIO и Celery-worker в текущей версии не деплоятся — переменные для них
задавать не нужно.

## 3. Сервис `web` — frontend

1. **+ New → GitHub Repo** → тот же репозиторий.
2. В Settings: **Root Directory** = `frontend`, имя сервиса — `web`.
3. Вкладка **Variables**:

   | Переменная | Значение |
   |---|---|
   | `API_HOST` | `${{api.RAILWAY_PRIVATE_DOMAIN}}:8000` |

   Формат — `хост:порт` без `http://`; скрипт в контейнере уберёт схему и
   допишет порт сам, но лучше сразу правильно.
4. **Settings → Networking → Generate Domain** — это публичный адрес всего
   приложения; nginx внутри проксирует `/api/` на backend, `/trek/` и `/ctx/`
   на источники тайлов NASA с кэшем.

## Проверка после деплоя

- `https://<домен web>/api/v1/health` — отвечает JSON через прокси;
- главная страница — глобус с рельефом MOLA и тайлами Mars Trek;
- страница атласа и планировщик маршрутов открываются по ссылкам в шапке.

## Если что-то не поднялось

| Симптом | Причина и действие |
|---|---|
| `api` падает на старте с сообщением про `DATABASE_URL` | Ссылка `${{…}}` не подставилась: имя сервиса базы не `postgis` — поправьте ссылку под реальное имя. Текст ошибки печатает сам backend. |
| `/api/…` отвечает 503 `api_unreachable` | У `web` не задан `API_HOST`, либо `api` слушает не 8000 (проверьте `PORT`). |
| База пустая после редеплоя | Не подключён volume к сервису `postgis`. |
| Нет детальных снимков CTX/HiRISE на глобусе | Внешние источники временно не отвечают — это не ошибка деплоя, глобус переключается на обзорный слой. |
