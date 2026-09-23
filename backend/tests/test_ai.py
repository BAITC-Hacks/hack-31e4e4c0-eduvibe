import json
from types import SimpleNamespace

import httpx
import pytest
from openai import APITimeoutError, AuthenticationError

from app.schemas.api import Card
from app.services.ai import clarifications as ai


def model_reply(monkeypatch, payload=None, error=None):
    monkeypatch.setattr(ai.settings, "openai_api_key", "test-only-key")
    monkeypatch.setattr(ai.settings, "ai_fallback_enabled", True)

    def create(**kwargs):
        if error:
            raise error
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=payload))])

    monkeypatch.setattr(ai, "OpenAI", lambda **kwargs: SimpleNamespace(
        chat=SimpleNamespace(completions=SimpleNamespace(create=create))))


def questions(fields):
    return json.dumps({"questions": [
        {"id": "model-id", "field": field, "text": f"Уточните сведения: {field}?"}
        for field in fields
    ]})


def test_live_questions_have_unique_server_ids(monkeypatch):
    model_reply(monkeypatch, questions(["need", "users", "constraints"]))
    result, mode = ai.generate_clarifications("Задача для студентов", "Тема", Card().model_dump())
    assert mode == "live" and len(result) == 3
    assert len({item.id for item in result}) == 3


def test_complete_card_can_receive_followup_questions(monkeypatch):
    model_reply(monkeypatch, questions(["need", "users", "constraints"]))
    card = Card(**{field: "Подтверждённые сведения" for field in Card.model_fields}).model_dump()
    _, mode = ai.generate_clarifications("Уточнение полного ТЗ", "Тема", card)
    assert mode == "live"


@pytest.mark.parametrize("payload", [
    "invalid json",
    questions(["need", "need", "need"]),
    questions(["made_up", "users", "need"]),
    '{"questions":[]}',
])
def test_invalid_ai_response_is_explicit_fallback(monkeypatch, payload):
    model_reply(monkeypatch, payload)
    result, mode = ai.generate_clarifications("Задача для студентов", "Тема", Card().model_dump())
    assert mode == "fallback" and len(result) >= 3
    monkeypatch.setattr(ai.settings, "ai_fallback_enabled", False)
    with pytest.raises(ai.AIServiceError) as error:
        ai.generate_clarifications("Задача для студентов", "Тема", Card().model_dump())
    assert error.value.code == "AI_INVALID_RESPONSE"


@pytest.mark.parametrize("kind", ["timeout", "auth"])
def test_api_failure_is_controlled_and_does_not_log_secret(monkeypatch, caplog, kind):
    request = httpx.Request("POST", "https://api.openai.com/v1/chat/completions")
    error = APITimeoutError(request=request) if kind == "timeout" else AuthenticationError(
        "secret-marker", response=httpx.Response(401, request=request), body=None)
    model_reply(monkeypatch, error=error)
    _, mode = ai.generate_clarifications("Задача для студентов", "Тема", Card().model_dump())
    assert mode == "fallback" and "secret-marker" not in caplog.text
    monkeypatch.setattr(ai.settings, "ai_fallback_enabled", False)
    with pytest.raises(ai.AIServiceError) as caught:
        ai.generate_clarifications("Задача для студентов", "Тема", Card().model_dump())
    assert caught.value.status_code == (504 if kind == "timeout" else 503)


def test_missing_key_with_fallback_disabled(monkeypatch):
    monkeypatch.setattr(ai.settings, "openai_api_key", "")
    monkeypatch.setattr(ai.settings, "ai_fallback_enabled", False)
    with pytest.raises(ai.AIServiceError) as error:
        ai.generate_clarifications("Задача для студентов", "Тема", Card().model_dump())
    assert error.value.code == "AI_KEY_MISSING"
