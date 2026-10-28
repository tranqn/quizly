"""Permissions for the quiz endpoints."""
from django.conf import settings
from rest_framework.permissions import SAFE_METHODS, BasePermission


class GuestReadOnly(BasePermission):
    """Let the shared demo account read and solve quizzes but never change them.

    Creating would spend Gemini quota on a public login, and renaming or
    deleting would break the demo for the next visitor.
    """

    message = 'The guest account is read-only.'

    def has_permission(self, request, view):
        """Allow safe methods for everyone, writes only for real accounts."""
        if request.method in SAFE_METHODS:
            return True
        return request.user.username != settings.GUEST_USERNAME
