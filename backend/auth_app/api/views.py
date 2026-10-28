"""Authentication endpoints: register, login, guest login, refresh and logout."""
from django.conf import settings
from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenRefreshView

from .serializers import LoginSerializer, RegistrationSerializer


def set_token_cookie(response, key, token):
    """Store a JWT as an HttpOnly cookie on the given response."""
    response.set_cookie(
        key=key,
        value=str(token),
        httponly=True,
        secure=settings.AUTH_COOKIE_SECURE,
        samesite=settings.AUTH_COOKIE_SAMESITE,
    )


class RegistrationView(APIView):
    """Create a new user account."""

    permission_classes = [AllowAny]

    def post(self, request):
        """Validate the form and persist the new user."""
        serializer = RegistrationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({'detail': 'User created successfully!'}, status=201)


class LoginView(APIView):
    """Authenticate a user and deliver the JWTs as HttpOnly cookies."""

    permission_classes = [AllowAny]

    def post(self, request):
        """Verify credentials and start an authenticated session."""
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = authenticate(**serializer.validated_data)
        if user is None:
            return Response({'detail': 'Invalid credentials.'}, status=401)
        return self.build_login_response(user)

    def build_login_response(self, user):
        """Issue tokens, set the auth cookies and return the user payload."""
        refresh = RefreshToken.for_user(user)
        response = Response({
            'detail': 'Login successfully!',
            'user': {
                'id': user.id,
                'username': user.username,
                'email': user.email,
            },
        }, status=200)
        set_token_cookie(response, 'access_token', refresh.access_token)
        set_token_cookie(response, 'refresh_token', refresh)
        return response


class GuestLoginView(LoginView):
    """Log in as the shared read-only demo account without credentials."""

    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'guest_login'

    def post(self, request):
        """Start a session for the guest user, once `seed_demo` has created it."""
        user = User.objects.filter(
            username=settings.GUEST_USERNAME, is_active=True,
        ).first()
        # A usable password means a real person owns this name; never hand
        # their account to anonymous visitors.
        if user is None or user.has_usable_password():
            return Response({'detail': 'Guest access is not available.'}, status=503)
        response = self.build_login_response(user)
        response.data['user']['is_guest'] = True
        return response


class CookieTokenRefreshView(TokenRefreshView):
    """Refresh the access token using the refresh-token cookie."""

    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        """Read the refresh cookie, validate it and rotate the tokens."""
        refresh_token = request.COOKIES.get('refresh_token')
        if refresh_token is None:
            return Response({'detail': 'No refresh token found.'}, status=401)
        serializer = self.get_serializer(data={'refresh': refresh_token})
        try:
            serializer.is_valid(raise_exception=True)
        except (InvalidToken, TokenError):
            return Response({'detail': 'Refresh token invalid.'}, status=401)
        return self.build_refresh_response(serializer.validated_data)

    def build_refresh_response(self, data):
        """Set the new access (and rotated refresh) cookie."""
        response = Response({'detail': 'Token refreshed'}, status=200)
        set_token_cookie(response, 'access_token', data['access'])
        if data.get('refresh'):
            set_token_cookie(response, 'refresh_token', data['refresh'])
        return response


class LogoutView(APIView):
    """Log the user out and invalidate the refresh token."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        """Blacklist the refresh token and clear both auth cookies."""
        self.blacklist_refresh_token(request)
        response = Response({
            'detail': 'Log-Out successfully! All Tokens will be deleted. '
                      'Refresh token is now invalid.',
        }, status=200)
        response.delete_cookie('access_token')
        response.delete_cookie('refresh_token')
        return response

    def blacklist_refresh_token(self, request):
        """Add the current refresh token to the blacklist, if present."""
        token = request.COOKIES.get('refresh_token')
        if token is None:
            return
        try:
            RefreshToken(token).blacklist()
        except TokenError:
            pass
