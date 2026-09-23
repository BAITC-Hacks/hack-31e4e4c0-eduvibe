from sqlalchemy import select, update
from sqlalchemy.orm import Session, selectinload

from app.core.errors import AppError
from app.models.entities import Milestone, Proposal, Task, Team
from app.schemas.api import (
    AnswersUpdate,
    Card,
    DecisionUpdate,
    MilestoneCreate,
    ProposalCreate,
    TaskCreate,
)
from app.services.rating import calculate_readiness
from app.services.access import Actor, require_owner


def empty_card(topic: str, description: str) -> dict[str, str]:
    return Card(title=topic, context=description).model_dump()


def get_task(db: Session, task_id: str) -> Task:
    task = db.get(Task, task_id)
    if task is None or task.is_deleted:
        raise AppError("TASK_NOT_FOUND", "Задача не найдена.", 404)
    return task


def create_task(db: Session, payload: TaskCreate, owner_id: str) -> Task:
    card = empty_card(payload.topic, payload.description)
    task = Task(
        description=payload.description,
        owner_id=owner_id,
        topic=payload.topic,
        card=card,
        questions=[],
        answers=[],
        readiness=calculate_readiness(card),
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def save_answers(db: Session, task: Task, payload: AnswersUpdate) -> Task:
    known_questions = {item["id"]: item["field"] for item in task.questions}
    card = Card.model_validate(task.card).model_dump()
    answers = {item["question_id"]: item for item in task.answers}
    seen_fields: set[str] = set()

    for answer in payload.answers:
        expected_field = known_questions.get(answer.question_id)
        if expected_field is None or expected_field != answer.field:
            raise AppError(
                "INVALID_ANSWER",
                "Ответ не соответствует вопросу этой задачи.",
                422,
            )
        if answer.field in seen_fields:
            raise AppError("INVALID_ANSWER", "Передайте один ответ на каждое поле.", 422)
        seen_fields.add(answer.field)
        card[answer.field] = answer.text.strip()
        answers[answer.question_id] = answer.model_dump()

    from pydantic import ValidationError
    try:
        task.card = Card.model_validate(card).model_dump()
    except ValidationError as exc:
        raise AppError("INVALID_ANSWER", "Ответ слишком длинный для выбранного поля карточки.", 422) from exc
    task.answers = list(answers.values())
    task.readiness = calculate_readiness(card)
    task.is_confirmed = False
    db.commit()
    db.refresh(task)
    return task


def update_card(db: Session, task: Task, card: Card, topic: str | None = None,
                description: str | None = None) -> Task:
    task.card = card.model_dump()
    if topic is not None:
        task.topic = topic
    if description is not None:
        task.description = description
    task.readiness = calculate_readiness(card)
    task.is_confirmed = False
    db.commit()
    db.refresh(task)
    return task


def confirm_task(db: Session, task: Task) -> Task:
    if not task.card.get("title", "").strip():
        raise AppError("TITLE_REQUIRED", "Добавьте название кейса перед подтверждением.", 422)
    task.readiness = calculate_readiness(task.card)
    task.is_confirmed = True
    if task.is_published:
        task.published_snapshot = snapshot(task)
    db.commit()
    db.refresh(task)
    return task


def publish_task(db: Session, task: Task) -> Task:
    if not task.is_confirmed:
        raise AppError(
            "TASK_NOT_CONFIRMED",
            "Подтвердите текущую версию карточки перед публикацией.",
            409,
        )
    task.is_published = True
    task.published_snapshot = snapshot(task)
    db.commit()
    db.refresh(task)
    return task


def snapshot(task: Task) -> dict:
    return {"card": dict(task.card), "readiness": dict(task.readiness),
            "topic": task.topic, "description": task.description}


def public_task(task: Task) -> dict:
    return {"id": task.id, "owner_id": task.owner_id, **(task.published_snapshot or snapshot(task)),
            "questions": [], "answers": [], "ai_mode": None, "is_confirmed": True,
            "is_published": True, "created_at": task.created_at, "updated_at": task.updated_at}


def owned_task(db: Session, task_id: str, actor: Actor) -> Task:
    task = get_task(db, task_id)
    require_owner(actor, task)
    return task


def delete_task(db: Session, task: Task) -> None:
    task.is_deleted = True
    task.is_published = False
    db.commit()


def list_catalog(db: Session, topic: str | None, readiness_level: str | None) -> list[dict]:
    tasks = [public_task(task) for task in db.scalars(select(Task).where(
        Task.is_published.is_(True), Task.is_deleted.is_(False))).all()]
    if topic:
        normalized = topic.casefold()
        tasks = [task for task in tasks if normalized in task["topic"].casefold()]
    if readiness_level:
        tasks = [task for task in tasks if task["readiness"].get("level") == readiness_level]
    return sorted(tasks, key=lambda task: (task["readiness"].get("total", 0), task["id"]), reverse=True)


def create_proposal(db: Session, task: Task, payload: ProposalCreate, team_id: str) -> Proposal:
    if not task.is_published:
        raise AppError("TASK_NOT_PUBLISHED", "Отклик можно отправить только на опубликованную задачу.", 409)
    team = db.get(Team, team_id)
    if team is None:
        raise AppError("TEAM_NOT_FOUND", "Профиль команды не найден.", 404)
    proposal = Proposal(
        task_id=task.id,
        team_id=team.id,
        idea=payload.idea.strip(),
        plan=payload.plan.strip(),
        duration_days=payload.duration_days,
        prototype_url=str(payload.prototype_url),
    )
    db.add(proposal)
    db.commit()
    return get_proposal(db, proposal.id)


def get_proposal(db: Session, proposal_id: str) -> Proposal:
    proposal = db.scalar(
        select(Proposal)
        .options(selectinload(Proposal.team))
        .where(Proposal.id == proposal_id)
    )
    if proposal is None:
        raise AppError("PROPOSAL_NOT_FOUND", "Предложение не найдено.", 404)
    return proposal


def list_proposals(db: Session, task: Task) -> list[Proposal]:
    return list(
        db.scalars(
            select(Proposal)
            .options(selectinload(Proposal.team))
            .where(Proposal.task_id == task.id)
            .order_by(Proposal.created_at)
        ).all()
    )


def save_decision(db: Session, task: Task, payload: DecisionUpdate) -> list[Proposal]:
    selected = set(payload.selected_proposal_ids)
    rejected = set(payload.rejected_proposal_ids)
    if selected & rejected:
        raise AppError("INVALID_DECISION", "Один отклик нельзя одновременно выбрать и отклонить.", 422)

    proposals = list_proposals(db, task)
    known = {proposal.id for proposal in proposals}
    unknown = (selected | rejected) - known
    if unknown:
        raise AppError("INVALID_DECISION", "Решение содержит отклик от другой или несуществующей задачи.", 422)

    for proposal in proposals:
        if proposal.id in selected:
            proposal.status = "selected"
        elif proposal.id in rejected:
            proposal.status = "rejected"
        else:
            proposal.status = "pending"
    db.commit()
    return list_proposals(db, task)


def confirm_milestone(db: Session, proposal: Proposal, payload: MilestoneCreate) -> Milestone:
    db.scalar(select(Proposal).where(Proposal.id == proposal.id).with_for_update())
    if proposal.status != "selected":
        raise AppError("PROPOSAL_NOT_SELECTED", "Этап можно подтвердить только для выбранной команды.", 409)
    if proposal.milestone is not None:
        raise AppError("MILESTONE_ALREADY_CONFIRMED", "Этап уже подтверждён, повторное начисление запрещено.", 409)

    milestone = Milestone(
        proposal_id=proposal.id,
        result=payload.result.strip(),
        points=payload.points,
    )
    db.execute(update(Team).where(Team.id == proposal.team_id).values(
        progress_points=Team.progress_points + payload.points))
    db.add(milestone)
    db.commit()
    db.refresh(milestone)
    return milestone
