"""Quiz endpoints: list, create (via AI pipeline), retrieve, update, delete."""
from rest_framework import generics
from rest_framework.response import Response

from ..models import Quiz
from .serializers import QuizCreateSerializer, QuizSerializer
from .services import create_quiz_from_url


class QuizListCreateView(generics.ListCreateAPIView):
    """List the user's quizzes or generate a new one from a YouTube URL."""

    serializer_class = QuizSerializer

    def get_queryset(self):
        """Restrict quizzes to the authenticated owner."""
        return Quiz.objects.filter(owner=self.request.user)

    def create(self, request, *args, **kwargs):
        """Generate a quiz from the submitted URL and return it."""
        serializer = QuizCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        quiz = create_quiz_from_url(request.user, serializer.validated_data['url'])
        return Response(QuizSerializer(quiz).data, status=201)


class QuizDetailView(generics.RetrieveUpdateDestroyAPIView):
    """Retrieve, partially update (title/description) or delete a quiz."""

    serializer_class = QuizSerializer

    def get_queryset(self):
        """Restrict access to quizzes owned by the authenticated user."""
        return Quiz.objects.filter(owner=self.request.user)
