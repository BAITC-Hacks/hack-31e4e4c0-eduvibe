import { useCallback, useEffect, useState } from 'react'
import { api, setToken, token } from './api'
import type { Actor, Card, Profiles, Proposal, ProposalInput, Readiness, Role, Task, Team } from './api'

type Run = (job: () => Promise<void>) => Promise<void>
const labels: Record<keyof Card, string> = {
  title: 'Название кейса', context: 'Как всё работает сейчас', need: 'Что нужно изменить',
  users: 'Для кого решение', data_materials: 'Доступные данные и материалы', constraints: 'Сроки и ограничения',
  expected_result: 'Что должна передать команда', success_criteria: 'Как вы оцените результат',
  contact: 'Контакт представителя бизнеса', interaction_format: 'Консультации и обратная связь',
}
const statusNames = {pending: 'На рассмотрении', selected: 'Команда выбрана', rejected: 'Отклонено'}
const errorText = (e: unknown) => e instanceof Error ? e.message : 'Не удалось выполнить действие.'

export default function App() {
  const [actor, setActor] = useState<Actor | null>(null)
  const [restoring, setRestoring] = useState(Boolean(token()))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [page, setPage] = useState('home')
  const run: Run = useCallback(async job => {
    setBusy(true); setError('')
    try { await job() } catch (e) { setError(errorText(e)) } finally { setBusy(false) }
  }, [])
  useEffect(() => {
    const expire = () => { setToken(null); setActor(null); setPage('home') }
    window.addEventListener('session-expired', expire)
    if (token()) api.session().then(setActor).catch(e => { expire(); setError(errorText(e)) }).finally(() => setRestoring(false))
    return () => window.removeEventListener('session-expired', expire)
  }, [])
  const login = (role: Role, profile: string) => run(async () => {
    const session = await api.login(role, profile)
    setToken(session.token); setActor(session); setPage('home')
  })
  const logout = () => run(async () => { await api.logout(); setToken(null); setActor(null); setPage('home') })
  if (restoring) return <div className="entry"><p role="status">Восстанавливаем кабинет…</p></div>
  const alert = error && <div className="error" role="alert">{error}<button aria-label="Закрыть ошибку" onClick={() => setError('')}>×</button></div>
  if (!actor) return <div className="entry">{alert}<Login busy={busy} login={login}/></div>
  const business = actor.role === 'business'
  return <div className="app">
    <aside className="sidebar"><div className="brand"><b>E</b><strong>EduVibe<small>Практика с бизнесом</small></strong></div>
      <p className="side-label">{business ? 'КАБИНЕТ БИЗНЕСА' : 'КАБИНЕТ КОМАНДЫ'}</p>
      <nav><button className={page === 'home' ? 'active' : ''} disabled={busy} onClick={() => setPage('home')}>{business ? 'Мои кейсы' : 'Каталог кейсов'}</button>
        <button className={page === 'secondary' ? 'active' : ''} disabled={busy} onClick={() => setPage('secondary')}>{business ? 'Студенческие команды' : 'Мои отклики'}</button></nav>
      <footer><p>{actor.name}</p><button className="secondary" disabled={busy} onClick={logout}>Сменить роль</button><p>Демонстрационный вход</p></footer>
    </aside>
    <main><header><div><span className="eyebrow">EDUVIBE / ПРАКТИЧЕСКИЕ ЗАДАЧИ</span><h1>{business ? 'От потребности — к понятному ТЗ' : 'Найдите задачу для своей команды'}</h1></div><span className="tag">{business ? 'Бизнес' : 'Студенты'}</span></header>
      {alert}{busy && <p role="status" className="loading">Сохраняем или получаем данные…</p>}
      <div key={`${actor.role}:${actor.profile_id}:${page}`}>
        {business ? page === 'home' ? <BusinessHome run={run} busy={busy}/> : <TeamDirectory/>
          : page === 'home' ? <StudentCatalog actor={actor} run={run} busy={busy}/> : <MyProposals/>}
      </div>
    </main>
  </div>
}

