"""Tests for the guest account: seeding, login and read-only access."""
from unittest import mock

from django.conf import settings
from django.contrib.auth.models import User
from django.core.cache import cache
from django.core.management import call_command
from django.test import TestCase
from rest_framework.test import APIClient

from .models import Quiz


def seed():
    call_command('seed_demo', stdout=mock.MagicMock())


class SeedDemoTests(TestCase):

    def test_creates_guest_without_usable_password(self):
        seed()
        guest = User.objects.get(username=settings.GUEST_USERNAME)
        self.assertFalse(guest.has_usable_password())
        self.assertEqual(guest.quizzes.count(), 3)
        self.assertTrue(all(q.questions.count() == 10 for q in guest.quizzes.all()))

    def test_is_idempotent(self):
        seed()
        seed()
        self.assertEqual(Quiz.objects.count(), 3)

    def test_reset_restores_deleted_quizzes(self):
        seed()
        Quiz.objects.first().delete()
        call_command('seed_demo', '--reset', stdout=mock.MagicMock())
        self.assertEqual(Quiz.objects.count(), 3)


class GuestLoginTests(TestCase):

    def setUp(self):
        cache.clear()  # the guest login is throttled per client
        self.client = APIClient()

    def test_unavailable_until_seeded(self):
        response = self.client.post('/api/guest-login/')
        self.assertEqual(response.status_code, 503)

    def test_sets_auth_cookies_and_flags_guest(self):
        seed()
        response = self.client.post('/api/guest-login/')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['user']['is_guest'])
        self.assertIn('access_token', response.cookies)
        self.assertIn('refresh_token', response.cookies)

    def test_guest_sees_demo_quizzes(self):
        seed()
        self.client.post('/api/guest-login/')
        response = self.client.get('/api/quizzes/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 3)


class GuestReadOnlyTests(TestCase):

    def setUp(self):
        cache.clear()
        seed()
        self.client = APIClient()
        self.client.post('/api/guest-login/')
        self.quiz = Quiz.objects.first()

    @mock.patch('quiz_app.api.views.create_quiz_from_url')
    def test_guest_cannot_create(self, pipeline):
        response = self.client.post(
            '/api/quizzes/', {'url': 'https://www.youtube.com/watch?v=abc'},
        )
        self.assertEqual(response.status_code, 403)
        pipeline.assert_not_called()

    def test_guest_cannot_rename(self):
        response = self.client.patch(f'/api/quizzes/{self.quiz.id}/', {'title': 'x'})
        self.assertEqual(response.status_code, 403)

    def test_guest_cannot_delete(self):
        response = self.client.delete(f'/api/quizzes/{self.quiz.id}/')
        self.assertEqual(response.status_code, 403)
        self.assertEqual(Quiz.objects.count(), 3)

    def test_regular_user_can_still_rename(self):
        user = User.objects.create_user('anna', password='pw-12345678')
        quiz = Quiz.objects.create(owner=user, title='Alt', video_url='https://youtu.be/x')
        client = APIClient()
        client.force_authenticate(user)
        response = client.patch(f'/api/quizzes/{quiz.id}/', {'title': 'Neu'})
        self.assertEqual(response.status_code, 200)


class GuestNameCollisionTests(TestCase):
    """A real account that already uses the guest name must stay private."""

    def setUp(self):
        cache.clear()
        self.owner = User.objects.create_user(settings.GUEST_USERNAME, password='pw-12345678')

    def test_seed_leaves_real_account_alone(self):
        call_command('seed_demo', stdout=mock.MagicMock(), stderr=mock.MagicMock())
        self.owner.refresh_from_db()
        self.assertTrue(self.owner.has_usable_password())
        self.assertEqual(self.owner.quizzes.count(), 0)

    def test_guest_login_refuses_real_account(self):
        response = APIClient().post('/api/guest-login/')
        self.assertEqual(response.status_code, 503)
        self.assertNotIn('access_token', response.cookies)

    def test_registration_rejects_guest_name(self):
        response = APIClient().post('/api/register/', {
            'username': settings.GUEST_USERNAME.upper(),
            'email': 'x@example.com',
            'password': 'Passwort1',
            'confirmed_password': 'Passwort1',
        })
        self.assertEqual(response.status_code, 400)
        self.assertIn('username', response.data)


class PipelineErrorCodeTests(TestCase):
    """The frontend tells pipeline failures apart by `code`, not by wording."""

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(User.objects.create_user('anna', password='pw-12345678'))

    def post_with(self, error):
        with mock.patch('quiz_app.api.views.create_quiz_from_url', side_effect=error()):
            return self.client.post('/api/quizzes/', {'url': 'https://youtu.be/abcdefghijk'})

    def test_audio_download_code(self):
        from .api.services import AudioDownloadError
        response = self.post_with(AudioDownloadError)
        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.data['code'], 'audio_download_failed')
        self.assertIn('detail', response.data)

    def test_generation_code(self):
        from .api.services import QuizGenerationError
        response = self.post_with(QuizGenerationError)
        self.assertEqual(response.data['code'], 'quiz_generation_failed')
