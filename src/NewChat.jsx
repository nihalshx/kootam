import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { supabase } from './supabase'
import Avatar from './Avatar'

export default function NewChat({ me, onClose, onOpen }) {
  const [q, setQ] = useState('')
  const [people, setPeople] = useState([])
  const [groupMode, setGroupMode] = useState(false)
  const [selected, setSelected] = useState([])
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const t = setTimeout(async () => {
      let query = supabase.from('profiles')
        .select('id, username, display_name, avatar_color')
        .neq('id', me).order('display_name').limit(40)
      const s = q.trim().toLowerCase().replace(/[%,()*\\]/g, '')
      if (s) query = query.or(`username.ilike.%${s}%,display_name.ilike.%${s}%`)
      const { data } = await query
      setPeople(data || [])
    }, 200)
    return () => clearTimeout(t)
  }, [q, me])

  useEffect(() => {
    const onKey = e => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function pick(p) {
    if (groupMode) {
      setSelected(s => s.some(x => x.id === p.id) ? s.filter(x => x.id !== p.id) : [...s, p])
      return
    }
    setBusy(true); setError('')
    const { data, error } = await supabase.rpc('get_or_create_dm', { p_other: p.id })
    setBusy(false)
    if (error) return setError(error.message)
    onOpen(data)
  }

  async function createGroup() {
    if (!name.trim()) return setError('Give the group a name.')
    if (selected.length < 1) return setError('Add at least one friend.')
    setBusy(true); setError('')
    const { data, error } = await supabase.rpc('create_group', { p_name: name.trim(), p_members: selected.map(s => s.id) })
    setBusy(false)
    if (error) return setError(error.message)
    onOpen(data)
  }

  return (
    <motion.div className="overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="sheet glass-strong" role="dialog" aria-modal="true" aria-label={groupMode ? 'New group' : 'New chat'}
        initial={{ opacity: 0, y: 60, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 60, scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}>
        <header className="sheet-head">
          <AnimatePresence mode="wait" initial={false}>
            <motion.h2 key={groupMode ? 'g' : 'c'} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.16 }}>
              {groupMode ? 'New group' : 'New chat'}
            </motion.h2>
          </AnimatePresence>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </header>

        <div className="sheet-body">
          {groupMode && (
            <input className="text-input" value={name} onChange={e => setName(e.target.value)} placeholder="Group name" maxLength={50} autoFocus />
          )}
          <input className="text-input" value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name or username" autoFocus={!groupMode} />

          {groupMode && selected.length > 0 && (
            <div className="chips">
              <AnimatePresence>
                {selected.map(p => (
                  <motion.button layout key={p.id} className="chip" onClick={() => pick(p)}
                    initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 26 }}>
                    {p.display_name} ✕
                  </motion.button>
                ))}
              </AnimatePresence>
            </div>
          )}

          {!groupMode && (
            <button className="people-row make-group" onClick={() => { setGroupMode(true); setError('') }}>
              <Avatar group color="#FF6B2C" size={40} />
              <span>New group</span>
            </button>
          )}

          <div className="people">
            {people.length === 0 && <p className="hint">No one found. Ask your friends to create an account, then search for their username.</p>}
            {people.map((p, i) => {
              const on = selected.some(s => s.id === p.id)
              return (
                <motion.button key={p.id} className={`people-row ${on ? 'on' : ''}`} onClick={() => pick(p)} disabled={busy}
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i, 8) * 0.03, type: 'spring', stiffness: 400, damping: 30 }}
                  whileTap={{ scale: 0.98 }}>
                  <Avatar name={p.display_name} color={p.avatar_color} size={40} />
                  <span className="people-names">
                    <strong>{p.display_name}</strong>
                    <small>@{p.username}</small>
                  </span>
                  {groupMode && (
                    <span className={`check ${on ? 'on' : ''}`} aria-hidden="true">
                      <AnimatePresence>{on && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ type: 'spring', stiffness: 600, damping: 18 }}>✓</motion.span>}</AnimatePresence>
                    </span>
                  )}
                </motion.button>
              )
            })}
          </div>
          {error && <p className="msg-error">{error}</p>}
        </div>

        {groupMode && (
          <footer className="sheet-foot">
            <button className="btn-ghost" onClick={() => { setGroupMode(false); setSelected([]); setError('') }}>Back</button>
            <button className="btn-primary" onClick={createGroup} disabled={busy}>
              {busy ? 'Creating…' : `Create group${selected.length ? ` (${selected.length + 1})` : ''}`}
            </button>
          </footer>
        )}
      </motion.div>
    </motion.div>
  )
}
