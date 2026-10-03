import { useState } from 'react'
import type { FormEvent } from 'react'
import { api } from '../api'
import { useAuth } from '../auth'
import { ACCOUNT_ROLE_LABEL } from '../types'
import type { AccountRole, Outlet, User } from '../types'
import { Modal, StatusPill, TableState, Toolbar, errorText, useList } from './ui'

const ROLES = Object.keys(ACCOUNT_ROLE_LABEL) as AccountRole[]

type Secret = { login: string; password: string; title: string }

export default function UsersPage() {
  const { user: me } = useAuth()
  const users = useList(api.adminUsers)
  const outlets = useList(api.adminOutlets)
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<AccountRole | 'all'>('all')
  const [editing, setEditing] = useState<User | 'new' | null>(null)
  const [secret, setSecret] = useState<Secret | null>(null)
  const [actionError, setActionError] = useState('')

  const q = query.trim().toLowerCase()
  const filtered = (users.items ?? []).filter(
    (u) =>
      (roleFilter === 'all' || u.accountRole === roleFilter) &&
      (u.fullName.toLowerCase().includes(q) || u.login.toLowerCase().includes(q)),
  )

  async function run(action: () => Promise<unknown>) {
    setActionError('')
    try {
      await action()
      await users.reload()
    } catch (err) {
      setActionError(errorText(err))
    }
  }

  function toggle(u: User) {
    return run(() => api.updateUser(u.id, { active: !u.active }))
  }

  function remove(u: User) {
    if (!confirm(`Удалить «${u.fullName}»? Если у него уже есть смены, удаление не пройдёт, тогда просто отключи.`)) return
    return run(() => api.deleteUser(u.id))
  }

  async function reset(u: User) {
    if (!confirm(`Сбросить пароль для «${u.fullName}»?`)) return
    setActionError('')
    try {
      const res = await api.resetPassword(u.id)
      setSecret({ login: res.user.login, password: res.temporaryPassword, title: 'Новый временный пароль' })
      await users.reload()
    } catch (err) {
      setActionError(errorText(err))
    }
  }

  return (
    <div className="page">
      <Toolbar
        query={query}
        onQuery={setQuery}
        placeholder="Поиск по имени или логину…"
        addLabel="Пользователь"
        onAdd={() => setEditing('new')}
      >
        <select
          className="select"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as AccountRole | 'all')}
        >
          <option value="all">Все роли</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ACCOUNT_ROLE_LABEL[r]}
            </option>
          ))}
        </select>
      </Toolbar>

      {(users.error || outlets.error) && <div className="error">{users.error || outlets.error}</div>}
      {actionError && <div className="error">{actionError}</div>}

      <div className="panel table-panel">
        <TableState loading={users.items === null} empty={users.items !== null && filtered.length === 0} />
        {filtered.length > 0 && (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Сотрудник</th>
                  <th>Роль</th>
                  <th>Точки</th>
                  <th>Статус</th>
                  <th style={{ width: 190 }} />
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => {
                  const isSelf = u.id === me?.id
                  return (
                    <tr key={u.id} className={u.active ? '' : 'dimmed'}>
                      <td>
                        <div className="user-cell">
                          <span className="strong">
                            {u.fullName} {isSelf && <span className="muted small">(ты)</span>}
                          </span>
                          <span className="muted small">@{u.login}</span>
                        </div>
                      </td>
                      <td>
                        <span className="pill role">{ACCOUNT_ROLE_LABEL[u.accountRole] ?? u.accountRole}</span>
                      </td>
                      <td>
                        {u.outlets.length === 0 ? (
                          <span className="muted">—</span>
                        ) : (
                          <div className="chips">
                            {u.outlets.slice(0, 2).map((o) => (
                              <span key={o.id} className="chip-sm">
                                {o.name}
                              </span>
                            ))}
                            {u.outlets.length > 2 && <span className="chip-sm">+{u.outlets.length - 2}</span>}
                          </div>
                        )}
                      </td>
                      <td>
                        <div className="chips">
                          <StatusPill active={u.active} on="Активен" off="Отключён" />
                          {u.mustChangePassword && <span className="pill warn">ждёт смены пароля</span>}
                        </div>
                      </td>
                      <td className="row-actions">
                        <button className="icon-btn" title="Сбросить пароль" onClick={() => reset(u)}>
                          🔑
                        </button>
                        <button
                          className="icon-btn"
                          title={u.active ? 'Отключить' : 'Включить'}
                          disabled={isSelf}
                          onClick={() => toggle(u)}
                        >
                          {u.active ? '⏸️' : '▶️'}
                        </button>
                        <button className="icon-btn" title="Изменить" onClick={() => setEditing(u)}>
                          ✏️
                        </button>
                        <button
                          className="icon-btn danger"
                          title="Удалить"
                          disabled={isSelf}
                          onClick={() => remove(u)}
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <UserForm
          user={editing === 'new' ? null : editing}
          outlets={outlets.items ?? []}
          isSelf={editing !== 'new' && editing.id === me?.id}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null)
            await users.reload()
          }}
          onCreated={async (s) => {
            setEditing(null)
            setSecret(s)
            await users.reload()
          }}
        />
      )}

      {secret && <SecretModal secret={secret} onClose={() => setSecret(null)} />}
    </div>
  )
}

