import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion'
import { supabase } from './supabase'
import Auth from './Auth'
import Avatar from './Avatar'
import Backdrop from './Backdrop'
import Flame from './Flame'
import Streak from './Streak'
import ChatView from './ChatView'
import NewChat from './NewChat'
import { listTime, streakState } from './utils'

const spring = { type: 'spring', stiffness: 420, damping: 34 }

export default function App() {
  const [session, setSession] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  return (
    <>
      <Backdrop />
      <AnimatePresence mode="wait">
        {!ready ? (
          <motion.div key="splash" className="splash" exit={{ opacity: 0 }}>
            <Flame size={56} />
          </motion.div>
        ) : !session ? (
          <motion.div key="auth" className="screen" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.98 }}>
            <Auth />
          </motion.div>
        ) : (
          <motion.div key={session.user.id} className="screen" initial={{ opacity: 0, scale: 0.985 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}>
            <Main me={session.user.id} />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

function Main({ me }) {
  const [profile, setProfile] = useState(null)
  const [chats, setChats] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [activeId, setActiveId] = useState(null)
  const [online, setOnline] = useState(new Set())
  const [showNew, setShowNew] = useState(false)
  const [menu, setMenu] = useState(false)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const menuRef = useRef(null)
  const firstPaint = useRef(true)

  useEffect(() => {
    if (!menu) return
    const close = e => { if (!menuRef.current?.contains(e.target)) setMenu(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [menu])

  const loadChats = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_my_chats')
    if (!error) setChats(data || [])
    setLoaded(true)
  }, [])

  useEffect(() => {
    supabase.from('profiles').select('*').eq('id', me).single().then(({ data }) => setProfile(data))
    loadChats()
  }, [me, loadChats])

  useEffect(() => { if (loaded) { const t = setTimeout(() => { firstPaint.current = false }, 900); return () => clearTimeout(t) } }, [loaded])

  // Live updates for the chat list
  useEffect(() => {
    let t
    const refresh = () => { clearTimeout(t); t = setTimeout(loadChats, 250) }
    const ch = supabase.channel('list-' + me)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, refresh)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chats' }, refresh)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_members', filter: `user_id=eq.${me}` }, refresh)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_members', filter: `user_id=eq.${me}` }, refresh)
      .subscribe()
    const onVis = () => document.visibilityState === 'visible' && loadChats()
    document.addEventListener('visibilitychange', onVis)
    return () => { clearTimeout(t); supabase.removeChannel(ch); document.removeEventListener('visibilitychange', onVis) }
  }, [me, loadChats])

  // Who's online + last seen
  useEffect(() => {
    const ch = supabase.channel('online', { config: { presence: { key: me } } })
    ch.on('presence', { event: 'sync' }, () => setOnline(new Set(Object.keys(ch.presenceState()))))
      .subscribe(async status => { if (status === 'SUBSCRIBED') await ch.track({ at: Date.now() }) })
    const beat = () => supabase.rpc('touch_last_seen').then(() => {})
    beat()
    const iv = setInterval(beat, 60000)
    return () => { clearInterval(iv); supabase.removeChannel(ch) }
  }, [me])

  // Phone back button closes an open chat
  useEffect(() => {
    const onPop = () => setActiveId(null)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  function openChat(id) {
    if (!activeId) history.pushState({ chat: id }, '')
    setActiveId(id)
  }
  function closeChat() {
    if (history.state?.chat) history.back()
    else setActiveId(null)
  }
  async function openCreated(id) {
    setShowNew(false)
    await loadChats()
    openChat(id)
  }

  const active = chats.find(c => c.chat_id === activeId)

  const streaks = chats
    .map(c => ({ c, s: streakState(c.streak_count, c.streak_last_day) }))
    .filter(x => x.s)
    .sort((a, b) => (a.s.risk - b.s.risk) || (b.s.count - a.s.count))

  const q = search.trim().toLowerCase()
  const visible = chats.filter(c => {
    if (filter === 'unread' && !(c.unread > 0)) return false
    if (filter === 'groups' && !c.is_group) return false
    if (q && !(`${c.title} ${c.other_username || ''}`.toLowerCase().includes(q))) return false
    return true
  })
  const unreadTotal = chats.filter(c => c.unread > 0).length

  function spotlight(e) {
    const r = e.currentTarget.getBoundingClientRect()
    e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`)
    e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`)
  }

  return (
    <div className={`app ${active ? 'has-active' : ''}`}>
      <aside className="sidebar glass">
        <header className="side-head">
          <div className="brand">
            <Flame size={22} />
            <span className="wordmark small">Kootam</span>
          </div>
          <div className="side-actions">
            <motion.button className="icon-btn new-btn" onClick={() => setShowNew(true)} aria-label="New chat" title="New chat" whileTap={{ scale: 0.9, rotate: 90 }} whileHover={{ rotate: 90 }} transition={spring}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            </motion.button>
            <div className="menu-wrap" ref={menuRef}>
              <motion.button className="me-btn" onClick={() => setMenu(m => !m)} aria-label="Account" aria-expanded={menu} whileTap={{ scale: 0.92 }}>
                {profile && <Avatar name={profile.display_name} color={profile.avatar_color} size={36} />}
              </motion.button>
              <AnimatePresence>
                {menu && profile && (
                  <motion.div className="menu glass-strong"
                    initial={{ opacity: 0, scale: 0.9, y: -8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: -4 }}
                    transition={spring} style={{ transformOrigin: 'top right' }}>
                    <div className="menu-who">
                      <strong>{profile.display_name}</strong>
                      <span>@{profile.username}</span>
                    </div>
                    <button onClick={() => supabase.auth.signOut()}>Log out</button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        <div className="side-scroll">
          <AnimatePresence initial={false}>
            {streaks.length > 0 && !q && (
              <motion.section className="streak-strip" aria-label="Your streaks"
                initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
                <h3>Streaks</h3>
                <div className="strip">
                  {streaks.map(({ c, s }, i) => (
                    <motion.button
                      key={c.chat_id} className={`strip-item ${s.risk ? 'risk' : ''}`}
                      onClick={() => openChat(c.chat_id)}
                      title={s.risk ? `${s.count} days. Chat today to keep it.` : `${s.count} days`}
                      initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: firstPaint.current ? 0.2 + i * 0.06 : 0, type: 'spring', stiffness: 400, damping: 20 }}
                      whileHover={{ y: -4 }} whileTap={{ scale: 0.92 }}
                    >
                      <span className="ring"><Avatar name={c.title} color={c.avatar_color} group={c.is_group} size={54} /></span>
                      <span className="strip-count"><Flame size={12} state={s.risk ? 'risk' : 'lit'} />{s.count}</span>
                      <span className="strip-name">{c.title.split(' ')[0]}</span>
                    </motion.button>
                  ))}
                </div>
              </motion.section>
            )}
          </AnimatePresence>

          <div className="list-tools">
            <label className="search">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search chats" aria-label="Search chats" />
              <AnimatePresence>
                {search && (
                  <motion.button className="clear" onClick={() => setSearch('')} aria-label="Clear search"
                    initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>✕</motion.button>
                )}
              </AnimatePresence>
            </label>
            <div className="filters" role="tablist">
              {[['all', 'All'], ['unread', unreadTotal ? `Unread ${unreadTotal}` : 'Unread'], ['groups', 'Groups']].map(([k, label]) => (
                <button key={k} role="tab" aria-selected={filter === k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>
                  {filter === k && <motion.span layoutId="filterPill" className="filter-pill" transition={spring} />}
                  <span className="filter-label">{label}</span>
                </button>
              ))}
            </div>
          </div>

          <LayoutGroup>
            <div className="chat-list">
              {loaded && chats.length === 0 && (
                <motion.div className="list-empty" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                  <div className="empty-flame"><Flame size={44} state="cold" /></div>
                  <p><strong>No chats yet</strong></p>
                  <p>Find a friend by their username and light the first fire.</p>
                  <motion.button className="btn-primary" onClick={() => setShowNew(true)} whileTap={{ scale: 0.97 }}>Find a friend</motion.button>
                </motion.div>
              )}
              {loaded && chats.length > 0 && visible.length === 0 && (
                <p className="list-none">{q ? `No chats match “${search.trim()}”.` : filter === 'unread' ? 'You’re all caught up.' : 'No groups yet.'}</p>
              )}
              {!loaded && [0, 1, 2, 3, 4].map(i => <div key={i} className="row-skeleton" style={{ animationDelay: `${i * 0.1}s` }} />)}

              <AnimatePresence initial={false}>
                {visible.map((c, i) => {
                  const preview = c.last_message
                    ? (c.last_sender === me ? 'You: ' : '') + c.last_message
                    : (c.is_group ? 'Group created' : 'Say hi 👋')
                  const isActive = c.chat_id === activeId
                  return (
                    <motion.button
                      layout="position"
                      key={c.chat_id}
                      className={`chat-row ${isActive ? 'active' : ''} ${c.unread > 0 ? 'unread' : ''}`}
                      onClick={() => openChat(c.chat_id)}
                      onPointerMove={spotlight}
                      initial={{ opacity: 0, x: -16 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -16 }}
                      transition={{ ...spring, delay: firstPaint.current ? Math.min(i, 10) * 0.04 : 0 }}
                      whileTap={{ scale: 0.985 }}
                    >
                      {isActive && <motion.span layoutId="rowHighlight" className="row-hl" transition={spring} />}
                      <Avatar name={c.title} color={c.avatar_color} group={c.is_group} size={50} online={!c.is_group && online.has(c.other_user_id)} />
                      <div className="row-main">
                        <div className="row-top">
                          <span className="row-title">{c.title}</span>
                          <span className="row-time">{c.last_message ? listTime(c.last_message_at) : ''}</span>
                        </div>
                        <div className="row-bottom">
                          <span className="row-preview">{preview}</span>
                          <Streak count={c.streak_count} lastDay={c.streak_last_day} />
                          <AnimatePresence>
                            {c.unread > 0 && (
                              <motion.span key="badge" className="badge"
                                initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
                                transition={{ type: 'spring', stiffness: 600, damping: 20 }}>
                                {c.unread > 99 ? '99+' : c.unread}
                              </motion.span>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>
                    </motion.button>
                  )
                })}
              </AnimatePresence>
            </div>
          </LayoutGroup>
        </div>
      </aside>

      <main className="pane glass">
        <AnimatePresence mode="wait">
          {active ? (
            <motion.div key={active.chat_id} className="pane-inner"
              initial={{ opacity: 0, x: 28 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -14 }}
              transition={{ type: 'spring', stiffness: 380, damping: 34 }}>
              <ChatView chat={active} me={me} profile={profile} online={online} onBack={closeChat} />
            </motion.div>
          ) : (
            <motion.div key="empty" className="pane-inner pane-empty"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <motion.div className="pane-card" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.15, ...spring }}>
                <div className="big-flame"><Flame size={72} /></div>
                <h2>Pick a chat</h2>
                <p>When everyone in a chat sends a message on the same day, the fire grows. Skip a day and it goes out.</p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <AnimatePresence>
        {showNew && <NewChat key="new" me={me} onClose={() => setShowNew(false)} onOpen={openCreated} />}
      </AnimatePresence>
    </div>
  )
}
