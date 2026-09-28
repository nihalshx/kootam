import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import { supabase } from './supabase'
import Flame from './Flame'

const spring = { type: 'spring', stiffness: 420, damping: 32 }

const SCRIPT = [
  { who: 'theirs', t: 'chaya at 5? ☕' },
  { who: 'mine', t: 'done. don’t break the streak 😤' },
  { who: 'theirs', t: 'day 28 let’s gooo' },
]

export default function Auth() {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function submit(e) {
    e.preventDefault()
    setError(''); setNotice('')

    if (mode === 'signup') {
      const u = username.trim().toLowerCase()
      if (!/^[a-z0-9_]{3,20}$/.test(u)) return setError('Usernames use 3–20 lowercase letters, numbers or underscores.')
      if (password.length < 6) return setError('Passwords need at least 6 characters.')
      setBusy(true)
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { username: u, display_name: displayName.trim() || u } },
      })
      setBusy(false)
      if (error) return setError(/database error/i.test(error.message) ? `The username “${u}” is taken. Pick another one.` : error.message)
      if (!data.session) {
        setNotice('Account created. Open the link in your email to confirm it, then log in here.')
        setMode('login')
      }
      return
    }

    setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) setError(/invalid/i.test(error.message) ? 'That email and password don’t match an account.' : error.message)
  }

  const signup = mode === 'signup'

  return (
    <div className="auth">
      <div className="auth-hero">
        <h1 className="wordmark hero-mark" aria-label="Kootam">
          {'Kootam'.split('').map((ch, i) => (
            <span className="letter-mask" key={i} aria-hidden="true">
              <motion.span
                className="letter"
                initial={{ y: '110%', rotate: 8 }}
                animate={{ y: 0, rotate: 0 }}
                transition={{ delay: 0.15 + i * 0.07, type: 'spring', stiffness: 260, damping: 20 }}
              >{ch}</motion.span>
            </span>
          ))}
        </h1>
        <motion.p
          className="auth-tag"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7, duration: 0.6 }}
        >
          Your gang’s chat. Talk every day and keep the fire burning.
        </motion.p>
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9, ...spring }}>
          <Preview />
        </motion.div>
      </div>

      <motion.form
        className="auth-card glass"
        onSubmit={submit}
        initial={{ opacity: 0, y: 30, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 0.35, ...spring }}
      >
        <div className="seg" role="tablist">
          {[['login', 'Log in'], ['signup', 'Create account']].map(([k, label]) => (
            <button
              key={k} type="button" role="tab" aria-selected={mode === k}
              className={mode === k ? 'on' : ''}
              onClick={() => { setMode(k); setError(''); if (k === 'signup') setNotice('') }}
            >
              {mode === k && <motion.span layoutId="authTab" className="seg-pill" transition={spring} />}
              <span className="seg-label">{label}</span>
            </button>
          ))}
        </div>

        <AnimatePresence initial={false}>
          {signup && (
            <motion.div
              key="signup-fields"
              className="field-group"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.2, 0.9, 0.3, 1] }}
            >
              <label className="field">
                <span>Your name</span>
                <input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Nihal" maxLength={40} autoComplete="name" />
              </label>
              <label className="field">
                <span>Username</span>
                <input value={username} onChange={e => setUsername(e.target.value.toLowerCase())} placeholder="nihal_s" maxLength={20} autoCapitalize="off" autoComplete="username" required={signup} />
                <small>Friends find you by this.</small>
              </label>
            </motion.div>
          )}
        </AnimatePresence>

        <label className="field">
          <span>Email</span>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required />
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete={signup ? 'new-password' : 'current-password'} required />
        </label>

        <AnimatePresence mode="wait">
          {error && <motion.p key={error} className="msg-error" role="alert" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: [0, -6, 6, -3, 0] }} exit={{ opacity: 0 }}>{error}</motion.p>}
          {notice && <motion.p key={notice} className="msg-notice" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>{notice}</motion.p>}
        </AnimatePresence>

        <motion.button className="btn-primary" disabled={busy} whileTap={{ scale: 0.97 }} whileHover={{ y: -1 }}>
          {busy ? <span className="spinner" aria-label="Loading" /> : signup ? 'Create account' : 'Log in'}
        </motion.button>
      </motion.form>
    </div>
  )
}

// A tiny live chat that tilts toward your cursor
function Preview() {
  const [step, setStep] = useState(0)
  const mx = useMotionValue(0)
  const my = useMotionValue(0)
  const rotateX = useSpring(useTransform(my, [-0.5, 0.5], [9, -9]), { stiffness: 150, damping: 16 })
  const rotateY = useSpring(useTransform(mx, [-0.5, 0.5], [-11, 11]), { stiffness: 150, damping: 16 })

  useEffect(() => {
    const done = step >= SCRIPT.length
    const t = setTimeout(() => setStep(s => (s >= SCRIPT.length ? 0 : s + 1)), done ? 3400 : step === 0 ? 900 : 1500)
    return () => clearTimeout(t)
  }, [step])

  const count = step >= SCRIPT.length ? 28 : 27
  const typing = step < SCRIPT.length && SCRIPT[step].who === 'theirs'

  return (
    <div
      className="preview-stage"
      onPointerMove={e => {
        const r = e.currentTarget.getBoundingClientRect()
        mx.set((e.clientX - r.left) / r.width - 0.5)
        my.set((e.clientY - r.top) / r.height - 0.5)
      }}
      onPointerLeave={() => { mx.set(0); my.set(0) }}
      aria-hidden="true"
    >
      <motion.div className="auth-preview glass" style={{ rotateX, rotateY, transformPerspective: 900 }}>
        <div className="ap-head">
          <span className="ap-avatar">L</span>
          <span className="ap-name">Lahin<small>online</small></span>
          <span className="streak-pill lit">
            <Flame size={17} />
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={count}
                className="num"
                initial={{ y: 14, opacity: 0, scale: 1.4 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: -14, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 22 }}
              >{count}</motion.span>
            </AnimatePresence>
          </span>
        </div>
        <div className="ap-body">
          <AnimatePresence>
            {SCRIPT.slice(0, step).map((m, i) => (
              <motion.div
                key={i}
                className={`ap-b ${m.who}`}
                initial={{ opacity: 0, y: 14, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2, delay: i * 0.05 } }}
                transition={{ type: 'spring', stiffness: 480, damping: 28 }}
              >{m.t}</motion.div>
            ))}
            {typing && (
              <motion.div key={'typing' + step} className="ap-b theirs typing-bubble"
                initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.1 } }}>
                <i /><i /><i />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  )
}
