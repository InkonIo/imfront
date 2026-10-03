import { useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../auth'

export default function ChangePassword() {
  const { changePassword, logout } = useAuth()
  const [oldPassword, setOld] = useState('')
  const [newPassword, setNew] = useState('')
  const [repeat, setRepeat] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (newPassword.length < 8) return setError('Минимум 8 символов')
    if (newPassword !== repeat) return setError('Пароли не совпадают')
    setBusy(true)
    try {
      await changePassword(oldPassword, newPassword)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="card narrow" onSubmit={submit}>
      <h1>Новый пароль</h1>
      <p className="muted">Это первый вход. Замени временный пароль на свой.</p>

      <label>
        Временный пароль
        <input type="password" value={oldPassword} onChange={(e) => setOld(e.target.value)} />
      </label>
      <label>
        Новый пароль
        <input type="password" value={newPassword} onChange={(e) => setNew(e.target.value)} />
      </label>
      <label>
        Повтори новый пароль
        <input type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
      </label>

      {error && <div className="error">{error}</div>}
      <button className="btn primary" disabled={busy || !oldPassword || !newPassword}>
        {busy ? 'Сохраняем…' : 'Сохранить'}
      </button>
      <button type="button" className="btn ghost" onClick={logout}>
        Выйти
      </button>
    </form>
  )
}