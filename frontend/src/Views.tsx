import { useState } from 'react'
import { api } from './api'
import type { Actor, Proposal, Role, Task, Team } from './api'
import { ReadinessScore } from './CaseWorkspace'
import { caseSections, isHttpUrl, labels, levelClass } from './ui'
import type { AsyncAction } from './ui'

export function NewTaskScreen({
  busy,
  action,
  onCreated,
}: {
  busy: boolean
  action: AsyncAction
  onCreated: (task: Task) => void
}) {
  const [brief, setBrief] = useState({ topic: '', description: '' })

  return (
    <section className="landing">
      <div className="landing-copy">
        <span className="eyebrow">НОВЫЙ БИЗНЕС-КЕЙС</span>
        <h2>
          Из потребности — в <em>рабочую задачу.</em>
        </h2>
        <p>
          Опишите контекст своими словами. AI найдёт пробелы, а карта покажет, какие связи уже готовы для
          студенческой команды.
        </p>
        <div className="create">
          <label>
            ТЕМА
            <input
              value={brief.topic}
              maxLength={120}
              onChange={(event) => setBrief({ ...brief, topic: event.target.value })}
              placeholder="Например, образование"
            />
            <small>{brief.topic.length}/120</small>
          </label>
          <label>
            КРАТКОЕ ОПИСАНИЕ
            <textarea
              rows={5}
              maxLength={5000}
              value={brief.description}
              onChange={(event) => setBrief({ ...brief, description: event.target.value })}
              placeholder="Что происходит сейчас, кому мешает и какой результат нужен?"
            />
            <small>{brief.description.length}/5000</small>
          </label>
          <button
            className="primary"
            disabled={brief.topic.trim().length < 2 || brief.description.trim().length < 10 || busy}
            onClick={() => action(async () => onCreated(await api.createTask(brief)))}
          >
            <span>Создать черновик</span>
            <b>→</b>
          </button>
        </div>
        <div className="landing-meta">
          <span>
            <b>01</b> Черновик
          </span>
          <i />
          <span>
            <b>02</b> AI-вопросы
          </span>
          <i />
          <span>
            <b>03</b> Публикация
          </span>
          <i />
          <span>
            <b>04</b> Выбор команды
          </span>
        </div>
      </div>

      <div className="landing-guide glass-panel">
        <span className="eyebrow">ФУНКЦИОНАЛЬНАЯ КАРТА</span>
        <div className="guide-root">
          <span>Кейс</span>
        </div>
        <div className="guide-branches">
          <span>Проблема</span>
          <span>Результат</span>
          <span>Условия</span>
        </div>
        <p>
          Каждый узел — реальное поле API. Незаполненные сведения остаются пустыми: AI не добавляет факты за
          пользователя.
        </p>
      </div>
    </section>
  )
}

export function MyTasksView({
  tasks,
  open,
  create,
  remove,
}: {
  tasks: Task[]
  open: (id: string) => void
  create: () => void
  remove: (id: string) => void
}) {
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  return (
    <section>
      <div className="page-intro catalog-intro">
        <div>
          <span className="eyebrow live">
            <i /> BUSINESS CABINET
          </span>
          <h2>Мои кейсы</h2>
          <p>Черновики, опубликованные задачи и входящие отклики одного бизнес-профиля.</p>
        </div>
        <button className="primary" onClick={create}>
          ＋ Новый кейс
        </button>
      </div>

      <div className="owned-list">
        {tasks.map((task) => (
          <article className="owned-task glass-panel" key={task.id}>
            <div className="owned-score">
              <strong>{task.readiness.total}</strong>
              <small>/100</small>
            </div>
            <div className="owned-copy">
              <div>
                <span className="tag">{task.topic}</span>
                <span className={levelClass(task.readiness.level)}>{task.readiness.level_label}</span>
              </div>
              <h3>{task.card.title || task.topic}</h3>
              <p>{task.card.context || task.description}</p>
              <small>
                {task.is_published ? 'Опубликован' : task.is_confirmed ? 'Подтверждён' : 'Черновик'} · обновлён{' '}
                {new Date(task.updated_at).toLocaleDateString('ru-RU')}
              </small>
            </div>
            <div className="owned-actions">
              <button className="primary" onClick={() => open(task.id)}>
                Открыть →
              </button>
              {confirmDelete === task.id ? (
                <div className="delete-confirm">
                  <small>Удалить без восстановления?</small>
                  <button
                    className="danger"
                    onClick={() => {
                      remove(task.id)
                      setConfirmDelete(null)
                    }}
                  >
                    Да, удалить
                  </button>
                  <button className="secondary" onClick={() => setConfirmDelete(null)}>
                    Отмена
                  </button>
                </div>
              ) : (
                <button className="ghost-danger" onClick={() => setConfirmDelete(task.id)}>
                  Удалить
                </button>
              )}
            </div>
          </article>
        ))}
      </div>

      {!tasks.length && (
        <div className="empty glass-panel">
          <div className="locked-node">○</div>
          <h3>У этого профиля ещё нет задач</h3>
          <p>Создайте первый черновик и пройдите путь до публикации.</p>
          <button className="primary" onClick={create}>
            Создать кейс
          </button>
        </div>
      )}
    </section>
  )
}