function Login({busy, login}: {busy: boolean; login: (role: Role, profile: string) => void}) {
  const [profiles, setProfiles] = useState<Profiles | null>(null)
  const [role, setRole] = useState<Role | null>(null)
  const [profile, setProfile] = useState('')
  const [error, setError] = useState('')
  const load = () => { setError(''); api.profiles().then(setProfiles).catch(e => setError(errorText(e))) }
  useEffect(load, [])
  const choose = (next: Role) => { setRole(next); setProfile('') }
  const choices = role === 'business' ? profiles?.businesses : profiles?.teams
  return <section className="login-panel"><span className="eyebrow">EDUVIBE · БИЗНЕС И СТУДЕНТЫ</span><h1>Практические задачи.<br/>Реальные команды.</h1><p className="muted">Выберите, в каком качестве вы входите.</p>
    <div className="role-options"><button className={role === 'business' ? 'role-card chosen' : 'role-card'} onClick={() => choose('business')}><strong>Я представляю бизнес</strong><span>Сформулирую задачу с AI-помощником и выберу команду.</span></button>
      <button className={role === 'student' ? 'role-card chosen' : 'role-card'} onClick={() => choose('student')}><strong>Я студент</strong><span>Найду кейс и предложу решение от своей команды.</span></button></div>
    {error && <p role="alert">{error} <button onClick={load}>Повторить</button></p>}
    {!profiles && !error && <p role="status">Загружаем профили…</p>}
    {role && profiles && <form onSubmit={e => { e.preventDefault(); login(role, profile) }}>
      <label>{role === 'business' ? 'Профиль бизнеса' : 'Ваша команда'}<select required value={profile} onChange={e => setProfile(e.target.value)}><option value="">Выберите профиль</option>{choices?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <button className="primary" disabled={busy || !profile}>Войти в кабинет</button>
    </form>}
    <p className="demo-note">Демонстрация без регистрации: доступны тестовые профили. Для реальных пользователей потребуется вход с проверкой личности.</p>
  </section>
}

function BusinessHome({run, busy}: {run: Run; busy: boolean}) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [selected, setSelected] = useState<Task | null>(null)
  const [creating, setCreating] = useState(false)
  const [loading, setLoading] = useState(true)
  const refresh = useCallback(async () => { setLoading(true); try { setTasks(await api.mine()) } finally { setLoading(false) } }, [])
  useEffect(() => { void run(refresh) }, [refresh, run])
  const back = () => run(async () => { setSelected(null); setCreating(false); await refresh() })
  if (selected) return <BusinessEditor key={selected.id} task={selected} update={setSelected} busy={busy} run={run} back={back}/>
  if (creating) return <CreateCase busy={busy} run={run} back={back} created={setSelected}/>
  return <section><div className="section"><div><span className="eyebrow">МОИ КЕЙСЫ</span><h2>Задачи вашего бизнеса</h2><p className="muted">Черновики, опубликованные ТЗ и предложения студентов.</p></div><button className="primary" disabled={busy} onClick={() => setCreating(true)}>+ Новый кейс</button></div>
    {loading ? <p role="status">Загружаем кейсы…</p> : tasks.length ? <div className="grid">{tasks.map(t => <button className="task card-button" key={t.id} onClick={() => setSelected(t)}><span className="tag">{t.topic}</span><span className={`level ${t.readiness.level}`}>{t.readiness.total}/100</span><h3>{t.card.title}</h3><p>{t.card.context}</p><small>{t.is_published ? t.is_confirmed ? 'Опубликован' : 'Есть неподтверждённые правки' : 'Черновик'}</small><p className="link-text">Управлять кейсом →</p></button>)}</div> : <div className="empty">Пока нет кейсов. Опишите первую задачу — AI поможет уточнить требования.</div>}
  </section>
}

function CreateCase({busy, run, back, created}: {busy: boolean; run: Run; back: () => void; created: (task: Task) => void}) {
  const [topic, setTopic] = useState('')
  const [description, setDescription] = useState('')
  return <section className="panel"><button className="secondary" onClick={back} disabled={busy}>← Мои кейсы</button><h2>Расскажите о своей задаче</h2><p className="muted">Технические термины не нужны. Опишите проблему своими словами — помощник задаст уточняющие вопросы.</p>
    <form className="stack" onSubmit={e => { e.preventDefault(); void run(async () => created(await api.createTask({topic, description}))) }}>
      <label>Тема<input required minLength={2} maxLength={120} value={topic} onChange={e => setTopic(e.target.value)} placeholder="Например, логистика"/></label>
      <label>Описание потребности<textarea required minLength={10} maxLength={5000} rows={6} value={description} onChange={e => setDescription(e.target.value)} placeholder="Что сейчас неудобно, кто сталкивается с проблемой и что хочется улучшить?"/></label>
      <button className="primary" disabled={busy || topic.trim().length < 2 || description.trim().length < 10}>Создать черновик и перейти к уточнению</button>
    </form></section>
}

