from sqlalchemy import func, select

from app.db.session import SessionLocal
from app.models.entities import Proposal, Task, Team
from app.schemas.api import Card
from app.services.rating import calculate_readiness

TEAMS = [
    ("Data Sparks", ["аналитика", "образование"], ["анализ данных", "UX"], ["Python", "React"]),
    ("Green Code", ["экология", "город"], ["backend", "карты"], ["FastAPI", "PostgreSQL"]),
    ("Mediators", ["здоровье", "доступность"], ["исследования", "frontend"], ["TypeScript", "Figma"]),
    ("Nomad AI", ["AI", "бизнес"], ["LLM", "интеграции"], ["Python", "OpenAI"]),
    ("Qadam", ["образование", "карьера"], ["продукт", "mobile"], ["React", "Flutter"]),
]

TASKS = [
    {
        "topic": "Образование",
        "description": "Нужно помочь первокурсникам быстрее адаптироваться.",
        "card": Card(
            title="Адаптация первокурсников",
            context="Первокурсники теряются в первые недели обучения.",
            need="Снизить число повторяющихся вопросов к кураторам.",
        ),
    },
    {
        "topic": "Экология",
        "description": "Нужен сервис для учёта заявок на вывоз вторсырья.",
        "card": Card(
            title="Учёт заявок на вторсырьё",
            context="Заявки сейчас поступают в разных мессенджерах.",
            need="Собрать заявки в одном интерфейсе.",
            users="Координаторы и жители города.",
            expected_result="Работающий веб-прототип реестра заявок.",
        ),
    },
    {
        "topic": "Здравоохранение",
        "description": "Хотим сделать расписание волонтёрских консультаций.",
        "card": Card(
            title="Расписание консультаций",
            context="Запись ведётся вручную в таблице.",
            need="Автоматизировать запись на свободное время.",
            users="Волонтёры и посетители.",
            data_materials="Есть обезличенный пример расписания за месяц.",
            constraints="Не хранить медицинские данные; срок — 4 недели.",
            expected_result="Веб-прототип записи.",
            success_criteria="Пользователь записывается не более чем за 2 минуты.",
        ),
    },
    {
        "topic": "Ритейл",
        "description": "Нужна панель для анализа обратной связи покупателей.",
        "card": Card(
            title="Анализ обратной связи",
            context="Отзывы вручную сводятся раз в месяц.",
            need="Быстро видеть повторяющиеся темы отзывов.",
            users="Менеджер клиентского сервиса.",
            data_materials="Обезличенная CSV-выгрузка из 500 отзывов.",
            constraints="Прототип за 3 недели, без персональных данных.",
            expected_result="Панель с категориями и динамикой обращений.",
            success_criteria="Не менее 80% тестовых отзывов отнесены к согласованным категориям.",
            contact="Айжан, менеджер клиентского сервиса.",
        ),
    },
    {
        "topic": "Карьера",
        "description": "Нужен инструмент подготовки студентов к собеседованиям.",
        "card": Card(
            title="Тренажёр собеседований",
            context="Студентам не хватает практики перед первым техническим интервью.",
            need="Дать возможность проходить короткие тренировочные интервью.",
            users="Студенты выпускных курсов.",
            data_materials="Есть 60 вопросов и критерии обратной связи от карьерного центра.",
            constraints="Веб-прототип за 4 недели, русский и казахский интерфейс.",
            expected_result="Интерактивный тренажёр с итоговой обратной связью.",
            success_criteria="Студент проходит сессию за 15 минут и получает объяснение по каждому ответу.",
            contact="Карьерный центр, career@example.test.",
            interaction_format="Еженедельная онлайн-консультация и ответы на вопросы в течение двух рабочих дней.",
        ),
    },
]


def seed() -> None:
    with SessionLocal() as db:
        if db.scalar(select(func.count()).select_from(Team)) == 0:
            db.add_all(
                [
                    Team(name=name, interests=interests, skills=skills, technologies=technologies)
                    for name, interests, skills, technologies in TEAMS
                ]
            )
            db.commit()

        if db.scalar(select(func.count()).select_from(Task)) == 0:
            tasks: list[Task] = []
            for item in TASKS:
                card = item["card"].model_dump()
                task = Task(
                    topic=item["topic"],
                    description=item["description"],
                    card=card,
                    questions=[],
                    answers=[],
                    readiness=calculate_readiness(card),
                    is_confirmed=True,
                    is_published=True,
                    ai_mode=None,
                    owner_id="business-demo",
                    published_snapshot={"card": card, "readiness": calculate_readiness(card),
                                        "topic": item["topic"], "description": item["description"]},
                )
                db.add(task)
                tasks.append(task)
            db.commit()

            teams = list(db.scalars(select(Team).order_by(Team.name)).all())
            for index, task in enumerate(tasks):
                db.add(
                    Proposal(
                        task_id=task.id,
                        team_id=teams[index].id,
                        idea=f"Создать проверяемый прототип для задачи «{task.card['title']}».",
                        plan="Уточнить требования, собрать прототип, проверить на тестовом сценарии.",
                        duration_days=21,
                        prototype_url=f"https://example.test/prototypes/{index + 1}",
                    )
                )
            db.commit()


        # Пять отдельных черновиков нужны для проверки роста готовности по ТЗ.
        for index, item in enumerate(TASKS, start=1):
            draft_id = f"demo-draft-{index}"
            if db.get(Task, draft_id) is None:
                card = item["card"].model_dump()
                db.add(Task(id=draft_id, topic=item["topic"], description=item["description"],
                            card=card, questions=[], answers=[], readiness=calculate_readiness(card),
                            owner_id="business-demo", is_confirmed=False, is_published=False))
        db.commit()


if __name__ == "__main__":
    seed()
