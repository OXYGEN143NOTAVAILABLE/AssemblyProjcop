import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { sendJson } from '../api.js'

export default function Auth({ admin = false, onAuthenticated }) {
  const navigate = useNavigate()
  const [mode, setMode] = useState('login')
  const [role, setRole] = useState(admin ? 'admin' : 'student')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    setBusy(true)
    const form = new FormData(event.currentTarget)
    const payload = Object.fromEntries(form.entries())
    payload.role = role
    payload.rememberMe = true
    try {
      if (mode === 'reset') {
        const result = await sendJson('/api/auth/forgot-password', 'POST', payload)
        setNotice(result.message || 'Password updated. You can sign in now.')
        setMode('login')
        return
      }
      if (mode === 'register') {
        const result = await sendJson('/api/auth/register', 'POST', payload)
        onAuthenticated(result.user)
        navigate(result.redirectUrl || '/simulator')
        return
      }
      const result = await sendJson('/api/auth/login', 'POST', payload)
      onAuthenticated(result.user)
      navigate(result.redirectUrl || (admin ? '/admin' : '/simulator'))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="content auth-card">
      <p className="eyebrow">{admin ? 'Administrator access' : 'Assembly PC account'}</p>
      <h1>{mode === 'register' ? 'Create your account' : mode === 'reset' ? 'Reset your password' : 'Welcome back'}</h1>
      <p className="muted">{mode === 'reset' ? 'Confirm your account details and choose a new password.' : admin ? 'Sign in with your administrator account.' : 'Sign in to save builds and use the simulator.'}</p>
      {!admin && mode !== 'reset' && (
        <label className="field">
          Account type
          <select value={role} onChange={(event) => setRole(event.target.value)}>
            <option value="student">Student</option>
            <option value="instructor">Instructor</option>
          </select>
        </label>
      )}
      <form className="stack-form" onSubmit={submit}>
        {(mode === 'register' || mode === 'reset') && role === 'student' && (
          <>
            {mode === 'register' && <label className="field">First name<input name="firstName" required /></label>}
            {mode === 'register' && <label className="field">Last name<input name="lastName" required /></label>}
            {mode === 'reset' && <label className="field">Student ID<input name="studentId" required /></label>}
            {mode === 'reset' && <label className="field">Email<input name="email" type="email" required /></label>}
            {mode === 'register' && <label className="field">Student ID<input name="studentId" required /></label>}
            {mode === 'register' && <label className="field">Email<input name="email" type="email" required /></label>}
          </>
        )}
        {(mode === 'register' || mode === 'reset') && role === 'instructor' && (
          <>
            {mode === 'register' && <label className="field">Name<input name="displayName" required /></label>}
            <label className="field">Institutional email<input name="email" type="email" required /></label>
          </>
        )}
        {mode !== 'register' && (
          <label className="field">{role === 'student' ? 'Student ID' : 'Email / username'}
            <input name={role === 'student' ? 'studentId' : 'email'} required autoComplete="username" />
          </label>
        )}
        <label className="field">{mode === 'reset' ? 'New password' : 'Password'}<input name="password" type="password" required autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label>
        {error && <p role="alert" className="error-message">{error}</p>}
        {notice && <p role="status" className="success-message">{notice}</p>}
        <button className="pill pill-green" disabled={busy}>{busy ? 'Please wait…' : mode === 'register' ? 'Create account' : mode === 'reset' ? 'Update password' : 'Log in'}</button>
      </form>
      {!admin && <p className="auth-switch">
        {mode === 'reset' ? 'Remembered your password?' : mode === 'register' ? 'Already registered?' : 'New to Assembly PC?'}{' '}
        <button className="text-button" onClick={() => { setError(''); setMode(mode === 'reset' || mode === 'register' ? 'login' : 'register') }}>
          {mode === 'reset' || mode === 'register' ? 'Log in' : 'Create an account'}
        </button>
        {mode === 'login' && <><span> · </span><button className="text-button" onClick={() => { setError(''); setMode('reset') }}>Forgot password?</button></>}
      </p>}
      <Link to="/" className="back-link">Back to home</Link>
    </section>
  )
}
