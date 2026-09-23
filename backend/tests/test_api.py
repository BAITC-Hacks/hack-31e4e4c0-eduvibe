from app.db.session import SessionLocal
from app.models.entities import UserSession, utc_now
from datetime import timedelta


def login(client, role="business", profile_id="business-demo"):
    response = client.post("/api/v1/session", json={"role": role, "profile_id": profile_id})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['token']}"}


def create(client, headers):
    response = client.post("/api/v1/tasks", headers=headers, json={
        "topic": "Логистика", "description": "На складе теряются заявки на отгрузку из рабочих чатов."})
    assert response.status_code == 201, response.text
    return response.json()


def publish(client, headers, task):
    assert client.post(f"/api/v1/tasks/{task['id']}/confirm", headers=headers).status_code == 200
    response = client.post(f"/api/v1/tasks/{task['id']}/publish", headers=headers)
    assert response.status_code == 200
    return response.json()


def proposal_body():
    return {"idea": "Приватная идея команды: реестр отгрузок.",
            "plan": "Изучим примеры заявок, создадим прототип, проверим с заказчиком.",
            "duration_days": 14, "prototype_url": "https://example.test/prototype"}


def test_health(client):
    assert client.get("/api/v1/health").json() == {"status": "ok", "database": "ok"}


def test_invalid_input_and_unknown_profiles(client):
    owner = login(client)
    for data in ({"topic": "  ", "description": "              "},
                 {"topic": "x", "description": "short"},
                 {"topic": None, "description": 42}):
        response = client.post("/api/v1/tasks", headers=owner, json=data)
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "VALIDATION_ERROR"
    assert client.post("/api/v1/session", json={"role": "student", "profile_id": "absent"}).status_code == 404


def test_complete_role_flow(client):
    owner = login(client)
    student = login(client, "student", "team-test")
    task = create(client, owner)
    task_id = task["id"]
    assert task["owner_id"] == "business-demo"
    assert client.get("/api/v1/tasks/mine", headers=owner).json()[0]["id"] == task_id
    questions = client.post(f"/api/v1/tasks/{task_id}/clarifications", headers=owner).json()
    assert questions["ai_mode"] == "fallback"
    assert len(questions["questions"]) >= 3
    answers = {"answers": [{"question_id": q["id"], "field": q["field"],
                            "text": f"Согласованные сведения: {q['field']}"} for q in questions["questions"][:3]]}
    answered = client.put(f"/api/v1/tasks/{task_id}/answers", headers=owner, json=answers)
    assert answered.status_code == 200, answered.text
    assert answered.json()["readiness"]["total"] > task["readiness"]["total"]
    repeated = client.put(f"/api/v1/tasks/{task_id}/answers", headers=owner, json=answers).json()
    assert repeated["card"] == answered.json()["card"]
    assert client.post(f"/api/v1/tasks/{task_id}/clarifications", headers=owner).status_code == 200
    refreshed = client.get(f"/api/v1/tasks/{task_id}", headers=owner).json()
    assert refreshed["answers"] == []
    assert refreshed["card"] == repeated["card"]
    assert client.post(f"/api/v1/tasks/{task_id}/publish", headers=owner).status_code == 409
    publish(client, owner, repeated)
    catalog = client.get("/api/v1/tasks", headers=student).json()
    assert catalog[0]["questions"] == [] and catalog[0]["answers"] == []
    response = client.post(f"/api/v1/tasks/{task_id}/proposals", headers=student, json=proposal_body())
    assert response.status_code == 201, response.text
    p = response.json()
    assert p["team_id"] == "team-test"
    assert client.get("/api/v1/me/proposals", headers=student).json()[0]["id"] == p["id"]
    decision = client.put(f"/api/v1/tasks/{task_id}/decision", headers=owner,
                          json={"selected_proposal_ids": [p["id"]]})
    assert decision.status_code == 200
    assert decision.json()[0]["status"] == "selected"
    milestone = client.put(f"/api/v1/proposals/{p['id']}/milestone", headers=owner,
                          json={"result": "Работающий прототип показан бизнесу."})
    assert milestone.status_code == 200, milestone.text
    assert milestone.json()["team_progress_points"] == 10
    assert client.put(f"/api/v1/proposals/{p['id']}/milestone", headers=owner,
                      json={"result": "Повторное подтверждение результата"}).status_code == 409
    own = client.get("/api/v1/me/proposals", headers=student).json()[0]
    assert own["milestone_confirmed"] is True


def test_session_required_and_logout_revokes_token(client):
    assert client.get("/api/v1/tasks").status_code == 401
    assert client.post("/api/v1/tasks", json={"topic": "тест", "description": "Корректное описание"}).status_code == 401
    assert client.get("/api/v1/tasks", headers={"Authorization": "Bearer forged"}).status_code == 401
    owner = login(client)
    assert client.get("/api/v1/session", headers=owner).json()["role"] == "business"
    assert client.delete("/api/v1/session", headers=owner).status_code == 204
    assert client.get("/api/v1/tasks/mine", headers=owner).status_code == 401


def test_expired_session(client):
    owner = login(client)
    with SessionLocal() as db:
        for session in db.query(UserSession).all():
            session.expires_at = utc_now() - timedelta(seconds=1)
        db.commit()
    assert client.get("/api/v1/tasks/mine", headers=owner).status_code == 401


