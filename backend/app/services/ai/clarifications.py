import json
import logging
import uuid
from typing import Any

from openai import APITimeoutError, OpenAI
from pydantic import BaseModel, Field, ValidationError

from app.core.config import settings
from app.schemas.api import CARD_FIELDS, Card, Question
from app.services.rating import SCORE_PARTS

logger = logging.getLogger(__name__)


class AIServiceError(RuntimeError):
    def __init__(self, code: str, message: str, status_code: int = 503) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


class AIQuestions(BaseModel):
    questions: list[Question] = Field(min_length=3, max_length=7)


SYSTEM_PROMPT = """Ты помогаешь представителю бизнеса уточнить практическую задачу для студентов.
Верни только JSON вида {"questions":[{"id":"q1","field":"...","text":"..."}]}.
Задай от 3 до 7 уместных вопросов. Если отсутствуют 3 или больше полей, спрашивай только о них.
Если пустых полей меньше трёх, уточни недостающие детали и проверяемость уже заполненных полей,
не повторяя сообщённые факты. Каждый вопрос должен относиться к отдельному полю, field не повторяется.
field должен быть одним из: title, context, need, users, data_materials, constraints,
expected_result, success_criteria, contact, interaction_format.
Не добавляй и не предполагай факты. Не повторяй уже известные сведения.
Формулируй вопросы на русском языке."""


def _fallback_questions(card: Card) -> list[Question]:
    prompts = {
        "title": "Как кратко назвать эту задачу?",
        "context": "Что происходит сейчас и почему текущая ситуация требует изменений?",
        "need": "Что именно бизнесу необходимо изменить или улучшить?",
        "users": "Кто будет пользоваться результатом решения?",
        "data_materials": "Какие данные, примеры или материалы доступны команде?",
        "constraints": "Какие сроки, технологии, доступы или другие ограничения нужно учесть?",
        "expected_result": "Какой конкретный результат должна передать студенческая команда?",
        "success_criteria": "По каким измеримым признакам вы примете результат?",
        "contact": "Кто будет контактным лицом со стороны бизнеса?",
        "interaction_format": "Как часто и в каком формате бизнес сможет консультировать команду?",
    }
    missing = [field for field in prompts if not getattr(card, field).strip()]
    if len(missing) < 3:
        missing.extend(field for field in prompts if field not in missing)
    return [
        Question(id=f"q-{uuid.uuid4().hex[:8]}", field=field, text=prompts[field])
        for field in missing[: max(3, min(7, len(missing)))]
    ]


def generate_clarifications(description: str, topic: str, card: dict[str, Any]) -> tuple[list[Question], str]:
    validated_card = Card.model_validate(card)
    if not settings.openai_api_key:
        if settings.ai_fallback_enabled:
            return _fallback_questions(validated_card), "fallback"
        raise AIServiceError("AI_KEY_MISSING", "Ключ OpenAI API не настроен.")

    client = OpenAI(api_key=settings.openai_api_key, timeout=settings.openai_timeout_seconds, max_retries=0)
    user_payload = {
        "topic": topic,
        "initial_description": description,
        "current_card": validated_card.model_dump(),
    }
    try:
        response = client.chat.completions.create(
            model=settings.openai_model,
            temperature=0.2,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": json.dumps(user_payload, ensure_ascii=False)},
            ],
        )
        content = response.choices[0].message.content or ""
        result = AIQuestions.model_validate_json(content)
        allowed_missing = {field for field, _, _, _ in SCORE_PARTS if not getattr(validated_card, field)}
        allowed_missing.update(
            field for field in ("title",) if not getattr(validated_card, field)
        )
        if len(allowed_missing) < 3:
            allowed_missing = set(CARD_FIELDS)
        filtered = [q for q in result.questions if q.field in allowed_missing]
        if len(filtered) < 3 or len({q.field for q in filtered}) != len(filtered):
            raise ValueError("Модель вернула меньше трёх вопросов по незаполненным полям")
        for question in filtered:
            if not question.text.strip() or len(question.text) > 1000:
                raise ValueError("Пустой или слишком длинный вопрос")
            question.id = f"q-{uuid.uuid4().hex[:12]}"
        return filtered, "live"
    except APITimeoutError as exc:
        if settings.ai_fallback_enabled:
            logger.warning("OpenAI timeout, используется локальный резервный режим")
            return _fallback_questions(validated_card), "fallback"
        raise AIServiceError("AI_TIMEOUT", "OpenAI не ответил вовремя.", 504) from exc
    except (ValidationError, ValueError, json.JSONDecodeError, IndexError) as exc:
        if settings.ai_fallback_enabled:
            logger.warning("AI_INVALID_RESPONSE: %s; используется резервный режим", type(exc).__name__)
            return _fallback_questions(validated_card), "fallback"
        raise AIServiceError("AI_INVALID_RESPONSE", "OpenAI вернул некорректный ответ.", 502) from exc
    except Exception as exc:
        if settings.ai_fallback_enabled:
            logger.warning("AI_UNAVAILABLE: %s, HTTP %s; используется резервный режим", type(exc).__name__, getattr(exc, "status_code", None))
            return _fallback_questions(validated_card), "fallback"
        raise AIServiceError("AI_UNAVAILABLE", "Сервис OpenAI временно недоступен.", 503) from exc
