# Martian Map — backend

Модульный монолит FastAPI + worker, PostgreSQL/PostGIS, Redis, S3-совместимое
хранилище. Границы модулей и правила — в [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md).

## Быстрый старт (локально)

```bash
# 1. Инфраструктура (PostGIS, Redis, MinIO) из корня репозитория
docker compose -f infra/docker-compose.yml up -d db redis minio

# 2. Зависимости
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows; на Unix: source .venv/bin/activate
pip install -e ".[dev]"
copy .env.example .env           # Windows; на Unix: cp

# 3. Миграции и загрузка реестра продуктов
alembic upgrade head
python scripts/seed_registry.py

# 4. API (8001: порт 8000 на машинах команды бывает занят другими сервисами)
uvicorn martian_map.api.main:app --reload --port 8001
```

OpenAPI: http://localhost:8001/api/v1/docs

Worker (фоновые задания): `celery -A martian_map.worker.celery_app worker --loglevel=info`

## Тесты

```bash
pytest
```

Тесты координат и реестра не требуют БД. Интеграционные тесты (SRID, покрытие,
идемпотентный импорт) добавляются по чек-листу ARCHITECTURE §9.

## Структура

```
src/martian_map/
  api/             # FastAPI: роутеры, ошибки, OpenAPI
  modules/         # catalog, coordinates, coverage, science, panoramas,
                   # routing, publication (+ terrain, plans — по мере реализации)
  infrastructure/  # БД, объектное хранилище, очередь
  worker/          # Celery-задания импорта и расчётов
alembic/           # миграции (0001 создаёт PostGIS, Mars SRID и схему)
data/              # product_registry.json — реестр кандидатных продуктов
scripts/           # seed_registry.py
tests/
```

## Координатное соглашение

Везде в API и БД: `body="Mars"`, planetocentric latitude, восточная долгота
`[0, 360)`. Внутренний SRID каталога — `949900` (регистрируется миграцией).
Метрические расчёты — только в локальной проекции района; земные
EPSG:4326/3857 и `geography` запрещены (ТЗ §7).

## Статусы продуктов

`candidate → metadata_verified → downloaded → geometry_verified → processed →
science_verified → published`. Реестр из DOCX загружается как
`metadata_verified`: это кандидатное покрытие, а не доступные данные.
Уровень данных в ответах API определяется только `published`-продуктами.

## Импорт и анализ файлов команды

В `data/science/` включён небольшой нормализованный набор RAD (87 наблюдений,
sol 3290) и журнал пяти файлов команды. Он доступен без БД через
`GET /api/v1/science/rad` и `GET /api/v1/science/intake`.
Это экспериментальный файловый адаптер модуля science; набор не публикуется
как покрытие точки. Для установленного wheel задайте `MARTIAN_SCIENCE_DATA_DIR`
абсолютным путём к каталогу; Docker уже использует `/app/data/science`.

Повторный импорт из оригиналов (из каталога backend, после установки пакета):

```powershell
python scripts/import_weekly_science.py 'C:/path/RAD.xlsx' 'C:/path/MOLA.crtx' 'C:/path/reference.docx'
```

Скрипт принимает ровно один XLSX с листом `RAD` и точными заголовками A:G из
переданного файла. `--output` задаёт каталог результата. Все входы проверяются
до записи. Повтор одного набора создаёт идентичный JSON. Оригиналы не изменяются;
для каждого файла сохраняются имя, размер и SHA-256. Формулы не исполняются,
внешние ссылки не открываются. XLSX с формулами вместо исходных измерений,
неверными единицами, дубликатами или пересечениями наблюдений отклоняется.

Параметры анализа: `start`, `end` — ISO 8601 с явной временной зоной,
`include_flagged=false` по умолчанию. Например:

```text
/api/v1/science/rad?start=2021-11-07T12:00:00Z&end=2021-11-07T18:00:00Z
```

Доза B/E рассчитывается отдельно как `rate_microgy_h * duration_s / 3600`.
Частичные интервалы обрезаются по запросу с допущением постоянной средней
скорости внутри наблюдения. Средняя скорость взвешивается по учтённой
длительности. Интервалы полуоткрытые `[start,end)`. Пропуски и исключённые QC
не заполняются. При отсутствии измерений доза и скорости равны `null`, не нулю.

Паспорт импорта, обнаруженные ошибки и недостающие входы описаны в
[data/science/README.md](data/science/README.md). Интерфейс «Анализ RAD» позволяет
выбирать период, переключать QC и просматривать строки, результаты и источник.

## Исследования из БД вдоль пути А → Б

