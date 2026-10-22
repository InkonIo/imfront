import { useEffect, useState } from 'react'
import './shift-time-picker.css'

/** Частые начала смен: одно нажатие вместо выбора из списков. */
const QUICK = ['08:00', '09:00', '10:00', '12:00', '13:00', '14:00', '16:00']
const SHIFT_MIN = 510 // 8 ч 30 мин, как во всех сменах графика
const STEP = 30

const pad = (n: number) => String(n).padStart(2, '0')
const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5))
const fromMin = (m: number) => { const x = ((m % 1440) + 1440) % 1440; return `${pad(Math.floor(x / 60))}:${pad(x % 60)}` }

/** «14» → 14:00, «1430» → 14:30, «9» → 09:00, «14:3» → 14:30. Не время → null. */
function parseTime(raw: string): string | null {
  const t = raw.trim().replace(/[.,]/g, ':')
  let h: number, m: number
  if (/^\d{1,2}:\d{1,2}$/.test(t)) { const [a, b] = t.split(':'); h = Number(a); m = b.length === 1 ? Number(b) * 10 : Number(b) }
  else if (/^\d{3,4}$/.test(t)) { const d = t.padStart(4, '0'); h = Number(d.slice(0, 2)); m = Number(d.slice(2)) }
  else if (/^\d{1,2}$/.test(t)) { h = Number(t); m = 0 }
  else return null
  if (h > 24 || m > 59 || (h === 24 && m > 0)) return null
  return `${pad(h % 24)}:${pad(m)}`
}

function TimeBox({ value, onCommit, label }: { value: string; onCommit: (v: string) => void; label: string }) {
  const [text, setText] = useState(value)
  const [bad, setBad] = useState(false)
  useEffect(() => { setText(value); setBad(false) }, [value])

  function commit() {
    const v = parseTime(text)
    if (v) { setBad(false); setText(v); if (v !== value) onCommit(v) } else { setBad(true) }
  }
  const step = (d: number) => onCommit(fromMin((value ? toMin(value) : 0) + d))

  return (
    <div className={bad ? 'tp-box bad' : 'tp-box'}>
      <button type="button" className="tp-step" onClick={() => step(-STEP)} aria-label={`${label}: на 30 минут раньше`}>−</button>
      <input
        className="tp-in"
        inputMode="numeric"
        autoComplete="off"
        placeholder="ЧЧ:ММ"
        aria-label={label}
        value={text}
        onChange={(e) => { setText(e.target.value); setBad(false) }}
        onBlur={commit}
        onFocus={(e) => e.currentTarget.select()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit() }
          if (e.key === 'ArrowUp') { e.preventDefault(); step(STEP) }
          if (e.key === 'ArrowDown') { e.preventDefault(); step(-STEP) }
        }}
      />
      <button type="button" className="tp-step" onClick={() => step(STEP)} aria-label={`${label}: на 30 минут позже`}>+</button>
    </div>
  )
}

/**
 * Выбор времени смены без выпадающих списков.
 *  • одно нажатие по частому началу (08:00, 12:00, 16:00…);
 *  • или печатаете «1400» — само станет 14:00;
 *  • кнопки −/+ двигают на 30 минут (стрелки ↑↓ на клавиатуре тоже);
 *  • конец ставится сам: начало + 8:30. Поправили конец вручную — дальше он не прыгает.
 */
export default function ShiftTimePicker({ start, end, onChange }: { start: string; end: string; onChange: (start: string, end: string) => void }) {
  const [endTouched, setEndTouched] = useState(false)
  const dur = start && end ? (((toMin(end) - toMin(start)) % 1440) + 1440) % 1440 : 0

  const setStart = (v: string) => onChange(v, endTouched || !end ? end : fromMin(toMin(v) + SHIFT_MIN))
  const quick = (v: string) => { setEndTouched(false); onChange(v, fromMin(toMin(v) + SHIFT_MIN)) }

  return (
    <div className="tp">
      <div className="tp-row">
        <div className="tp-grp">
          <span className="tp-lab">Начало</span>
          <TimeBox value={start} label="Начало смены" onCommit={setStart} />
        </div>
        <div className="tp-grp">
          <span className="tp-lab">Конец</span>
          <TimeBox value={end} label="Конец смены" onCommit={(v) => { setEndTouched(true); onChange(start, v) }} />
        </div>
        {dur > 0 && <span className="tp-dur">{Math.floor(dur / 60)} ч{dur % 60 ? ` ${dur % 60} мин` : ''}</span>}
      </div>
      <div className="tp-quick" role="group" aria-label="Частые начала смены">
        {QUICK.map((q) => (
          <button key={q} type="button" className={q === start ? 'on' : ''} onClick={() => quick(q)}>{q}</button>
        ))}
      </div>
      {!endTouched && start && <div className="tp-hint">Конец считается сам: начало + 8:30. Нужно иначе — поправьте «Конец».</div>}
    </div>
  )
}