function UserForm({
  user,
  outlets,
  isSelf,
  onClose,
  onSaved,
  onCreated,
}: {
  user: User | null
  outlets: Outlet[]
  isSelf: boolean
  onClose: () => void
  onSaved: () => Promise<void>
  onCreated: (s: Secret) => Promise<void>
}) {
  const [login, setLogin] = useState(user?.login ?? '')
  const [fullName, setFullName] = useState(user?.fullName ?? '')
  const [role, setRole] = useState<AccountRole>(user?.accountRole ?? 'MANAGER')
  const [active, setActive] = useState(user?.active ?? true)
  const [outletIds, setOutletIds] = useState<number[]>(user?.outlets.map((o) => o.id) ?? [])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!user && login.trim().length < 3) return setError('Логин минимум 3 символа')
    setBusy(true)
    setError('')
    try {
      if (user) {
        await api.updateUser(user.id, { fullName: fullName.trim(), accountRole: role, active, outletIds })
        await onSaved()
      } else {
        const res = await api.createUser({
          login: login.trim(),
          fullName: fullName.trim(),
          accountRole: role,
          outletIds,
        })
        await onCreated({ login: res.user.login, password: res.temporaryPassword, title: 'Пользователь создан' })
      }
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }

  return (
    <Modal title={user ? 'Изменить пользователя' : 'Новый пользователь'} onClose={onClose}>
      <form className="modal-form" onSubmit={submit}>
        <label>
          Логин
          <input
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            disabled={!!user}
            maxLength={64}
            autoFocus={!user}
            placeholder="например, galiya"
          />
        </label>
        <label>
          Имя
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={150} autoFocus={!!user} />
        </label>
        <label>
          Роль аккаунта
          <select
            className="select"
            value={role}
            disabled={isSelf}
            onChange={(e) => setRole(e.target.value as AccountRole)}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ACCOUNT_ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </label>

        <div className="field">
          <span className="field-label">Точки ({outletIds.length})</span>
          <OutletPicker outlets={outlets} value={outletIds} onChange={setOutletIds} />
        </div>

        {user && (
          <label className="check">
            <input
              type="checkbox"
              checked={active}
              disabled={isSelf}
              onChange={(e) => setActive(e.target.checked)}
            />
            Аккаунт активен
          </label>
        )}

        {!user && <p className="muted small">Временный пароль сгенерируется и покажется один раз.</p>}
        {error && <div className="error">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Отмена
          </button>
          <button className="btn primary" disabled={busy || !fullName.trim()}>
            {busy ? 'Сохраняем…' : user ? 'Сохранить' : 'Создать'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function OutletPicker({
  outlets,
  value,
  onChange,
}: {
  outlets: Outlet[]
  value: number[]
  onChange: (ids: number[]) => void
}) {
  if (outlets.length === 0) return <div className="picker muted small">Точек пока нет</div>

  const groups = new Map<string, Outlet[]>()
  for (const o of outlets) {
    const list = groups.get(o.cityName) ?? []
    list.push(o)
    groups.set(o.cityName, list)
  }

  function toggle(id: number) {
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id])
  }

  return (
    <div className="picker">
      {[...groups.entries()].map(([city, list]) => (
        <div key={city} className="picker-group">
          <div className="picker-city">{city}</div>
          {list.map((o) => (
            <label key={o.id} className="check">
              <input type="checkbox" checked={value.includes(o.id)} onChange={() => toggle(o.id)} />
              {o.name}
              {!o.active && <span className="muted small"> (выкл.)</span>}
            </label>
          ))}
        </div>
      ))}
    </div>
  )
}

function SecretModal({ secret, onClose }: { secret: Secret; onClose: () => void }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(`Логин: ${secret.login}\nПароль: ${secret.password}`)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <Modal title={secret.title} onClose={onClose}>
      <div className="modal-form">
        <p>
          Логин: <b>{secret.login}</b>
        </p>
        <div className="secret">{secret.password}</div>
        <p className="muted small">
          Пароль показывается один раз. При первом входе система попросит заменить его на свой.
        </p>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={copy}>
            {copied ? '✅ Скопировано' : '📋 Копировать'}
          </button>
          <button type="button" className="btn primary" onClick={onClose}>
            Готово
          </button>
        </div>
      </div>
    </Modal>
  )
}