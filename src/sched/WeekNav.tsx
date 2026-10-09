import { addDays, dayLabel } from './planUtil'

/** Переключатель недели: стрелки, подпись «Сб 10.10 – Пт 16.10» и быстрый возврат. */
export default function WeekNav({ from, onChange, min, home, homeLabel }: {
  from: string; onChange: (s: string) => void; min?: string; home: string; homeLabel: string
}) {
  const prev = addDays(from, -7)
  const canPrev = !min || addDays(from, -7) >= min
  return (
    <div className="wk-nav">
      <button className="ext-btn sq" aria-label="Неделей раньше" disabled={!canPrev} onClick={() => onChange(prev)}>‹</button>
      <div className="wk-label">{dayLabel(from)} – {dayLabel(addDays(from, 6))}</div>
      <button className="ext-btn sq" aria-label="Неделей позже" onClick={() => onChange(addDays(from, 7))}>›</button>
      {from !== home && <button className="ext-btn sm" onClick={() => onChange(home)}>{homeLabel}</button>}
    </div>
  )
}