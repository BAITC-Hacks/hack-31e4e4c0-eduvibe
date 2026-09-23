import hashlib
import secrets
from datetime import timedelta

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.db.session import get_db
from app.models.entities import Task, Team, UserSession, utc_now

BUSINESSES = {"business-demo": "Бизнес · Практика", "business-other": "Бизнес · Партнёр"}
bearer = HTTPBearer(auto_error=False)


class Actor(BaseModel):
    role: str
    profile_id: str
    name: str


def profile(role: str, profile_id: str, db: Session) -> Actor:
    if role == "business" and profile_id in BUSINESSES:
        return Actor(role=role, profile_id=profile_id, name=BUSINESSES[profile_id])
    team = db.get(Team, profile_id) if role == "student" else None
    if team:
        return Actor(role=role, profile_id=profile_id, name=team.name)
    raise AppError("PROFILE_NOT_FOUND", "Профиль не найден.", 404)


def start_session(role: str, profile_id: str, db: Session) -> dict:
    actor = profile(role, profile_id, db)
    token = secrets.token_urlsafe(32)
    db.add(UserSession(token_hash=hashlib.sha256(token.encode()).hexdigest(), role=role,
                       profile_id=profile_id, expires_at=utc_now() + timedelta(hours=12)))
    db.commit()
    return {"token": token, **actor.model_dump()}


def session_record(credentials: HTTPAuthorizationCredentials | None, db: Session) -> UserSession:
    if not credentials:
        raise AppError("UNAUTHORIZED", "Выберите роль и войдите в кабинет.", 401)
    record = db.get(UserSession, hashlib.sha256(credentials.credentials.encode()).hexdigest())
    if not record or record.expires_at <= utc_now():
        raise AppError("UNAUTHORIZED", "Сессия завершена. Войдите снова.", 401)
    return record


def current_actor(credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
                  db: Session = Depends(get_db)) -> Actor:
    record = session_record(credentials, db)
    return profile(record.role, record.profile_id, db)


def require_role(actor: Actor, role: str) -> None:
    if actor.role != role:
        raise AppError("FORBIDDEN", "Это действие недоступно вашей роли.", 403)


def require_owner(actor: Actor, task: Task) -> None:
    require_role(actor, "business")
    if task.owner_id != actor.profile_id:
        raise AppError("FORBIDDEN", "Действие доступно только владельцу кейса.", 403)
