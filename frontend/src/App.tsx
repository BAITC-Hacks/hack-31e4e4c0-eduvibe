import { useEffect, useState } from 'react'
import { api, authToken } from './api'
import type { Actor, DemoProfiles, Proposal, Role, Task, Team } from './api'
import { BusinessWorkspace } from './CaseWorkspace'
import {
  CatalogView,
  MyProposalsView,
  MyTasksView,
  NewTaskScreen,
  TaskDetails,
  TeamsView,
} from './Views'
import { errorMessage } from './ui'
import type { AsyncAction } from './ui'

type Page = 'workspace' | 'catalog' | 'teams' | 'myTasks' | 'myProposals'

export default function App() {
  const [page, setPage] = useState<Page>('catalog')
  const [actor, setActor] = useState<Actor | null>(null)
  const [profiles, setProfiles] = useState<DemoProfiles | null>(null)
  const [task, setTask] = useState<Task | null>(null)
  const [catalog, setCatalog] = useState<Task[]>([])
  const [myTasks, setMyTasks] = useState<Task[]>([])
  const [myProposals, setMyProposals] = useState<Proposal[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [initialized, setInitialized] = useState(false)
  const [connection, setConnection] = useState<'checking' | 'online' | 'offline'>('checking')

  const action: AsyncAction = async (work) => {
    setBusy(true)
    setError('')
    try {
      await work()
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setBusy(false)
    }
  }

  const clearSession = (message = '') => {
    authToken.clear()
    setActor(null)
    setTask(null)
    setCatalog([])
    setMyTasks([])
    setMyProposals([])
    setTeams([])
    setPage('catalog')
    if (message) setError(message)
  }

  useEffect(() => {
    const unauthorized = () => clearSession('Сессия завершена. Выберите роль и войдите снова.')
    window.addEventListener('eduvibe:unauthorized', unauthorized)
    return () => window.removeEventListener('eduvibe:unauthorized', unauthorized)
  }, [])

  useEffect(() => {
    let active = true
    const bootstrap = async () => {
      try {
        const [health, availableProfiles] = await Promise.all([api.health(), api.demoProfiles()])
        if (!active) return
        setConnection(health.status === 'ok' && health.database === 'ok' ? 'online' : 'offline')
        setProfiles(availableProfiles)
        if (authToken.get()) {
          try {
            setActor(await api.whoami())
          } catch {
            authToken.clear()
          }
        }
      } catch (reason) {
        if (!active) return
        setConnection('offline')
        setError(errorMessage(reason))
      } finally {
        if (active) setInitialized(true)
      }
    }
    void bootstrap()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!actor) return
    let active = true
    const loadRoleData = async () => {
      setBusy(true)
      try {
        const teamList = await api.teams()
        if (!active) return
        setTeams(teamList)
        if (actor.role === 'business') {
          const tasks = await api.myTasks()
          if (!active) return
          setMyTasks(tasks)
          setPage((current) => (current === 'catalog' || current === 'teams' ? current : 'myTasks'))
        } else {
          const [tasks, proposals] = await Promise.all([api.catalog(), api.myProposals()])
          if (!active) return
          setCatalog(tasks)
          setMyProposals(proposals)
          setPage((current) => (current === 'teams' || current === 'myProposals' ? current : 'catalog'))
        }
      } catch (reason) {
        if (active) setError(errorMessage(reason))
      } finally {
        if (active) setBusy(false)
      }
    }
    void loadRoleData()
    return () => {
      active = false
    }
  }, [actor])

  const login = (role: Role, profileId: string) =>
    action(async () => {
      const session = await api.login(role, profileId)
      authToken.set(session.token)
      setActor({ role: session.role, profile_id: session.profile_id, name: session.name })
      setPage(role === 'business' ? 'myTasks' : 'catalog')
    })

  const logout = () =>
    action(async () => {
      try {
        await api.logout()
      } finally {
        clearSession()
      }
    })

  const refreshTeams = async () => setTeams(await api.teams())

  const searchCatalog = (filters?: { topic?: string; readiness_level?: string }) =>
    action(async () => setCatalog(await api.catalog(filters)))

  const showCatalog = () => {
    setPage('catalog')
    void searchCatalog()
  }

  const openTask = (id: string) =>
    action(async () => {
      setTask(await api.getTask(id))
      setPage('workspace')
    })

  const openNewTask = () => {
    setTask(null)
    setPage('workspace')
  }

  const updateTask = (next: Task) => {
    setTask(next)
    setMyTasks((items) => items.map((item) => (item.id === next.id ? next : item)))
  }

  const addTask = (next: Task) => {
    setTask(next)
    setMyTasks((items) => [next, ...items])
    setPage('workspace')
  }

  const removeTask = (id: string) =>
    action(async () => {
      await api.deleteTask(id)
      setMyTasks((items) => items.filter((item) => item.id !== id))
      if (task?.id === id) setTask(null)
    })

  const addProposal = (proposal: Proposal) => {
    setMyProposals((items) => [proposal, ...items])
  }

  if (!initialized) return <BootScreen />

  if (!actor) {
    return (
      <LoginScreen
        profiles={profiles}
        busy={busy}
        error={error}
        connection={connection}
        login={login}
        clearError={() => setError('')}
      />
    )
  }

  const pageTitle =
    page === 'workspace'
      ? actor.role === 'business'
        ? task
          ? 'Рабочая карта'
          : 'Новый кейс'
        : 'Карточка задачи'
      : page === 'catalog'
        ? 'Каталог задач'
        : page === 'teams'
          ? 'Команды'
          : page === 'myTasks'
            ? 'Мои кейсы'
            : 'Мои отклики'

  const initials = actor.name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <b>
            <span>e</span>
          </b>
          <strong>
            EduVibe
            <small>{actor.role === 'business' ? 'business cabinet' : 'student cabinet'}</small>
          </strong>
        </div>
        <div className="role-card">
          <span>{actor.role === 'business' ? 'БИЗНЕС' : 'КОМАНДА'}</span>
          <b>{actor.name}</b>
          <small>ID {actor.profile_id.slice(0, 10)}</small>
        </div>
        <span className="side-label">НАВИГАЦИЯ</span>
        <nav aria-label="Основная навигация">
          {actor.role === 'business' ? (
            <>
              <button className={page === 'myTasks' ? 'active' : ''} onClick={() => setPage('myTasks')}>
                <i>◫</i> Мои кейсы
              </button>
              <button className={page === 'workspace' && !task ? 'active' : ''} onClick={openNewTask}>
                <i>＋</i> Новый кейс
              </button>
              <button className={page === 'catalog' ? 'active' : ''} onClick={showCatalog}>
                <i>⌁</i> Общий каталог
              </button>
            </>
          ) : (
            <>
              <button className={page === 'catalog' ? 'active' : ''} onClick={showCatalog}>
                <i>⌁</i> Каталог задач
              </button>
              <button className={page === 'myProposals' ? 'active' : ''} onClick={() => setPage('myProposals')}>
                <i>↗</i> Мои отклики
              </button>
            </>
          )}
          <button className={page === 'teams' ? 'active' : ''} onClick={() => setPage('teams')}>
            <i>◉</i> Команды
          </button>
        </nav>
        <div className="legend">
          <span className="side-label">СИГНАЛЫ</span>
          <p>
            <i className="dot gold" /> Кейс бизнеса
          </p>
          <p>
            <i className="dot mint" /> Данные карточки
          </p>
          <p>
            <i className="dot violet" /> Команды и отклики
          </p>
        </div>
        <footer>
          <span className={connection === 'online' ? 'online' : `online ${connection}`} />
          {connection === 'online' ? 'API И БАЗА В СЕТИ' : 'API НЕДОСТУПЕН'}
          <small>session protected / v2</small>
        </footer>
      </aside>

      <main>
        <header>
          <div>
            <span className="eyebrow">EDUVIBE / {actor.role === 'business' ? 'BUSINESS' : 'STUDENT'} ORBIT</span>
            <h1>{pageTitle}</h1>
          </div>
          <div className="header-context">
            <span className="session-name">
              <b>{actor.name}</b>
              <small>{actor.role === 'business' ? 'Представитель бизнеса' : 'Студенческая команда'}</small>
            </span>
            <span className="avatar">{initials}</span>
            <button className="logout-button" onClick={logout}>
              Выйти
            </button>
          </div>
        </header>

        {busy && (
          <div className="loading-line" aria-label="Выполняется запрос">
            <i />
          </div>
        )}
        {error && (
          <div className="error" role="alert">
            <span>!</span>
            <div>
              <b>Не удалось завершить действие</b>
              <small>{error}</small>
            </div>
            <button aria-label="Закрыть ошибку" onClick={() => setError('')}>
              ×
            </button>
          </div>
        )}

        <div className={`page-transition page-${page}`} key={page}>
          {page === 'myTasks' && actor.role === 'business' ? (
            <MyTasksView tasks={myTasks} open={openTask} create={openNewTask} remove={removeTask} />
          ) : page === 'myProposals' && actor.role === 'student' ? (
            <MyProposalsView proposals={myProposals} openTask={openTask} />
          ) : page === 'catalog' ? (
            <CatalogView role={actor.role} tasks={catalog} busy={busy} open={openTask} search={searchCatalog} />
          ) : page === 'teams' ? (
            <TeamsView teams={teams} actor={actor} />
          ) : actor.role === 'business' ? (
            task && task.owner_id === actor.profile_id ? (
              <BusinessWorkspace
                actor={actor}
                task={task}
                busy={busy}
                action={action}
                onTask={updateTask}
                onBack={() => setPage('myTasks')}
                reportError={setError}
                refreshTeams={refreshTeams}
              />
            ) : task ? (
              <TaskDetails
                actor={actor}
                task={task}
                myProposals={[]}
                action={action}
                onProposal={() => undefined}
                back={() => setPage('catalog')}
              />
            ) : (
              <NewTaskScreen busy={busy} action={action} onCreated={addTask} />
            )
          ) : task ? (
            <TaskDetails
              actor={actor}
              task={task}
              myProposals={myProposals}
              action={action}
              onProposal={addProposal}
              back={() => setPage('catalog')}
            />
          ) : (
            <CatalogView role={actor.role} tasks={catalog} busy={busy} open={openTask} search={searchCatalog} />
          )}
        </div>
      </main>
    </div>
  )
}

