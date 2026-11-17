import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'

function buildStats(build) {
  const data = build.build_data || {}
  return data.stats || build.stats || {}
}

export default function Gallery({ user }) {
  const [builds, setBuilds] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      setBuilds(await api('/api/builds'))
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function reactToBuild(id, action) {
    if (!user) {
      window.location.assign('/login')
      return
    }
    try {
      await api(`/api/builds/${id}/${action}`, { method: 'POST' })
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <section className="content">
      <p className="eyebrow">Community builds</p>
      <h1>Build gallery</h1>
      <p className="muted">Browse published PC builds and open any build in the simulator.</p>
      {error && <p role="alert" className="error-message">{error}</p>}
      {loading ? <p className="status">Loading builds…</p> : (
        <div className="card-grid">
          {builds.length ? builds.map((build) => {
            const stats = buildStats(build)
            const id = build.id || build.build_id
            return (
              <article className="data-card" key={id}>
                <h2>{build.name || build.build_name || 'Untitled build'}</h2>
                <p className="muted">By {build.creator_name || 'Unknown creator'} · {build.created_at ? new Date(build.created_at).toLocaleDateString() : 'Date unavailable'}</p>
                <div className="stat-row">
                  <span>Score <strong>{stats.score ?? stats.grade ?? stats.compatibility ?? '—'}</strong></span>
                  <span>Power <strong>{stats.totalPower ? `${stats.totalPower} W` : '—'}</strong></span>
                </div>
                <div className="card-actions">
                  <Link className="pill pill-green" to={`/simulator?build=${id}&readonly=1`}>View build</Link>
                  <button className="pill pill-light" onClick={() => reactToBuild(id, 'heart')}>♥ {build.heartCount || 0}</button>
                  <button className="pill pill-light" onClick={() => reactToBuild(id, 'favorite')}>☆ {build.favoriteCount || 0}</button>
                </div>
              </article>
            )
          }) : <p className="empty-state">No published builds yet.</p>}
        </div>
      )}
    </section>
  )
}
