import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")


@dataclass
class Settings:
    port: int = field(default_factory=lambda: int(os.environ.get("PORT", "8010")))
    auth_token: str = field(default_factory=lambda: os.environ.get("AI_SERVICE_AUTH_TOKEN", ""))
    github_token: str = field(default_factory=lambda: os.environ.get("GITHUB_TOKEN", ""))
    openrouter_api_key: str = field(default_factory=lambda: os.environ.get("OPENROUTER_API_KEY", ""))
    openrouter_model: str = field(default_factory=lambda: os.environ.get("OPENROUTER_MODEL", "nvidia/nemotron-3-ultra-550b-a55b:free"))
    default_model: str = field(default_factory=lambda: os.environ.get("DEFAULT_MODEL", "nvidia/nemotron-3-ultra-550b-a55b:free"))


settings = Settings()
