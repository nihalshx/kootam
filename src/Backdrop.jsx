import { useEffect, useRef } from 'react'

// Night sky: drifting glow + rising embers
export default function Backdrop() {
  return (
    <div className="backdrop" aria-hidden="true">
      <div className="blob b1" />
      <div className="blob b2" />
      <div className="blob b3" />
      <Embers />
      <div className="grain" />
    </div>
  )
}

function Embers() {
  const ref = useRef(null)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const c = ref.current
    const ctx = c.getContext('2d')
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let w = 0, h = 0, raf = 0
    let parts = []
    const spawn = init => ({
      x: Math.random() * w,
      y: init ? Math.random() * h : h + 10,
      r: Math.random() * 1.7 + 0.5,
      vy: Math.random() * 0.35 + 0.12,
      vx: (Math.random() - 0.5) * 0.15,
      sway: Math.random() * Math.PI * 2,
      hue: 15 + Math.random() * 30,
    })
    const resize = () => {
      w = c.clientWidth; h = c.clientHeight
      c.width = w * dpr; c.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const count = Math.min(70, Math.round((w * h) / 22000) + 10)
      parts = Array.from({ length: count }, () => spawn(true))
    }
    const tick = () => {
      ctx.clearRect(0, 0, w, h)
      for (const p of parts) {
        p.sway += 0.02
        p.x += p.vx + Math.sin(p.sway) * 0.18
        p.y -= p.vy
        const a = Math.max(0, Math.min(1, p.y / h)) * 0.85
        ctx.beginPath()
        ctx.fillStyle = `hsla(${p.hue},100%,62%,${a})`
        ctx.shadowColor = `hsla(${p.hue},100%,58%,${a})`
        ctx.shadowBlur = 10
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fill()
        if (p.y < -10) Object.assign(p, spawn(false))
      }
      raf = requestAnimationFrame(tick)
    }
    const onVis = () => { cancelAnimationFrame(raf); if (!document.hidden) tick() }
    resize(); tick()
    window.addEventListener('resize', resize)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])
  return <canvas ref={ref} className="embers" />
}
