import os

os.environ["DATABASE_URL"] = "sqlite:///./test_eduvibe.db"
os.environ["OPENAI_API_KEY"] = ""
os.environ["AI_FALLBACK_ENABLED"] = "true"

import pytest
from fastapi.testclient import TestClient

from app.db.base import Base
from app.db.session import SessionLocal, engine
from app.main import app
from app.models.entities import Team


@pytest.fixture(autouse=True)
def clean_database():
    Base.metadata.drop_all(bind=engine)
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
