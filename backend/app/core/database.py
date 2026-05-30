from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import text

from app.core.config import settings


def _async_url(url: str) -> str:
    return url.replace("postgresql://", "postgresql+asyncpg://", 1)


engine = create_async_engine(_async_url(settings.DATABASE_URL), echo=settings.DEBUG)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def init_db():
    async with engine.begin() as conn:
        # pgvector extension (always enabled — used for local vector store)
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        from app.models import document, user  # noqa: F401
        await conn.run_sync(Base.metadata.create_all)


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