function Score({r, confirmed}: {r: Readiness; confirmed: boolean}) {
  return <section className="score"><span className="eyebrow">{confirmed ? 'ПОДТВЕРЖДЁННАЯ ГОТОВНОСТЬ' : 'ПРЕДВАРИТЕЛЬНАЯ ГОТОВНОСТЬ'}</span><strong>{r.total}<small>/100</small></strong><div className="bar"><i style={{width: `${r.total}%`}}/></div><span className={`level ${r.level}`}>{r.level_label}</span>
    {r.breakdown.map(p => <p key={p.field}>{p.label}<b>{p.points}/{p.max_points}</b></p>)}
    {r.suggestions.length > 0 && <div className="missing"><div><b>Что добавить в ТЗ</b><ul>{r.suggestions.map(s => <li key={s}>{s}</li>)}</ul></div></div>}
  </section>
}

function BusinessEditor({task, update, busy, run, back}: {task: Task; update: (t: Task) => void; busy: boolean; run: Run; back: () => void}) {
  const [card, setCard] = useState(task.card)
  const [topic, setTopic] = useState(task.topic)
  const [description, setDescription] = useState(task.description)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [tab, setTab] = useState<'editor' | 'proposals'>('editor')
  const [notice, setNotice] = useState('')
  useEffect(() => { setCard(task.card); setTopic(task.topic); setDescription(task.description); setAnswers(Object.fromEntries(task.answers.map(a => [a.question_id, a.text]))) }, [task])
  const dirty = JSON.stringify(card) !== JSON.stringify(task.card) || topic !== task.topic || description !== task.description
  const save = async () => api.updateCard(task.id, card, topic, description)
  const clarify = () => run(async () => {
    const saved = dirty ? await save() : task
    update(saved)
    const response = await api.clarify(task.id)
    update({...saved, ...response, answers: []}); setNotice('Помощник подготовил вопросы. Ответьте на них обычными словами.')
  })
  const saveAnswers = () => run(async () => {
    if (dirty) update(await save())
    const response = await api.saveAnswers(task.id, task.questions.filter(q => answers[q.id]?.trim()).map(q => ({question_id: q.id, field: q.field, text: answers[q.id]})))
    update(response); setNotice('Ответы внесены в ТЗ. Проверьте карточку и подтвердите сведения.')
  })
  return <section><div className="section"><button className="secondary" disabled={busy} onClick={back}>← Мои кейсы</button><button className="danger" disabled={busy} onClick={() => { if (window.confirm('Удалить кейс из кабинета и каталога? История откликов останется в базе.')) void run(async () => { await api.deleteTask(task.id); back() }) }}>Удалить кейс</button></div>
    <h2>{task.card.title}</h2><p className="muted">{task.is_published ? 'Опубликован. Изменения появятся у студентов после подтверждения.' : 'Черновик виден только вашему бизнесу.'}</p>
    <div className="steps"><button className={tab === 'editor' ? 'active' : ''} onClick={() => setTab('editor')}>ТЗ и AI-помощник</button><button className={tab === 'proposals' ? 'active' : ''} onClick={() => setTab('proposals')}>Предложения команд</button></div>
    {notice && <p role="status" className="success">{notice}</p>}
    {tab === 'proposals' ? <BusinessProposals task={task} busy={busy} run={run}/> : <div className="columns"><div>
      <section className="panel"><h3>AI-помощник заказчика</h3><p className="muted">Помогает превратить вашу потребность в понятное студентам задание. Он задаёт вопросы, а факты и окончательное ТЗ подтверждаете вы.</p>
        <div className="stack"><label>Тема<input maxLength={120} value={topic} onChange={e => setTopic(e.target.value)}/></label><label>Исходная потребность<textarea maxLength={5000} rows={3} value={description} onChange={e => setDescription(e.target.value)}/></label></div>
        <button className="primary" disabled={busy} onClick={clarify}>{task.questions.length ? 'Обновить уточняющие вопросы' : 'Помочь составить ТЗ'}</button>
        {task.ai_mode === 'fallback' && <p className="demo-note">AI сейчас недоступен. Ниже — вопросы резервного шаблонного режима, не ответ модели.</p>}
        {task.ai_mode === 'live' && <p className="muted">Вопросы подготовлены AI на основе вашего контекста.</p>}
        {task.questions.map((q, i) => <label className="question" key={q.id}><b>{i + 1}</b><span>{q.text}<textarea rows={3} maxLength={q.field === 'title' ? 200 : q.field === 'contact' ? 500 : q.field === 'interaction_format' ? 1000 : 2000} value={answers[q.id] || ''} onChange={e => setAnswers({...answers, [q.id]: e.target.value})}/></span></label>)}
        {task.questions.length > 0 && <button className="secondary" disabled={busy || !task.questions.some(q => answers[q.id]?.trim())} onClick={saveAnswers}>Внести ответы в карточку ТЗ</button>}
      </section>
      <section className="panel editor-panel"><h3>Карточка технического задания</h3><p className="muted">Неизвестные сведения можно оставить пустыми. Низкий рейтинг не мешает публикации.</p>
        <div className="formgrid">{(Object.keys(labels) as (keyof Card)[]).map(k => <label key={k} className={k === 'title' ? 'wide' : ''}>{labels[k]}{k === 'title' ? <input maxLength={200} value={card[k]} onChange={e => setCard({...card, [k]: e.target.value})}/> : <textarea rows={3} maxLength={k === 'contact' ? 500 : k === 'interaction_format' ? 1000 : k === 'users' || k === 'constraints' ? 2000 : k === 'context' ? 5000 : 3000} value={card[k]} onChange={e => setCard({...card, [k]: e.target.value})}/>}</label>)}</div>
        <div className="actions"><button className="secondary" disabled={busy} onClick={() => void run(async () => { update(await save()); setNotice('Черновик сохранён. Подтвердите его перед публикацией.') })}>Сохранить черновик</button>
          <button className="primary" disabled={busy || !card.title.trim()} onClick={() => void run(async () => { update(await save()); update(await api.confirm(task.id)); setNotice('ТЗ подтверждено. Рейтинг зафиксирован.') })}>{task.is_published ? 'Подтвердить и обновить публикацию' : 'Подтвердить ТЗ'}</button>
          {!task.is_published && <button className="primary" disabled={busy || dirty || !task.is_confirmed} onClick={() => void run(async () => { update(await api.publish(task.id)); setNotice('Кейс опубликован. Студенческие команды могут отправить предложение.') })}>Опубликовать кейс</button>}
        </div>{dirty && <p className="muted">Есть несохранённые изменения. Подтверждение также сохраняет текущий текст.</p>}
      </section>
    </div><Score r={task.readiness} confirmed={task.is_confirmed && !dirty}/></div>}
  </section>
}

