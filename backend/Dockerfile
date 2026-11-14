FROM python:3.12-slim

WORKDIR /app
ENV MARTIAN_SCIENCE_DATA_DIR=/app/data/science

# Для GDAL/Rasterio в конвейере обработки позже добавится отдельный образ worker
# с gdal-bin; API он не нужен.
COPY pyproject.toml ./
COPY src ./src
RUN pip install --no-cache-dir .

COPY alembic.ini ./
COPY alembic ./alembic
COPY data ./data
COPY scripts ./scripts

EXPOSE 8000
# Порядок запуска и причины выбора сервера описаны в start.sh; на него же
# ссылается railway.json, чтобы команда из панели платформы его не обходила.
COPY start.sh ./
RUN chmod +x start.sh
CMD ["sh", "start.sh"]
