from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from src.kc.core.config import settings

# Alembic uses the sync psycopg URL; the app uses asyncpg (psycopg async breaks on Windows' default event loop).
engine = create_async_engine(
    settings.database_url.replace("+psycopg", "+asyncpg"),
    pool_pre_ping=True,
    pool_size=settings.db_pool_size,
    max_overflow=settings.db_max_overflow,
)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def get_session():
    async with SessionLocal() as session:
        yield session