function BusinessProposals({task, busy, run}: {task: Task; busy: boolean; run: Run}) {
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [decisions, setDecisions] = useState<Record<string, Proposal['status']>>({})
  const [results, setResults] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const accept = (items: Proposal[]) => { setProposals(items); setDecisions(Object.fromEntries(items.map(p => [p.id, p.status]))) }
  const refresh = useCallback(async () => { setLoading(true); try { accept(await api.proposals(task.id)) } finally { setLoading(false) } }, [task.id])
  useEffect(() => { void run(refresh) }, [run, refresh])
  return <section><div className="section"><div><h3>Сравните предложения</h3><p className="muted">Эти тексты видите только вы и авторы соответствующих откликов. Вы можете выбрать одну, несколько команд или отклонить все.</p></div><button className="secondary" disabled={busy} onClick={() => void run(refresh)}>Обновить отклики</button></div>
    {notice && <p role="status" className="success">{notice}</p>}{loading ? <p>Загружаем предложения…</p> : !proposals.length && <div className="empty">Пока нет предложений от студентов.</div>}
    {proposals.map(p => <article className="proposal proposal-full" key={p.id}><div><h3>{p.team.name}</h3><p className="muted">{p.team.skills.join(' · ')} · {p.team.technologies.join(' · ')}</p><ProposalText proposal={p}/><label>Решение по предложению<select disabled={busy} value={decisions[p.id] || 'pending'} onChange={e => setDecisions({...decisions, [p.id]: e.target.value as Proposal['status']})}><option value="pending">На рассмотрении</option><option value="selected">Выбрать команду</option><option value="rejected">Отклонить</option></select></label>
      {p.status === 'selected' && (p.milestone_confirmed ? <p className="success">Этап подтверждён · {p.team.progress_points} баллов у команды</p> : <div className="stack"><label>Результат выполненного этапа<textarea value={results[p.id] || ''} onChange={e => setResults({...results, [p.id]: e.target.value})} maxLength={4000}/></label><button className="secondary" disabled={busy || (results[p.id] || '').trim().length < 10} onClick={() => void run(async () => { await api.milestone(p.id, results[p.id]); await refresh(); setNotice('Этап подтверждён, команде начислено 10 баллов.') })}>Подтвердить этап · +10 баллов</button></div>)}
    </div></article>)}
    {proposals.length > 0 && <div className="actions"><button className="secondary" disabled={busy} onClick={() => void run(async () => { accept(await api.decide(task.id, [], proposals.map(p => p.id))); setNotice('Все предложения отклонены. Команды не выбраны.') })}>Отклонить все</button><button className="primary" disabled={busy} onClick={() => void run(async () => { accept(await api.decide(task.id, proposals.filter(p => decisions[p.id] === 'selected').map(p => p.id), proposals.filter(p => decisions[p.id] === 'rejected').map(p => p.id))); setNotice('Решение сохранено. Команды видят статус своих откликов.') })}>Сохранить решение</button></div>}
  </section>
}

