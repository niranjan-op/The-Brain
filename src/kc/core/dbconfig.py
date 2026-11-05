from pydantic_settings import BaseSettings, SettingsConfigDict


class DbSettings(BaseSettings):
    """Just the database URL, so Alembic doesn't need firebase/S3 vars. Re-exported by core/config.py."""
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # One URL for every host. Cloud SQL: postgresql+psycopg://u:p@/db?host=/cloudsql/<project:region:instance>
    # (password URL-encoded). The socket path lives in deploy env only, never in code.
    database_url: str
