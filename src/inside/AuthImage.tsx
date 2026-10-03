import { useEffect, useState } from 'react'
import { fetchPhotoUrl } from '../api'

export default function AuthImage({
  src,
  className,
  alt = '',
  onClick,
}: {
  src: string
  className?: string
  alt?: string
  onClick?: () => void
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null
    fetchPhotoUrl(src)
      .then((u) => {
        if (cancelled) URL.revokeObjectURL(u)
        else {
          objectUrl = u
          setUrl(u)
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [src])

  if (failed) return <div className={`${className ?? ''} img-fallback`}>⚠️</div>
  if (!url) return <div className={`${className ?? ''} img-loading`} />
  return <img src={url} alt={alt} className={className} onClick={onClick} />
}