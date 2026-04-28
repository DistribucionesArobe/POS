"""Sesion de SQLAlchemy y dependencia get_db para FastAPI."""
from collections.abc import Generator
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker, Session

from app.config import get_settings

settings = get_settings()

engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)

SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """Base declarativa para todos los modelos."""
    pass


def get_db() -> Generator[Session, None, None]:
    """Dependencia FastAPI: yields a session and ensures it closes."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
