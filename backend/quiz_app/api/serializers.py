"""Serializers for quizzes and their questions."""
from rest_framework import serializers

from ..models import Question, Quiz


class QuestionSerializer(serializers.ModelSerializer):
    """Read representation of a single quiz question."""

    class Meta:
        model = Question
        fields = [
            'id', 'question_title', 'question_options', 'answer',
            'created_at', 'updated_at',
        ]


class QuizSerializer(serializers.ModelSerializer):
    """Full quiz representation; only title and description are editable."""

    questions = QuestionSerializer(many=True, read_only=True)

    class Meta:
        model = Quiz
        fields = [
            'id', 'title', 'description', 'created_at', 'updated_at',
            'video_url', 'questions',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'video_url']


class QuizCreateSerializer(serializers.Serializer):
    """Validate the YouTube URL used to generate a new quiz."""

    url = serializers.URLField()
