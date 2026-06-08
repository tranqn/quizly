"""Authentication that reads the JWT access token from an HttpOnly cookie."""
from rest_framework_simplejwt.authentication import JWTAuthentication


class CookieJWTAuthentication(JWTAuthentication):
    """Validate the access token stored in the ``access_token`` cookie."""

    def authenticate(self, request):
        """Return the (user, token) pair or None for anonymous requests."""
        access_token = request.COOKIES.get('access_token')
        if access_token is None:
            return None

        validated_token = self.get_validated_token(access_token)
        return self.get_user(validated_token), validated_token
