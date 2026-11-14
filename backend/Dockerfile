# Образ API: запуск через start.sh, общий для CMD и railway.json.
FROM python:3.12-slim

WORKDIR /app
ENV MARTIAN_SCIENCE_DATA_DIR=/app/data/science

COPY pyproject.toml ./
COPY src ./src
RUN pip install --no-cache-dir .

COPY alembic.ini ./
COPY alembic ./alembic
COPY data ./data
COPY scripts ./scripts

EXPOSE 8000
COPY start.sh ./
RUN chmod +x start.sh
CMD ["sh", "start.sh"]
