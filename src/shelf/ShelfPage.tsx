import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import './shelf.css'
import { useAuth } from '../auth'
import { shelfApi } from './api'
import type { Product, Rule, Section, ShelfData } from './api'
import { DocForm, ProductForm, RuleForm } from './ShelfEdit'

const KIND: Record<string, string> = { THAW: 'Разморозка', HOLD: 'Выдержка', WASH: 'Мытьё', DRY: 'Сушка' }
const ZONE_ICON: Record<string, string> = { ROOM: '☀', COLD: '❄', FREEZER: '✱', WATER: '≈' }

const ye = (s: string) => s.toLowerCase().replace(/ё/g, 'е')

/** Подсветка найденных слов (регистр и ё/е не важны). */
function Mark({ text, q }: { text: string; q: string }) {
  const words = ye(q).split(/\s+/).filter(Boolean)
  if (!words.length) return <>{text}</>
  const low = ye(text)
  const hit = new Array<boolean>(text.length).fill(false)
  for (const w of words) {
    let i = low.indexOf(w)
    while (i !== -1) { for (let k = i; k < i + w.length; k++) hit[k] = true; i = low.indexOf(w, i + w.length) }
  }
  const out: ReactNode[] = []
  let start = 0
  for (let i = 1; i <= text.length; i++) {
    if (i === text.length || hit[i] !== hit[start]) {
      const part = text.slice(start, i)
      out.push(hit[start] ? <mark key={start}>{part}</mark> : part)
      start = i
    }
  }
  return <>{out}</>
}

function fmtDate(d: string | null) {
  if (!d) return ''
  const [y, m, day] = d.split('-')
  return `${day}.${m}.${y}`
}

type Editing =
  | { t: 'doc' }
  | { t: 'product'; product?: Product; sectionId: number }
  | { t: 'rule'; productId: number; rule?: Rule }
  | null

