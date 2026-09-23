from typing import Literal

from fastapi import APIRouter, Depends, Query, Response
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.db.session import get_db
from app.models.entities import Proposal, Task, Team
from app.schemas.api import (
    AnswersUpdate, ClarificationsResponse, DecisionUpdate, MilestoneCreate,
    MilestoneResponse, ProposalCreate, ProposalResponse, SessionCreate, TaskCreate,
    TaskPatch, TaskResponse, TeamResponse,
)
from app.services.access import (
    Actor, BUSINESSES, bearer, current_actor, require_role, session_record, start_session,
)
from app.services.ai import AIServiceError, generate_clarifications
from app.services.tasks import (
    confirm_milestone, confirm_task, create_proposal, create_task, delete_task,
    get_proposal, get_task, list_catalog, list_proposals, owned_task, public_task,
    publish_task, save_answers, save_decision, update_card,
)

router = APIRouter(prefix="/api/v1")


@router.get("/health")
def health(db: Session = Depends(get_db)) -> dict[str, str]:
    db.execute(text("SELECT 1"))
    return {"status": "ok", "database": "ok"}


@router.get("/demo/profiles")
def demo_profiles(db: Session = Depends(get_db)) -> dict:
    return {"businesses": [{"id": key, "name": name} for key, name in BUSINESSES.items()],
            "teams": [TeamResponse.model_validate(team) for team in db.scalars(select(Team).order_by(Team.name))]}


@router.post("/session")
def login(payload: SessionCreate, db: Session = Depends(get_db)) -> dict:
    return start_session(payload.role, payload.profile_id, db)


@router.get("/session", response_model=Actor)
def whoami(actor: Actor = Depends(current_actor)) -> Actor:
    return actor


@router.delete("/session", status_code=204)
def logout(credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
           db: Session = Depends(get_db)) -> Response:
    db.delete(session_record(credentials, db))
    db.commit()
    return Response(status_code=204)


@router.post("/tasks", response_model=TaskResponse, status_code=201)
def post_task(payload: TaskCreate, db: Session = Depends(get_db),
              actor: Actor = Depends(current_actor)) -> Task:
    require_role(actor, "business")
    return create_task(db, payload, actor.profile_id)


@router.get("/tasks", response_model=list[TaskResponse])
def get_catalog(topic: str | None = Query(default=None, max_length=120),
                readiness_level: Literal["draft", "working", "ready", "priority"] | None = None,
                db: Session = Depends(get_db), actor: Actor = Depends(current_actor)) -> list[dict]:
    return list_catalog(db, topic, readiness_level)


@router.get("/tasks/mine", response_model=list[TaskResponse])
def my_tasks(db: Session = Depends(get_db), actor: Actor = Depends(current_actor)) -> list[Task]:
    require_role(actor, "business")
    return list(db.scalars(select(Task).where(Task.owner_id == actor.profile_id,
                     Task.is_deleted.is_(False)).order_by(Task.updated_at.desc())))


@router.get("/tasks/{task_id}", response_model=TaskResponse)
def get_task_by_id(task_id: str, db: Session = Depends(get_db),
                   actor: Actor = Depends(current_actor)) -> Task | dict:
    task = get_task(db, task_id)
    if actor.role == "business" and task.owner_id == actor.profile_id:
        return task
    if not task.is_published:
        raise AppError("TASK_NOT_FOUND", "Задача не найдена.", 404)
    return public_task(task)


@router.delete("/tasks/{task_id}", status_code=204)
def remove_task(task_id: str, db: Session = Depends(get_db), actor: Actor = Depends(current_actor)) -> Response:
    delete_task(db, owned_task(db, task_id, actor))
    return Response(status_code=204)


