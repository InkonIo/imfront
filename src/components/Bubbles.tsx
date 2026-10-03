import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'

const FLOATING = [
  { size: 150, left: 58, top: 55, dur: 9, delay: 0, depth: 22 },
  { size: 90, left: 8, top: 68, dur: 7.5, delay: -2, depth: 14 },
  { size: 64, left: 76, top: 14, dur: 6.5, delay: -4, depth: 10 },
  { size: 110, left: 34, top: 6, dur: 10, delay: -1, depth: 18 },
  { size: 40, left: 26, top: 42, dur: 5.5, delay: -3, depth: 6 },
  { size: 72, left: 84, top: 80, dur: 8, delay: -5, depth: 12 },
]

const RISING = Array.from({ length: 16 }, (_, i) => ({
  size: 6 + ((i * 7) % 20),
  left: (i * 37 + 11) % 100,
  dur: 11 + ((i * 5) % 10),
  delay: -((i * 1.9) % 16),
}))

export default function Bubbles({ subtle = false }: { subtle?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const [popped, setPopped] = useState<Set<number>>(() => new Set())

  useEffect(() => {
    const el = ref.current
    if (!el || subtle) return
    let frame = 0
    const onMove = (e: MouseEvent) => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        el.style.setProperty('--mx', String(e.clientX / window.innerWidth - 0.5))
        el.style.setProperty('--my', String(e.clientY / window.innerHeight - 0.5))
      })
    }
    window.addEventListener('mousemove', onMove)
    return () => {
      window.removeEventListener('mousemove', onMove)
      cancelAnimationFrame(frame)
    }
  }, [subtle])

  function pop(i: number) {
    setPopped((prev) => new Set(prev).add(i))
    setTimeout(() => {
      setPopped((prev) => {
        const next = new Set(prev)
        next.delete(i)
        return next
      })
    }, 2600)
  }

  return (
    <div ref={ref} className={subtle ? 'bubbles subtle' : 'bubbles'} aria-hidden="true">
      {RISING.map((b, i) => (
        <span
          key={`r${i}`}
          className="bubble rising"
          style={
            {
              width: b.size,
              height: b.size,
              left: `${b.left}%`,
              '--dur': `${b.dur}s`,
              '--delay': `${b.delay}s`,
            } as CSSProperties
          }
        />
      ))}

      {!subtle &&
        FLOATING.map((b, i) => (
          <div
            key={`f${i}`}
            className="bubble-wrap"
            style={
              {
                width: b.size,
                height: b.size,
                left: `${b.left}%`,
                top: `${b.top}%`,
                '--d': b.depth,
                '--dur': `${b.dur}s`,
                '--delay': `${b.delay}s`,
              } as CSSProperties
            }
          >
            <button
              type="button"
              tabIndex={-1}
              className={popped.has(i) ? 'bubble float popped' : 'bubble float'}
              onClick={() => pop(i)}
            />
          </div>
        ))}
    </div>
  )
}