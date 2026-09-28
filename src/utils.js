// Streak days are counted in Indian time, same as the database.
export function istDate(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000)
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

// null = no streak, { count, risk } otherwise. risk = nobody has kept it alive today yet.
export function streakState(count, lastDay) {
  if (!count || !lastDay) return null
  if (lastDay === istDate(0)) return { count, risk: false }
  if (lastDay === istDate(-1)) return { count, risk: true }
  return null
}

export function initials(name = '?') {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?'
}

export function timeOf(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export function listTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return timeOf(iso)
  const y = new Date(now); y.setDate(now.getDate() - 1)
  if (d.toDateString() === y.toDateString()) return 'Yesterday'
  if (now - d < 6 * 86400000) return d.toLocaleDateString([], { weekday: 'short' })
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' })
}

export function dayLabel(iso) {
  const d = new Date(iso)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return 'Today'
  const y = new Date(now); y.setDate(now.getDate() - 1)
  if (d.toDateString() === y.toDateString()) return 'Yesterday'
  return d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })
}

export function lastSeenText(iso) {
  if (!iso) return 'offline'
  const mins = Math.floor((Date.now() - new Date(iso)) / 60000)
  if (mins < 2) return 'last seen just now'
  if (mins < 60) return `last seen ${mins} min ago`
  return `last seen ${listTime(iso).toLowerCase()}${new Date(iso).toDateString() === new Date().toDateString() ? '' : ' at ' + timeOf(iso)}`
}
