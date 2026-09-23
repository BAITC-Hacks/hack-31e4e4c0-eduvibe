import { ApiError } from './api'
import type { Card } from './api'

export type AsyncAction = (work: () => Promise<void>) => void

export const emptyCard: Card = {
  title: '',
  context: '',
  need: '',
  users: '',
  data_materials: '',
  constraints: '',
  expected_result: '',
  success_criteria: '',
  contact: '',
  interaction_format: '',
}

export const labels: Record<keyof Card, string> = {
  title: 'Название кейса',
  context: 'Контекст',
  need: 'Потребность',
  users: 'Пользователи',
  data_materials: 'Данные и материалы',
  constraints: 'Ограничения',
  expected_result: 'Ожидаемый результат',
  success_criteria: 'Критерии успеха',
  contact: 'Контакт бизнеса',
  interaction_format: 'Формат взаимодействия',
}

export const fieldLimits: Record<keyof Card, number> = {
  title: 200,
  context: 5000,
  need: 3000,
  users: 2000,
  data_materials: 3000,
  constraints: 2000,
  expected_result: 3000,
  success_criteria: 3000,
  contact: 500,
  interaction_format: 1000,
}

export const caseSections: {
  id: string
  title: string
  description: string
  fields: (keyof Card)[]
}[] = [
  {
    id: 'problem',
    title: 'Проблема',
    description: 'Что происходит сейчас, что нужно изменить и кому требуется решение.',
    fields: ['context', 'need', 'users'],
  },
  {
    id: 'result',
    title: 'Результат',
    description: 'Какой результат должна дать команда и по каким признакам его примут.',
    fields: ['expected_result', 'success_criteria'],
  },
  {
    id: 'constraints',
    title: 'Условия работы',
    description: 'Доступные данные, ограничения, контакт и формат взаимодействия.',
    fields: ['data_materials', 'constraints', 'contact', 'interaction_format'],
  },
]

export const levelClass = (level?: string) => `level ${level || 'draft'}`

export function errorMessage(reason: unknown) {
  if (reason instanceof ApiError) {
    const detail = reason.details
      .map((item) => item.message)
      .filter(Boolean)
      .slice(0, 2)
      .join(' ')
    return detail ? `${reason.message} ${detail}` : reason.message
  }
  return reason instanceof Error ? reason.message : 'Не удалось выполнить запрос.'
}

export function isHttpUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}