function ProposalText({proposal: p}: {proposal: Proposal}) {
  return <div className="proposal-text"><b>Идея и пример решения</b><p>{p.idea}</p><b>План работы</b><p>{p.plan}</p><p>Срок: {p.duration_days} дней · <a href={p.prototype_url} target="_blank" rel="noreferrer">Прототип или пример решения ↗</a></p><span className={`status ${p.status}`}>{statusNames[p.status]}</span></div>
}

function StudentCatalog({actor, busy, run}: {actor: Actor; busy: boolean; run: Run}) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [selected, setSelected] = useState<Task | null>(null)
  const [loading, setLoading] = useState(true)
  const [topic, setTopic] = useState('')
  const [level, setLevel] = useState('')
  const load = useCallback(async () => { setLoading(true); try { setTasks(await api.catalog()) } finally { setLoading(false) } }, [])
  useEffect(() => { void run(load) }, [run, load])
  if (selected) return <StudentCase key={selected.id} task={selected} actor={actor} busy={busy} run={run} back={() => setSelected(null)}/>
  const filtered = tasks.filter(t => t.topic.toLowerCase().includes(topic.trim().toLowerCase()) && (!level || t.readiness.level === level))
  return <section><div className="section"><div><h2>Открытый каталог</h2><p className="muted">Все опубликованные кейсы доступны вашей команде. Сначала показываем задачи с более высоким рейтингом готовности.</p></div><button className="secondary" disabled={busy} onClick={() => void run(load)}>Обновить каталог</button></div>
    <div className="filters"><label>Тема<input placeholder="Фильтр по теме" value={topic} onChange={e => setTopic(e.target.value)}/></label><label>Готовность<select value={level} onChange={e => setLevel(e.target.value)}><option value="">Все уровни</option><option value="draft">Черновик</option><option value="working">Рабочая</option><option value="ready">Готовая</option><option value="priority">Приоритетная</option></select></label></div>
    {loading ? <p role="status">Загружаем каталог…</p> : <div className="grid">{filtered.map(t => <button className="task card-button" key={t.id} onClick={() => void run(async () => setSelected(await api.getTask(t.id)))}><span className="tag">{t.topic}</span><span className={`level ${t.readiness.level}`}>{t.readiness.total}/100</span><h3>{t.card.title}</h3><p>{t.card.context}</p><small>{t.readiness.level_label}</small><p className="link-text">Посмотреть ТЗ →</p></button>)}</div>}
    {!loading && !filtered.length && <div className="empty">Кейсов по этим условиям пока нет. Попробуйте изменить фильтры.</div>}
  </section>
}

