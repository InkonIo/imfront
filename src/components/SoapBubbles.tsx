import { useEffect, useRef, useState } from 'react'
import type { AnimationEvent, CSSProperties, PointerEvent } from 'react'
import './soap-bubbles.css'

interface Bubble {
  id: number
  size: number
  x: number
  y: number
  dur: number
  delay: number
  sway: number
  swayDur: number
  hue: number
}

interface Burst {
  id: number
  x: number
  y: number
  size: number
  hue: number
}

/** Записанные звуки лопания (лежат в public/sounds). Можно добавить ещё. */
const POP_FILES = ['/sounds/pop1.wav', '/sounds/pop2.wav', '/sounds/pop3.wav']

/** Линза работает только в Chromium (Chrome, Edge, Android). В Safari и Firefox будет «стекло» из CSS. */
const LENS =
  typeof window !== 'undefined' &&
  !!(navigator as Navigator & { userAgentData?: { brands?: { brand: string }[] } }).userAgentData?.brands?.some((b) =>
    /Chromium/i.test(b.brand),
  ) &&
  !window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Линзу получают только пузыри от этого размера: мелким она не видна, а нагрузка есть. */
const LENS_MIN = 70

/** Карта смещения: красный канал меняется слева направо, зелёный сверху вниз → изображение стягивается к центру. */
const LENS_MAP =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100" preserveAspectRatio="none">' +
      '<defs>' +
      '<linearGradient id="x" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#f00"/><stop offset="1" stop-color="#000"/></linearGradient>' +
      '<linearGradient id="y" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0f0"/><stop offset="1" stop-color="#000"/></linearGradient>' +
      '</defs>' +
      '<rect width="100" height="100" fill="url(#x)"/>' +
      '<rect width="100" height="100" fill="url(#y)" style="mix-blend-mode:screen"/>' +
      '</svg>',
  )

/** Капли при лопании: угол и дальность разлёта. */
const DROPS = Array.from({ length: 12 }, (_, i) => ({ a: i * 30 + (i % 2) * 11, d: 14 + ((i * 7) % 5) * 7 }))

/** Мелкая шипучка: только для атмосферы, её не лопают. */
const FIZZ = Array.from({ length: 14 }, (_, i) => ({
  size: 5 + ((i * 7) % 11),
  x: (i * 37 + 9) % 100,
  dur: 9 + ((i * 5) % 8),
  delay: -((i * 1.7) % 12),
}))

let nextId = 1
const rand = (min: number, max: number) => min + Math.random() * (max - min)

function makeBubble(spread: boolean): Bubble {
  const big = Math.random() < 0.3
  const size = Math.round(big ? rand(120, 190) : rand(48, 110))
  const dur = rand(18, 30)
  return {
    id: nextId++,
    size,
    x: rand(0, 94),
    y: rand(5, 85),
    dur,
    delay: spread ? -rand(0, dur) : 0,
    sway: rand(12, 36),
    swayDur: rand(3.5, 7),
    hue: rand(0, 360),
  }
}

// ================= звук =================

let audio: AudioContext | null = null
let rawPops: Promise<ArrayBuffer[]> | null = null
let pops: AudioBuffer[] | null = null
let decoding: Promise<void> | null = null

/** Скачать файлы заранее (без AudioContext, его можно создать только после клика). */
function prefetchPops() {
  rawPops ??= Promise.all(
    POP_FILES.map(async (url) => {
      const r = await fetch(url)
      if (!r.ok) throw new Error(url)
      return r.arrayBuffer()
    }),
  ).catch(() => [])
  return rawPops
}

function context() {
  const AC =
    window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  audio ??= new AC()
  if (audio.state === 'suspended') void audio.resume()
  return audio
}

function decodePops(ctx: AudioContext) {
  decoding ??= prefetchPops()
    .then((list) => Promise.all(list.map((buf) => ctx.decodeAudioData(buf.slice(0)))))
    .then((list) => {
      pops = list
    })
    .catch(() => {
      pops = []
    })
  return decoding
}

function playPop(size: number) {
  try {
    const ctx = context()
    if (pops === null) {
      // первый клик: раскодировать файлы и сразу сыграть
      void decodePops(ctx).then(() => playPop(size))
      return
    }
    if (pops.length === 0) {
      synthPop(ctx, size) // файлов нет → синтезированный звук
      return
    }
    const src = ctx.createBufferSource()
    src.buffer = pops[Math.floor(Math.random() * pops.length)]
    // большие пузыри звучат ниже, маленькие звонче, плюс немного случайности
    src.playbackRate.value = Math.min(1.4, Math.max(0.75, 1.3 - size / 320 + rand(-0.06, 0.06)))
    const gain = ctx.createGain()
    gain.gain.value = 0.7
    src.connect(gain).connect(ctx.destination)
    src.start()
  } catch {
    // звук не обязателен
  }
}

/** Запасной звук, если файлы не загрузились. */
function synthPop(ctx: AudioContext, size: number) {
  const t = ctx.currentTime
  const len = 0.07
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * len), ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 3
  const noise = ctx.createBufferSource()
  noise.buffer = buffer
  const band = ctx.createBiquadFilter()
  band.type = 'bandpass'
  band.frequency.value = Math.max(900, 2600 - size * 6)
  band.Q.value = 0.9
  const noiseGain = ctx.createGain()
  noiseGain.gain.value = 0.25
  noise.connect(band).connect(noiseGain).connect(ctx.destination)

  const osc = ctx.createOscillator()
  osc.frequency.setValueAtTime(Math.max(380, 1100 - size * 3), t)
  osc.frequency.exponentialRampToValueAtTime(180, t + 0.06)
  const oscGain = ctx.createGain()
  oscGain.gain.setValueAtTime(0.18, t)
  oscGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.07)
  osc.connect(oscGain).connect(ctx.destination)

  noise.start(t)
  osc.start(t)
  osc.stop(t + 0.08)
}

