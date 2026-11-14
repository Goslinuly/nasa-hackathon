# Martian Map — frontend

React + TypeScript + Vite. Структура по [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md):

```
src/
  app/        # shell приложения, провайдеры, стили
  features/   # atlas, expedition, science, panorama, admin
  entities/   # нормализованные доменные типы и состояние
  shared/
    api/          # клиент и типы API (до генерации из OpenAPI — временные ручные)
    coordinates/  # единый модуль марсианских координат (шов 0°/360° покрыт тестами)
```

## Запуск

```bash
npm install
npm run dev     # http://localhost:5173, /api проксируется на localhost:8001
npm test        # vitest
npm run build   # tsc + vite build
```

Глобусный движок (CesiumJS против Three.js) подключается после ADR до 8 октября —
не добавляйте тяжёлый рендерер до этого решения.

## Объёмный рельеф глобуса

Геометрия глобуса строится по карте высот MOLA MEGDR 8 px/° (~7.4 км/пикс):
`public/data/globe/mola_megdr_8ppd_height.png` + `.json` с параметрами кодирования,
источником и SHA-256. Пересобрать из исходного продукта PDS (скачивается автоматически
в `data/raw/`, в Git не хранится):

```bash
cd backend && python scripts/build_globe_heightmap.py   # нужны numpy и pillow
```

Подложки — тайлы Mars Trek: «Рельеф» (HRSC + MOLA blend 200 м, цвет по высоте) и
«Снимок» (Viking MDIM21 232 м). Вертикальное преувеличение (×1/×3/×5/×10) показано в HUD.

## Планировщик маршрута (`/planner`)

Точки A и Б — кликом по планете или вводом координат (восточная долгота 0–360°).
Маршрут считает A* по той же карте высот MOLA в Web Worker
(`src/features/planner/routing.ts`): уклоны круче заданного исключены, концы — точно в A и Б.
Это обзорная оценка (~7.4 км/пикс), не проверенная тропа. Время в пути — в солах или земных сутках.

Спектры: видимый (Viking + отмывка HRSC/MOLA), высоты, рельеф, THEMIS ИК день/ночь (100 м).
Детальные снимки: CTX Murray Lab (5 м, почти вся планета, проксируется через `/ctx`)
и HiRISE (0.25–0.5 м) в районах посадок. Прокси `/trek` и `/ctx` есть и в `vite.config.ts`,
и в `nginx.conf.template`.
