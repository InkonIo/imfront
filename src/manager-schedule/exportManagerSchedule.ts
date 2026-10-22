import ExcelJS from 'exceljs'
import { addDays, dm } from './types'
import type { ManagerBoard, ManagerEntry } from './types'

// Выгрузка в том же виде, что и ваш Excel: по листу на неделю, имя и должность с подписью слева,
// дни по колонкам, в клетке время и задача, OFF и OFF**.

const FONT = 'Times New Roman'
const thin = { style: 'thin' as const, color: { argb: 'FF000000' } }
const BORDER: Partial<ExcelJS.Borders> = { top: thin, left: thin, bottom: thin, right: thin }
const solid = (argb: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })
const GREY = solid('FFE7E6E6')
const MANAGER = solid('FFFFC000')
const TRAINEE = solid('FFF8CBAD')
const TASKS = solid('FFFFFF99') // в клетке есть задачи
const TRAINING = solid('FFEE86DD') // обучение (TR / TRN)

const DAYS = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье']
const ROLE: Record<string, string> = {
  DIRECTOR: 'Директор ресторана',
  DEPUTY: 'Заместитель директора',
  MANAGER: 'Менеджер смены',
  TRAINEE: 'Менеджер на обучении',
}
const hhmm = (t: string) => t.slice(0, 5)
const POS_ONLY = /^(INS|K|К|C|С)$/i // только код позиции, без задач

function paint(cell: ExcelJS.Cell, o: { size?: number; bold?: boolean; fill?: ExcelJS.Fill; align?: 'center' | 'left' } = {}) {
  cell.border = BORDER
  cell.font = { name: FONT, size: o.size ?? 10, bold: o.bold ?? true }
  cell.alignment = { vertical: 'middle', horizontal: o.align ?? 'center', wrapText: true }
  if (o.fill) cell.fill = o.fill
}

function cellText(e: ManagerEntry | undefined): { text: string; fill?: ExcelJS.Fill } {
  if (!e) return { text: '' }
  const note = (e.comment ?? '').replace('**', '').trim()
  if (e.dayOff) return { text: e.comment?.includes('**') ? 'OFF**' : 'OFF' }
  if (!e.shiftStart) return { text: note }
  const time = `${hhmm(e.shiftStart)}-${hhmm(e.shiftEnd ?? '')}`
  const text = note ? `${time}\n${note}` : time
  if (/\bTRN?\b/.test(note)) return { text, fill: TRAINING }
  if (note && !POS_ONLY.test(note)) return { text, fill: TASKS }
  return { text }
}

function sheetName(board: ManagerBoard, used: Set<string>) {
  const base = `${dm(board.week.weekStart)}-${dm(addDays(board.week.weekStart, 6))}`
  let name = base
  for (let i = 2; used.has(name); i++) name = `${base} (${i})`
  used.add(name)
  return name
}

function addWeek(wb: ExcelJS.Workbook, board: ManagerBoard, used: Set<string>) {
  const ws = wb.addWorksheet(sheetName(board, used), {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })
  ws.columns = [{ width: 31 }, ...DAYS.map(() => ({ width: 28 }))]
  const dates = DAYS.map((_, i) => addDays(board.week.weekStart, i))

  const title = ws.addRow(['Расписание менеджеров'])
  ws.mergeCells(1, 1, 1, 8)
  paint(title.getCell(1), { size: 12 })
  title.height = 22
  ws.addRow([]).height = 8

  const head = ws.addRow(['Имя / должность', ...DAYS])
  const dateRow = ws.addRow(['', ...dates.map((d) => new Date(`${d}T12:00:00`))])
  ws.mergeCells(3, 1, 4, 1)
  for (let c = 1; c <= 8; c++) {
    paint(head.getCell(c), { fill: c > 1 ? GREY : undefined })
    paint(dateRow.getCell(c))
    if (c > 1) dateRow.getCell(c).numFmt = 'dd.mm.yyyy'
  }
  head.height = 24
  dateRow.height = 22

  const staff = [...board.staff]
  for (const s of staff) {
    const top = ws.addRow([s.fullName])
    const bottom = ws.addRow([`${ROLE[s.jobTitle] ?? s.jobTitle}\n\nПодпись ________`])
    const r1 = top.number
    const r2 = bottom.number
    paint(top.getCell(1), { fill: s.jobTitle === 'MANAGER' ? MANAGER : s.jobTitle === 'TRAINEE' ? TRAINEE : undefined })
    paint(bottom.getCell(1))
    top.height = 30
    bottom.height = 60
    dates.forEach((d, i) => {
      const col = i + 2
      const { text, fill } = cellText(board.entries.find((e) => e.userId === s.userId && e.date === d))
      ws.mergeCells(r1, col, r2, col)
      const cell = top.getCell(col)
      cell.value = text
      paint(cell, { fill })
      paint(bottom.getCell(col))
    })
  }

  ws.addRow([]).height = 8
  const director = staff.find((s) => s.jobTitle === 'DIRECTOR')
  const foot = ws.addRow([`Дата: ${dm(board.week.weekStart)}.${board.week.weekStart.slice(2, 4)}`, director ? `Директор ресторана - ${director.fullName} _______` : ''])
  ws.mergeCells(foot.number, 2, foot.number, 6)
  foot.getCell(1).font = { name: FONT, size: 12, bold: true }
  foot.getCell(2).font = { name: FONT, size: 12, bold: true }
  foot.height = 30
}

/** Один файл: по листу на каждую неделю из списка. */
export async function exportManagerSchedule(boards: ManagerBoard[], fileName: string) {
  if (boards.length === 0) return
  const wb = new ExcelJS.Workbook()
  const used = new Set<string>()
  boards.forEach((b) => addWeek(wb, b, used))

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(link.href), 5000)
}