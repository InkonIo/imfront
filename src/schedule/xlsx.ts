import ExcelJS from 'exceljs'
import type { DayPart, ShiftRole } from '../types'
import { ABSENCE_LABEL, JOB_LABEL, POSITION_LABEL } from './types'
import type { Board } from './types'

const FONT = 'Times New Roman'
const thin = { style: 'thin' as const, color: { argb: 'FF000000' } }
const BORDER: Partial<ExcelJS.Borders> = { top: thin, left: thin, bottom: thin, right: thin }
const YELLOW: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC000' } }
const LIGHT: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEAC1' } }
const DOW = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']

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

export async function exportSchedule(board: Board, morning: ShiftRole[], evening: ShiftRole[]) {
  const wb = new ExcelJS.Workbook()
  const cols: { part: DayPart; role: ShiftRole }[] = [
    ...morning.map((role) => ({ part: 'MORNING' as DayPart, role })),
    ...evening.map((role) => ({ part: 'EVENING' as DayPart, role })),
  ]
  const total = 2 + cols.length

  // ---------- лист 1: график ----------
  const ws = wb.addWorksheet('График', { pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } })
  ws.columns = [{ width: 10 }, { width: 6 }, ...cols.map(() => ({ width: 16 }))]

  const title = ws.addRow([`График менеджеров · ${board.outletName} · ${dm(board.from)}–${dm(board.to)}`])
  ws.mergeCells(title.number, 1, title.number, total)
  style(title, total, { bold: true, fill: YELLOW, center: true })
  title.height = 26

  const partRow = ws.addRow(['Дата', 'День', ...cols.map((c) => (c.part === 'MORNING' ? 'УТРО' : 'ВЕЧЕР'))])
  if (morning.length > 1) ws.mergeCells(partRow.number, 3, partRow.number, 2 + morning.length)
  if (evening.length > 1) ws.mergeCells(partRow.number, 3 + morning.length, partRow.number, total)
  style(partRow, total, { bold: true, fill: LIGHT, center: true })

  const roleRow = ws.addRow(['', '', ...cols.map((c) => POSITION_LABEL[c.role])])
  style(roleRow, total, { bold: true, fill: LIGHT, center: true })

  for (let d = board.from; d <= board.to; d = nextDay(d)) {
    const date = new Date(`${d}T12:00:00`)
    const names = cols.map((c) => {
      const s = board.slots.find((x) => x.date === d && x.dayPart === c.part && x.role === c.role)
      return s?.userName ?? ''
    })
    const row = ws.addRow([dm(d), DOW[date.getDay()], ...names])
    style(row, total, { center: true })
    row.height = 20
    if (date.getDay() === 0 || date.getDay() === 6) row.getCell(2).font = { name: FONT, size: 11, bold: true, color: { argb: 'FFC00000' } }
  }

  // ---------- лист 2: сводка ----------
  const sum = wb.addWorksheet('Сводка')
  sum.columns = [{ width: 18 }, { width: 24 }, { width: 8 }, { width: 8 }, { width: 8 }, { width: 10 }]
  const h = sum.addRow(['Сотрудник', 'Должность', 'Смен', 'Утро', 'Вечер', 'Инсайдом'])
  style(h, 6, { bold: true, fill: LIGHT, center: true })
  board.staff.forEach((s) => {
    const st = board.stats.find((x) => x.userId === s.userId)
    style(sum.addRow([s.fullName, JOB_LABEL[s.jobTitle], st?.shifts ?? 0, st?.mornings ?? 0, st?.evenings ?? 0, st?.insides ?? 0]), 6)
  })

  // ---------- лист 3: отсутствия ----------
  const ab = wb.addWorksheet('Отсутствия')
  ab.columns = [{ width: 18 }, { width: 16 }, { width: 10 }, { width: 10 }, { width: 30 }]
  const ah = ab.addRow(['Сотрудник', 'Причина', 'С', 'По', 'Комментарий'])
  style(ah, 5, { bold: true, fill: LIGHT, center: true })
  board.absences.forEach((a) => style(ab.addRow([a.userName ?? '', ABSENCE_LABEL[a.kind], dm(a.from), dm(a.to), a.note ?? '']), 5))

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

function nextDay(s: string) {
  const d = new Date(`${s}T12:00:00`)
  d.setDate(d.getDate() + 1)
  return d.toLocaleDateString('en-CA')
}