import { useEffect, useState } from 'react'
import { dayApi } from './dayEditApi'
import type { DayKind, DayLogRow, PushResult } from './dayEditApi'
import './dayedit.css'

export interface DayTarget {
  employeeId: number
  name: string
  day: string          // YYYY-MM-DD
  dayTitle: string     // «14 октября, вт»
  now: string          // что стоит сейчас: «16–0», «выходной», «—»
  tt: string | null    // что в Таймтрекере, если отличается
  edited: boolean
  warn: string | null  // например «В Таймтрекере тут отпуск»
}

const PRESETS = [
  { name: 'Утро', s: '08:00', e: '16:00' },
  { name: 'Промеж', s: '12:00', e: '21:00' },
  { name: 'Вечер', s: '16:00', e: '00:00' },
]

/** «9» → 09:00, «930» → 09:30, «16:5» не принимаем. Пустая строка, если непонятно. */
function norm(v: string): string {
  const t = v.trim().replace('.', ':').replace(',', ':')
  let h: number, m: number
  if (/^\d{1,2}$/.test(t)) { h = Number(t); m = 0 }
  else if (/^\d{1,2}:\d{2}$/.test(t)) { const [a, b] = t.split(':'); h = Number(a); m = Number(b) }
  else if (/^\d{3,4}$/.test(t)) { h = Number(t.slice(0, -2)); m = Number(t.slice(-2)) }
  else return ''
  if (h > 24 || m > 59 || (h === 24 && m > 0)) return ''
  return `${String(h === 24 ? 0 : h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export default function DayEditor({ t, onClose, onSaved }: { t: DayTarget; onClose: () => void; onSaved: () => void }) {
  const [s, setS] = useState('')
  const [e, setE] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [log, setLog] = useState<DayLogRow[]>([])
  const [pv, setPv] = useState<PushResult | null>(null)   // предпросмотр отправки в Таймтрекер
  const [sent, setSent] = useState<PushResult | null>(null)

  async function preview() {
    setErr('')
    setBusy(true)
    try {
      setPv(await dayApi.push(t.employeeId, t.day, false))
    } catch (x) {
      setErr(x instanceof Error ? x.message : 'Не удалось получить данные из Таймтрекера')
    } finally {
      setBusy(false)
    }
  }

  async function send() {
    setErr('')
    setBusy(true)
    try {
      const r = await dayApi.push(t.employeeId, t.day, true)
      if (r.ok) setSent(r)
      else setPv(r)
    } catch (x) {
      setErr(x instanceof Error ? x.message : 'Не удалось отправить')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    dayApi.log(t.employeeId, t.day).then(setLog).catch(() => setLog([]))
  }, [t.employeeId, t.day])

  useEffect(() => {
    const h = (ev: KeyboardEvent) => { if (ev.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  async function save(kind: DayKind, start?: string, end?: string) {
    setErr('')
    setBusy(true)
    try {
      await dayApi.save({ employeeId: t.employeeId, day: t.day, kind, start, end, note: note.trim() || undefined })
      onSaved()
    } catch (x) {
      setErr(x instanceof Error ? x.message : 'Не удалось сохранить')
      setBusy(false)
    }
  }

  function saveCustom() {
    const a = norm(s), b = norm(e)
    if (!a || !b) { setErr('Время введи так: 9, 930 или 16:30'); return }
    if (a === b) { setErr('Начало и конец не должны совпадать'); return }
    void save('SHIFT', a, b)
  }

  return (
    <div className="de-back" onMouseDown={(ev) => { if (ev.target === ev.currentTarget) onClose() }}>
      <div className="de-box" role="dialog" aria-modal="true" aria-label="Смена на день">
        <div className="de-head">
          <div>
            <strong>{t.name}</strong>
            <span>{t.dayTitle}</span>
          </div>
          <button className="de-x" onClick={onClose} aria-label="Закрыть">×</button>
        </div>

        <div className="de-now">
          Сейчас: <b>{t.now}</b>
          {t.edited && t.tt != null && <em> · в Таймтрекере: {t.tt}</em>}
        </div>
        {t.warn && <div className="de-warn">{t.warn}</div>}

        <div className="de-label">Быстрый выбор</div>
        <div className="de-presets">
          {PRESETS.map((p) => (
            <button key={p.name} disabled={busy} onClick={() => void save('SHIFT', p.s, p.e)}>
              <b>{p.name}</b>
              <span>{p.s.slice(0, 2).replace(/^0/, '')}–{p.e === '00:00' ? '00' : p.e.slice(0, 2)}</span>
            </button>
          ))}
          <button className="off" disabled={busy} onClick={() => void save('OFF')}>
            <b>Выходной</b>
            <span>убрать смену</span>
          </button>
        </div>

        <div className="de-label">Своё время</div>
        <div className="de-custom">
          <input value={s} onChange={(ev) => setS(ev.target.value)} placeholder="с 9:00" inputMode="numeric" aria-label="Начало" />
          <span>–</span>
          <input value={e} onChange={(ev) => setE(ev.target.value)} placeholder="до 16:00" inputMode="numeric" aria-label="Конец" />
          <button className="go" disabled={busy} onClick={saveCustom}>Поставить</button>
        </div>

        <input className="de-note" value={note} onChange={(ev) => setNote(ev.target.value)} placeholder="Комментарий (по желанию)" maxLength={200} />

        {err && <div className="de-err">{err}</div>}

        {t.edited && !sent && (
          <div className="de-tt">
            {!pv && (
              <button className="de-ttbtn" disabled={busy} onClick={() => void preview()}>⇪ Отправить в Таймтрекер…</button>
            )}
            {pv && !pv.ok && <div className="de-warn">{pv.reason}</div>}
            {pv && pv.ok && (
              <>
                <div className="de-ttline">В Таймтрекере сейчас: <b>{pv.from}</b> → станет: <b>{pv.to}</b></div>
                <small>Меняется один день в карточке сотрудника, остальное не трогаем. После записи сверим результат.</small>
                <div className="de-ttrow">
                  <button className="go" disabled={busy} onClick={() => void send()}>Да, отправить</button>
                  <button disabled={busy} onClick={() => setPv(null)}>Отмена</button>
                </div>
              </>
            )}
          </div>
        )}
        {sent && (
          <div className="de-tt ok">
            <div className="de-ttline">{sent.verified ? '✓ Отправлено в Таймтрекер и сверено' : 'Отправлено, но сверка не сошлась: ' + (sent.message ?? '')}</div>
            {sent.warning && <div className="de-warn">{sent.warning}</div>}
            <div className="de-ttrow"><button className="go" onClick={onSaved}>Готово</button></div>
          </div>
        )}

        <div className="de-foot">
          {t.edited
            ? <button className="reset" disabled={busy} onClick={() => void save('RESET')}>↺ Вернуть как в Таймтрекере</button>
            : <span />}
          <small>Правка сохраняется на сайте. В Таймтрекер уходит только по кнопке выше.</small>
        </div>

        {log.length > 0 && (
          <details className="de-log">
            <summary>Кто менял</summary>
            {log.map((r, i) => (
              <div key={i}>{r.at} · {r.by}: {r.before ?? '—'} → {r.after ?? '—'}</div>
            ))}
          </details>
        )}
      </div>
    </div>
  )
}