export function CatalogView({
  role,
  tasks,
  busy,
  open,
  search,
}: {
  role: Role
  tasks: Task[]
  busy: boolean
  open: (id: string) => void
  search: (filters?: { topic?: string; readiness_level?: string }) => void
}) {
  const [topic, setTopic] = useState('')
  const [level, setLevel] = useState('')

  const clearFilters = () => {
    setTopic('')
    setLevel('')
    search()
  }

  return (
    <section className="catalog">
      <div className="page-intro catalog-intro">
        <div>
          <span className="eyebrow live">
            <i /> {role === 'student' ? 'STUDENT CATALOG' : 'OPEN TASK NETWORK'}
          </span>
          <h2>Карта опубликованных задач</h2>
          <p>
            {role === 'student'
              ? 'Откройте кейс, оцените его готовность и отправьте предложение от своей команды.'
              : 'Посмотрите, как опубликованные кейсы отображаются студенческим командам.'}
          </p>
        </div>
        <span className="catalog-counter">
          <b>{tasks.length}</b>
          <small>кейсов найдено</small>
        </span>
      </div>

      <div className="filters glass-panel">
        <label>
          <span>ТЕМА</span>
          <input value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="Например, образование" />
        </label>
        <label>
          <span>УРОВЕНЬ ГОТОВНОСТИ</span>
          <select value={level} onChange={(event) => setLevel(event.target.value)}>
            <option value="">Все уровни</option>
            <option value="draft">Черновик · 0–39</option>
            <option value="working">Рабочая · 40–69</option>
            <option value="ready">Готовая · 70–89</option>
            <option value="priority">Приоритетная · 90–100</option>
          </select>
        </label>
        <div className="catalog-actions">
          <button className="secondary" disabled={busy || (!topic && !level)} onClick={clearFilters}>
            Сбросить
          </button>
          <button
            className="primary"
            disabled={busy}
            onClick={() => search({ topic, readiness_level: level })}
          >
            Применить фильтры
          </button>
        </div>
      </div>

      <div className="grid">
        {tasks.map((task, index) => (
          <button className={`task glass-panel tone-${index % 3}`} key={task.id} onClick={() => open(task.id)}>
            <span className="catalog-position">#{String(index + 1).padStart(2, '0')}</span>
            <div className="task-orbit">
              <i />
              <span>{task.readiness.total}</span>
            </div>
            <div className="task-top">
              <span className="tag">{task.topic}</span>
              <span className={levelClass(task.readiness.level)}>{task.readiness.level_label}</span>
            </div>
            <h3>{task.card.title || 'Задача без названия'}</h3>
            <p>{task.card.context || task.description}</p>
            <div className="card-link">
              <span>CASE / {task.id.slice(0, 5)}</span>
              <b>{role === 'student' ? 'Изучить и откликнуться →' : 'Открыть карточку →'}</b>
            </div>
          </button>
        ))}
      </div>

      {!tasks.length && (
        <div className="empty glass-panel">
          <div className="locked-node">○</div>
          <h3>По этим фильтрам нет задач</h3>
          <p>Сбросьте фильтры или вернитесь позже.</p>
          <button className="secondary" onClick={clearFilters}>
            Показать весь каталог
          </button>
        </div>
      )}
    </section>
  )
}

