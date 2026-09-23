import { useEffect, useMemo, useState } from 'react'
import { api } from './api'
import type { Actor, Card, Proposal, Readiness, Task } from './api'
import {
  caseSections,
  emptyCard,
  errorMessage,
  fieldLimits,
  labels,
  levelClass,
} from './ui'
import type { AsyncAction } from './ui'

type DecisionStatus = 'pending' | 'selected' | 'rejected'

export function BusinessWorkspace({
  actor,
  task,
  busy,
  action,
  onTask,
  onBack,
  reportError,
  refreshTeams,
}: {
  actor: Actor
  task: Task
  busy: boolean
  action: AsyncAction
  onTask: (task: Task) => void
  onBack: () => void
  reportError: (message: string) => void
  refreshTeams: () => Promise<void>
}) {
  const [tab, setTab] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [card, setCard] = useState<Card>(emptyCard)
  const [topic, setTopic] = useState(task.topic)
  const [description, setDescription] = useState(task.description)
  const [proposals, setProposals] = useState<Proposal[]>([])

  useEffect(() => {
    let active = true
    setCard(task.card)
    setTopic(task.topic)
    setDescription(task.description)
    setAnswers(Object.fromEntries(task.answers.map((item) => [item.question_id, item.text])))
    api
      .proposals(task.id)
      .then((items) => active && setProposals(items))
      .catch((reason) => active && reportError(errorMessage(reason)))
    return () => {
      active = false
    }
  }, [task, reportError])

  const savedAnswers = useMemo(
    () => Object.fromEntries(task.answers.map((item) => [item.question_id, item.text])),
    [task.answers],
  )
  const hasUnsavedCard = (Object.keys(card) as (keyof Card)[]).some((key) => card[key] !== task.card[key])
  const hasUnsavedAnswers =
    task.questions.some((question) => (answers[question.id] || '') !== (savedAnswers[question.id] || ''))
  const hasUnsaved = hasUnsavedCard || hasUnsavedAnswers || topic !== task.topic || description !== task.description

  const update = async (next: Task) => {
    onTask(next)
    setProposals(await api.proposals(next.id))
  }

  const flow = [
    { label: 'Черновик', meta: `${task.readiness.total}/100`, done: true },
    {
      label: 'Уточнение',
      meta: task.questions.length ? `${task.questions.length} вопросов` : 'ожидает',
      done: task.questions.length > 0,
    },
    {
      label: 'Публикация',
      meta: task.is_published ? 'в каталоге' : task.is_confirmed ? 'подтверждён' : 'ожидает',
      done: task.is_published,
    },
    {
      label: 'Решение',
      meta: proposals.length ? `${proposals.length} откликов` : 'нет откликов',
      done: proposals.some((item) => item.status !== 'pending'),
    },
  ]
  const currentFlow = flow.findIndex((item) => !item.done)

  return (
    <section>
      <div className="head">
        <div>
          <span className="eyebrow">МОЙ КЕЙС / {task.topic.toUpperCase()}</span>
          <h2>{card.title || 'Новый рабочий кейс'}</h2>
          <small>
            {task.is_published ? task.is_confirmed ? 'Опубликован' : 'Публикация ожидает подтверждения правок' : task.is_confirmed ? 'Подтверждён' : 'Черновик'} ·
            ID {task.id.slice(0, 8)} · владелец {actor.name}
          </small>
        </div>
        <div>
          <span className={levelClass(task.readiness.level)}>
            <i />
            {task.readiness.total}/100 · {task.readiness.level_label}
          </span>
          <button
            className="secondary"
            disabled={hasUnsaved}
            title={hasUnsaved ? 'Сначала сохраните изменения' : ''}
            onClick={onBack}
          >
            ← Мои кейсы
          </button>
        </div>
      </div>

      <div className="flow-rail glass-panel" aria-label="Прогресс кейса">
        {flow.map((item, index) => (
          <div
            className={item.done ? 'flow-node done' : index === currentFlow ? 'flow-node current' : 'flow-node'}
            key={item.label}
          >
            <b>0{index + 1}</b>
            <span>
              <strong>{item.label}</strong>
              <small>{item.meta}</small>
            </span>
          </div>
        ))}
      </div>

      <div className="steps" aria-label="Этапы работы">
        {[
          ['Карта кейса', 'Редактирование полей'],
          ['AI-вопросы', 'Закрытие пробелов'],
          ['Отклики', 'Ручное решение'],
        ].map(([label, caption], index) => (
          <button
            className={tab === index ? 'active' : ''}
            disabled={hasUnsaved && index !== tab}
            title={hasUnsaved ? 'Сначала сохраните изменения' : caption}
            onClick={() => setTab(index)}
            key={label}
          >
            <b>0{index + 1}</b>
            <span>{label}</span>
          </button>
        ))}
      </div>

      <div className="tab-transition" key={tab}>
        {tab === 0 ? (
          <CaseMap
            task={task}
            card={card}
            setCard={setCard}
            topic={topic}
            setTopic={setTopic}
            description={description}
            setDescription={setDescription}
            busy={busy}
            action={action}
            update={update}
            goQuestions={() => setTab(1)}
          />
        ) : tab === 1 ? (
          <Clarifications
            task={task}
            answers={answers}
            setAnswers={setAnswers}
            busy={busy}
            action={action}
            update={update}
            goMap={() => setTab(0)}
          />
        ) : (
          <BusinessCollab
            task={task}
            proposals={proposals}
            setProposals={setProposals}
            action={action}
            refreshTeams={refreshTeams}
          />
        )}
      </div>
    </section>
  )
}

