import { useState } from 'react'
import type { FormEvent } from 'react'
import { api } from '../api'
import type { City } from '../types'
import { Modal, TableState, Toolbar, errorText, useList } from './ui'

export default function CitiesPage() {
  const { items, error, reload } = useList(api.adminCities)
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<City | 'new' | null>(null)
  const [actionError, setActionError] = useState('')

  const q = query.trim().toLowerCase()
  const filtered = (items ?? []).filter((c) => c.name.toLowerCase().includes(q))

  async function remove(c: City) {
    if (!confirm(`Удалить город «${c.name}»?`)) return
    setActionError('')
    try {
      await api.deleteCity(c.id)
      await reload()
    } catch (err) {
      setActionError(errorText(err))
    }
  }

  return (
    <div className="page">
      <Toolbar
        query={query}
        onQuery={setQuery}
        placeholder="Поиск города…"
        addLabel="Город"
        onAdd={() => setEditing('new')}
      />

      {error && <div className="error">{error}</div>}
      {actionError && <div className="error">{actionError}</div>}

      <div className="panel table-panel">
        <TableState loading={items === null} empty={items !== null && filtered.length === 0} />
        {filtered.length > 0 && (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 70 }}>ID</th>
                  <th>Название</th>
                  <th style={{ width: 110 }} />
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id}>
                    <td className="muted">{c.id}</td>
                    <td className="strong">{c.name}</td>
                    <td className="row-actions">
                      <button className="icon-btn" title="Изменить" onClick={() => setEditing(c)}>
                        ✏️
                      </button>
                      <button className="icon-btn danger" title="Удалить" onClick={() => remove(c)}>
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <CityForm
          city={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null)
            await reload()
          }}
        />
      )}
    </div>
  )
}

function CityForm({
  city,
  onClose,
  onSaved,
}: {
  city: City | null
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const [name, setName] = useState(city?.name ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const body = { name: name.trim() }
      if (city) await api.updateCity(city.id, body)
      else await api.createCity(body)
      await onSaved()
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }

  return (
    <Modal title={city ? 'Изменить город' : 'Новый город'} onClose={onClose}>
      <form className="modal-form" onSubmit={submit}>
        <label>
          Название
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} autoFocus />
        </label>
        {error && <div className="error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Отмена
          </button>
          <button className="btn primary" disabled={busy || !name.trim()}>
            {busy ? 'Сохраняем…' : 'Сохранить'}
          </button>
        </div>
      </form>
    </Modal>
  )
}