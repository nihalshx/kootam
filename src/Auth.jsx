import { useState } from 'react'
import { supabase } from './supabase'

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
      if (!/^[a-z0-9_]{3,20}$/.test(u)) {
        setError('Usernames use 3–20 lowercase letters, numbers or underscores.')
        return
      }
      if (password.length < 6) {
        setError('Passwords need at least 6 characters.')
        return
      }
      setBusy(true)
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { username: u, display_name: displayName.trim() || u } },
      })
      setBusy(false)
      if (error) {
        setError(/database error/i.test(error.message)
          ? `The username “${u}” is taken. Pick another one.`
          : error.message)
        return
      }
      if (!data.session) {
        setNotice('Account created. Open the link in your email to confirm it, then log in here.')
        setMode('login')
      }
      return
    }

    setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) setError(/invalid/i.test(error.message)
      ? 'That email and password don’t match an account.'
      : error.message)
  }

  const signup = mode === 'signup'

  return (
    <div className="auth">
      <div className="auth-brand">
        <div className="wordmark">Kootam</div>
        <p className="auth-tag">Chat with your people. Talk every day and the 🔥 keeps growing.</p>
        <div className="auth-preview" aria-hidden="true">
          <div className="ap-head">
            <span className="ap-avatar">L</span>
            <span className="ap-name">Lahin<small>online</small></span>
            <span className="streak-pill lit"><span className="flame">🔥</span><span className="num">27</span></span>
          </div>
          <div className="ap-body">
            <div className="ap-b theirs">chaya at 5? ☕</div>
            <div className="ap-b mine">done. don't break the streak 😤</div>
            <div className="ap-b theirs">day 27 let's gooo</div>
          </div>
        </div>
      </div>

      <form className="auth-card" onSubmit={submit}>
        <div className="seg" role="tablist">
          <button type="button" role="tab" aria-selected={!signup} className={!signup ? 'on' : ''} onClick={() => { setMode('login'); setError('') }}>Log in</button>
          <button type="button" role="tab" aria-selected={signup} className={signup ? 'on' : ''} onClick={() => { setMode('signup'); setError(''); setNotice('') }}>Create account</button>
        </div>

        {signup && (
          <>
            <label className="field">
              <span>Your name</span>
              <input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Nihal" maxLength={40} autoComplete="name" />
            </label>
            <label className="field">
              <span>Username</span>
              <input value={username} onChange={e => setUsername(e.target.value.toLowerCase())} placeholder="nihal_s" maxLength={20} autoCapitalize="off" autoComplete="username" required />
              <small>Friends find you by this.</small>
            </label>
          </>
        )}

        <label className="field">
          <span>Email</span>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required />
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete={signup ? 'new-password' : 'current-password'} required />
        </label>

        {error && <p className="msg-error" role="alert">{error}</p>}
        {notice && <p className="msg-notice">{notice}</p>}

        <button className="btn-primary" disabled={busy}>
          {busy ? 'One moment…' : signup ? 'Create account' : 'Log in'}
        </button>
      </form>
    </div>
  )
}
