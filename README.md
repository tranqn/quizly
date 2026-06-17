# Quizly

Quizly turns a YouTube video into a multiple-choice quiz. A user submits a
video URL; the backend downloads the audio, transcribes it with Whisper and asks
Google Gemini Flash to generate a 10-question quiz. Authentication uses JWTs that
are delivered as **HttpOnly cookies**.

This repository contains two parts:

```
quizly/
├── frontend/   # provided static frontend (HTML/CSS/JS)
└── backend/    # Django REST API (this is the part built here)
```

The frontend is the provided project
[`Developer-Akademie-Backendkurs/project.Quizly`](https://github.com/Developer-Akademie-Backendkurs/project.Quizly)
and talks to the backend at `http://127.0.0.1:8000/api/`.

## Requirements

- **Python 3.13** (recommended). Django 6.0 requires Python ≥ 3.12, and PyTorch
  (pulled in by Whisper) needs a version with available wheels — 3.13 is the
  version this project is developed and tested against; 3.12 also works, 3.14
  does not yet.
- **FFmpeg installed globally** — required by Whisper and by yt-dlp to extract
  the audio track. Verify with `ffmpeg -version`.
  - macOS: `brew install ffmpeg` · Debian/Ubuntu: `sudo apt install ffmpeg`
- A **Gemini API key** (free tier) from <https://aistudio.google.com/apikey>.
- **A JavaScript runtime (optional)** — `deno`. yt-dlp uses it to solve
  YouTube's JS challenges and prints a deprecation warning without one, but
  typical audio extraction works fine without it, so the project ships without a
  bundled runtime. Add `deno` only if specific videos fail (see below).

## Backend setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env               # then edit .env and set GEMINI_API_KEY
python manage.py migrate
python manage.py createsuperuser   # optional, for the admin panel
python manage.py runserver
```

The API is now served at `http://127.0.0.1:8000/api/`.

### Environment variables (`backend/.env`)

| Variable               | Purpose                                              |
| ---------------------- | ---------------------------------------------------- |
| `SECRET_KEY`           | Django secret key                                    |
| `DEBUG`                | `True` locally, `False` in production                |
| `ALLOWED_HOSTS`        | Comma-separated allowed hosts                        |
| `CORS_ALLOWED_ORIGINS` | Frontend origins allowed to send credentialed calls  |
| `GEMINI_API_KEY`       | Gemini Flash API key (quiz generation)               |
| `GEMINI_MODEL`         | Gemini model id (default `gemini-2.5-flash`)         |
| `WHISPER_MODEL`        | Whisper model size (`tiny`…`large`, default `base`)  |

## Running the frontend

The backend serves the frontend itself (WhiteNoise, same origin as the API), so
after `python manage.py runserver` just open **<http://127.0.0.1:8000/>** — no
second server needed. `frontend/shared/js/config.js` uses a relative
`API_BASE_URL = "/api/"`, so it works in both development and production.

To serve the frontend separately instead (e.g. VS Code **Live Server** on
`http://127.0.0.1:5500`), set `API_BASE_URL` back to the absolute
`http://127.0.0.1:8000/api/` in `config.js` and keep that origin in
`CORS_ALLOWED_ORIGINS`. The browser must send cookies, so the frontend calls the
API with credentials included.

## Deployment

A production Docker stack is included — `docker-compose.yml`,
`backend/Dockerfile`, `Caddyfile` — running Caddy (auto-HTTPS) →
gunicorn/Django → SQLite, plus a yt-dlp PO-token sidecar. Configure
`backend/.env` for production (`DEBUG=False`, a real `SECRET_KEY`, `DOMAIN`,
`ALLOWED_HOSTS`, `CSRF_TRUSTED_ORIGINS`) and run `docker compose up -d --build`.

## YouTube extraction & blocking

YouTube throttles or blocks requests from datacenter IPs ("Sign in to confirm
you're not a bot"), so on a server `yt-dlp` needs help. The defenses are layered
and all driven by environment variables, so the baseline works out of the box and
you only escalate if a block actually appears:

**Enabled by default (no setup):**

- **Current yt-dlp** — installed from the nightly channel in the image; stale
  yt-dlp is the most common cause of failures.
- **PO-token sidecar** — the `potoken` service (`bgutil-ytdlp-pot-provider`)
  supplies Proof-of-Origin tokens; the app points at it via `YTDLP_POT_BASE_URL`.

No JavaScript runtime is bundled — typical audio extraction works without one. If
a video fails with "some formats may be missing", add `deno` to the image
(`COPY --from=denoland/deno:bin /deno /usr/local/bin/deno`); it's the only
runtime yt-dlp auto-enables.

| Variable | Purpose |
| --- | --- |
| `YTDLP_POT_BASE_URL` | PO-token provider URL (set to the sidecar in Docker) |
| `YTDLP_PLAYER_CLIENTS` | Force specific player clients. **Leave empty** — forcing them (e.g. `tv`) tends to break extraction; yt-dlp's own choice is best |
| `YTDLP_COOKIEFILE` | Path to a Netscape `cookies.txt` (escalation, see below) |
| `YTDLP_PROXY` | Residential/rotating proxy (last-resort escalation) |

**Escalation, only if you still get blocked:**

1. **Account cookies** — export a `cookies.txt` from a browser logged into a
   **throwaway** Google account (never your main one), place it at
   `secrets/cookies.txt`, set `YTDLP_COOKIEFILE=/secrets/cookies.txt`, and
   `docker compose up -d`. The `./secrets` volume is mounted read-write so yt-dlp
   can refresh the cookies. Refresh the file when blocks reappear.
2. **Residential proxy** — set `YTDLP_PROXY` to leave the datacenter IP range
   entirely. The most reliable fix, but paid.

If extraction fails, the API returns `500` with a JSON `detail` naming the stage
(download vs. AI). Server-side YouTube extraction is an ongoing maintenance topic;
keeping yt-dlp current handles most issues.

## API endpoints

Base URL: `http://127.0.0.1:8000/api/`

### Authentication

| Method | Endpoint          | Body                                                   | Result |
| ------ | ----------------- | ------------------------------------------------------ | ------ |
| POST   | `/register/`      | `username`, `email`, `password`, `confirmed_password`  | `201` user created |
| POST   | `/login/`         | `username`, `password`                                 | `200`, sets `access_token` + `refresh_token` cookies |
| POST   | `/token/refresh/` | – (reads `refresh_token` cookie)                       | `200`, sets a new `access_token` cookie |
| POST   | `/logout/`        | – (auth required)                                      | `200`, clears cookies and blacklists the refresh token |

### Quizzes (authentication required)

| Method | Endpoint          | Body                     | Result |
| ------ | ----------------- | ------------------------ | ------ |
| POST   | `/quizzes/`       | `url`                    | `201` generated quiz with 10 questions |
| GET    | `/quizzes/`       | –                        | `200` list of the user's quizzes |
| GET    | `/quizzes/{id}/`  | –                        | `200` single quiz |
| PATCH  | `/quizzes/{id}/`  | `title`, `description`   | `200` updated quiz |
| DELETE | `/quizzes/{id}/`  | –                        | `204` deleted |

Users can only access their own quizzes.

## Admin panel

`http://127.0.0.1:8000/admin/` lets staff users manage quizzes and edit each
quiz's questions inline.

## Project layout (backend)

```
backend/
├── core/        # project settings, urls
├── auth_app/    # registration + JWT cookie authentication
│   └── api/     # serializers, views, urls, authentication
└── quiz_app/    # Quiz/Question models, CRUD, admin
    └── api/     # serializers, views, urls, services (AI pipeline)
```

The quiz generation pipeline lives in `quiz_app/api/services.py`:
`download_audio` (yt-dlp) → `transcribe_audio` (Whisper) →
`generate_quiz_data` (Gemini Flash) → `persist_quiz`.
