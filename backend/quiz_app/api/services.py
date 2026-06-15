"""Quiz generation pipeline: YouTube URL -> audio -> transcript -> quiz.

The heavy third-party libraries (yt-dlp, openai-whisper, google-genai) are
imported lazily inside the functions that use them, so the rest of the project
runs without them installed.
"""
import json
import time
import tempfile
from pathlib import Path

from django.conf import settings
from rest_framework.exceptions import APIException

from ..models import Question, Quiz


class AudioDownloadError(APIException):
    """Raised when yt-dlp cannot fetch the video audio (e.g. YouTube bot block)."""

    status_code = 500
    default_detail = (
        'Could not fetch the video audio. YouTube may be blocking the server; '
        'try again later or contact the administrator to refresh the cookies.'
    )


class QuizGenerationError(APIException):
    """Raised when Gemini fails to return usable quiz data (overload, bad JSON)."""

    status_code = 500
    default_detail = (
        'Quiz generation is temporarily unavailable (the AI service is busy). '
        'Please try again in a moment.'
    )


def _ydl_options(target):
    """Build the yt-dlp options for audio-only extraction to mp3."""
    options = {
        'format': 'bestaudio/best',
        'outtmpl': str(target),
        'quiet': True,
        'postprocessors': [{'key': 'FFmpegExtractAudio', 'preferredcodec': 'mp3'}],
        'sleep_interval_requests': 1,  # light throttling vs rate-based detection
        'extractor_args': {},
    }
    _apply_antibot(options)
    return options


def _apply_antibot(options):
    """Layer the configured yt-dlp anti-bot knobs onto the base options.

    YouTube blocks datacenter IPs, so we optionally add a player-client choice,
    a PO-token provider, account cookies and a proxy - each only when set.
    Forcing clients is avoided by default (the defaults extract more reliably).
    """
    if settings.YTDLP_PLAYER_CLIENTS:
        options['extractor_args']['youtube'] = {
            'player_client': settings.YTDLP_PLAYER_CLIENTS}
    if settings.YTDLP_POT_BASE_URL:
        options['extractor_args']['youtubepot-bgutilhttp'] = {
            'base_url': [settings.YTDLP_POT_BASE_URL]}
    if settings.YTDLP_COOKIEFILE:
        options['cookiefile'] = settings.YTDLP_COOKIEFILE
    if settings.YTDLP_PROXY:
        options['proxy'] = settings.YTDLP_PROXY


def download_audio(url):
    """Download the YouTube audio track and return the local file path."""
    import yt_dlp

    target = Path(tempfile.mkdtemp()) / 'audio.%(ext)s'
    try:
        with yt_dlp.YoutubeDL(_ydl_options(target)) as ydl:
            ydl.download([url])
    except yt_dlp.utils.DownloadError as exc:
        raise AudioDownloadError() from exc
    return target.with_suffix('.mp3')


def transcribe_audio(path):
    """Transcribe an audio file to text using a local Whisper model."""
    import whisper

    model = whisper.load_model(settings.WHISPER_MODEL)
    result = model.transcribe(str(path))
    return result['text']


def build_quiz_prompt(transcript):
    """Build the Gemini prompt that requests a 10-question quiz as JSON."""
    return (
        'Create a quiz based on the following transcript. '
        'Return ONLY valid JSON with the keys "title", "description" and '
        '"questions". "questions" must be a list of exactly 10 objects, each '
        'with "question_title", "question_options" (exactly 4 strings) and '
        '"answer" (one of the options).\n\nTranscript:\n' + transcript
    )


def generate_quiz_data(transcript):
    """Ask Gemini Flash to turn the transcript into quiz data, retrying on overload.

    Gemini occasionally returns transient 429/503; retry with backoff, then fail
    with a clear error.
    """
    from google.genai import errors

    prompt = build_quiz_prompt(transcript)
    for attempt in range(3):
        try:
            return _request_quiz(prompt)
        except errors.APIError as exc:
            transient = getattr(exc, 'code', None) in (429, 500, 503)
            if not (transient and attempt < 2):
                raise QuizGenerationError() from exc
            time.sleep(2 ** attempt)
        except (json.JSONDecodeError, KeyError, TypeError) as exc:
            raise QuizGenerationError() from exc


def _request_quiz(prompt):
    """Send one prompt to Gemini and parse the returned quiz JSON."""
    from google import genai

    client = genai.Client(api_key=settings.GEMINI_API_KEY)
    response = client.models.generate_content(
        model=settings.GEMINI_MODEL, contents=prompt,
    )
    return _parse_quiz_json(response.text)


def _parse_quiz_json(text):
    """Parse the model response into a dict, tolerating Markdown fences."""
    cleaned = text.strip().removeprefix('```json').removeprefix('```')
    cleaned = cleaned.removesuffix('```').strip()
    return json.loads(cleaned)


def persist_quiz(user, url, data):
    """Store the generated quiz and its questions for the user."""
    quiz = Quiz.objects.create(
        owner=user,
        title=data.get('title', 'Untitled Quiz'),
        description=data.get('description', ''),
        video_url=url,
    )
    _create_questions(quiz, data.get('questions', []))
    return quiz


def _create_questions(quiz, questions):
    """Bulk-create the question rows for a quiz."""
    Question.objects.bulk_create([
        Question(
            quiz=quiz,
            question_title=item['question_title'],
            question_options=item['question_options'],
            answer=item['answer'],
        )
        for item in questions
    ])


def create_quiz_from_url(user, url):
    """Run the full pipeline: download, transcribe, generate, persist."""
    audio_path = download_audio(url)
    try:
        transcript = transcribe_audio(audio_path)
        data = generate_quiz_data(transcript)
    finally:
        audio_path.unlink(missing_ok=True)
    return persist_quiz(user, url, data)
