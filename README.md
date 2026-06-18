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

## Quickstart (Docker)

The whole app — backend **and** frontend — runs from one Docker stack. Django
serves the frontend at the same origin as the API, so there is **no separate
frontend setup**.

```bash
cp backend/.env.example backend/.env   # then set GEMINI_API_KEY (see below)
docker compose up --build
```

Open **<http://localhost:8000/>**, register, log in, paste a YouTube URL — a quiz
is generated. No other configuration is needed for local use.

> The default `.env` has `DEBUG=True`; only `GEMINI_API_KEY` must be filled in for
> quiz generation. The first build downloads PyTorch + the Whisper model, so it
> takes a few minutes.

### Environment variables (`backend/.env`)

| Variable | Purpose |
| --- | --- |
| `GEMINI_API_KEY` | Gemini Flash API key — **required** for quiz generation ([get one](https://aistudio.google.com/apikey)) |
| `DEBUG` | `True` locally, `False` in production |
| `SECRET_KEY` | Django secret key (required when `DEBUG=False`) |
| `ALLOWED_HOSTS` | Comma-separated allowed hosts (production) |
| `GEMINI_MODEL` | Gemini model id (default `gemini-2.5-flash`) |
| `WHISPER_MODEL` | Whisper model size (`tiny`…`large`, default `base`) |

The `YTDLP_*` anti-bot knobs are covered under *YouTube extraction* below.

## Run without Docker (optional)

For backend development in a local virtualenv (requires Python 3.13 + FFmpeg):

```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                  # set GEMINI_API_KEY
python manage.py migrate
python manage.py runserver                            # serves API + frontend
```

Then open **<http://127.0.0.1:8000/>**.

## Deployment (production)

The same stack runs in production via the **`prod` profile**, which adds the
Caddy auto-HTTPS reverse proxy in front of gunicorn:

```bash
# in backend/.env: DEBUG=False, a real SECRET_KEY, DOMAIN, ALLOWED_HOSTS,
#                  CSRF_TRUSTED_ORIGINS, SECURE_SSL_REDIRECT=True
docker compose --profile prod up -d --build
```

Caddy obtains a Let's Encrypt certificate for `DOMAIN` automatically (point the
domain's DNS at the host first).

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
   re-up (`docker compose --profile prod up -d` in production). The `./secrets`
   volume is read-write so yt-dlp can refresh the cookies — refresh the file when
   blocks reappear.
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
