"""Admin configuration for managing quizzes and their questions."""
from django.contrib import admin

from .models import Question, Quiz


class QuestionInline(admin.TabularInline):
    """Edit a quiz's questions directly on the quiz page."""

    model = Question
    extra = 0


@admin.register(Quiz)
class QuizAdmin(admin.ModelAdmin):
    """Manage quizzes and edit their questions inline."""

    list_display = ['id', 'title', 'owner', 'created_at']
    list_filter = ['owner', 'created_at']
    search_fields = ['title', 'description']
    inlines = [QuestionInline]


@admin.register(Question)
class QuestionAdmin(admin.ModelAdmin):
    """Manage individual quiz questions."""

    list_display = ['id', 'question_title', 'quiz', 'answer']
    list_filter = ['quiz']
    search_fields = ['question_title']
