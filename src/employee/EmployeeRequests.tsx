import { useCallback, useEffect, useState } from 'react'
import { employeeApi } from './api'
import type { EmpRequest } from './api'
import DayPicker, { human, plural, runs } from './DayPicker'

const ST: Record<string, string> = { PENDING: 'Ждёт ответа', APPROVED: 'Одобрено', REJECTED: 'Отказано', CANCELLED: 'Отменена' }
const range = (r: { dateFrom: string; dateTo: string }) => (r.dateFrom === r.dateTo ? human(r.dateFrom) : `${human(r.dateFrom)} – ${human(r.dateTo)}`)
/** 23:59 в базе — это «до полуночи». */
export const clock = (t: string | null) => (t === '23:59' ? '00:00' : t ?? '')

/** Готовые смены: в какие часы сотрудник МОЖЕТ работать. Время после выбора можно поправить руками. */
const PRESETS = [
  { id: 'morning', name: 'Утро', from: '08:00', to: '16:00' },
  { id: 'mid', name: 'Промеж', from: '12:00', to: '21:00' },
  { id: 'evening', name: 'Вечер', from: '16:00', to: '23:59' },
] as const

export default function EmployeeRequests({ prefill, onUsed, onChanged }: { prefill: string | null; onUsed: () => void; onChanged: () => void }) {
  const [kind, setKind] = useState<'DAY_OFF' | 'AVAILABLE'>('DAY_OFF')
  const [days, setDays] = useState<string[]>(prefill ? [prefill] : [])
  const [lead, setLead] = useState(2)
  const sameAs = (id: string, f: string, t: string) => { const p = PRESETS.find((x) => x.id === id); return !!p && p.from === f && p.to === t }
  const [tf, setTf] = useState('08:00')
  const [tt, setTt] = useState('16:00')
  const [comment, setComment] = useState('')
  const [list, setList] = useState<EmpRequest[] | null>(null)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { if (prefill) { setDays([prefill]); onUsed() } }, [prefill, onUsed])

  const load = useCallback(async () => {
    try { setList(await employeeApi.requests()) } catch (e) { setError(e instanceof Error ? e.message : 'Ошибка') }
  }, [])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    employeeApi.schedule(new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 7)).then((r) => setLead(r.leadDays)).catch(() => {})
  }, [])

  function choose(id: string) {
    const p = PRESETS.find((x) => x.id === id)
    if (p) { setTf(p.from); setTt(p.to) }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (days.length === 0) { setError('Выберите хотя бы один день'); return }
    setBusy(true); setError(''); setOk('')
    const parts = runs(days)
    let sent = 0
    try {
      for (const r of parts) {
        await employeeApi.create({
          kind, dateFrom: r.from, dateTo: r.to,
          timeFrom: kind === 'AVAILABLE' ? tf : undefined, timeTo: kind === 'AVAILABLE' ? tt : undefined,
          comment: comment.trim() || undefined,
        })
        sent++
      }
      setOk(parts.length > 1 ? `Отправлено заявок: ${parts.length}. Ответ появится здесь.` : 'Заявка отправлена. Ответ появится здесь.')
      setDays([]); setComment('')
    } catch (err) {
      const m = err instanceof Error ? err.message : 'Ошибка'
      setError(sent > 0 ? `Отправлено ${sent} из ${parts.length}. Дальше ошибка: ${m}` : m)
      if (sent > 0) setDays(days.filter((d) => !parts.slice(0, sent).some((p) => d >= p.from && d <= p.to)))
    } finally {
      await load(); onChanged(); setBusy(false)
    }
  }

  async function cancel(id: number) {
    try { await employeeApi.cancel(id); await load(); onChanged() } catch (e) { setError(e instanceof Error ? e.message : 'Ошибка') }
  }

  return (
    <div className="emp-req">
      <form className="emp-card" onSubmit={(e) => void submit(e)}>
        <h3>Новая заявка</h3>
        <div className="emp-seg">
          <button type="button" className={kind === 'DAY_OFF' ? 'on' : ''} onClick={() => setKind('DAY_OFF')}>Весь день выходной</button>
          <button type="button" className={kind === 'AVAILABLE' ? 'on' : ''} onClick={() => setKind('AVAILABLE')}>Могу в часы</button>
        </div>

        {kind === 'AVAILABLE' && (
          <div className="emp-pre">
            <small>В какие часы могу работать в эти дни</small>
            <div className="chips">
              {PRESETS.map((p) => (
                <button key={p.id} type="button" className={sameAs(p.id, tf, tt) ? 'on' : ''} onClick={() => choose(p.id)}>
                  <b>{p.name}</b><span>{p.from.slice(0, 2).replace(/^0/, '')}–{clock(p.to).slice(0, 2).replace(/^0(?=\d)/, '') || '0'}</span>
                </button>
              ))}
            </div>
            <div className="emp-row">
              <label>Могу с<input type="time" required value={tf} onChange={(e) => { setTf(e.target.value) }} /></label>
              <label>до<input type="time" required value={tt} onChange={(e) => { setTt(e.target.value === '00:00' ? '23:59' : e.target.value) }} /></label>
            </div>
            <small>Выберите готовую смену или впишите своё время.</small>
          </div>
        )}

        <small className="emp-step">{kind === 'DAY_OFF' ? 'Какие дни выходные' : 'В какие дни'}</small>
        <DayPicker days={days} onChange={setDays} lead={lead} />

        <label>Комментарий (по желанию)
          <textarea rows={2} maxLength={300} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Например: экзамен, поездка, к врачу" />
        </label>
        {error && <div className="emp-err">{error}</div>}
        {ok && <div className="emp-ok">{ok}</div>}
        <button className="emp-btn" disabled={busy || days.length === 0}>
          {busy ? 'Отправляем…' : days.length ? `Отправить заявку (${days.length} ${plural(days.length, 'день', 'дня', 'дней')})` : 'Отправить заявку'}
        </button>
        <small className="emp-mute">Решение принимает ответственная за расписание. Заявка не гарантирует выходной, пока не одобрена.</small>
      </form>

      <h3 className="emp-h3">Мои заявки</h3>
      {list && list.length === 0 && <div className="emp-empty">Пока нет заявок</div>}
      {list?.map((r) => (
        <div key={r.id} className={`emp-card req st-${r.status}`}>
          <div className="top">
            <b>{r.kind === 'DAY_OFF' ? 'Выходной' : r.kind === 'AVAILABLE' ? 'Могу только в часы' : 'Не могу в часы'}</b>
            <span className={`emp-chip st-${r.status}`}>{ST[r.status]}</span>
          </div>
          <div>{range(r)}{r.kind !== 'DAY_OFF' && ` · ${r.timeFrom}–${clock(r.timeTo)}`}</div>
          {r.comment && <div className="emp-mute">«{r.comment}»</div>}
          {r.decisionNote && <div className="emp-note">Ответ: {r.decisionNote}</div>}
          {r.status === 'PENDING' && <button type="button" className="emp-ghost sm" onClick={() => void cancel(r.id)}>Отменить заявку</button>}
        </div>
      ))}
    </div>
  )
}