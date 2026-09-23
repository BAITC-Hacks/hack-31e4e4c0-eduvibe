import os

os.environ["DATABASE_URL"] = "sqlite://"
os.environ["OPENAI_API_KEY"] = ""
os.environ["AI_FALLBACK_ENABLED"] = "true"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.db import session as db_session

# Только память процесса: этот engine физически не может подключиться к рабочей MySQL.
engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
db_session.engine = engine
db_session.SessionLocal = SessionLocal

from app.main import app
from app.models.entities import Team


@pytest.fixture(autouse=True)
def clean_database():
    assert engine.url.get_backend_name() == "sqlite" and engine.url.database is None
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        db.add(
            Team(
                id="team-test",
                name="Тестовая команда",
                interests=["образование"],
                skills=["frontend", "backend"],
                technologies=["React", "FastAPI"],
            )
        )
        db.add(Team(id="team-other", name="Другая команда", interests=[], skills=[], technologies=[]))
        db.commit()
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client
