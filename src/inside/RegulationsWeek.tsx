import { DLK, INSIDE, WEEKDAYS, WEEKDAYS_SHORT, todayIndex } from './regulations'
import './regulations.css'

const Dash = () => <span className="rg-none">—</span>

/**
 * Регламенты по дням недели для Инсайда и ДЛК.
 * Сверху — крупно сегодняшний день, ниже вся неделя (сегодня подсвечен, прошедшие дни приглушены).
 * dayPart — утро или вечер текущей смены: эта колонка подсвечивается.
 */
export default function RegulationsWeek({ dayPart }: { dayPart?: string }) {
  const today = todayIndex()
  const mine = dayPart === 'MORNING' ? 'morning' : dayPart === 'EVENING' ? 'evening' : null
  const t = INSIDE[today]

  return (
    <div className="rg">
      <section className="rg-today">
        <div className="rg-today-head">
          <span className="rg-tag">Сегодня</span>
          <h2>{WEEKDAYS[today]}</h2>
        </div>
        <div className="rg-today-grid">
          <div className={mine === 'morning' ? 'rg-box mine' : 'rg-box'}>
            <small>🌅 Инсайд · утро</small>
            <b>{t.morning ?? <Dash />}</b>
          </div>
          <div className={mine === 'evening' ? 'rg-box mine' : 'rg-box'}>
            <small>🌙 Инсайд · вечер</small>
            <b>{t.evening ?? <Dash />}</b>
          </div>
          <div className="rg-box dlk">
            <small>🧽 ДЛК</small>
            <b>{DLK[today] ?? <Dash />}</b>
          </div>
        </div>
      </section>

      <section className="rg-week">
        <h3>Вся неделя</h3>
        <div className="rg-table" role="table">
          <div className="rg-row rg-headrow" role="row">
            <span>День</span>
            <span>🌅 Инсайд · утро</span>
            <span>🌙 Инсайд · вечер</span>
            <span>🧽 ДЛК</span>
          </div>
          {WEEKDAYS.map((name, i) => (
            <div key={name} role="row" className={['rg-row', i === today ? 'now' : '', i < today ? 'past' : ''].join(' ').trim()}>
              <span className="rg-day">
                <b>{WEEKDAYS_SHORT[i]}</b>
                <em>{name}</em>
                {i === today && <i className="rg-now">сегодня</i>}
              </span>
              <span data-label="Инсайд · утро" className={i === today && mine === 'morning' ? 'mine' : ''}>
                {INSIDE[i].morning ?? <Dash />}
              </span>
              <span data-label="Инсайд · вечер" className={i === today && mine === 'evening' ? 'mine' : ''}>
                {INSIDE[i].evening ?? <Dash />}
              </span>
              <span data-label="ДЛК">{DLK[i] ?? <Dash />}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}