import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import Auth from './Auth'
import Avatar from './Avatar'
import Streak from './Streak'
import ChatView from './ChatView'
import NewChat from './NewChat'
import { listTime } from './utils'

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

  return (
    <div className={`app ${active ? 'has-active' : ''}`}>
      <aside className="sidebar">
        <header className="side-head">
          <div className="wordmark small">Kootam</div>
          <div className="side-actions">
            <button className="icon-btn" onClick={() => setShowNew(true)} aria-label="New chat" title="New chat">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            </button>
            <div className="menu-wrap">
              <button className="me-btn" onClick={() => setMenu(m => !m)} aria-label="Account" aria-expanded={menu}>
                {profile && <Avatar name={profile.display_name} color={profile.avatar_color} size={34} />}
              </button>
              {menu && profile && (
                <div className="menu" onMouseLeave={() => setMenu(false)}>
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

        <div className="chat-list">
          {loaded && chats.length === 0 && (
            <div className="list-empty">
              <p>No chats yet.</p>
              <button className="btn-primary" onClick={() => setShowNew(true)}>Find a friend</button>
            </div>
          )}
          {chats.map(c => {
            const preview = c.last_message
              ? (c.last_sender === me ? 'You: ' : '') + c.last_message
              : (c.is_group ? 'Group created' : 'Say hi 👋')
            return (
              <button key={c.chat_id} className={`chat-row ${c.chat_id === activeId ? 'active' : ''}`} onClick={() => openChat(c.chat_id)}>
                <Avatar name={c.title} color={c.avatar_color} group={c.is_group} online={!c.is_group && online.has(c.other_user_id)} />
                <div className="row-main">
                  <div className="row-top">
                    <span className="row-title">{c.title}</span>
                    <span className={`row-time ${c.unread > 0 ? 'hot' : ''}`}>{c.last_message ? listTime(c.last_message_at) : ''}</span>
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
      </aside>

      <main className="pane">
        {active ? (
          <ChatView key={active.chat_id} chat={active} me={me} profile={profile} online={online} onBack={closeChat} />
        ) : (
          <div className="pane-empty">
            <div className="big-flame">🔥</div>
            <h2>Pick a chat</h2>
            <p>Message someone every day, and when everyone in the chat replies the same day, your streak grows.</p>
          </div>
        )}
      </main>

      {showNew && <NewChat me={me} onClose={() => setShowNew(false)} onOpen={openCreated} />}
    </div>
  )
}
