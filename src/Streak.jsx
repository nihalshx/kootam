import { streakState } from './utils'

export default function Streak({ count, lastDay, large = false }) {
  const s = streakState(count, lastDay)
  if (!s) return null
  const title = s.risk
    ? `${s.count}-day streak. Chat today (all of you) or it resets.`
    : `${s.count}-day streak. You all chatted today.`
  return (
    <span className={`streak ${large ? 'large' : ''} ${s.risk ? 'risk' : ''}`} title={title} aria-label={title}>
      <span className="flame">🔥</span>{s.count}{s.risk && <span className="hourglass">⏳</span>}
    </span>
  )
}
