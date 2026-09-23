from typing import Literal

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.db.session import get_db
from app.models.entities import Team
from app.schemas.api import (
    AnswersUpdate,
    ClarificationsResponse,
    DecisionUpdate,
    MilestoneCreate,
    MilestoneResponse,
    ProposalCreate,
    ProposalResponse,
    TaskCreate,
    TaskPatch,
    TaskResponse,
    TeamResponse,
)
from app.services.ai import AIServiceError, generate_clarifications
from app.services.tasks import (
    confirm_milestone,
    confirm_task,
    create_proposal,
    create_task,
    get_proposal,
    get_task,
    list_catalog,
    list_proposals,
    publish_task,
    save_answers,
    save_decision,
    update_card,
)

router = APIRouter(prefix="/api/v1")


@router.get("/health")
def health(db: Session = Depends(get_db)) -> dict[str, str]:
    db.execute(text("SELECT 1"))
    return {"status": "ok", "database": "ok"}


@router.post("/tasks", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
def post_task(payload: TaskCreate, db: Session = Depends(get_db)) -> TaskResponse:
    return TaskResponse.model_validate(create_task(db, payload))


@router.get("/tasks", response_model=list[TaskResponse])
def get_catalog(
    topic: str | None = Query(default=None, max_length=120),
    readiness_level: Literal["draft", "working", "ready", "priority"] | None = None,
    db: Session = Depends(get_db),
) -> list[TaskResponse]:
    return [TaskResponse.model_validate(task) for task in list_catalog(db, topic, readiness_level)]


@router.get("/tasks/{task_id}", response_model=TaskResponse)
def get_task_by_id(task_id: str, db: Session = Depends(get_db)) -> TaskResponse:
    return TaskResponse.model_validate(get_task(db, task_id))


@router.post("/tasks/{task_id}/clarifications", response_model=ClarificationsResponse)
def post_clarifications(task_id: str, db: Session = Depends(get_db)) -> ClarificationsResponse:
    task = get_task(db, task_id)
    try:
        questions, mode = generate_clarifications(task.description, task.topic, task.card)
    except AIServiceError as exc:
        raise AppError(exc.code, exc.message, exc.status_code) from exc
    task.questions = [question.model_dump() for question in questions]
    task.ai_mode = mode
    db.commit()
    return ClarificationsResponse(questions=questions, ai_mode=mode)


@router.put("/tasks/{task_id}/answers", response_model=TaskResponse)
def put_answers(task_id: str, payload: AnswersUpdate, db: Session = Depends(get_db)) -> TaskResponse:
    return TaskResponse.model_validate(save_answers(db, get_task(db, task_id), payload))


@router.patch("/tasks/{task_id}", response_model=TaskResponse)
def patch_task(task_id: str, payload: TaskPatch, db: Session = Depends(get_db)) -> TaskResponse:
    return TaskResponse.model_validate(update_card(db, get_task(db, task_id), payload.card))


@router.post("/tasks/{task_id}/confirm", response_model=TaskResponse)
def post_confirm(task_id: str, db: Session = Depends(get_db)) -> TaskResponse:
    return TaskResponse.model_validate(confirm_task(db, get_task(db, task_id)))


@router.post("/tasks/{task_id}/publish", response_model=TaskResponse)
def post_publish(task_id: str, db: Session = Depends(get_db)) -> TaskResponse:
    return TaskResponse.model_validate(publish_task(db, get_task(db, task_id)))


@router.get("/teams", response_model=list[TeamResponse])
def get_teams(db: Session = Depends(get_db)) -> list[TeamResponse]:
    return [TeamResponse.model_validate(team) for team in db.query(Team).order_by(Team.name).all()]


@router.post(
    "/tasks/{task_id}/proposals",
    response_model=ProposalResponse,
    status_code=status.HTTP_201_CREATED,
)
def post_proposal(
    task_id: str,
    payload: ProposalCreate,
    db: Session = Depends(get_db),
) -> ProposalResponse:
    return ProposalResponse.model_validate(create_proposal(db, get_task(db, task_id), payload))


@router.get("/tasks/{task_id}/proposals", response_model=list[ProposalResponse])
def get_task_proposals(task_id: str, db: Session = Depends(get_db)) -> list[ProposalResponse]:
    return [
        ProposalResponse.model_validate(proposal)
        for proposal in list_proposals(db, get_task(db, task_id))
    ]


@router.put("/tasks/{task_id}/decision", response_model=list[ProposalResponse])
def put_decision(
    task_id: str,
    payload: DecisionUpdate,
    db: Session = Depends(get_db),
) -> list[ProposalResponse]:
    return [
        ProposalResponse.model_validate(proposal)
        for proposal in save_decision(db, get_task(db, task_id), payload)
    ]


@router.put("/proposals/{proposal_id}/milestone", response_model=MilestoneResponse)
def put_milestone(
    proposal_id: str,
    payload: MilestoneCreate,
    db: Session = Depends(get_db),
) -> MilestoneResponse:
    proposal = get_proposal(db, proposal_id)
    milestone = confirm_milestone(db, proposal, payload)
    return MilestoneResponse(
        id=milestone.id,
        proposal_id=milestone.proposal_id,
        result=milestone.result,
        points=milestone.points,
        confirmed_at=milestone.confirmed_at,
        team_progress_points=proposal.team.progress_points,
    )
