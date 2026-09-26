import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

/** Shows the fixed-width (794px) document scaled down to fit its container. */
export function ScaledDoc({ children }: { children: ReactNode }) {
  const wrap = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [h, setH] = useState(0)
  useLayoutEffect(() => {
    const el = wrap.current
    if (!el) return
    const update = () => {
      const s = Math.min(1, el.clientWidth / 794)
      setScale(s)
      setH((inner.current?.offsetHeight ?? 1123) * s)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    if (inner.current) ro.observe(inner.current)
    return () => ro.disconnect()
  }, [])
  return (
    <div ref={wrap} className="preview-scale" style={{ height: h || undefined }}>
      <div ref={inner} style={{ width: 794, transform: `scale(${scale})`, transformOrigin: 'top left' }}>{children}</div>
    </div>
  )
}