function StudentCase({task, actor, busy, run, back}: {task: Task; actor: Actor; busy: boolean; run: Run; back: () => void}) {
  const [form, setForm] = useState<ProposalInput>({idea: '', plan: '', duration_days: 14, prototype_url: ''})
  const [sent, setSent] = useState(false)
  return <section><button className="secondary" onClick={back} disabled={busy}>← Каталог кейсов</button><h2>{task.card.title}</h2><span className="tag">{task.topic}</span>
    <div className="columns"><div><article className="panel read-card">{(Object.keys(labels) as (keyof Card)[]).filter(k => k !== 'title').map(k => <div key={k}><h3>{labels[k]}</h3><p>{task.card[k] || 'Пока не уточнено бизнесом'}</p></div>)}</article>
      <section className="panel editor-panel"><h3>Предложить решение</h3><p className="muted">От команды «{actor.name}». Предложение получит только владелец кейса. Другие студенты его не увидят.</p>
        {sent ? <div className="success" role="status"><p>Предложение отправлено бизнесу. Решение появится в разделе «Мои отклики».</p><button className="secondary" onClick={() => setSent(false)}>Отправить ещё одно предложение</button></div> : <form className="stack" onSubmit={e => { e.preventDefault(); void run(async () => { await api.createProposal(task.id, form); setSent(true); setForm({idea: '', plan: '', duration_days: 14, prototype_url: ''}) }) }}>
          <label>Идея и пример решения<textarea required minLength={10} maxLength={4000} rows={4} value={form.idea} onChange={e => setForm({...form, idea: e.target.value})}/></label>
          <label>План работы<textarea required minLength={10} maxLength={4000} rows={4} value={form.plan} onChange={e => setForm({...form, plan: e.target.value})}/></label>
          <label>Срок в днях<input required type="number" min={1} max={365} value={form.duration_days} onChange={e => setForm({...form, duration_days: Number(e.target.value)})}/></label>
          <label>Ссылка на прототип или пример решения<input required type="url" maxLength={500} placeholder="https://…" value={form.prototype_url} onChange={e => setForm({...form, prototype_url: e.target.value})}/></label>
          <button className="primary" disabled={busy || form.idea.trim().length < 10 || form.plan.trim().length < 10}>Отправить предложение бизнесу</button>
        </form>}
      </section></div><Score r={task.readiness} confirmed/>
    </div>
  </section>
}

function MyProposals() {
  const [items, setItems] = useState<Proposal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = () => { setLoading(true); setError(''); api.myProposals().then(setItems).catch(e => setError(errorText(e))).finally(() => setLoading(false)) }
  useEffect(load, [])
  return <section><div className="section"><div><h2>Мои отклики</h2><p className="muted">Только предложения вашей команды и решения бизнеса.</p></div><button className="secondary" disabled={loading} onClick={load}>Обновить статусы</button></div>
    {error && <p className="error" role="alert">{error}</p>}{loading ? <p role="status">Загружаем отклики…</p> : items.length ? items.map(p => <article className="proposal proposal-full" key={p.id}><div><h3>{p.task_title}</h3>{p.task_deleted && <p className="demo-note">Бизнес удалил кейс. История вашего предложения сохранена.</p>}<ProposalText proposal={p}/>{p.milestone_confirmed && <p className="success">Этап подтверждён бизнесом. Баллы команды: {p.team.progress_points}.</p>}</div></article>) : !error && <div className="empty">Вы ещё не отправляли предложений. Выберите кейс в каталоге.</div>}
  </section>
}

function TeamDirectory() {
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = () => { setError(''); setLoading(true); api.teams().then(setTeams).catch(e => setError(errorText(e))).finally(() => setLoading(false)) }
  useEffect(load, [])
  return <section><div className="section"><div><h2>Студенческие команды</h2><p className="muted">Опубликуйте кейс, чтобы команды могли предложить вам решение.</p></div><button className="secondary" disabled={loading} onClick={load}>Обновить команды</button></div>
    {error && <p className="error" role="alert">{error}</p>}{loading ? <p role="status">Загружаем команды…</p> : <div className="grid">{teams.map(t => <article className="team" key={t.id}><h3>{t.name}</h3><p>{t.interests.join(' · ')}</p><p><b>Навыки:</b> {t.skills.join(', ')}</p><div>{t.technologies.map(x => <span className="tag" key={x}>{x}</span>)}</div><p>{t.progress_points} баллов за подтверждённые этапы</p></article>)}</div>}
  </section>
}