Основной сценарий — «Путь А → Б»: произвольные координаты старта, цели и
промежуточных точек, коридор поиска (по умолчанию 500 м в каждую сторону).
`POST /api/v1/science/research/along-route` принимает `points: MarsPoint[]`,
`corridor_m`, `limit` и возвращает исследования из PostgreSQL в порядке пути,
расстояние от старта и от обзорной линии, источники и подтверждение привязки.
Отбор использует кратчайшие дуги сферы Марса, включая шов долготы и полюса.
Для противоположных точек требуется промежуточная точка. Это обзорная оценка,
не расчёт проходимости, уклонов или локальной тропы.

Чтобы загрузить подготовленный набор в БД:

```powershell
# Из корня проекта
docker compose -f infra/docker-compose.yml up -d db
# Из backend, с установленным пакетом и активной .venv
alembic upgrade head
python scripts/seed_research.py
```

`research_study` получает один набор RAD; `observation` — 174 значения
двух каналов за 87 интервалов; `research_import_file` — журнал пяти файлов.
Повторный запуск не создаёт дубликатов. Импорт атомарен в транзакции.
`GET /api/v1/science/research?offset=0&limit=100` читает каталог из БД.
Файловый `/science/rad` остаётся доступен для независимого пересчёта исходника.

В переданном RAD нет координат. Он сохраняется без местоположения, виден в
каталоге и счётчике «нужны координаты», но не попадает на произвольный маршрут.
Шаблоны диаграмм и посторонний DOCX остаются записями журнала импорта.
Наличие множества значений одного прибора не означает множество мест изучения.

Для пополнения каталога пространственно привязанными исследованиями:

```powershell
python scripts/seed_research.py --catalog path/to/research.json
```

JSON — массив записей с обязательными `external_id`, `title`, `summary`,
`source_url` (HTTP/HTTPS). Необязательные поля: `mission`, `instrument`,
`point` (канонический MarsPoint), `position_evidence` (ссылка/цитата источника
координат), `position_uncertainty_m`, `verification_status`.
Для каждой точки обязательна непустая `position_evidence`. Координаты должны
быть planetocentric, долгота восточная; импорт не угадывает CRS первоисточника.
Статус по умолчанию `team_supplied_unverified`; `source_verified` указывается
после сверки командой. Повторный `external_id` обновляет карточку, в том числе
может добавить подтверждённые координаты существующему RAD. Значения из
источника не переносятся на соседние точки маршрута.

Интеграционная проверка PostgreSQL (с мигрированной тестовой БД):

```powershell
$env:MARTIAN_TEST_DATABASE_URL='postgresql+asyncpg://martian:martian@localhost:5433/martian_map'
pytest tests/test_research_routes.py
```

Тест добавляет синтетическую точку только в транзакции с последующим rollback.
Тестовые исследования не поставляются как данные приложения.

## API и диагностика развёртывания — памятка для backend, 15 октября 2026

### Подтверждённая проблема опубликованного сайта

Проверен `https://lovely-reprieve-production-10b7.up.railway.app`:
`/api/v1/health`, `/api/v1/coverage?lat=18.44&lon=77.45`,
`/api/v1/science/research`, `/api/v1/science/rad` возвращают **503 api_unreachable**.
Этот код формирует **nginx frontend**, а не FastAPI. Он означает сбой проксирования
(адрес/DNS/порт/запуск API), а не отсутствие снимков NASA или пустой каталог.
Точную причину различают по error log nginx и startup log backend; без доступа к
Railway variables и логам нельзя утверждать, что виновата конкретная переменная.
JSON карты высот `/data/globe/mola_megdr_8ppd_height.json` возвращает 200.
Локально `localhost:8001/api/v1/health` и `/science/rad` отвечают 200,
а `/science/research` — 503: это отдельная проблема подключения локальной БД.

### Что исправить в Railway в первую очередь

1. Проверить, что backend действительно развёрнут из `backend/Dockerfile` и работает.
   Docker CMD сначала выполняет `alembic upgrade head` и `seed_registry.py`;
   если БД/PostGIS/миграции недоступны, uvicorn вообще не запускается.
2. Backend: задать `DATABASE_URL` или `MARTIAN_DATABASE_URL` из сервиса PostgreSQL.
   Поддерживаются `postgres://`, `postgresql://`, `postgresql+asyncpg://`.
   Нужен PostgreSQL **с PostGIS**, а не только пустой PostgreSQL.
   Проверить миграцию `0002_research`, успешный seed, отсутствие traceback в логах.
