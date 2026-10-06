import ExcelJS from 'exceljs'
import type { DayPart } from '../types'
import { ABSENCE_LABEL, JOB_LABEL, POSITION_LABEL, hhmm, limitText } from './types'
import type { Board, Col } from './types'

const FONT = 'Times New Roman'
const thin = { style: 'thin' as const, color: { argb: 'FF000000' } }
const BORDER: Partial<ExcelJS.Borders> = { top: thin, left: thin, bottom: thin, right: thin }
const YELLOW: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC000' } }
const LIGHT: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEAC1' } }
const DOW = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
const PART_TITLE: Record<DayPart, string> = { MORNING: 'УТРО', EVENING: 'ВЕЧЕР', MIDDLE: 'ПРОМЕЖ' }

const dm = (s: string) => `${s.slice(8, 10)}.${s.slice(5, 7)}`

function style(row: ExcelJS.Row, cols: number, opts: { bold?: boolean; fill?: ExcelJS.Fill; center?: boolean } = {}) {
  for (let c = 1; c <= cols; c++) {
    const cell = row.getCell(c)
    cell.border = BORDER
    cell.font = { name: FONT, size: 11, bold: opts.bold }
    cell.alignment = { vertical: 'middle', horizontal: opts.center ? 'center' : 'left', wrapText: true }
    if (opts.fill) cell.fill = opts.fill
  }
}

function nextDay(s: string) {
  const d = new Date(`${s}T12:00:00`)
  d.setDate(d.getDate() + 1)
  return d.toLocaleDateString('en-CA')
}

export async function exportSchedule(board: Board, cols: Col[]) {
  const wb = new ExcelJS.Workbook()
  const total = 2 + cols.length

  // ---------- график ----------
  const ws = wb.addWorksheet('График', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })
  ws.columns = [{ width: 10 }, { width: 6 }, ...cols.map(() => ({ width: 17 }))]

  const title = ws.addRow([`График менеджеров · ${board.outletName} · ${dm(board.from)}–${dm(board.to)}`])
  ws.mergeCells(title.number, 1, title.number, total)
  style(title, total, { bold: true, fill: YELLOW, center: true })
  title.height = 26

  const partRow = ws.addRow(['Дата', 'День', ...cols.map((c) => PART_TITLE[c.part])])
  style(partRow, total, { bold: true, fill: LIGHT, center: true })
  // объединить подряд идущие колонки одной части дня
  let startCol = 3
  for (let i = 1; i <= cols.length; i++) {
    if (i === cols.length || cols[i].part !== cols[i - 1].part) {
      const endCol = 2 + i
      if (endCol > startCol) ws.mergeCells(partRow.number, startCol, partRow.number, endCol)
      startCol = endCol + 1
    }
  }

  const roleRow = ws.addRow([
    '',
    '',
    ...cols.map((c) => (c.part === 'MIDDLE' ? `${POSITION_LABEL[c.role]} ${c.start}–${c.end}` : POSITION_LABEL[c.role])),
  ])
  style(roleRow, total, { bold: true, fill: LIGHT, center: true })

  for (let d = board.from; d <= board.to; d = nextDay(d)) {
    const date = new Date(`${d}T12:00:00`)
    const names = cols.map((c) => {
      const s = board.slots.find(
        (x) =>
          x.date === d &&
          x.dayPart === c.part &&
          x.role === c.role &&
          (c.part !== 'MIDDLE' || hhmm(x.startTime) === c.start),
      )
      return s?.userName ?? ''
    })
    const row = ws.addRow([dm(d), DOW[date.getDay()], ...names])
    style(row, total, { center: true })
    row.height = 20
    if (date.getDay() === 0 || date.getDay() === 6) {
      row.getCell(2).font = { name: FONT, size: 11, bold: true, color: { argb: 'FFC00000' } }
    }
  }

  // ---------- сводка ----------
  const sum = wb.addWorksheet('Сводка')
  sum.columns = [{ width: 18 }, { width: 24 }, { width: 8 }, { width: 8 }, { width: 8 }, { width: 9 }, { width: 10 }]
  style(sum.addRow(['Сотрудник', 'Должность', 'Смен', 'Утро', 'Вечер', 'Промеж', 'Инсайдом']), 7, {
    bold: true,
    fill: LIGHT,
    center: true,
  })
  board.staff.forEach((s) => {
    const st = board.stats.find((x) => x.userId === s.userId)
    style(
      sum.addRow([
        s.fullName,
        JOB_LABEL[s.jobTitle],
        st?.shifts ?? 0,
        st?.mornings ?? 0,
        st?.evenings ?? 0,
        st?.middles ?? 0,
        st?.insides ?? 0,
      ]),
      7,
    )
  })

  // ---------- отсутствия и пожелания ----------
  const ab = wb.addWorksheet('Отсутствия и пожелания')
  ab.columns = [{ width: 18 }, { width: 16 }, { width: 40 }, { width: 30 }]
  style(ab.addRow(['Сотрудник', 'Что', 'Когда', 'Комментарий']), 4, { bold: true, fill: LIGHT, center: true })
  board.absences.forEach((a) =>
    style(ab.addRow([a.userName ?? '', ABSENCE_LABEL[a.kind], `${dm(a.from)}–${dm(a.to)}`, a.note ?? '']), 4),
  )
  board.limits.forEach((l) => style(ab.addRow([l.userName ?? '', '🙅 Не может', limitText(l), l.note ?? '']), 4))

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `График ${board.outletName} ${dm(board.from)}-${dm(board.to)}.xlsx`
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(link.href), 5000)
}