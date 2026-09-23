# EduVibe frontend

React + TypeScript + Vite-интерфейс для сквозного сценария EduVibe.

## Запуск

```bash
cd frontend
npm install
npm run dev
```

По умолчанию приложение использует `http://localhost:8000/api/v1`. Для другого адреса скопируйте `.env.example` в `.env` и задайте `VITE_API_URL`.

Основной сценарий: создание черновика → AI-уточнения → ответы и рейтинг → редактирование карточки → подтверждение → публикация → отклики → ручное решение бизнеса → подтверждение milestone.

Проверка production-сборки: `npm run build`.
