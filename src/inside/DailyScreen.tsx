import { useState } from 'react'
import type { Checklist, Shift } from '../types'
import { DailyPage } from './pages'
import PtoPanel from './PtoPanel'
import { DLK, INSIDE, WEEKDAYS, WEEKDAYS_SHORT, todayIndex } from './regulations'
import './daily-screen.css'

type Variant = 'a' | 'b' | 'c'
const VARIANTS: { id: Variant; label: string }[] = [
  { id: 'a', label: '1 · Две колонки' },
  { id: 'b', label: '2 · Сегодня сверху' },
  { id: 'c', label: '3 · Неделя лентой' },
]
// когда выберете вид, поставьте его сюда, а переключатель сверху можно убрать
const FIXED: Variant | null = null

const KEY = 'daily-variant'
function loadVariant(): Variant {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'a' || v === 'b' || v === 'c') return v
  } catch {
    /* без хранилища просто первый вид */
  }
  return 'a'
}

const Dash = () => <span className="ds-none">—</span>

type Props = {
  shift: Shift
  checklist: Checklist | null
  onChange: (c: Checklist) => void
}

/** «Регламент дня»: регламенты на сегодня, вся неделя и ПТО на одном экране. */
export default function DailyScreen({ shift, checklist, onChange }: Props) {
  const [variant, setVariant] = useState<Variant>(FIXED ?? loadVariant())
  const today = todayIndex()
  const mine = shift.dayPart === 'MORNING' ? 'morning' : shift.dayPart === 'EVENING' ? 'evening' : null
  const t = INSIDE[today]

  function pick(v: Variant) {
    setVariant(v)
    try {
      localStorage.setItem(KEY, v)
    } catch {
      /* не страшно */
    }
  }

  // сегодняшние три карточки: утро, вечер, ДЛК
  const todayBoxes = (
    <div className="ds-boxes">
      <div className={mine === 'morning' ? 'ds-box mine' : 'ds-box'}>
        <small>🌅 Инсайд · утро</small>
        <b>{t.morning ?? <Dash />}</b>
      </div>
      <div className={mine === 'evening' ? 'ds-box mine' : 'ds-box'}>
        <small>🌙 Инсайд · вечер</small>
        <b>{t.evening ?? <Dash />}</b>
      </div>
      <div className="ds-box">
        <small>🧽 ДЛК</small>
        <b>{DLK[today] ?? <Dash />}</b>
      </div>
    </div>
  )

  const head = (
    <div className="ds-head">
      <div className="ds-title">
        <span className="ds-tag">Сегодня</span>
        <h2>{WEEKDAYS[today]}</h2>
      </div>
      {FIXED === null && (
        <div className="ds-switch" role="group" aria-label="Вид экрана">
          {VARIANTS.map((v) => (
            <button key={v.id} type="button" className={v.id === variant ? 'on' : ''} onClick={() => pick(v.id)}>
              {v.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )

  // неделя таблицей (виды 1 и 2)
  const weekTable = (
    <section className="ds-card">
      <h3>Вся неделя</h3>
      <div className="ds-table">
        <div className="ds-row ds-headrow">
          <span>День</span>
          <span>🌅 Утро</span>
          <span>🌙 Вечер</span>
          <span>🧽 ДЛК</span>
        </div>
        {WEEKDAYS.map((name, i) => (
          <div key={name} className={['ds-row', i === today ? 'now' : '', i < today ? 'past' : ''].join(' ').trim()}>
            <span className="ds-day">
              <b>{WEEKDAYS_SHORT[i]}</b>
              {i === today && <i>сегодня</i>}
            </span>
            <span data-label="Утро">{INSIDE[i].morning ?? <Dash />}</span>
            <span data-label="Вечер">{INSIDE[i].evening ?? <Dash />}</span>
            <span data-label="ДЛК">{DLK[i] ?? <Dash />}</span>
          </div>
        ))}
      </div>
    </section>
  )

  // неделя лентой из семи карточек (вид 3)
  const weekStrip = (
    <div className="ds-strip">
      {WEEKDAYS.map((name, i) => (
        <div key={name} className={['ds-dcard', i === today ? 'now' : '', i < today ? 'past' : ''].join(' ').trim()}>
          <div className="ds-dname">
            {WEEKDAYS_SHORT[i]}
            {i === today && <i>сегодня</i>}
          </div>
          <p>
            <small>🌅</small> {INSIDE[i].morning ?? <Dash />}
          </p>
          <p>
            <small>🌙</small> {INSIDE[i].evening ?? <Dash />}
          </p>
          <p>
            <small>🧽</small> {DLK[i] ?? <Dash />}
          </p>
        </div>
      ))}
    </div>
  )

  const items = <DailyPage shift={shift} checklist={checklist} onChange={onChange} bare />

  return (
    <div className="page ds">
      {head}

      {variant === 'a' && (
        <div className="ds-cols">
          <div className="ds-stack">
            {todayBoxes}
            {items}
            {weekTable}
          </div>
          <PtoPanel cols={1} />
        </div>
      )}

      {variant === 'b' && (
        <>
          {todayBoxes}
          {items}
          <div className="ds-cols even">
            {weekTable}
            <PtoPanel cols={1} />
          </div>
        </>
      )}

      {variant === 'c' && (
        <>
          {todayBoxes}
          {items}
          {weekStrip}
          <PtoPanel cols={3} />
        </>
      )}
    </div>
  )
}