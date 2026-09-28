import Flame from './Flame'
import { streakState } from './utils'

export default function Streak({ count, lastDay }) {
  const s = streakState(count, lastDay)
  if (!s) return null
  const title = s.risk
    ? `${s.count}-day streak. Chat today (all of you) or it resets.`
    : `${s.count}-day streak. You all chatted today.`
  return (
    <span className={`streak ${s.risk ? 'risk' : ''}`} title={title} aria-label={title}>
      <Flame size={13} state={s.risk ? 'risk' : 'lit'} />{s.count}
    </span>
  )
}
