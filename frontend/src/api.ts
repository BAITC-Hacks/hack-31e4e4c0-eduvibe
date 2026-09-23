export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'
export type Role = 'business' | 'student'
export type Actor = {role: Role; profile_id: string; name: string}
export type Session = Actor & {token: string}
export type Card = {title: string; context: string; need: string; users: string; data_materials: string; constraints: string; expected_result: string; success_criteria: string; contact: string; interaction_format: string}
export type Readiness = {total: number; level: 'draft'|'working'|'ready'|'priority'; level_label: string; breakdown: {field: string; label: string; points: number; max_points: number; hint?: string|null}[]; missing_information: string[]; suggestions: string[]}
export type Question = {id: string; field: keyof Card; text: string}
export type Answer = {question_id: string; field: keyof Card; text: string}
export type Task = {id: string; owner_id: string; description: string; topic: string; card: Card; questions: Question[]; answers: Answer[]; readiness: Readiness; is_confirmed: boolean; is_published: boolean; ai_mode: string|null; created_at: string; updated_at: string}
export type Team = {id: string; name: string; interests: string[]; skills: string[]; technologies: string[]; progress_points: number}
export type Proposal = {id: string; task_id: string; task_title: string; task_deleted: boolean; milestone_confirmed: boolean; team_id: string; team: Team; idea: string; plan: string; duration_days: number; prototype_url: string; status: 'pending'|'selected'|'rejected'; created_at: string}
export type ProposalInput = {idea: string; plan: string; duration_days: number; prototype_url: string}
export type Profiles = {businesses: {id: string; name: string}[]; teams: Team[]}

const TOKEN_KEY = 'eduvibe-session'
export const token = () => sessionStorage.getItem(TOKEN_KEY)
export const setToken = (value: string | null) => value ? sessionStorage.setItem(TOKEN_KEY, value) : sessionStorage.removeItem(TOKEN_KEY)

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  headers.set('Content-Type', 'application/json')
  const currentToken = token()
  if (currentToken) headers.set('Authorization', `Bearer ${currentToken}`)
  let response: Response
  try { response = await fetch(`${API_URL}${path}`, {...init, headers}) }
  catch { throw new Error('Не удалось связаться с сервером. Проверьте подключение и повторите попытку.') }
  if (response.status === 204) return undefined as T
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new Event('session-expired'))
    throw new Error(body?.error?.message || 'Не удалось выполнить действие. Проверьте данные.')
  }
  return body as T
}
const json = (method: string, body?: unknown): RequestInit => ({method, ...(body === undefined ? {} : {body: JSON.stringify(body)})})

export const api = {
  profiles: () => request<Profiles>('/demo/profiles'),
  login: (role: Role, profile_id: string) => request<Session>('/session', json('POST', {role, profile_id})),
  session: () => request<Actor>('/session'),
  logout: () => request<void>('/session', json('DELETE')),
  mine: () => request<Task[]>('/tasks/mine'),
  createTask: (p: {description: string; topic: string}) => request<Task>('/tasks', json('POST', p)),
  getTask: (id: string) => request<Task>(`/tasks/${id}`),
  deleteTask: (id: string) => request<void>(`/tasks/${id}`, json('DELETE')),
  clarify: (id: string) => request<{questions: Question[]; ai_mode: string}>(`/tasks/${id}/clarifications`, json('POST')),
  saveAnswers: (id: string, answers: Answer[]) => request<Task>(`/tasks/${id}/answers`, json('PUT', {answers})),
  updateCard: (id: string, card: Card, topic: string, description: string) => request<Task>(`/tasks/${id}`, json('PATCH', {card, topic, description})),
  confirm: (id: string) => request<Task>(`/tasks/${id}/confirm`, json('POST')),
  publish: (id: string) => request<Task>(`/tasks/${id}/publish`, json('POST')),
  catalog: () => request<Task[]>('/tasks'),
  teams: () => request<Team[]>('/teams'),
  proposals: (id: string) => request<Proposal[]>(`/tasks/${id}/proposals`),
  myProposals: () => request<Proposal[]>('/me/proposals'),
  createProposal: (id: string, p: ProposalInput) => request<Proposal>(`/tasks/${id}/proposals`, json('POST', p)),
  decide: (id: string, selected: string[], rejected: string[]) => request<Proposal[]>(`/tasks/${id}/decision`, json('PUT', {selected_proposal_ids: selected, rejected_proposal_ids: rejected})),
  milestone: (id: string, result: string) => request<unknown>(`/proposals/${id}/milestone`, json('PUT', {result, points: 10})),
}
