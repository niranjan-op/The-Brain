"""Shared Gemini client. Auth from env: GEMINI_API_KEY, or GOOGLE_GENAI_USE_VERTEXAI=true + GOOGLE_CLOUD_PROJECT/LOCATION (ADC)."""
from functools import cache

from dotenv import load_dotenv
from google import genai


@cache
def client() -> genai.Client:
    load_dotenv()
    return genai.Client()

