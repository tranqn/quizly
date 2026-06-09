"""Quiz generation pipeline: YouTube URL -> audio -> transcript -> quiz.

The heavy third-party libraries (yt-dlp, openai-whisper, google-genai) are
imported lazily inside the functions that use them, so the rest of the project
runs without them installed.
"""
import json
import tempfile
from pathlib import Path

from django.conf import settings

from ..models import Question, Quiz


def _ydl_options(target):
    """Build the yt-dlp options for audio-only extraction to mp3."""
    return {
        'format': 'bestaudio/best',
        'outtmpl': str(target),
        'quiet': True,
        'postprocessors': [
            {'key': 'FFmpegExtractAudio', 'preferredcodec': 'mp3'}
        ],
    }


def download_audio(url):
    """Download the YouTube audio track and return the local file path."""
    import yt_dlp

    target = Path(tempfile.mkdtemp()) / 'audio.%(ext)s'
    with yt_dlp.YoutubeDL(_ydl_options(target)) as ydl:
        ydl.download([url])
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
    """Ask Gemini Flash to turn the transcript into structured quiz data."""
    from google import genai

    client = genai.Client(api_key=settings.GEMINI_API_KEY)
    response = client.models.generate_content(
        model=settings.GEMINI_MODEL,
        contents=build_quiz_prompt(transcript),
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
