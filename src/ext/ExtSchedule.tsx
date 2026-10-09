import { useCallback, useEffect, useMemo, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { extApi } from './api'
import { schedApi } from '../sched/api'
import type { SchedRequest } from '../sched/api'
import type { SchedCell, SchedData } from './api'
import { MONTHS, WD, currentMonth, hm, shiftMonth } from './util'
import DayEditor from './DayEditor'
import type { DayTarget } from './DayEditor'

/** Поля, которые приходят с правками дней; в общем типе ячейки их нет. */
type EC = SchedCell & { edited?: boolean; ttType?: string | null; ttStart?: string | null; ttEnd?: string | null }
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']

type View = 'plan' | 'fact' | 'inout'
type Kind = 'shift' | 'present' | 'late' | 'off' | 'pv' | 'miss' | 'vac' | 'sick' | 'trip' | 'hol' | 'pre' | 'fired' | 'plan' | 'other' | 'empty'

/** Подписи и коды — как в легенде Таймтрекера, чтобы глаз не переучивался. */
const KIND: Record<Kind, { code: string; name: string }> = {
  present: { code: 'П', name: 'Присутствовал' },
  late: { code: 'О', name: 'Опоздал' },
  off: { code: 'ВД', name: 'Выходной' },
  pv: { code: 'ПВ', name: 'Присутствовал в выходной' },
  miss: { code: 'ПР', name: 'Пропуск' },
  vac: { code: 'ТО', name: 'Отпуск' },
  sick: { code: 'НТ', name: 'Нетрудоспособность' },
  trip: { code: 'К', name: 'Командировка' },
  hol: { code: 'ПД', name: 'Праздник' },
  pre: { code: 'ДТ', name: 'До трудоустройства' },
  fired: { code: 'РТ', name: 'Расторжение ТД' },
  plan: { code: '', name: 'По плану (ещё не было)' },
  shift: { code: '', name: 'Смена по плану' },
  other: { code: '?', name: 'Другой тип' },
  empty: { code: '', name: '' },
}

/** Значения type: was, wasnt, wasInWeekend, late, weekend, work, beforeWork, celebrate (из данных Таймтрекера); остальное угадываем по смыслу. */
function classify(c: SchedCell | undefined): Kind {
  if (!c) return 'empty'
  const t = (c.type ?? '').toLowerCase()
  // точные значения type из Таймтрекера
  if (t === 'was') return 'present'
  if (t === 'wasinweekend') return 'pv'
  if (t === 'wasnt') return 'miss'
  if (t === 'beforework') return 'pre'
  if (t === 'celebrate') return c.workedMin > 0 ? 'present' : 'hol'
  if (t === 'work') return c.workedMin > 0 || c.factIn ? 'present' : c.planStart ? 'plan' : 'empty'
  if (t === 'weekend') return c.workedMin > 0 ? 'pv' : 'off'
  if (t.includes('late')) return 'late'
  if (/wasnt|was_not|not_come|no_show|noshow|abs|skip|pass|miss|truan/.test(t)) return 'miss'
  if (/sick|ill|disab|quarant/.test(t)) return 'sick'
  if (/vac|leave|holiday_paid|annual/.test(t)) return 'vac'
  if (/trip|busin|command/.test(t)) return 'trip'
  if (/celeb|holiday|festiv/.test(t)) return 'hol'
  if (/before|hire|pre/.test(t)) return 'pre'
  if (/fire|dismiss|termin/.test(t)) return 'fired'
  if (c.workedMin > 0 || c.factIn) return 'present'
  if (t === '' || t === 'normal' || t === 'work' || t === 'working') return c.planStart ? 'plan' : 'empty'
  return 'other'
}

/** В режиме «План» не красим по факту: смена — это смена, цветом выделяем только отпуск, больничный и т.п. */
function viewKind(k: Kind, view: View): Kind {
  if (view === 'plan' && (k === 'present' || k === 'late' || k === 'plan' || k === 'miss' || k === 'pv')) return k === 'pv' ? 'off' : 'shift'
  return k
}

function short(t: string | null): string {
  if (!t) return ''
  if (t === '23:59') return '0'
  const [h, m] = t.split(':')
  return m === '00' ? String(Number(h)) : `${Number(h)}:${m}`
}

function planText(c: SchedCell): string {
  return c.planStart && c.planEnd ? `${short(c.planStart)}–${short(c.planEnd)}` : ''
}

function cellText(c: SchedCell | undefined, k: Kind, view: View): string {
  if (!c || k === 'empty') return ''
  if (view === 'plan') return k === 'off' ? '' : planText(c)
  if (view === 'inout') return c.factIn ? `${c.factIn}\n${c.factOut ?? '…'}` : k === 'plan' ? planText(c) : ''
  if (c.workedMin > 0) return hm(c.workedMin)
  return k === 'plan' ? planText(c) : ''
}

function tip(c: SchedCell | undefined, k: Kind): string {
  if (!c) return ''
  const parts = [KIND[k].name || (c.type ?? '')]
  if (c.type && k === 'other') parts.push(`type=${c.type}`)
  if (k !== 'off' && c.planStart) parts.push(`план ${planText(c)}`)
  if (c.factIn) parts.push(`факт ${c.factIn}–${c.factOut ?? '…'}`)
  if (c.workedMin > 0) parts.push(`отработано ${hm(c.workedMin)}`)
  return parts.join(' · ')
}

export default function ExtSchedule({ branchId, withRequests = false }: { branchId: number | null; withRequests?: boolean }) {
  const [reqs, setReqs] = useState<SchedRequest[]>([])
  const [month, setMonth] = useState(currentMonth())
  const [view, setView] = useState<View>('plan')
  const [q, setQ] = useState('')
  const [data, setData] = useState<SchedData | null>(null)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [canEdit, setCanEdit] = useState(false)
  const [editing, setEditing] = useState<DayTarget | null>(null)

  useEffect(() => {
    schedApi.caps().then((c) => setCanEdit(c.canManageSchedule)).catch(() => setCanEdit(false))
  }, [])

  const load = useCallback(async () => {
    try {
      setData(await extApi.schedule(month, branchId))
      if (withRequests) setReqs(await schedApi.requests('ACTIVE', month, branchId).catch(() => []))
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка')
    }
  }, [month, branchId, withRequests])

  useEffect(() => {
    void load()
  }, [load])

  async function sync() {
    setBusy(true)
    setError('')
    setNote('')
    try {
      const r = await extApi.syncSchedule(month)
      setNote(`Готово: загружено ${r.days} дней за ${r.month}`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка')
    } finally {
      setBusy(false)
    }
  }

  const byEmp = useMemo(() => {
    const m = new Map<number, Map<number, SchedCell>>()
    data?.cells.forEach((c) => {
      if (!m.has(c.employeeId)) m.set(c.employeeId, new Map())
      m.get(c.employeeId)!.set(c.day, c)
    })
    return m
  }, [data])

  /** Заявки сотрудников по клеткам: employeeId:день → заявка. */
  const rqMap = useMemo(() => {
    const m = new Map<string, SchedRequest>()
    const [yy, mm] = month.split('-').map(Number)
    const last = new Date(Date.UTC(yy, mm, 0)).getUTCDate()
    for (const r of reqs) {
      const a = new Date(r.dateFrom + 'T00:00:00Z'), b = new Date(r.dateTo + 'T00:00:00Z')
      for (let d = 1; d <= last; d++) {
        const t = Date.UTC(yy, mm - 1, d)
        if (t >= a.getTime() && t <= b.getTime()) m.set(`${r.employeeId}:${d}`, r)
      }
    }
    return m
  }, [reqs, month])

  function openEdit(emp: { id: number; fullName: string }, d: number, c: EC | undefined, k: Kind) {
    const now = !c || k === 'empty' ? '—' : k === 'off' ? 'выходной'
      : ['vac', 'sick', 'trip', 'hol', 'pre', 'fired'].includes(k) ? KIND[k].name : planText(c) || KIND[k].name || '—'
    let tt: string | null = null
    if (c?.edited) tt = !c.ttType && !c.ttStart ? 'нет записи' : c.ttType === 'weekend' || !c.ttStart ? 'выходной' : `${short(c.ttStart)}–${short(c.ttEnd ?? null)}`
    const origKind = classify(c?.edited ? { ...c, type: c.ttType ?? null, planStart: c.ttStart ?? null, planEnd: c.ttEnd ?? null } : c)
    const warns: string[] = []
    if (['vac', 'sick', 'trip', 'hol', 'pre', 'fired'].includes(origKind)) warns.push(`В Таймтрекере тут: ${KIND[origKind].name.toLowerCase()}`)
    if (c && (c.workedMin > 0 || c.factIn)) warns.push('Сотрудник в этот день уже отмечался на работе')
    setEditing({
      employeeId: emp.id, name: emp.fullName,
      day: `${month}-${String(d).padStart(2, '0')}`,
      dayTitle: `${d} ${MONTHS_GEN[mo - 1]}, ${WD[wd(d)]}`,
      now, tt, edited: !!c?.edited, warn: warns.length ? warns.join('. ') : null,
    })
  }

  const days = useMemo(() => Array.from({ length: data?.daysInMonth ?? 0 }, (_, i) => i + 1), [data])
  const [y, mo] = month.split('-').map(Number)
  const wd = (d: number) => new Date(Date.UTC(y, mo - 1, d)).getUTCDay()
  const today = currentMonth() === month ? new Date(Date.now() + 5 * 3600_000).getUTCDate() : -1

  const emps = useMemo(() => {
    const w = q.trim().toLowerCase().replace(/ё/g, 'е').split(/\s+/).filter(Boolean)
    return (data?.employees ?? []).filter((e) => {
      const n = e.fullName.toLowerCase().replace(/ё/g, 'е')
      return w.every((x) => n.includes(x))
    })
  }, [data, q])

  // покрытие по дням: сколько людей стоит в плане и сколько реально пришло
  const cover = useMemo(() => {
    const plan = new Array<number>(days.length + 1).fill(0)
    const fact = new Array<number>(days.length + 1).fill(0)
    emps.forEach((e) => {
      const row = byEmp.get(e.id)
      days.forEach((d) => {
        const c = row?.get(d)
        if (!c) return
        const k = classify(c)
        if (c.planStart && k !== 'off' && k !== 'empty' && k !== 'vac' && k !== 'sick' && k !== 'pre' && k !== 'fired') plan[d]++
        if (c.workedMin > 0 || c.factIn) fact[d]++
      })
    })
    return { plan, fact }
  }, [emps, byEmp, days])

  const totals = useMemo(() => {
    const m = new Map<number, { shifts: number; min: number }>()
    emps.forEach((e) => {
      let shifts = 0, min = 0
      byEmp.get(e.id)?.forEach((c) => {
        const k = classify(c)
        if (c.planStart && k !== 'off' && k !== 'empty') shifts++
        min += c.workedMin
      })
      m.set(e.id, { shifts, min })
    })
    return m
  }, [emps, byEmp])

  const usedKinds = useMemo(() => {
    const s = new Set<Kind>()
    data?.cells.forEach((c) => s.add(viewKind(classify(c), view)))
    s.delete('empty')
    return Array.from(s)
  }, [data, view])

  const rawTypes = useMemo(() => {
    const m = new Map<string, number>()
    data?.cells.forEach((c) => m.set(c.type ?? '—', (m.get(c.type ?? '—') ?? 0) + 1))
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1])
  }, [data])

  return (
    <>
      <div className="sch-bar">
        <div className="sch-month">
          <button className="ext-btn sq" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Предыдущий месяц">‹</button>
          <strong>{MONTHS[mo - 1]} {y}</strong>
          <button className="ext-btn sq" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Следующий месяц">›</button>
        </div>
        <div className="sch-seg" role="group" aria-label="Вид">
          <button className={view === 'plan' ? 'on' : ''} onClick={() => setView('plan')}>План</button>
          <button className={view === 'fact' ? 'on' : ''} onClick={() => setView('fact')}>Факт</button>
          <button className={view === 'inout' ? 'on' : ''} onClick={() => setView('inout')}>Приход / уход</button>
        </div>
        <input className="ext-input sch-search" type="search" placeholder="Поиск по ФИО" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="ext-btn primary" onClick={() => void sync()} disabled={busy}>
          {busy ? 'Загружаем…' : '⟳ Загрузить из Таймтрекера'}
        </button>
      </div>

      {error && <div className="ext-msg err">{error}</div>}
      {note && <div className="ext-msg ok">{note}</div>}

      <div className="sch-legend">
        {usedKinds.map((k) => (
          <span key={k} className="sch-chip"><i className={`cell t-${k}`}>{KIND[k].code}</i>{KIND[k].name}</span>
        ))}
        {data?.cells.some((c) => (c as EC).edited) && (
          <span className="sch-chip"><i className="ed-chip" />изменено на сайте</span>
        )}
        {canEdit && <span className="sch-chip">Нажми на клетку, чтобы изменить день</span>}
        {rawTypes.length > 0 && (
          <details className="sch-raw">
            <summary>типы из данных</summary>
            {rawTypes.map(([t, n]) => <span key={t}>{t}: {n}</span>)}
          </details>
        )}
      </div>

      <div className="ext-wrap sch-wrap">
        <table className="sch">
          <thead>
            <tr>
              <th className="corner">
                <span>Сотрудник</span>
                <small>{emps.length} чел.</small>
              </th>
              {days.map((d) => (
                <th key={d} className={`dh${wd(d) === 0 || wd(d) === 6 ? ' we' : ''}${d === today ? ' today' : ''}`}>
                  <b>{d}</b>
                  <span>{WD[wd(d)]}</span>
                  <em title="В плане в этот день">{cover.plan[d] || ''}</em>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {emps.map((e) => {
              const t = totals.get(e.id)
              return (
                <tr key={e.id}>
                  <th className="who" scope="row">
                    <strong>{e.fullName}</strong>
                    <small title={e.position ?? ''}>{e.position ?? ''}</small>
                    <em>{t?.shifts ?? 0} смен{t && t.min > 0 ? ` · ${hm(t.min)} ч` : ''}</em>
                  </th>
                  {days.map((d) => {
                    const c = byEmp.get(e.id)?.get(d) as EC | undefined
                    const k = classify(c)
                    const vk = viewKind(k, view)
                    return (
                      <td key={d} className={`${wd(d) === 0 || wd(d) === 6 ? 'we' : ''}${d === today ? ' today' : ''}`}>
                        {(() => {
                          const rq = rqMap.get(`${e.id}:${d}`)
                          const rt = rq ? `\n${rq.status === 'PENDING' ? 'Заявка ждёт' : 'Одобрено'}: ${rq.kind === 'DAY_OFF' ? 'выходной' : `${rq.kind === 'AVAILABLE' ? 'может только' : 'недоступен'} ${rq.timeFrom}–${rq.timeTo === '23:59' ? '00:00' : rq.timeTo}`}${rq.comment ? ` («${rq.comment}»)` : ''}` : ''
                          return (
                            <div
                              className={`cell t-${vk}${rq ? ' has-rq' : ''}${canEdit ? ' editable' : ''}`}
                              title={tip(c, k) + rt + (c?.edited ? '\nИзменено на сайте' : '') + (canEdit ? '\nНажми, чтобы изменить' : '')}
                              {...(canEdit ? {
                                role: 'button', tabIndex: 0,
                                onClick: () => openEdit(e, d, c, k),
                                onKeyDown: (ev: KeyboardEvent) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openEdit(e, d, c, k) } },
                              } : {})}
                            >
                              {c?.edited && <i className="ed-mark" />}
                              {cellText(c, vk === 'shift' ? 'plan' : k, view)}
                              {rq && <i className={`rq-dot ${rq.status === 'PENDING' ? 'p' : 'a'}`} />}
                            </div>
                          )
                        })()}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
            {data && emps.length === 0 && (
              <tr><td colSpan={days.length + 1} className="ext-empty">Нет данных. Нажми «Загрузить из Таймтрекера».</td></tr>
            )}
          </tbody>
          {emps.length > 0 && (
            <tfoot>
              <tr>
                <th className="corner foot"><span>Пришло</span><small>по факту</small></th>
                {days.map((d) => (
                  <td key={d} className={`ft${d === today ? ' today' : ''}`}>{cover.fact[d] || ''}</td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {editing && (
        <DayEditor
          t={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); setNote('Сохранено'); void load() }}
        />
      )}
    </>
  )
}