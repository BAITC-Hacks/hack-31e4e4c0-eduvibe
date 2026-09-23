import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app import seed
from app.db.base import Base
from app.models.entities import Proposal, Task, Team
from app.schemas.api import Card, ProposalCreate, Readiness, TaskCreate


# Поля ТЗ и согласованные веса: неизвестные сведения могут быть пустыми, но ключи обязательны.
RATING_WEIGHTS = {
    "context": 10, "need": 10, "users": 10, "data_materials": 20,
    "constraints": 10, "expected_result": 15, "success_criteria": 15,
    "contact": 5, "interaction_format": 5,
}
CARD_KEYS = {"title", *RATING_WEIGHTS}


@pytest.fixture
def seed_database(monkeypatch):
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    monkeypatch.setattr(seed, "SessionLocal", factory)
    try:
        yield factory
    finally:
        engine.dispose()


def test_five_drafts_have_text_industry_and_different_completeness(seed_database):
    seed.seed()
    with seed_database() as db:
        drafts = list(db.scalars(select(Task).where(Task.is_published.is_(False))))
        assert len(drafts) == 5
        assert len({task.description for task in drafts}) == 5
        assert len({sum(bool(value.strip()) for value in task.card.values()) for task in drafts}) > 1
        for task in drafts:
            # В согласованном API отрасль/направление хранится в topic.
            TaskCreate.model_validate({"topic": task.topic, "description": task.description})
            assert not task.is_confirmed and not task.is_deleted
            assert task.published_snapshot is None


def test_five_cards_have_all_fields_and_correct_current_rating(seed_database):
    seed.seed()
    with seed_database() as db:
        cards = list(db.scalars(select(Task).where(Task.is_published.is_(True))))
        assert len(cards) == 5
        for task in cards:
            assert set(task.card) == CARD_KEYS
            Card.model_validate(task.card)
            assert task.card["title"].strip()
            rating = Readiness.model_validate(task.readiness)
            expected = {field: weight if task.card[field].strip() else 0 for field, weight in RATING_WEIGHTS.items()}
            assert rating.total == sum(expected.values())
            assert len(rating.breakdown) == len(RATING_WEIGHTS)
            assert {part.field: part.points for part in rating.breakdown} == expected
            assert {part.field: part.max_points for part in rating.breakdown} == RATING_WEIGHTS
            missing = [part.label for part in rating.breakdown if part.points == 0]
            assert rating.missing_information == missing
            assert len(rating.suggestions) == len(missing)
            level = "draft" if rating.total < 40 else "working" if rating.total < 70 else "ready" if rating.total < 90 else "priority"
            assert rating.level == level
            assert task.is_confirmed and not task.is_deleted
            assert task.published_snapshot == {
                "card": task.card, "readiness": task.readiness,
                "topic": task.topic, "description": task.description,
            }


def test_five_team_profiles_have_all_required_information(seed_database):
    seed.seed()
    with seed_database() as db:
        teams = list(db.scalars(select(Team)))
        assert len(teams) == len({team.name for team in teams}) == 5
        for team in teams:
            assert team.name.strip()
            for values in (team.interests, team.skills, team.technologies):
                assert isinstance(values, list) and values
                assert all(isinstance(value, str) and value.strip() for value in values)


def test_five_proposals_have_valid_fields_and_existing_team_and_card(seed_database):
    seed.seed()
    with seed_database() as db:
        proposals = list(db.scalars(select(Proposal)))
        assert len(proposals) == 5
        for proposal in proposals:
            ProposalCreate.model_validate({field: getattr(proposal, field) for field in (
                "idea", "plan", "duration_days", "prototype_url",
            )})
            assert db.get(Team, proposal.team_id) is not None
            task = db.get(Task, proposal.task_id)
            assert task is not None and task.is_published and task.is_confirmed
            assert not task.is_deleted
            assert proposal.status == "pending"


def test_repeat_seed_preserves_ids_edits_and_deleted_drafts(seed_database):
    seed.seed()
    with seed_database() as db:
        before = {model: set(db.scalars(select(model.id))) for model in (Task, Team, Proposal)}
        db.get(Task, "demo-draft-1").description = "Изменённое пользователем описание задачи."
        db.get(Task, "demo-draft-2").is_deleted = True
        db.commit()
    seed.seed()
    with seed_database() as db:
        assert {model: set(db.scalars(select(model.id))) for model in before} == before
        assert db.get(Task, "demo-draft-1").description == "Изменённое пользователем описание задачи."
        assert db.get(Task, "demo-draft-2").is_deleted


def test_seed_with_one_existing_team_finishes_without_overwriting_it(seed_database):
    with seed_database() as db:
        db.add(Team(id="existing-team", name="Data Sparks", interests=["дизайн"],
                    skills=["исследования"], technologies=["TypeScript"], progress_points=15))
        db.commit()
    seed.seed()
    seed.seed()
    with seed_database() as db:
        assert len(list(db.scalars(select(Team)))) == 5
        assert len(list(db.scalars(select(Task)))) == 10
        assert len(list(db.scalars(select(Proposal)))) == 5
        team = db.get(Team, "existing-team")
        assert team.name == "Data Sparks" and team.progress_points == 15
        assert (team.interests, team.skills, team.technologies) == (["дизайн"], ["исследования"], ["TypeScript"])
