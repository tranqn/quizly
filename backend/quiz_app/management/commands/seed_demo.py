"""Create the read-only guest account and load its demo quizzes.

Usage (inside the container):
    python manage.py seed_demo           # create guest + quizzes if missing
    python manage.py seed_demo --reset   # replace the guest's quizzes with the fixture

The quizzes come from ``quiz_app/fixtures/demo_quizzes.json``. They were
generated once with the real pipeline and proofread, so seeding never calls
YouTube, Whisper or Gemini.
"""
import json
from pathlib import Path

from django.conf import settings
from django.contrib.auth.models import User
from django.core.management.base import BaseCommand
from django.db import transaction

from quiz_app.api.services import persist_quiz

FIXTURE = Path(__file__).resolve().parents[2] / 'fixtures' / 'demo_quizzes.json'


class Command(BaseCommand):
    help = 'Create the read-only guest account and load the demo quizzes.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--reset', action='store_true',
            help="Delete the guest's quizzes and load the fixture again.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        guest = self._ensure_guest()
        if options['reset']:
            guest.quizzes.all().delete()
        if guest.quizzes.exists():
            self.stdout.write(f'Guest "{guest.username}" already has quizzes, nothing to do.')
            return
        quizzes = json.loads(FIXTURE.read_text(encoding='utf-8'))
        for data in quizzes:
            persist_quiz(guest, data['video_url'], data)
        self.stdout.write(self.style.SUCCESS(
            f'Guest "{guest.username}" seeded with {len(quizzes)} quizzes.'
        ))

    def _ensure_guest(self):
        """Return the guest user, creating it without a usable password."""
        guest, created = User.objects.get_or_create(username=settings.GUEST_USERNAME)
        if created:
            guest.set_unusable_password()
            guest.save()
        return guest
