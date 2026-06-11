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

- **Python** 3.12 or 3.13. Django 6.0 requires Python ≥ 3.12, and PyTorch
  (pulled in by Whisper) needs a version with available wheels — 3.12 and 3.13
  both work, 3.14 does not yet.
- **FFmpeg installed globally** — required by Whisper and by yt-dlp to extract
  the audio track. Verify with `ffmpeg -version`.
  - macOS: `brew install ffmpeg` · Debian/Ubuntu: `sudo apt install ffmpeg`
- A **Gemini API key** (free tier) from <https://aistudio.google.com/apikey>.

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

Serve the `frontend/` folder with any static server (e.g. the VS Code
**Live Server** extension) and open `index.html`. The default allowed origin is
`http://127.0.0.1:5500`; adjust `CORS_ALLOWED_ORIGINS` if your server uses a
different port. The browser must send cookies, so the frontend calls the API with
credentials included.

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
