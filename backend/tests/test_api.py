def test_health(client):
    response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok"}


def test_invalid_task_has_unified_error(client):
    response = client.post("/api/v1/tasks", json={"description": "коротко", "topic": ""})

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_full_business_flow(client):
    created = client.post(
        "/api/v1/tasks",
        json={
            "topic": "Образование",
            "description": "Студентам сложно находить практические бизнес-задачи.",
        },
    )
    assert created.status_code == 201
    task = created.json()
    task_id = task["id"]
    assert task["readiness"]["total"] == 10

    clarification = client.post(f"/api/v1/tasks/{task_id}/clarifications")
    assert clarification.status_code == 200
    question_data = clarification.json()
    assert question_data["ai_mode"] == "fallback"
    assert len(question_data["questions"]) >= 3

    first_three = question_data["questions"][:3]
    answered = client.put(
        f"/api/v1/tasks/{task_id}/answers",
        json={
            "answers": [
                {
                    "question_id": question["id"],
                    "field": question["field"],
                    "text": f"Проверяемый ответ для поля {question['field']}.",
                }
                for question in first_three
            ]
        },
    )
    assert answered.status_code == 200
    assert answered.json()["readiness"]["total"] > task["readiness"]["total"]

    card = answered.json()["card"]
    card.update(
        {
            "title": "Каталог практических задач",
            "context": "Студентам сложно находить задачи от бизнеса.",
            "need": "Собрать задачи в открытом каталоге.",
            "users": "Студенческие команды и представители бизнеса.",
            "data_materials": "Есть пять синтетических карточек.",
            "constraints": "Прототип за пять часов.",
            "expected_result": "Работающее веб-приложение.",
            "success_criteria": "Сценарий проходится менее чем за пять минут.",
            "contact": "business@example.test",
            "interaction_format": "Еженедельная видеовстреча.",
        }
    )
    edited = client.patch(f"/api/v1/tasks/{task_id}", json={"card": card})
    assert edited.status_code == 200
    assert edited.json()["readiness"]["total"] == 100
    assert edited.json()["is_confirmed"] is False

    premature_publish = client.post(f"/api/v1/tasks/{task_id}/publish")
    assert premature_publish.status_code == 409

    assert client.post(f"/api/v1/tasks/{task_id}/confirm").status_code == 200
    published = client.post(f"/api/v1/tasks/{task_id}/publish")
    assert published.status_code == 200
    assert published.json()["is_published"] is True

    catalog = client.get("/api/v1/tasks", params={"topic": "образ", "readiness_level": "priority"})
    assert catalog.status_code == 200
    assert [item["id"] for item in catalog.json()] == [task_id]

    proposal = client.post(
        f"/api/v1/tasks/{task_id}/proposals",
        json={
            "team_id": "team-test",
            "idea": "Соберём простой каталог с понятной оценкой.",
            "plan": "Согласуем поля, создадим интерфейс и проверим сценарий.",
            "duration_days": 14,
            "prototype_url": "https://example.test/prototype",
        },
    )
    assert proposal.status_code == 201
    proposal_id = proposal.json()["id"]

    decision = client.put(
        f"/api/v1/tasks/{task_id}/decision",
        json={"selected_proposal_ids": [proposal_id], "rejected_proposal_ids": []},
    )
    assert decision.status_code == 200
    assert decision.json()[0]["status"] == "selected"

    milestone = client.put(
        f"/api/v1/proposals/{proposal_id}/milestone",
        json={"result": "Команда показала работающий прототип.", "points": 10},
    )
    assert milestone.status_code == 200
    assert milestone.json()["team_progress_points"] == 10

    duplicate = client.put(
        f"/api/v1/proposals/{proposal_id}/milestone",
        json={"result": "Повторное подтверждение того же этапа.", "points": 10},
    )
    assert duplicate.status_code == 409
