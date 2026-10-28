# Quizly

Quizly turns a YouTube video into a multiple-choice quiz. A user submits a
video URL; the backend downloads the audio, transcribes it with Whisper and asks
Google Gemini Flash to generate a 10-question quiz. Authentication uses JWTs that
are delivered as **HttpOnly cookies**.

This repository contains two parts:

```
quizly/
├── frontend/   # static frontend (HTML/CSS/JS), redesigned from the course template
└── backend/    # Django REST API
```

### Frontend: redesigned on top of the course frontend

The starting point was the provided course frontend
[`Developer-Akademie-Backendkurs/project.Quizly`](https://github.com/Developer-Akademie-Backendkurs/project.Quizly).
It has since been rebuilt page by page, following patterns from established quiz
apps (Quizizz, Quizlet, QuestionWell) while keeping the original look:

- start page with the link field above the fold instead of a 6 s intro, link
  preview, and a guest entry; a link entered while logged out becomes a quiz
  right after login
- library with quiz cards (thumbnail, question count, date, last result),
  keyboard menu, delete confirmation, loading, empty and error states
- quiz solvable by keyboard alone (radio group, 1 to 4 or A to D, Enter),
  progress bar, result ring and a full answer review
- German UI, shared design tokens, visible focus, labels on every field
- no build step: still plain HTML, CSS and JavaScript served by Django

The API contract of the course is unchanged; the only addition is the guest
login below. Before and after measurements (Lighthouse, axe, screenshots) live
in [`docs/ui-angleichung/`](docs/ui-angleichung/). The last result per quiz is
kept in `localStorage`, so it is per device.

### Guest access

`POST /api/guest-login/` logs into a shared, **read-only** demo account: it can
list, open and solve quizzes, while creating, renaming and deleting answer
`403`. `python manage.py seed_demo` creates the account (no usable password) and
loads three German demo quizzes from `quiz_app/fixtures/demo_quizzes.json`; the
container entrypoint runs it on every start and it is idempotent (`--reset`
reloads the quizzes). Registration rejects the guest username, and the guest
login refuses an account that has a password. Guest logins are throttled to 30
per hour and client IP.

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
| `GUEST_USERNAME` | Name of the read-only demo account (default `gast`) |
| `NUM_PROXIES` | Reverse proxies in front of Django, used to find the client IP for throttling (default `1`) |
| `CACHE_DIR` | File cache shared by the gunicorn workers for throttle counters (default `/tmp/quizly-cache`) |

The `YTDLP_*` anti-bot knobs are covered under *YouTube extraction* below.

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
| POST   | `/guest-login/`   | none                                                   | `200`, same cookies for the read-only demo account; `503` if not seeded |
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

Users can only access their own quizzes. The guest account gets `403` on `POST`, `PATCH` and `DELETE`.

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
