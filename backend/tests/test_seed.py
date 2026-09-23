from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import sessionmaker

from app import seed
from app.db.base import Base
from app.models.entities import Proposal, Task, Team


def test_demo_minimums_and_seed_idempotency(monkeypatch):
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    monkeypatch.setattr(seed, "SessionLocal", factory)
    seed.seed()
    seed.seed()
    with factory() as db:
        assert db.scalar(select(func.count()).select_from(Team)) == 5
        assert db.scalar(select(func.count()).select_from(Proposal)) == 5
        assert db.scalar(select(func.count()).select_from(Task).where(Task.is_published.is_(True))) == 5
        assert db.scalar(select(func.count()).select_from(Task).where(Task.is_published.is_(False))) == 5
        assert len({task.readiness["level"] for task in db.scalars(select(Task))}) >= 2
    engine.dispose()
