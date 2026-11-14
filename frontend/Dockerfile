# Сборка статики и nginx с двумя прокси:
#   /api  -> backend (приватная сеть Railway или сервис compose)
#   /trek -> trek.nasa.gov/tiles (same-origin для WebGL-текстур, у NASA нет CORS)
# Переменные: PORT (задаёт Railway, по умолчанию 80), API_HOST (host:port backend).

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
ENV PORT=80
ENV API_HOST=api:8000
# Включает экспорт NGINX_LOCAL_RESOLVERS (DNS из /etc/resolv.conf) для шаблона
ENV NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1
COPY --from=build /app/dist /usr/share/nginx/html
# nginx:alpine сам прогоняет templates через envsubst при старте
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
# Нормализация API_HOST до старта nginx: без неё пропущенный порт или
# лишняя схема дают 500 на каждом запросе к /api/, без причины в логах.
COPY docker-entrypoint.d/05-api-host.envsh /docker-entrypoint.d/05-api-host.envsh
RUN chmod +x /docker-entrypoint.d/05-api-host.envsh
EXPOSE 80
