import ExcelJS from 'exceljs'
import { isFilled, totalOf, warnOf } from './logic'
import type { InvCount } from './types'

const FONT = 'Times New Roman'
const LAST_COL = 7 // A…G: 5 колонок как в бумажном листе + «Итого» + «Отметка»
const thin = { style: 'thin' as const, color: { argb: 'FF000000' } }
const BORDER: Partial<ExcelJS.Borders> = { top: thin, left: thin, bottom: thin, right: thin }

/** Excel в формате бумажного листа: те же шрифты, рамки, ширины и объединения. */
export async function exportCount(c: InvCount) {
  const weekly = c.listCode === 'WEEKLY'
  const headSize = weekly ? 14 : 12
  const labelSize = weekly ? 10 : 12
  const date = c.date.split('-').reverse().join('.')

  const wb = new ExcelJS.Workbook()
  wb.creator = 'IM Inside'
  const ws = wb.addWorksheet(weekly ? 'еженедельный' : 'ежедневный', {
    pageSetup: {
      paperSize: 9, // A4
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    },
    views: [{ state: 'frozen', ySplit: 2 }],
  })
  ws.columns = [32.1, 26.3, 18.9, 20.3, 26, 14, 22].map((width) => ({ width }))

  // ---------- объединённая строка: заголовок, имя/дата, зона ----------
  const mergedRow = (text: string, size: number) => {
    const row = ws.addRow([text])
    row.height = 30
    for (let col = 1; col <= LAST_COL; col++) row.getCell(col).border = BORDER
    ws.mergeCells(row.number, 1, row.number, LAST_COL)
    const cell = row.getCell(1)
    cell.font = { name: FONT, size, bold: true }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
  }

  mergedRow(`Лист Инвентаризация / ${weekly ? 'Неделя' : 'День'} / Все зоны хранения`, headSize)
  mergedRow(`${c.userName}, ${c.outletName}, ${date}`, headSize)

  // ---------- позиции ----------
  let zone = ''
  for (const l of c.lines) {
    if (l.zone !== zone) {
      zone = l.zone
      mergedRow(zone, headSize)
    }

    const filled = isFilled(l)
    const value = (v: number | null) => (!filled ? null : l.none ? 0 : v)
    const total = totalOf(l)
    const note = l.none ? 'нет на складе' : warnOf(l) && l.confirmed ? 'пересчитано, верно' : ''

    const row = ws.addRow([l.name, l.packText ?? ''])
    row.height = 30

    // C/D/E: пусто → подпись как на бумаге, есть цифра → число с подписью «CS 1»
    const counts: [number, number | null, string][] = [
      [3, value(l.cs), 'CS'],
      [4, value(l.slv), 'SLV'],
      [5, value(l.ea), 'EA/LT'],
    ]
    for (const [col, v, label] of counts) {
      const cell = row.getCell(col)
      if (v == null) {
        cell.value = label
        cell.font = { name: FONT, size: labelSize }
      } else {
        cell.value = v
        cell.numFmt = `"${label} "General`
        cell.font = { name: FONT, size: 12, bold: true }
      }
    }

    const totalCell = row.getCell(6)
    if (total != null) {
      totalCell.value = total
      totalCell.numFmt = `General" ${l.unit}"`
      totalCell.font = { name: FONT, size: 12, bold: true }
    }

    const noteCell = row.getCell(7)
    noteCell.value = note
    noteCell.font = { name: FONT, size: 10, italic: true }

    for (let col = 1; col <= LAST_COL; col++) {
      const cell = row.getCell(col)
      cell.border = BORDER
      cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true }
      if (!cell.font) cell.font = { name: FONT, size: 12 }
    }
  }

  // ---------- скачать ----------
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `Инвентаризация ${weekly ? 'неделя' : 'день'} ${date} ${c.userName}.xlsx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}