import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import Avatar from './Avatar'
import Streak from './Streak'
import { dayLabel, lastSeenText, streakState, timeOf } from './utils'

export default function ChatView({ chat, me, profile, online, onBack }) {
  const id = chat.chat_id
  const [messages, setMessages] = useState([])
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [typing, setTyping] = useState({})
  const channelRef = useRef(null)
  const listRef = useRef(null)
  const inputRef = useRef(null)
  const lastTypingSent = useRef(0)
  const stickToBottom = useRef(true)

  const markRead = useCallback(() => {
    if (document.visibilityState !== 'visible') return
    supabase.rpc('mark_read', { p_chat: id }).then(() => {})
  }, [id])

  const loadMembers = useCallback(async () => {
    const { data } = await supabase
      .from('chat_members')
      .select('user_id, last_read_at, profiles(display_name, username, avatar_color, last_seen)')
      .eq('chat_id', id)
    setMembers(data || [])
  }, [id])

  // Initial load
  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data } = await supabase
        .from('messages').select('*')
        .eq('chat_id', id)
        .order('created_at', { ascending: false })
        .limit(200)
      if (!alive) return
      setMessages((data || []).reverse())
      setLoading(false)
      markRead()
    })()
    loadMembers()
    const onVis = () => { if (document.visibilityState === 'visible') { markRead(); loadMembers() } }
    document.addEventListener('visibilitychange', onVis)
    return () => { alive = false; document.removeEventListener('visibilitychange', onVis) }
  }, [id, markRead, loadMembers])

  // Live messages, read receipts, typing
  useEffect(() => {
    const ch = supabase.channel('room:' + id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${id}` }, ({ new: m }) => {
        setMessages(prev => {
          if (prev.some(x => x.id === m.id)) return prev
          const withoutTemp = prev.filter(x => !(x.pending && x.sender_id === m.sender_id && x.content === m.content))
          return [...withoutTemp, m]
        })
        if (m.sender_id !== me) markRead()
        setTyping(t => { const n = { ...t }; delete n[m.sender_id]; return n })
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_members', filter: `chat_id=eq.${id}` }, ({ new: r }) => {
        setMembers(prev => prev.map(x => x.user_id === r.user_id ? { ...x, last_read_at: r.last_read_at } : x))
      })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload.user_id === me) return
        setTyping(t => ({ ...t, [payload.user_id]: { name: payload.name, until: Date.now() + 3500 } }))
      })
      .subscribe()
    channelRef.current = ch
    const iv = setInterval(() => {
      setTyping(t => {
        const now = Date.now()
        const alive = Object.entries(t).filter(([, v]) => v.until > now)
        return alive.length === Object.keys(t).length ? t : Object.fromEntries(alive)
      })
    }, 1000)
    return () => { clearInterval(iv); supabase.removeChannel(ch); channelRef.current = null }
  }, [id, me, markRead])

  // Keep scrolled to the newest message
  useLayoutEffect(() => {
    const el = listRef.current
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight
  }, [messages, typing])

  // Grow the message box as you type
  useLayoutEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 140) + 'px'
  }, [text])

  useEffect(() => { if (window.matchMedia('(min-width: 761px)').matches) inputRef.current?.focus() }, [id])

  function onScroll() {
    const el = listRef.current
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  function onType(e) {
    setText(e.target.value)
    const now = Date.now()
    if (now - lastTypingSent.current > 2000 && channelRef.current) {
      lastTypingSent.current = now
      channelRef.current.send({ type: 'broadcast', event: 'typing', payload: { user_id: me, name: profile?.display_name || 'Someone' } })
    }
  }

  async function send(e) {
    e?.preventDefault()
    const content = text.trim()
    if (!content) return
    setText('')
    stickToBottom.current = true
    const tempId = 'tmp-' + Date.now()
    setMessages(p => [...p, { id: tempId, chat_id: id, sender_id: me, content, created_at: new Date().toISOString(), pending: true }])
    const { data, error } = await supabase.from('messages').insert({ chat_id: id, content }).select().single()
    setMessages(p => {
      if (error) return p.map(x => x.id === tempId ? { ...x, pending: false, failed: true } : x)
      const rest = p.filter(x => x.id !== tempId)
      return rest.some(x => x.id === data.id) ? rest : [...rest, data]
    })
    inputRef.current?.focus()
  }

  function retry(m) {
    setMessages(p => p.filter(x => x.id !== m.id))
    setText(m.content)
    inputRef.current?.focus()
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(min-width: 761px)').matches) {
      e.preventDefault()
      send()
    }
  }

  // --- derived ---
  const byId = Object.fromEntries(members.map(m => [m.user_id, m.profiles || {}]))
  const others = members.filter(m => m.user_id !== me)

  function tickFor(m) {
    if (m.pending) return 'pending'
    if (m.failed) return 'failed'
    if (!others.length) return 'sent'
    const t = new Date(m.created_at).getTime()
    if (others.every(o => new Date(o.last_read_at).getTime() >= t)) return 'read'
    if (others.every(o => online.has(o.user_id) || new Date(o.profiles?.last_seen || 0).getTime() >= t)) return 'delivered'
    return 'sent'
  }

  const typingNames = Object.values(typing).map(t => t.name)
  let subtitle
  if (typingNames.length) {
    subtitle = <span className="typing-text">{chat.is_group ? `${typingNames.join(', ')} ${typingNames.length > 1 ? 'are' : 'is'} typing…` : 'typing…'}</span>
  } else if (chat.is_group) {
    subtitle = members.map(m => m.user_id === me ? 'You' : m.profiles?.display_name).filter(Boolean).join(', ')
  } else if (online.has(chat.other_user_id)) {
    subtitle = <span className="online-text">online</span>
  } else {
    subtitle = lastSeenText(byId[chat.other_user_id]?.last_seen)
  }

  const s = streakState(chat.streak_count, chat.streak_last_day)

  return (
    <section className="chat">
      <header className="chat-head">
        <button className="icon-btn back" onClick={onBack} aria-label="Back to chats">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <Avatar name={chat.title} color={chat.avatar_color} group={chat.is_group} size={40} online={!chat.is_group && online.has(chat.other_user_id)} />
        <div className="head-text">
          <div className="head-title">{chat.title}</div>
          <div className="head-sub">{subtitle}</div>
        </div>
        <Streak count={chat.streak_count} lastDay={chat.streak_last_day} large />
      </header>

      {s?.risk && (
        <div className="risk-bar">⏳ Your {s.count}-day streak ends tonight unless {chat.is_group ? 'everyone' : 'you both'} send a message today.</div>
      )}

      <div className="messages" ref={listRef} onScroll={onScroll}>
        {!loading && messages.length === 0 && (
          <div className="chat-empty">
            <p><strong>Say hi to {chat.is_group ? 'the group' : chat.title}.</strong></p>
            <p>When {chat.is_group ? 'everyone sends' : 'you both send'} at least one message on the same day, you start a 🔥 streak.</p>
          </div>
        )}
        {messages.map((m, i) => {
          const prev = messages[i - 1]
          const mine = m.sender_id === me
          const newDay = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString()
          const grouped = prev && !newDay && prev.sender_id === m.sender_id && new Date(m.created_at) - new Date(prev.created_at) < 5 * 60000
          const sender = byId[m.sender_id]
          return (
            <Fragment key={m.id}>
              {newDay && <div className="day-sep"><span>{dayLabel(m.created_at)}</span></div>}
              <div className={`bubble-row ${mine ? 'mine' : 'theirs'} ${grouped ? 'grouped' : ''}`}>
                <div className={`bubble ${m.failed ? 'failed' : ''}`}>
                  {chat.is_group && !mine && !grouped && (
                    <div className="sender" style={{ color: sender?.avatar_color }}>{sender?.display_name || 'Someone'}</div>
                  )}
                  <span className="content">{m.content}</span>
                  <span className="meta">
                    {timeOf(m.created_at)}
                    {mine && <Tick state={tickFor(m)} />}
                  </span>
                </div>
                {m.failed && <button className="retry" onClick={() => retry(m)}>Not sent. Tap to edit and resend.</button>}
              </div>
            </Fragment>
          )
        })}
        {typingNames.length > 0 && (
          <div className="bubble-row theirs"><div className="bubble typing-bubble" aria-label="typing"><i /><i /><i /></div></div>
        )}
      </div>

      <form className="composer" onSubmit={send}>
        <textarea
          ref={inputRef}
          rows={1}
          value={text}
          onChange={onType}
          onKeyDown={onKeyDown}
          placeholder="Message"
          maxLength={4000}
          aria-label="Message"
        />
        <button className="send" disabled={!text.trim()} aria-label="Send">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12 2-12 2z" /></svg>
        </button>
      </form>
    </section>
  )
}

function Tick({ state }) {
  if (state === 'pending') return <svg className="tick" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="8" /><path d="M12 8v4l2.5 1.5" /></svg>
  if (state === 'failed') return <span className="tick failed-mark">!</span>
  const double = state !== 'sent'
  return (
    <svg className={`tick ${state === 'read' ? 'read' : ''}`} width={double ? 18 : 14} height="14" viewBox={double ? '0 0 30 24' : '0 0 24 24'} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-label={state}>
      <path d="M3 13l5 5L19 6" />
      {double && <path d="M13 17l1 1L25 6" />}
    </svg>
  )
}
