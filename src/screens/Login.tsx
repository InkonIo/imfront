import { useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../auth'
import Bubbles from '../components/Bubbles'
import './login.css'

function greeting() {
  const h = new Date().getHours()
  if (h < 5) return 'Доброй ночи 🌌'
  if (h < 12) return 'Доброе утро 🌅'
  if (h < 18) return 'Добрый день ☀️'
  return 'Добрый вечер 🌙'
}

export default function Login() {
  const { login } = useAuth()
  const [hello] = useState(greeting)
  const [loginValue, setLoginValue] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await login(loginValue.trim(), password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-page">
      <aside className="login-brand">
        <Bubbles />
        <div className="logo">IM</div>
        <h1 className="brand-title">IM Inside</h1>
        <p className="brand-sub">Смены, чек-листы и контроль точек в одном месте.</p>
        <ul className="brand-points">
          <li>🧭 Маршрут инсайда по таймингам</li>
          <li>🌅 Утро и 🌙 вечер, у каждой свой чек-лист</li>
          <li>📸 Фото проблемных зон сразу директору</li>
        </ul>
        <div className="brand-foot">Лопни пузырь, пока ждёшь 😉</div>
      </aside>

      <section className="login-main">
        <Bubbles subtle />
        <form className="login-form" onSubmit={submit}>
          <div>
            <div className="hello">{hello}</div>
            <h1>Вход</h1>
            <p className="muted">Войди в свой аккаунт, чтобы начать смену</p>
          </div>

          <label>
            Логин
            <input
              value={loginValue}
              onChange={(e) => setLoginValue(e.target.value)}
              autoComplete="username"
              autoFocus
            />
          </label>

          <label>
            Пароль
            <div className="pass-field">
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
              <button
                type="button"
                className="pass-toggle"
                onClick={() => setShowPass((v) => !v)}
                aria-label={showPass ? 'Скрыть пароль' : 'Показать пароль'}
              >
                {showPass ? '🙈' : '👁️'}
              </button>
            </div>
          </label>

          {error && <div className="error shake">{error}</div>}
          <button className="btn primary" disabled={busy || !loginValue || !password}>
            {busy ? 'Входим…' : 'Войти'}
          </button>
        </form>
      </section>
    </div>
  )
}