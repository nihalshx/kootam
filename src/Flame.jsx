import { useId } from 'react'

// Animated flame. state: 'lit' | 'risk' | 'cold'
export default function Flame({ size = 20, state = 'lit' }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg className={`flame-svg ${state}`} width={size} height={size * 1.2} viewBox="0 0 40 48" aria-hidden="true">
      <defs>
        <linearGradient id={`o${id}`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#F0337A" />
          <stop offset=".55" stopColor="#FF6B2C" />
          <stop offset="1" stopColor="#FFC14D" />
        </linearGradient>
        <linearGradient id={`i${id}`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#FFB23E" />
          <stop offset="1" stopColor="#FFF4CC" />
        </linearGradient>
      </defs>
      <g className="f-outer">
        <path fill={`url(#o${id})`} d="M20 2C22 12 34 18 34 31a14 14 0 0 1-28 0c0-7 4-11 7-14 0 5 2 8 5 9-2-9 1-17 2-24z" />
      </g>
      <g className="f-inner">
        <path fill={`url(#i${id})`} d="M20 20c1 6 8 9 8 15a8 8 0 0 1-16 0c0-4 2-6 4-8 0 3 1 4 3 5-1-5 0-9 1-12z" />
      </g>
    </svg>
  )
}
