from typing import Any

from app.schemas.api import Card

SCORE_PARTS = (
    ("context", "Контекст", 10, "Опишите текущее положение дел."),
    ("need", "Потребность", 10, "Укажите, что именно необходимо изменить."),
    ("data_materials", "Данные и материалы", 20, "Перечислите доступные данные, примеры или источники."),
    ("expected_result", "Ожидаемый результат", 15, "Опишите конкретный результат работы команды."),
    ("success_criteria", "Критерии успеха", 15, "Добавьте измеримые признаки успешного результата."),
    ("constraints", "Ограничения", 10, "Укажите сроки, технологии, доступы или другие границы."),
    ("users", "Пользователи", 10, "Опишите, для кого создаётся решение."),
    ("contact", "Контакт с бизнесом", 5, "Добавьте контакт представителя бизнеса."),
    ("interaction_format", "Формат взаимодействия", 5, "Опишите консультации и порядок обратной связи."),
)


def _filled(value: str) -> bool:
    return bool(value and value.strip())


def calculate_readiness(card_value: dict[str, Any] | Card) -> dict[str, Any]:
    card = card_value if isinstance(card_value, Card) else Card.model_validate(card_value)
    breakdown: list[dict[str, Any]] = []
    missing: list[str] = []
    suggestions: list[str] = []
    total = 0

    for field, label, max_points, hint in SCORE_PARTS:
        has_value = _filled(getattr(card, field))
        points = max_points if has_value else 0
        total += points
        breakdown.append(
            {
                "field": field,
                "label": label,
                "points": points,
                "max_points": max_points,
                "hint": None if has_value else hint,
            }
        )
        if not has_value:
            missing.append(label)
            suggestions.append(hint)

    if total <= 39:
        level, label = "draft", "Черновик"
    elif total <= 69:
        level, label = "working", "Рабочая"
    elif total <= 89:
        level, label = "ready", "Готовая"
    else:
        level, label = "priority", "Приоритетная"

    return {
        "total": total,
        "level": level,
        "level_label": label,
        "breakdown": breakdown,
        "missing_information": missing,
        "suggestions": suggestions,
    }