export function TaskDetails({
  actor,
  task,
  myProposals,
  action,
  onProposal,
  back,
}: {
  actor: Actor
  task: Task
  myProposals: Proposal[]
  action: AsyncAction
  onProposal: (proposal: Proposal) => void
  back: () => void
}) {
  const existing = actor.role === 'student' ? myProposals.find((item) => item.task_id === task.id) : undefined
  const [form, setForm] = useState({ idea: '', plan: '', duration_days: 14, prototype_url: '' })
  const canSubmit =
    form.idea.trim().length >= 10 &&
    form.plan.trim().length >= 10 &&
    form.duration_days >= 1 &&
    form.duration_days <= 365 &&
    isHttpUrl(form.prototype_url)

  return (
    <section>
      <div className="head">
        <div>
          <span className="eyebrow">{actor.role === 'student' ? 'STUDENT VIEW' : 'PUBLIC CARD'} / {task.topic}</span>
          <h2>{task.card.title || task.topic}</h2>
          <small>Опубликованный кейс · ID {task.id.slice(0, 8)}</small>
        </div>
        <div>
          <span className={levelClass(task.readiness.level)}>
            <i />
            {task.readiness.total}/100 · {task.readiness.level_label}
          </span>
          <button className="secondary" onClick={back}>
            ← В каталог
          </button>
        </div>
      </div>

      <div className="public-layout">
        <div>
          <div className="public-hero glass-panel">
            <span className="eyebrow">ИСХОДНЫЙ КОНТЕКСТ</span>
            <p>{task.description}</p>
          </div>
          <div className="public-card-grid">
            {caseSections.map((section) => (
              <article className="public-section glass-panel" key={section.id}>
                <span className="section-symbol">
                  {section.id === 'problem' ? '?' : section.id === 'result' ? '↗' : '◇'}
                </span>
                <div>
                  <span className="eyebrow">{section.title.toUpperCase()}</span>
                  {section.fields.map((field) => (
                    <div className="public-field" key={field}>
                      <b>{labels[field]}</b>
                      <p>{task.card[field] || 'Не указано'}</p>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
        <ReadinessScore readiness={task.readiness} />
      </div>

      {actor.role === 'student' && (
        <div className="student-response glass-panel">
          {existing ? (
            <ProposalStatus proposal={existing} />
          ) : (
            <>
              <div className="section">
                <div>
                  <span className="eyebrow">ОТКЛИК / {actor.name.toUpperCase()}</span>
                  <h3>Предложить решение</h3>
                  <p>Команда определяется текущей сессией. Чужой профиль выбрать нельзя.</p>
                </div>
              </div>
              <div className="response-form">
                <label>
                  ИДЕЯ РЕШЕНИЯ
                  <textarea
                    rows={4}
                    maxLength={4000}
                    value={form.idea}
                    onChange={(event) => setForm({ ...form, idea: event.target.value })}
                    placeholder="Что команда предлагает сделать?"
                  />
                  <small>{form.idea.length}/4000 · минимум 10</small>
                </label>
                <label>
                  ПЛАН
                  <textarea
                    rows={4}
                    maxLength={4000}
                    value={form.plan}
                    onChange={(event) => setForm({ ...form, plan: event.target.value })}
                    placeholder="Основные этапы реализации"
                  />
                  <small>{form.plan.length}/4000 · минимум 10</small>
                </label>
                <div className="modal-row">
                  <label>
                    СРОК, ДНЕЙ
                    <input
                      type="number"
                      min="1"
                      max="365"
                      value={form.duration_days}
                      onChange={(event) => setForm({ ...form, duration_days: Number(event.target.value) })}
                    />
                  </label>
                  <label>
                    ССЫЛКА НА ПРОТОТИП
                    <input
                      type="url"
                      value={form.prototype_url}
                      onChange={(event) => setForm({ ...form, prototype_url: event.target.value })}
                      placeholder="https://example.com/prototype"
                    />
                  </label>
                </div>
                <button
                  className="primary"
                  disabled={!canSubmit}
                  onClick={() =>
                    action(async () => {
                      const proposal = await api.createProposal(task.id, form)
                      onProposal(proposal)
                    })
                  }
                >
                  Отправить отклик от {actor.name} →
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  )
}

function ProposalStatus({ proposal }: { proposal: Proposal }) {
  return (
    <div className="proposal-status-card">
      <span className={`proposal-state ${proposal.status}`}>
        {proposal.status === 'selected'
          ? 'Команда выбрана'
          : proposal.status === 'rejected'
            ? 'Отклик отклонён'
            : 'На рассмотрении'}
      </span>
      <h3>Ваш отклик уже отправлен</h3>
      <p>{proposal.idea}</p>
      <details>
        <summary>План команды</summary>
        <p>{proposal.plan}</p>
      </details>
      {proposal.milestone_confirmed && <span className="milestone-complete">✓ Бизнес подтвердил milestone</span>}
    </div>
  )
}

export function MyProposalsView({
  proposals,
  openTask,
}: {
  proposals: Proposal[]
  openTask: (id: string) => void
}) {
  return (
    <section>
      <div className="page-intro catalog-intro">
        <div>
          <span className="eyebrow live">
            <i /> STUDENT CABINET
          </span>
          <h2>Мои отклики</h2>
          <p>История предложений текущей команды и решения бизнеса.</p>
        </div>
        <span className="catalog-counter">
          <b>{proposals.length}</b>
          <small>откликов</small>
        </span>
      </div>
      <div className="proposal-history">
        {proposals.map((proposal) => (
          <article className="history-card glass-panel" key={proposal.id}>
            <div className="history-top">
              <span className={`proposal-state ${proposal.status}`}>
                {proposal.status === 'selected'
                  ? 'Выбрана'
                  : proposal.status === 'rejected'
                    ? 'Отклонена'
                    : 'На рассмотрении'}
              </span>
              {proposal.milestone_confirmed && <span className="milestone-complete">✓ milestone</span>}
            </div>
            <h3>{proposal.task_title || 'Удалённая задача'}</h3>
            <p>{proposal.idea}</p>
            <small>
              {proposal.duration_days} дней · {new Date(proposal.created_at).toLocaleDateString('ru-RU')}
            </small>
            {proposal.task_deleted ? (
              <span className="deleted-note">Задача удалена бизнесом, отклик сохранён в истории.</span>
            ) : (
              <button className="secondary" onClick={() => openTask(proposal.task_id)}>
                Открыть задачу →
              </button>
            )}
          </article>
        ))}
      </div>
      {!proposals.length && (
        <div className="empty glass-panel">
          <div className="locked-node">○</div>
          <h3>Команда ещё не отправляла отклики</h3>
          <p>Откройте каталог и выберите интересный опубликованный кейс.</p>
        </div>
      )}
    </section>
  )
}

export function TeamsView({ teams, actor }: { teams: Team[]; actor: Actor }) {
  return (
    <section>
      <div className="page-intro catalog-intro">
        <div>
          <span className="eyebrow live">
            <i /> STUDENT NETWORK
          </span>
          <h2>Созвездие команд</h2>
          <p>Профили, технологии и баллы за подтверждённый прогресс.</p>
        </div>
        <span className="catalog-counter">
          <b>{teams.length}</b>
          <small>активных профилей</small>
        </span>
      </div>
      <div className="grid team-grid">
        {teams.map((team, index) => (
          <article className={`team glass-panel ${actor.profile_id === team.id ? 'current-team' : ''}`} key={team.id}>
            {actor.profile_id === team.id && <span className="current-badge">ТЕКУЩИЙ ПРОФИЛЬ</span>}
            <div className={`team-node node-${index % 3}`}>
              <span>{String.fromCharCode(65 + index)}</span>
            </div>
            <div className="team-title">
              <h3>{team.name}</h3>
              <b>{team.progress_points} pts</b>
            </div>
            <p>{team.interests.join(' · ')}</p>
            <div>
              {team.technologies.map((item) => (
                <span className="tag" key={item}>
                  {item}
                </span>
              ))}
            </div>
            <footer>
              <span>SKILLS</span>
              {team.skills.join(' · ')}
            </footer>
          </article>
        ))}
      </div>
    </section>
  )
}