3. Backend слушает `0.0.0.0:${PORT:-8000}`. В frontend задать
   `API_HOST=<реальное приватное DNS-имя backend>:<реальный PORT backend>`.
   Без `http://`, без `/api/v1`, без завершающего `/`. `api:8000` — имя сервиса
   Docker Compose, оно не является автоматически адресом сервиса Railway.
   Не подставлять адрес самого frontend: это создаёт петлю прокси.
4. Перезапустить frontend после смены runtime variables. Проверить сначала
   публичный `/api/v1/health`, затем `/regions`, `/coverage`, `/science/research`.
   Health проверяет лишь процесс FastAPI, не соединение с БД; его 200 недостаточно.
5. Если health работает, а каталог нет — проверять БД и миграции. Если RAD
   даёт `science_data_unavailable` — проверить `MARTIAN_SCIENCE_DATA_DIR` и файлы.
   Не лечить недоступность API сменой картографического сервера.

Локальный полный стек: `docker compose -f infra/docker-compose.yml up --build -d`
из корня репозитория. Frontend `http://localhost:8081`, API `http://localhost:8080`.
Отдельный Vite: `/api` по умолчанию идёт на `localhost:8001`. Если API запущен
через Compose на 8080, перед запуском Vite задать
`$env:VITE_API_PROXY='http://localhost:8080'`.
`VITE_API_BASE` — build-time переменная клиента (обычно `/api/v1`),
`API_HOST` — runtime переменная nginx. Это разные настройки.
При прямом cross-origin API настроить `MARTIAN_CORS_ORIGINS` JSON-массивом
реальных origin; при same-origin proxy браузерный CORS к FastAPI не нужен.
Секреты БД не помещать в VITE-переменные и frontend bundle.

### Наш FastAPI: полный HTTP-контракт

Base URL `/api/v1`. Авторизации сейчас нет. OpenAPI: `/openapi.json`, Swagger: `/docs`
на **backend**, не на frontend: nginx проксирует только `/api/`.

| Метод и путь | Вход | Что возвращает / зависимость |
|---|---|---|
| GET `/health` | нет | `{status:"ok",service:"martian-map-api"}`; без БД |
| GET `/regions` | нет | массив RegionOut: slug, названия, coverage_status, bounds_verified; БД |
| GET `/products` | необязательные `region` (slug), `kind` (dtm/ortho/global_dem/global_mosaic) | массив ProductOut: источник, разрешение, статус проверки; БД |
| GET `/coverage` | обязательные `lat`, `lon` | глобальное покрытие, локальные кандидаты и ограничения; БД |
| GET `/science/intake` | нет | журнал пяти переданных файлов, причины включения/отклонения; файл intake.json |
| GET `/science/rad` | `start`, `end` ISO8601 с UTC/offset, `include_flagged=false` | dataset и analysis: интеграл дозы B/E, QC, длительности и пробелы; файл rad.json |
| GET `/science/research` | `offset=0` >=0, `limit=100` 1…500 | total, measurement_count, studies; БД |
| POST `/science/research/along-route` | JSON ниже | маршрут, исследования в коридоре и расстояния; БД |

Координаты: планетоцентрическая широта −90…90°, восточная долгота
(принимается ±180 или 0…360, нормализуется). Расстояния в API — **метры**.
Интерфейс планировщика принимает коридор в километрах и умножает на 1000.

```json
{
  "points": [
    {"body":"Mars","latitude_deg":18.44,"longitude_deg":77.45},
    {"body":"Mars","latitude_deg":18.445,"longitude_deg":77.455}
  ],
  "corridor_m":500,
  "limit":100
}
```

`points`: 2…50 точек, включая промежуточные; `corridor_m`: >0 и <=50000;
`limit`: 1…500. Для диаметрально противоположных точек нужна промежуточная.
Ответ: `route_length_m`, `corridor_m`, `geometry` (LineString, пары **lon,lat**),
`studies`, `matched_total`, `unlocated_studies`, `truncated`, `explanation`.
Карточка исследования: id, external_id, title, summary, mission, instrument,
source_url, latitude_deg, longitude_deg, position_evidence,
position_uncertainty_m, verification_status; в результате поиска также
`distance_from_start_m` и `distance_from_route_m`.
Это поиск возле сферической линии. Он не рассчитывает безопасную тропу.
POST `/routes`, `/elevation`, `/weather` в backend **не существуют**.
Текущий расчёт пути и профиля высот выполняется браузерным worker по локальной MOLA.

