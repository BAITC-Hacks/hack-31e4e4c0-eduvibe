#!/bin/sh
set -eu

attempt=1
max_attempts=20

until alembic upgrade head; do
  if [ "$attempt" -ge "$max_attempts" ]; then
    echo "Не удалось подключиться к базе данных после $max_attempts попыток." >&2
    exit 1
  fi
  echo "База данных ещё не готова, повтор $attempt/$max_attempts..." >&2
  attempt=$((attempt + 1))
  sleep 2
done

python -m app.seed
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