/** Сроки хранения. Видят все роли; редактируют SUPER_ADMIN и DIRECTOR. */
export default function ShelfPage() {
  const { user } = useAuth()
  const canEdit = user?.accountRole === 'SUPER_ADMIN' || user?.accountRole === 'DIRECTOR'
  const [editMode, setEditMode] = useState(false)
  const [input, setInput] = useState('')
  const [q, setQ] = useState('')
  const [zone, setZone] = useState('')
  const [sectionId, setSectionId] = useState<number | null>(null)
  const [data, setData] = useState<ShelfData | null>(null)
  const [allSections, setAllSections] = useState<Section[]>([])
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Editing>(null)
  const seq = useRef(0)

  // поиск с задержкой, чтобы не дёргать сервер на каждую букву
  useEffect(() => {
    const t = setTimeout(() => setQ(input), 220)
    return () => clearTimeout(t)
  }, [input])

  const load = useCallback(async () => {
    const my = ++seq.current
    setLoading(true)
    try {
      const d = await shelfApi.list(q, zone, sectionId)
      if (my !== seq.current) return
      setData(d)
      setErr('')
    } catch (e) {
      if (my === seq.current) setErr(e instanceof Error ? e.message : 'Не удалось загрузить')
    } finally {
      if (my === seq.current) setLoading(false)
    }
  }, [q, zone, sectionId])
  useEffect(() => { void load() }, [load])

  // список разделов без фильтров нужен для вкладок и форм
  useEffect(() => {
    shelfApi.list('', '', null).then(d => setAllSections(d.sections)).catch(() => {})
  }, [data?.doc.version, data?.total])

  const afterEdit = () => { setEditing(null); void load() }
  const filtered = !!(q.trim() || zone || sectionId)
  const sectionCounts = useMemo(
    () => Object.fromEntries(allSections.map(s => [s.id, s.products.length])), [allSections])

  async function remove(kind: 'product' | 'rule', id: number, label: string) {
    if (!window.confirm(`Удалить «${label}»?`)) return
    try {
      if (kind === 'product') await shelfApi.deleteProduct(id)
      else await shelfApi.deleteRule(id)
      void load()
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Не удалось удалить')
    }
  }

  return (
    <div className="shelf">
      <div className="shelf-top">
        <div className="shelf-search">
          <span aria-hidden>🔎</span>
          <input
            type="search"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Найти продукт, место хранения или срок…"
            aria-label="Поиск по срокам хранения"
          />
          {input && <button className="shelf-clear" onClick={() => setInput('')} aria-label="Очистить">✕</button>}
        </div>
        {canEdit && (
          <button className={`shelf-btn ${editMode ? 'on' : ''}`} onClick={() => setEditMode(!editMode)}>
            {editMode ? '✓ Готово' : '✎ Редактировать'}
          </button>
        )}
      </div>

      {data && (
        <div className="shelf-meta">
          {data.doc.notice && <div className="shelf-notice">⚠ {data.doc.notice}</div>}
          <div className="shelf-ver">
            Версия {data.doc.version}{data.doc.docDate ? ` от ${fmtDate(data.doc.docDate)}` : ''}
            {editMode && <button className="shelf-link" onClick={() => setEditing({ t: 'doc' })}>изменить</button>}
          </div>
        </div>
      )}

      {data && (
        <div className="shelf-zones" role="group" aria-label="Температурная зона">
          <button className={`zone z-all ${!zone ? 'on' : ''}`} onClick={() => setZone('')}>Все зоны</button>
          {data.zones.map(z => (
            <button key={z.code} className={`zone z-${z.code} ${zone === z.code ? 'on' : ''}`} onClick={() => setZone(zone === z.code ? '' : z.code)}>
              <i>{ZONE_ICON[z.code]}</i>{z.label}<small>{z.tempText}</small>
            </button>
          ))}
        </div>
      )}

      {allSections.length > 0 && (
        <nav className="shelf-tabs" aria-label="Разделы">
          <button className={!sectionId ? 'on' : ''} onClick={() => setSectionId(null)}>Все</button>
          {allSections.map(s => (
            <button key={s.id} className={sectionId === s.id ? 'on' : ''} onClick={() => setSectionId(sectionId === s.id ? null : s.id)}>
              {s.title.charAt(0) + s.title.slice(1).toLowerCase()}<small>{sectionCounts[s.id] ?? 0}</small>
            </button>
          ))}
        </nav>
      )}

      {err && <div className="shelf-err">Не удалось загрузить: {err} <button className="shelf-link" onClick={() => void load()}>Повторить</button></div>}
      {!data && loading && <div className="shelf-empty">Загрузка…</div>}

      {data && (
        <div className={loading ? 'shelf-body stale' : 'shelf-body'}>
          {filtered && <div className="shelf-found">Найдено продуктов: <b>{data.total}</b></div>}
          {data.sections.length === 0 && (
            <div className="shelf-empty">
              Ничего не нашлось{q ? <> по запросу «<b>{q}</b>»</> : ''}. Попробуйте другое слово или сбросьте фильтры.
              <div><button className="shelf-btn" onClick={() => { setInput(''); setZone(''); setSectionId(null) }}>Сбросить всё</button></div>
            </div>
          )}
          {data.sections.map(s => (
            <section key={s.id} className="shelf-section">
              <header>
                <h2>{s.title}</h2>
                {editMode && <button className="shelf-btn small" onClick={() => setEditing({ t: 'product', sectionId: s.id })}>+ Продукт</button>}
              </header>
              {s.note && <div className="shelf-note">{s.note}</div>}
              <div className="shelf-grid">
                {s.products.map(p => (
                  <article key={p.id} className="shelf-card">
                    <header>
                      <h3><Mark text={p.name} q={q} /></h3>
                      {editMode && (
                        <span className="shelf-tools">
                          <button aria-label="Изменить продукт" onClick={() => setEditing({ t: 'product', product: p, sectionId: s.id })}>✎</button>
                          <button aria-label="Удалить продукт" onClick={() => void remove('product', p.id, p.name)}>🗑</button>
                        </span>
                      )}
                    </header>
                    {p.note && <div className="shelf-pnote">{p.note}</div>}
                    <ul>
                      {p.rules.map(r => (
                        <li key={r.id} className={r.hit ? 'hit' : ''}>
                          <div className="where">
                            {r.zone && <span className={`dot z-${r.zone}`} title={data.zones.find(z => z.code === r.zone)?.label}>{ZONE_ICON[r.zone]}</span>}
                            <span>
                              {r.kind !== 'SHELF' && <em className={`kind k-${r.kind}`}>{KIND[r.kind]}</em>}
                              <Mark text={r.place} q={q} />
                            </span>
                          </div>
                          <div className="term"><Mark text={r.term} q={q} /></div>
                          {editMode && (
                            <span className="shelf-tools">
                              <button aria-label="Изменить срок" onClick={() => setEditing({ t: 'rule', productId: p.id, rule: r })}>✎</button>
                              <button aria-label="Удалить срок" onClick={() => void remove('rule', r.id, r.place)}>🗑</button>
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                    {editMode && <button className="shelf-btn small ghost" onClick={() => setEditing({ t: 'rule', productId: p.id })}>+ Условие и срок</button>}
                  </article>
                ))}
                {s.products.length === 0 && !filtered && <div className="shelf-empty small">Продуктов нет</div>}
              </div>
            </section>
          ))}
        </div>
      )}

      {editing?.t === 'doc' && data && <DocForm doc={data.doc} onClose={() => setEditing(null)} onSaved={afterEdit} />}
      {editing?.t === 'product' && (
        <ProductForm sections={allSections} sectionId={editing.sectionId} product={editing.product} onClose={() => setEditing(null)} onSaved={afterEdit} />
      )}
      {editing?.t === 'rule' && data && (
        <RuleForm zones={data.zones} productId={editing.productId} rule={editing.rule} onClose={() => setEditing(null)} onSaved={afterEdit} />
      )}
    </div>
  )
}
