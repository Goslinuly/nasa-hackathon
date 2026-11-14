# Сборка статики Vite и nginx: прокси /api на backend, /trek на trek.nasa.gov.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
ENV PORT=80
ENV API_HOST=api:8000
ENV API_SCHEME=http
ENV API_HOST_NAME=api
ENV NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY docker-entrypoint.d/05-api-host.envsh /docker-entrypoint.d/05-api-host.envsh
RUN chmod +x /docker-entrypoint.d/05-api-host.envsh
EXPOSE 80
