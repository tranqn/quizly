# Quizly backend image. Build from the quizly/ root so the frontend is in context:
#   docker build -f backend/Dockerfile -t quizly .
FROM python:3.13-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    WHISPER_MODEL=base \
    FRONTEND_DIR=/frontend \
    SQLITE_PATH=/app/data/db.sqlite3

# FFmpeg is required by yt-dlp (audio extraction) and Whisper.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Bun: a JavaScript runtime for yt-dlp's YouTube JS-challenge solver. yt-dlp
# deprecates running without one and warns that "some formats may be missing"
# (signature deciphering / throttling). Audio extraction often works without it,
# but a runtime is recommended insurance. Bun is a single static binary.
COPY --from=oven/bun:1 /usr/local/bin/bun /usr/local/bin/bun

RUN useradd --create-home --uid 1000 app
WORKDIR /app

# Install Python deps. yt-dlp tracks YouTube changes closely, so use the nightly
# channel; the bgutil plugin lets yt-dlp fetch PO tokens from the sidecar.
COPY backend/requirements.txt .
RUN pip install -r requirements.txt \
    && pip install -U --pre "yt-dlp[default]" \
    && pip install bgutil-ytdlp-pot-provider

# Application code + the static frontend served same-origin via WhiteNoise.
COPY backend/ /app/
COPY frontend/ /frontend/
RUN chmod +x /app/entrypoint.sh \
    && mkdir -p /app/data \
    && chown -R app:app /app /frontend

USER app

# Bake the Whisper model into the image so the first request doesn't download it.
RUN python -c "import whisper; whisper.load_model('base')"

EXPOSE 8000
ENTRYPOINT ["/app/entrypoint.sh"]