@router.post("/tasks/{task_id}/clarifications", response_model=ClarificationsResponse)
def post_clarifications(task_id: str, db: Session = Depends(get_db),
                        actor: Actor = Depends(current_actor)) -> ClarificationsResponse:
    task = owned_task(db, task_id, actor)
    try:
        questions, mode = generate_clarifications(task.description, task.topic, task.card)
    except AIServiceError as exc:
        raise AppError(exc.code, exc.message, exc.status_code) from exc
    task.questions = [question.model_dump() for question in questions]
    task.answers = []
    task.ai_mode = mode
    db.commit()
    return ClarificationsResponse(questions=questions, ai_mode=mode)


@router.put("/tasks/{task_id}/answers", response_model=TaskResponse)
def put_answers(task_id: str, payload: AnswersUpdate, db: Session = Depends(get_db),
                actor: Actor = Depends(current_actor)) -> Task:
    return save_answers(db, owned_task(db, task_id, actor), payload)


@router.patch("/tasks/{task_id}", response_model=TaskResponse)
def patch_task(task_id: str, payload: TaskPatch, db: Session = Depends(get_db),
               actor: Actor = Depends(current_actor)) -> Task:
    return update_card(db, owned_task(db, task_id, actor), payload.card, payload.topic, payload.description)


@router.post("/tasks/{task_id}/confirm", response_model=TaskResponse)
def post_confirm(task_id: str, db: Session = Depends(get_db), actor: Actor = Depends(current_actor)) -> Task:
    return confirm_task(db, owned_task(db, task_id, actor))


@router.post("/tasks/{task_id}/publish", response_model=TaskResponse)
def post_publish(task_id: str, db: Session = Depends(get_db), actor: Actor = Depends(current_actor)) -> Task:
    return publish_task(db, owned_task(db, task_id, actor))


@router.get("/teams", response_model=list[TeamResponse])
def get_teams(db: Session = Depends(get_db), actor: Actor = Depends(current_actor)) -> list[Team]:
    return list(db.scalars(select(Team).order_by(Team.name)))


@router.post("/tasks/{task_id}/proposals", response_model=ProposalResponse, status_code=201)
def post_proposal(task_id: str, payload: ProposalCreate, db: Session = Depends(get_db),
                  actor: Actor = Depends(current_actor)) -> Proposal:
    require_role(actor, "student")
    return create_proposal(db, get_task(db, task_id), payload, actor.profile_id)


@router.get("/me/proposals", response_model=list[ProposalResponse])
def my_proposals(db: Session = Depends(get_db), actor: Actor = Depends(current_actor)) -> list[Proposal]:
    require_role(actor, "student")
    return list(db.scalars(select(Proposal).where(Proposal.team_id == actor.profile_id)
                           .order_by(Proposal.created_at.desc())))


@router.get("/tasks/{task_id}/proposals", response_model=list[ProposalResponse])
def get_task_proposals(task_id: str, db: Session = Depends(get_db),
                       actor: Actor = Depends(current_actor)) -> list[Proposal]:
    return list_proposals(db, owned_task(db, task_id, actor))


@router.put("/tasks/{task_id}/decision", response_model=list[ProposalResponse])
def put_decision(task_id: str, payload: DecisionUpdate, db: Session = Depends(get_db),
                 actor: Actor = Depends(current_actor)) -> list[Proposal]:
    return save_decision(db, owned_task(db, task_id, actor), payload)


@router.put("/proposals/{proposal_id}/milestone", response_model=MilestoneResponse)
def put_milestone(proposal_id: str, payload: MilestoneCreate, db: Session = Depends(get_db),
                  actor: Actor = Depends(current_actor)) -> MilestoneResponse:
    proposal = get_proposal(db, proposal_id)
    owned_task(db, proposal.task_id, actor)
    milestone = confirm_milestone(db, proposal, payload)
    db.refresh(proposal.team)
    return MilestoneResponse(id=milestone.id, proposal_id=proposal.id, result=milestone.result,
                             points=milestone.points, confirmed_at=milestone.confirmed_at,
                             team_progress_points=proposal.team.progress_points)
