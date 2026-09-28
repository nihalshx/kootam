import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import Auth from './Auth'
import Avatar from './Avatar'
import Streak from './Streak'
import ChatView from './ChatView'
import NewChat from './NewChat'
import { listTime, streakState } from './utils'

export default function App() {
  const [session, setSession] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  if (!ready) return <div className="splash"><div className="wordmark">Kootam</div></div>
  if (!session) return <Auth />
  return <Main key={session.user.id} me={session.user.id} />
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

  // Close the account menu when tapping anywhere else
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
    // Streak "at risk" state changes at midnight; refresh when the tab comes back
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

  // Browser back button closes an open chat on phones
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

  return (
    <div className={`app ${active ? 'has-active' : ''}`}>
      <aside className="sidebar">
        <header className="side-head">
          <div className="wordmark small">Kootam</div>
          <div className="side-actions">
            <button className="icon-btn" onClick={() => setShowNew(true)} aria-label="New chat" title="New chat">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a8.5 8.5 0 0 1-12.6 7.4L3 21l1.6-5.2A8.5 8.5 0 1 1 21 12Z" /><path d="M12 8.5v7M8.5 12h7" /></svg>
            </button>
            <div className="menu-wrap" ref={menuRef}>
              <button className="me-btn" onClick={() => setMenu(m => !m)} aria-label="Account" aria-expanded={menu}>
                {profile && <Avatar name={profile.display_name} color={profile.avatar_color} size={34} />}
              </button>
              {menu && profile && (
                <div className="menu">
                  <div className="menu-who">
                    <strong>{profile.display_name}</strong>
                    <span>@{profile.username}</span>
                  </div>
                  <button onClick={() => supabase.auth.signOut()}>Log out</button>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="side-scroll">
          {streaks.length > 0 && !q && (
            <section className="streak-strip" aria-label="Your streaks">
              <h3>Streaks</h3>
              <div className="strip">
                {streaks.map(({ c, s }) => (
                  <button key={c.chat_id} className={`strip-item ${s.risk ? 'risk' : ''}`} onClick={() => openChat(c.chat_id)}
                    title={s.risk ? `${s.count} days. Chat today to keep it.` : `${s.count} days`}>
                    <span className="ring">
                      <Avatar name={c.title} color={c.avatar_color} group={c.is_group} size={54} />
                    </span>
                    <span className="strip-count">{s.risk ? '⏳' : '🔥'}{s.count}</span>
                    <span className="strip-name">{c.title.split(' ')[0]}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          <div className="list-tools">
            <label className="search">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search chats" aria-label="Search chats" />
            </label>
            <div className="filters" role="tablist">
              {[['all', 'All'], ['unread', unreadTotal ? `Unread ${unreadTotal}` : 'Unread'], ['groups', 'Groups']].map(([k, label]) => (
                <button key={k} role="tab" aria-selected={filter === k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{label}</button>
              ))}
            </div>
          </div>

          <div className="chat-list">
            {loaded && chats.length === 0 && (
              <div className="list-empty">
                <div className="empty-flame">🔥</div>
                <p><strong>No chats yet</strong></p>
                <p>Find a friend by their username and say hi.</p>
                <button className="btn-primary" onClick={() => setShowNew(true)}>Find a friend</button>
              </div>
            )}
            {loaded && chats.length > 0 && visible.length === 0 && (
              <p className="list-none">{q ? `No chats match “${search.trim()}”.` : filter === 'unread' ? 'You’re all caught up.' : 'No groups yet.'}</p>
            )}
            {visible.map(c => {
              const preview = c.last_message
                ? (c.last_sender === me ? 'You: ' : '') + c.last_message
                : (c.is_group ? 'Group created' : 'Say hi 👋')
              return (
                <button key={c.chat_id} className={`chat-row ${c.chat_id === activeId ? 'active' : ''} ${c.unread > 0 ? 'unread' : ''}`} onClick={() => openChat(c.chat_id)}>
                  <Avatar name={c.title} color={c.avatar_color} group={c.is_group} size={50} online={!c.is_group && online.has(c.other_user_id)} />
                  <div className="row-main">
                    <div className="row-top">
                      <span className="row-title">{c.title}</span>
                      <span className="row-time">{c.last_message ? listTime(c.last_message_at) : ''}</span>
                    </div>
                    <div className="row-bottom">
                      <span className="row-preview">{preview}</span>
                      <Streak count={c.streak_count} lastDay={c.streak_last_day} />
                      {c.unread > 0 && <span className="badge">{c.unread > 99 ? '99+' : c.unread}</span>}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </aside>

      <main className="pane">
        {active ? (
          <ChatView key={active.chat_id} chat={active} me={me} profile={profile} online={online} onBack={closeChat} />
        ) : (
          <div className="pane-empty">
            <div className="pane-card">
              <div className="big-flame">🔥</div>
              <h2>Pick a chat</h2>
              <p>When everyone in a chat sends a message on the same day, your streak grows. Skip a day and it starts over.</p>
            </div>
          </div>
        )}
      </main>

      {showNew && <NewChat me={me} onClose={() => setShowNew(false)} onOpen={openCreated} />}
    </div>
  )
}