def test_student_cannot_manage_cases_or_call_ai(client):
    owner = login(client)
    student = login(client, "student", "team-test")
    task = create(client, owner)
    assert client.get(f"/api/v1/tasks/{task['id']}", headers=student).status_code == 404
    assert client.get("/api/v1/tasks/mine", headers=student).status_code == 403
    assert client.post("/api/v1/tasks", headers=student,
                       json={"topic": "тест", "description": "Корректное описание"}).status_code == 403
    for action in ("clarifications", "confirm", "publish"):
        assert client.post(f"/api/v1/tasks/{task['id']}/{action}", headers=student).status_code == 403
    assert client.patch(f"/api/v1/tasks/{task['id']}", headers=student, json={"card": task["card"]}).status_code == 403
    assert client.delete(f"/api/v1/tasks/{task['id']}", headers=student).status_code == 403


def test_proposals_private_to_owner_and_author(client):
    owner, other_business = login(client), login(client, "business", "business-other")
    student, other_student = login(client, "student", "team-test"), login(client, "student", "team-other")
    task = publish(client, owner, create(client, owner))
    path = f"/api/v1/tasks/{task['id']}"
    posted = client.post(path + "/proposals", headers=student, json=proposal_body())
    assert posted.status_code == 201
    for headers in (student, other_student, other_business):
        assert client.get(path + "/proposals", headers=headers).status_code == 403
        assert client.put(path + "/decision", headers=headers, json={}).status_code == 403
    assert client.get("/api/v1/me/proposals", headers=other_student).json() == []
    assert client.get("/api/v1/tasks/mine", headers=other_business).json() == []
    assert client.patch(path, headers=other_business, json={"card": task["card"]}).status_code == 403
    assert client.delete(path, headers=other_business).status_code == 403
    assert len(client.get(path + "/proposals", headers=owner).json()) == 1
    assert client.post(path + "/proposals", headers=owner, json=proposal_body()).status_code == 403
    assert client.post(path + "/proposals", headers=student,
                       json={**proposal_body(), "team_id": "team-other"}).status_code == 422
    assert client.post(path + "/proposals", headers=student,
                       json={**proposal_body(), "prototype_url": "https://example.test/" + "x" * 500}).status_code == 422


def test_published_edits_only_visible_after_confirmation(client):
    owner, student = login(client), login(client, "student", "team-test")
    task = publish(client, owner, create(client, owner))
    path = f"/api/v1/tasks/{task['id']}"
    changed = {**task["card"], "title": "Новая версия", "data_materials": "Приватный черновик новой версии"}
    edited = client.patch(path, headers=owner, json={"card": changed, "topic": "Новая тема"})
    assert edited.status_code == 200
    assert edited.json()["is_confirmed"] is False
    public = client.get(path, headers=student).json()
    assert public["card"] == task["card"]
    assert public["readiness"] == task["readiness"]
    assert client.get("/api/v1/tasks?topic=Новая", headers=student).json() == []
    assert client.get(path, headers=owner).json()["card"] == changed
    assert client.post(path + "/confirm", headers=owner).status_code == 200
    public = client.get(path, headers=student).json()
    assert public["card"] == changed
    assert public["readiness"]["total"] == task["readiness"]["total"] + 20
    assert len(client.get("/api/v1/tasks?topic=Новая", headers=student).json()) == 1


def test_deletion_removes_catalog_but_preserves_authors_history(client):
    owner, student = login(client), login(client, "student", "team-test")
    task = publish(client, owner, create(client, owner))
    path = f"/api/v1/tasks/{task['id']}"
    assert task["readiness"]["total"] < 40
    assert client.post(path + "/proposals", headers=student, json=proposal_body()).status_code == 201
    assert client.delete(path, headers=owner).status_code == 204
    assert client.get("/api/v1/tasks", headers=student).json() == []
    assert client.get("/api/v1/tasks/mine", headers=owner).json() == []
    assert client.get(path, headers=student).status_code == 404
    assert client.post(path + "/proposals", headers=student, json=proposal_body()).status_code == 404
    assert client.delete(path, headers=owner).status_code == 404
    history = client.get("/api/v1/me/proposals", headers=student).json()
    assert len(history) == 1 and history[0]["task_deleted"] is True


def test_multiple_and_no_selected_teams(client):
    owner = login(client)
    task = publish(client, owner, create(client, owner))
    path = f"/api/v1/tasks/{task['id']}"
    ids = [client.post(path + "/proposals", headers=login(client, "student", team),
                       json=proposal_body()).json()["id"] for team in ("team-test", "team-other")]
    selected = client.put(path + "/decision", headers=owner, json={"selected_proposal_ids": ids})
    assert all(p["status"] == "selected" for p in selected.json())
    rejected = client.put(path + "/decision", headers=owner, json={"rejected_proposal_ids": ids})
    assert all(p["status"] == "rejected" for p in rejected.json())
    assert client.put(path + "/decision", headers=owner,
                      json={"selected_proposal_ids": ids, "rejected_proposal_ids": ids}).status_code == 422


def test_large_and_empty_fields(client):
    owner = login(client)
    response = client.post("/api/v1/tasks", headers=owner, json={"topic": "тест", "description": "А" * 5000})
    assert response.status_code == 201
    task = response.json()
    assert client.patch(f"/api/v1/tasks/{task['id']}", headers=owner,
                        json={"card": {**task["card"], "title": ""}}).status_code == 200
    assert client.post(f"/api/v1/tasks/{task['id']}/confirm", headers=owner).status_code == 422