Формат ошибки: `{"error":{"code":"...","message":"..."}}`.
422 validation_error — невалидный запрос; 422 invalid_research_route — геометрия;
422 invalid_analysis_interval — интервал RAD; 503 research_database_unavailable /
database_unavailable — БД; 503 science_data_unavailable — нет файлов;
503 api_unreachable — nginx не достиг FastAPI. Пустой массив studies при HTTP 200
означает отсутствие совпадений в **нашем каталоге**, а не отсутствие науки в районе.

### Карты: публичные внешние сервисы, без API-ключей

Запросы идут через frontend nginx/Vite для same-origin текстур WebGL.
FastAPI сейчас **не обслуживает** пути `/trek`, `/ctx`, `/jmars-ctx`.
Прокси должны сохранять query string и реальный image Content-Type, не возвращать
SPA index.html вместо изображения. Успешный HTTP 200 с XML ServiceException —
ошибка WMS, не валидная картинка. Не кэшировать такие ответы как успешные тайлы.

**NASA Mars Trek**, upstream `https://trek.nasa.gov/tiles`:

```text
Клиент:   /trek/Mars/EQ/{layer}/1.0.0/default/default028mm/{z}/{y}/{x}.{ext}
Upstream: https://trek.nasa.gov/tiles/Mars/EQ/{layer}/1.0.0/default/default028mm/{z}/{y}/{x}.{ext}
```

Сетка равнопромежуточная: 2^(z+1) колонок, 2^z строк, тайл 256×256;
строки от севера, долгота от −180°. Порядок в URL **z/y/x**, не XYZ.
Полный используемый каталог (`frontend/src/features/globe/layers.ts`):

| layer | ext | max z | Назначение |
|---|---|---|---|
| Mars_Viking_MDIM21_ClrMosaic_global_232m | jpg | 7 | цветовая обзорная мозаика, 232 м |
| Mars_MOLA_blend200ppx_HRSC_Shade_clon0dd_200mpp_lzw | jpg | 8 | отмывка HRSC+MOLA, 200 м |
| Mars_MOLA_blend200ppx_HRSC_ClrShade_clon0dd_200mpp_lzw | jpg | 8 | раскраска высот, 200 м |
| THEMIS_DayIR_ControlledMosaics_100m_v2_oct2018 | png | 9 | дневной ИК, 100 м |
| THEMIS_NightIR_ControlledMosaics_100m_v2_oct2018 | png | 9 | ночной ИК, 100 м |
| JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first_dd | png | 17 | HiRISE Езеро, 0.25 м |
| curiosity_hirise_mosaic | png | 16 | HiRISE Гейл, 0.5 м |
| spirit_hirise_mosaic | png | 17 | HiRISE Гусев, 0.25 м |
| HiRISE_ColumbiaHills | png | 16 | HiRISE Columbia Hills, 0.5 м |
| opportunity_hirise_mosaic | png | 17 | HiRISE Меридиана, 0.25 м |
| phoenix_hirise_mosaic | png | 16 | HiRISE Phoenix, 0.5 м |

Это параметры текущего каталога кода, не результат проверки каждого тайла.
HiRISE имеет локальное покрытие (bbox в layers.ts); 404 за его пределами законен.
THEMIS ограничен широтами примерно ±65°. ИК-яркость не является градусами температуры.
Цветная отмывка — изображение, из неё нельзя читать числовые высоты.

**CTX Murray Lab TMS**, используемый 3D-глобусом:

```text
Клиент: /ctx/{region}/{z}/{x}/{yTms}.png
Upstream: https://murray-lab.caltech.edu/CTX/V01/kml/MurrayLab_GlobalCTXMosaic_V01/{region}/{z}/{x}/{yTms}.png
```

Региональные пирамиды, список имён в `ctxRegions.ts` (например шаблон
`E{west}_E{east}_N{south}_N{north}`), max z13, номинально 5 м/пикс.
Проекция Web Mercator используется только как адресация изображений;
`yTms = 2^z - 1 - yXyz`. Нельзя брать y из Trek или использовать земной
радиус для марсианских расстояний. Ограничение широт ±85.05112878°.
Этот endpoint **не тот же сервис**, что JMARS WMS ниже; URL не взаимозаменяемы.
В текущем Vite `/ctx` настроен с `secure:false`; при эксплуатации предпочтительна
корректная доверенная цепочка сертификатов, не перенос этого исключения на весь API.

**JMARS/ASU CTX WMS**, возвращённый 2D-атлас `/atlas`:

```text
Клиент: /jmars-ctx?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=mars_ctx_global_mosaic_v1_m4&STYLES=&FORMAT=image/png&SRS=JMARS:1,180,90&BBOX=77.42,18.43,77.43,18.44&WIDTH=256&HEIGHT=256
Upstream: https://ms-ctx.mars.asu.edu/StampServer-1.2/wms + тот же query string
Capabilities: https://ms-ctx.mars.asu.edu/StampServer-1.2/wms?SERVICE=WMS&REQUEST=GetCapabilities
```