function LoginScreen({
  profiles,
  busy,
  error,
  connection,
  login,
  clearError,
}: {
  profiles: DemoProfiles | null
  busy: boolean
  error: string
  connection: 'checking' | 'online' | 'offline'
  login: (role: Role, profileId: string) => void
  clearError: () => void
}) {
  const [role, setRole] = useState<Role>('business')
  const available = role === 'business' ? profiles?.businesses || [] : profiles?.teams || []
  const [selected, setSelected] = useState('')
  const selectedProfile = available.find((item) => item.id === selected)

  const chooseRole = (next: Role) => {
    setRole(next)
    setSelected('')
  }

  return (
    <div className="auth-page">
      <div className="auth-visual">
        <div className="auth-brand brand">
          <b>
            <span>e</span>
          </b>
          <strong>
            EduVibe
            <small>role-based orbit network</small>
          </strong>
        </div>
        <div className="auth-orbit" aria-hidden="true">
          <div className="auth-core">CASE</div>
          <i className="auth-node one" />
          <i className="auth-node two" />
          <i className="auth-node three" />
          <span className="auth-line line-one" />
          <span className="auth-line line-two" />
          <span className="auth-line line-three" />
        </div>
        <div className="auth-copy">
          <span className="eyebrow">ROLE-BASED WORKSPACE</span>
          <h1>Один кейс.<br />Две стороны.</h1>
          <p>Бизнес формирует и публикует задачу. Студенческая команда выбирает её и отправляет предложение.</p>
        </div>
      </div>

      <div className="auth-panel">
        <div className="auth-status">
          <span className={connection === 'online' ? 'online' : `online ${connection}`} />
          {connection === 'online' ? 'Backend подключён' : 'Backend недоступен'}
        </div>
        <span className="eyebrow">ДЕМО-ВХОД</span>
        <h2>Выберите свою роль</h2>
        <p>Регистрация не требуется: backend выдаёт временную сессию для выбранного демонстрационного профиля.</p>

        {error && (
          <div className="error auth-error" role="alert">
            <span>!</span>
            <div>
              <b>Не удалось войти</b>
              <small>{error}</small>
            </div>
            <button aria-label="Закрыть ошибку" onClick={clearError}>×</button>
          </div>
        )}

        <div className="role-switch">
          <button className={role === 'business' ? 'active' : ''} onClick={() => chooseRole('business')}>
            <b>01</b>
            <span>Бизнес<small>Создать и опубликовать</small></span>
          </button>
          <button className={role === 'student' ? 'active' : ''} onClick={() => chooseRole('student')}>
            <b>02</b>
            <span>Команда<small>Найти задачу и откликнуться</small></span>
          </button>
        </div>

        <div className="profile-list">
          <span className="eyebrow">ДЕМО-ПРОФИЛЬ</span>
          {available.map((profile) => (
            <button
              className={selected === profile.id ? 'selected' : ''}
              key={profile.id}
              onClick={() => setSelected(profile.id)}
            >
              <span className="profile-avatar">{profile.name.slice(0, 2).toUpperCase()}</span>
              <span>
                <b>{profile.name}</b>
                <small>{role === 'business' ? 'Представитель бизнеса' : 'Студенческая команда'}</small>
              </span>
              <i>{selected === profile.id ? '✓' : '→'}</i>
            </button>
          ))}
        </div>

        <button
          className="primary auth-submit"
          disabled={busy || !selectedProfile}
          onClick={() => selectedProfile && login(role, selectedProfile.id)}
        >
          Войти как {selectedProfile?.name || (role === 'business' ? 'бизнес' : 'команда')} →
        </button>
        <small className="auth-hint">Токен хранится только до закрытия вкладки браузера.</small>
      </div>
    </div>
  )
}

function BootScreen() {
  return (
    <div className="boot-screen">
      <div className="boot-orbit">
        <i />
        <span>e</span>
      </div>
      <p>Подключаем Orbit Network…</p>
    </div>
  )
}
