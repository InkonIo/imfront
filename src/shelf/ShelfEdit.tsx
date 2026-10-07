import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { shelfApi } from './api'
import type { Product, Rule, Section, ShelfData, Zone } from './api'

function Dialog(p: { title: string; onClose: () => void; children: ReactNode }) {
  return createPortal(
    <div className="shelf-modal-bg" onMouseDown={e => e.target === e.currentTarget && p.onClose()}>
      <div className="shelf-modal" role="dialog" aria-modal="true" aria-label={p.title}>
        <header><h3>{p.title}</h3><button onClick={p.onClose} aria-label="Закрыть">✕</button></header>
        {p.children}
      </div>
    </div>,
    document.body,
  )
}

function useSave(onSaved: () => void) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setErr('')
    try { await fn(); onSaved() } catch (e) { setErr(e instanceof Error ? e.message : 'Не удалось сохранить'); setBusy(false) }
  }
  return { busy, err, run }
}

export function ProductForm(p: { sections: Section[]; sectionId: number; product?: Product; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(p.product?.name ?? '')
  const [note, setNote] = useState(p.product?.note ?? '')
  const [sec, setSec] = useState(p.sectionId)
  const s = useSave(p.onSaved)
  function submit(e: FormEvent) {
    e.preventDefault()
    void s.run(() => p.product
      ? shelfApi.updateProduct(p.product.id, { sectionId: sec, name, note: note || null })
      : shelfApi.createProduct({ sectionId: sec, name, note: note || null }))
  }
  return (
    <Dialog title={p.product ? 'Изменить продукт' : 'Новый продукт'} onClose={p.onClose}>
      <form onSubmit={submit}>
        <label>Название<input autoFocus value={name} onChange={e => setName(e.target.value)} maxLength={200} required /></label>
        <label>Раздел
          <select value={sec} onChange={e => setSec(Number(e.target.value))}>
            {p.sections.map(x => <option key={x.id} value={x.id}>{x.title}</option>)}
          </select>
        </label>
        <label>Примечание (необязательно)<input value={note} onChange={e => setNote(e.target.value)} maxLength={500} /></label>
        {s.err && <div className="shelf-err">{s.err}</div>}
        <footer><button type="button" className="shelf-btn" onClick={p.onClose}>Отмена</button><button className="shelf-btn primary" disabled={s.busy || !name.trim()}>{s.busy ? 'Сохраняю…' : 'Сохранить'}</button></footer>
      </form>
    </Dialog>
  )
}

export function RuleForm(p: { zones: Zone[]; productId: number; rule?: Rule; onClose: () => void; onSaved: () => void }) {
  const [place, setPlace] = useState(p.rule?.place ?? '')
  const [term, setTerm] = useState(p.rule?.term ?? '')
  const [kind, setKind] = useState<string>(p.rule?.kind ?? 'SHELF')
  const [zone, setZone] = useState(p.rule?.zone ?? '')
  const s = useSave(p.onSaved)
  function submit(e: FormEvent) {
    e.preventDefault()
    const body = { kind, place, term, zone: zone || null }
    void s.run(() => p.rule ? shelfApi.updateRule(p.rule.id, body) : shelfApi.createRule(p.productId, body))
  }
  return (
    <Dialog title={p.rule ? 'Изменить условие и срок' : 'Новое условие и срок'} onClose={p.onClose}>
      <form onSubmit={submit}>
        <label>Где / как хранится<textarea autoFocus rows={3} value={place} onChange={e => setPlace(e.target.value)} maxLength={500} required
          placeholder="например: вскрытая упаковка в холодильном оборудовании при температуре +1…+4 °C" /></label>
        <label>Срок<input value={term} onChange={e => setTerm(e.target.value)} maxLength={200} required placeholder="например: 24 часа (1 день)" /></label>
        <div className="row">
          <label>Тип
            <select value={kind} onChange={e => setKind(e.target.value)}>
              <option value="SHELF">Срок хранения</option><option value="THAW">Разморозка</option>
              <option value="HOLD">Выдержка</option><option value="WASH">Мытьё</option><option value="DRY">Сушка</option>
            </select>
          </label>
          <label>Температурная зона
            <select value={zone} onChange={e => setZone(e.target.value)}>
              <option value="">Определить по тексту</option>
              {p.zones.map(z => <option key={z.code} value={z.code}>{z.label} ({z.tempText})</option>)}
            </select>
          </label>
        </div>
        {s.err && <div className="shelf-err">{s.err}</div>}
        <footer><button type="button" className="shelf-btn" onClick={p.onClose}>Отмена</button><button className="shelf-btn primary" disabled={s.busy || !place.trim() || !term.trim()}>{s.busy ? 'Сохраняю…' : 'Сохранить'}</button></footer>
      </form>
    </Dialog>
  )
}

export function DocForm(p: { doc: ShelfData['doc']; onClose: () => void; onSaved: () => void }) {
  const [version, setVersion] = useState(String(p.doc.version))
  const [date, setDate] = useState(p.doc.docDate ?? '')
  const [notice, setNotice] = useState(p.doc.notice ?? '')
  const s = useSave(p.onSaved)
  function submit(e: FormEvent) {
    e.preventDefault()
    void s.run(() => shelfApi.updateDoc({ version: Number(version), docDate: date || null, notice: notice || null }))
  }
  return (
    <Dialog title="Версия документа" onClose={p.onClose}>
      <form onSubmit={submit}>
        <div className="row">
          <label>Версия<input type="number" min={1} value={version} onChange={e => setVersion(e.target.value)} required /></label>
          <label>Дата<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
        </div>
        <label>Главное предупреждение сверху<textarea rows={3} value={notice} onChange={e => setNotice(e.target.value)} maxLength={500} /></label>
        {s.err && <div className="shelf-err">{s.err}</div>}
        <footer><button type="button" className="shelf-btn" onClick={p.onClose}>Отмена</button><button className="shelf-btn primary" disabled={s.busy}>{s.busy ? 'Сохраняю…' : 'Сохранить'}</button></footer>
      </form>
    </Dialog>
  )
}
