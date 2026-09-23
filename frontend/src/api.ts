export const API_URL = import.meta.env.VITE_API_URL || '/api/v1'

const TOKEN_KEY = 'eduvibe_demo_token'

export type Role = 'business' | 'student'
export type Actor = { role: Role; profile_id: string; name: string }
export type SessionResponse = Actor & { token: string }

export type Card = {
  title: string
  context: string
  need: string
  users: string
  data_materials: string
  constraints: string
  expected_result: string
  success_criteria: string
  contact: string
  interaction_format: string
}

export type Readiness = {
  total: number
  level: 'draft' | 'working' | 'ready' | 'priority'
  level_label: string
  breakdown: {
    field: string
    label: string
    points: number
    max_points: number
    hint?: string | null
  }[]
  missing_information: string[]
  suggestions: string[]
}

export type Question = { id: string; field: string; text: string }

export type Task = {
  id: string
  owner_id: string
  description: string
  topic: string
  card: Card
  questions: Question[]
  answers: { question_id: string; field: string; text: string }[]
  readiness: Readiness
  is_confirmed: boolean
  is_published: boolean
  ai_mode: 'live' | 'fallback' | null
  created_at: string
  updated_at: string
}

export type Team = {
  id: string
  name: string
  interests: string[]
  skills: string[]
  technologies: string[]
  progress_points: number
}

export type DemoProfiles = {
  businesses: { id: string; name: string }[]
  teams: Team[]
}

export type Proposal = {
  id: string
  task_title: string
  task_deleted: boolean
  milestone_confirmed: boolean
  task_id: string
  team_id: string
  team: Team
  idea: string
  plan: string
  duration_days: number
  prototype_url: string
  status: 'pending' | 'selected' | 'rejected'
  created_at: string
}

export type Milestone = {
  id: string
  proposal_id: string
  result: string
  points: number
  confirmed_at: string
  team_progress_points: number
}

export type ApiErrorDetail = { field?: string; message?: string; [key: string]: unknown }

export class ApiError extends Error {
  code: string
  status: number
  details: ApiErrorDetail[]

  constructor(message: string, code = 'REQUEST_FAILED', status = 0, details: ApiErrorDetail[] = []) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.details = details
  }
}

export const authToken = {
  get: () => sessionStorage.getItem(TOKEN_KEY),
  set: (token: string) => sessionStorage.setItem(TOKEN_KEY, token),
  clear: () => sessionStorage.removeItem(TOKEN_KEY),
}

async function request<T>(path: string, init?: RequestInit, authenticated = true): Promise<T> {
  let response: Response
  const token = authToken.get()

  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(authenticated && token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers || {}),
      },
    })
  } catch {
    throw new ApiError('Backend недоступен. Проверьте адрес API и подключение к сети.', 'BACKEND_UNAVAILABLE')
  }

  if (response.status === 204) return undefined as T

  const body = await response.json().catch(() => null)
  if (!response.ok) {
    if (response.status === 401) {
      authToken.clear()
      window.dispatchEvent(new Event('eduvibe:unauthorized'))
    }
    throw new ApiError(
      body?.error?.message || body?.detail?.[0]?.msg || 'Проверьте введённые данные.',
      body?.error?.code || 'REQUEST_FAILED',
      response.status,
      body?.error?.details || body?.detail || [],
    )
  }

  return body as T
}

export const api = {
  health: () => request<{ status: string; database: string }>('/health', undefined, false),
  demoProfiles: () => request<DemoProfiles>('/demo/profiles', undefined, false),
  login: (role: Role, profile_id: string) =>
    request<SessionResponse>(
      '/session',
      { method: 'POST', body: JSON.stringify({ role, profile_id }) },
      false,
    ),
  whoami: () => request<Actor>('/session'),
  logout: () => request<void>('/session', { method: 'DELETE' }),

  createTask: (payload: { description: string; topic: string }) =>
    request<Task>('/tasks', { method: 'POST', body: JSON.stringify(payload) }),
  catalog: (filters?: { topic?: string; readiness_level?: string }) => {
    const query = new URLSearchParams()
    if (filters?.topic?.trim()) query.set('topic', filters.topic.trim())
    if (filters?.readiness_level) query.set('readiness_level', filters.readiness_level)
    return request<Task[]>(`/tasks${query.size ? `?${query.toString()}` : ''}`)
  },
  myTasks: () => request<Task[]>('/tasks/mine'),
  getTask: (id: string) => request<Task>(`/tasks/${id}`),
  deleteTask: (id: string) => request<void>(`/tasks/${id}`, { method: 'DELETE' }),
  clarify: (id: string) =>
    request<{ questions: Question[]; ai_mode: 'live' | 'fallback' }>(`/tasks/${id}/clarifications`, {
      method: 'POST',
    }),
  saveAnswers: (id: string, answers: { question_id: string; field: string; text: string }[]) =>
    request<Task>(`/tasks/${id}/answers`, {
      method: 'PUT',
      body: JSON.stringify({ answers }),
    }),
  updateCard: (id: string, card: Card, topic?: string, description?: string) =>
    request<Task>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ card, topic, description }) }),
  confirm: (id: string) => request<Task>(`/tasks/${id}/confirm`, { method: 'POST' }),
  publish: (id: string) => request<Task>(`/tasks/${id}/publish`, { method: 'POST' }),

  teams: () => request<Team[]>('/teams'),
  createProposal: (
    id: string,
    payload: { idea: string; plan: string; duration_days: number; prototype_url: string },
  ) =>
    request<Proposal>(`/tasks/${id}/proposals`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  proposals: (id: string) => request<Proposal[]>(`/tasks/${id}/proposals`),
  myProposals: () => request<Proposal[]>('/me/proposals'),
  decide: (id: string, selected: string[], rejected: string[]) =>
    request<Proposal[]>(`/tasks/${id}/decision`, {
      method: 'PUT',
      body: JSON.stringify({ selected_proposal_ids: selected, rejected_proposal_ids: rejected }),
    }),
  milestone: (id: string, payload: { result: string; points: number }) =>
    request<Milestone>(`/proposals/${id}/milestone`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
}
