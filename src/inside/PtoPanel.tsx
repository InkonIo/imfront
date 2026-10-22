import { PTO, PTO_PERIODS } from './pto'
import type { PtoPeriod } from './pto'
import './pto.css'

// как часто: цветная точка у каждой строки, расшифровка один раз вверху
const TAG: Record<PtoPeriod, { label: string; cls: string }> = {
  Еженедельно: { label: 'неделя', cls: 'w1' },
  'Раз в две недели': { label: '2 недели', cls: 'w2' },
  Ежемесячно: { label: 'месяц', cls: 'm1' },
  Ежеквартально: { label: 'квартал', cls: 'q1' },
}

/** ПТО ресторана: компактный список, без кнопок. cols — сколько колонок (1–3). */
export default function PtoPanel({ cols = 1, flat = false }: { cols?: 1 | 2 | 3; flat?: boolean }) {
  const rows = PTO_PERIODS.flatMap((p) => PTO.filter((t) => t.period === p))
  return (
    <aside className={flat ? 'pto flat' : 'pto'}>
      <div className="pto-top">
        <h2>ПТО</h2>
        <div className="pto-legend">
          {PTO_PERIODS.map((p) => (
            <span key={p}>
              <i className={`pto-dot ${TAG[p].cls}`} /> {TAG[p].label}
            </span>
          ))}
        </div>
      </div>
      <div className={`pto-list c${cols}`}>
        {rows.map((r) => (
          <div key={r.period + r.text} className="pto-row">
            <i className={`pto-dot ${TAG[r.period].cls}`} title={r.period} />
            <span className="pto-text">
              {r.text} <span className="pto-min">· {r.minutes} мин</span>
            </span>
          </div>
        ))}
      </div>
    </aside>
  )
}