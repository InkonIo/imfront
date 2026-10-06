import { useCallback, useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../auth'
import SoapBubbles from '../components/SoapBubbles'
import logo from '../assets/im-logo.svg'
import './login.css'

const SOUND_KEY = 'im_pop_sound'

function greeting() {
  const h = new Date().getHours()
  if (h < 5) return 'Доброй ночи ✨'
  if (h < 12) return 'Доброе утро ☀️'
  if (h < 18) return 'Добрый день 👋'
  return 'Добрый вечер 🌆'
}

function readSound() {
  try {
    return localStorage.getItem(SOUND_KEY) !== 'off'
  } catch {
    return true
  }
}

export default function Login() {
  const { login } = useAuth()
  const [hello] = useState(greeting)
  const [loginValue, setLoginValue] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [pops, setPops] = useState(0)
  const [sound, setSound] = useState(readSound)

  const onPop = useCallback(() => setPops((n) => n + 1), [])

  function toggleSound() {
    setSound((s) => {
      const next = !s
      try {
        localStorage.setItem(SOUND_KEY, next ? 'on' : 'off')
      } catch {
        // без сохранения
      }
      return next
    })
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await login(loginValue.trim(), password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось войти')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login">
      <SoapBubbles sound={sound} onPop={onPop} />

      <section className="login-hero">
        <div className="login-logo-tile">
          <img src={logo} alt="I'm" className="login-logo" />
        </div>

        <h1 className="login-title">Смена начинается здесь</h1>
        <p className="login-sub">
          Маршрут по таймингам, чек-листы и фото для директора. Всё, что нужно инсайду и менеджерам, в одном окне.
        </p>

        <ul className="login-points">
          <li>⏱️ Маршрут по таймингам</li>
          <li>📸 Фото сразу директору</li>
          <li>📋 Чек-лист смены</li>
          <li>🏆 Рейтинг недели</li>
        </ul>

        <div className="login-foot">
          <span>
            🫧 Лопни пузырь, пока ждёшь
            {pops > 0 && <b className="login-pops">Лопнуто: {pops}</b>}
          </span>
          <button type="button" className="login-sound" onClick={toggleSound} aria-pressed={sound}>
            {sound ? '🔊 Звук' : '🔇 Без звука'}
          </button>
        </div>
      </section>

      <form className="login-card" onSubmit={submit}>
        <div>
          <div className="login-hello">{hello}</div>
          <h2>Вход</h2>
        </div>

        <label className="login-field">
          Логин
          <input
            className="login-input"
            value={loginValue}
            onChange={(e) => setLoginValue(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
          />
        </label>

        <label className="login-field">
          Пароль
          <span className="login-pass">
            <input
              className="login-input"
              type={showPass ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
            <button type="button" className="login-pass-toggle" onClick={() => setShowPass((v) => !v)}>
              {showPass ? 'Скрыть' : 'Показать'}
            </button>
          </span>
        </label>

        {error && (
          <div className="login-error" role="alert">
            {error}
          </div>
        )}

        <button className="login-submit" disabled={busy || !loginValue || !password}>
          {busy ? 'Входим…' : 'Войти'}
        </button>

        <p className="login-help">Забыли пароль? Попросите директора или суперадмина сбросить его.</p>
      </form>
    </div>
  )
}