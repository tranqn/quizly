#!/bin/sh
# Apply migrations, seed the guest account, collect static assets, then serve.
# The long gunicorn timeout accommodates the synchronous Whisper transcription,
# which can take minutes.
set -e

python manage.py migrate --noinput
python manage.py seed_demo
python manage.py collectstatic --noinput

exec gunicorn core.wsgi:application \
    --bind 0.0.0.0:8000 \
    --workers "${GUNICORN_WORKERS:-2}" \
    --timeout "${GUNICORN_TIMEOUT:-1200}"
