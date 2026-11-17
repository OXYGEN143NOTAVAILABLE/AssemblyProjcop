import { useEffect, useState } from 'react'
import { api, sendJson } from '../api.js'

export default function Admin() {
  const [metrics, setMetrics] = useState(null)
  const [inventory, setInventory] = useState({})
  const [users, setUsers] = useState([])
  const [published, setPublished] = useState([])
  const [recentLogins, setRecentLogins] = useState([])
  const [tab, setTab] = useState('components')
  const [category, setCategory] = useState('')
  const [record, setRecord] = useState(null)
  const [accountType, setAccountType] = useState('student')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    try {
      const [summary, components] = await Promise.all([
        api('/api/admin/metrics'),
        api('/api/admin/components'),
      ])
      setMetrics(summary)
      setInventory(components || {})
      setCategory((current) => current || Object.keys(components || {})[0] || '')
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    const requests = {
      users: ['/api/admin/users/overview', setUsers],
      published: ['/api/admin/published', setPublished],
      activity: ['/api/admin/activity/recent-logins', setRecentLogins],
    }
    const request = requests[tab]
    if (!request) return
    api(request[0]).then(request[1]).catch((err) => setError(err.message))
  }, [tab])

  async function save(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const payload = JSON.parse(record.json)
      const path = `/api/admin/components/${encodeURIComponent(category)}`
      if (record.id) await sendJson(`${path}/${encodeURIComponent(record.id)}`, 'PUT', payload)
      else await sendJson(path, 'POST', payload)
      setRecord(null)
      setNotice('Component saved.')
      await load()
    } catch (err) {
      setError(err instanceof SyntaxError ? 'Component data must be valid JSON.' : err.message)
    } finally {
      setBusy(false)
    }
  }

  async function remove(item) {
    const id = item.id ?? item.component_id
    if (!window.confirm(`Delete ${item.name || item.model || `component ${id}`}?`)) return
    try {
      await api(`/api/admin/components/${encodeURIComponent(category)}/${encodeURIComponent(id)}`, { method: 'DELETE' })
      setNotice('Component deleted.')
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function removeUser(account) {
    const type = account.type === 'student' ? 'students' : 'instructors'
    if (account.type === 'admin') {
      setError('Administrator accounts cannot be removed here.')
      return
    }
    if (!window.confirm(`Delete ${account.name || account.identifier} and their account data?`)) return
    try {
      await api(`/api/admin/users/${type}/${account.id}`, { method: 'DELETE' })
      setUsers((current) => current.filter((user) => !(user.type === account.type && user.id === account.id)))
      setNotice('Account deleted.')
    } catch (err) {
      setError(err.message)
    }
  }

  async function createAccount(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const form = event.currentTarget
    const payload = Object.fromEntries(new FormData(form).entries())
    const path = accountType === 'admin'
      ? '/api/admin/users'
      : `/api/admin/users/${accountType === 'student' ? 'students' : 'instructors'}`
    try {
      await sendJson(path, 'POST', payload)
      form.reset()
      setNotice(`${accountType} account created.`)
      if (tab === 'users') {
        setUsers(await api('/api/admin/users/overview'))
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const items = inventory[category] || []
  return (
    <section className="content admin-content">
      <p className="eyebrow">Administration</p>
      <h1>Admin dashboard</h1>
      {error && <p role="alert" className="error-message">{error}</p>}
      {notice && <p role="status" className="success-message">{notice}</p>}
      {metrics && <div className="stats-grid">
        {Object.entries(metrics).map(([key, value]) => <article className="data-card" key={key}>
          <span className="muted">{key.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`)}</span>
          <strong className="metric-value">{value}</strong>
        </article>)}
      </div>}
      <nav className="admin-tabs" aria-label="Admin sections">
        {['components', 'users', 'published', 'activity'].map((name) => (
          <button key={name} className={`pill ${tab === name ? 'pill-green' : 'pill-light'}`} onClick={() => { setTab(name); setError(''); setNotice('') }}>
            {name[0].toUpperCase() + name.slice(1)}
          </button>
        ))}
      </nav>
      {tab === 'users' && <>
        <h2 className="subheading">User accounts</h2>
        <div className="admin-toolbar">
          <label className="field">New account type
            <select value={accountType} onChange={(event) => setAccountType(event.target.value)}>
              <option value="student">Student</option><option value="instructor">Instructor</option><option value="admin">Admin</option>
            </select>
          </label>
        </div>
        <form className="data-card admin-account-form" onSubmit={createAccount}>
          {accountType === 'student' ? <>
            <label className="field">First name<input name="firstName" required /></label>
            <label className="field">Last name<input name="lastName" required /></label>
            <label className="field">Student ID<input name="studentId" required /></label>
            <label className="field">Email<input name="email" type="email" required /></label>
          </> : accountType === 'instructor' ? <>
            <label className="field">Display name<input name="displayName" required /></label>
            <label className="field">Institutional email<input name="email" type="email" required /></label>
          </> : <>
            <label className="field">Username<input name="username" required /></label>
            <label className="field">Display name<input name="displayName" /></label>
          </>}
          <label className="field">Temporary password<input name="password" type="password" minLength="8" required /></label>
          <button className="pill pill-green" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
        </form>
        <div className="table-wrap"><table>
          <thead><tr><th>Type</th><th>Name</th><th>Identifier</th><th>Email</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>{users.map((account) => <tr key={`${account.type}-${account.id}`}>
            <td>{account.type}</td><td>{account.name || '—'}</td><td>{account.identifier}</td><td>{account.email || '—'}</td><td>{account.is_active ? 'Active' : 'Inactive'}</td>
            <td>{account.type !== 'admin' && <button className="text-button danger-text" onClick={() => removeUser(account)}>Delete</button>}</td>
          </tr>)}</tbody>
        </table></div>
      </>}
      {tab === 'published' && <>
        <h2 className="subheading">Published content</h2>
        <div className="table-wrap"><table>
          <thead><tr><th>Type</th><th>Title</th><th>Owner</th><th>Published</th></tr></thead>
          <tbody>{published.map((item) => <tr key={`${item.type}-${item.id}`}><td>{item.type}</td><td>{item.title}</td><td>{item.owner}</td><td>{item.created_at ? new Date(item.created_at).toLocaleDateString() : '—'}</td></tr>)}</tbody>
        </table></div>
      </>}
      {tab === 'activity' && <>
        <h2 className="subheading">Recent logins (7 days)</h2>
        <div className="table-wrap"><table>
          <thead><tr><th>Type</th><th>Name</th><th>Identifier</th><th>Last login</th></tr></thead>
          <tbody>{recentLogins.map((item) => <tr key={`${item.type}-${item.id}`}><td>{item.type}</td><td>{item.name || '—'}</td><td>{item.identifier}</td><td>{item.last_login_at ? new Date(item.last_login_at).toLocaleString() : '—'}</td></tr>)}</tbody>
        </table></div>
      </>}
      {tab === 'components' && <div className="admin-toolbar">
        <label className="field">Component category
          <select value={category} onChange={(event) => { setCategory(event.target.value); setRecord(null) }}>
            {Object.keys(inventory).map((key) => <option key={key} value={key}>{key}</option>)}
          </select>
        </label>
        <button className="pill pill-green" onClick={() => setRecord({ json: '{\n  \n}' })}>Add component</button>
      </div>}
      {tab === 'components' && record && <form className="data-card stack-form" onSubmit={save}>
        <h2>{record.id ? 'Edit component' : 'New component'}</h2>
        <label className="field">Component data (JSON)
          <textarea rows="9" value={record.json} onChange={(event) => setRecord({ ...record, json: event.target.value })} required />
        </label>
        <div className="card-actions">
          <button className="pill pill-green" disabled={busy}>{busy ? 'Saving…' : 'Save component'}</button>
          <button type="button" className="pill pill-light" onClick={() => setRecord(null)}>Cancel</button>
        </div>
      </form>}
      {tab === 'components' && <div className="table-wrap">
        <table>
          <thead><tr><th>ID</th><th>Name</th><th>Details</th><th>Actions</th></tr></thead>
          <tbody>
            {items.map((item, index) => <tr key={item.id ?? index}>
              <td>{item.id ?? item.component_id ?? '—'}</td>
              <td>{item.name || item.model || item.component_name || 'Unnamed component'}</td>
              <td>{Object.entries(item).filter(([key]) => !['id', 'component_id', 'name', 'model', 'component_name'].includes(key)).slice(0, 4).map(([key, value]) => `${key}: ${String(value)}`).join(' · ')}</td>
              <td><div className="card-actions">
                <button className="text-button" onClick={() => setRecord({ id: item.id ?? item.component_id, json: JSON.stringify(item, null, 2) })}>Edit</button>
                <button className="text-button danger-text" onClick={() => remove(item)}>Delete</button>
              </div></td>
            </tr>)}
          </tbody>
        </table>
        {!items.length && <p className="empty-state">No components in this category.</p>}
      </div>}
    </section>
  )
}