// ================= линза =================

/** Фильтр-линза под конкретный пузырь: увеличение к центру + радужная кайма (каналы смещаются по-разному). */
function LensFilter({ id, size }: { id: string; size: number }) {
  const s = size * 0.16 // сила преломления: около 1,2× в центре
  const channel = (k: number, keep: string, name: string) => [
    <feDisplacementMap
      key={`d${name}`}
      in="SourceGraphic"
      in2="map"
      scale={s * k}
      xChannelSelector="R"
      yChannelSelector="G"
      result={`d${name}`}
    />,
    <feColorMatrix key={`c${name}`} in={`d${name}`} type="matrix" values={keep} result={name} />,
  ]
  return (
    <filter
      id={id}
      filterUnits="userSpaceOnUse"
      primitiveUnits="userSpaceOnUse"
      x="0"
      y="0"
      width={size}
      height={size}
      colorInterpolationFilters="sRGB"
    >
      <feImage href={LENS_MAP} x="0" y="0" width={size} height={size} preserveAspectRatio="none" result="map" />
      {channel(1.15, '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0', 'r')}
      {channel(1, '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0', 'g')}
      {channel(0.85, '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0', 'b')}
      <feBlend in="r" in2="g" mode="screen" result="rg" />
      <feBlend in="rg" in2="b" mode="screen" />
    </filter>
  )
}

// ================= компонент =================

export default function SoapBubbles({ sound = true, onPop }: { sound?: boolean; onPop?: () => void }) {
  const [bubbles, setBubbles] = useState<Bubble[]>(() => {
    const n = window.matchMedia('(max-width: 900px)').matches ? 7 : 12
    return Array.from({ length: n }, () => makeBubble(true))
  })
  const [bursts, setBursts] = useState<Burst[]>([])
  const timers = useRef<number[]>([])

  useEffect(() => {
    const list = timers.current
    return () => list.forEach((t) => clearTimeout(t))
  }, [])

  // файлы звука скачиваем заранее, чтобы первый «пуп» был без задержки
  useEffect(() => {
    if (sound) void prefetchPops()
  }, [sound])

  function later(fn: () => void, ms: number) {
    timers.current.push(window.setTimeout(fn, ms))
  }

  function pop(b: Bubble, e: PointerEvent<HTMLButtonElement>) {
    e.preventDefault()
    const r = e.currentTarget.getBoundingClientRect()
    const burst: Burst = { id: b.id, x: r.left + r.width / 2, y: r.top + r.height / 2, size: r.width, hue: b.hue }

    setBubbles((list) => list.filter((x) => x.id !== b.id))
    setBursts((list) => [...list, burst])
    if (sound) playPop(r.width)
    onPop?.()

    later(() => setBursts((list) => list.filter((x) => x.id !== burst.id)), 700)
    later(() => setBubbles((list) => [...list, makeBubble(false)]), rand(900, 2200))
  }

  function recycle(e: AnimationEvent<HTMLDivElement>, id: number) {
    if (e.target !== e.currentTarget || e.animationName !== 'soap-rise') return
    setBubbles((list) => list.map((x) => (x.id === id ? { ...x, x: rand(0, 94), hue: rand(0, 360) } : x)))
  }

  return (
    <div className="soap" aria-hidden="true">
      {LENS && (
        <svg className="soap-defs" width="0" height="0">
          <defs>
            {bubbles
              .filter((b) => b.size >= LENS_MIN)
              .map((b) => (
                <LensFilter key={b.id} id={`soap-lens-${b.id}`} size={b.size} />
              ))}
          </defs>
        </svg>
      )}

      {FIZZ.map((f, i) => (
        <span
          key={`fz${i}`}
          className="soap-fizz"
          style={
            {
              left: `${f.x}%`,
              width: f.size,
              height: f.size,
              '--dur': `${f.dur}s`,
              '--delay': `${f.delay}s`,
            } as CSSProperties
          }
        />
      ))}

      {bubbles.map((b) => {
        const lens = LENS && b.size >= LENS_MIN
        return (
          <div
            key={b.id}
            className="soap-fly"
            onAnimationIteration={(e) => recycle(e, b.id)}
            style={
              {
                left: `${b.x}%`,
                '--size': `${b.size}px`,
                '--y': `${b.y}%`,
                '--dur': `${b.dur}s`,
                '--delay': `${b.delay}s`,
                '--sway': `${b.sway}px`,
                '--sway-dur': `${b.swayDur}s`,
              } as CSSProperties
            }
          >
            <div className="soap-sway">
              <button
                type="button"
                tabIndex={-1}
                className={lens ? 'soap-bubble lens' : 'soap-bubble'}
                style={
                  {
                    fontSize: b.size,
                    '--hue': `${b.hue}deg`,
                    ...(lens ? { backdropFilter: `url(#soap-lens-${b.id}) saturate(1.35) brightness(1.04)` } : {}),
                  } as CSSProperties
                }
                onPointerDown={(e) => pop(b, e)}
              >
                <span className="soap-glint" />
              </button>
            </div>
          </div>
        )
      })}

      {bursts.map((p) => (
        <div
          key={`b${p.id}`}
          className="soap-burst"
          style={{ left: p.x, top: p.y, fontSize: p.size, '--hue': `${p.hue}deg` } as CSSProperties}
        >
          <span className="soap-ring" />
          {DROPS.map((d, i) => (
            <span key={i} className="soap-drop" style={{ '--a': `${d.a}deg`, '--d': `${d.d}px` } as CSSProperties} />
          ))}
        </div>
      ))}
    </div>
  )
}