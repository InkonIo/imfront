import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth'
import Portal from '../components/Portal'


const ZONE = 'Asia/Almaty'
const MAX_SIDE = 1600

/** Встроенная камера доступна только в защищённом контексте (HTTPS или localhost). */
export function cameraSupported() {
  return typeof window !== 'undefined' && window.isSecureContext && !!navigator.mediaDevices?.getUserMedia
}

function stampTime() {
  return new Date()
    .toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: ZONE,
    })
    .replace(',', '')
}

function fit(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text
  let t = text
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1)
  return `${t}…`
}

/** Полоска внизу фото: время, точка, сотрудник и пункт. */
function drawStamp(ctx: CanvasRenderingContext2D, w: number, h: number, line1: string, line2: string) {
  const fs = Math.max(14, Math.round(w / 45))
  const pad = Math.round(fs * 0.6)
  const barH = fs * 2 + pad * 3
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)'
  ctx.fillRect(0, h - barH, w, barH)
  ctx.fillStyle = '#fff'
  ctx.textBaseline = 'top'
  ctx.font = `600 ${fs}px system-ui, -apple-system, sans-serif`
  ctx.fillText(fit(ctx, line1, w - pad * 2), pad, h - barH + pad)
  ctx.font = `${fs}px system-ui, -apple-system, sans-serif`
  ctx.fillText(fit(ctx, line2, w - pad * 2), pad, h - barH + pad * 2 + fs)
}

export default function CameraModal({
  title,
  onClose,
  onShot,
  onFallback,
}: {
  title: string
  onClose: () => void
  onShot: (blob: Blob) => Promise<boolean>
  onFallback: () => void
}) {
  const { user, shift } = useAuth()
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [facing, setFacing] = useState<'environment' | 'user'>('environment')
  const [ready, setReady] = useState(false)
  const [shot, setShot] = useState<{ blob: Blob; url: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // запуск и остановка камеры
  useEffect(() => {
    let cancelled = false
    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      })
      .then(async (stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        const v = videoRef.current
        if (v) {
          v.srcObject = stream
          await v.play().catch(() => {})
        }
        setReady(true)
        setError('')
      })
      .catch((err) => {
        if (cancelled) return
        setError(
          err instanceof DOMException && err.name === 'NotAllowedError'
            ? 'Нет доступа к камере. Разреши камеру для этого сайта в настройках браузера.'
            : 'Не удалось открыть камеру.',
        )
      })
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      setReady(false)
    }
  }, [facing])

  // освобождаем превью снимка
  useEffect(() => {
    return () => {
      if (shot) URL.revokeObjectURL(shot.url)
    }
  }, [shot])

  // закрытие по Esc
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function takeShot() {
    const v = videoRef.current
    if (!v || !v.videoWidth) return
    const scale = Math.min(1, MAX_SIDE / Math.max(v.videoWidth, v.videoHeight))
    const w = Math.round(v.videoWidth * scale)
    const h = Math.round(v.videoHeight * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(v, 0, 0, w, h)
    const line1 = [stampTime(), shift?.outletName, user?.fullName].filter(Boolean).join(' · ')
    drawStamp(ctx, w, h, line1, title)
    canvas.toBlob(
      (b) => {
        if (b) setShot({ blob: b, url: URL.createObjectURL(b) })
      },
      'image/jpeg',
      0.85,
    )
  }

  function retake() {
    setShot(null)
  }

  async function send() {
    if (!shot) return
    setBusy(true)
    const ok = await onShot(shot.blob)
    setBusy(false)
    if (ok) onClose()
  }

  return (
    <Portal>
    <div className="camera-backdrop">
      <div className="camera">
        <div className="camera-head">
          <span className="camera-title">📷 {title}</span>
          <button className="icon-btn camera-close" onClick={onClose} aria-label="Закрыть">
            ✕
          </button>
        </div>

        <div className="camera-view">
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className={facing === 'user' ? 'mirror' : ''}
            style={{ display: shot ? 'none' : 'block' }}
          />
          {shot && <img src={shot.url} alt="Снимок" />}
          {!ready && !shot && !error && <div className="camera-hint">Открываем камеру…</div>}
          {error && <div className="camera-hint">{error}</div>}
        </div>

        <div className="camera-controls">
          {shot ? (
            <>
              <button className="btn" onClick={retake} disabled={busy}>
                ↺ Переснять
              </button>
              <button className="btn primary" onClick={send} disabled={busy}>
                {busy ? 'Отправляем…' : '✓ Отправить'}
              </button>
            </>
          ) : error ? (
            <button className="btn primary" onClick={onFallback}>
              📷 Открыть камеру телефона
            </button>
          ) : (
            <>
              <button
                className="btn camera-flip"
                title="Сменить камеру"
                disabled={!ready}
                onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))}
              >
                🔄
              </button>
              <button className="shutter" onClick={takeShot} disabled={!ready} aria-label="Снять" />
              <span className="camera-spacer" />
            </>
          )}
        </div>

        <div className="camera-note">На фото ставится штамп времени и точки. Выбор из галереи отключён.</div>
      </div>
    </div>
    </Portal>
  )
}