WMS 1.1.1, bbox **west,south,east,north**, долготы восточные. `JMARS:1,180,90`
задаёт невращённую географическую сетку. Без `mars_` в названии слой не работает.
Проверка 15 октября: ASU вернул настоящий PNG 256×256, HTTP 200.
[Описание CTX, 5 м/пикс](https://jmars.asu.edu/node/2844).
[Описание системы координат](https://lunaserv.im-ldi.com/lunaserv-configuration.pdf).
На 500 м приходится около 100 исходных пикселей; масштабирование не добавляет детали.
Другой сервер JMARS `https://ms-mars.mars.asu.edu/`, слой `MOLA_Color_USGS`,
ранее возвращал InvalidFormat: он не подключён и не является источником высот приложения.

### Числовая карта высот и импорт исследований

MOLA — **локальная статика frontend**, не запрос к NASA при каждом построении пути:
`/data/globe/mola_megdr_8ppd_height.json` и `.png`.
PNG 2880×1440; 8 пикселей/градус, около 7.4 км/пикс; высота над ареоидом:
`height_m = (((R << 8) | G) - offset_units) * step_m`, B=0.
В текущем JSON offset=8192, step=4 м. PNG нельзя преобразовывать в JPEG,
оптимизировать с потерями или менять цвета через CDN. Проверять JSON/PNG вместе.
Обработанный файл получается `scripts/build_globe_heightmap.py` из
[PDS MOLA MEGT90N000EB](https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg016/megt90n000eb.img).
Мелкий шаг точек расчётного пути не улучшает исходные 7.4 км/пикс.
Такая карта не доказывает проходимость участка 500 м и не заменяет локальный DTM.

Исследования не подкачиваются автоматически из JMARS/NASA.
Импорт RAD: `scripts/import_weekly_science.py`, результат `data/science/rad.json`.
Загрузка в БД: `python scripts/seed_research.py`, дополнительные карточки:
`python scripts/seed_research.py --catalog path/to/research.json`.
Поставляется 87 измерений RAD (B/E: 174 записи Observation) одного исследования;
у исходника нет подтверждённых координат. Поэтому его нельзя показывать на любом пути.
Три CRTX — шаблоны, не числовые треки MOLA; DOCX относится к другой теме.
Чтобы вдоль маршрутов были реальные исследования, нужны дополнительные карточки
с источником и подтверждённой геопривязкой (контракт импорта выше).

### Проверка без интерфейса

```powershell
$site='https://lovely-reprieve-production-10b7.up.railway.app'
Invoke-RestMethod "$site/api/v1/health"
Invoke-RestMethod "$site/api/v1/regions"
Invoke-RestMethod "$site/api/v1/coverage?lat=18.44&lon=77.45"
Invoke-RestMethod "$site/api/v1/science/research?limit=1"
Invoke-RestMethod "$site/api/v1/science/rad?include_flagged=false"
$body=@{points=@(@{body='Mars';latitude_deg=18.44;longitude_deg=77.45},@{body='Mars';latitude_deg=18.445;longitude_deg=77.455});corridor_m=500} | ConvertTo-Json -Depth 4
Invoke-RestMethod "$site/api/v1/science/research/along-route" -Method Post -ContentType 'application/json' -Body $body
```

Сначала добиться health=200, затем каталога/покрытия=200. Для каждого отказа
сохранить URL, статус, Content-Type, error.code, время, log backend/nginx.
Не считать загрузившийся глобус доказательством работающего FastAPI: снимки
идут через независимые прокси, а MOLA — из статики.

Проверка статики на опубликованном сайте: контрольный тайл Viking вернул
HTTP 200 image/jpeg. Загрузка полного PNG MOLA превысила тайм-аут 18 секунд
в этой проверке; это не доказательство отсутствующего файла, но объясняет,
почему отдельно нужно измерять загрузку/декодирование высот. В клиент добавлены
тайм-аут сети 30 секунд, проверка HTTP/JSON/размеров PNG и показ причины отказа.
В исходной версии ссылка «Атлас» в PlannerPage вела на `/` (главная).
Исправление: отдельный `/atlas` с 2D CTX через `/jmars-ctx`; `/planner` остаётся
существующим 3D-планировщиком, `/` — главной. Новые пути требуют нового frontend
build/deploy: одних изменений переменных Railway для навигации недостаточно.
