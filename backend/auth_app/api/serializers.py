"""Serializers for registration and login."""
from django.contrib.auth.models import User
from rest_framework import serializers


class RegistrationSerializer(serializers.ModelSerializer):
    """Validate the registration form and create a new user."""

    confirmed_password = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ['username', 'email', 'password', 'confirmed_password']
        extra_kwargs = {'password': {'write_only': True}}

    def validate_email(self, value):
        """Reject e-mail addresses that are already registered."""
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError('This email is already in use.')
        return value

    def validate(self, data):
        """Ensure both password fields match."""
        if data['password'] != data['confirmed_password']:
            raise serializers.ValidationError(
                {'password': 'The passwords do not match.'}
            )
        return data

    def create(self, validated_data):
        """Create the user with a securely hashed password."""
        account = User(
            username=validated_data['username'],
            email=validated_data['email'],
        )
        account.set_password(validated_data['password'])
        account.save()
        return account


class LoginSerializer(serializers.Serializer):
    """Validate login credentials (username + password)."""

    username = serializers.CharField()
    password = serializers.CharField(write_only=True)
