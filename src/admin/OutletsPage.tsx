import { useState } from 'react'
import type { FormEvent } from 'react'
import { api } from '../api'
import type { City, Outlet, OutletBody } from '../types'
import { Modal, StatusPill, TableState, Toolbar, errorText, useList } from './ui'

export default function OutletsPage() {
  const outlets = useList(api.adminOutlets)
  const cities = useList(api.adminCities)
  const [query, setQuery] = useState('')
  const [cityFilter, setCityFilter] = useState<number | 'all'>('all')
  const [editing, setEditing] = useState<Outlet | 'new' | null>(null)
  const [actionError, setActionError] = useState('')

  const q = query.trim().toLowerCase()
  const filtered = (outlets.items ?? []).filter(
    (o) =>
      (cityFilter === 'all' || o.cityId === cityFilter) &&
      (o.name.toLowerCase().includes(q) || (o.address ?? '').toLowerCase().includes(q)),
  )

  async function run(action: () => Promise<unknown>) {
    setActionError('')
    try {
      await action()
      await outlets.reload()
    } catch (err) {
      setActionError(errorText(err))
    }
  }

  function toggle(o: Outlet) {
    return run(() =>
      api.updateOutlet(o.id, { cityId: o.cityId, name: o.name, address: o.address, active: !o.active }),
    )
  }

  function remove(o: Outlet) {
    if (!confirm(`Удалить точку «${o.name}»?`)) return
    return run(() => api.deleteOutlet(o.id))
  }

  return (
    <div className="page">
      <Toolbar
        query={query}
        onQuery={setQuery}
        placeholder="Поиск по названию или адресу…"
        addLabel="Точка"
        onAdd={() => setEditing('new')}
      >
        <select
          className="select"
          value={cityFilter}
          onChange={(e) => setCityFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
        >
          <option value="all">Все города</option>
          {(cities.items ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Toolbar>

      {(outlets.error || cities.error) && <div className="error">{outlets.error || cities.error}</div>}
      {actionError && <div className="error">{actionError}</div>}

      <div className="panel table-panel">
        <TableState
          loading={outlets.items === null}
          empty={outlets.items !== null && filtered.length === 0}
        />
        {filtered.length > 0 && (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Точка</th>
                  <th>Город</th>
                  <th>Адрес</th>
                  <th>Статус</th>
                  <th style={{ width: 150 }} />
                </tr>
              </thead>
              <tbody>
                {filtered.map((o) => (
                  <tr key={o.id} className={o.active ? '' : 'dimmed'}>
                    <td className="strong">{o.name}</td>
                    <td>{o.cityName}</td>
                    <td className="muted">{o.address || '—'}</td>
                    <td>
                      <StatusPill active={o.active} />
                    </td>
                    <td className="row-actions">
                      <button
                        className="icon-btn"
                        title={o.active ? 'Выключить' : 'Включить'}
                        onClick={() => toggle(o)}
                      >
                        {o.active ? '⏸️' : '▶️'}
                      </button>
                      <button className="icon-btn" title="Изменить" onClick={() => setEditing(o)}>
                        ✏️
                      </button>
                      <button className="icon-btn danger" title="Удалить" onClick={() => remove(o)}>
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
        <OutletForm
          outlet={editing === 'new' ? null : editing}
          cities={cities.items ?? []}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null)
            await outlets.reload()
          }}
        />
      )}
    </div>
  )
}

function OutletForm({
  outlet,
  cities,
  onClose,
  onSaved,
}: {
  outlet: Outlet | null
  cities: City[]
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const [cityId, setCityId] = useState<number | ''>(outlet?.cityId ?? cities[0]?.id ?? '')
  const [name, setName] = useState(outlet?.name ?? '')
  const [address, setAddress] = useState(outlet?.address ?? '')
  const [active, setActive] = useState(outlet?.active ?? true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (cityId === '') return setError('Выбери город')
    setBusy(true)
    setError('')
    const body: OutletBody = {
      cityId,
      name: name.trim(),
      address: address.trim() || null,
      active,
    }
    try {
      if (outlet) await api.updateOutlet(outlet.id, body)
      else await api.createOutlet(body)
      await onSaved()
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }

  return (
    <Modal title={outlet ? 'Изменить точку' : 'Новая точка'} onClose={onClose}>
      <form className="modal-form" onSubmit={submit}>
        <label>
          Город
          <select
            className="select"
            value={cityId}
            onChange={(e) => setCityId(e.target.value === '' ? '' : Number(e.target.value))}
          >
            {cities.length === 0 && <option value="">Сначала добавь город</option>}
            {cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Название
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={150} autoFocus />
        </label>
        <label>
          Адрес
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            maxLength={255}
            placeholder="необязательно"
          />
        </label>
        <label className="check">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Точка активна (видна при входе в смену)
        </label>
        {error && <div className="error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Отмена
          </button>
          <button className="btn primary" disabled={busy || !name.trim() || cityId === ''}>
            {busy ? 'Сохраняем…' : 'Сохранить'}
          </button>
        </div>
      </form>
    </Modal>
  )
}