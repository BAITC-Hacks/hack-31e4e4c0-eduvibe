from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator

CARD_FIELDS = (
    "title",
    "context",
    "need",
    "users",
    "data_materials",
    "constraints",
    "expected_result",
    "success_criteria",
    "contact",
    "interaction_format",
)


class Card(BaseModel):
    title: str = Field(default="", max_length=200)
    context: str = Field(default="", max_length=5000)
    need: str = Field(default="", max_length=3000)
    users: str = Field(default="", max_length=2000)
    data_materials: str = Field(default="", max_length=3000)
    constraints: str = Field(default="", max_length=2000)
    expected_result: str = Field(default="", max_length=3000)
    success_criteria: str = Field(default="", max_length=3000)
    contact: str = Field(default="", max_length=500)
    interaction_format: str = Field(default="", max_length=1000)

    @field_validator("*", mode="before")
    @classmethod
    def strip_text(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value


class BreakdownItem(BaseModel):
    field: str
    label: str
    points: int
    max_points: int
    hint: str | None = None


class Readiness(BaseModel):
    total: int = Field(ge=0, le=100)
    level: Literal["draft", "working", "ready", "priority"]
    level_label: str
    breakdown: list[BreakdownItem]
    missing_information: list[str]
    suggestions: list[str]


class Question(BaseModel):
    id: str
    field: str
    text: str


class TaskCreate(BaseModel):
    description: str = Field(min_length=10, max_length=5000)
    topic: str = Field(min_length=2, max_length=120)

    @field_validator("description", "topic", mode="before")
    @classmethod
    def strip_required(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value


class Answer(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    question_id: str = Field(min_length=1, max_length=100)
    field: str
    text: str = Field(min_length=1, max_length=3000)

    @field_validator("field")
    @classmethod
    def valid_field(cls, value: str) -> str:
        if value not in CARD_FIELDS:
            raise ValueError("Неизвестное поле карточки")
        return value


class AnswersUpdate(BaseModel):
    answers: list[Answer] = Field(min_length=1, max_length=20)


class TaskPatch(BaseModel):
    card: Card
    topic: str | None = Field(default=None, min_length=2, max_length=120)
    description: str | None = Field(default=None, min_length=10, max_length=5000)
    model_config = ConfigDict(str_strip_whitespace=True)


class TaskResponse(BaseModel):
    id: str
    owner_id: str
    description: str
    topic: str
    card: Card
    questions: list[Question]
    answers: list[Answer]
    readiness: Readiness
    is_confirmed: bool
    is_published: bool
    ai_mode: str | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ClarificationsResponse(BaseModel):
    questions: list[Question] = Field(min_length=3)
    ai_mode: Literal["live", "fallback"]


class TeamResponse(BaseModel):
    id: str
    name: str
    interests: list[str]
    skills: list[str]
    technologies: list[str]
    progress_points: int

    model_config = ConfigDict(from_attributes=True)


class ProposalCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    idea: str = Field(min_length=10, max_length=4000)
    plan: str = Field(min_length=10, max_length=4000)
    duration_days: int = Field(ge=1, le=365)
    prototype_url: HttpUrl = Field(max_length=500)


class ProposalResponse(BaseModel):
    id: str
    task_title: str
    task_deleted: bool
    milestone_confirmed: bool
    task_id: str
    team_id: str
    team: TeamResponse
    idea: str
    plan: str
    duration_days: int
    prototype_url: str
    status: Literal["pending", "selected", "rejected"]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class DecisionUpdate(BaseModel):
    selected_proposal_ids: list[str] = Field(default_factory=list)
    rejected_proposal_ids: list[str] = Field(default_factory=list)


class MilestoneCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    result: str = Field(min_length=10, max_length=4000)
    points: int = Field(default=10, ge=1, le=100)


class MilestoneResponse(BaseModel):
    id: str
    proposal_id: str
    result: str
    points: int
    confirmed_at: datetime
    team_progress_points: int


class ErrorBody(BaseModel):
    code: str
    message: str
    details: list[dict[str, object]] = Field(default_factory=list)


class ErrorResponse(BaseModel):
    error: ErrorBody


class SessionCreate(BaseModel):
    role: Literal["business", "student"]
    profile_id: str = Field(min_length=1, max_length=36)
