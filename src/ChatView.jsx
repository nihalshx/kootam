import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { supabase } from './supabase'
import Avatar from './Avatar'
import Flame from './Flame'
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
  const [sparkKey, setSparkKey] = useState(0)
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
      const t = setTimeout(() => setCelebrate(null), 2800)
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
    setSparkKey(k => k + 1)
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

  const bubbleSpring = { type: 'spring', stiffness: 520, damping: 32 }

  return (
    <section className="chat">
      <header className="chat-head">
        <motion.button className="icon-btn back" onClick={onBack} aria-label="Back to chats" whileTap={{ scale: 0.88, x: -3 }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </motion.button>
        <Avatar name={chat.title} color={chat.avatar_color} group={chat.is_group} size={42} online={!chat.is_group && online.has(chat.other_user_id)} />
        <div className="head-text">
          <div className="head-title">{chat.title}</div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={typingNames.length ? 'typing' : 'status'}
              className="head-sub"
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
            >{subtitle}</motion.div>
          </AnimatePresence>
        </div>

        <div className="streak-wrap">
          <motion.button
            ref={streakBtnRef}
            className={`streak-pill ${s ? (s.risk ? 'risk' : 'lit') : 'cold'}`}
            onClick={() => setShowStreakInfo(v => !v)}
            aria-expanded={showStreakInfo}
            aria-label={s ? `${s.count}-day streak. Show details.` : 'No streak yet. Show how streaks work.'}
            whileTap={{ scale: 0.92 }} whileHover={{ scale: 1.04 }}
          >
            <Flame size={18} state={s ? (s.risk ? 'risk' : 'lit') : 'cold'} />
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span key={s ? s.count : 0} className="num"
                initial={{ y: 14, opacity: 0, scale: 1.5 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: -14, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 22 }}>
                {s ? s.count : 0}
              </motion.span>
            </AnimatePresence>
          </motion.button>
          <AnimatePresence>
            {showStreakInfo && (
              <motion.div className="streak-card glass-strong" role="dialog" aria-label="Streak"
                initial={{ opacity: 0, scale: 0.85, y: -10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.92, y: -6 }}
                transition={{ type: 'spring', stiffness: 460, damping: 30 }} style={{ transformOrigin: 'top right' }}>
                <div className="sc-top">
                  <Flame size={40} state={s ? (s.risk ? 'risk' : 'lit') : 'cold'} />
                  <div>
                    <div className="sc-big">{s ? s.count : 0}</div>
                    <div className="sc-label">{s ? 'day streak' : 'no streak yet'}</div>
                  </div>
                </div>
                <div className="sc-today">
                  <div className="sc-sub">Today</div>
                  {members.map((m, i) => (
                    <motion.div key={m.user_id} className={`sc-person ${sentToday.has(m.user_id) ? 'done' : ''}`}
                      initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.08 + i * 0.05 }}>
                      <span className="sc-mark">{sentToday.has(m.user_id) ? '✓' : ''}</span>
                      {m.user_id === me ? 'You' : m.profiles?.display_name}
                      <span className="sc-state">{sentToday.has(m.user_id) ? 'sent' : 'waiting'}</span>
                    </motion.div>
                  ))}
                </div>
                <p className="sc-note">
                  {doneToday
                    ? 'Today is done. Come back tomorrow to keep it going.'
                    : `${chat.is_group ? 'Everyone needs' : 'You both need'} to send at least one message today (India time).`}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </header>

      <AnimatePresence initial={false}>
        {s?.risk && (
          <motion.div className="risk-bar" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
            <div className="risk-inner"><Flame size={15} state="risk" /> Your {s.count}-day streak goes out at midnight unless {chat.is_group ? 'everyone' : 'you both'} message today.</div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="messages-wrap">
        <div className="messages" ref={listRef} onScroll={onScroll}>
          {loading && (
            <div className="msg-skeletons">
              {[62, 40, 70, 34, 55].map((w, i) => <div key={i} className={`msg-skel ${i % 2 ? 'r' : ''}`} style={{ width: w + '%', animationDelay: i * 0.1 + 's' }} />)}
            </div>
          )}
          {!loading && messages.length === 0 && (
            <motion.div className="chat-empty glass-strong" initial={{ opacity: 0, y: 16, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={bubbleSpring}>
              <div className="ce-wave">👋</div>
              <p><strong>Say hi to {chat.is_group ? 'the group' : chat.title}</strong></p>
              <p>When {chat.is_group ? 'everyone sends' : 'you both send'} a message on the same day, you light a streak.</p>
            </motion.div>
          )}
          {messages.map((m, i) => {
            const prev = messages[i - 1]
            const mine = m.sender_id === me
            const newDay = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString()
            const grouped = prev && !newDay && prev.sender_id === m.sender_id && new Date(m.created_at) - new Date(prev.created_at) < 5 * 60000
            const sender = byId[m.sender_id]
            const animate = m.fresh && !m.settled
            const emojiOnly = /^\p{Extended_Pictographic}{1,3}$/u.test(m.content)
            return (
              <Fragment key={m.id}>
                {newDay && <div className="day-sep"><span>{dayLabel(m.created_at)}</span></div>}
                <motion.div
                  className={`bubble-row ${mine ? 'mine' : 'theirs'} ${grouped ? 'grouped' : 'first'}`}
                  initial={animate ? { opacity: 0, y: 18, scale: emojiOnly ? 0.3 : 0.88 } : false}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={emojiOnly ? { type: 'spring', stiffness: 380, damping: 12 } : bubbleSpring}
                  style={{ transformOrigin: mine ? 'bottom right' : 'bottom left' }}
                >
                  <div className={`bubble ${m.failed ? 'failed' : ''} ${emojiOnly ? 'emoji-only' : ''}`}>
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
                </motion.div>
              </Fragment>
            )
          })}
          <AnimatePresence>
            {typingNames.length > 0 && (
              <motion.div key="typing" className="bubble-row theirs first"
                initial={{ opacity: 0, scale: 0.6, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.6 }}
                transition={bubbleSpring} style={{ transformOrigin: 'bottom left' }}>
                <div className="bubble typing-bubble" aria-label="typing"><i /><i /><i /></div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {!atBottom && (
            <motion.button className="jump glass-strong" onClick={jumpToBottom}
              aria-label={newCount ? `${newCount} new messages. Jump to latest.` : 'Jump to latest'}
              initial={{ opacity: 0, scale: 0.5, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.5, y: 10 }}
              transition={{ type: 'spring', stiffness: 500, damping: 26 }} whileTap={{ scale: 0.9 }}>
              <AnimatePresence>
                {newCount > 0 && (
                  <motion.span key="c" className="jump-count" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>{newCount}</motion.span>
                )}
              </AnimatePresence>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
            </motion.button>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {celebrate && (
            <motion.div className="celebrate" role="status" aria-live="polite"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.5 } }}>
              <div className="cel-burst" aria-hidden="true">
                {Array.from({ length: 16 }, (_, i) => (
                  <i key={i} style={{ '--a': `${i * 22.5}deg`, '--d': `${90 + (i % 4) * 28}px`, '--s': `${4 + (i % 3) * 2}px`, animationDelay: `${(i % 3) * 0.05}s` }} />
                ))}
              </div>
              <motion.div initial={{ scale: 0.1, y: 60, rotate: -20 }} animate={{ scale: 1, y: 0, rotate: 0 }} transition={{ type: 'spring', stiffness: 240, damping: 12 }}>
                <Flame size={104} />
              </motion.div>
              <motion.div className="cel-num" initial={{ opacity: 0, y: 24, scale: 0.6 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: 0.18, type: 'spring', stiffness: 320, damping: 16 }}>
                {celebrate}
              </motion.div>
              <motion.div className="cel-text" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.32, type: 'spring', stiffness: 320, damping: 22 }}>
                {celebrate === 1 ? 'Streak lit!' : `${celebrate}-day streak!`}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
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
        <motion.button
          className={`send ${text.trim() ? 'ready' : ''}`}
          disabled={!text.trim()}
          aria-label="Send"
          whileTap={{ scale: 0.85 }}
          animate={{ rotate: text.trim() ? 0 : -45, scale: text.trim() ? 1 : 0.92 }}
          transition={{ type: 'spring', stiffness: 500, damping: 22 }}
        >
          <svg width="21" height="21" viewBox="0 0 24 24" fill="currentColor"><path d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12 2-12 2z" /></svg>
          {sparkKey > 0 && (
            <span key={sparkKey} className="sparks" aria-hidden="true">
              {Array.from({ length: 8 }, (_, i) => <i key={i} style={{ '--a': `${i * 45}deg` }} />)}
            </span>
          )}
        </motion.button>
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
