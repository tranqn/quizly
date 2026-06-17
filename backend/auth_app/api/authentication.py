"""Authentication that reads the JWT access token from an HttpOnly cookie."""
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError


class CookieJWTAuthentication(JWTAuthentication):
    """Validate the access token stored in the ``access_token`` cookie."""

    def authenticate(self, request):
        """Return the (user, token) pair, or None for anonymous/stale cookies."""
        access_token = request.COOKIES.get('access_token')
        if access_token is None:
            return None
        try:
            validated_token = self.get_validated_token(access_token)
        except (InvalidToken, TokenError):
            # Expired/invalid cookie: treat as anonymous so public endpoints
            # (register/login) still work, and protected ones return a 401 the
            # frontend handles by refreshing the token.
            return None
        return self.get_user(validated_token), validated_token
