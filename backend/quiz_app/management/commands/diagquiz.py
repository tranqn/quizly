"""Diagnostic: run the quiz pipeline stage by stage and report where it fails.

Usage (inside the container):
    python manage.py diagquiz
    python manage.py diagquiz "https://www.youtube.com/watch?v=<id>"

Each stage prints before it runs, so even a hard crash / OOM-kill leaves the last
"N/3 ..." line as the culprit. On exception the full traceback is printed.
"""
import traceback

from django.core.management.base import BaseCommand

from quiz_app.api import services

DEFAULT_URL = "https://www.youtube.com/watch?v=M4TufsFlv_o"


class Command(BaseCommand):
    help = "Run the quiz generation pipeline stage by stage for debugging."

    def add_arguments(self, parser):
        parser.add_argument("url", nargs="?", default=DEFAULT_URL)

    def handle(self, *args, **options):
        url = options["url"]
        try:
            self.stdout.write("1/3 download_audio ...", ending="\n")
            self.stdout.flush()
            path = services.download_audio(url)
            self.stdout.write(self.style.SUCCESS(f"    ok -> {path}"))

            self.stdout.write("2/3 transcribe_audio (Whisper) ...")
            self.stdout.flush()
            transcript = services.transcribe_audio(path)
            self.stdout.write(self.style.SUCCESS(f"    ok -> {len(transcript)} chars"))

            self.stdout.write("3/3 generate_quiz_data (Gemini) ...")
            self.stdout.flush()
            data = services.generate_quiz_data(transcript)
            n = len(data.get("questions", []))
            self.stdout.write(self.style.SUCCESS(f'    ok -> "{data.get("title")}", {n} questions'))
            self.stdout.write(self.style.SUCCESS("PIPELINE OK"))
        except Exception:
            self.stderr.write("FAILED at the stage printed last above:")
            traceback.print_exc()