function CaseMap({
  task,
  card,
  setCard,
  topic,
  setTopic,
  description,
  setDescription,
  busy,
  action,
  update,
  goQuestions,
}: {
  task: Task
  card: Card
  setCard: (card: Card) => void
  topic: string
  setTopic: (topic: string) => void
  description: string
  setDescription: (description: string) => void
  busy: boolean
  action: AsyncAction
  update: (task: Task) => Promise<void>
  goQuestions: () => void
}) {
  const [sectionId, setSectionId] = useState<string | null>('problem')
  const [field, setField] = useState<keyof Card>('context')
  const section = caseSections.find((item) => item.id === sectionId)
  const filled = (key: keyof Card) => Boolean(task.card[key].trim())
  const completed = caseSections.filter((item) => item.fields.every(filled)).length
  const dirty = (Object.keys(card) as (keyof Card)[]).some((key) => card[key] !== task.card[key]) || topic !== task.topic || description !== task.description
  const valid = topic.trim().length >= 2 && description.trim().length >= 10 && Boolean(card.title.trim())

  const chooseSection = (id: string) => {
    const next = caseSections.find((item) => item.id === id)!
    setSectionId(id)
    setField(next.fields.find((key) => !filled(key)) || next.fields[0])
  }

  return (
    <div className="case-workspace">
      <div className="case-left">
        <div className="case-progress glass-panel">
          <div>
            <b>{completed} из 3 смысловых блоков заполнено</b>
            <small>Баллы готовности и объяснение каждого показателя — ниже карты.</small>
          </div>
          <div className="case-progress-track" aria-label={`Заполнено ${completed} из 3 блоков`}>
            <i style={{ width: `${(completed / 3) * 100}%` }} />
          </div>
          <button
            className="secondary"
            disabled={dirty}
            title={dirty ? 'Сначала сохраните изменения' : ''}
            onClick={goQuestions}
          >
            Проверить пробелы →
          </button>
        </div>

        <div className="case-canvas glass-panel" aria-label="Карта полей кейса">
          <div className="canvas-heading">
            <p className="canvas-hint">Выберите блок или сохранённый узел. Редактор откроется справа.</p>
            <span>{dirty ? 'НЕ СОХРАНЕНО' : task.is_confirmed ? 'ПОДТВЕРЖДЕНО' : 'ЧЕРНОВИК'}</span>
          </div>
          <button
            className={`case-root ${sectionId === null ? 'selected' : ''}`}
            onClick={() => setSectionId(null)}
            aria-pressed={sectionId === null}
          >
            <span>КЕЙС</span>
            <strong>{card.title || task.topic}</strong>
            <small>{task.is_published ? 'Опубликован' : task.is_confirmed ? 'Подтверждён' : 'Черновик'}</small>
          </button>
          <div className="case-connectors" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
          <div className="case-sections">
            {caseSections.map((item) => {
              const count = item.fields.filter(filled).length
              return (
                <button
                  key={item.id}
                  className={`case-section ${sectionId === item.id ? 'selected' : ''}`}
                  onClick={() => chooseSection(item.id)}
                  aria-pressed={sectionId === item.id}
                >
                  <span className="section-symbol">
                    {item.id === 'problem' ? '?' : item.id === 'result' ? '↗' : '◇'}
                  </span>
                  <strong>{item.title}</strong>
                  <small>
                    {count} из {item.fields.length} полей
                  </small>
                </button>
              )
            })}
          </div>
          {section && (
            <div className="case-children" key={section.id}>
              <div className="child-heading">
                <span className="eyebrow">{section.title.toUpperCase()} / СОХРАНЁННЫЕ УЗЛЫ</span>
                <span>{section.fields.filter(filled).length} связей</span>
              </div>
              {section.fields.some(filled) ? (
                <div className="child-grid">
                  {section.fields.filter(filled).map((key) => (
                    <button
                      key={key}
                      className={`child-node ${field === key ? 'selected' : ''}`}
                      onClick={() => setField(key)}
                      aria-pressed={field === key}
                    >
                      <i aria-hidden="true" />
                      <span>
                        <b>{labels[key]}</b>
                        <small>{task.card[key]}</small>
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="child-empty">У блока пока нет сохранённых узлов. Заполните первое поле справа.</div>
              )}
            </div>
          )}
        </div>

        <div className="case-bottom">
          <span>
            Индекс готовности: <b>{task.readiness.total}/100</b>
          </span>
          <span className={levelClass(task.readiness.level)}>{task.readiness.level_label}</span>
          {task.readiness.missing_information.length > 0 && (
            <small>Следующие пробелы: {task.readiness.missing_information.join(' · ')}</small>
          )}
        </div>
        <ReadinessScore readiness={task.readiness} confirmed={task.is_confirmed && !dirty} />
      </div>

      <aside className="case-inspector glass-panel">
        {task.is_published && <p className="published-note">Студенты видят последнюю подтверждённую версию. После сохранения подтвердите правки, чтобы обновить публикацию.</p>}
        {section ? (
          <>
            <span className="eyebrow">РЕДАКТОР / {section.title.toUpperCase()}</span>
            <h3>{labels[field]}</h3>
            <p>{section.description}</p>
            <div className="field-list" aria-label="Поля выбранного блока">
              {section.fields.map((key) => (
                <button key={key} className={field === key ? 'active' : ''} onClick={() => setField(key)}>
                  <span>{labels[key]}</span>
                  <small>
                    {card[key] !== task.card[key] ? 'Не сохранено' : filled(key) ? 'Заполнено' : 'Пусто'}
                  </small>
                </button>
              ))}
            </div>
            <label className="inspector-field">
              <span>{labels[field]}</span>
              <textarea
                rows={8}
                value={card[field]}
                maxLength={fieldLimits[field]}
                onChange={(event) => setCard({ ...card, [field]: event.target.value })}
                placeholder={`Опишите: ${labels[field].toLowerCase()}`}
              />
              <small>
                {card[field].length}/{fieldLimits[field]} ·{' '}
                {dirty ? 'Есть несохранённые изменения' : 'Сохранено'}
              </small>
            </label>
          </>
        ) : (
          <>
            <span className="eyebrow">ОСНОВА КЕЙСА</span>
            <h3>Название и исходный сигнал</h3>
            <label className="inspector-field"><span>Тема</span><input value={topic} minLength={2} maxLength={120} onChange={event => setTopic(event.target.value)} /></label>
            <label className="inspector-field"><span>Исходное описание</span><textarea rows={4} value={description} minLength={10} maxLength={5000} onChange={event => setDescription(event.target.value)} /></label>
            <label className="inspector-field">
              <span>Название кейса</span>
              <input
                value={card.title}
                maxLength={fieldLimits.title}
                onChange={(event) => setCard({ ...card, title: event.target.value })}
                placeholder="Короткое название"
              />
              <small>
                {card.title.length}/{fieldLimits.title}
              </small>
            </label>
          </>
        )}

        <div className="inspector-actions">
          <button
            className="primary"
            disabled={busy || !dirty || !valid}
            onClick={() => action(async () => update(await api.updateCard(task.id, card, topic, description)))}
          >
            Сохранить и пересчитать
          </button>
          {!task.is_confirmed ? (
            <button
              className="secondary"
              disabled={busy || dirty || !valid}
              onClick={() => action(async () => update(await api.confirm(task.id)))}
            >
              {task.is_published ? 'Подтвердить и обновить публикацию' : 'Подтвердить текущую версию'}
            </button>
          ) : !task.is_published ? (
            <button
              className="secondary publish-action"
              disabled={busy || dirty}
              onClick={() => action(async () => update(await api.publish(task.id)))}
            >
              Опубликовать в каталоге
            </button>
          ) : (
            <>
              <span className="published">
                <i /> Опубликовано
              </span>
              <small className="published-note">Карточка зафиксирована и доступна всем студенческим командам.</small>
            </>
          )}
          {!dirty && !task.is_confirmed && (
            <small>После ручного подтверждения станет доступна публикация при любом рейтинге.</small>
          )}
          {dirty && <small>Сохраните изменения: подтверждение будет сброшено и рейтинг пересчитается.</small>}
        </div>
      </aside>
    </div>
  )
}

export function ReadinessScore({ readiness, confirmed = true }: { readiness: Readiness; confirmed?: boolean }) {
  return (
    <aside className="score glass-panel">
      <div className="score-orbit">
        <i />
        <strong>
          {readiness.total}
          <small>/100</small>
        </strong>
      </div>
      <span className="eyebrow">{confirmed ? 'ПОДТВЕРЖДЁННАЯ ГОТОВНОСТЬ' : 'ПРЕДВАРИТЕЛЬНАЯ ГОТОВНОСТЬ'}</span>
      {!confirmed && <p className="published-note">Предварительный расчёт по сохранённым полям. Баллы фиксируются после подтверждения.</p>}
      <div className="bar">
        <i style={{ width: `${readiness.total}%` }} />
      </div>
      <span className={levelClass(readiness.level)}>{readiness.level_label}</span>
      <div className="breakdown">
        {readiness.breakdown.map((item) => (
          <p key={item.field}>
            <span>{item.label}</span>
            <b>
              {item.points}
              <small>/{item.max_points}</small>
            </b>
          </p>
        ))}
      </div>
      {readiness.missing_information.length > 0 && (
        <div className="missing">
          <b>!</b>
          <span>
            <strong>Не хватает данных</strong>
            {readiness.missing_information.join(' · ')}
          </span>
        </div>
      )}
      {readiness.suggestions.length > 0 && (
        <div className="score-suggestions">
          <span className="eyebrow">КАК УСИЛИТЬ КЕЙС</span>
          {readiness.suggestions.map((suggestion) => (
            <p key={suggestion}>↗ {suggestion}</p>
          ))}
        </div>
      )}
    </aside>
  )
}

function Clarifications({
  task,
  answers,
  setAnswers,
  busy,
  action,
  update,
  goMap,
}: {
  task: Task
  answers: Record<string, string>
  setAnswers: (value: Record<string, string>) => void
  busy: boolean
  action: AsyncAction
  update: (task: Task) => Promise<void>
  goMap: () => void
}) {
  const answersApplied = task.answers.length > 0
  const canSave = task.questions.some((question) => (answers[question.id] || '').trim())

  return (
    <div className="columns">
      <div>
        <div className="stage-intro">
          <span className="eyebrow">AI / GAP ANALYSIS</span>
          <h3>Закройте пробелы до публикации</h3>
          <p>Ответы попадут в соответствующие поля карты. После этого корректируйте формулировки в редакторе.</p>
        </div>
        <div className="source glass-panel">
          <small>ИСХОДНЫЙ БРИФ</small>
          <p>{task.description}</p>
          <span className="source-node">01</span>
        </div>

        {!task.questions.length ? (
          <div className="callout glass-panel">
            <div className="ai-glyph">✦</div>
            <div>
              <b>Запустить анализ пробелов</b>
              <p>AI задаст минимум три вопроса и не будет дополнять карточку неизвестными фактами.</p>
            </div>
            <button
              className="primary"
              onClick={() =>
                action(async () => {
                  const result = await api.clarify(task.id)
                  await update({ ...task, questions: result.questions, ai_mode: result.ai_mode, answers: [] })
                })
              }
              disabled={busy}
            >
              Сформировать вопросы →
            </button>
          </div>
        ) : (
          <div className="questions glass-panel">
            <div className="question-header">
              <div>
                <span className="eyebrow">УТОЧНЯЮЩИЕ УЗЛЫ</span>
                <small>{task.questions.length} вопросов по реальным пробелам</small>
              </div>
              <span className={`ai-mode ${task.ai_mode}`}>
                {task.ai_mode === 'fallback' ? 'fallback · шаблоны' : 'AI live · OpenAI'}
              </span>
            </div>
            {task.ai_mode === 'fallback' && (
              <div className="fallback-note">Эти вопросы созданы резервным шаблонным режимом. Ответ модели не был получен или не прошёл проверку. Можно повторить запрос.</div>
            )}
            {answersApplied && (
              <div className="readonly-note">
                Ответы перенесены в карту. Можно исправить их и сохранить заново; окончательный текст подтверждаете вы.
              </div>
            )}
            {task.questions.map((question, index) => (
              <label className="question" key={question.id}>
                <b>{String(index + 1).padStart(2, '0')}</b>
                <span>
                  {question.text}
                  <small>{labels[question.field as keyof Card] || question.field}</small>
                  <textarea
                    rows={3}
                    maxLength={Math.min(fieldLimits[question.field as keyof Card] || 3000, 3000)}
                    value={answers[question.id] || ''}
                    onChange={(event) => setAnswers({ ...answers, [question.id]: event.target.value })}
                    placeholder="Введите содержательный ответ…"
                  />
                </span>
              </label>
            ))}
            {answersApplied && (
              <button className="secondary" onClick={goMap}>
                Открыть заполненную карту →
              </button>
            )}
            <button className="secondary" disabled={busy} onClick={() => action(async () => {
              const result = await api.clarify(task.id)
              await update({ ...task, ...result, answers: [] })
            })}>Обновить уточняющие вопросы</button>
            {(
              <button
                className="primary"
                disabled={busy || !canSave}
                onClick={() =>
                  action(async () =>
                    update(
                      await api.saveAnswers(
                        task.id,
                        task.questions
                          .map((question) => ({
                            question_id: question.id,
                            field: question.field,
                            text: answers[question.id] || '',
                          }))
                          .filter((answer) => answer.text.trim()),
                      ),
                    ),
                  )
                }
              >
                Перенести ответы в карту и пересчитать →
              </button>
            )}
          </div>
        )}
      </div>
      <ReadinessScore readiness={task.readiness} confirmed={task.is_confirmed} />
    </div>
  )
}

function BusinessCollab({
  task,
  proposals,
  setProposals,
  action,
  refreshTeams,
}: {
  task: Task
  proposals: Proposal[]
  setProposals: (items: Proposal[]) => void
  action: AsyncAction
  refreshTeams: () => Promise<void>
}) {
  const [decision, setDecision] = useState<Record<string, DecisionStatus>>({})
  const [milestone, setMilestone] = useState<Proposal | null>(null)
  const [milestoneForm, setMilestoneForm] = useState({ result: '', points: 10 })

  useEffect(() => {
    setDecision(Object.fromEntries(proposals.map((proposal) => [proposal.id, proposal.status])))
  }, [proposals])

  if (!task.is_published) {
    return (
      <div className="locked glass-panel">
        <div className="locked-node">⌁</div>
        <h3>Контур откликов ещё закрыт</h3>
        <p>Подтвердите карточку и опубликуйте её. Низкий рейтинг не блокирует этот шаг.</p>
      </div>
    )
  }

  const saveDecision = () =>
    action(async () => {
      const selected = proposals.filter((item) => decision[item.id] === 'selected').map((item) => item.id)
      const rejected = proposals.filter((item) => decision[item.id] === 'rejected').map((item) => item.id)
      setProposals(await api.decide(task.id, selected, rejected))
    })

  const confirmMilestone = () => {
    if (!milestone) return
    action(async () => {
      const result = await api.milestone(milestone.id, milestoneForm)
      setProposals(
        proposals.map((proposal) =>
          proposal.id === milestone.id
            ? {
                ...proposal,
                milestone_confirmed: true,
                team: { ...proposal.team, progress_points: result.team_progress_points },
              }
            : proposal,
        ),
      )
      await refreshTeams()
      setMilestone(null)
      setMilestoneForm({ result: '', points: 10 })
    })
  }

  const selectedCount = Object.values(decision).filter((status) => status === 'selected').length
  const rejectedCount = Object.values(decision).filter((status) => status === 'rejected').length

  return (
    <div className="collab">
      <div className="section">
        <div>
          <span className="eyebrow">DECISION MAP / БИЗНЕС</span>
          <h3>{proposals.length ? `${proposals.length} откликов на орбите` : 'Откликов пока нет'}</h3>
          <p>Только бизнес-владелец кейса выбирает, отклоняет или оставляет команды на рассмотрении.</p>
        </div>
        <button className="secondary" onClick={() => action(async () => setProposals(await api.proposals(task.id)))}>Обновить отклики</button>
      </div>

      {proposals.length ? (
        <div className="proposal-network">
          {proposals.map((proposal) => {
            const currentStatus = decision[proposal.id] || proposal.status
            return (
              <article className={`proposal glass-panel status-${currentStatus}`} key={proposal.id}>
                <div className="proposal-node">{proposal.team.name.slice(0, 2).toUpperCase()}</div>
                <div className="proposal-content">
                  <div className="proposal-heading">
                    <div>
                      <span className="eyebrow">КОМАНДА / {proposal.id.slice(0, 6)}</span>
                      <h3>{proposal.team.name}</h3>
                    </div>
                    <span className={`proposal-state ${currentStatus}`}>
                      {currentStatus === 'selected'
                        ? 'Выбрана'
                        : currentStatus === 'rejected'
                          ? 'Отклонена'
                          : 'На рассмотрении'}
                    </span>
                  </div>
                  <p>{proposal.idea}</p>
                  <details>
                    <summary>План реализации</summary>
                    <p className="proposal-plan">{proposal.plan}</p>
                  </details>
                  <small>
                    ◷ {proposal.duration_days} дней ·{' '}
                    <a href={proposal.prototype_url} target="_blank" rel="noreferrer">
                      Прототип ↗
                    </a>{' '}
                    · {proposal.team.progress_points} pts
                  </small>
                  <div className="decision-controls" aria-label={`Решение по команде ${proposal.team.name}`}>
                    {(
                      [
                        ['pending', 'Рассмотреть'],
                        ['selected', 'Выбрать'],
                        ['rejected', 'Отклонить'],
                      ] as [DecisionStatus, string][]
                    ).map(([status, label]) => (
                      <button
                        key={status}
                        className={currentStatus === status ? `active ${status}` : ''}
                        aria-pressed={currentStatus === status}
                        onClick={() => setDecision({ ...decision, [proposal.id]: status })}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {proposal.status === 'selected' && !proposal.milestone_confirmed && (
                    <button className="secondary milestone-btn" onClick={() => setMilestone(proposal)}>
                      Подтвердить этап
                    </button>
                  )}
                  {proposal.milestone_confirmed && (
                    <span className="milestone-complete">✓ Этап уже подтверждён, повторное начисление закрыто</span>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <div className="empty glass-panel compact-empty">
          <div className="locked-node">○</div>
          <h3>Кейс уже виден студентам</h3>
          <p>После отправки предложения командой нажмите «Обновить отклики».</p>
        </div>
      )}

      {proposals.length > 0 && (
        <div className="decision glass-panel">
          <span>
            <b>{selectedCount}</b> выбрано · {rejectedCount} отклонено
            <small>Остальные отклики сохранят статус «на рассмотрении».</small>
          </span>
          <button className="primary" onClick={saveDecision}>
            Зафиксировать ручное решение →
          </button>
          <button className="secondary" onClick={() => action(async () => setProposals(await api.decide(task.id, [], proposals.map(item => item.id))))}>Отклонить все</button>
        </div>
      )}

      {milestone && (
        <div className="modal" role="dialog" aria-modal="true" aria-label="Подтверждение этапа">
          <div className="modal-box glass-panel">
            <button className="close" aria-label="Закрыть" onClick={() => setMilestone(null)}>
              ×
            </button>
            <span className="eyebrow">MILESTONE / {milestone.team.name}</span>
            <h3>Подтвердить фактический прогресс</h3>
            <div className="modal-fields">
              <label>
                РЕЗУЛЬТАТ ЭТАПА
                <textarea
                  rows={4}
                  maxLength={4000}
                  placeholder="Что именно команда завершила?"
                  value={milestoneForm.result}
                  onChange={(event) => setMilestoneForm({ ...milestoneForm, result: event.target.value })}
                />
                <small>{milestoneForm.result.length}/4000 · минимум 10</small>
              </label>
              <label>
                БАЛЛЫ ЗА ПРОГРЕСС
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={milestoneForm.points}
                  onChange={(event) => setMilestoneForm({ ...milestoneForm, points: Number(event.target.value) })}
                />
              </label>
            </div>
            <button
              className="primary full"
              disabled={
                milestoneForm.result.trim().length < 10 ||
                milestoneForm.points < 1 ||
                milestoneForm.points > 100
              }
              onClick={confirmMilestone}
            >
              Подтвердить один раз и начислить баллы
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
