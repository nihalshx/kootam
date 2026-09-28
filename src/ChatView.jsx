import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import Avatar from './Avatar'
import { dayLabel, istDate, istDayOf, lastSeenText, streakState, timeOf } from './utils'

export default function ChatView({ chat, me, profile, online, onBack }) {
  const id = chat.chat_id
  const [messages, setMessages] = useState([])
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [typing, setTyping] = useState({})
  const [atBottom, setAtBottom] = useState(true)
  const [newCount, setNewCount] = useState(0)
  const [showStreakInfo, setShowStreakInfo] = useState(false)
  const [celebrate, setCelebrate] = useState(null)
  const channelRef = useRef(null)
  const listRef = useRef(null)
  const inputRef = useRef(null)
  const lastTypingSent = useRef(0)
  const stickToBottom = useRef(true)
  const prevStreak = useRef(chat.streak_count)
  const streakBtnRef = useRef(null)

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
          const isTemp = x => x.pending && x.sender_id === m.sender_id && x.content === m.content
          const hadTemp = prev.some(isTemp)
          return [...prev.filter(x => !isTemp(x)), { ...m, fresh: true, settled: hadTemp }]
        })
        if (m.sender_id !== me) {
          markRead()
          if (!stickToBottom.current) setNewCount(n => n + 1)
        }
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

  // Streak went up while this chat is open → celebrate
  useEffect(() => {
    if (chat.streak_count > (prevStreak.current || 0)) {
      setCelebrate(chat.streak_count)
      const t = setTimeout(() => setCelebrate(null), 2600)
      prevStreak.current = chat.streak_count
      return () => clearTimeout(t)
    }
    prevStreak.current = chat.streak_count
  }, [chat.streak_count])

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

  // Close the streak card when tapping elsewhere
  useEffect(() => {
    if (!showStreakInfo) return
    const close = e => { if (!streakBtnRef.current?.parentElement.contains(e.target)) setShowStreakInfo(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [showStreakInfo])

  function onScroll() {
    const el = listRef.current
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    stickToBottom.current = bottom
    setAtBottom(bottom)
    if (bottom) setNewCount(0)
  }

  function jumpToBottom() {
    const el = listRef.current
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    setNewCount(0)
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
    setMessages(p => [...p, { id: tempId, chat_id: id, sender_id: me, content, created_at: new Date().toISOString(), pending: true, fresh: true }])
    const { data, error } = await supabase.from('messages').insert({ chat_id: id, content }).select().single()
    setMessages(p => {
      if (error) return p.map(x => x.id === tempId ? { ...x, pending: false, failed: true } : x)
      const rest = p.filter(x => x.id !== tempId)
      return rest.some(x => x.id === data.id) ? rest : [...rest, { ...data, fresh: true, settled: true }]
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
  const today = istDate(0)
  const sentToday = new Set(messages.filter(m => !m.failed && istDayOf(m.created_at) === today).map(m => m.sender_id))
  const doneToday = members.length > 1 && members.every(m => sentToday.has(m.user_id))

  return (
    <section className="chat">
      <header className="chat-head">
        <button className="icon-btn back" onClick={onBack} aria-label="Back to chats">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <Avatar name={chat.title} color={chat.avatar_color} group={chat.is_group} size={42} online={!chat.is_group && online.has(chat.other_user_id)} />
        <div className="head-text">
          <div className="head-title">{chat.title}</div>
          <div className="head-sub">{subtitle}</div>
        </div>

        <div className="streak-wrap">
          <button
            ref={streakBtnRef}
            className={`streak-pill ${s ? (s.risk ? 'risk' : 'lit') : 'cold'}`}
            onClick={() => setShowStreakInfo(v => !v)}
            aria-expanded={showStreakInfo}
            aria-label={s ? `${s.count}-day streak. Show details.` : 'No streak yet. Show how streaks work.'}
          >
            <span className="flame">{s?.risk ? '⏳' : '🔥'}</span>
            <span className="num">{s ? s.count : 0}</span>
          </button>
          {showStreakInfo && (
            <div className="streak-card" role="dialog" aria-label="Streak">
              <div className="sc-top">
                <span className="sc-big">{s ? s.count : 0}</span>
                <span className="sc-label">{s ? 'day streak' : 'no streak yet'}</span>
              </div>
              <div className="sc-today">
                <div className="sc-sub">Today</div>
                {members.map(m => (
                  <div key={m.user_id} className={`sc-person ${sentToday.has(m.user_id) ? 'done' : ''}`}>
                    <span className="sc-mark">{sentToday.has(m.user_id) ? '✓' : ''}</span>
                    {m.user_id === me ? 'You' : m.profiles?.display_name}
                    <span className="sc-state">{sentToday.has(m.user_id) ? 'sent' : 'waiting'}</span>
                  </div>
                ))}
              </div>
              <p className="sc-note">
                {doneToday
                  ? 'Today is done. Come back tomorrow to keep it going.'
                  : `${chat.is_group ? 'Everyone needs' : 'You both need'} to send at least one message today (India time).`}
              </p>
            </div>
          )}
        </div>
      </header>

      {s?.risk && (
        <div className="risk-bar">
          <span>⏳</span> Your {s.count}-day streak ends at midnight unless {chat.is_group ? 'everyone' : 'you both'} message today.
        </div>
      )}

      <div className="messages-wrap">
        <div className="messages" ref={listRef} onScroll={onScroll}>
          {!loading && messages.length === 0 && (
            <div className="chat-empty">
              <div className="ce-wave">👋</div>
              <p><strong>Say hi to {chat.is_group ? 'the group' : chat.title}</strong></p>
              <p>When {chat.is_group ? 'everyone sends' : 'you both send'} a message on the same day, you start a 🔥 streak.</p>
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
                <div className={`bubble-row ${mine ? 'mine' : 'theirs'} ${grouped ? 'grouped' : 'first'} ${m.fresh && !m.settled ? 'fresh' : ''}`}>
                  <div className={`bubble ${m.failed ? 'failed' : ''} ${/^\p{Extended_Pictographic}{1,3}$/u.test(m.content) ? 'emoji-only' : ''}`}>
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
            <div className="bubble-row theirs first fresh"><div className="bubble typing-bubble" aria-label="typing"><i /><i /><i /></div></div>
          )}
        </div>

        {!atBottom && (
          <button className="jump" onClick={jumpToBottom} aria-label={newCount ? `${newCount} new messages. Jump to latest.` : 'Jump to latest'}>
            {newCount > 0 && <span className="jump-count">{newCount}</span>}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
          </button>
        )}

        {celebrate && (
          <div className="celebrate" role="status" aria-live="polite">
            <div className="cel-flame">🔥</div>
            <div className="cel-num">{celebrate}</div>
            <div className="cel-text">{celebrate === 1 ? 'Streak started!' : `${celebrate}-day streak!`}</div>
          </div>
        )}
      </div>

      <form className="composer" onSubmit={send}>
        <div className="composer-box">
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
        </div>
        <button className={`send ${text.trim() ? 'ready' : ''}`} disabled={!text.trim()} aria-label="Send">
          <svg width="21" height="21" viewBox="0 0 24 24" fill="currentColor"><path d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12 2-12 2z" /></svg>
        </button>
      </form>
    </section>
  )
}

function Tick({ state }) {
  if (state === 'pending') return <svg className="tick" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="12" cy="12" r="8" /><path d="M12 8v4l2.5 1.5" /></svg>
  if (state === 'failed') return <span className="tick failed-mark">!</span>
  const double = state !== 'sent'
  return (
    <svg className={`tick ${state === 'read' ? 'read' : ''}`} width={double ? 18 : 14} height="14" viewBox={double ? '0 0 30 24' : '0 0 24 24'} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-label={state}>
      <path d="M3 13l5 5L19 6" />
      {double && <path d="M13 17l1 1L25 6" />}
    </svg>
  )
}
